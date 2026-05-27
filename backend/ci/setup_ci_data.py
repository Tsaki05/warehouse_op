"""
Dades mínimes per als smoke tests d'integració en CI.
S'executa un cop, sobre una BD neta (ja migrada).
Idempotent: es pot tornar a executar sense errors (get_or_create / update).
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
admin, _ = User.objects.get_or_create(username='ci_admin')
admin.set_password('CiAdmin1234!'); admin.save()

supu, _  = User.objects.get_or_create(username='ci_superior')
supu.set_password('CiSup1234!'); supu.save()

mosso, _ = User.objects.get_or_create(username='ci_mosso')
mosso.set_password('CiMosso1234!'); mosso.save()

# ── Magatzems (2 → permet provar scoping i multi-filtre) ──────────────
mag1, _ = Magatzem.objects.get_or_create(codi_magatzem='CI000001', defaults={'nom': 'Magatzem CI Alpha'})
mag2, _ = Magatzem.objects.get_or_create(codi_magatzem='CI000002', defaults={'nom': 'Magatzem CI Beta'})

# ── Perfils (el signal ja els crea; els actualitzem amb el rol correcte) ──
Perfil.objects.filter(user=admin).update(rol='admin',    magatzem=None)
Perfil.objects.filter(user=supu).update( rol='superior', magatzem=mag1)
Perfil.objects.filter(user=mosso).update(rol='mosso',    magatzem=mag1)

# ── Treballadors superiors (necessaris per crear lots) ─────────────────
sup1, _ = Treballador.objects.get_or_create(telefon='600000001', defaults={'nom': 'Sup Alpha', 'magatzem': mag1, 'superior': True})
sup2, _ = Treballador.objects.get_or_create(telefon='600000002', defaults={'nom': 'Sup Beta',  'magatzem': mag2, 'superior': True})

# ── Ubicacions ─────────────────────────────────────────────────────────
u1, _ = Ubicacio.objects.get_or_create(magatzem=mag1, passadis='A01', estant='B01', alcada='C01')
u2, _ = Ubicacio.objects.get_or_create(magatzem=mag1, passadis='A02', estant='B02', alcada='C02')
u3, _ = Ubicacio.objects.get_or_create(magatzem=mag2, passadis='A01', estant='B01', alcada='C01')

# ── Productes + lots ───────────────────────────────────────────────────
p1, _ = Producte.objects.get_or_create(
    id_producte='000000000001',
    defaults={'nom': 'Producte CI Normal', 'preu': Decimal('9.99'),
              'categoria': 'petit', 'estoc_total': 100, 'codi_proveidor': 'PROV01'},
)
p2, _ = Producte.objects.get_or_create(
    id_producte='000000000002',
    defaults={'nom': 'Producte CI Baix Estoc', 'preu': Decimal('49.99'),
              'categoria': 'gran', 'estoc_total': 5, 'codi_proveidor': 'PROV02'},
)

# p1 a mag1, p2 a mag1 (estoc baix), lot addicional de p1 a mag2
Lot.objects.get_or_create(producte=p1, ubicacio=u1, defaults={'superior': sup1, 'quantitat': 100})
Lot.objects.get_or_create(producte=p2, ubicacio=u2, defaults={'superior': sup1, 'quantitat': 5})
Lot.objects.get_or_create(producte=p1, ubicacio=u3, defaults={'superior': sup2, 'quantitat': 30})

print('Setup CI: OK ✓')
print(f'  Admin:    ci_admin / CiAdmin1234!')
print(f'  Superior: ci_superior / CiSup1234!   (magatzem: {mag1.codi_magatzem})')
print(f'  Mosso:    ci_mosso / CiMosso1234!   (magatzem: {mag1.codi_magatzem})')
