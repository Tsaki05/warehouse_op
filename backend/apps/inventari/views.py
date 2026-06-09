from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, Prefetch, RestrictedError, ProtectedError, Sum, OuterRef, Subquery, IntegerField
from django.db import IntegrityError
from django.db.models.functions import Coalesce

from apps.accounts.permissions import IsAdmin, IsAdminOrSuperior
from .models import Magatzem, Ubicacio, Producte, Lot
from .serializers import (
    MagatzemSerializer, MagatzemCreateSerializer, UbicacioSerializer,
    ProducteSerializer, LotSerializer,
)
from .utils import get_mag_ids
from . import services as InventariService

ESTOC_BAIX = 25


class MagatzemViewSet(viewsets.ModelViewSet):
    serializer_class = MagatzemSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('create', 'destroy'):
            return [IsAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except (RestrictedError, ProtectedError):
            return Response(
                {'detail': 'No es pot eliminar: el magatzem té lots de productes assignats.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        mag_ids = get_mag_ids(self.request)
        qs = Magatzem.objects.all()
        if mag_ids:
            qs = qs.filter(pk__in=mag_ids)
        cerca = self.request.query_params.get('cerca', '').strip()
        if cerca:
            qs = qs.filter(Q(nom__icontains=cerca) | Q(codi_magatzem__icontains=cerca))
        return qs.order_by('nom', 'codi_magatzem')

    def create(self, request, *args, **kwargs):
        serializer = MagatzemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        magatzem = InventariService.crear_magatzem(serializer.validated_data['nom'])
        return Response(MagatzemSerializer(magatzem).data, status=status.HTTP_201_CREATED)


class UbicacioViewSet(viewsets.ModelViewSet):
    serializer_class = UbicacioSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'bulk_create'):
            return [IsAdminOrSuperior()]
        return [IsAuthenticated()]

    def get_queryset(self):
        p = self.request.query_params
        qs = Ubicacio.objects.select_related('magatzem')

        mag_ids = get_mag_ids(self.request)
        magatzem_param = p.get('magatzem')
        if mag_ids:
            qs = qs.filter(magatzem_id__in=mag_ids)
        elif magatzem_param:
            qs = qs.filter(magatzem_id=magatzem_param)

        cerca = p.get('cerca', '').strip()
        if cerca:
            qs = qs.filter(
                Q(passadis__icontains=cerca)
                | Q(estant__icontains=cerca)
                | Q(alcada__icontains=cerca)
            )

        return qs.order_by('passadis', 'estant', 'alcada')[:200]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except RestrictedError:
            return Response(
                {'detail': 'No es pot eliminar: aquesta ubicació té lots assignats.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_create(self, serializer):
        mag_ids = get_mag_ids(self.request)
        if mag_ids and len(mag_ids) == 1 and 'magatzem' not in self.request.data:
            magatzem = Magatzem.objects.get(pk=mag_ids[0])
            serializer.save(magatzem=magatzem)
        else:
            serializer.save()

    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk_create(self, request):
        magatzem_id  = request.data.get('magatzem')
        passadis     = (request.data.get('passadis') or '').strip().upper()
        combinacions = request.data.get('combinacions', [])

        if not magatzem_id or not passadis or not combinacions:
            return Response(
                {'detail': 'Cal indicar magatzem, passadís i almenys una combinació.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            n = InventariService.crear_ubicacions_bulk(magatzem_id, passadis, combinacions)
            return Response({'created': n}, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)



class ProducteViewSet(viewsets.ModelViewSet):
    serializer_class = ProducteSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminOrSuperior()]
        return [IsAuthenticated()]

    def get_queryset(self):
        p       = self.request.query_params
        mag_ids = get_mag_ids(self.request)

        lots_qs = Lot.objects.select_related('ubicacio__magatzem')
        if mag_ids:
            lots_qs = lots_qs.filter(ubicacio__magatzem_id__in=mag_ids)

        qs = Producte.objects.prefetch_related(Prefetch('lots', queryset=lots_qs))

        if mag_ids:
            qs = qs.filter(lots__ubicacio__magatzem_id__in=mag_ids).distinct()

        cerca = p.get('cerca', '').strip()
        if cerca:
            qs = qs.filter(
                Q(id_producte__icontains=cerca)
                | Q(nom__icontains=cerca)
                | Q(descripcio__icontains=cerca)
                | Q(codi_proveidor__icontains=cerca)
                | Q(lots__ubicacio__passadis__icontains=cerca)
                | Q(lots__ubicacio__estant__icontains=cerca)
                | Q(lots__ubicacio__alcada__icontains=cerca)
                | Q(lots__ubicacio__magatzem__nom__icontains=cerca)
                | Q(lots__ubicacio__magatzem__codi_magatzem__icontains=cerca)
            ).distinct()

        categories = p.getlist('categoria')
        if categories:
            qs = qs.filter(categoria__in=categories)

        if p.get('baix_estoc') == 'true':
            lot_filter = Q(ubicacio__magatzem_id__in=mag_ids) if mag_ids else Q()
            # Agrupa per (producte, magatzem) i marca crític si ALGUN magatzem té < ESTOC_BAIX
            ids_baix = (
                Lot.objects
                .filter(lot_filter)
                .values('producte_id', 'ubicacio__magatzem_id')
                .annotate(total=Sum('quantitat'))
                .filter(total__lt=ESTOC_BAIX)
                .values_list('producte_id', flat=True)
                .distinct()
            )
            qs = qs.filter(id_producte__in=ids_baix)

        ordre_param = p.get('ordre', 'nom')

        if ordre_param in ('estoc_asc', 'estoc_desc'):
            lot_filter = Q(ubicacio__magatzem_id__in=mag_ids) if mag_ids else Q()
            # Pren el mínim d'estoc per magatzem (el més crític) per ordenar
            estoc_sub = Subquery(
                Lot.objects
                .filter(lot_filter, producte_id=OuterRef('pk'))
                .values('producte_id', 'ubicacio__magatzem_id')
                .annotate(total=Sum('quantitat'))
                .order_by('total')
                .values('total')[:1],
                output_field=IntegerField()
            )
            qs = qs.annotate(estoc_real=Coalesce(estoc_sub, 0))
            return qs.order_by('estoc_real' if ordre_param == 'estoc_asc' else '-estoc_real')

        ORDRES = {'nom': 'nom', 'preu_asc': 'preu', 'preu_desc': '-preu'}
        return qs.order_by(ORDRES.get(ordre_param, 'nom'))

    def create(self, request, *args, **kwargs):
        data      = {k: v for k, v in request.data.items() if k != 'lots'}
        lots_data = request.data.get('lots', [])

        if not lots_data:
            return Response(
                {'lots': ['Cal afegir almenys un lot per ubicar el producte.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        try:
            producte = InventariService.crear_producte_amb_lots(
                serializer.validated_data, lots_data
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(ProducteSerializer(producte).data, status=status.HTTP_201_CREATED)


class LotViewSet(viewsets.ModelViewSet):
    serializer_class = LotSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminOrSuperior()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Lot.objects.select_related('ubicacio__magatzem', 'producte', 'superior__user')

        mag_ids = get_mag_ids(self.request)
        if mag_ids:
            qs = qs.filter(ubicacio__magatzem_id__in=mag_ids)

        producte = self.request.query_params.get('producte')
        if producte:
            qs = qs.filter(producte_id=producte)
        return qs

    def perform_create(self, serializer):
        ubicacio = serializer.validated_data.get('ubicacio')
        superior = serializer.validated_data.get('superior')
        superior = InventariService.resolve_lot_superior(ubicacio, superior)
        serializer.save(superior=superior)
