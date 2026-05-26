from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import Perfil


class PerfilInline(admin.StackedInline):
    model = Perfil
    can_delete = False
    verbose_name_plural = 'Perfil'
    fields = ['rol', 'magatzem']


class UserAdmin(BaseUserAdmin):
    inlines = [PerfilInline]
    list_display  = ['username', 'get_full_name', 'email', 'get_rol', 'get_magatzem', 'is_staff']
    list_filter   = BaseUserAdmin.list_filter + ('perfil__rol', 'perfil__magatzem')

    @admin.display(description='Rol')
    def get_rol(self, obj):
        return obj.perfil.get_rol_display() if hasattr(obj, 'perfil') else '—'

    @admin.display(description='Magatzem')
    def get_magatzem(self, obj):
        if hasattr(obj, 'perfil') and obj.perfil.magatzem:
            return obj.perfil.magatzem.nom or obj.perfil.magatzem.codi_magatzem
        return '—'


admin.site.unregister(User)
admin.site.register(User, UserAdmin)
