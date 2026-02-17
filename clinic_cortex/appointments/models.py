from django.db import models
from django.db.models import Q
from clinics.models import Clinic
from patients.models import Patient
from doctors.models import DoctorProfile


class Appointment(models.Model):
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        verbose_name="Clínica",
        related_name='appointments',
    )

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        verbose_name="Paciente",
        related_name='appointments'
    )

    doctor = models.ForeignKey(
        DoctorProfile,
        on_delete=models.CASCADE,
        verbose_name="Médico responsável",
        related_name='appointments'
    )

    start_datetime = models.DateTimeField(verbose_name="Início da Consulta")
    end_datetime = models.DateTimeField(verbose_name="Fim da Consulta")

    STATUS_CHOICES = (
        ('scheduled', 'Agendado'),
        ('done', 'Realizado'),
        ('canceled', 'Cancelado'),
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        verbose_name="Status da consulta",
        default='scheduled'
    )

    def save(self, *args, **kwargs):
        # 🔒 Garantia multi-tenant
        if self.patient.clinic != self.clinic:
            raise ValueError("Paciente não pertence a esta clínica")

        if self.doctor.clinic != self.clinic:
            raise ValueError("Médico não pertence a esta clínica")

        # ⏱️ Validação temporal
        if self.start_datetime >= self.end_datetime:
            raise ValueError("Horário inválido.")

        # 🚫 Verificação de conflito
        conflict = Appointment.objects.filter(
            doctor=self.doctor,
            status='scheduled'
        ).exclude(pk=self.pk).filter(
            Q(start_datetime__lt=self.end_datetime) &
            Q(end_datetime__gt=self.start_datetime)
        ).exists()

        if conflict:
            raise ValueError("Já existe um agendamento nesse horário.")

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.patient} - {self.start_datetime}"

    class Meta:
        verbose_name = "Agendamento"
        verbose_name_plural = "Agendamentos"
        ordering = ['start_datetime']
