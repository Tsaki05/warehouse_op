from rest_framework.routers import DefaultRouter
from .views import FacturaViewSet, ComandaViewSet, PaquetViewSet

router = DefaultRouter()
router.register('factures', FacturaViewSet)
router.register('comandes', ComandaViewSet)
router.register('paquets',  PaquetViewSet)

urlpatterns = router.urls
