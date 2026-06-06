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
│   │   ├── inventari/          # Magatzems, ubicacions, productes, lots
│   │   │   ├── services.py     # Lògica de negoci atòmica (crear magatzem, bulk ubicacions…)
│   │   │   └── views.py        # ViewSets amb permisos per rol
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
│   │   ├── app/
│   │   │   ├── providers.jsx   # Composició de providers globals (Auth + Filter)
│   │   │   └── router.jsx      # Layout, RequireAuth, AppRouter i sidebar
│   │   ├── features/           # Mòduls per domini (barrel export via index.js)
│   │   │   ├── auth/
│   │   │   │   ├── api/authApi.js
│   │   │   │   ├── context/AuthContext.jsx  # JWT, rol, user global
│   │   │   │   └── pages/LoginPage.jsx
│   │   │   ├── inventari/
│   │   │   │   ├── api/inventariApi.js      # Magatzems, ubicacions, productes, lots
│   │   │   │   ├── components/
│   │   │   │   │   └── MagatzemAutocomplete.jsx  # Cerca async al backend (fetchOptions)
│   │   │   │   └── pages/
│   │   │   │       ├── MagatzemsUbicacionsPage.jsx  # Gestió d'ubicacions + creació massiva
│   │   │   │       ├── ProductesPage.jsx
│   │   │   │       ├── EstocMagatzemsPage.jsx
│   │   │   │       └── UbicacioProductesPage.jsx
│   │   │   ├── comandes/
│   │   │   │   ├── api/comandesApi.js
│   │   │   │   └── pages/
│   │   │   │       ├── PrepararComandesPage.jsx
│   │   │   │       └── FacturacioPage.jsx
│   │   │   ├── clients/
│   │   │   │   └── api/clientsApi.js
│   │   │   ├── dashboard/
│   │   │   │   └── pages/HomePage.jsx
│   │   │   └── usuaris/
│   │   │       ├── api/usuarisApi.js
│   │   │       └── pages/GestioUsuarisPage.jsx
│   │   ├── shared/             # Utilitats transversals
│   │   │   ├── api/client.js   # Axios + paramsSerializer + refresh JWT automàtic
│   │   │   ├── components/PasswordInput.jsx
│   │   │   ├── contexts/FilterContext.jsx  # Filtre global de magatzem ([] = tots)
│   │   │   └── hooks/useDebounce.js
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
├── docs/
│   └── setup.md                # Guia de configuració detallada
├── .env.example
├── .env.local.example          # Variables del frontend (VITE_API_URL, VITE_PORT)
├── docker-compose.yml
└── Makefile
```

## Model de dades

```
Magatzem ──< Ubicacio ──< Lot >── Producte
    │                      │
    └──< Perfil            └── Perfil (superior, nullable)
    │
    └──< ClientMagatzem >── Client ──< Empresa
                                  └──< Individual
                                  └──< Comanda >── Paquet >── Producte
                                            └── Factura
```

**`Perfil`** — centralitza la informació del treballador: rol (`admin`/`superior`/`mosso`), magatzem assignat i telèfon. Creat automàticament via `post_save` signal quan es crea un `User`.

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

El seed genera automàticament usuaris amb Perfil (admin, superiors i mossos) per a cada magatzem. Consulta la sortida del seed per veure els usuaris creats.

Per crear un administrador addicional manualment:

```bash
python manage.py createsuperuser
python manage.py shell -c "
from django.contrib.auth.models import User
from apps.accounts.models import Perfil
u = User.objects.get(username='el-teu-user')
p = Perfil.objects.get(user=u)
p.rol = 'admin'
p.save()
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
| Mètode | URL | Paràmetres destacats | Rol mínim |
|---|---|---|---|
| GET | `/api/inventari/magatzems/` | `magatzem_filter` (multi), `cerca` | Autenticat |
| POST | `/api/inventari/magatzems/` | `{nom}` — codi autogenerat (8 car.) | Admin |
| DELETE | `/api/inventari/magatzems/{codi}/` | — retorna 409 si té lots associats | Admin |
| GET | `/api/inventari/ubicacions/` | `magatzem`, `magatzem_filter`, `cerca` (màx. 200 resultats) | Autenticat |
| POST | `/api/inventari/ubicacions/` | `{magatzem, passadis, estant, alcada}` (3 car. cadascun) | Admin/Superior |
| DELETE | `/api/inventari/ubicacions/{id}/` | — retorna 409 si té lots associats | Admin/Superior |
| POST | `/api/inventari/ubicacions/bulk/` | `{magatzem, passadis, combinacions: [{estant, alcada}]}` | Admin/Superior |
| GET/POST | `/api/inventari/productes/` | `magatzem_filter`, `cerca`, `categoria`, `baix_estoc`, `ordre`, `page` | Autenticat/Admin |
| GET/POST/DELETE | `/api/inventari/lots/` | `producte`, `magatzem_filter` | Autenticat/Admin |

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
- **Paginació**: tots els endpoints paginats (50 elements per pàgina); ubicacions limitat a 200 resultats; productes suporten scroll infinit via `?page=N`

## Autors

- [Tsegaye Fontserè](https://github.com/Tsaki05)
- [Nom 2](https://github.com/usuari2)
