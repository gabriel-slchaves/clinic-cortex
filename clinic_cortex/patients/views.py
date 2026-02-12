from django.shortcuts import render
from .mixins import ClinicQuerysetMixin #Import Mixin

from django.views.generic import ListView
from django.contrib.auth.mixins import LoginRequiredMixin
from .models import Patient


class PatientListView(LoginRequiredMixin, ClinicQuerysetMixin, ListView):
    model = Patient
    template_name = 'patients/patients.html'
    context_object_name = 'patients'
    
def patients(request):
    return render(request, 'patients/patients.html')