from django.db import models
from clinics.models import Clinic
from patients.models import Patient
from django.conf import settings


class Appointment(models.Model):
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name='appointments'
    )

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='appointments'
    )

    professional = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='appointments'
    )

    scheduled_date = models.DateTimeField()
    
    STATUS_CHOICES = (
        ('scheduled', 'Agendado'),
        ('done', 'Realizado'),
        ('canceled', 'Cancelado'),
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='Agendado'
    )

    def __str__(self):
        return f"{self.patient} - {self.scheduled_date}"

    class Meta: #Subclasse para definir METADADOS
        verbose_name = "Agendamento"
        verbose_name_plural = "Agendamentos"