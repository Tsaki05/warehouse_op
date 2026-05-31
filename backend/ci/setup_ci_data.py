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
from apps.inventari.models import Magatzem, Ubicacio, Treballador, Producte, Lot
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

# ── Perfils ────────────────────────────────────────────────────────────
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
              'preparat': False, 'enviament': False},
)
Paquet.objects.get_or_create(comanda=c_pnd, producte=p1,
                              defaults={'quantitat': 1, 'preu': Decimal('9.99')})

c_prp, _ = Comanda.objects.get_or_create(
    id_comanda='CIPRP',
    defaults={'client': client_ci, 'import_total': Decimal('49.99'),
              'preparat': True, 'enviament': True},
)
Paquet.objects.get_or_create(comanda=c_prp, producte=p2,
                              defaults={'quantitat': 1, 'preu': Decimal('49.99')})

c_fct, _ = Comanda.objects.get_or_create(
    id_comanda='CIFCT',
    defaults={'client': client_ci, 'import_total': Decimal('9.99'),
              'preparat': True, 'factura': factura_ci, 'enviament': False},
)
# Assegurem que CIFCT sempre té la factura (per si s'ha desassociat)
if c_fct.factura_id != factura_ci.pk:
    c_fct.factura = factura_ci
    c_fct.save(update_fields=['factura'])
Paquet.objects.get_or_create(comanda=c_fct, producte=p1,
                              defaults={'quantitat': 1, 'preu': Decimal('9.99')})

# CIIMK: sempre resetejada per provar marcar_preparat de forma idempotent
c_imk, _ = Comanda.objects.get_or_create(
    id_comanda='CIIMK',
    defaults={'client': client_ci, 'import_total': Decimal('9.99'),
              'preparat': False, 'factura': None, 'enviament': False},
)
Comanda.objects.filter(pk='CIIMK').update(preparat=False, factura=None)
Paquet.objects.get_or_create(comanda=c_imk, producte=p1,
                              defaults={'quantitat': 1, 'preu': Decimal('9.99')})

print('Setup CI: OK ✓')
print(f'  Admin:    ci_admin / CiAdmin1234!')
print(f'  Superior: ci_superior / CiSup1234!   (magatzem: {mag1.codi_magatzem})')
print(f'  Mosso:    ci_mosso / CiMosso1234!    (magatzem: {mag1.codi_magatzem})')
print(f'  Client CI: {client_ci.nif} / {client_ci.nom}')
print(f'  Comandes CI: CIPND (pendent), CIPRP (preparada), CIFCT (facturada), CIIMK (test marcar)')
print(f'  Lot p1/mag1: id={l_p1_m1.pk} quantitat=100 (resetejat)')
