"""
Smoke tests d'integració Back + Front.

Simulem les mateixes crides HTTP que fa el frontend React:
  - autenticació JWT (login, rebuig sense token)
  - endpoints principals autenticats
  - escoping per rol (superior veu 1 magatzem, admin veu tots)
  - filtre multi-magatzem (?magatzem_filter=CI001&magatzem_filter=CI002)
  - cerca en viu (?cerca=...)
  - filtre baix estoc
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


def get(path, token=None, expected=200, label=None):
    label = label or f'GET {path}'
    req = urllib.request.Request(f'{BASE}{path}')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req) as resp:
            code = resp.getcode()
            data = json.loads(resp.read())
            if code == expected:
                ok(f'{label} → {code}')
                return data
            fail(f'{label} → {code} (esperat {expected})')
            return None
    except urllib.error.HTTPError as e:
        if e.code == expected:
            ok(f'{label} → {e.code} (esperat)')
            return None
        fail(f'{label} → {e.code} (esperat {expected}): {e.read().decode()[:120]}')
        return None
    except Exception as e:
        fail(f'{label} → excepció: {e}')
        return None


def post(path, body, token=None, expected=200, label=None):
    label = label or f'POST {path}'
    data  = json.dumps(body).encode()
    req   = urllib.request.Request(
        f'{BASE}{path}', data=data,
        headers={'Content-Type': 'application/json'},
    )
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            ok(f'{label} → {resp.getcode()}')
            return result
    except urllib.error.HTTPError as e:
        if e.code == expected:
            ok(f'{label} → {e.code} (esperat)')
            return None
        fail(f'{label} → {e.code} (esperat {expected}): {e.read().decode()[:120]}')
        return None
    except Exception as e:
        fail(f'{label} → excepció: {e}')
        return None


# ══════════════════════════════════════════════════════════════════════
# 1. AUTENTICACIÓ
# ══════════════════════════════════════════════════════════════════════
print('\n[1] Autenticació JWT')

# Login correcte → retorna access + refresh
r = post('/auth/login/', {'username': 'ci_admin', 'password': 'CiAdmin1234!'},
         label='Login admin vàlid')
if not r or 'access' not in r or 'refresh' not in r:
    fail('Login no ha retornat access + refresh token')
    sys.exit(1)
admin_token = r['access']
ok(f'Token admin obtingut (primeres 20 car.): {admin_token[:20]}…')

# Login incorrecte → 401
post('/auth/login/', {'username': 'ci_admin', 'password': 'incorrecte'},
     expected=401, label='Login contrasenya errònia → 401')

# Login superior i mosso
r2 = post('/auth/login/', {'username': 'ci_superior', 'password': 'CiSup1234!'},
          label='Login superior')
sup_token  = r2['access'] if r2 else None

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
    items = mags.get('results', mags) if isinstance(mags, dict) else mags
    if len(items) >= 2:
        ok(f'Admin veu {len(items)} magatzems (esperat ≥ 2)')
    else:
        fail(f'Admin hauria de veure ≥ 2 magatzems, en veu {len(items)}')

prods = get('/inventari/productes/', token=admin_token, label='Productes (admin)')
if prods is not None:
    items = prods.get('results', prods) if isinstance(prods, dict) else prods
    if len(items) >= 2:
        ok(f'Admin veu {len(items)} productes')
        # Comprova shape del primer producte (el frontend espera aquests camps)
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
        items = r.get('results', r) if isinstance(r, dict) else r
        if len(items) == 1 and items[0]['codi_magatzem'] == 'CI001':
            ok('Superior veu exactament 1 magatzem (el seu: CI001)')
        else:
            fail(f'Superior hauria de veure 1 magatzem (CI001), en veu: {[m["codi_magatzem"] for m in items]}')

    r = get('/inventari/productes/', token=sup_token, label='Productes (superior)')
    if r is not None:
        items = r.get('results', r) if isinstance(r, dict) else r
        # mag1 té 2 productes (p1 i p2), mag2 té p1 → superior veu 2 (els del seu mag)
        if len(items) == 2:
            ok('Superior veu 2 productes (del seu magatzem)')
        else:
            fail(f'Superior hauria de veure 2 productes, en veu {len(items)}')

if mosso_token:
    r = get('/inventari/productes/', token=mosso_token, label='Productes (mosso)')
    if r is not None:
        items = r.get('results', r) if isinstance(r, dict) else r
        if len(items) == 2:
            ok('Mosso veu 2 productes (del seu magatzem)')
        else:
            fail(f'Mosso hauria de veure 2 productes, en veu {len(items)}')


# ══════════════════════════════════════════════════════════════════════
# 5. FILTRE MULTI-MAGATZEM (nova funcionalitat)
# ══════════════════════════════════════════════════════════════════════
print('\n[5] Filtre multi-magatzem (?magatzem_filter=...)')

# Filtre un sol magatzem
r = get('/inventari/productes/?magatzem_filter=CI001',
        token=admin_token, label='Productes ?magatzem_filter=CI001')
if r is not None:
    items = r.get('results', r) if isinstance(r, dict) else r
    if len(items) == 2:
        ok('Filtre CI001 retorna 2 productes (correcte)')
    else:
        fail(f'Filtre CI001 hauria de retornar 2 productes, en retorna {len(items)}')

# Filtre dos magatzems alhora (multi-select del frontend)
r = get('/inventari/productes/?magatzem_filter=CI001&magatzem_filter=CI002',
        token=admin_token, label='Productes ?magatzem_filter=CI001&CI002')
if r is not None:
    items = r.get('results', r) if isinstance(r, dict) else r
    if len(items) == 2:  # p1 i p2 (p1 és a ambdós, distinct evita duplicats)
        ok(f'Multi-filtre CI001+CI002 retorna {len(items)} productes (distinct correcte)')
    else:
        fail(f'Multi-filtre hauria de retornar 2 productes (distinct), en retorna {len(items)}')

# Filtre magatzems a ubicacions
r = get('/inventari/ubicacions/?magatzem_filter=CI002',
        token=admin_token, label='Ubicacions ?magatzem_filter=CI002')
if r is not None:
    items = r.get('results', r) if isinstance(r, dict) else r
    if len(items) == 1:
        ok('Filtre CI002 a ubicacions retorna 1 ubicació (correcte)')
    else:
        fail(f'Filtre CI002 hauria de retornar 1 ubicació, en retorna {len(items)}')


# ══════════════════════════════════════════════════════════════════════
# 6. CERCA EN VIU (?cerca=...)
# ══════════════════════════════════════════════════════════════════════
print('\n[6] Cerca en viu (?cerca=...)')

r = get('/inventari/productes/?cerca=CI+Normal',
        token=admin_token, label='Cerca "CI Normal"')
if r is not None:
    items = r.get('results', r) if isinstance(r, dict) else r
    if len(items) == 1:
        ok('Cerca "CI Normal" retorna 1 resultat')
    else:
        fail(f'Cerca "CI Normal" hauria de retornar 1 resultat, en retorna {len(items)}')

r = get('/inventari/productes/?baix_estoc=true',
        token=admin_token, label='Filtre baix estoc (<25 u.)')
if r is not None:
    items = r.get('results', r) if isinstance(r, dict) else r
    if len(items) == 1 and items[0]['id_producte'] == '000000000002':
        ok('Filtre baix estoc retorna 1 producte (estoc=5)')
    else:
        fail(f'Filtre baix estoc incorrecte: {[p.get("id_producte") for p in items]}')


# ══════════════════════════════════════════════════════════════════════
# 7. CORS (crític per al frontend al navegador)
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
    # Some CORS libs respond with 200 on OPTIONS, others with 204
    if e.code in (200, 204):
        ok(f'OPTIONS /auth/login/ → {e.code}')
    else:
        fail(f'OPTIONS CORS → {e.code}: {e.read().decode()[:80]}')
except Exception as e:
    fail(f'CORS OPTIONS request → excepció: {e}')


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
