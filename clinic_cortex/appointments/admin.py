from django.contrib import admin
from .models import Appointment

@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'patient',
        'professional',
        'scheduled_date',
        'status'
    )
    list_filter = ('status', 'professional',)
    search_fields = ('patient__full_name',)
    ordering = ('-scheduled_date',)
