from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import transaction

from .models import Perfil
from .permissions import IsAdminOrSuperior


# ── helpers ──────────────────────────────────────────────────────────────────

def _user_data(user):
    perfil = getattr(user, 'perfil', None)
    return {
        'id':           user.id,
        'username':     user.username,
        'nom':          user.get_full_name() or user.username,
        'first_name':   user.first_name,
        'last_name':    user.last_name,
        'rol':          perfil.rol if perfil else 'mosso',
        'magatzem':     perfil.magatzem_id if perfil else None,
        'magatzem_nom': (perfil.magatzem.nom or perfil.magatzem.codi_magatzem)
                        if perfil and perfil.magatzem else None,
    }


def _caller_rol(request):
    return getattr(getattr(request.user, 'perfil', None), 'rol', None)

def _caller_magatzem(request):
    return getattr(getattr(request.user, 'perfil', None), 'magatzem_id', None)


# ── Auth views ────────────────────────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')
        if not username or not password:
            return Response({'detail': 'Cal introduir usuari i contrasenya.'},
                            status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({'detail': 'Usuari o contrasenya incorrectes.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        return Response({
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
            'user':    _user_data(user),
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_user_data(request.user))


# ── User management views ─────────────────────────────────────────────────────

class UsuarisView(APIView):
    """List all users (scoped) + create a new user."""
    permission_classes = [IsAdminOrSuperior]

    def get(self, request):
        rol = _caller_rol(request)
        qs  = User.objects.select_related('perfil__magatzem').order_by('username')

        if rol == 'superior':
            # only users in same magatzem
            magatzem_id = _caller_magatzem(request)
            qs = qs.filter(perfil__magatzem_id=magatzem_id)

        return Response([_user_data(u) for u in qs])

    def post(self, request):
        rol_caller = _caller_rol(request)
        data = request.data

        username   = data.get('username', '').strip()
        password   = data.get('password', '')
        first_name = data.get('first_name', '').strip()
        last_name  = data.get('last_name', '').strip()
        nou_rol    = data.get('rol', 'mosso')
        magatzem_id = data.get('magatzem') or None

        # validations
        if not username or not password:
            return Response({'detail': 'Cal usuari i contrasenya.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 8:
            return Response({'detail': 'La contrasenya ha de tenir mínim 8 caràcters.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({'detail': f'El nom d\'usuari "{username}" ja existeix.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # superiors can only create mossos in their own magatzem
        if rol_caller == 'superior':
            if nou_rol != 'mosso':
                return Response({'detail': 'Un superior només pot crear usuaris amb rol mosso.'},
                                status=status.HTTP_403_FORBIDDEN)
            magatzem_id = _caller_magatzem(request)

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                password=password,
                first_name=first_name,
                last_name=last_name,
            )
            perfil = user.perfil  # created by signal
            perfil.rol = nou_rol
            if magatzem_id:
                from apps.inventari.models import Magatzem
                try:
                    perfil.magatzem = Magatzem.objects.get(pk=magatzem_id)
                except Magatzem.DoesNotExist:
                    pass
            perfil.save()

        return Response(_user_data(user), status=status.HTTP_201_CREATED)


class UsuariDetailView(APIView):
    """Retrieve, update or delete a single user."""
    permission_classes = [IsAdminOrSuperior]

    def _get_user_or_403(self, request, user_id):
        """Return (user, error_response). Also enforces scope for superiors."""
        try:
            user = User.objects.select_related('perfil__magatzem').get(pk=user_id)
        except User.DoesNotExist:
            return None, Response({'detail': 'Usuari no trobat.'}, status=status.HTTP_404_NOT_FOUND)

        rol_caller = _caller_rol(request)
        if rol_caller == 'superior':
            # can only touch mossos in their own magatzem
            target_perfil = getattr(user, 'perfil', None)
            if (getattr(target_perfil, 'rol', None) != 'mosso'
                    or getattr(target_perfil, 'magatzem_id', None) != _caller_magatzem(request)):
                return None, Response({'detail': 'No tens permís per gestionar aquest usuari.'},
                                      status=status.HTTP_403_FORBIDDEN)
        return user, None

    def get(self, request, user_id):
        user, err = self._get_user_or_403(request, user_id)
        if err: return err
        return Response(_user_data(user))

    def patch(self, request, user_id):
        user, err = self._get_user_or_403(request, user_id)
        if err: return err

        rol_caller = _caller_rol(request)
        data = request.data

        if 'first_name' in data:
            user.first_name = data['first_name'].strip()
        if 'last_name' in data:
            user.last_name = data['last_name'].strip()
        if 'username' in data:
            nou_username = data['username'].strip()
            if nou_username != user.username and User.objects.filter(username=nou_username).exists():
                return Response({'detail': f'El nom d\'usuari "{nou_username}" ja existeix.'},
                                status=status.HTTP_400_BAD_REQUEST)
            user.username = nou_username

        user.save()

        perfil = user.perfil
        if 'rol' in data and rol_caller == 'admin':
            perfil.rol = data['rol']
        if 'magatzem' in data and rol_caller == 'admin':
            from apps.inventari.models import Magatzem
            mag_id = data['magatzem']
            perfil.magatzem = Magatzem.objects.get(pk=mag_id) if mag_id else None
        perfil.save()

        return Response(_user_data(user))

    def delete(self, request, user_id):
        user, err = self._get_user_or_403(request, user_id)
        if err: return err
        # prevent self-deletion
        if user.pk == request.user.pk:
            return Response({'detail': 'No pots eliminar el teu propi usuari.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CanviarPasswordView(APIView):
    """Change password for a user (admin: any user; superior: only their mossos)."""
    permission_classes = [IsAdminOrSuperior]

    def post(self, request, user_id):
        try:
            user = User.objects.select_related('perfil').get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'Usuari no trobat.'}, status=status.HTTP_404_NOT_FOUND)

        rol_caller = _caller_rol(request)
        if rol_caller == 'superior':
            target_perfil = getattr(user, 'perfil', None)
            if (getattr(target_perfil, 'rol', None) != 'mosso'
                    or getattr(target_perfil, 'magatzem_id', None) != _caller_magatzem(request)):
                return Response({'detail': 'No tens permís per canviar la contrasenya d\'aquest usuari.'},
                                status=status.HTTP_403_FORBIDDEN)

        nova = request.data.get('password', '')
        if len(nova) < 8:
            return Response({'detail': 'La contrasenya ha de tenir mínim 8 caràcters.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.set_password(nova)
        user.save()
        return Response({'detail': 'Contrasenya actualitzada correctament.'})
