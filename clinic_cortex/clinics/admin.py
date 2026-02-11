from django.contrib import admin
from .models import Clinic

@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display = ("corporate_name", "trade_name", "cnpj", "is_active")
    search_fields = ("corporate_name", "trade_name", "cnpj")
    list_filter = ("is_active",)