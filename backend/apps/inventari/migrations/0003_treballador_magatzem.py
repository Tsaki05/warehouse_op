from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventari', '0002_nous_camps'),
    ]

    operations = [
        migrations.AddField(
            model_name='treballador',
            name='magatzem',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='treballadors',
                to='inventari.magatzem',
            ),
        ),
    ]
