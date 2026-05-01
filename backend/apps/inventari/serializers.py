from rest_framework import serializers
from .models import Magatzem, Ubicacio, Treballador, Superior, Mosso, Producte, Lot


class MagatzemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Magatzem
        fields = '__all__'


class UbicacioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ubicacio
        fields = '__all__'


class TreballadorSerializer(serializers.ModelSerializer):
    tipus = serializers.SerializerMethodField()

    class Meta:
        model = Treballador
        fields = ['telefon', 'nom', 'tipus']

    def get_tipus(self, obj):
        if hasattr(obj, 'superior'):
            return 'superior'
        if hasattr(obj, 'mosso'):
            return 'mosso'
        return None


class ProducteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producte
        fields = '__all__'


class LotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lot
        fields = '__all__'
