from django.contrib import admin

from .models import Specialty, DoctorProfile

@admin.register(Specialty)
class SpecialtyAdmin(admin.ModelAdmin):
    list_display = ("name", "clinic")


@admin.register(DoctorProfile)
class DoctorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "clinic", "specialty", "crm")
