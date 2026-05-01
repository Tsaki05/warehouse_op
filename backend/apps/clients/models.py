from django.db import models


class Client(models.Model):
    nif               = models.CharField(max_length=20, primary_key=True)
    nom               = models.CharField(max_length=100)
    correu_electronic = models.EmailField()

    class Meta:
        db_table = 'client'
        verbose_name = 'Client'
        verbose_name_plural = 'Clients'

    def __str__(self):
        return f"{self.nom} ({self.nif})"


class Empresa(models.Model):
    client    = models.OneToOneField(Client, on_delete=models.CASCADE, primary_key=True, related_name='empresa')
    adressa   = models.CharField(max_length=200)
    enviament = models.CharField(max_length=50)

    class Meta:
        db_table = 'empresa'
        verbose_name = 'Empresa'
        verbose_name_plural = 'Empreses'

    def __str__(self):
        return str(self.client)


class Individual(models.Model):
    client  = models.OneToOneField(Client, on_delete=models.CASCADE, primary_key=True, related_name='individual')
    telefon = models.CharField(max_length=20)

    class Meta:
        db_table = 'individual'
        verbose_name = 'Individual'
        verbose_name_plural = 'Individuals'

    def __str__(self):
        return str(self.client)
