import random
import string
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import (
    Count, Sum, F,
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
    # Nota: `validated_data` ja porta `magatzem` com a instància FK gràcies a PrimaryKeyRelatedField


@transaction.atomic
def marcar_comanda_preparada(comanda, lots_data, user):
    """
    Ajusta l'estoc dels lots indicats i marca la comanda com a preparada.
    - Compres (paquets positius): decrementa l'estoc.
    - Retorns (paquets negatius): incrementa l'estoc; valida que el lot
      pertanyi al magatzem de la comanda.
    Usa SELECT FOR UPDATE per evitar race conditions.
    Aixeca ValueError si alguna validació falla (rollback automàtic).
    """
    es_retorn = comanda.paquets.filter(quantitat__lt=0).exists()

    for ld in lots_data:
        try:
            lot = Lot.objects.select_related('ubicacio').select_for_update().get(pk=ld['lot'])
        except (Lot.DoesNotExist, KeyError, ValueError, TypeError):
            raise ValueError(f"Lot invàlid: {ld.get('lot')}.")

        q = int(ld.get('quantitat', 0))
        if q <= 0:
            raise ValueError('La quantitat ha de ser positiva.')

        if es_retorn:
            if comanda.magatzem_id and lot.ubicacio.magatzem_id != comanda.magatzem_id:
                raise ValueError(
                    f"El lot {lot.id} no pertany al magatzem de la comanda."
                )
            lot.quantitat += q
        else:
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

_DASHBOARD_TTL = 5 * 60  # 5 minuts


def get_dashboard_data(mag_id):
    """
    Calcula totes les estadístiques del dashboard:
    facturació per dia (30 dies), top 5 clients, ranking treballadors i resum anual.
    Retorna un dict llest per serialitzar com a resposta JSON.
    Resultat cached 5 minuts per clau de magatzems.
    """
    from django.core.cache import cache
    cache_key = 'dashboard:' + (','.join(sorted(mag_id)) if mag_id else 'all')
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    avui      = date.today()
    inici     = avui - timedelta(days=29)
    inici_any = avui - timedelta(days=364)

    # Quan hi ha filtre de magatzem, usem comanda.magatzem_id (FK directe)
    # per evitar duplicats causats pel join lots→ubicació→magatzem.
    qs_comandes     = Comanda.objects.filter(data__gte=inici, factura__isnull=False)
    qs_factures     = Factura.objects.filter(data__gte=inici)
    qs_factures_any = Factura.objects.filter(data__gte=inici_any)

    if mag_id:
        qs_comandes = qs_comandes.filter(magatzem_id__in=mag_id)

    dies = [inici + timedelta(days=i) for i in range(30)]

    linia_total = ExpressionWrapper(
        F('preu') * F('quantitat'),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )

    # ── Facturació per dia ──
    if mag_id:
        fac_qs = (
            Paquet.objects
            .filter(
                comanda__factura__data__gte=inici,
                comanda__factura__isnull=False,
                comanda__magatzem_id__in=mag_id,
            )
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
            qs_comandes
            .values('client_id', 'client__nom')
            .annotate(
                import_total=Sum('import_total'),
                n_comandes=Count('id_comanda', distinct=True),
            )
            .order_by('-import_total')[:5]
        )
        top_clients = [
            {
                'nif':          r['client_id'],
                'nom':          r['client__nom'],
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
            Comanda.objects
            .filter(
                preparat=True, preparat_per__isnull=False,
                factura__isnull=False, magatzem_id__in=mag_id,
            )
            .values('preparat_per_id', 'preparat_per__first_name',
                    'preparat_per__last_name', 'preparat_per__username')
            .annotate(
                n_comandes=Count('id_comanda', distinct=True),
                import_total=Sum('import_total'),
            )
            .order_by('-import_total')[:5]
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
            .order_by('-import_total')[:5]
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
            Comanda.objects
            .filter(
                factura__data__gte=inici_any,
                factura__isnull=False,
                magatzem_id__in=mag_id,
            )
            .aggregate(
                import_total=Sum('import_total'),
                n=Count('factura_id', distinct=True),
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

    result = {
        'facturacio_mes':       facturacio_mes,
        'top_clients':          top_clients,
        'ranking_treballadors': ranking_treballadors,
        'resum':                resum,
    }
    cache.set(cache_key, result, _DASHBOARD_TTL)
    return result

