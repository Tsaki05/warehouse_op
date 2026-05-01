# Magatzem — Sistema de Gestió de Magatzems

Aplicació web per gestionar magatzems d'una empresa de venda a l'engròs. Permet controlar productes, estoc, lots, comandes i facturació.

## Tecnologies

- **Backend**: Django 4.2 + Django REST Framework
- **Base de dades**: PostgreSQL (schema `practica`)
- **Generació de dades**: Faker
- **Contenidors**: Docker + Docker Compose

## Estructura del projecte

```
warehouse_op/
├── .github/                  # CI/CD i templates de GitHub
│   ├── workflows/
│   │   └── ci.yml
│   └── ISSUE_TEMPLATE/
├── backend/
│   ├── config/               # Configuració global del projecte
│   │   ├── settings/
│   │   │   ├── base.py       # Configuració compartida
│   │   │   ├── development.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── apps/
│   │   ├── inventari/        # Magatzems, ubicacions, productes, lots
│   │   ├── clients/          # Clients, empreses, individuals
│   │   └── comandes/         # Comandes, paquets, factures
│   ├── seed/                 # Scripts de generació de dades
│   ├── manage.py
│   └── requirements/
│       ├── base.txt
│       ├── development.txt
│       └── production.txt
├── fronted/...
├── docs/                     # Documentació
├── docker-compose.yml
├── .env.example
└── Makefile
```

## Posada en marxa (desenvolupament)

### 1. Clona el repositori

```bash
git clone https://github.com/el-teu-usuari/warehouse_op.git
cd warehouse_op
```

### 2. Crea el fitxer d'entorn

```bash
cp .env.example .env
# edita .env amb les teves credencials
```

### 3. Amb Docker (recomanat)

```bash
make build
make up
make migrate
make seed
```

### 4. Sense Docker

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements/development.txt
python manage.py migrate
python manage.py shell -c "from seed.seed import seed; seed()"
python manage.py runserver
```

## Comandaments útils (Makefile)

```bash
make build       # Construeix els contenidors
make up          # Aixeca els serveis
make down        # Para els serveis
make migrate     # Aplica migracions
make seed        # Genera dades de prova
make test        # Executa els tests
make shell       # Shell de Django
make logs        # Veure logs
```

## API REST

Un cop aixecat el servidor, l'API és accessible a:

- `http://localhost:8000/api/` — Arrel de l'API
- `http://localhost:8000/api/inventari/` — Magatzems, ubicacions, productes
- `http://localhost:8000/api/clients/` — Clients
- `http://localhost:8000/api/comandes/` — Comandes i factures


## Autors

- [Tsegaye Fontserè](https://github.com/Tsaki05)
- [Nom 2](https://github.com/usuari2)
