from rest_framework import serializers
from .models import Magatzem, Ubicacio, Treballador, Producte, Lot


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
        return 'Superior' if obj.superior else 'Mosso'


class ProducteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producte
        fields = '__all__'


class LotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lot
        fields = '__all__'
