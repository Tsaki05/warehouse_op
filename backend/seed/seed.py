"""
Script de generació de dades fictícies per al projecte Magatzem.
Executa des de la shell de Django:
    python manage.py shell -c "from seed.seed import seed; seed()"
"""

import random
import string
from decimal import Decimal
from faker import Faker

from apps.inventari.models import Magatzem, Ubicacio, Treballador, Superior, Mosso, Producte, Lot
from apps.clients.models import Client, Empresa, Individual
from apps.comandes.models import Factura, Comanda, Paquet

fake = Faker('es_ES')

CATEGORIES = ['petit', 'mitja', 'gran', 'gegant']
ENVIAMENTS  = ['terrestre', 'maritim', 'aeri']
PAGAMENTS   = [1, 2, 3]


def codi(n, digits=False):
    chars = string.digits if digits else string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=n))


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

    print("Generant ubicacions...")
    ubicacions = []
    for m in magatzems:
        for _ in range(n_ubicacions_per_magatzem):
            u = Ubicacio.objects.create(
                magatzem=m,
                passadis=codi(3),
                estant=codi(3),
                alcada=codi(3),
            )
            ubicacions.append(u)

    print("Generant treballadors...")
    superiors = []
    for _ in range(n_superiors):
        t = Treballador.objects.create(telefon=fake.phone_number()[:20], nom=fake.name())
        s = Superior.objects.create(treballador=t)
        superiors.append(s)

    for _ in range(n_mossos):
        t = Treballador.objects.create(telefon=fake.phone_number()[:20], nom=fake.name())
        Mosso.objects.create(treballador=t)

    print("Generant productes...")
    productes = []
    for _ in range(n_productes):
        p = Producte.objects.create(
            id_producte=codi(12, digits=True),
            codi_proveidor=codi(6),
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
        nif = fake.nif()
        if Client.objects.filter(nif=nif).exists():
            continue
        c = Client.objects.create(nif=nif, nom=fake.company(), correu_electronic=fake.company_email())
        Empresa.objects.create(client=c, adressa=fake.address(), enviament=random.choice(ENVIAMENTS))
        clients_empresa.append(c)

    print("Generant clients individuals...")
    clients_individual = []
    for _ in range(n_individuals):
        nif = fake.nif()
        if Client.objects.filter(nif=nif).exists():
            continue
        c = Client.objects.create(nif=nif, nom=fake.name(), correu_electronic=fake.email())
        Individual.objects.create(client=c, telefon=fake.phone_number()[:20])
        clients_individual.append(c)

    tots_clients = clients_empresa + clients_individual

    print("Generant comandes...")
    comandes = []
    for _ in range(n_comandes):
        client = random.choice(tots_clients)
        import_total = Decimal(str(round(random.uniform(-200, 5000), 2)))
        c = Comanda.objects.create(
            id_comanda=codi(5),
            client=client,
            metode_pagament=random.choice(PAGAMENTS),
            enviament=random.choice([True, False]),
            import_total=import_total,
        )
        # Afegir entre 1 i 5 paquets
        productes_comanda = random.sample(productes, k=random.randint(1, 5))
        for p in productes_comanda:
            Paquet.objects.get_or_create(
                comanda=c,
                producte=p,
                defaults={
                    'quantitat': random.randint(-5, 50),
                    'preu': p.preu,
                },
            )
        comandes.append(c)

    print("Generant factures...")
    for _ in range(n_factures):
        client = random.choice(tots_clients)
        comandes_client = [c for c in comandes if c.client_id == client.nif and c.factura is None]
        if not comandes_client:
            continue

        # Empreses poden tenir múltiples comandes per factura
        if hasattr(client, 'empresa'):
            n = random.randint(1, min(5, len(comandes_client)))
            comandes_factura = random.sample(comandes_client, k=n)
        else:
            comandes_factura = [comandes_client[0]]

        import_total = sum(c.import_total for c in comandes_factura)
        f = Factura.objects.create(
            id_factura=codi(5),
            client=client,
            import_total=import_total,
            data=fake.date_between(start_date='-2y', end_date='today'),
        )
        for c in comandes_factura:
            c.factura = f
            c.save(update_fields=['factura'])

    print(f"""
    Dades generades correctament:
    - Magatzems:   {Magatzem.objects.count()}
    - Ubicacions:  {Ubicacio.objects.count()}
    - Treballadors:{Treballador.objects.count()}
    - Productes:   {Producte.objects.count()}
    - Lots:        {Lot.objects.count()}
    - Clients:     {Client.objects.count()}
    - Comandes:    {Comanda.objects.count()}
    - Factures:    {Factura.objects.count()}
    """)
