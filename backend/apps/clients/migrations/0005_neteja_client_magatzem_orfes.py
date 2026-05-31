from django.db import migrations


def neteja_orfes(apps, schema_editor):
    """
    Elimina registres ClientMagatzem on el client no té cap comanda
    amb productes d'aquell magatzem. Un client sense activitat real
    en un magatzem no ha de ser-ne client.
    """
    schema_editor.execute("""
        DELETE FROM client_magatzem cm
        WHERE NOT EXISTS (
            SELECT 1
            FROM   comanda co
            JOIN   paquet   pa ON pa.comanda_id  = co.id_comanda
            JOIN   lot       lo ON lo.producte_id = pa.producte_id
            JOIN   ubicacio  ub ON ub.id_ubicacio = lo.ubicacio_id
            WHERE  co.client_id  = cm.client_id
            AND    ub.magatzem_id = cm.magatzem_id
        )
    """)


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0004_client_magatzem_through'),
        ('comandes', '0005_comanda_preparat'),
    ]

    operations = [
        migrations.RunPython(neteja_orfes, migrations.RunPython.noop),
    ]
