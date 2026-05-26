import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventari', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='magatzem',
            name='nom',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='producte',
            name='nom',
            field=models.CharField(default='', max_length=200),
        ),
        migrations.AddField(
            model_name='producte',
            name='descripcio',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='lot',
            name='data_entrada',
            field=models.DateField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
    ]
