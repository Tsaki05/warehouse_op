from decimal import Decimal
from rest_framework import serializers
from .models import Client, Empresa, Individual, ClientMagatzem


class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['adressa', 'enviament']


class IndividualSerializer(serializers.ModelSerializer):
    class Meta:
        model = Individual
        fields = ['telefon']


class ClientMagatzemSerializer(serializers.ModelSerializer):
    """Amb estadístiques (per a la vista de detall d'un client)."""
    codi_magatzem = serializers.CharField(source='magatzem.codi_magatzem')
    nom_magatzem  = serializers.CharField(source='magatzem.nom')
    n_comandes    = serializers.SerializerMethodField()
    import_total  = serializers.SerializerMethodField()

    class Meta:
        model  = ClientMagatzem
        fields = ['codi_magatzem', 'nom_magatzem', 'data_alta', 'n_comandes', 'import_total']

    def _stats(self, obj):
        return self.context.get('mag_stats', {}).get(
            (obj.client_id, obj.magatzem_id), {'n': 0, 'total': Decimal('0')}
        )

    def get_n_comandes(self, obj):
        return self._stats(obj)['n']

    def get_import_total(self, obj):
        return self._stats(obj)['total']


class ClientMagatzemBreu(serializers.ModelSerializer):
    """Sense estadístiques (per al llistat ràpid)."""
    codi_magatzem = serializers.CharField(source='magatzem.codi_magatzem')
    nom_magatzem  = serializers.CharField(source='magatzem.nom')

    class Meta:
        model  = ClientMagatzem
        fields = ['codi_magatzem', 'nom_magatzem', 'data_alta']


class ClientListSerializer(serializers.ModelSerializer):
    """Serialitzador lleuger per al llistat (sense stats de magatzem)."""
    empresa          = EmpresaSerializer(read_only=True)
    individual       = IndividualSerializer(read_only=True)
    tipus            = serializers.SerializerMethodField()
    client_magatzems = ClientMagatzemBreu(many=True, read_only=True)

    class Meta:
        model  = Client
        fields = ['nif', 'nom', 'correu_electronic', 'tipus', 'empresa', 'individual', 'client_magatzems']

    def get_tipus(self, obj):
        if hasattr(obj, 'empresa'):
            return 'empresa'
        if hasattr(obj, 'individual'):
            return 'individual'
        return None


class ClientSerializer(serializers.ModelSerializer):
    """Serialitzador complet per al detall d'un client (inclou stats)."""
    empresa          = EmpresaSerializer(read_only=True)
    individual       = IndividualSerializer(read_only=True)
    tipus            = serializers.SerializerMethodField()
    client_magatzems = ClientMagatzemSerializer(many=True, read_only=True)

    class Meta:
        model  = Client
        fields = ['nif', 'nom', 'correu_electronic', 'tipus', 'empresa', 'individual', 'client_magatzems']

    def get_tipus(self, obj):
        if hasattr(obj, 'empresa'):
            return 'empresa'
        if hasattr(obj, 'individual'):
            return 'individual'
        return None
