from django.db import models
from django.conf import settings

class Specialty(models.Model):
    clinic = models.ForeignKey(
        'clinics.Clinic',
        on_delete=models.CASCADE,
        related_name='specialties',
    )

    name = models.CharField(max_length=150, verbose_name="Especialidade")

"""     def __str__(self):
        return f"{self.name} - {self.corporate_name}" """

class DoctorProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, #Usuário definido com base no user (settings)
        #'users.User',
        on_delete=models.CASCADE,
        verbose_name="Usuário",
        related_name='doctor_profile'
    )

    clinic = models.ForeignKey(
        'clinics.Clinic',
        on_delete=models.CASCADE,
        verbose_name="Clínica",
        related_name='doctors'
    )

    specialty = models.ForeignKey(
        Specialty,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Especialidade",
    )

    crm = models.CharField(max_length=20, verbose_name="CRM",)

    agenda_color = models.CharField(
        max_length=7,
        verbose_name="Cor da Agenda",
        default="#3B82F6"
    )

    def save(self, *args, **kwargs):
        if self.user.role != 'doctor':
            raise ValueError("DoctorProfile só pode ser criado para usuários com role 'doctor'")
        super().save(*args, **kwargs)

    def get_effective_schedule(self):
        # Retorna as configurações finais da agenda considerando herança da clínica
        clinic_settings = self.clinic.settings

        if hasattr(self, "schedule_settings"):
            settings = self.schedule_settings
        else:
            settings = None

        return {
            "start_time": settings.start_time if settings and settings.start_time else clinic_settings.start_time,
            "end_time": settings.end_time if settings and settings.end_time else clinic_settings.end_time,
            "break_start": settings.break_start if settings and settings.break_start else clinic_settings.break_start,
            "break_end": settings.break_end if settings and settings.break_end else clinic_settings.break_end,
            "slot_duration": settings.slot_duration if settings and settings.slot_duration else clinic_settings.slot_duration,
            "allow_weekends": settings.allow_weekends if settings and settings.allow_weekends is not None else clinic_settings.allow_weekends,
        }
            
class DoctorScheduleSettings(models.Model):
    doctor = models.OneToOneField(
        DoctorProfile,
        on_delete=models.CASCADE,
        related_name="schedule_settings"
    )

    # Se null → herda da clínica
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)

    break_start = models.TimeField(null=True, blank=True)
    break_end = models.TimeField(null=True, blank=True)

    slot_duration = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Duração da consulta em minutos"
    )

    allow_weekends = models.BooleanField(
        null=True,
        blank=True,
        help_text="Se null → usa configuração da clínica"
    )

    google_calendar_id = models.CharField(
        max_length=255,
        null=True,
        blank=True
    )

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Schedule Settings - {self.doctor.user.get_full_name()}"
    
    # ⚠️ REGRA DE HERANÇA DO SISTEMA:
    # Se um campo estiver null neste model, o sistema deve usar o valor definido em ClinicSettings.
    # Isso permite:
    # - Configuração padrão da clínica
    # - Customização individual por médico
    # - Escalabilidade futura por plano