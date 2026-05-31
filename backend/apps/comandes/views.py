from decimal import Decimal
from datetime import date, timedelta

from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Q, Count, Sum, Prefetch, Exists, OuterRef, F, ExpressionWrapper, DecimalField
from django.db.models.functions import TruncDate

from apps.accounts.permissions import IsAdminOrSuperior
from apps.clients.models import ClientMagatzem
from apps.inventari.models import Lot
from apps.inventari.views import _mag_id
from .models import Factura, Comanda, Paquet
from .serializers import FacturaSerializer, FacturaCreateSerializer, ComandaSerializer, ComandaCreateSerializer, PaquetSerializer

ORDRES_COMANDA  = {
    'data_asc':   'data',
    'data_desc':  '-data',
    'preu_asc':   'import_total',
    'preu_desc':  '-import_total',
}

ORDRES_FACTURA  = {
    'data_asc':   'data',
    'data_desc':  '-data',
    'import_asc': 'import_total',
    'import_desc':'-import_total',
    'comandes_asc':  'n_comandes',
    'comandes_desc': '-n_comandes',
}


class ComandaViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    def get_permissions(self):
        if self.action in ('create', 'dashboard'):
            return [IsAuthenticated(), IsAdminOrSuperior()]
        return [IsAuthenticated()]

    @action(detail=True, methods=['patch'], url_path='preparar')
    def marcar_preparat(self, request, pk=None):
        comanda   = self.get_object()
        lots_data = request.data.get('lots', [])

        with transaction.atomic():
            for ld in lots_data:
                try:
                    lot = Lot.objects.select_for_update().get(pk=ld['lot'])
                except (Lot.DoesNotExist, KeyError, ValueError, TypeError):
                    return Response(
                        {'detail': f"Lot invàlid: {ld.get('lot')}."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                q = int(ld.get('quantitat', 0))
                if q <= 0:
                    return Response(
                        {'detail': 'La quantitat ha de ser positiva.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if lot.quantitat < q:
                    return Response(
                        {'detail': f"Lot {lot.id}: estoc insuficient ({lot.quantitat} disponibles, {q} necessaris)."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                lot.quantitat -= q
                lot.save(update_fields=['quantitat'])

            comanda.preparat     = True
            comanda.preparat_per = request.user
            comanda.save(update_fields=['preparat', 'preparat_per'])

        return Response(ComandaSerializer(
            Comanda.objects
            .select_related('client', 'factura', 'preparat_per')
            .prefetch_related(Prefetch('paquets', queryset=Paquet.objects.select_related('producte')))
            .get(pk=comanda.pk)
        ).data)

    def get_serializer_class(self):
        if self.action == 'create':
            return ComandaCreateSerializer
        return ComandaSerializer

    def create(self, request, *args, **kwargs):
        serializer = ComandaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comanda = serializer.save()

        # Auto-associa el client al magatzem de l'usuari (o el que envia el frontend)
        mag_id = request.data.get('magatzem')
        if not mag_id:
            perfil = getattr(request.user, 'perfil', None)
            if perfil and perfil.magatzem_id:
                mag_id = perfil.magatzem_id
        if mag_id:
            ClientMagatzem.objects.get_or_create(
                client_id=comanda.client_id,
                magatzem_id=mag_id,
            )

        comanda = (
            Comanda.objects
            .select_related('client')
            .prefetch_related(Prefetch('paquets', queryset=Paquet.objects.select_related('producte')))
            .get(pk=comanda.pk)
        )
        return Response(ComandaSerializer(comanda).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Estadístiques per al dashboard (admin/superior)."""
        mag_id    = _mag_id(request)
        avui      = date.today()
        inici     = avui - timedelta(days=29)
        inici_any = avui - timedelta(days=364)

        # Base querysets — tots els valors del dashboard es basen en comandes facturades
        qs_comandes     = Comanda.objects.filter(data__gte=inici, factura__isnull=False)
        qs_factures     = Factura.objects.filter(data__gte=inici)
        qs_factures_any = Factura.objects.filter(data__gte=inici_any)
        if mag_id:
            qs_comandes = qs_comandes.filter(
                paquets__producte__lots__ubicacio__magatzem_id__in=mag_id
            ).distinct()

        dies = [inici + timedelta(days=i) for i in range(30)]

        # Expressió reutilitzable: preu × quantitat per línia de paquet
        linia_total = ExpressionWrapper(
            F('preu') * F('quantitat'),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        )

        # Quan hi ha filtre de magatzem, tots els agregats de paquets usen Exists
        # per evitar duplicats causats per múltiples lots del mateix producte.
        if mag_id:
            lot_en_mag = Lot.objects.filter(
                producte_id=OuterRef('producte_id'),
                ubicacio__magatzem_id__in=mag_id,
            )

        # Facturació per dia (últims 30 dies)
        if mag_id:
            # Suma preu×quantitat dels paquets del magatzem seleccionat,
            # agrupat per data de la factura associada a la comanda.
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
            {'dia': str(d), 'import': float(facturacio_raw.get(d, {}).get('import', 0)), 'n': facturacio_raw.get(d, {}).get('n', 0)}
            for d in dies
        ]

        # Top 5 clients del mes per import total (només comandes facturades)
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
                {'nif': r['comanda__client_id'], 'nom': r['comanda__client__nom'],
                 'n_comandes': r['n_comandes'], 'import_total': float(r['import_total'] or 0)}
                for r in top_qs
            ]
        else:
            top_qs = qs_comandes.values('client_id', 'client__nom').annotate(
                n_comandes=Count('id_comanda', distinct=True),
                import_total=Sum('import_total'),
            ).order_by('-import_total')[:5]
            top_clients = [
                {'nif': r['client_id'], 'nom': r['client__nom'],
                 'n_comandes': r['n_comandes'], 'import_total': float(r['import_total'] or 0)}
                for r in top_qs
            ]

        # Ranking treballadors (per import de comandes preparades i facturades)
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
                    'n_comandes':  r['n_comandes'],
                    'import_total': float(r['import_total'] or 0),
                }
                for r in ranking_qs
            ]
        else:
            ranking_base = Comanda.objects.filter(preparat=True, preparat_per__isnull=False, factura__isnull=False)
            ranking_qs = (
                ranking_base
                .values('preparat_per_id', 'preparat_per__first_name',
                        'preparat_per__last_name', 'preparat_per__username')
                .annotate(n_comandes=Count('id_comanda', distinct=True), import_total=Sum('import_total'))
                .order_by('-import_total')[:10]
            )
            ranking_treballadors = [
                {
                    'id': r['preparat_per_id'],
                    'nom': (
                        f"{r['preparat_per__first_name']} {r['preparat_per__last_name']}".strip()
                        or r['preparat_per__username']
                    ),
                    'n_comandes':  r['n_comandes'],
                    'import_total': float(r['import_total'] or 0),
                }
                for r in ranking_qs
            ]

        # Resum
        n_comandes_mes  = qs_comandes.aggregate(n=Count('id_comanda', distinct=True))['n'] or 0
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

        return Response({
            'facturacio_mes':       facturacio_mes,
            'top_clients':          top_clients,
            'ranking_treballadors': ranking_treballadors,
            'resum':                resum,
        })

    def get_queryset(self):
        p = self.request.query_params

        qs = (
            Comanda.objects
            .select_related('client', 'factura', 'preparat_per')
            .prefetch_related(
                Prefetch('paquets', queryset=Paquet.objects.select_related('producte'))
            )
        )

        mag_id = _mag_id(self.request)
        if mag_id:
            qs = qs.filter(
                paquets__producte__lots__ubicacio__magatzem_id__in=mag_id
            ).distinct()

        if p.get('sense_factura') == 'true':
            qs = qs.filter(factura__isnull=True)

        preparat = p.get('preparat')
        if preparat == 'true':
            qs = qs.filter(preparat=True)
        elif preparat == 'false':
            qs = qs.filter(preparat=False)

        fases = p.getlist('fase')
        if fases:
            q = Q()
            if 'per_preparar' in fases:
                q |= Q(preparat=False, factura__isnull=True)
            if 'preparada' in fases:
                q |= Q(preparat=True, factura__isnull=True)
            if 'facturada' in fases:
                q |= Q(factura__isnull=False)
            qs = qs.filter(q)

        enviament = p.get('enviament')
        if enviament == 'true':
            qs = qs.filter(enviament=True)
        elif enviament == 'false':
            qs = qs.filter(enviament=False)

        client = p.get('client')
        if client:
            qs = qs.filter(client_id=client)

        factura = p.get('factura')
        if factura:
            qs = qs.filter(factura_id=factura)

        cerca = p.get('cerca', '').strip()
        if cerca:
            qs = qs.filter(
                Q(id_comanda__icontains=cerca)
                | Q(client__nif__icontains=cerca)
                | Q(client__nom__icontains=cerca)
            )

        ordre = ORDRES_COMANDA.get(p.get('ordre'), '-data')
        qs = qs.order_by(ordre)

        return qs


class FacturaViewSet(viewsets.ModelViewSet):

    def get_permissions(self):
        if self.action == 'create':
            return [IsAdminOrSuperior()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'create':
            return FacturaCreateSerializer
        return FacturaSerializer

    def create(self, request, *args, **kwargs):
        serializer = FacturaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        factura = serializer.save()
        return Response(FacturaSerializer(factura).data, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        p = self.request.query_params

        qs = (
            Factura.objects
            .select_related('client')
            .annotate(n_comandes=Count('comandes', distinct=True))
        )

        mag_id = _mag_id(self.request)
        if mag_id:
            qs = qs.filter(
                comandes__paquets__producte__lots__ubicacio__magatzem_id__in=mag_id
            ).distinct()

        cerca = p.get('cerca', '').strip()
        if cerca:
            qs = qs.filter(
                Q(id_factura__icontains=cerca)
                | Q(client__nif__icontains=cerca)
                | Q(client__nom__icontains=cerca)
            )

        data_des = p.get('data_des')
        data_fins = p.get('data_fins')
        if data_des:
            qs = qs.filter(data__gte=data_des)
        if data_fins:
            qs = qs.filter(data__lte=data_fins)

        tipus = p.get('tipus')
        if tipus == 'empresa':
            qs = qs.filter(n_comandes__gte=2)
        elif tipus == 'individual':
            qs = qs.filter(n_comandes=1)

        ordre = ORDRES_FACTURA.get(p.get('ordre'), '-data')
        qs = qs.order_by(ordre)

        return qs


class PaquetViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Paquet.objects.select_related('comanda', 'producte').all()
    serializer_class = PaquetSerializer
