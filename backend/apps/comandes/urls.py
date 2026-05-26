from rest_framework.routers import DefaultRouter
from .views import FacturaViewSet, ComandaViewSet, PaquetViewSet

router = DefaultRouter()
router.register('factures', FacturaViewSet, basename='factura')
router.register('comandes', ComandaViewSet, basename='comanda')
router.register('paquets',  PaquetViewSet)

urlpatterns = router.urls
