from django.db import models
from django.core.validators import RegexValidator

class Magatzem(models.Model):
    codi_magatzem = models.CharField(
        validators=[
            RegexValidator(
                regex='^[a-zA-Z0-9]{8}$', 
                message='El codi ha de tenir exactament 8 caràcters.',
                code='invalid_length'
            )
        ],
        primary_key=True)

    class Meta:
        db_table = 'magatzem'
        verbose_name = 'Magatzem'
        verbose_name_plural = 'Magatzems'

        constraints = [
            models.CheckConstraint(
                check=models.Q(codi_magatzem__regex=r'^[a-zA-Z0-9]{8}$'),
                name='longitud_exacta_8'
            )
        ]

    def __str__(self):
        return self.codi_magatzem


class Ubicacio(models.Model):
    id_ubicacio = models.AutoField(primary_key=True)
    magatzem  = models.ForeignKey(Magatzem, on_delete=models.CASCADE, related_name='ubicacions')
    passadis  = models.CharField(
        validators=[
            RegexValidator(
                regex='^[a-zA-Z0-9]{3}$', 
                message='El passadís ha de tenir exactament 3 caràcters.',
                code='invalid_length'
            )
        ]
    )
    estant    = models.CharField(
        validators=[
            RegexValidator(
                regex='^[a-zA-Z0-9]{3}$', 
                message='L’estant ha de tenir exactament 3 caràcters.',
                code='invalid_length'
            )
        ]
    )
    alcada    = models.CharField(
        validators=[
            RegexValidator(
                regex='^[a-zA-Z0-9]{3}$', 
                message='L’alcada ha de tenir exactament 3 caràcters.',
                code='invalid_length'
            )
        ]
    )

    class Meta:
        db_table = 'ubicacio'
        verbose_name = 'Ubicació'
        verbose_name_plural = 'Ubicacions'

        constraints = [
            models.UniqueConstraint(
                fields=['magatzem', 'passadis', 'estant', 'alcada'], 
                name='unique_ubicacio_total'
            ),

            models.CheckConstraint(
                check=models.Q(passadis__regex=r'^[a-zA-Z0-9]{3}$'),
                name='longitud_exacta_3'
            ),
            models.CheckConstraint(
                check=models.Q(estant__regex=r'^[a-zA-Z0-9]{3}$'),
                name='longitud_exacta_3'
            ),
            models.CheckConstraint(
                check=models.Q(alcada__regex=r'^[a-zA-Z0-9]{3}$'),
                name='longitud_exacta_3'
            )
        ]

    def __str__(self):
        return f"{self.magatzem_id} — {self.passadis}/{self.estant}/{self.alcada}"


class Treballador(models.Model):
    telefon = models.CharField(max_length=20, primary_key=True)
    nom     = models.CharField(max_length=100)
    superior = models.BooleanField(default=False)

    class Meta:
        db_table = 'treballador'
        verbose_name = 'Treballador'
        verbose_name_plural = 'Treballadors'

    def __str__(self):
        carrec = 'Superior' if self.superior else 'Mosso'
        return f"{self.nom} ({carrec}) - {self.telefon}"


class Producte(models.Model):
    class Mida(models.TextChoices):
        PETIT  = 'petit',  'Petit'
        MITJA  = 'mitja',  'Mitjà'
        GRAN   = 'gran',   'Gran'
        GEGANT = 'gegant', 'Gegant'

    id_producte    = models.CharField(
        validators=[
            RegexValidator(
                regex='^[a-zA-Z0-9]{12}$',
                message='El ID del producte ha de tenir exactament 12 caràcters.',
                code='invalid_length'
            )
        ],
        primary_key=True
    )
    codi_proveidor = models.CharField(max_length=50)
    estoc_total    = models.IntegerField(default=0, min_value=0)
    preu           = models.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    categoria      = models.CharField(max_length=6, choices=Mida.choices)

    class Meta:
        db_table = 'producte'
        verbose_name = 'Producte'
        verbose_name_plural = 'Productes'
        constraints = [
            models.CheckConstraint(
                check=models.Q(id_producte__regex=r'^[a-zA-Z0-9]{12}$'),
                name='longitud_exacta_12'
            )
        ]

    def __str__(self):
        return f"{self.id_producte} ({self.categoria})"


class Lot(models.Model):
    ubicacio  = models.ForeignKey(Ubicacio, on_delete=models.RESTRICT, related_name='lots')
    producte  = models.ForeignKey(Producte, on_delete=models.RESTRICT, related_name='lots')
    superior  = models.ForeignKey(Treballador, on_delete=models.RESTRICT, related_name='lots')
    quantitat = models.IntegerField(min_value=1)

    class Meta:
        db_table = 'lot'
        verbose_name = 'Lot'
        verbose_name_plural = 'Lots'
        unique_together = [['ubicacio', 'producte']]

    def __str__(self):
        return f"Lot {self.producte_id} @ {self.ubicacio_id} ({self.quantitat} unitats)"
