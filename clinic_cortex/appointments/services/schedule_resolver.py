def resolve_schedule_settings(doctor):
    """
    Resolve as configurações finais de agenda do médico,
    aplicando fallback para as configurações da clínica.
    """

    doctor_settings = getattr(doctor, "schedule_settings", None)
    clinic_settings = doctor.clinic.settings

    return {
        "start_time": doctor_settings.start_time if doctor_settings and doctor_settings.start_time else clinic_settings.start_time,
        "end_time": doctor_settings.end_time if doctor_settings and doctor_settings.end_time else clinic_settings.end_time,
        "break_start": doctor_settings.break_start if doctor_settings and doctor_settings.break_start else clinic_settings.break_start,
        "break_end": doctor_settings.break_end if doctor_settings and doctor_settings.break_end else clinic_settings.break_end,
        "slot_duration": doctor_settings.slot_duration if doctor_settings and doctor_settings.slot_duration else clinic_settings.slot_duration,
        "allow_weekends": doctor_settings.allow_weekends if doctor_settings and doctor_settings.allow_weekends is not None else clinic_settings.allow_weekends,
    }

from clinics.models import ClinicSettings

def resolve_schedule_settings(doctor):
    clinic = doctor.clinic

    clinic_settings, created = ClinicSettings.objects.get_or_create(
        clinic=clinic
    )

    return clinic_settings