from decimal import Decimal
from rest_framework import serializers
from .models import Client, Empresa, Individual, ClientMagatzem


class ClientCreateSerializer(serializers.ModelSerializer):
    tipus     = serializers.ChoiceField(choices=['empresa', 'individual'], write_only=True)
    adressa   = serializers.CharField(required=False, allow_blank=True, write_only=True, default='')
    enviament = serializers.BooleanField(required=False, default=False, write_only=True)
    telefon   = serializers.CharField(required=False, allow_blank=True, write_only=True, default='')

    class Meta:
        model  = Client
        fields = ['nif', 'nom', 'correu_electronic', 'tipus', 'adressa', 'enviament', 'telefon']

    def validate(self, data):
        if data.get('tipus') == 'empresa' and not data.get('adressa', '').strip():
            raise serializers.ValidationError({'adressa': "Cal indicar l'adreça per a una empresa."})
        if data.get('tipus') == 'individual' and not data.get('telefon', '').strip():
            raise serializers.ValidationError({'telefon': 'Cal indicar el telèfon per a un particular.'})
        return data

    def create(self, validated_data):
        tipus     = validated_data.pop('tipus')
        adressa   = validated_data.pop('adressa', '')
        enviament = validated_data.pop('enviament', False)
        telefon   = validated_data.pop('telefon', '')
        client = Client.objects.create(**validated_data)
        if tipus == 'empresa':
            Empresa.objects.create(client=client, adressa=adressa, enviament=enviament)
        else:
            Individual.objects.create(client=client, telefon=telefon)
        return client


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
