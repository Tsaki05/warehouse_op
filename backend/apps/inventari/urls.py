from rest_framework.routers import DefaultRouter
from .views import MagatzemViewSet, UbicacioViewSet, ProducteViewSet, LotViewSet

router = DefaultRouter()
router.register('magatzems',  MagatzemViewSet,  basename='magatzem')
router.register('ubicacions', UbicacioViewSet,  basename='ubicacio')
router.register('productes',  ProducteViewSet,  basename='producte')
router.register('lots',       LotViewSet,       basename='lot')

urlpatterns = router.urls
