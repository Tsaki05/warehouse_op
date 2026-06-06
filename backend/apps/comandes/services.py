import random
import string
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import (
    Count, Sum, Exists, OuterRef, F,
    ExpressionWrapper, DecimalField,
)
from django.db.models.functions import TruncDate

from .models import Comanda, Factura, Paquet
from apps.inventari.models import Lot


# ── ID generators ─────────────────────────────────────────────────────────────

def generar_id_comanda():
    chars = string.ascii_uppercase + string.digits
    while True:
        codi = ''.join(random.choices(chars, k=5))
        if not Comanda.objects.filter(pk=codi).exists():
            return codi


def generar_id_factura():
    chars = string.ascii_uppercase + string.digits
    while True:
        codi = ''.join(random.choices(chars, k=5))
        if not Factura.objects.filter(pk=codi).exists():
            return codi


# ── Comanda ───────────────────────────────────────────────────────────────────

def crear_comanda(validated_data):
    """
    Crea una Comanda i els seus Paquets a partir de validated_data del serialitzador.
    Retorna la instància Comanda creada.
    """
    paquets_data = validated_data.pop('paquets')
    import_total = sum(p['quantitat'] * p['preu'] for p in paquets_data)
    comanda = Comanda.objects.create(
        **validated_data,
        id_comanda=generar_id_comanda(),
        import_total=import_total,
    )
    Paquet.objects.bulk_create([Paquet(comanda=comanda, **p) for p in paquets_data])
    return comanda


@transaction.atomic
def marcar_comanda_preparada(comanda, lots_data, user):
    """
    Decrementa l'estoc dels lots indicats i marca la comanda com a preparada.
    Usa SELECT FOR UPDATE per evitar race conditions.
    Aixeca ValueError amb el missatge d'error si alguna validació falla (rollback automàtic).
    """
    for ld in lots_data:
        try:
            lot = Lot.objects.select_for_update().get(pk=ld['lot'])
        except (Lot.DoesNotExist, KeyError, ValueError, TypeError):
            raise ValueError(f"Lot invàlid: {ld.get('lot')}.")

        q = int(ld.get('quantitat', 0))
        if q <= 0:
            raise ValueError('La quantitat ha de ser positiva.')
        if lot.quantitat < q:
            raise ValueError(
                f"Lot {lot.id}: estoc insuficient ({lot.quantitat} disponibles, {q} necessaris)."
            )
        lot.quantitat -= q
        lot.save(update_fields=['quantitat'])

    comanda.preparat     = True
    comanda.preparat_per = user
    comanda.save(update_fields=['preparat', 'preparat_per'])
    return comanda


# ── Factura ───────────────────────────────────────────────────────────────────

def crear_factura(comandes, metode_pagament=None):
    """
    Crea una Factura agrupant les comandes indicades.
    Assigna el metode_pagament a les comandes que no en tinguin.
    Retorna la instància Factura creada.
    """
    if metode_pagament:
        for c in comandes:
            if not c.metode_pagament:
                c.metode_pagament = metode_pagament
                c.save(update_fields=['metode_pagament'])
    factura = Factura.objects.create(
        id_factura=generar_id_factura(),
        client_id=comandes[0].client_id,
        import_total=sum(c.import_total for c in comandes),
        data=date.today(),
    )
    for c in comandes:
        c.factura = factura
        c.save(update_fields=['factura'])
    return factura


# ── Dashboard ─────────────────────────────────────────────────────────────────

def get_dashboard_data(mag_id):
    """
    Calcula totes les estadístiques del dashboard:
    facturació per dia (30 dies), top 5 clients, ranking treballadors i resum anual.
    Retorna un dict llest per serialitzar com a resposta JSON.
    """
    avui      = date.today()
    inici     = avui - timedelta(days=29)
    inici_any = avui - timedelta(days=364)

    qs_comandes     = Comanda.objects.filter(data__gte=inici, factura__isnull=False)
    qs_factures     = Factura.objects.filter(data__gte=inici)
    qs_factures_any = Factura.objects.filter(data__gte=inici_any)

    if mag_id:
        qs_comandes = qs_comandes.filter(
            paquets__producte__lots__ubicacio__magatzem_id__in=mag_id
        ).distinct()

    dies = [inici + timedelta(days=i) for i in range(30)]

    linia_total = ExpressionWrapper(
        F('preu') * F('quantitat'),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )

    lot_en_mag = None
    if mag_id:
        lot_en_mag = Lot.objects.filter(
            producte_id=OuterRef('producte_id'),
            ubicacio__magatzem_id__in=mag_id,
        )

    # ── Facturació per dia ──
    if mag_id:
        fac_qs = (
            Paquet.objects
            .filter(comanda__factura__data__gte=inici, comanda__factura__isnull=False)
            .filter(Exists(lot_en_mag))
            .annotate(dia=TruncDate('comanda__factura__data'))
            .values('dia')
            .annotate(
                import_dia=Sum(linia_total),
                n=Count('comanda__factura_id', distinct=True),
            )
        )
        facturacio_raw = {
            row['dia']: {'import': row['import_dia'] or Decimal('0'), 'n': row['n']}
            for row in fac_qs
        }
    else:
        facturacio_raw = {
            row['dia']: {'import': row['import_dia'] or Decimal('0'), 'n': row['n']}
            for row in qs_factures
                .annotate(dia=TruncDate('data'))
                .values('dia')
                .annotate(import_dia=Sum('import_total'), n=Count('id_factura', distinct=True))
        }

    facturacio_mes = [
        {
            'dia':    str(d),
            'import': float(facturacio_raw.get(d, {}).get('import', 0)),
            'n':      facturacio_raw.get(d, {}).get('n', 0),
        }
        for d in dies
    ]

    # ── Top 5 clients ──
    if mag_id:
        top_qs = (
            Paquet.objects
            .filter(comanda__data__gte=inici, comanda__factura__isnull=False)
            .filter(Exists(lot_en_mag))
            .values('comanda__client_id', 'comanda__client__nom')
            .annotate(
                import_total=Sum(linia_total),
                n_comandes=Count('comanda_id', distinct=True),
            )
            .order_by('-import_total')[:5]
        )
        top_clients = [
            {
                'nif':          r['comanda__client_id'],
                'nom':          r['comanda__client__nom'],
                'n_comandes':   r['n_comandes'],
                'import_total': float(r['import_total'] or 0),
            }
            for r in top_qs
        ]
    else:
        top_qs = qs_comandes.values('client_id', 'client__nom').annotate(
            n_comandes=Count('id_comanda', distinct=True),
            import_total=Sum('import_total'),
        ).order_by('-import_total')[:5]
        top_clients = [
            {
                'nif':          r['client_id'],
                'nom':          r['client__nom'],
                'n_comandes':   r['n_comandes'],
                'import_total': float(r['import_total'] or 0),
            }
            for r in top_qs
        ]

    # ── Ranking treballadors ──
    if mag_id:
        ranking_qs = (
            Paquet.objects
            .filter(comanda__preparat=True, comanda__preparat_per__isnull=False,
                    comanda__factura__isnull=False)
            .filter(Exists(lot_en_mag))
            .values('comanda__preparat_per_id', 'comanda__preparat_per__first_name',
                    'comanda__preparat_per__last_name', 'comanda__preparat_per__username')
            .annotate(
                n_comandes=Count('comanda_id', distinct=True),
                import_total=Sum(linia_total),
            )
            .order_by('-import_total')[:10]
        )
        ranking_treballadors = [
            {
                'id': r['comanda__preparat_per_id'],
                'nom': (
                    f"{r['comanda__preparat_per__first_name']} {r['comanda__preparat_per__last_name']}".strip()
                    or r['comanda__preparat_per__username']
                ),
                'n_comandes':   r['n_comandes'],
                'import_total': float(r['import_total'] or 0),
            }
            for r in ranking_qs
        ]
    else:
        ranking_base = Comanda.objects.filter(
            preparat=True, preparat_per__isnull=False, factura__isnull=False
        )
        ranking_qs = (
            ranking_base
            .values('preparat_per_id', 'preparat_per__first_name',
                    'preparat_per__last_name', 'preparat_per__username')
            .annotate(
                n_comandes=Count('id_comanda', distinct=True),
                import_total=Sum('import_total'),
            )
            .order_by('-import_total')[:10]
        )
        ranking_treballadors = [
            {
                'id': r['preparat_per_id'],
                'nom': (
                    f"{r['preparat_per__first_name']} {r['preparat_per__last_name']}".strip()
                    or r['preparat_per__username']
                ),
                'n_comandes':   r['n_comandes'],
                'import_total': float(r['import_total'] or 0),
            }
            for r in ranking_qs
        ]

    # ── Resum anual ──
    n_comandes_mes = qs_comandes.aggregate(n=Count('id_comanda', distinct=True))['n'] or 0

    if mag_id:
        any_agg = (
            Paquet.objects
            .filter(comanda__factura__data__gte=inici_any, comanda__factura__isnull=False)
            .filter(Exists(lot_en_mag))
            .aggregate(
                import_total=Sum(linia_total),
                n=Count('comanda__factura_id', distinct=True),
            )
        )
    else:
        any_agg = qs_factures_any.aggregate(
            import_total=Sum('import_total'), n=Count('id_factura', distinct=True)
        )

    resum = {
        'facturacio_total_mes': float(sum(d['import'] for d in facturacio_mes)),
        'n_comandes_mes':       n_comandes_mes,
        'n_factures_mes':       sum(d['n'] for d in facturacio_mes),
        'facturacio_total_any': float(any_agg['import_total'] or 0),
        'n_factures_any':       any_agg['n'] or 0,
    }

    return {
        'facturacio_mes':       facturacio_mes,
        'top_clients':          top_clients,
        'ranking_treballadors': ranking_treballadors,
        'resum':                resum,
    }

