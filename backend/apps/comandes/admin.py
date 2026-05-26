from django.contrib import admin
from .models import Factura, Comanda, Paquet


@admin.register(Factura)
class FacturaAdmin(admin.ModelAdmin):
    list_display   = ['id_factura', 'client', 'import_total', 'data', 'num_comandes']
    list_filter    = ['data']
    search_fields  = ['id_factura', 'client__nif', 'client__nom']
    date_hierarchy = 'data'
    list_per_page  = 50

    def num_comandes(self, obj):
        return obj.comandes.count()
    num_comandes.short_description = 'Comandes'


@admin.register(Comanda)
class ComandaAdmin(admin.ModelAdmin):
    list_display  = ['id_comanda', 'client', 'data', 'metode_pagament', 'enviament', 'import_total', 'factura']
    list_filter   = ['metode_pagament', 'enviament', 'data']
    search_fields = ['id_comanda', 'client__nif', 'client__nom']
    date_hierarchy = 'data'
    list_per_page  = 50


@admin.register(Paquet)
class PaquetAdmin(admin.ModelAdmin):
    list_display  = ['id', 'comanda', 'producte', 'quantitat', 'preu']
    search_fields = ['comanda__id_comanda', 'producte__id_producte', 'producte__nom']
    list_per_page = 50
