from django.db import models
from apps.clients.models import Client
from apps.inventari.models import Producte
from django.core.validators import RegexValidator


class Factura(models.Model):
    id_factura   = models.CharField(
        validators=[
            RegexValidator(
                regex='^[a-zA-Z0-9]{5}$',
                message='El ID de la factura ha de tenir exactament 5 caràcters.',
                code='invalid_length'
            )
        ],
        primary_key=True
    )
    client       = models.ForeignKey(Client, on_delete=models.PROTECT, related_name='factures')
    import_total = models.DecimalField(max_digits=12, decimal_places=2)
    data         = models.DateField()

    class Meta:
        db_table = 'factura'
        verbose_name = 'Factura'
        verbose_name_plural = 'Factures'
        constraints = [
            models.CheckConstraint(
                check=models.Q(id_factura__regex=r'^[a-zA-Z0-9]{5}$'),
                name='longitud_exacta_5'
            )
        ]

    def __str__(self):
        return f"Factura {self.id_factura} — {self.client_id}"


class Comanda(models.Model):
    class MetodePagament(models.IntegerChoices):
        TARGETA      = 1, 'Targeta'
        TRANSFERENCIA = 2, 'Transferència'
        EFECTIU      = 3, 'Efectiu'

    id_comanda      = models.CharField(
        validators=[
            RegexValidator(
                regex='^[a-zA-Z0-9]{5}$',
                message='El ID de la comanda ha de tenir exactament 5 caràcters.',
                code='invalid_length'
            )
        ],
        primary_key=True
    )
    client          = models.ForeignKey(Client, on_delete=models.PROTECT, related_name='comandes')
    factura         = models.ForeignKey(
        Factura, on_delete=models.SET_NULL, null=True, blank=True, related_name='comandes'
    )
    metode_pagament = models.IntegerField(choices=MetodePagament.choices)
    enviament       = models.BooleanField(default=False)
    import_total    = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'comanda'
        verbose_name = 'Comanda'
        verbose_name_plural = 'Comandes'
        constraints = [
            models.CheckConstraint(
                check=models.Q(id_comanda__regex=r'^[a-zA-Z0-9]{5}$'),
                name='longitud_exacta_5'
            )
        ]
    def __str__(self):
        return f"Comanda {self.id_comanda} — {self.client_id}"


class Paquet(models.Model):
    comanda   = models.ForeignKey(Comanda, on_delete=models.CASCADE, related_name='paquets')
    producte  = models.ForeignKey(Producte, on_delete=models.PROTECT, related_name='paquets')
    quantitat = models.IntegerField(check=models.Q(quantitat__gt=0))
    preu      = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'paquet'
        verbose_name = 'Paquet'
        verbose_name_plural = 'Paquets'
        unique_together = [['comanda', 'producte']]

    def __str__(self):
        return f"{self.producte_id} x{self.quantitat} @ {self.comanda_id}"
