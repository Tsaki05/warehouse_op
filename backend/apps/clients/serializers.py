from rest_framework import serializers
from .models import Client, Empresa, Individual


class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['adressa', 'enviament']


class IndividualSerializer(serializers.ModelSerializer):
    class Meta:
        model = Individual
        fields = ['telefon']


class ClientSerializer(serializers.ModelSerializer):
    empresa    = EmpresaSerializer(read_only=True)
    individual = IndividualSerializer(read_only=True)
    tipus      = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = ['nif', 'nom', 'correu_electronic', 'tipus', 'empresa', 'individual']

    def get_tipus(self, obj):
        if hasattr(obj, 'empresa'):
            return 'empresa'
        if hasattr(obj, 'individual'):
            return 'individual'
        return None
