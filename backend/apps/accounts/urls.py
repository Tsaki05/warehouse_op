from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import LoginView, MeView, UsuarisView, UsuariDetailView, CanviarPasswordView

urlpatterns = [
    path('login/',   LoginView.as_view(),    name='auth-login'),
    path('refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('me/',      MeView.as_view(),       name='auth-me'),

    path('usuaris/',                           UsuarisView.as_view(),       name='auth-usuaris'),
    path('usuaris/<int:user_id>/',             UsuariDetailView.as_view(),  name='auth-usuari-detail'),
    path('usuaris/<int:user_id>/password/',    CanviarPasswordView.as_view(), name='auth-usuari-password'),
]
