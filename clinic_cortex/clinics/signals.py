from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Clinic, ClinicSettings


@receiver(post_save, sender=Clinic)
def create_clinic_settings(sender, instance, created, **kwargs):
    if created:
        ClinicSettings.objects.create(clinic=instance)
