from rest_framework import viewsets
from django.db.models import Q
from .models import Client
from .serializers import ClientSerializer


class ClientViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ClientSerializer

    def get_queryset(self):
        p   = self.request.query_params
        qs  = Client.objects.prefetch_related('empresa', 'individual')

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
