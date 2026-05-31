from collections import defaultdict
from decimal import Decimal

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, F, Prefetch
from apps.accounts.permissions import IsAdminOrSuperior
from apps.comandes.models import Comanda
from .models import Client, ClientMagatzem
from .serializers import ClientCreateSerializer, ClientListSerializer, ClientSerializer


def _allowed_mags_for(perfil, query_params):
    """
    Retorna la llista de magatzem_ids visibles per a l'usuari, o None (admin sense filtre = tot).
    """
    if not perfil:
        return None
    if perfil.rol in ('superior', 'mosso'):
        return [str(perfil.magatzem_id)] if perfil.magatzem_id else []
    if perfil.rol == 'admin':
        ids = query_params.getlist('magatzem_filter')
        return ids if ids else None
    return None


class ClientViewSet(viewsets.ModelViewSet):
    http_method_names = ['get', 'post', 'head', 'options']  # no PUT/PATCH/DELETE

    def get_permissions(self):
        if self.action == 'create':
            return [IsAdminOrSuperior()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'create':
            return ClientCreateSerializer
        if self.action == 'retrieve':
            return ClientSerializer
        return ClientListSerializer

    def create(self, request, *args, **kwargs):
        serializer = ClientCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client = serializer.save()
        client = (
            Client.objects
            .select_related('empresa', 'individual')
            .prefetch_related(Prefetch('client_magatzems',
                queryset=ClientMagatzem.objects.select_related('magatzem')))
            .get(pk=client.pk)
        )
        return Response(ClientListSerializer(client).data, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        p      = self.request.query_params
        perfil = getattr(self.request.user, 'perfil', None)
        allowed = _allowed_mags_for(perfil, p)

        # Prefetch client_magatzems filtrat al rol: superior/mosso veuen NOMÉS el seu
        client_mag_qs = ClientMagatzem.objects.select_related('magatzem')
        if perfil and perfil.rol in ('superior', 'mosso') and perfil.magatzem_id:
            client_mag_qs = client_mag_qs.filter(magatzem_id=perfil.magatzem_id)

        qs = Client.objects.prefetch_related(
            'empresa', 'individual',
            Prefetch('client_magatzems', queryset=client_mag_qs),
        )

        # Filtra QUINS clients apareixen
        if allowed is not None:
            qs = qs.filter(client_magatzems__magatzem_id__in=allowed).distinct()

        cerca = p.get('cerca', '').strip()
        if cerca:
            qs = qs.filter(
                Q(nif__icontains=cerca)
                | Q(nom__icontains=cerca)
                | Q(correu_electronic__icontains=cerca)
            )

        tipus = p.get('tipus')
        if tipus == 'empresa':
            qs = qs.filter(empresa__isnull=False)
        elif tipus == 'individual':
            qs = qs.filter(individual__isnull=False)

        return qs.order_by('nom')

    def retrieve(self, request, *args, **kwargs):
        """Detall d'un client: inclou n_comandes i import_total per magatzem."""
        client  = self.get_object()
        perfil  = getattr(request.user, 'perfil', None)
        allowed = _allowed_mags_for(perfil, request.query_params)

        mag_stats = _compute_mag_stats([client], allowed_mags=allowed)
        ctx       = {**self.get_serializer_context(), 'mag_stats': mag_stats}
        return Response(ClientSerializer(client, context=ctx).data)


def _compute_mag_stats(clients, allowed_mags=None):
    """
    Una sola query per obtenir (n_comandes, import_total) per (client, magatzem).
    Si allowed_mags no és None, restringeix als magatzems indicats.
    """
    client_ids = [c.nif for c in clients]
    if not client_ids:
        return {}

    pairs = (
        Comanda.objects
        .filter(client_id__in=client_ids)
        .values(
            'id_comanda', 'client_id', 'import_total',
            mag=F('paquets__producte__lots__ubicacio__magatzem_id'),
        )
        .distinct()
        .filter(mag__isnull=False)
    )

    if allowed_mags is not None:
        pairs = pairs.filter(mag__in=allowed_mags)

    stats = defaultdict(lambda: {'n': 0, 'total': Decimal('0')})
    for row in pairs:
        key = (row['client_id'], row['mag'])
        stats[key]['n']     += 1
        stats[key]['total'] += row['import_total'] or Decimal('0')

    return stats
