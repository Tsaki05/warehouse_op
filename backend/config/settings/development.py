from .base import *

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1', '192.168.1.26']

INSTALLED_APPS += ['debug_toolbar']
MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']
INTERNAL_IPS = ['127.0.0.1']
