from rest_framework import viewsets
from .models import Magatzem, Ubicacio, Treballador, Producte, Lot
from .serializers import (
    MagatzemSerializer, UbicacioSerializer,
    TreballadorSerializer, ProducteSerializer, LotSerializer
)


class MagatzemViewSet(viewsets.ModelViewSet):
    queryset = Magatzem.objects.all()
    serializer_class = MagatzemSerializer


class UbicacioViewSet(viewsets.ModelViewSet):
    queryset = Ubicacio.objects.select_related('magatzem').all()
    serializer_class = UbicacioSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        magatzem = self.request.query_params.get('magatzem')
        if magatzem:
            qs = qs.filter(magatzem_id=magatzem)
        return qs


class TreballadorViewSet(viewsets.ModelViewSet):
    queryset = Treballador.objects.all()
    serializer_class = TreballadorSerializer


class ProducteViewSet(viewsets.ModelViewSet):
    queryset = Producte.objects.all()
    serializer_class = ProducteSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        categoria = self.request.query_params.get('categoria')
        if categoria:
            qs = qs.filter(categoria=categoria)
        return qs


class LotViewSet(viewsets.ModelViewSet):
    queryset = Lot.objects.select_related('ubicacio', 'producte', 'superior').all()
    serializer_class = LotSerializer
