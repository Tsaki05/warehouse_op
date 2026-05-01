# Guia de configuració

## Requisits previs
- Python 3.11+
- PostgreSQL 15+
- pip

## Configuració del schema a PostgreSQL

Connecta't al servidor ubiwan i crea el schema:

```sql
CREATE SCHEMA IF NOT EXISTS practica;
SET search_path TO practica, public;
```

## Variables d'entorn

Copia `.env.example` com `.env` i omple:

| Variable | Descripció |
|---|---|
| `DJANGO_SECRET_KEY` | Clau secreta de Django |
| `DJANGO_DEBUG` | `True` en dev, `False` en prod |
| `DB_NAME` | Nom de la BD (normalment el teu usuari) |
| `DB_USER` | Usuari de PostgreSQL |
| `DB_PASSWORD` | Contrasenya |
| `DB_HOST` | Host del servidor (ubiwan) |
| `DB_SCHEMA` | Schema a usar (practica) |

## Primers passos

```bash
cd backend
pip install -r requirements/development.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py shell -c "from seed.seed import seed; seed()"
python manage.py runserver
```

## Endpoints de l'API

| Mètode | URL | Descripció |
|---|---|---|
| GET | `/api/inventari/magatzems/` | Llista magatzems |
| GET | `/api/inventari/productes/?categoria=gran` | Filtra per categoria |
| GET | `/api/comandes/comandes/?sense_factura=true` | Comandes sense facturar |
| GET | `/api/clients/clients/` | Llista clients |
