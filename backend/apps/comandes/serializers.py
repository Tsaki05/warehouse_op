from rest_framework import serializers
from .models import Factura, Comanda, Paquet


class PaquetSerializer(serializers.ModelSerializer):
    producte_nom = serializers.CharField(source='producte.nom', read_only=True)

    class Meta:
        model = Paquet
        fields = ['producte', 'producte_nom', 'quantitat', 'preu']


class ComandaSerializer(serializers.ModelSerializer):
    paquets    = PaquetSerializer(many=True, read_only=True)
    client_nom = serializers.CharField(source='client.nom', read_only=True)

    class Meta:
        model = Comanda
        fields = [
            'id_comanda', 'client', 'client_nom', 'data',
            'factura', 'metode_pagament', 'enviament', 'import_total', 'paquets',
        ]


class FacturaSerializer(serializers.ModelSerializer):
    client_nom  = serializers.CharField(source='client.nom', read_only=True)
    n_comandes  = serializers.IntegerField(read_only=True)

    class Meta:
        model = Factura
        fields = ['id_factura', 'client', 'client_nom', 'import_total', 'data', 'n_comandes']
