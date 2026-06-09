from rest_framework import serializers
from .models import Factura, Comanda, Paquet
from apps.inventari.models import Magatzem


class PaquetSerializer(serializers.ModelSerializer):
    producte_nom = serializers.CharField(source='producte.nom', read_only=True)

    class Meta:
        model  = Paquet
        fields = ['producte', 'producte_nom', 'quantitat', 'preu']


class PaquetWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Paquet
        fields = ['producte', 'quantitat', 'preu']


class ComandaCreateSerializer(serializers.ModelSerializer):
    paquets         = PaquetWriteSerializer(many=True)
    metode_pagament = serializers.IntegerField(allow_null=True, required=False)
    magatzem        = serializers.PrimaryKeyRelatedField(
        queryset=Magatzem.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model  = Comanda
        fields = ['client', 'metode_pagament', 'enviament', 'paquets', 'magatzem']

    def validate_paquets(self, value):
        if not value:
            raise serializers.ValidationError("Cal almenys un paquet.")
        te_positius = any(p['quantitat'] > 0 for p in value)
        te_negatius = any(p['quantitat'] < 0 for p in value)
        if te_positius and te_negatius:
            raise serializers.ValidationError(
                "Una comanda no pot barrejar compres i retorns. "
                "Crea dues comandes separades."
            )
        return value

    def validate(self, data):
        from apps.inventari.models import Lot
        from django.db.models import Sum

        # Si la vista ha forçat un magatzem (superior/mosso), usem aquest per validar
        magatzem = data.get('magatzem') or self.context.get('mag_override')
        client   = data.get('client')
        paquets  = data.get('paquets', [])

        has_compres = any(p['quantitat'] > 0 for p in paquets)
        has_retorns = any(p['quantitat'] < 0 for p in paquets)

        # ── Validació compres: estoc disponible al magatzem ──────────────────
        if magatzem and has_compres:
            for paquet in paquets:
                if paquet['quantitat'] <= 0:
                    continue
                producte = paquet['producte']
                estoc = (
                    Lot.objects
                    .filter(producte_id=producte.pk, ubicacio__magatzem_id=magatzem.pk)
                    .aggregate(total=Sum('quantitat'))['total'] or 0
                )
                if estoc <= 0:
                    raise serializers.ValidationError(
                        {'paquets': f'El producte "{producte.nom}" no té estoc disponible al magatzem seleccionat.'}
                    )

        # ── Validació retorns: el client ha de tenir saldo positiu ───────────
        if has_retorns:
            if not magatzem:
                raise serializers.ValidationError(
                    {'magatzem': 'Cal indicar el magatzem per a un retorn.'}
                )
            for paquet in paquets:
                if paquet['quantitat'] >= 0:
                    continue
                producte     = paquet['producte']
                qty_retorn   = abs(paquet['quantitat'])

                # Quantitat neta comprada per aquest client en aquest magatzem
                net_qty = (
                    Paquet.objects
                    .filter(
                        comanda__client=client,
                        comanda__magatzem=magatzem,
                        producte=producte,
                    )
                    .aggregate(net=Sum('quantitat'))['net'] or 0
                )

                if net_qty < qty_retorn:
                    disponible = max(0, net_qty)
                    raise serializers.ValidationError({
                        'paquets': (
                            f'No es pot retornar {qty_retorn} u. de "{producte.nom}" al magatzem '
                            f'"{magatzem.nom}": el client té {disponible} u. comprades (net).'
                        )
                    })

        return data


class ComandaSerializer(serializers.ModelSerializer):
    paquets          = PaquetSerializer(many=True, read_only=True)
    client_nom       = serializers.CharField(source='client.nom', read_only=True)
    magatzem_nom     = serializers.SerializerMethodField()
    preparat_per_nom = serializers.SerializerMethodField()

    class Meta:
        model  = Comanda
        fields = [
            'id_comanda', 'client', 'client_nom', 'data',
            'factura', 'metode_pagament', 'enviament', 'import_total', 'paquets',
            'preparat', 'preparat_per_nom',
            'magatzem', 'magatzem_nom',
        ]

    def get_magatzem_nom(self, obj):
        return obj.magatzem.nom if obj.magatzem_id else None

    def get_preparat_per_nom(self, obj):
        if not obj.preparat_per_id:
            return None
        u = obj.preparat_per
        return u.get_full_name() or u.username


class FacturaSerializer(serializers.ModelSerializer):
    client_nom = serializers.CharField(source='client.nom', read_only=True)
    n_comandes = serializers.SerializerMethodField()

    class Meta:
        model  = Factura
        fields = ['id_factura', 'client', 'client_nom', 'import_total', 'data', 'n_comandes']

    def get_n_comandes(self, obj):
        if hasattr(obj, 'n_comandes'):
            return obj.n_comandes
        return obj.comandes.count()


class FacturaCreateSerializer(serializers.Serializer):
    comandes        = serializers.ListField(child=serializers.CharField(), min_length=1)
    metode_pagament = serializers.IntegerField(required=False, allow_null=True)

    def validate_comandes(self, ids):
        qs = list(Comanda.objects.filter(id_comanda__in=ids))
        if len(qs) != len(set(ids)):
            raise serializers.ValidationError("Alguna comanda no s'ha trobat.")
        if any(not c.preparat for c in qs):
            raise serializers.ValidationError("Totes les comandes han d'estar preparades.")
        if any(c.factura_id for c in qs):
            raise serializers.ValidationError("Alguna comanda ja té factura assignada.")
        if len({c.client_id for c in qs}) > 1:
            raise serializers.ValidationError("Totes les comandes han de ser del mateix client.")
        return qs

    def validate(self, data):
        comandes = data.get('comandes', [])
        metode   = data.get('metode_pagament')
        if any(not c.metode_pagament for c in comandes) and not metode:
            raise serializers.ValidationError(
                {'metode_pagament': 'Cal indicar el mètode de pagament per a comandes sense assignar.'}
            )
        if metode and metode not in (1, 2, 3):
            raise serializers.ValidationError({'metode_pagament': 'Mètode invàlid.'})
        return data
