from collections import defaultdict
from decimal import Decimal

from rest_framework import viewsets
from rest_framework.response import Response
from django.db.models import Q, F
from apps.comandes.models import Comanda
from .models import Client
from .serializers import ClientListSerializer, ClientSerializer


class ClientViewSet(viewsets.ReadOnlyModelViewSet):

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ClientSerializer
        return ClientListSerializer

    def get_queryset(self):
        p  = self.request.query_params
        qs = Client.objects.prefetch_related('empresa', 'individual', 'client_magatzems__magatzem')

        perfil = getattr(self.request.user, 'perfil', None)
        if perfil:
            if perfil.rol == 'admin':
                mag_ids = p.getlist('magatzem_filter')
                if mag_ids:
                    qs = qs.filter(client_magatzems__magatzem_id__in=mag_ids).distinct()
            elif perfil.rol in ('superior', 'mosso') and perfil.magatzem_id:
                qs = qs.filter(client_magatzems__magatzem_id=perfil.magatzem_id).distinct()

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
        client    = self.get_object()
        mag_stats = _compute_mag_stats([client])
        ctx       = {**self.get_serializer_context(), 'mag_stats': mag_stats}
        return Response(ClientSerializer(client, context=ctx).data)


def _compute_mag_stats(clients):
    """
    Una sola query per obtenir (n_comandes, import_total) per (client, magatzem).
    Usa DISTINCT sobre (id_comanda, magatzem) per evitar doble-comptar.
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

    stats = defaultdict(lambda: {'n': 0, 'total': Decimal('0')})
    for row in pairs:
        key = (row['client_id'], row['mag'])
        stats[key]['n']     += 1
        stats[key]['total'] += row['import_total'] or Decimal('0')

    return stats
