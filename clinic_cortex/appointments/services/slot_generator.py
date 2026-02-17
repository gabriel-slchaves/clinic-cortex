from datetime import datetime, timedelta
from django.utils import timezone
from appointments.models import Appointment
from .schedule_resolver import resolve_schedule_settings


def generate_day_slots(doctor, date):

    settings = resolve_schedule_settings(doctor)

    slots = []

    # ✅ Agora acessando como OBJETO, não como dict
    start_time = settings.start_time
    end_time = settings.end_time
    break_start = settings.break_start
    break_end = settings.break_end
    slot_duration = settings.slot_duration

    current = datetime.combine(date, start_time)
    end_datetime = datetime.combine(date, end_time)

    while current < end_datetime:
        slot_end = current + timedelta(minutes=slot_duration)

        # Ignora horário de pausa (se existir)
        if not (break_start and break_end and break_start <= current.time() < break_end):

            conflict = Appointment.objects.filter(
                doctor=doctor,
                status="scheduled",
                start_datetime__lt=slot_end,
                end_datetime__gt=current
            ).exists()

            slots.append({
                "start": current,
                "end": slot_end,
                "available": not conflict
            })

        current += timedelta(minutes=slot_duration)

    return slots
