from django.contrib import admin
from django.urls import path, include
from django.conf import settings

urlpatterns = [
    path('api/', include('apps.inventari.urls')),
    path('admin/', admin.site.urls),
    path('api/inventari/', include('apps.inventari.urls')),
    path('api/clients/', include('apps.clients.urls')),
    path('api/comandes/', include('apps.comandes.urls')),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [
        path('__debug__/', include(debug_toolbar.urls)),
    ]