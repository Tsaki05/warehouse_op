import re
import uuid
from django.db import transaction
from .models import Magatzem, Treballador, Ubicacio, Lot, Producte

_COD3 = re.compile(r'^[A-Za-z0-9]{3}$')


def crear_magatzem(nom):
    while True:
        codi = uuid.uuid4().hex[:8].upper()
        if not Magatzem.objects.filter(pk=codi).exists():
            break
    return Magatzem.objects.create(codi_magatzem=codi, nom=nom)


def get_superior_for_mag(magatzem):
    """Retorna el primer treballador superior del magatzem, o None."""
    return Treballador.objects.filter(magatzem=magatzem, superior=True).first()


@transaction.atomic
def crear_producte_amb_lots(producte_data, lots_data):
    """
    Crea un Producte i els seus Lots en una transacció atòmica.
    Rep producte_data ja validat pel serialitzador i lots_data del request.
    Retorna la instància Producte creada i refrescada.
    """
    producte = Producte.objects.create(**producte_data)

    for lot_d in lots_data:
        try:
            ubicacio = Ubicacio.objects.select_related('magatzem').get(pk=lot_d.get('ubicacio'))
        except Ubicacio.DoesNotExist:
            raise ValueError(f"Ubicació {lot_d.get('ubicacio')} no trobada.")

        superior = get_superior_for_mag(ubicacio.magatzem)
        if not superior:
            raise ValueError(f"No hi ha superior al magatzem {ubicacio.magatzem.nom}.")

        Lot.objects.create(
            producte=producte,
            ubicacio=ubicacio,
            superior=superior,
            quantitat=lot_d.get('quantitat', 1),
        )

    producte.refresh_from_db()
    return producte


@transaction.atomic
def crear_ubicacions_bulk(magatzem_id, passadis, combinacions):
    """
    Crea múltiples ubicacions per a un passadís donat.
    combinacions: llista de {'estant': str, 'alcada': str}
    Llança ValueError si alguna combinació ja existeix.
    Retorna el nombre d'ubicacions creades.
    """
    if not _COD3.match(passadis):
        raise ValueError(f"El passadís '{passadis}' ha de tenir exactament 3 caràcters alfanumèrics.")
    invalids = [
        f"{c.get('estant')}/{c.get('alcada')}"
        for c in combinacions
        if not _COD3.match(c.get('estant', '')) or not _COD3.match(c.get('alcada', ''))
    ]
    if invalids:
        raise ValueError(f"Codis invàlids (han de ser 3 car.): {', '.join(invalids[:5])}")

    existents = [
        f"{passadis}-{c['estant']}-{c['alcada']}"
        for c in combinacions
        if Ubicacio.objects.filter(
            magatzem_id=magatzem_id,
            passadis=passadis,
            estant=c['estant'],
            alcada=c['alcada'],
        ).exists()
    ]
    if existents:
        resum = ', '.join(existents[:5])
        if len(existents) > 5:
            resum += f' i {len(existents) - 5} més'
        raise ValueError(f"Ja existeixen: {resum}")

    Ubicacio.objects.bulk_create([
        Ubicacio(
            magatzem_id=magatzem_id,
            passadis=passadis,
            estant=c['estant'],
            alcada=c['alcada'],
        )
        for c in combinacions
    ])
    return len(combinacions)


def resolve_lot_superior(ubicacio, superior=None):
    """Retorna el superior indicat o el del magatzem de la ubicació si no n'hi ha."""
    if not superior and ubicacio:
        return get_superior_for_mag(ubicacio.magatzem)
    return superior
