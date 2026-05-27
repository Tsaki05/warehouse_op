from rest_framework import serializers
from .models import Factura, Comanda, Paquet


class PaquetSerializer(serializers.ModelSerializer):
    producte_nom = serializers.CharField(source='producte.nom', read_only=True)

    class Meta:
        model = Paquet
        fields = ['producte', 'producte_nom', 'quantitat', 'preu']


import random
import string


def _generar_id_comanda():
    chars = string.ascii_uppercase + string.digits
    while True:
        codi = ''.join(random.choices(chars, k=5))
        if not Comanda.objects.filter(pk=codi).exists():
            return codi


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

    def create(self, validated_data):
        paquets_data = validated_data.pop('paquets')
        import_total = sum(p['quantitat'] * p['preu'] for p in paquets_data)
        comanda = Comanda.objects.create(
            **validated_data,
            id_comanda=_generar_id_comanda(),
            import_total=import_total,
        )
        Paquet.objects.bulk_create([Paquet(comanda=comanda, **p) for p in paquets_data])
        return comanda


class ComandaSerializer(serializers.ModelSerializer):
    paquets          = PaquetSerializer(many=True, read_only=True)
    client_nom       = serializers.CharField(source='client.nom', read_only=True)
    preparat_per_nom = serializers.SerializerMethodField()

    class Meta:
        model = Comanda
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
    client_nom  = serializers.CharField(source='client.nom', read_only=True)
    n_comandes  = serializers.IntegerField(read_only=True)

    class Meta:
        model = Factura
        fields = ['id_factura', 'client', 'client_nom', 'import_total', 'data', 'n_comandes']
