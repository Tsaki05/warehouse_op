from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('comandes', '0006_comanda_magatzem'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='comanda',
            index=models.Index(
                fields=['magatzem', 'factura', 'data'],
                name='comanda_mag_fac_data_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='comanda',
            index=models.Index(
                fields=['magatzem', 'preparat', 'preparat_per'],
                name='comanda_mag_prep_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='comanda',
            index=models.Index(
                fields=['factura', 'data'],
                name='comanda_fac_data_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='comanda',
            index=models.Index(
                fields=['magatzem', 'client'],
                name='comanda_mag_client_idx',
            ),
        ),
    ]
