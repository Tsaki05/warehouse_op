from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_perfil_telefon'),
        ('inventari', '0004_indexes_estoc_categoria'),
    ]

    operations = [
        # 1. Elimina l'FK antiga (Lot → Treballador)
        migrations.RemoveField(
            model_name='lot',
            name='superior',
        ),
        # 2. Afegeix la nova FK (Lot → Perfil), nullable per compatibilitat de dades
        migrations.AddField(
            model_name='lot',
            name='superior',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='lots',
                to='accounts.perfil',
            ),
        ),
        # 3. Elimina la taula Treballador (ja no hi ha cap FK que hi apunti)
        migrations.DeleteModel(
            name='Treballador',
        ),
    ]
