import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('comandes', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='comanda',
            name='data',
            field=models.DateField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
    ]
