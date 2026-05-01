"""
Script de generació de dades fictícies per al projecte Magatzem.
Executa des de la shell de Django:
    python manage.py shell -c "from seed.seed import seed; seed()"
"""

import random
import string
from decimal import Decimal
from faker import Faker

from apps.inventari.models import Magatzem, Ubicacio, Treballador, Producte, Lot
from apps.clients.models import Client, Empresa, Individual
from apps.comandes.models import Factura, Comanda, Paquet

fake = Faker('es_ES')

CATEGORIES = ['petit', 'mitja', 'gran', 'gegant']
ENVIAMENTS  = ['correu expres', 'UPS']
PAGAMENTS   = [1, 2, 3]


def codi(n, digits=False):
    chars = string.digits if digits else string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=n))


# FIX: funcions helpers que faltaven
def codi_alfanumeric(n):
    return codi(n)

def codi_numeric(n):
    return codi(n, digits=True)

def nif_fake():
    return codi(8)


def seed(
    n_magatzems=10,
    n_ubicacions_per_magatzem=50,
    n_superiors=20,
    n_mossos=50,
    n_productes=500,
    n_lots=1000,
    n_empreses=200,
    n_individuals=300,
    n_comandes=2000,
    n_factures=500,
):
    print("Generant magatzems...")
    magatzems = [Magatzem.objects.get_or_create(codi_magatzem=codi(8))[0] for _ in range(n_magatzems)]

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

    print("Generant treballadors...")
    superiors = []
    for _ in range(n_superiors):
        t = Treballador.objects.create(
            telefon=fake.phone_number()[:20],
            nom=fake.name(),
            superior=True,
        )
        superiors.append(t)

    for _ in range(n_mossos):
        Treballador.objects.create(
            telefon=fake.phone_number()[:20],
            nom=fake.name(),
            superior=False,
        )

    print("Generant productes...")
    productes = []
    for _ in range(n_productes):
        p = Producte.objects.create(
            id_producte=codi_numeric(12),
            codi_proveidor=codi_alfanumeric(6),
            estoc_total=random.randint(0, 10000),
            preu=Decimal(str(round(random.uniform(1, 999), 2))),
            categoria=random.choice(CATEGORIES),
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
        nif = nif_fake()
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
        nif = nif_fake()
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
  Magatzems:    {Magatzem.objects.count()}
  Ubicacions:   {Ubicacio.objects.count()}
  Treballadors: {Treballador.objects.count()}
  Productes:    {Producte.objects.count()}
  Lots:         {Lot.objects.count()}
  Clients:      {Client.objects.count()}
  Comandes:     {Comanda.objects.count()}
  Factures:     {Factura.objects.count()}
    """)