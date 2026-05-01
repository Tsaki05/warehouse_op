from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/inventari/', include('apps.inventari.urls')),
    path('api/clients/', include('apps.clients.urls')),
    path('api/comandes/', include('apps.comandes.urls')),
]
