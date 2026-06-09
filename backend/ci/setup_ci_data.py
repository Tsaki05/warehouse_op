"""
Dades mínimes per als smoke tests d'integració en CI.
S'executa un cop, sobre una BD neta (ja migrada).
Idempotent: es pot tornar a executar sense errors (get_or_create / update).
"""
import os
import sys
import django
from decimal import Decimal
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from django.contrib.auth.models import User
from apps.accounts.models import Perfil
from apps.inventari.models import Magatzem, Ubicacio, Producte, Lot
from apps.clients.models import Client, Individual
from apps.comandes.models import Comanda, Paquet, Factura

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

# ── Superior per a mag2 (necessari per als lots de CI000002) ──────────
supu2, _ = User.objects.get_or_create(username='ci_superior2')
supu2.set_password('CiSup2_1234!'); supu2.save()

# ── Perfils ────────────────────────────────────────────────────────────
Perfil.objects.filter(user=admin).update( rol='admin',    magatzem=None,  telefon='')
Perfil.objects.filter(user=supu).update(  rol='superior', magatzem=mag1,  telefon='600000001')
Perfil.objects.filter(user=mosso).update( rol='mosso',    magatzem=mag1,  telefon='')
Perfil.objects.filter(user=supu2).update( rol='superior', magatzem=mag2,  telefon='600000002')

sup1 = Perfil.objects.get(user=supu)
sup2 = Perfil.objects.get(user=supu2)

# ── Ubicacions ─────────────────────────────────────────────────────────
u1, _ = Ubicacio.objects.get_or_create(magatzem=mag1, passadis='A01', estant='B01', alcada='C01')
u2, _ = Ubicacio.objects.get_or_create(magatzem=mag1, passadis='A02', estant='B02', alcada='C02')
u3, _ = Ubicacio.objects.get_or_create(magatzem=mag2, passadis='A01', estant='B01', alcada='C01')

# ── Productes + lots ───────────────────────────────────────────────────
# p1: categoria petit  (mag1 + mag2)
# p2: categoria gran, estoc baix (mag1)
# p3: categoria mitja  (mag1) — per provar multi-select categoria
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
p3, _ = Producte.objects.get_or_create(
    id_producte='000000000003',
    defaults={'nom': 'Producte CI Mitja', 'preu': Decimal('19.99'),
              'categoria': 'mitja', 'estoc_total': 50, 'codi_proveidor': 'PROV03'},
)

# Lots: p1 a mag1 (100u), p2 a mag1 (5u, estoc baix), p3 a mag1 (50u), p1 a mag2 (30u)
l_p1_m1, _ = Lot.objects.get_or_create(producte=p1, ubicacio=u1, defaults={'superior': sup1, 'quantitat': 100})
l_p2_m1, _ = Lot.objects.get_or_create(producte=p2, ubicacio=u2, defaults={'superior': sup1, 'quantitat': 5})
l_p3_m1, _ = Lot.objects.get_or_create(producte=p3, ubicacio=u1, defaults={'superior': sup1, 'quantitat': 50})
Lot.objects.get_or_create(producte=p1, ubicacio=u3, defaults={'superior': sup2, 'quantitat': 30})

# Reset lots per idempotència (cada execució torna a l'estat inicial)
Lot.objects.filter(pk=l_p1_m1.pk).update(quantitat=100)
Lot.objects.filter(pk=l_p2_m1.pk).update(quantitat=5)

# ── Client CI ──────────────────────────────────────────────────────────
client_ci, _ = Client.objects.get_or_create(
    nif='CI1234567',
    defaults={'nom': 'Client CI Test', 'correu_electronic': 'ci@test.cat'},
)
Individual.objects.get_or_create(client=client_ci, defaults={'telefon': '600000099'})

# ── Factura CI ─────────────────────────────────────────────────────────
# Data avui → entra dins dels filtres de 30 dies i 365 dies del dashboard
factura_ci, _ = Factura.objects.get_or_create(
    id_factura='CIFAC',
    defaults={'client': client_ci, 'import_total': Decimal('9.99'), 'data': date.today()},
)

# ── Comandes CI (les 4 fases del cicle de vida) ────────────────────────
#
#  CIPND → per preparar  (preparat=False, sense factura)
#  CIPRP → preparada     (preparat=True,  sense factura, enviament=True)
#  CIFCT → facturada     (preparat=True,  amb factura)
#  CIIMK → per provar marcar_preparat (sempre es reseteja a per preparar)

c_pnd, _ = Comanda.objects.get_or_create(
    id_comanda='CIPND',
    defaults={'client': client_ci, 'import_total': Decimal('9.99'),
              'preparat': False, 'enviament': False, 'magatzem': mag1},
)
Paquet.objects.get_or_create(comanda=c_pnd, producte=p1,
                              defaults={'quantitat': 1, 'preu': Decimal('9.99')})

c_prp, _ = Comanda.objects.get_or_create(
    id_comanda='CIPRP',
    defaults={'client': client_ci, 'import_total': Decimal('49.99'),
              'preparat': True, 'enviament': True, 'magatzem': mag1},
)
Paquet.objects.get_or_create(comanda=c_prp, producte=p2,
                              defaults={'quantitat': 1, 'preu': Decimal('49.99')})

c_fct, _ = Comanda.objects.get_or_create(
    id_comanda='CIFCT',
    defaults={'client': client_ci, 'import_total': Decimal('9.99'),
              'preparat': True, 'factura': factura_ci, 'enviament': False, 'magatzem': mag1},
)
# Assegurem que CIFCT sempre té la factura i el magatzem correcte
needs_save = []
if c_fct.factura_id != factura_ci.pk:
    c_fct.factura = factura_ci
    needs_save.append('factura')
if c_fct.magatzem_id != mag1.pk:
    c_fct.magatzem = mag1
    needs_save.append('magatzem')
if needs_save:
    c_fct.save(update_fields=needs_save)
Paquet.objects.get_or_create(comanda=c_fct, producte=p1,
                              defaults={'quantitat': 1, 'preu': Decimal('9.99')})

# CIIMK: sempre resetejada per provar marcar_preparat de forma idempotent
c_imk, _ = Comanda.objects.get_or_create(
    id_comanda='CIIMK',
    defaults={'client': client_ci, 'import_total': Decimal('9.99'),
              'preparat': False, 'factura': None, 'enviament': False, 'magatzem': mag1},
)
Comanda.objects.filter(pk='CIIMK').update(preparat=False, factura=None, magatzem=mag1)
Paquet.objects.get_or_create(comanda=c_imk, producte=p1,
                              defaults={'quantitat': 1, 'preu': Decimal('9.99')})

print('Setup CI: OK ✓')
print(f'  Admin:      ci_admin / CiAdmin1234!')
print(f'  Superior1:  ci_superior / CiSup1234!    (magatzem: {mag1.codi_magatzem})')
print(f'  Superior2:  ci_superior2 / CiSup2_1234! (magatzem: {mag2.codi_magatzem})')
print(f'  Mosso:      ci_mosso / CiMosso1234!     (magatzem: {mag1.codi_magatzem})')
print(f'  Client CI:  {client_ci.nif} / {client_ci.nom}')
print(f'  Comandes CI: CIPND (pendent), CIPRP (preparada), CIFCT (facturada), CIIMK (test marcar)')
print(f'  Lot p1/mag1: id={l_p1_m1.pk} quantitat=100 (resetejat)')
