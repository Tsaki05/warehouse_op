from rest_framework import viewsets
from rest_framework.response import Response
from django.db.models import Q, Count, Prefetch

from apps.inventari.views import _mag_id
from .models import Factura, Comanda, Paquet
from .serializers import FacturaSerializer, ComandaSerializer, PaquetSerializer

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


class ComandaViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ComandaSerializer

    def get_queryset(self):
        p = self.request.query_params

        # Base: join client + prefetch paquets+producte en una sola query addicional
        qs = (
            Comanda.objects
            .select_related('client', 'factura')
            .prefetch_related(
                Prefetch('paquets', queryset=Paquet.objects.select_related('producte'))
            )
        )

        # ── Scoping per magatzem ──────────────────────────────────────────────
        mag_id = _mag_id(self.request)
        if mag_id:
            qs = qs.filter(
                paquets__producte__lots__ubicacio__magatzem_id__in=mag_id
            ).distinct()

        # ── Filtre sense factura ──────────────────────────────────────────────
        if p.get('sense_factura') == 'true':
            qs = qs.filter(factura__isnull=True)

        # ── Filtre enviament ──────────────────────────────────────────────────
        enviament = p.get('enviament')
        if enviament == 'true':
            qs = qs.filter(enviament=True)
        elif enviament == 'false':
            qs = qs.filter(enviament=False)

        # ── Filtre client (per NIF exacte) ────────────────────────────────────
        client = p.get('client')
        if client:
            qs = qs.filter(client_id=client)

        # ── Filtre per factura ────────────────────────────────────────────────
        factura = p.get('factura')
        if factura:
            qs = qs.filter(factura_id=factura)

        # ── Cerca multi-camp (Q objects: OR sobre id, NIF i nom) ──────────────
        cerca = p.get('cerca', '').strip()
        if cerca:
            qs = qs.filter(
                Q(id_comanda__icontains=cerca)
                | Q(client__nif__icontains=cerca)
                | Q(client__nom__icontains=cerca)
            )

        # ── Ordenació ─────────────────────────────────────────────────────────
        ordre = ORDRES_COMANDA.get(p.get('ordre'), '-data')
        qs = qs.order_by(ordre)

        return qs


class FacturaViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = FacturaSerializer

    def get_queryset(self):
        p = self.request.query_params

        # Base: join client + annotate n_comandes amb COUNT a nivell de BD
        qs = (
            Factura.objects
            .select_related('client')
            .annotate(n_comandes=Count('comandes', distinct=True))
        )

        # ── Scoping per magatzem ──────────────────────────────────────────────
        mag_id = _mag_id(self.request)
        if mag_id:
            qs = qs.filter(
                comandes__paquets__producte__lots__ubicacio__magatzem_id__in=mag_id
            ).distinct()

        # ── Cerca multi-camp ──────────────────────────────────────────────────
        cerca = p.get('cerca', '').strip()
        if cerca:
            qs = qs.filter(
                Q(id_factura__icontains=cerca)
                | Q(client__nif__icontains=cerca)
                | Q(client__nom__icontains=cerca)
            )

        # ── Filtre per data ───────────────────────────────────────────────────
        data_des = p.get('data_des')
        data_fins = p.get('data_fins')
        if data_des:
            qs = qs.filter(data__gte=data_des)
        if data_fins:
            qs = qs.filter(data__lte=data_fins)

        # ── Filtre per nombre de comandes (empresa ≥2, individual =1) ─────────
        tipus = p.get('tipus')
        if tipus == 'empresa':
            qs = qs.filter(n_comandes__gte=2)
        elif tipus == 'individual':
            qs = qs.filter(n_comandes=1)

        # ── Ordenació ─────────────────────────────────────────────────────────
        ordre = ORDRES_FACTURA.get(p.get('ordre'), '-data')
        qs = qs.order_by(ordre)

        return qs


class PaquetViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Paquet.objects.select_related('comanda', 'producte').all()
    serializer_class = PaquetSerializer
