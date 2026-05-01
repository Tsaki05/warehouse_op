from .base import *
from decouple import config

DEBUG = False
ALLOWED_HOSTS = config('DJANGO_ALLOWED_HOSTS', default='').split(',')

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
