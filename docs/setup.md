# Guia de configuració detallada

## Requisits previs

| Eina | Versió mínima |
|---|---|
| Python | 3.11 |
| Node.js | 20 |
| PostgreSQL | 15 |
| Git | qualsevol |

---

## 1. Variables d'entorn del backend

Copia `.env.example` com `.env` a l'arrel del projecte:

```bash
cp .env.example .env
```

| Variable | Descripció | Exemple |
|---|---|---|
| `DJANGO_SECRET_KEY` | Clau secreta de Django (mín. 50 caràcters) | `canvia-aquest-valor` |
| `DJANGO_DEBUG` | `True` en dev, `False` en prod | `True` |
| `DJANGO_ALLOWED_HOSTS` | Hosts permesos separats per comes | `localhost,127.0.0.1` |
| `DB_NAME` | Nom de la BD (a ubiwan = el teu usuari) | `est_c1234567` |
| `DB_USER` | Usuari de PostgreSQL | `est_c1234567` |
| `DB_PASSWORD` | Contrasenya | `...` |
| `DB_HOST` | Host del servidor | `ubiwan.epsevg.upc.edu` |
| `DB_PORT` | Port de PostgreSQL | `5432` |
| `DB_SCHEMA` | Schema a usar | `practica` |

> **Nota UPC**: Per connectar-se a `ubiwan.epsevg.upc.edu` des de fora del campus cal la **VPN de la UPC**.

---

## 2. Variables d'entorn del frontend

Per accedir a l'app des d'un altre dispositiu (mòbil, altra màquina), crea `frontend/.env.local`:

```bash
VITE_API_URL=http://<la-teva-ip-local>:8000/api
```

Per trobar la teva IP local:
```bash
ip route get 1 | awk '{print $7; exit}'
```

Si no existeix `.env.local`, el frontend apunta a `http://localhost:8000/api` per defecte.

---

## 3. Instal·lació i posada en marxa

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements/development.txt

python manage.py migrate
python manage.py shell -c "from seed.seed import seed; seed()"

# Arrencar el servidor (accessible des de la xarxa local)
python manage.py runserver 0.0.0.0:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- --host             # Exposa a la xarxa local
```

L'aplicació estarà disponible a `http://localhost:5173` (o el port que assigni Vite).

---

## 4. Crear el primer usuari administrador

```bash
cd backend
source venv/bin/activate
python manage.py createsuperuser   # Crea l'usuari de Django

python manage.py shell -c "
from django.contrib.auth.models import User
from apps.accounts.models import Perfil
u = User.objects.get(username='el-teu-username')
Perfil.objects.create(user=u, rol='admin')
"
```

---

## 5. Schema de PostgreSQL (ubiwan)

Si treballes amb el servidor de la UPC, assegura't que el schema `practica` existeix:

```sql
-- Connectat al servidor ubiwan com el teu usuari
CREATE SCHEMA IF NOT EXISTS practica;
SET search_path TO practica, public;
```

Les migracions de Django ja creen totes les taules dins d'aquest schema automàticament.

---

## 6. Entorn de CI

El pipeline de CI (`.github/workflows/ci.yml`) usa una BD PostgreSQL temporal en memòria (`--tmpfs`) i no necessita accés a ubiwan. Les credencials de CI estan fixades al fitxer `ci.yml` i al script `backend/ci/setup_ci_data.py`.

Per executar els tests localment:

```bash
# Tests unitaris del backend
cd backend
source venv/bin/activate
python manage.py test --parallel

# Smoke tests d'integració (cal tenir el servidor arrencat)
python manage.py runserver --noreload 8000 &
python backend/ci/integration_test.py
```

---

## 7. Accés des d'un dispositiu extern (mòbil, altra màquina)

1. Assegura't que estàs a la **mateixa xarxa WiFi** que l'ordinador on corre el servidor.
2. Troba la teva IP local: `ip route get 1 | awk '{print $7; exit}'`
3. Crea `frontend/.env.local` amb `VITE_API_URL=http://<ip>:8000/api`
4. Arrenca el backend exposat: `python manage.py runserver 0.0.0.0:8000`
5. Arrenca el frontend exposat: `npm run dev -- --host`
6. Accedeix des del dispositiu a `http://<ip>:5174`

> El backend (Django) es connecta a la BD de la UPC a través de la VPN del teu ordinador. El dispositiu extern no necessita VPN.

---

## 8. Endpoints de l'API — Referència

Consulta el [README principal](../README.md#api-rest--referència-ràpida) per a la taula completa d'endpoints.

Exemples:

```bash
# Login
curl -s -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"1234"}' | python -m json.tool

# Llistat de productes (amb token)
TOKEN="<access_token>"
curl -s http://localhost:8000/api/inventari/productes/ \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

# Filtre multi-magatzem
curl -s "http://localhost:8000/api/inventari/productes/?magatzem_filter=CI001&magatzem_filter=CI002" \
  -H "Authorization: Bearer $TOKEN"
```
