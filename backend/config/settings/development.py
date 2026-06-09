from .base import *

DEBUG = True
ALLOWED_HOSTS = ['*']
CORS_ALLOW_ALL_ORIGINS = False

INSTALLED_APPS += ['debug_toolbar']
MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']
INTERNAL_IPS = ['127.0.0.1', 'localhost']

# En development, si la BD no és accessible en arrencar (p.ex. sense VPN),
# no bloqueja el servidor — la comprovació de migracions es fa silenciosa.
from django.core.management.base import BaseCommand as _Cmd
_orig_check = _Cmd.check_migrations
def _safe_check(self):
    try:
        _orig_check(self)
    except Exception:
        self.stderr.write(self.style.WARNING(
            'Avís: no s\'ha pogut connectar a la BD.'
        ))
_Cmd.check_migrations = _safe_check

