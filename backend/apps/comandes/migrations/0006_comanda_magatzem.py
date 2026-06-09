from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('comandes', '0005_comanda_preparat'),
        ('inventari', '0005_lot_superior_to_perfil'),
    ]

    operations = [
        migrations.AddField(
            model_name='comanda',
            name='magatzem',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='comandes',
                to='inventari.magatzem',
            ),
        ),
    ]
