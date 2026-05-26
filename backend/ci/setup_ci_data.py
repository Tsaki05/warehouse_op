"""
Dades mínimes per als smoke tests d'integració en CI.
S'executa un cop, sobre una BD neta (ja migrada).
"""
import os
import sys
import django

# Permet executar des de backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from decimal import Decimal
from django.contrib.auth.models import User
from apps.accounts.models import Perfil
from apps.inventari.models import Magatzem, Ubicacio, Treballador, Producte, Lot

# ── Usuaris ────────────────────────────────────────────────────────────
admin = User.objects.create_user('ci_admin',    password='CiAdmin1234!')
supu  = User.objects.create_user('ci_superior', password='CiSup1234!')
mosso = User.objects.create_user('ci_mosso',    password='CiMosso1234!')

# ── Magatzems (2 → permet provar scoping i multi-filtre) ──────────────
mag1 = Magatzem.objects.create(codi_magatzem='CI001', nom='Magatzem CI Alpha')
mag2 = Magatzem.objects.create(codi_magatzem='CI002', nom='Magatzem CI Beta')

# ── Perfils ────────────────────────────────────────────────────────────
Perfil.objects.create(user=admin, rol='admin')
Perfil.objects.create(user=supu,  rol='superior', magatzem=mag1)
Perfil.objects.create(user=mosso, rol='mosso',    magatzem=mag1)

# ── Treballadors superiors (necessaris per crear lots) ─────────────────
sup1 = Treballador.objects.create(nif='11111111A', nom='Sup Alpha', magatzem=mag1, superior=True)
sup2 = Treballador.objects.create(nif='22222222B', nom='Sup Beta',  magatzem=mag2, superior=True)

# ── Ubicacions ─────────────────────────────────────────────────────────
u1 = Ubicacio.objects.create(magatzem=mag1, passadis='A01', estant='B01', alcada='C01')
u2 = Ubicacio.objects.create(magatzem=mag1, passadis='A02', estant='B02', alcada='C02')
u3 = Ubicacio.objects.create(magatzem=mag2, passadis='A01', estant='B01', alcada='C01')

# ── Productes + lots ───────────────────────────────────────────────────
p1 = Producte.objects.create(
    id_producte='000000000001', nom='Producte CI Normal',
    preu=Decimal('9.99'),  categoria='petit', estoc_total=100, codi_proveidor='PROV01',
)
p2 = Producte.objects.create(
    id_producte='000000000002', nom='Producte CI Baix Estoc',
    preu=Decimal('49.99'), categoria='gran',  estoc_total=5,   codi_proveidor='PROV02',
)

# p1 a mag1, p2 a mag1 (estoc baix), lot addicional de p1 a mag2
Lot.objects.create(producte=p1, ubicacio=u1, superior=sup1, quantitat=100)
Lot.objects.create(producte=p2, ubicacio=u2, superior=sup1, quantitat=5)
Lot.objects.create(producte=p1, ubicacio=u3, superior=sup2, quantitat=30)

print('Setup CI: OK ✓')
print(f'  Admin:    ci_admin / CiAdmin1234!')
print(f'  Superior: ci_superior / CiSup1234!  (magatzem: {mag1.codi_magatzem})')
print(f'  Mosso:    ci_mosso / CiMosso1234!   (magatzem: {mag1.codi_magatzem})')
