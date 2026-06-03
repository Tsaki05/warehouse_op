from rest_framework import serializers
from .models import Factura, Comanda, Paquet


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

    class Meta:
        model  = Comanda
        fields = ['client', 'metode_pagament', 'enviament', 'paquets']

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


class ComandaSerializer(serializers.ModelSerializer):
    paquets          = PaquetSerializer(many=True, read_only=True)
    client_nom       = serializers.CharField(source='client.nom', read_only=True)
    preparat_per_nom = serializers.SerializerMethodField()

    class Meta:
        model  = Comanda
        fields = [
            'id_comanda', 'client', 'client_nom', 'data',
            'factura', 'metode_pagament', 'enviament', 'import_total', 'paquets',
            'preparat', 'preparat_per_nom',
        ]

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
