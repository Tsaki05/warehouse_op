from collections import defaultdict
from decimal import Decimal
from django.db.models import F
from .models import Client, Empresa, Individual


def get_allowed_mags(perfil, query_params):
    """
    Retorna la llista de magatzem_ids visibles per a l'usuari, o None (admin sense filtre = tot).
    - mosso/superior → [magatzem_id]
    - admin + ?magatzem_filter= → [ids]
    - admin sense filtre → None
    """
    if not perfil:
        return None
    if perfil.rol in ('superior', 'mosso'):
        return [str(perfil.magatzem_id)] if perfil.magatzem_id else []
    if perfil.rol == 'admin':
        ids = query_params.getlist('magatzem_filter')
        return ids if ids else None
    return None


def crear_client(validated_data):
    """
    Crea un Client i la seva subclasse (Empresa o Individual).
    Retorna la instància Client creada.
    """
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


def compute_mag_stats(clients, allowed_mags=None):
    """
    En una sola query obté (n_comandes, import_total) per cada (client, magatzem).
    Retorna dict {(client_id, magatzem_id): {'n': int, 'total': Decimal}}.
    """
    from apps.comandes.models import Comanda

    client_ids = [c.nif for c in clients]
    if not client_ids:
        return {}

    pairs = (
        Comanda.objects
        .filter(client_id__in=client_ids)
        .values(
            'id_comanda', 'client_id', 'import_total',
            mag=F('paquets__producte__lots__ubicacio__magatzem_id'),
        )
        .distinct()
        .filter(mag__isnull=False)
    )

    if allowed_mags is not None:
        pairs = pairs.filter(mag__in=allowed_mags)

    stats = defaultdict(lambda: {'n': 0, 'total': Decimal('0')})
    for row in pairs:
        key = (row['client_id'], row['mag'])
        stats[key]['n']     += 1
        stats[key]['total'] += row['import_total'] or Decimal('0')

    return stats
