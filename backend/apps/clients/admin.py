from django.contrib import admin
from .models import Client, Empresa, Individual

admin.site.register(Client)
admin.site.register(Empresa)
admin.site.register(Individual)
