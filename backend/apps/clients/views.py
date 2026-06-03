from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, Prefetch

from apps.accounts.permissions import IsAdminOrSuperior
from .models import Client, ClientMagatzem
from .serializers import ClientCreateSerializer, ClientListSerializer, ClientSerializer
from . import services as ClientService


class ClientViewSet(viewsets.ModelViewSet):
    http_method_names = ['get', 'post', 'head', 'options']

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
        client = ClientService.crear_client(serializer.validated_data)
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
        allowed = ClientService.get_allowed_mags(perfil, p)

        client_mag_qs = ClientMagatzem.objects.select_related('magatzem')
        if perfil and perfil.rol in ('superior', 'mosso') and perfil.magatzem_id:
            client_mag_qs = client_mag_qs.filter(magatzem_id=perfil.magatzem_id)

        qs = Client.objects.prefetch_related(
            'empresa', 'individual',
            Prefetch('client_magatzems', queryset=client_mag_qs),
        )

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
        client  = self.get_object()
        perfil  = getattr(request.user, 'perfil', None)
        allowed = ClientService.get_allowed_mags(perfil, request.query_params)
        mag_stats = ClientService.compute_mag_stats([client], allowed_mags=allowed)
        ctx = {**self.get_serializer_context(), 'mag_stats': mag_stats}
        return Response(ClientSerializer(client, context=ctx).data)
