from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Q, Prefetch, RestrictedError, Sum, OuterRef, Subquery, IntegerField
from django.db.models.functions import Coalesce

from apps.accounts.permissions import IsAdminOrSuperior
from .models import Magatzem, Ubicacio, Treballador, Producte, Lot
from .serializers import (
    MagatzemSerializer, UbicacioSerializer,
    TreballadorSerializer, ProducteSerializer, LotSerializer,
)

ESTOC_BAIX = 25


def _mag_id(request):
    """
    Retorna una llista de magatzem_ids per filtrar, o None (veu tot):
    - mosso/superior → [el seu magatzem_id] (obligatori)
    - admin + ?magatzem_filter=A&magatzem_filter=B → [A, B] (opcional, multi)
    - admin sense filtre → None (veu tot)
    """
    perfil = getattr(request.user, 'perfil', None)
    if not perfil:
        return None
    if perfil.rol == 'admin':
        ids = request.query_params.getlist('magatzem_filter')
        return ids or None
    if perfil.rol in ('superior', 'mosso') and perfil.magatzem_id:
        return [str(perfil.magatzem_id)]
    return None


def _superior_for_mag(magatzem):
    """Primer treballador superior del magatzem per assignar als lots."""
    return Treballador.objects.filter(magatzem=magatzem, superior=True).first()


class MagatzemViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MagatzemSerializer

    def get_queryset(self):
        mag_ids = _mag_id(self.request)
        qs = Magatzem.objects.all()
        if mag_ids:
            qs = qs.filter(pk__in=mag_ids)
        return qs


class UbicacioViewSet(viewsets.ModelViewSet):
    serializer_class = UbicacioSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminOrSuperior()]
        return [IsAuthenticated()]

    def get_queryset(self):
        p = self.request.query_params
        qs = Ubicacio.objects.select_related('magatzem')

        mag_ids = _mag_id(self.request)
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
        mag_ids = _mag_id(self.request)
        if mag_ids and len(mag_ids) == 1 and 'magatzem' not in self.request.data:
            magatzem = Magatzem.objects.get(pk=mag_ids[0])
            serializer.save(magatzem=magatzem)
        else:
            serializer.save()


class TreballadorViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TreballadorSerializer

    def get_queryset(self):
        mag_ids = _mag_id(self.request)
        qs = Treballador.objects.select_related('magatzem')
        if mag_ids:
            qs = qs.filter(magatzem_id__in=mag_ids)
        return qs


class ProducteViewSet(viewsets.ModelViewSet):
    serializer_class = ProducteSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminOrSuperior()]
        return [IsAuthenticated()]

    def get_queryset(self):
        p       = self.request.query_params
        mag_ids = _mag_id(self.request)

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
            estoc_sub = Subquery(
                Lot.objects
                .filter(lot_filter, producte_id=OuterRef('pk'))
                .values('producte_id')
                .annotate(total=Sum('quantitat'))
                .values('total')[:1],
                output_field=IntegerField()
            )
            qs = qs.annotate(estoc_real=Coalesce(estoc_sub, 0))
            return qs.order_by('estoc_real' if ordre_param == 'estoc_asc' else '-estoc_real')

        ORDRES = {'nom': 'nom', 'preu_asc': 'preu', 'preu_desc': '-preu'}
        return qs.order_by(ORDRES.get(ordre_param, 'nom'))

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        data = {k: v for k, v in request.data.items() if k != 'lots'}
        lots_data = request.data.get('lots', [])

        if not lots_data:
            return Response(
                {'lots': ['Cal afegir almenys un lot per ubicar el producte.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        producte = serializer.save()

        for lot_d in lots_data:
            try:
                ubicacio = Ubicacio.objects.select_related('magatzem').get(
                    pk=lot_d.get('ubicacio')
                )
            except Ubicacio.DoesNotExist:
                raise Exception(f"Ubicació {lot_d.get('ubicacio')} no trobada.")

            superior = _superior_for_mag(ubicacio.magatzem)
            if not superior:
                raise Exception(f"No hi ha superior al magatzem {ubicacio.magatzem.nom}.")

            Lot.objects.create(
                producte=producte,
                ubicacio=ubicacio,
                superior=superior,
                quantitat=lot_d.get('quantitat', 1),
            )

        producte.refresh_from_db()
        out = ProducteSerializer(producte)
        return Response(out.data, status=status.HTTP_201_CREATED)


class LotViewSet(viewsets.ModelViewSet):
    serializer_class = LotSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminOrSuperior()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Lot.objects.select_related('ubicacio__magatzem', 'producte', 'superior')

        mag_ids = _mag_id(self.request)
        if mag_ids:
            qs = qs.filter(ubicacio__magatzem_id__in=mag_ids)

        producte = self.request.query_params.get('producte')
        if producte:
            qs = qs.filter(producte_id=producte)
        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        """Auto-assign the magatzem's superior if not provided."""
        ubicacio = serializer.validated_data.get('ubicacio')
        superior = serializer.validated_data.get('superior')
        if not superior and ubicacio:
            superior = _superior_for_mag(ubicacio.magatzem)
        serializer.save(superior=superior)
