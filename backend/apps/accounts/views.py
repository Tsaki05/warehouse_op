from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

from .permissions import IsAdminOrSuperior
from . import services as AccountService


# ── View helpers (capa HTTP, no van a services) ───────────────────────────────

def _caller_rol(request):
    return getattr(getattr(request.user, 'perfil', None), 'rol', None)

def _caller_magatzem(request):
    return getattr(getattr(request.user, 'perfil', None), 'magatzem_id', None)


# ── Auth views ────────────────────────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        from rest_framework_simplejwt.tokens import RefreshToken
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
            'user':    AccountService.user_to_dict(user),
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(AccountService.user_to_dict(request.user))


# ── User management views ─────────────────────────────────────────────────────

class UsuarisView(APIView):
    permission_classes = [IsAdminOrSuperior]

    def get(self, request):
        rol = _caller_rol(request)
        qs  = User.objects.select_related('perfil__magatzem').order_by('username')
        if rol == 'superior':
            qs = qs.filter(perfil__magatzem_id=_caller_magatzem(request))
        return Response([AccountService.user_to_dict(u) for u in qs])

    def post(self, request):
        rol_caller  = _caller_rol(request)
        data        = request.data
        username    = data.get('username', '').strip()
        password    = data.get('password', '')
        first_name  = data.get('first_name', '').strip()
        last_name   = data.get('last_name', '').strip()
        nou_rol     = data.get('rol', 'mosso')
        magatzem_id = data.get('magatzem') or None
        telefon     = data.get('telefon', '')

        if not username or not password:
            return Response({'detail': 'Cal usuari i contrasenya.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 8:
            return Response({'detail': 'La contrasenya ha de tenir mínim 8 caràcters.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({'detail': f'El nom d\'usuari "{username}" ja existeix.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if rol_caller == 'superior':
            if nou_rol != 'mosso':
                return Response({'detail': 'Un superior només pot crear usuaris amb rol mosso.'},
                                status=status.HTTP_403_FORBIDDEN)
            magatzem_id = _caller_magatzem(request)

        user = AccountService.crear_usuari(username, password, first_name, last_name,
                                           nou_rol, magatzem_id, telefon)
        return Response(AccountService.user_to_dict(user), status=status.HTTP_201_CREATED)


class UsuariDetailView(APIView):
    permission_classes = [IsAdminOrSuperior]

    def _get_user_or_403(self, request, user_id):
        try:
            user = User.objects.select_related('perfil__magatzem').get(pk=user_id)
        except User.DoesNotExist:
            return None, Response({'detail': 'Usuari no trobat.'}, status=status.HTTP_404_NOT_FOUND)

        if _caller_rol(request) == 'superior':
            target = getattr(user, 'perfil', None)
            if (getattr(target, 'rol', None) != 'mosso'
                    or getattr(target, 'magatzem_id', None) != _caller_magatzem(request)):
                return None, Response({'detail': 'No tens permís per gestionar aquest usuari.'},
                                      status=status.HTTP_403_FORBIDDEN)
        return user, None

    def get(self, request, user_id):
        user, err = self._get_user_or_403(request, user_id)
        if err: return err
        return Response(AccountService.user_to_dict(user))

    def patch(self, request, user_id):
        user, err = self._get_user_or_403(request, user_id)
        if err: return err
        try:
            user = AccountService.actualitzar_usuari(user, request.data, _caller_rol(request))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AccountService.user_to_dict(user))

    def delete(self, request, user_id):
        user, err = self._get_user_or_403(request, user_id)
        if err: return err
        if user.pk == request.user.pk:
            return Response({'detail': 'No pots eliminar el teu propi usuari.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CanviarPasswordView(APIView):
    permission_classes = [IsAdminOrSuperior]

    def post(self, request, user_id):
        try:
            user = User.objects.select_related('perfil').get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'Usuari no trobat.'}, status=status.HTTP_404_NOT_FOUND)

        if _caller_rol(request) == 'superior':
            target = getattr(user, 'perfil', None)
            if (getattr(target, 'rol', None) != 'mosso'
                    or getattr(target, 'magatzem_id', None) != _caller_magatzem(request)):
                return Response(
                    {'detail': 'No tens permís per canviar la contrasenya d\'aquest usuari.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        nova = request.data.get('password', '')
        if len(nova) < 8:
            return Response({'detail': 'La contrasenya ha de tenir mínim 8 caràcters.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.set_password(nova)
        user.save()
        return Response({'detail': 'Contrasenya actualitzada correctament.'})
