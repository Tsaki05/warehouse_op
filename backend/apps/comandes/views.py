from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, Count, Prefetch

from apps.accounts.permissions import IsAdminOrSuperior
from apps.clients.models import ClientMagatzem
from apps.inventari.utils import get_mag_ids
from .models import Factura, Comanda, Paquet
from .serializers import (
    FacturaSerializer, FacturaCreateSerializer,
    ComandaSerializer, ComandaCreateSerializer, PaquetSerializer,
)
from . import services as ComandaService

ORDRES_COMANDA = {
    'data_asc':   'data',
    'data_desc':  '-data',
    'preu_asc':   'import_total',
    'preu_desc':  '-import_total',
}

ORDRES_FACTURA = {
    'data_asc':    'data',
    'data_desc':   '-data',
    'import_asc':  'import_total',
    'import_desc': '-import_total',
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

    def get_serializer_class(self):
        if self.action == 'create':
            return ComandaCreateSerializer
        return ComandaSerializer

    def create(self, request, *args, **kwargs):
        serializer = ComandaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comanda = ComandaService.crear_comanda(serializer.validated_data)

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

    @action(detail=True, methods=['patch'], url_path='preparar')
    def marcar_preparat(self, request, pk=None):
        comanda   = self.get_object()
        lots_data = request.data.get('lots', [])

        if comanda.preparat:
            return Response(
                {'detail': 'Aquesta comanda ja ha estat preparada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ComandaService.marcar_comanda_preparada(comanda, lots_data, request.user)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(ComandaSerializer(
            Comanda.objects
            .select_related('client', 'factura', 'preparat_per')
            .prefetch_related(Prefetch('paquets', queryset=Paquet.objects.select_related('producte')))
            .get(pk=comanda.pk)
        ).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        return Response(ComandaService.get_dashboard_data(get_mag_ids(request)))

    def get_queryset(self):
        p = self.request.query_params

        qs = (
            Comanda.objects
            .select_related('client', 'factura', 'preparat_per')
            .prefetch_related(
                Prefetch('paquets', queryset=Paquet.objects.select_related('producte'))
            )
        )

        mag_id = get_mag_ids(self.request)
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

        return qs.order_by(ORDRES_COMANDA.get(p.get('ordre'), '-data'))


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
        factura = ComandaService.crear_factura(
            comandes=serializer.validated_data['comandes'],
            metode_pagament=serializer.validated_data.get('metode_pagament'),
        )
        return Response(FacturaSerializer(factura).data, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        p = self.request.query_params

        qs = (
            Factura.objects
            .select_related('client')
            .annotate(n_comandes=Count('comandes', distinct=True))
        )

        mag_id = get_mag_ids(self.request)
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

        data_des  = p.get('data_des')
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

        return qs.order_by(ORDRES_FACTURA.get(p.get('ordre'), '-data'))


class PaquetViewSet(viewsets.ReadOnlyModelViewSet):
    queryset         = Paquet.objects.select_related('comanda', 'producte').all()
    serializer_class = PaquetSerializer
