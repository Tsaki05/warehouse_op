from django.contrib import admin
from .models import Client, Empresa, Individual


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display  = ['nif', 'nom', 'correu_electronic', 'tipus']
    search_fields = ['nif', 'nom', 'correu_electronic']
    list_per_page = 50

    def tipus(self, obj):
        if hasattr(obj, 'empresa'):    return '🏢 Empresa'
        if hasattr(obj, 'individual'): return '👤 Individual'
        return '—'
    tipus.short_description = 'Tipus'


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display  = ['client', 'adressa', 'enviament']
    list_filter   = ['enviament']
    search_fields = ['client__nif', 'client__nom', 'adressa']


@admin.register(Individual)
class IndividualAdmin(admin.ModelAdmin):
    list_display  = ['client', 'telefon']
    search_fields = ['client__nif', 'client__nom', 'telefon']
