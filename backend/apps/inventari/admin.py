from django.contrib import admin
from .models import Magatzem, Ubicacio, Producte, Lot


@admin.register(Magatzem)
class MagatzemAdmin(admin.ModelAdmin):
    list_display  = ['codi_magatzem', 'nom', 'num_ubicacions']
    search_fields = ['codi_magatzem', 'nom']

    def num_ubicacions(self, obj):
        return obj.ubicacions.count()
    num_ubicacions.short_description = 'Ubicacions'


@admin.register(Ubicacio)
class UbicacioAdmin(admin.ModelAdmin):
    list_display  = ['id_ubicacio', 'magatzem', 'passadis', 'estant', 'alcada']
    list_filter   = ['magatzem']
    search_fields = ['magatzem__codi_magatzem', 'passadis', 'estant', 'alcada']


@admin.register(Producte)
class ProducteAdmin(admin.ModelAdmin):
    list_display   = ['id_producte', 'nom', 'categoria', 'preu', 'estoc_total', 'codi_proveidor']
    list_filter    = ['categoria']
    search_fields  = ['id_producte', 'nom', 'codi_proveidor']
    list_per_page  = 50


@admin.register(Lot)
class LotAdmin(admin.ModelAdmin):
    list_display  = ['id', 'producte', 'ubicacio', 'quantitat', 'superior', 'data_entrada']
    list_filter   = ['ubicacio__magatzem', 'data_entrada']
    search_fields = ['producte__id_producte', 'producte__nom']
    date_hierarchy = 'data_entrada'
