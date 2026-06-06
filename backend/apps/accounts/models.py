from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


class Perfil(models.Model):
    ROL_ADMIN    = 'admin'
    ROL_SUPERIOR = 'superior'
    ROL_MOSSO    = 'mosso'
    ROL_CHOICES  = [
        (ROL_ADMIN,    'Admin'),
        (ROL_SUPERIOR, 'Superior'),
        (ROL_MOSSO,    'Mosso'),
    ]

    user     = models.OneToOneField(User, on_delete=models.CASCADE, related_name='perfil')
    rol      = models.CharField(max_length=10, choices=ROL_CHOICES, default=ROL_MOSSO)
    telefon  = models.CharField(max_length=20, blank=True, default='')
    magatzem = models.ForeignKey(
        'inventari.Magatzem',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='perfils',
    )

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.rol})"


@receiver(post_save, sender=User)
def crear_perfil(sender, instance, created, **kwargs):
    if created:
        Perfil.objects.create(user=instance)
