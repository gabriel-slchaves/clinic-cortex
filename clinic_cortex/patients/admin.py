from django.contrib import admin
from .models import Patient

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('id', 'full_name', 'cpf', 'clinic')
    search_fields = ('full_name', 'cpf')
    list_filter = ('clinic',)
    ordering = ('full_name',)