from django.db import models


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
    magatzem  = models.ForeignKey(Magatzem, on_delete=models.CASCADE, related_name='ubicacions')
    passadis  = models.CharField(max_length=3, min_length=3)
    estant    = models.CharField(max_length=3, min_length=3)
    alcada    = models.CharField(max_length=3, min_length=3)

    class Meta:
        db_table = 'ubicacio'
        verbose_name = 'Ubicació'
        verbose_name_plural = 'Ubicacions'

    def __str__(self):
        return f"{self.magatzem_id} — {self.passadis}/{self.estant}/{self.alcada}"


class Treballador(models.Model):
    telefon = models.CharField(max_length=20, primary_key=True)
    nom     = models.CharField(max_length=100)

    class Meta:
        db_table = 'treballador'
        verbose_name = 'Treballador'
        verbose_name_plural = 'Treballadors'

    def __str__(self):
        return f"{self.nom} ({self.telefon})"


class Superior(models.Model):
    treballador = models.OneToOneField(
        Treballador, on_delete=models.CASCADE, primary_key=True, related_name='superior'
    )

    class Meta:
        db_table = 'superior'
        verbose_name = 'Superior'
        verbose_name_plural = 'Superiors'

    def __str__(self):
        return str(self.treballador)


class Mosso(models.Model):
    treballador = models.OneToOneField(
        Treballador, on_delete=models.CASCADE, primary_key=True, related_name='mosso'
    )

    class Meta:
        db_table = 'mosso'
        verbose_name = 'Mosso'
        verbose_name_plural = 'Mossos'

    def __str__(self):
        return str(self.treballador)


class Producte(models.Model):
    class Mida(models.TextChoices):
        PETIT  = 'petit',  'Petit'
        MITJA  = 'mitja',  'Mitjà'
        GRAN   = 'gran',   'Gran'
        GEGANT = 'gegant', 'Gegant'

    id_producte    = models.CharField(max_length=12, primary_key=True)
    codi_proveidor = models.CharField(max_length=50)
    estoc_total    = models.IntegerField(default=0, min_value=0)
    preu           = models.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    categoria      = models.CharField(max_length=6, choices=Mida.choices)

    class Meta:
        db_table = 'producte'
        verbose_name = 'Producte'
        verbose_name_plural = 'Productes'

    def __str__(self):
        return f"{self.id_producte} ({self.categoria})"


class Lot(models.Model):
    ubicacio  = models.ForeignKey(Ubicacio, on_delete=models.CASCADE, related_name='lots')
    producte  = models.ForeignKey(Producte, on_delete=models.CASCADE, related_name='lots')
    superior  = models.ForeignKey(Superior, on_delete=models.CASCADE, related_name='lots')
    quantitat = models.IntegerField(min_value=1)

    class Meta:
        db_table = 'lot'
        verbose_name = 'Lot'
        verbose_name_plural = 'Lots'
        unique_together = [['ubicacio', 'producte']]

    def __str__(self):
        return f"Lot {self.producte_id} @ {self.ubicacio_id}"
