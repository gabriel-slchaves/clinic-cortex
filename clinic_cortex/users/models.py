from django.contrib.auth.models import AbstractUser
from django.db import models
from clinics.models import Clinic

class User(AbstractUser):
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )

    ROLE_CHOICES = (
        ('admin', 'Administrador'),
        ('doctor', 'Médico'),
        ('reception', 'Recepção'),
    )

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='reception',
        verbose_name="Tipo de Usuário"
    )

    def __str__(self):
        return f"{self.username} - {self.clinic}"

    class Meta: #Subclasse para definir METADADOS
       verbose_name = "Usuário"
       verbose_name_plural = "Usuários"