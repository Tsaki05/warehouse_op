from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and hasattr(request.user, 'perfil')
                    and request.user.perfil.rol == 'admin')


class IsAdminOrSuperior(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', None)
        return rol in ('admin', 'superior')
