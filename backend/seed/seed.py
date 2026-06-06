"""
Script de generació de dades fictícies per al projecte Magatzem.
Executa des de la shell de Django:
    python manage.py shell -c "from seed.seed import seed; seed()"
"""

import random
import string
from decimal import Decimal
from faker import Faker
from django.contrib.auth.models import User

from apps.accounts.models import Perfil
from apps.inventari.models import Magatzem, Ubicacio, Producte, Lot
from apps.clients.models import Client, Empresa, Individual, ClientMagatzem
from apps.comandes.models import Factura, Comanda, Paquet

fake = Faker('es_ES')

CATEGORIES = ['petit', 'mitja', 'gran', 'gegant']
ENVIAMENTS  = ['correu expres', 'UPS']
PAGAMENTS   = [1, 2, 3]

MATERIALS = ['Acer', 'Alumini', 'Plàstic', 'Ferro', 'Coure', 'Fusta', 'Vidre', 'Goma', 'Titani', 'Carboni']
ADJECTIUS  = ['Industrial', 'Tècnic', 'Professional', 'Estàndard', 'Premium', 'Compacte', 'Modular', 'Universal']

def nom_producte():
    return f"{random.choice(MATERIALS)} {random.choice(ADJECTIUS)} {codi_alfanumeric(4)} "


def codi(n, digits=False):
    chars = string.digits if digits else string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=n))


# FIX: funcions helpers que faltaven
def codi_alfanumeric(n):
    return codi(n)

def codi_numeric(n):
    return codi(n, digits=True)

def nif_fake(e):
    lletra = random.choice(string.ascii_uppercase)
    digits = ''.join(random.choices(string.digits, k=8))
    return lletra + digits if e else digits + lletra

def seed(
    n_magatzems=10,
    n_ubicacions_per_magatzem=5000,
    n_superiors=10,
    n_mossos=50,
    n_productes=500,
    n_lots=1000,
    n_empreses=200,
    n_individuals=300,
    n_comandes=20000,
    n_factures=15000,
):
    print("Generant magatzems...")
    magatzems = []
    for _ in range(n_magatzems):
        m, _ = Magatzem.objects.get_or_create(codi_magatzem=codi(8))
        if not m.nom:
            m.nom = f"Centre Logístic {fake.city()}"
            m.save(update_fields=['nom'])
        magatzems.append(m)

    # FIX: indentació incorrecta (espai extra)
    print("Generant ubicacions...")
    ubicacions = []
    for m in magatzems:
        for _ in range(n_ubicacions_per_magatzem):
            u = Ubicacio.objects.create(
                magatzem=m,
                passadis=codi_alfanumeric(3),
                estant=codi_alfanumeric(3),
                alcada=codi_alfanumeric(3),
            )
            ubicacions.append(u)

    print("Generant usuaris (superiors i mossos)...")
    superiors = []
    used_usernames = set(User.objects.values_list('username', flat=True))

    def username_unic(prefix):
        while True:
            u = f"{prefix}_{codi_alfanumeric(6).lower()}"
            if u not in used_usernames:
                used_usernames.add(u)
                return u

    for _ in range(n_superiors):
        mag = random.choice(magatzems)
        u = User.objects.create_user(
            username=username_unic('sup'),
            password='Superior1234!',
            first_name=fake.first_name(),
            last_name=fake.last_name(),
        )
        perfil = u.perfil
        perfil.rol = 'superior'
        perfil.magatzem = mag
        perfil.telefon = fake.phone_number()[:20]
        perfil.save()
        superiors.append(perfil)

    for _ in range(n_mossos):
        u = User.objects.create_user(
            username=username_unic('mosso'),
            password='Mosso1234!',
            first_name=fake.first_name(),
            last_name=fake.last_name(),
        )
        perfil = u.perfil
        perfil.rol = 'mosso'
        perfil.magatzem = random.choice(magatzems)
        perfil.telefon = fake.phone_number()[:20]
        perfil.save()

    print("Generant productes...")
    productes = []
    for _ in range(n_productes):
        cat = random.choice(CATEGORIES)
        p = Producte.objects.create(
            id_producte=codi_numeric(12),
            nom=nom_producte(),
            descripcio=fake.text(max_nb_chars=150),
            codi_proveidor=codi_alfanumeric(6),
            estoc_total=random.randint(0, 10000),
            preu=Decimal(str(round(random.uniform(1, 999), 2))),
            categoria=cat,
        )
        productes.append(p)

    print("Generant lots...")
    for _ in range(n_lots):
        Lot.objects.get_or_create(
            ubicacio=random.choice(ubicacions),
            producte=random.choice(productes),
            defaults={
                'superior': random.choice(superiors),
                'quantitat': random.randint(1, 500),
            },
        )

    print("Generant clients empresa...")
    clients_empresa = []
    for _ in range(n_empreses):
        nif = nif_fake(True)
        if Client.objects.filter(nif=nif).exists():
            continue
        c = Client.objects.create(
            nif=nif,
            nom=fake.company(),
            correu_electronic=fake.company_email(),
        )
        Empresa.objects.create(
            client=c,
            adressa=fake.address(),
            enviament=random.choice([True, False]),
        )
        clients_empresa.append(c)

    print("Generant clients individuals...")
    clients_individual = []
    for _ in range(n_individuals):
        nif = nif_fake(False)
        if Client.objects.filter(nif=nif).exists():
            continue
        c = Client.objects.create(
            nif=nif,
            nom=fake.name(),
            correu_electronic=fake.email(),
        )
        Individual.objects.create(client=c, telefon=fake.phone_number()[:20])
        clients_individual.append(c)

    tots_clients = clients_empresa + clients_individual

    print("Generant comandes...")
    comandes = []
    used_ids = set()
    for _ in range(n_comandes):
        client = random.choice(tots_clients)
        id_comanda = codi_alfanumeric(5)
        while id_comanda in used_ids:
            id_comanda = codi_alfanumeric(5)
        used_ids.add(id_comanda)

        c = Comanda.objects.create(
            id_comanda=id_comanda,
            client=client,
            metode_pagament=random.choice(PAGAMENTS),
            enviament=random.choice([True, False]),
            import_total=Decimal(str(round(random.uniform(-200, 5000), 2))),
        )
        productes_comanda = random.sample(productes, k=random.randint(1, 5))
        for p in productes_comanda:
            quantitat = random.choice(list(range(-5, 0)) + list(range(1, 51)))  # RS4: != 0
            Paquet.objects.get_or_create(
                comanda=c,
                producte=p,
                defaults={
                    'quantitat': quantitat,
                    'preu': p.preu,
                },
            )
        comandes.append(c)

    # Deriva ClientMagatzem de les comandes reals: un client és client
    # d'un magatzem si i només si hi té almenys una comanda.
    print("Derivant associacions client-magatzem des de les comandes...")
    for c in comandes:
        mag_ids = (
            Lot.objects
            .filter(producte__paquets__comanda=c)
            .values_list('ubicacio__magatzem_id', flat=True)
            .distinct()
        )
        for mag_id in mag_ids:
            ClientMagatzem.objects.get_or_create(
                client_id=c.client_id,
                magatzem_id=mag_id,
            )

    print("Generant factures...")
    used_ids = set()
    for _ in range(n_factures):
        client = random.choice(tots_clients)
        comandes_client = [c for c in comandes if c.client_id == client.nif and c.factura is None]
        if not comandes_client:
            continue

        id_factura = codi_alfanumeric(5)
        while id_factura in used_ids:
            id_factura = codi_alfanumeric(5)
        used_ids.add(id_factura)

        # RS6: individuals -> exactament 1 comanda per factura
        if hasattr(client, 'empresa'):
            n = random.randint(1, min(5, len(comandes_client)))
            comandes_factura = random.sample(comandes_client, k=n)
        else:
            comandes_factura = [comandes_client[0]]

        import_total = sum(c.import_total for c in comandes_factura)
        f = Factura.objects.create(
            id_factura=id_factura,
            client=client,
            import_total=import_total,
            data=fake.date_between(start_date='-2y', end_date='today'),
        )
        for c in comandes_factura:
            c.factura = f
            c.save(update_fields=['factura'])

    print(f"""
Dades generades correctament:
  Magatzems:  {Magatzem.objects.count()}
  Ubicacions: {Ubicacio.objects.count()}
  Superiors:  {Perfil.objects.filter(rol='superior').count()}
  Mossos:     {Perfil.objects.filter(rol='mosso').count()}
  Productes:  {Producte.objects.count()}
  Lots:       {Lot.objects.count()}
  Clients:    {Client.objects.count()}
  Comandes:   {Comanda.objects.count()}
  Factures:   {Factura.objects.count()}
    """)