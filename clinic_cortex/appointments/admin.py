from django.contrib import admin
from .models import Appointment


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):

    # Campos exibidos na listagem principal do admin
    list_display = (
        'id',                # ID do agendamento
        'patient',           # Paciente relacionado
        'doctor',            # Médico responsável pelo agendamento
        'start_datetime',
        'start_datetime',
        'status',            # Status
    )

    # Filtros laterais do admin
    list_filter = (
        'status',
        'doctor',   # Atualizado de professional para doctor
    )

    # Campo de busca
    search_fields = (
        'patient__full_name',   # Busca pelo nome do paciente
        'doctor__user__first_name',  # Busca pelo nome do médico
        'doctor__user__last_name',
    )