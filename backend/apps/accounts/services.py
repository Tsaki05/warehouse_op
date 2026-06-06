from django.contrib.auth.models import User
from django.db import transaction


def user_to_dict(user):
    """Serialitza un User + Perfil a dict per a la resposta JSON."""
    perfil = getattr(user, 'perfil', None)
    return {
        'id':            user.id,
        'username':      user.username,
        'nom':           user.get_full_name() or user.username,
        'first_name':    user.first_name,
        'last_name':     user.last_name,
        'rol':           perfil.rol if perfil else 'mosso',
        'telefon':       perfil.telefon if perfil else '',
        'magatzem':      perfil.magatzem_id if perfil else None,
        'magatzem_nom':  (perfil.magatzem.nom or perfil.magatzem.codi_magatzem)
                         if perfil and perfil.magatzem else None,
        'magatzem_codi': perfil.magatzem.codi_magatzem if perfil and perfil.magatzem else None,
    }


@transaction.atomic
def crear_usuari(username, password, first_name, last_name, nou_rol, magatzem_id, telefon=''):
    """Crea un User + Perfil en una transacció atòmica. Retorna l'usuari creat."""
    user = User.objects.create_user(
        username=username,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )
    perfil = user.perfil  # creat pel signal post_save
    perfil.rol = nou_rol
    perfil.telefon = telefon or ''
    if magatzem_id:
        from apps.inventari.models import Magatzem
        try:
            perfil.magatzem = Magatzem.objects.get(pk=magatzem_id)
        except Magatzem.DoesNotExist:
            pass
    perfil.save()
    return user


def actualitzar_usuari(user, data, rol_caller):
    """
    Actualitza els camps presents a data. Aixeca ValueError si el nou username ja existeix.
    Retorna l'usuari actualitzat.
    """
    if 'first_name' in data:
        user.first_name = data['first_name'].strip()
    if 'last_name' in data:
        user.last_name = data['last_name'].strip()
    if 'username' in data:
        nou_username = data['username'].strip()
        if nou_username != user.username and User.objects.filter(username=nou_username).exists():
            raise ValueError(f'El nom d\'usuari "{nou_username}" ja existeix.')
        user.username = nou_username
    user.save()

    perfil = user.perfil
    if 'rol' in data and rol_caller == 'admin':
        perfil.rol = data['rol']
    if 'telefon' in data:
        perfil.telefon = data['telefon'] or ''
    if 'magatzem' in data and rol_caller == 'admin':
        from apps.inventari.models import Magatzem
        mag_id = data['magatzem']
        perfil.magatzem = Magatzem.objects.get(pk=mag_id) if mag_id else None
    perfil.save()
    return user
