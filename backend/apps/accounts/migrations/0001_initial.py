from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('inventari', '0003_treballador_magatzem'),
    ]

    operations = [
        migrations.CreateModel(
            name='Perfil',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rol', models.CharField(
                    choices=[('admin', 'Admin'), ('superior', 'Superior'), ('mosso', 'Mosso')],
                    default='mosso',
                    max_length=10,
                )),
                ('magatzem', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='perfils',
                    to='inventari.magatzem',
                )),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='perfil',
                    to='auth.user',
                )),
            ],
        ),
    ]
