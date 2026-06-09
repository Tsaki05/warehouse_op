from django.db import models
from django.contrib.auth import get_user_model
from apps.clients.models import Client
from apps.inventari.models import Producte, Magatzem
from django.core.validators import RegexValidator

User = get_user_model()


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
    data         = models.DateField(db_index=True)

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
    data            = models.DateField(auto_now_add=True, db_index=True)
    factura         = models.ForeignKey(
        Factura, on_delete=models.SET_NULL, null=True, blank=True, related_name='comandes'
    )
    metode_pagament = models.IntegerField(choices=MetodePagament.choices, null=True, blank=True)
    enviament       = models.BooleanField(default=False, db_index=True)
    import_total    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    magatzem        = models.ForeignKey(
        Magatzem, on_delete=models.SET_NULL, null=True, blank=True, related_name='comandes'
    )
    preparat        = models.BooleanField(default=False, db_index=True)
    preparat_per    = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='comandes_preparades'
    )

    class Meta:
        db_table = 'comanda'
        verbose_name = 'Comanda'
        verbose_name_plural = 'Comandes'
        constraints = [
            models.CheckConstraint(
                check=models.Q(id_comanda__regex=r'^[a-zA-Z0-9]{5}$'),
                name='id_comanda_longitud_exacta_5'
            )
        ]
    def __str__(self):
        return f"Comanda {self.id_comanda} — {self.client_id}"


class Paquet(models.Model):
    comanda   = models.ForeignKey(Comanda, on_delete=models.CASCADE, related_name='paquets')
    producte  = models.ForeignKey(Producte, on_delete=models.PROTECT, related_name='paquets')
    quantitat = models.IntegerField()
    preu      = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'paquet'
        verbose_name = 'Paquet'
        verbose_name_plural = 'Paquets'
        
        constraints = [
            models.UniqueConstraint(
                fields=['comanda', 'producte'],
                name='comanda_producte_unic'
            ),
            models.CheckConstraint(
                
                check=~models.Q(quantitat=0), 
                name='quantitat_no_es_zero'
            )
        ]

    def __str__(self):
        return f"{self.producte_id} x{self.quantitat} @ {self.comanda_id}"
