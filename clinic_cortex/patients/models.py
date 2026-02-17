from django.db import models
from clinics.models import Clinic


class Patient(models.Model):
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name='patients'
    )

    full_name = models.CharField(max_length=255, verbose_name="Nome Completo")
    cpf = models.CharField(max_length=11, unique=True, null=True, verbose_name="CPF")
    email = models.EmailField(blank=True, null=True, verbose_name="E-mail")
    phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="Telefone")
    #is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.full_name
    
    class Meta: #Subclasse para definir METADADOS
       verbose_name = "Paciente"
       verbose_name_plural = "Pacientes"