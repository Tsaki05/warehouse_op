from rest_framework import viewsets
from .models import Factura, Comanda, Paquet
from .serializers import FacturaSerializer, ComandaSerializer, PaquetSerializer


class FacturaViewSet(viewsets.ModelViewSet):
    queryset = Factura.objects.select_related('client').all()
    serializer_class = FacturaSerializer


class ComandaViewSet(viewsets.ModelViewSet):
    queryset = Comanda.objects.select_related('client', 'factura').prefetch_related('paquets').all()
    serializer_class = ComandaSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        client = self.request.query_params.get('client')
        sense_factura = self.request.query_params.get('sense_factura')
        if client:
            qs = qs.filter(client_id=client)
        if sense_factura == 'true':
            qs = qs.filter(factura__isnull=True)
        return qs


class PaquetViewSet(viewsets.ModelViewSet):
    queryset = Paquet.objects.select_related('comanda', 'producte').all()
    serializer_class = PaquetSerializer
