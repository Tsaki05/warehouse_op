# Magatzem — Sistema de Gestió de Magatzems

Aplicació web per gestionar magatzems d'una empresa de venda a l'engròs. Permet controlar productes, estoc, lots, ubicacions, comandes, facturació i clients.

## Tecnologies

| Capa | Tecnologia |
|---|---|
| Backend | Django 4.2 + Django REST Framework |
| Autenticació | JWT (djangorestframework-simplejwt) |
| Base de dades | PostgreSQL 15 (schema `practica` a ubiwan.epsevg.upc.edu) |
| Frontend | React 18 + Vite + React Router |
| HTTP client | Axios |
| CI | GitHub Actions (3 jobs: backend · frontend · integració) |
| Contenidors | Docker + Docker Compose |

## Estructura del projecte

```
warehouse_op/
├── .github/
│   ├── workflows/
│   │   └── ci.yml              # 3 jobs: backend-tests, frontend-tests, integration
│   └── PULL_REQUEST_TEMPLATE.md
├── backend/
│   ├── apps/
│   │   ├── accounts/           # Usuaris, perfils (admin/superior/mosso), permisos
│   │   ├── inventari/          # Magatzems, ubicacions, treballadors, productes, lots
│   │   ├── clients/            # Clients (empresa/individual), ClientMagatzem
│   │   └── comandes/           # Comandes, paquets, factures
│   ├── ci/
│   │   ├── setup_ci_data.py    # Seed mínim per als smoke tests de CI
│   │   └── integration_test.py # Smoke tests HTTP (auth, scoping, CORS, filtres)
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py         # Configuració compartida (CORS, JWT, apps)
│   │   │   ├── development.py  # DEBUG=True, ALLOWED_HOSTS locals
│   │   │   └── production.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── seed/
│   │   └── seed.py             # Genera dades fictícies amb Faker
│   ├── requirements/
│   │   ├── base.txt
│   │   ├── development.txt
│   │   └── production.txt
│   ├── Dockerfile
│   └── manage.py
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── api.js          # Axios + paramsSerializer per a arrays + refresh JWT
│   │   ├── components/
│   │   │   ├── MagatzemAutocomplete.jsx  # Autocomplete single/multi magatzem
│   │   │   └── PasswordInput.jsx
│   │   ├── contexts/
│   │   │   ├── AuthContext.jsx  # JWT, rol, user global
│   │   │   └── FilterContext.jsx # Filtre global de magatzem (array, [] = tots)
│   │   ├── hooks/
│   │   │   └── useDebounce.js
│   │   ├── pages/
│   │   │   ├── Home.jsx              # Dashboard amb estadístiques
│   │   │   ├── Login.jsx
│   │   │   ├── Productes.jsx         # CRUD productes + lots
│   │   │   ├── MagatzemsUbicacions.jsx # Gestió d'ubicacions per magatzem
│   │   │   ├── PrepararComandes.jsx  # Llista i gestió de comandes
│   │   │   ├── Facturacio.jsx        # Factures + clients amb stats lazy
│   │   │   ├── EstocMagatzems.jsx    # Vista d'estoc per magatzem
│   │   │   ├── UbicacioProductes.jsx # Productes per ubicació
│   │   │   └── GestioUsuaris.jsx     # CRUD usuaris (admin)
│   │   ├── App.jsx             # Router, layout, sidebar amb filtre de magatzem
│   │   ├── App.css
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
├── docs/
│   └── setup.md                # Guia de configuració detallada
├── .env.example
├── .env.local.example          # Variables del frontend (VITE_API_URL)
├── docker-compose.yml
└── Makefile
```

## Model de dades

```
Magatzem ──< Ubicacio ──< Lot >── Producte
    │
    └──< Treballador
    │
    └──< ClientMagatzem >── Client ──< Empresa
                                  └──< Individual
                                  └──< Comanda >── Paquet >── Producte
                                            └── Factura
```

**`ClientMagatzem`** — taula intermèdia explícita entre Client i Magatzem:
- `data_alta`: des de quan és client d'aquell magatzem
- `n_comandes`: calculat en temps real (comandes del client amb lots en aquell magatzem)
- `import_total`: calculat en temps real (suma d'imports de les comandes)

## Rols i permisos

| Rol | Accés |
|---|---|
| `admin` | Tots els magatzems; pot filtrar per un o més; pot crear/editar/eliminar |
| `superior` | Només el seu magatzem; pot crear/editar ubicacions i lots |
| `mosso` | Només el seu magatzem; accés de lectura |

## Posada en marxa (desenvolupament local)

### Prerequisits
- Python 3.11+ i `venv`
- Node.js 20+
- Accés a la BD de la UPC (VPN si estàs fora del campus) o PostgreSQL local

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements/development.txt

cp ../.env.example ../.env
# Edita .env amb les teves credencials

python manage.py migrate
python manage.py shell -c "from seed.seed import seed; seed()"
python manage.py runserver 0.0.0.0:8000
```

### Frontend

```bash
cd frontend
npm install

# Opcional: si vols accedir des d'un altre dispositiu a la mateixa xarxa
echo "VITE_API_URL=http://<la-teva-ip>:8000/api" > .env.local

npm run dev -- --host
```

L'aplicació estarà disponible a `http://localhost:5173`.

### Credencials de prova (seed)

Després del seed, pots crear un superusuari i un perfil:

```bash
python manage.py createsuperuser
python manage.py shell -c "
from django.contrib.auth.models import User
from apps.accounts.models import Perfil
u = User.objects.get(username='el-teu-user')
Perfil.objects.create(user=u, rol='admin')
"
```

## CI — GitHub Actions

El pipeline té **3 jobs** que s'executen en ordre:

```
backend-tests ──┐
                ├──> integration
frontend-tests ─┘
```

| Job | Què fa |
|---|---|
| `backend-tests` | Tests unitaris de Django amb PostgreSQL real |
| `frontend-tests` | `npm run lint` + `npm run build` |
| `integration` | Aixeca Django + fa el build del frontend + executa `integration_test.py` |

Els **smoke tests d'integració** (`backend/ci/integration_test.py`) cobreixen:
- Autenticació JWT (login vàlid, credencials errònies → 401)
- Protecció de tots els endpoints sense token (→ 401)
- Endpoints autenticats amb admin (shape de les dades)
- Scoping per rol (superior veu 1 magatzem, admin veu tots)
- Filtre multi-magatzem (`?magatzem_filter=A&magatzem_filter=B`)
- Cerca en viu i filtre de baix estoc
- Capçaleres CORS (preflight OPTIONS)

## API REST — Referència ràpida

L'API és accessible a `http://localhost:8000/api/`. Tots els endpoints (excepte `/auth/login/`) requereixen `Authorization: Bearer <token>`.

### Autenticació
| Mètode | URL | Descripció |
|---|---|---|
| POST | `/api/auth/login/` | Retorna `access` + `refresh` tokens |
| POST | `/api/auth/refresh/` | Renova el token d'accés |

### Inventari
| Mètode | URL | Paràmetres destacats |
|---|---|---|
| GET | `/api/inventari/magatzems/` | `magatzem_filter` (multi) |
| GET/POST/DELETE | `/api/inventari/ubicacions/` | `magatzem`, `magatzem_filter`, `cerca` |
| GET | `/api/inventari/treballadors/` | `magatzem_filter` |
| GET/POST | `/api/inventari/productes/` | `magatzem_filter`, `cerca`, `categoria`, `baix_estoc`, `ordre` |
| GET/POST/DELETE | `/api/inventari/lots/` | `producte`, `magatzem_filter` |

### Clients
| Mètode | URL | Paràmetres destacats |
|---|---|---|
| GET | `/api/clients/clients/` | `cerca`, `tipus`, `magatzem_filter` (llistat lleuger, sense stats) |
| GET | `/api/clients/clients/{nif}/` | Detall complet amb `n_comandes` i `import_total` per magatzem |

### Comandes i factures
| Mètode | URL | Paràmetres destacats |
|---|---|---|
| GET | `/api/comandes/comandes/` | `cerca`, `sense_factura`, `enviament`, `magatzem_filter`, `ordre` |
| GET | `/api/comandes/factures/` | `cerca`, `tipus`, `data_des`, `data_fins`, `magatzem_filter`, `ordre` |

### Filtre multi-magatzem

El filtre `magatzem_filter` accepta múltiples valors:
```
GET /api/inventari/productes/?magatzem_filter=CI001&magatzem_filter=CI002
```
Internament, Django els llegeix amb `request.query_params.getlist('magatzem_filter')`.

## Optimitzacions de rendiment

- **Índexs de BD**: `producte.estoc_total`, `producte.categoria`, `comanda.data`, `comanda.enviament`, `factura.data`
- **`select_related` / `prefetch_related`** a tots els viewsets per evitar N+1
- **Stats de clients lazy**: el llistat de clients no calcula `n_comandes`/`import_total`; s'obtenen al fer clic en un client concret (1 query per client en comptes de N×2 per pàgina)
- **Paginació**: tots els endpoints paginats; ubicacions limitat a 200 resultats

## Autors

- [Tsegaye Fontserè](https://github.com/Tsaki05)
- [Nom 2](https://github.com/usuari2)
