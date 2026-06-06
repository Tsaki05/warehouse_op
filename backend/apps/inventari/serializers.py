from rest_framework import serializers
from .models import Magatzem, Ubicacio, Producte, Lot


class MagatzemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Magatzem
        fields = '__all__'


class MagatzemCreateSerializer(serializers.Serializer):
    nom = serializers.CharField(max_length=100, required=True)


class UbicacioSerializer(serializers.ModelSerializer):
    magatzem_nom = serializers.CharField(source='magatzem.nom', read_only=True)

    class Meta:
        model  = Ubicacio
        fields = ['id_ubicacio', 'magatzem', 'magatzem_nom', 'passadis', 'estant', 'alcada']



class LotBreu(serializers.ModelSerializer):
    """Compact lot info embedded inside Producte."""
    ubicacio_codi = serializers.SerializerMethodField()
    magatzem_id   = serializers.CharField(source='ubicacio.magatzem_id', read_only=True)
    magatzem_nom  = serializers.CharField(source='ubicacio.magatzem.nom', read_only=True)

    class Meta:
        model  = Lot
        fields = ['ubicacio', 'ubicacio_codi', 'magatzem_id', 'magatzem_nom', 'quantitat', 'data_entrada']

    def get_ubicacio_codi(self, obj):
        u = obj.ubicacio
        return f"{u.passadis}-{u.estant}-{u.alcada}"


class ProducteSerializer(serializers.ModelSerializer):
    lots               = LotBreu(many=True, read_only=True)
    estoc_per_magatzem = serializers.SerializerMethodField()

    class Meta:
        model  = Producte
        fields = [
            'id_producte', 'nom', 'descripcio', 'codi_proveidor',
            'estoc_total', 'estoc_per_magatzem', 'preu', 'categoria', 'lots',
        ]

    def get_estoc_per_magatzem(self, obj):
        result = {}
        for l in obj.lots.all():
            key = l.ubicacio.magatzem_id
            if key not in result:
                result[key] = {
                    'magatzem_id':  key,
                    'magatzem_nom': l.ubicacio.magatzem.nom,
                    'estoc':        0,
                }
            result[key]['estoc'] += l.quantitat
        return list(result.values())


class LotSerializer(serializers.ModelSerializer):
    producte_nom  = serializers.CharField(source='producte.nom', read_only=True)
    ubicacio_codi = serializers.SerializerMethodField()
    superior_nom  = serializers.SerializerMethodField()

    class Meta:
        model  = Lot
        fields = [
            'id', 'producte', 'producte_nom', 'ubicacio', 'ubicacio_codi',
            'superior', 'superior_nom', 'quantitat', 'data_entrada',
        ]
        extra_kwargs = {'superior': {'required': False, 'allow_null': True}}

    def get_ubicacio_codi(self, obj):
        u = obj.ubicacio
        return f"{u.passadis}-{u.estant}-{u.alcada}"

    def get_superior_nom(self, obj):
        if not obj.superior_id:
            return None
        u = obj.superior.user
        return u.get_full_name() or u.username
