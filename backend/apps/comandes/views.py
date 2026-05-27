from decimal import Decimal
from datetime import date, timedelta

from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, Count, Sum, Prefetch
from django.db.models.functions import TruncDate

from apps.accounts.permissions import IsAdminOrSuperior
from apps.clients.models import ClientMagatzem
from apps.inventari.views import _mag_id
from .models import Factura, Comanda, Paquet
from .serializers import FacturaSerializer, ComandaSerializer, ComandaCreateSerializer, PaquetSerializer

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
        comanda = self.get_object()
        comanda.preparat     = True
        comanda.preparat_per = request.user
        comanda.save(update_fields=['preparat', 'preparat_per'])
        comanda.refresh_from_db()
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
        """Estadístiques dels últims 30 dies per al dashboard (admin/superior)."""
        mag_id  = _mag_id(request)
        avui    = date.today()
        inici   = avui - timedelta(days=29)

        # Base querysets filtrades per magatzem si cal
        qs_comandes = Comanda.objects.filter(data__gte=inici)
        qs_factures = Factura.objects.filter(data__gte=inici)
        if mag_id:
            qs_comandes = qs_comandes.filter(
                paquets__producte__lots__ubicacio__magatzem_id__in=mag_id
            ).distinct()
            qs_factures = qs_factures.filter(
                comandes__paquets__producte__lots__ubicacio__magatzem_id__in=mag_id
            ).distinct()

        dies = [inici + timedelta(days=i) for i in range(30)]

        # Facturació per dia (últims 30 dies)
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

        # Top 5 clients del mes per import total
        top_qs = qs_comandes.values('client_id', 'client__nom').annotate(
            n_comandes=Count('id_comanda', distinct=True),
            import_total=Sum('import_total'),
        ).order_by('-import_total')[:5]
        top_clients = [
            {'nif': r['client_id'], 'nom': r['client__nom'],
             'n_comandes': r['n_comandes'], 'import_total': float(r['import_total'] or 0)}
            for r in top_qs
        ]

        # Ranking treballadors (per import de comandes preparades)
        ranking_base = Comanda.objects.filter(preparat=True, preparat_per__isnull=False)
        if mag_id:
            ranking_base = ranking_base.filter(
                paquets__producte__lots__ubicacio__magatzem_id__in=mag_id
            ).distinct()
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
        n_comandes_mes = qs_comandes.aggregate(n=Count('id_comanda', distinct=True))['n'] or 0
        resum = {
            'facturacio_total_mes': float(sum(d['import'] for d in facturacio_mes)),
            'n_comandes_mes':       n_comandes_mes,
            'n_factures_mes':       sum(d['n'] for d in facturacio_mes),
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


class FacturaViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = FacturaSerializer

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
