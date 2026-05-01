# Magatzem — Sistema de Gestió de Magatzems

Aplicació web per gestionar magatzems d'una empresa de venda a l'engròs. Permet controlar productes, estoc, lots, comandes i facturació.

## Tecnologies

- **Backend**: Django 4.2 + Django REST Framework
- **Base de dades**: PostgreSQL (schema `practica`)
- **Generació de dades**: Faker
- **Contenidors**: Docker + Docker Compose

## Estructura del projecte

```
magatzem/
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
├── docs/                     # Documentació
├── docker-compose.yml
├── .env.example
└── Makefile
```

## Posada en marxa (desenvolupament)

### 1. Clona el repositori

```bash
git clone https://github.com/el-teu-usuari/magatzem.git
cd magatzem
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

## Contribució

1. Crea una branca des de `develop`: `git checkout -b feature/nom-de-la-feature`
2. Fes els canvis i commiteja: `git commit -m "feat: descripció"`
3. Puja la branca: `git push origin feature/nom-de-la-feature`
4. Obre un Pull Request cap a `develop`

### Convenció de commits

```
feat:     nova funcionalitat
fix:      correcció d'un bug
refactor: refactorització de codi
docs:     canvis a documentació
test:     afegir o modificar tests
chore:    tasques de manteniment
```

## Autors

- [Nom 1](https://github.com/usuari1)
- [Nom 2](https://github.com/usuari2)
