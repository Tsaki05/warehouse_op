from rest_framework.routers import DefaultRouter
from .views import MagatzemViewSet, UbicacioViewSet, TreballadorViewSet, ProducteViewSet, LotViewSet

router = DefaultRouter()
router.register('magatzems',    MagatzemViewSet)
router.register('ubicacions',   UbicacioViewSet)
router.register('treballadors', TreballadorViewSet)
router.register('productes',    ProducteViewSet)
router.register('lots',         LotViewSet)

urlpatterns = router.urls
