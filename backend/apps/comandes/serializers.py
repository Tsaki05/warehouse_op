from rest_framework import serializers
from .models import Factura, Comanda, Paquet


class PaquetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Paquet
        fields = '__all__'


class ComandaSerializer(serializers.ModelSerializer):
    paquets = PaquetSerializer(many=True, read_only=True)

    class Meta:
        model = Comanda
        fields = '__all__'


class FacturaSerializer(serializers.ModelSerializer):
    comandes = ComandaSerializer(many=True, read_only=True)

    class Meta:
        model = Factura
        fields = '__all__'
