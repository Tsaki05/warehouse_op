"""
Smoke tests d'integració Back + Front.

Simulem les mateixes crides HTTP que fa el frontend React:
  - autenticació JWT (login, rebuig sense token)
  - endpoints principals autenticats
  - escoping per rol (superior veu 1 magatzem, admin veu tots)
  - filtre multi-magatzem (?magatzem_filter=CI000001&magatzem_filter=CI000002)
  - cerca en viu (?cerca=...)
  - filtre baix estoc
  - filtre fase comandes (per_preparar / preparada / facturada, multi-select)
  - filtre categoria productes multi-select
  - dashboard: tots els valors basats en comandes facturades
  - marcar_preparat: deducció de lot + estoc insuficient
  - capçaleres CORS (clau perquè el navegador accepti les respostes)

S'executa amb: python backend/ci/integration_test.py
Retorna exit code 0 si tot és correcte, 1 si hi ha errors.
"""
import sys
import json
import urllib.request
import urllib.parse
import urllib.error

BASE   = 'http://localhost:8000/api'
PASSED = []
FAILED = []


def ok(msg):
    PASSED.append(msg)
    print(f'  \033[32m✓\033[0m {msg}')


def fail(msg):
    FAILED.append(msg)
    print(f'  \033[31m✗\033[0m {msg}')


def _request(method, path, body=None, token=None, expected=200, label=None):
    label = label or f'{method} {path}'
    data  = json.dumps(body).encode() if body is not None else None
    headers = {'Content-Type': 'application/json'} if data else {}
    req = urllib.request.Request(f'{BASE}{path}', data=data, headers=headers, method=method)
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req) as resp:
            code   = resp.getcode()
            result = json.loads(resp.read())
            if code == expected:
                ok(f'{label} → {code}')
                return result
            fail(f'{label} → {code} (esperat {expected})')
            return None
    except urllib.error.HTTPError as e:
        if e.code == expected:
            ok(f'{label} → {e.code} (esperat)')
            try:
                return json.loads(e.read())
            except Exception:
                return None
        fail(f'{label} → {e.code} (esperat {expected}): {e.read().decode()[:200]}')
        return None
    except Exception as e:
        fail(f'{label} → excepció: {e}')
        return None


def get(path, token=None, expected=200, label=None):
    return _request('GET', path, token=token, expected=expected, label=label)

def post(path, body, token=None, expected=200, label=None):
    return _request('POST', path, body=body, token=token, expected=expected, label=label)

def patch(path, body, token=None, expected=200, label=None):
    return _request('PATCH', path, body=body, token=token, expected=expected, label=label)


def items_of(data):
    """Extreu la llista d'objectes d'una resposta paginada o directa."""
    if isinstance(data, dict):
        return data.get('results', [])
    return data or []

def ids_of(data, field='id_comanda'):
    return {r[field] for r in items_of(data)}


# ══════════════════════════════════════════════════════════════════════
# 1. AUTENTICACIÓ
# ══════════════════════════════════════════════════════════════════════
print('\n[1] Autenticació JWT')

r = post('/auth/login/', {'username': 'ci_admin', 'password': 'CiAdmin1234!'},
         label='Login admin vàlid')
if not r or 'access' not in r or 'refresh' not in r:
    fail('Login no ha retornat access + refresh token')
    sys.exit(1)
admin_token = r['access']
ok(f'Token admin obtingut (primeres 20 car.): {admin_token[:20]}…')

post('/auth/login/', {'username': 'ci_admin', 'password': 'incorrecte'},
     expected=401, label='Login contrasenya errònia → 401')

r2 = post('/auth/login/', {'username': 'ci_superior', 'password': 'CiSup1234!'},
          label='Login superior')
sup_token = r2['access'] if r2 else None

r3 = post('/auth/login/', {'username': 'ci_mosso', 'password': 'CiMosso1234!'},
          label='Login mosso')
mosso_token = r3['access'] if r3 else None


# ══════════════════════════════════════════════════════════════════════
# 2. PROTECCIÓ JWT — sense token → 401
# ══════════════════════════════════════════════════════════════════════
print('\n[2] Endpoints protegits (sense token → 401)')
get('/inventari/productes/',  expected=401, label='Productes sense token')
get('/inventari/magatzems/',  expected=401, label='Magatzems sense token')
get('/comandes/comandes/',    expected=401, label='Comandes sense token')
get('/comandes/factures/',    expected=401, label='Factures sense token')
get('/clients/clients/',      expected=401, label='Clients sense token')


# ══════════════════════════════════════════════════════════════════════
# 3. ENDPOINTS AUTENTICATS (admin veu tot)
# ══════════════════════════════════════════════════════════════════════
print('\n[3] Endpoints autenticats — admin (sense filtre, veu tot)')
mags = get('/inventari/magatzems/', token=admin_token, label='Magatzems (admin)')
if mags is not None:
    items = items_of(mags)
    if len(items) >= 2:
        ok(f'Admin veu {len(items)} magatzems (esperat ≥ 2)')
    else:
        fail(f'Admin hauria de veure ≥ 2 magatzems, en veu {len(items)}')

prods = get('/inventari/productes/', token=admin_token, label='Productes (admin)')
if prods is not None:
    items = items_of(prods)
    if len(items) >= 2:
        ok(f'Admin veu {len(items)} productes')
        p = items[0]
        for field in ('id_producte', 'nom', 'preu', 'categoria', 'estoc_total', 'lots'):
            if field not in p:
                fail(f'Producte sense camp "{field}" (el frontend ho necessita)')
        ok('Shape producte correcte (id_producte, nom, preu, categoria, estoc_total, lots)')

get('/inventari/ubicacions/', token=admin_token, label='Ubicacions (admin)')
get('/comandes/comandes/',    token=admin_token, label='Comandes (admin)')
get('/comandes/factures/',    token=admin_token, label='Factures (admin)')
get('/clients/clients/',      token=admin_token, label='Clients (admin)')


# ══════════════════════════════════════════════════════════════════════
# 4. SCOPING PER ROL
# ══════════════════════════════════════════════════════════════════════
print('\n[4] Scoping per rol')

if sup_token:
    r = get('/inventari/magatzems/', token=sup_token, label='Magatzems (superior)')
    if r is not None:
        items = items_of(r)
        if len(items) == 1 and items[0]['codi_magatzem'] == 'CI000001':
            ok('Superior veu exactament 1 magatzem (el seu: CI000001)')
        else:
            fail(f'Superior hauria de veure 1 magatzem (CI000001), en veu: {[m["codi_magatzem"] for m in items]}')

    r = get('/inventari/productes/', token=sup_token, label='Productes (superior)')
    if r is not None:
        items = items_of(r)
        if len(items) >= 2:
            ok(f'Superior veu {len(items)} productes (del seu magatzem)')
        else:
            fail(f'Superior hauria de veure ≥ 2 productes, en veu {len(items)}')

if mosso_token:
    r = get('/inventari/productes/', token=mosso_token, label='Productes (mosso)')
    if r is not None:
        items = items_of(r)
        if len(items) >= 2:
            ok(f'Mosso veu {len(items)} productes (del seu magatzem)')
        else:
            fail(f'Mosso hauria de veure ≥ 2 productes, en veu {len(items)}')


# ══════════════════════════════════════════════════════════════════════
# 5. FILTRE MULTI-MAGATZEM
# ══════════════════════════════════════════════════════════════════════
print('\n[5] Filtre multi-magatzem (?magatzem_filter=...)')

r = get('/inventari/productes/?magatzem_filter=CI000001',
        token=admin_token, label='Productes ?magatzem_filter=CI000001')
if r is not None:
    items = items_of(r)
    if len(items) >= 2:
        ok(f'Filtre CI001 retorna {len(items)} productes (≥ 2, correcte)')
    else:
        fail(f'Filtre CI001 hauria de retornar ≥ 2 productes, en retorna {len(items)}')

r = get('/inventari/productes/?magatzem_filter=CI000001&magatzem_filter=CI000002',
        token=admin_token, label='Productes ?magatzem_filter=CI000001&CI002')
if r is not None:
    items = items_of(r)
    if len(items) >= 2:
        ok(f'Multi-filtre CI001+CI002 retorna {len(items)} productes (distinct correcte)')
    else:
        fail(f'Multi-filtre hauria de retornar ≥ 2 productes, en retorna {len(items)}')

r = get('/inventari/ubicacions/?magatzem_filter=CI000002',
        token=admin_token, label='Ubicacions ?magatzem_filter=CI000002')
if r is not None:
    items = items_of(r)
    if len(items) >= 1:
        ok(f'Filtre CI002 a ubicacions retorna {len(items)} ubicació/ns')
    else:
        fail(f'Filtre CI002 hauria de retornar ≥ 1 ubicació, en retorna {len(items)}')


# ══════════════════════════════════════════════════════════════════════
# 6. CERCA EN VIU
# ══════════════════════════════════════════════════════════════════════
print('\n[6] Cerca en viu (?cerca=...)')

r = get('/inventari/productes/?cerca=CI+Normal',
        token=admin_token, label='Cerca "CI Normal"')
if r is not None:
    items = items_of(r)
    if len(items) == 1:
        ok('Cerca "CI Normal" retorna 1 resultat')
    else:
        fail(f'Cerca "CI Normal" hauria de retornar 1 resultat, en retorna {len(items)}')

r = get('/inventari/productes/?baix_estoc=true',
        token=admin_token, label='Filtre baix estoc (<25 u.)')
if r is not None:
    items = items_of(r)
    ids   = [p.get('id_producte') for p in items]
    if '000000000002' in ids:
        ok(f'Filtre baix estoc correcte — {len(items)} producte(s), inclou CI (estoc=5)')
    else:
        fail(f'Filtre baix estoc no inclou p2 (estoc=5): {ids}')


# ══════════════════════════════════════════════════════════════════════
# 7. CORS
# ══════════════════════════════════════════════════════════════════════
print('\n[7] Capçaleres CORS')

class OptionsRequest(urllib.request.Request):
    def get_method(self):
        return 'OPTIONS'

req = OptionsRequest(
    f'{BASE}/auth/login/',
    headers={
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
    },
)
try:
    with urllib.request.urlopen(req) as resp:
        acao = resp.headers.get('Access-Control-Allow-Origin', '')
        acam = resp.headers.get('Access-Control-Allow-Methods', '')
        if acao:
            ok(f'CORS Access-Control-Allow-Origin: {acao}')
        else:
            fail('CORS: capçalera Access-Control-Allow-Origin absent')
        if acam:
            ok(f'CORS Access-Control-Allow-Methods: {acam}')
except urllib.error.HTTPError as e:
    if e.code in (200, 204):
        ok(f'OPTIONS /auth/login/ → {e.code}')
    else:
        fail(f'OPTIONS CORS → {e.code}: {e.read().decode()[:80]}')
except Exception as e:
    fail(f'CORS OPTIONS request → excepció: {e}')


# ══════════════════════════════════════════════════════════════════════
# 8. FILTRE FASE COMANDES (per_preparar / preparada / facturada)
# ══════════════════════════════════════════════════════════════════════
# Dades CI conegudes:
#   CIPND → per preparar (preparat=False, sense factura)
#   CIPRP → preparada    (preparat=True,  sense factura)
#   CIFCT → facturada    (preparat=True,  amb factura)
# Strategy: usem &cerca=<ID> per localitzar cada comanda CI concreta.
# ══════════════════════════════════════════════════════════════════════
print('\n[8] Filtre fase comandes (per_preparar / preparada / facturada)')

# 8a. sense_factura=true (backward compat — usat per Home.jsx)
r = get('/comandes/comandes/?sense_factura=true&cerca=CIFCT',
        token=admin_token, label='sense_factura=true exclou CIFCT (facturada)')
if r is not None:
    if ids_of(r) == set():
        ok('sense_factura=true no retorna CIFCT (correcte)')
    else:
        fail(f'sense_factura=true no hauria de retornar CIFCT, però retorna: {ids_of(r)}')

r = get('/comandes/comandes/?sense_factura=true&cerca=CIPND',
        token=admin_token, label='sense_factura=true inclou CIPND (pendent)')
if r is not None:
    if 'CIPND' in ids_of(r):
        ok('sense_factura=true retorna CIPND (correcte)')
    else:
        fail(f'sense_factura=true hauria de retornar CIPND, retorna: {ids_of(r)}')

# 8b. fase=per_preparar → CIPND ✓, CIPRP ✗, CIFCT ✗
r = get('/comandes/comandes/?fase=per_preparar&cerca=CIPND',
        token=admin_token, label='fase=per_preparar inclou CIPND')
if r is not None:
    if 'CIPND' in ids_of(r):
        ok('fase=per_preparar retorna CIPND (pendent sense factura)')
    else:
        fail(f'fase=per_preparar hauria de retornar CIPND, retorna: {ids_of(r)}')

r = get('/comandes/comandes/?fase=per_preparar&cerca=CIFCT',
        token=admin_token, label='fase=per_preparar exclou CIFCT (facturada)')
if r is not None:
    if 'CIFCT' not in ids_of(r):
        ok('fase=per_preparar no retorna CIFCT (correcte)')
    else:
        fail('fase=per_preparar no hauria de retornar CIFCT (és facturada)')

r = get('/comandes/comandes/?fase=per_preparar&cerca=CIPRP',
        token=admin_token, label='fase=per_preparar exclou CIPRP (preparada)')
if r is not None:
    if 'CIPRP' not in ids_of(r):
        ok('fase=per_preparar no retorna CIPRP (ja preparada, no pendent)')
    else:
        fail('fase=per_preparar no hauria de retornar CIPRP (preparat=True)')

# 8c. fase=preparada → CIPRP ✓, CIPND ✗, CIFCT ✗
r = get('/comandes/comandes/?fase=preparada&cerca=CIPRP',
        token=admin_token, label='fase=preparada inclou CIPRP')
if r is not None:
    if 'CIPRP' in ids_of(r):
        ok('fase=preparada retorna CIPRP (preparada sense factura)')
    else:
        fail(f'fase=preparada hauria de retornar CIPRP, retorna: {ids_of(r)}')

r = get('/comandes/comandes/?fase=preparada&cerca=CIPND',
        token=admin_token, label='fase=preparada exclou CIPND (no preparat)')
if r is not None:
    if 'CIPND' not in ids_of(r):
        ok('fase=preparada no retorna CIPND (no preparat, correcte)')
    else:
        fail('fase=preparada no hauria de retornar CIPND (preparat=False)')

r = get('/comandes/comandes/?fase=preparada&cerca=CIFCT',
        token=admin_token, label='fase=preparada exclou CIFCT (facturada)')
if r is not None:
    if 'CIFCT' not in ids_of(r):
        ok('fase=preparada no retorna CIFCT (té factura, correcte)')
    else:
        fail('fase=preparada no hauria de retornar CIFCT (ja facturada)')

# 8d. fase=facturada → CIFCT ✓, CIPND ✗, CIPRP ✗
r = get('/comandes/comandes/?fase=facturada&cerca=CIFCT',
        token=admin_token, label='fase=facturada inclou CIFCT')
if r is not None:
    if 'CIFCT' in ids_of(r):
        ok('fase=facturada retorna CIFCT (comanda facturada)')
    else:
        fail(f'fase=facturada hauria de retornar CIFCT, retorna: {ids_of(r)}')

r = get('/comandes/comandes/?fase=facturada&cerca=CIPND',
        token=admin_token, label='fase=facturada exclou CIPND (pendent)')
if r is not None:
    if 'CIPND' not in ids_of(r):
        ok('fase=facturada no retorna CIPND (sense factura, correcte)')
    else:
        fail('fase=facturada no hauria de retornar CIPND (no té factura)')

# 8e. Multi-select: fase=per_preparar&fase=preparada → CIPND ✓, CIPRP ✓, CIFCT ✗
r = get('/comandes/comandes/?fase=per_preparar&fase=preparada&cerca=CIPND',
        token=admin_token, label='fase=per_preparar+preparada inclou CIPND')
if r is not None:
    if 'CIPND' in ids_of(r):
        ok('Multi-fase per_preparar+preparada retorna CIPND')
    else:
        fail(f'Multi-fase hauria de retornar CIPND, retorna: {ids_of(r)}')

r = get('/comandes/comandes/?fase=per_preparar&fase=preparada&cerca=CIPRP',
        token=admin_token, label='fase=per_preparar+preparada inclou CIPRP')
if r is not None:
    if 'CIPRP' in ids_of(r):
        ok('Multi-fase per_preparar+preparada retorna CIPRP')
    else:
        fail(f'Multi-fase hauria de retornar CIPRP, retorna: {ids_of(r)}')

r = get('/comandes/comandes/?fase=per_preparar&fase=preparada&cerca=CIFCT',
        token=admin_token, label='fase=per_preparar+preparada exclou CIFCT (facturada)')
if r is not None:
    if 'CIFCT' not in ids_of(r):
        ok('Multi-fase per_preparar+preparada no retorna CIFCT (OR lògic correcte)')
    else:
        fail('Multi-fase per_preparar+preparada no hauria de retornar CIFCT')

# 8f. Multi-select: fase=preparada&fase=facturada → CIPRP ✓, CIFCT ✓, CIPND ✗
r = get('/comandes/comandes/?fase=preparada&fase=facturada&cerca=CIPND',
        token=admin_token, label='fase=preparada+facturada exclou CIPND (no preparat)')
if r is not None:
    if 'CIPND' not in ids_of(r):
        ok('Multi-fase preparada+facturada no retorna CIPND (correcte)')
    else:
        fail('Multi-fase preparada+facturada no hauria de retornar CIPND (preparat=False)')

# 8g. Filtre enviament — CIPRP té enviament=True, CIPND i CIFCT en=False
r = get('/comandes/comandes/?enviament=true&cerca=CIPRP',
        token=admin_token, label='enviament=true inclou CIPRP')
if r is not None:
    if 'CIPRP' in ids_of(r):
        ok('enviament=true retorna CIPRP (correcte)')
    else:
        fail(f'enviament=true hauria de retornar CIPRP, retorna: {ids_of(r)}')

r = get('/comandes/comandes/?enviament=false&cerca=CIPRP',
        token=admin_token, label='enviament=false exclou CIPRP')
if r is not None:
    if 'CIPRP' not in ids_of(r):
        ok('enviament=false no retorna CIPRP (correcte)')
    else:
        fail('enviament=false no hauria de retornar CIPRP (enviament=True)')


# ══════════════════════════════════════════════════════════════════════
# 9. FILTRE CATEGORIA PRODUCTES (multi-select)
# ══════════════════════════════════════════════════════════════════════
# Dades CI: p1=petit, p2=gran, p3=mitja (tots a CI000001)
# ══════════════════════════════════════════════════════════════════════
print('\n[9] Filtre categoria productes (multi-select)')

# 9a. categoria=petit → p1, no p2 ni p3
r = get('/inventari/productes/?magatzem_filter=CI000001&categoria=petit',
        token=admin_token, label='categoria=petit')
if r is not None:
    items = items_of(r)
    cats  = {p['categoria'] for p in items}
    ids   = {p['id_producte'] for p in items}
    if cats == {'petit'}:
        ok(f'categoria=petit retorna {len(items)} producte(s), tots "petit"')
    else:
        fail(f'categoria=petit hauria de retornar només "petit", retorna: {cats}')
    if '000000000001' in ids and '000000000002' not in ids:
        ok('categoria=petit inclou p1 i exclou p2 (gran)')
    else:
        fail(f'categoria=petit incorrecte: inclou {ids}')

# 9b. categoria=gran → p2, no p1 ni p3
r = get('/inventari/productes/?magatzem_filter=CI000001&categoria=gran',
        token=admin_token, label='categoria=gran')
if r is not None:
    items = items_of(r)
    cats  = {p['categoria'] for p in items}
    ids   = {p['id_producte'] for p in items}
    if cats == {'gran'}:
        ok(f'categoria=gran retorna {len(items)} producte(s), tots "gran"')
    else:
        fail(f'categoria=gran hauria de retornar només "gran", retorna: {cats}')
    if '000000000002' in ids and '000000000001' not in ids:
        ok('categoria=gran inclou p2 i exclou p1 (petit)')
    else:
        fail(f'categoria=gran incorrecte: inclou {ids}')

# 9c. Multi-select: categoria=petit&categoria=gran → p1 + p2, no p3 (mitja)
r = get('/inventari/productes/?magatzem_filter=CI000001&categoria=petit&categoria=gran',
        token=admin_token, label='categoria=petit+gran (multi-select)')
if r is not None:
    items = items_of(r)
    cats  = {p['categoria'] for p in items}
    ids   = {p['id_producte'] for p in items}
    if cats == {'petit', 'gran'} or cats <= {'petit', 'gran'}:
        ok(f'Multi-select petit+gran retorna {len(items)} productes, categories: {cats}')
    else:
        fail(f'Multi-select petit+gran hauria de retornar petit i/o gran, retorna: {cats}')
    if '000000000001' in ids and '000000000002' in ids:
        ok('Multi-select conté p1 (petit) i p2 (gran)')
    else:
        fail(f'Multi-select petit+gran hauria de contenir p1 i p2: {ids}')
    if '000000000003' not in ids:
        ok('Multi-select petit+gran exclou p3 (mitja)')
    else:
        fail('Multi-select petit+gran no hauria de retornar p3 (mitja)')

# 9d. Sense categoria → retorna tots (inclou p1, p2 i p3)
r = get('/inventari/productes/?magatzem_filter=CI000001',
        token=admin_token, label='Sense categoria → tots els productes CI')
if r is not None:
    items = items_of(r)
    ids   = {p['id_producte'] for p in items}
    ci_ids = {'000000000001', '000000000002', '000000000003'}
    if ci_ids <= ids:
        ok(f'Sense filtre retorna tots els CI (p1, p2, p3)')
    else:
        fail(f'Sense filtre hauria de retornar p1+p2+p3, falta: {ci_ids - ids}')


# ══════════════════════════════════════════════════════════════════════
# 10. DASHBOARD — valors basats en comandes facturades
# ══════════════════════════════════════════════════════════════════════
# El dashboard ha de comptar ONLY comandes amb factura.
# CIPND i CIPRP (sense factura) NO han d'aparèixer als stats monetaris.
# CIFCT (amb factura CIFAC, data=avui) HA d'aparèixer.
# ══════════════════════════════════════════════════════════════════════
print('\n[10] Dashboard — valors basats en comandes facturades')

# Comprovem shape del dashboard (admin sense filtre)
r = get('/comandes/comandes/dashboard/', token=admin_token,
        label='Dashboard sense filtre (admin)')
if r is not None:
    for key in ('facturacio_mes', 'top_clients', 'ranking_treballadors', 'resum'):
        if key not in r:
            fail(f'Dashboard sense camp "{key}"')
    if 'resum' in r:
        resum = r['resum']
        for k in ('facturacio_total_mes', 'n_comandes_mes', 'n_factures_mes',
                  'facturacio_total_any', 'n_factures_any'):
            if k not in resum:
                fail(f'resum sense camp "{k}"')
        ok('Shape dashboard correcte (facturacio_mes, top_clients, ranking, resum)')
        if isinstance(resum.get('n_comandes_mes'), int):
            ok(f'n_comandes_mes és enter: {resum["n_comandes_mes"]}')
        else:
            fail(f'n_comandes_mes hauria de ser enter, és: {resum.get("n_comandes_mes")}')

# Dashboard amb filtre CI000001 — CIFCT té p1 al mag1, ha de comptar
r_filt = get('/comandes/comandes/dashboard/?magatzem_filter=CI000001',
             token=admin_token, label='Dashboard ?magatzem_filter=CI000001')
if r_filt is not None:
    resum_filt = r_filt.get('resum', {})
    n = resum_filt.get('n_comandes_mes', -1)
    if n >= 1:
        ok(f'Dashboard CI000001: n_comandes_mes={n} (≥ 1, inclou CIFCT)')
    else:
        fail(f'Dashboard CI000001: n_comandes_mes={n} (hauria de ser ≥ 1 per CIFCT)')

    # La comanda CIPND (pendent, sense factura) NO ha d'inflar el compte
    # Si CIPND es comptés, n seria ≥ 2 però CIPND no té factura.
    # Verifiquem que n_comandes_mes < nombre total de comandes CI al mag.
    r_all = get('/comandes/comandes/?magatzem_filter=CI000001',
                token=admin_token, label='Total comandes CI000001 (totes fases)')
    if r_all is not None:
        total_all = r_all.get('count', len(items_of(r_all))) if isinstance(r_all, dict) else len(r_all)
        if n < total_all:
            ok(f'n_comandes_mes ({n}) < total comandes ({total_all}): les sense factura no es compten')
        else:
            fail(f'n_comandes_mes ({n}) ≥ total comandes ({total_all}): possible sobrecàlcul')

# ══════════════════════════════════════════════════════════════════════
# 11. MARCAR_PREPARAT — deducció de lot + estoc insuficient
# ══════════════════════════════════════════════════════════════════════
# CIIMK té 1 paquet de p1. Lot p1/mag1 té 100 unitats.
# ══════════════════════════════════════════════════════════════════════
print('\n[11] marcar_preparat — deducció de lot i estoc insuficient')

# Obtenim l'ID del lot de p1 a mag1
r_lots = get('/inventari/lots/?producte=000000000001&magatzem_filter=CI000001',
             token=admin_token, label='GET lot de p1 a CI000001')
lot_id = None
lot_qty_before = None
if r_lots is not None:
    lots = items_of(r_lots)
    if lots:
        lot_id = lots[0]['id']
        lot_qty_before = lots[0]['quantitat']
        ok(f'Lot p1/CI000001 trobat: id={lot_id}, quantitat={lot_qty_before}')
    else:
        fail('No s\'ha trobat cap lot per a p1 a CI000001')

if lot_id is not None:
    # 11a. Estoc insuficient → 400
    r_insuf = patch(
        '/comandes/comandes/CIIMK/preparar/',
        {'lots': [{'lot': lot_id, 'quantitat': 99999}]},
        token=admin_token,
        expected=400,
        label='marcar_preparat estoc insuficient → 400',
    )
    if r_insuf is not None and 'detail' in r_insuf:
        ok(f'Resposta 400 amb missatge: {r_insuf["detail"][:60]}')

    # 11b. Preparació correcta — dedueix 1 unitat
    r_prep = patch(
        '/comandes/comandes/CIIMK/preparar/',
        {'lots': [{'lot': lot_id, 'quantitat': 1}]},
        token=admin_token,
        expected=200,
        label='marcar_preparat correcte (1 unitat) → 200',
    )
    if r_prep is not None:
        if r_prep.get('preparat') is True:
            ok('Comanda CIIMK marcada com a preparada')
        else:
            fail(f'CIIMK hauria de tenir preparat=True, té: {r_prep.get("preparat")}')

    # 11c. Verificació: lot ha disminuït en 1
    r_lot_after = get(f'/inventari/lots/{lot_id}/',
                      token=admin_token, label=f'GET lot {lot_id} (post-preparació)')
    if r_lot_after is not None and lot_qty_before is not None:
        qty_after = r_lot_after.get('quantitat')
        if qty_after == lot_qty_before - 1:
            ok(f'Lot {lot_id}: quantitat {lot_qty_before} → {qty_after} (deducció correcta)')
        else:
            fail(f'Lot {lot_id}: esperava quantitat {lot_qty_before - 1}, té {qty_after}')

    # 11d. Doble preparació → 400 (ja preparada)
    patch(
        '/comandes/comandes/CIIMK/preparar/',
        {'lots': [{'lot': lot_id, 'quantitat': 1}]},
        token=admin_token,
        expected=400,
        label='marcar_preparat doble (ja preparada) → 400',
    )

# 11e. Lot invàlid → 400
patch(
    '/comandes/comandes/CIPND/preparar/',
    {'lots': [{'lot': 9999999, 'quantitat': 1}]},
    token=admin_token,
    expected=400,
    label='marcar_preparat lot inexistent → 400',
)

# 11f. Quantitat zero → 400
if lot_id is not None:
    patch(
        '/comandes/comandes/CIPND/preparar/',
        {'lots': [{'lot': lot_id, 'quantitat': 0}]},
        token=admin_token,
        expected=400,
        label='marcar_preparat quantitat=0 → 400',
    )


# ══════════════════════════════════════════════════════════════════════
# RESULTAT FINAL
# ══════════════════════════════════════════════════════════════════════
total = len(PASSED) + len(FAILED)
print(f'\n{"═"*60}')
print(f'Resultat: {len(PASSED)}/{total} tests passats')

if FAILED:
    print(f'\n\033[31mFALLATS ({len(FAILED)}):\033[0m')
    for msg in FAILED:
        print(f'  • {msg}')
    sys.exit(1)
else:
    print('\033[32mTots els smoke tests han passat! ✓\033[0m')
    sys.exit(0)
