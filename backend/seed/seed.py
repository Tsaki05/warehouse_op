"""
Script de generació de dades fictícies per al projecte Magatzem.
Executa des de la shell de Django:
    python manage.py shell -c "from seed.seed import seed; seed()"
"""

import random
import string
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from faker import Faker
from django.contrib.auth.models import User

from apps.accounts.models import Perfil
from apps.inventari.models import Magatzem, Ubicacio, Producte, Lot
from apps.clients.models import Client, Empresa, Individual, ClientMagatzem
from apps.comandes.models import Factura, Comanda, Paquet

fake = Faker('es_ES')

CATEGORIES = ['petit', 'mitja', 'gran', 'gegant']
PAGAMENTS   = [1, 2, 3]

# Cada magatzem té una especialitat amb els seus propis materials i tipus de producte
WAREHOUSE_SPECS = [
    {
        'nom':      'Centre Logístic Peces Moto',
        'materials': ['Alumini forjat', 'Acer inox', 'Carboni', 'Goma NBR', 'Titani'],
        'tipus':     ['Motor', 'Culata', 'Pistó', 'Cadena de tracció', 'Carburador',
                      'Suspensió', 'Sistema de frens', 'Escape', 'Variador', 'Manillar moto'],
    },
    {
        'nom':      'Centre Logístic Bicicletes i MTB',
        'materials': ['Alumini 6061', 'Carboni UD', 'Acer cromoly', 'Titani', 'Nylon reforçat'],
        'tipus':     ['Quadre', 'Forquilla', 'Frens hidràulics', 'Canvi de marxes', 'Pedaler',
                      'Roda davantera', 'Roda posterior', 'Sella', 'Cassette', 'Cadena bici'],
    },
    {
        'nom':      'Centre Logístic Electrònica Industrial',
        'materials': ['PCB FR4', 'Silici', 'Coure OFC', 'Plàstic ABS', 'Alumini anoditzat'],
        'tipus':     ['Sensor de pressió', 'Controlador PLC', 'Connector industrial', 'Fusible',
                      'Relé trifàsic', 'Condensador electrolític', 'Transistor MOSFET', 'Resistència SMD'],
    },
    {
        'nom':      'Centre Logístic Ferreteria',
        'materials': ['Acer galvanitzat', 'Inox A2', 'Llautó', 'Zinc', 'Nylon PA6'],
        'tipus':     ['Cargol mètric', 'Femella hexagonal', 'Volandera plana', 'Tac expansió',
                      'Cargol autoroscant', 'Rebló', 'Passador', 'Espàrrec roscats'],
    },
    {
        'nom':      'Centre Logístic Eines i Maquinària',
        'materials': ['Acer Cr-V', 'Acer bimetal·lic', 'Carbur de tungstè', 'HSS cobalt'],
        'tipus':     ['Clau anglesa', 'Alicate universal', 'Tornavís', 'Martell de bola',
                      'Broca helicoïdal', 'Serra circular', 'Nivell de bombolla', 'Calibre peu de rei'],
    },
    {
        'nom':      'Centre Logístic Material Construcció',
        'materials': ['Acer corrugat', 'PVC pressió', 'Coure llur', 'Polietilè PE100', 'Fibra de vidre'],
        'tipus':     ['Canonada roscada', 'Colze 90°', 'Vàlvula de tall', 'Ancoratge químic',
                      'Perfil UPN', 'Perfil HEB', 'Xapa nervada', 'Grapa muret'],
    },
    {
        'nom':      'Centre Logístic Lubricants i Fluids',
        'materials': ['Oli mineral 5W30', 'Oli sintètic 10W40', 'Greix de liti', 'Fluid hidràulic ISO46'],
        'tipus':     ['Oli de motor', 'Oli de caixa manual', 'Greix multipropòsit', 'Líquid de frens DOT4',
                      'Anticongelant G12', 'Desengrassant industrial', 'Lubricant cadena', 'Oli hidràulic'],
    },
    {
        'nom':      'Centre Logístic Transmissió Industrial',
        'materials': ['Polièster reforçat', 'Neoprè', 'Acer 42CrMo4', 'Bronze fosforós'],
        'tipus':     ['Rodament de boles', 'Politja acanaladada', 'Corretja dentada', 'Cadena de rol',
                      'Engranatge recte', 'Reductor de velocitat', 'Acoblament elàstic', 'Guia lineal THK'],
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _codi(n, digits=False):
    chars = string.digits if digits else string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=n))

def _nif(empresa):
    ll = random.choice(string.ascii_uppercase)
    ds = ''.join(random.choices(string.digits, k=8))
    return ll + ds if empresa else ds + ll


# ── Reset ─────────────────────────────────────────────────────────────────────

def reset():
    """Esborra totes les dades excepte l'usuari admin."""
    print("  Esborrant dades existents...")
    Paquet.objects.all().delete()
    Comanda.objects.all().delete()
    Factura.objects.all().delete()
    ClientMagatzem.objects.all().delete()
    Individual.objects.all().delete()
    Empresa.objects.all().delete()
    Client.objects.all().delete()
    Lot.objects.all().delete()
    Ubicacio.objects.all().delete()
    Producte.objects.all().delete()
    User.objects.filter(perfil__rol__in=['superior', 'mosso']).delete()
    Magatzem.objects.all().delete()
    print("  ✓ Dades esborrades.")


# ── Seed principal ────────────────────────────────────────────────────────────

def seed(
    n_ubicacions_per_magatzem=1500,
    n_superiors=8,
    n_mossos=48,
    n_productes_per_mag=100,
    n_empreses=300,
    n_individuals=400,
    n_comandes=60000,
    n_factures=48000,
):
    # Nombre de magatzems determinat per WAREHOUSE_SPECS
    n_magatzems = len(WAREHOUSE_SPECS)

    reset()
    today = date.today()

    # ── Magatzems especialitzats ───────────────────────────────────────────────
    print("Generant magatzems especialitzats...")
    magatzems = []        # llista ordenada paral·lela a WAREHOUSE_SPECS
    mag_specs  = []       # spec associada a cada magatzem
    used_codis = set()
    for spec in WAREHOUSE_SPECS:
        codi = _codi(8)
        while codi in used_codis:
            codi = _codi(8)
        used_codis.add(codi)
        city = fake.city()
        m = Magatzem.objects.create(
            codi_magatzem=codi,
            nom=f"{spec['nom']} – {city}",
        )
        magatzems.append(m)
        mag_specs.append(spec)
    print(f"  ✓ {len(magatzems)} magatzems")

    # ── Ubicacions ────────────────────────────────────────────────────────────
    print("Generant ubicacions...")
    ub_bulk = [
        Ubicacio(magatzem=m, passadis=_codi(3), estant=_codi(3), alcada=_codi(3))
        for m in magatzems
        for _ in range(n_ubicacions_per_magatzem)
    ]
    Ubicacio.objects.bulk_create(ub_bulk, batch_size=3000)

    ubicacions_per_mag = defaultdict(list)
    for u in Ubicacio.objects.only('id_ubicacio', 'magatzem_id').all():
        ubicacions_per_mag[u.magatzem_id].append(u.id_ubicacio)
    print(f"  ✓ {sum(len(v) for v in ubicacions_per_mag.values())} ubicacions")

    # ── Usuaris ───────────────────────────────────────────────────────────────
    print("Generant usuaris...")
    used_unames = set(User.objects.values_list('username', flat=True))

    def uname(prefix):
        while True:
            u = f"{prefix}_{_codi(6).lower()}"
            if u not in used_unames:
                used_unames.add(u)
                return u

    superiors_per_mag = defaultdict(list)   # mag_pk -> [Perfil]
    # Garantim almenys 1 superior per magatzem
    mag_rota = list(magatzems) * (n_superiors // n_magatzems + 1)
    for i in range(n_superiors):
        mag = mag_rota[i]
        u = User.objects.create_user(
            username=uname('sup'), password='Superior1234!',
            first_name=fake.first_name(), last_name=fake.last_name(),
        )
        p = u.perfil
        p.rol = 'superior'; p.magatzem = mag; p.telefon = fake.phone_number()[:20]
        p.save()
        superiors_per_mag[mag.pk].append(p)

    all_superiors = list(Perfil.objects.filter(rol='superior'))

    for _ in range(n_mossos):
        mag = random.choice(magatzems)
        u = User.objects.create_user(
            username=uname('mosso'), password='Mosso1234!',
            first_name=fake.first_name(), last_name=fake.last_name(),
        )
        p = u.perfil
        p.rol = 'mosso'; p.magatzem = mag; p.telefon = fake.phone_number()[:20]
        p.save()

    all_workers = list(User.objects.filter(perfil__rol__in=['superior', 'mosso']).select_related('perfil'))
    workers_per_mag = defaultdict(list)
    for w in all_workers:
        if w.perfil.magatzem_id:
            workers_per_mag[w.perfil.magatzem_id].append(w)
    print(f"  ✓ {n_superiors} superiors, {n_mossos} mossos")

    # ── Productes especialitzats per magatzem ─────────────────────────────────
    # Cada magatzem genera els seus propis productes (n_productes_per_mag).
    # A més, cada producte s'estén a 1-2 magatzems addicionals aleatoris
    # per permetre comandes creuades.
    print("Generant productes especialitzats per magatzem...")
    used_pids = set()
    prod_bulk = []
    # producte_mag_home[idx] = índex del magatzem "propietari" del producte
    producte_mag_home = []

    for mag_idx, spec in enumerate(mag_specs):
        for _ in range(n_productes_per_mag):
            pid = _codi(12, digits=True)
            while pid in used_pids:
                pid = _codi(12, digits=True)
            used_pids.add(pid)
            cat = random.choice(CATEGORIES)
            mat = random.choice(spec['materials'])
            tip = random.choice(spec['tipus'])
            prod_bulk.append(Producte(
                id_producte=pid,
                nom=f"{tip} {mat} {_codi(4)} ({cat})",
                descripcio=fake.text(max_nb_chars=150),
                codi_proveidor=_codi(6),
                estoc_total=0,
                preu=Decimal(str(round(random.uniform(2, 999), 2))),
                categoria=cat,
            ))
            producte_mag_home.append(mag_idx)

    Producte.objects.bulk_create(prod_bulk, batch_size=500)
    productes = list(Producte.objects.all())
    print(f"  ✓ {len(productes)} productes ({n_productes_per_mag} per magatzem)")

    # ── Lots: cada producte al seu magatzem home + 1-2 addicionals ────────────
    print("Generant lots...")
    productes_per_mag = defaultdict(list)
    lot_bulk = []

    for p, mag_home_idx in zip(productes, producte_mag_home):
        # Magatzems que tindran aquest producte: home sempre + 1-2 aleatoris
        altres = [i for i in range(n_magatzems) if i != mag_home_idx]
        extra_idxs = random.sample(altres, k=random.randint(1, min(2, len(altres))))
        mags_p = [magatzems[mag_home_idx]] + [magatzems[i] for i in extra_idxs]

        for mag in mags_p:
            sup_list = superiors_per_mag.get(mag.pk) or all_superiors
            ub_ids = random.sample(ubicacions_per_mag[mag.pk], k=random.randint(1, 3))
            for uid in ub_ids:
                lot_bulk.append(Lot(
                    ubicacio_id=uid,
                    producte=p,
                    superior=random.choice(sup_list),
                    quantitat=random.randint(50, 800),
                ))
            productes_per_mag[mag.pk].append(p)

    Lot.objects.bulk_create(lot_bulk, batch_size=1000)
    print(f"  ✓ {Lot.objects.count()} lots ({len(productes_per_mag)} magatzems amb productes)")

    # ── Estoc crític garantit: 4-8 productes per magatzem amb quantitat < 25 ──
    print("Aplicant estoc crític per magatzem...")
    lots_critics = []
    for mag in magatzems:
        n_critic = random.randint(4, 8)
        prods_critic = random.sample(
            productes_per_mag[mag.pk],
            k=min(n_critic, len(productes_per_mag[mag.pk])),
        )
        for p in prods_critic:
            lot = Lot.objects.filter(producte=p, ubicacio__magatzem=mag).first()
            if lot:
                lot.quantitat = random.randint(1, 20)
                lots_critics.append(lot)
    Lot.objects.bulk_update(lots_critics, ['quantitat'], batch_size=200)
    print(f"  ✓ {len(lots_critics)} lots crítics aplicats")

    # ── Clients ───────────────────────────────────────────────────────────────
    print("Generant clients...")
    used_nifs = set(Client.objects.values_list('nif', flat=True))

    def nif_unic(empresa):
        while True:
            n = _nif(empresa)
            if n not in used_nifs:
                used_nifs.add(n)
                return n

    cl_bulk, emp_bulk, ind_bulk = [], [], []
    clients_empresa, clients_individual = [], []

    for _ in range(n_empreses):
        c = Client(nif=nif_unic(True), nom=fake.company(), correu_electronic=fake.company_email())
        cl_bulk.append(c); clients_empresa.append(c)
    for _ in range(n_individuals):
        c = Client(nif=nif_unic(False), nom=fake.name(), correu_electronic=fake.email())
        cl_bulk.append(c); clients_individual.append(c)

    Client.objects.bulk_create(cl_bulk, batch_size=500)
    for c in clients_empresa:
        emp_bulk.append(Empresa(client=c, adressa=fake.address(), enviament=random.choice([True, False])))
    for c in clients_individual:
        ind_bulk.append(Individual(client=c, telefon=fake.phone_number()[:20]))
    Empresa.objects.bulk_create(emp_bulk, batch_size=500)
    Individual.objects.bulk_create(ind_bulk, batch_size=500)

    tots_clients = clients_empresa + clients_individual
    print(f"  ✓ {len(tots_clients)} clients")

    # ── Comandes ──────────────────────────────────────────────────────────────
    # Cada comanda té un magatzem assignat i només productes d'aquell magatzem.
    # 80% preparades, 20% pendents. Quantitats sempre positives (compres).
    print(f"Generant {n_comandes} comandes...")
    used_cids = set()

    def cid_unic():
        while True:
            c = _codi(5)
            if c not in used_cids:
                used_cids.add(c)
                return c

    com_bulk, paq_bulk = [], []
    FLUSH = 3000

    for _ in range(n_comandes):
        mag = random.choice(magatzems)
        prods_mag = productes_per_mag[mag.pk]
        if not prods_mag:
            continue

        client = random.choice(tots_clients)
        n_paq = random.randint(1, 5)
        prods_sel = random.sample(prods_mag, k=min(n_paq, len(prods_mag)))
        paq_data = [(p, random.randint(1, 30)) for p in prods_sel]
        import_total = sum(p.preu * q for p, q in paq_data)

        preparat   = random.random() < 0.80
        mag_workers = workers_per_mag.get(mag.pk) or all_workers
        prep_per   = random.choice(mag_workers) if preparat else None
        met_pag    = random.choice(PAGAMENTS) if random.random() < 0.75 else None

        com = Comanda(
            id_comanda=cid_unic(),
            client=client,
            magatzem=mag,
            metode_pagament=met_pag,
            enviament=random.choice([True, False]),
            import_total=import_total,
            preparat=preparat,
            preparat_per=prep_per,
        )
        com_bulk.append(com)
        for p, q in paq_data:
            paq_bulk.append(Paquet(comanda=com, producte=p, quantitat=q, preu=p.preu))

        if len(com_bulk) >= FLUSH:
            Comanda.objects.bulk_create(com_bulk, batch_size=500)
            Paquet.objects.bulk_create(paq_bulk, batch_size=1000)
            com_bulk.clear(); paq_bulk.clear()

    if com_bulk:
        Comanda.objects.bulk_create(com_bulk, batch_size=500)
        Paquet.objects.bulk_create(paq_bulk, batch_size=1000)

    # Assigna dates aleatòries repartides en els últims 365 dies
    print("  Assignant dates a les comandes...")
    batch = []
    for com in Comanda.objects.only('id_comanda', 'data').iterator(chunk_size=3000):
        com.data = today - timedelta(days=random.randint(0, 364))
        batch.append(com)
        if len(batch) >= 3000:
            Comanda.objects.bulk_update(batch, ['data'], batch_size=1000)
            batch.clear()
    if batch:
        Comanda.objects.bulk_update(batch, ['data'], batch_size=1000)

    print(f"  ✓ {Comanda.objects.count()} comandes")

    # ── ClientMagatzem ────────────────────────────────────────────────────────
    print("Derivant associacions client-magatzem...")
    cm_set = set()
    cm_bulk = []
    for row in Comanda.objects.filter(magatzem__isnull=False).values('client_id', 'magatzem_id').distinct():
        key = (row['client_id'], row['magatzem_id'])
        if key not in cm_set:
            cm_set.add(key)
            cm_bulk.append(ClientMagatzem(client_id=row['client_id'], magatzem_id=row['magatzem_id']))
    ClientMagatzem.objects.bulk_create(cm_bulk, batch_size=1000, ignore_conflicts=True)
    print(f"  ✓ {ClientMagatzem.objects.count()} associacions client-magatzem")

    # ── Factures ──────────────────────────────────────────────────────────────
    # Distribució de dates: 60% en els últims 30 dies, 40% fins a 365 dies enrere.
    # Això dona estadístiques coherents al dashboard dels últims 30 dies.
    print(f"Generant factures...")
    comandes_per_client = defaultdict(list)
    for row in (
        Comanda.objects
        .filter(preparat=True, factura__isnull=True)
        .values('id_comanda', 'client_id', 'import_total', 'metode_pagament')
        .iterator(chunk_size=5000)
    ):
        comandes_per_client[row['client_id']].append(row)

    used_fids = set()

    def fid_unic():
        while True:
            f = _codi(5)
            if f not in used_fids:
                used_fids.add(f)
                return f

    fac_bulk = []
    com_fac_updates = []   # list of (id_comanda, factura_id, metode_pagament)
    n_fac = 0

    # Pre-genera dates per als últims 30 dies de forma cíclica per garantir
    # que cada dia tingui factures, i aleatòries per als últims 365 dies.
    n_recent  = int(n_factures * 0.60)
    n_antiga  = n_factures - n_recent
    dates_30  = [today - timedelta(days=i % 30) for i in range(n_recent)]
    dates_any = [today - timedelta(days=random.randint(30, 364)) for _ in range(n_antiga)]
    random.shuffle(dates_30)
    dates_pool = dates_30 + dates_any
    random.shuffle(dates_pool)
    dates_iter = iter(dates_pool)

    clients_ordenats = list(comandes_per_client.keys())
    random.shuffle(clients_ordenats)

    for nif in clients_ordenats:
        if n_fac >= n_factures:
            break
        pool = list(comandes_per_client[nif])
        if not pool:
            continue
        random.shuffle(pool)

        is_empresa = nif[0].isalpha()

        while pool and n_fac < n_factures:
            max_c = random.randint(1, 2) if is_empresa else 1
            lot = pool[:max_c]
            pool = pool[max_c:]

            fid = fid_unic()

            # Metode de pagament: el de les comandes si és consistent, sinó aleatori
            mets = {c['metode_pagament'] for c in lot if c['metode_pagament']}
            met_fac = mets.pop() if len(mets) == 1 else random.choice(PAGAMENTS)

            import_total = sum(Decimal(str(c['import_total'])) for c in lot)

            data_fac = next(dates_iter, today - timedelta(days=random.randint(0, 29)))

            fac_bulk.append(Factura(
                id_factura=fid,
                client_id=nif,
                import_total=import_total,
                data=data_fac,
            ))
            for c in lot:
                com_fac_updates.append((c['id_comanda'], fid, met_fac))
            n_fac += 1

            if len(fac_bulk) >= 1000:
                Factura.objects.bulk_create(fac_bulk, batch_size=500)
                _apply_factures(com_fac_updates)
                fac_bulk.clear(); com_fac_updates.clear()

    if fac_bulk:
        Factura.objects.bulk_create(fac_bulk, batch_size=500)
        _apply_factures(com_fac_updates)

    print(f"  ✓ {Factura.objects.count()} factures")

    # ── Resum final ───────────────────────────────────────────────────────────
    print(f"""
╔═══════════════════════════════════════╗
║        Seed completat correctament    ║
╠═══════════════════════════════════════╣
║  Magatzems:  {Magatzem.objects.count():>6}                   ║
║  Ubicacions: {Ubicacio.objects.count():>6}                   ║
║  Superiors:  {Perfil.objects.filter(rol='superior').count():>6}                   ║
║  Mossos:     {Perfil.objects.filter(rol='mosso').count():>6}                   ║
║  Productes:  {Producte.objects.count():>6}                   ║
║  Lots:       {Lot.objects.count():>6}                   ║
║  Clients:    {Client.objects.count():>6}                   ║
║  Comandes:   {Comanda.objects.count():>6}                   ║
║  Factures:   {Factura.objects.count():>6}                   ║
╚═══════════════════════════════════════╝""")


def _apply_factures(updates):
    """Assigna factura_id i metode_pagament a les comandes en bulk."""
    if not updates:
        return
    # Agrupem per factura per fer menys queries
    from django.db import connection
    ids_by_fac = defaultdict(list)
    met_by_com = {}
    for com_id, fac_id, met in updates:
        ids_by_fac[fac_id].append(com_id)
        met_by_com[com_id] = met

    for fac_id, com_ids in ids_by_fac.items():
        Comanda.objects.filter(id_comanda__in=com_ids).update(factura_id=fac_id)

    # Actualitzem metode_pagament on és nul
    for com_id, met in met_by_com.items():
        Comanda.objects.filter(id_comanda=com_id, metode_pagament__isnull=True).update(metode_pagament=met)
