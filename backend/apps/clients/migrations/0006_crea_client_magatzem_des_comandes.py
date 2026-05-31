from django.db import migrations


def crea_des_comandes(apps, schema_editor):
    """
    Crea les associacions ClientMagatzem que falten: clients que tenen
    comandes en un magatzem però no tenen el registre corresponent.
    Això passa quan el seed vell assignava magatzems aleatòriament
    sense tenir en compte on eren els productes de les comandes.
    """
    schema_editor.execute("""
        INSERT INTO client_magatzem (client_id, magatzem_id, data_alta)
        SELECT DISTINCT co.client_id, ub.magatzem_id, CURRENT_DATE
        FROM   comanda  co
        JOIN   paquet   pa ON pa.comanda_id  = co.id_comanda
        JOIN   lot      lo ON lo.producte_id = pa.producte_id
        JOIN   ubicacio ub ON ub.id_ubicacio = lo.ubicacio_id
        WHERE  NOT EXISTS (
            SELECT 1
            FROM   client_magatzem cm
            WHERE  cm.client_id   = co.client_id
            AND    cm.magatzem_id = ub.magatzem_id
        )
    """)


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0005_neteja_client_magatzem_orfes'),
    ]

    operations = [
        migrations.RunPython(crea_des_comandes, migrations.RunPython.noop),
    ]
