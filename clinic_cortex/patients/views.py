from django.urls import reverse_lazy
from django.views.generic import ListView, CreateView, UpdateView, DeleteView
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import JsonResponse
from django.db.models import Q
from .models import Patient
from .forms import PatientForm
from .mixins import ClinicQuerysetMixin
from django.contrib.auth.decorators import login_required


class PatientListView(LoginRequiredMixin, ClinicQuerysetMixin, ListView):
    model = Patient
    template_name = 'patients/patients.html'
    context_object_name = 'patients'


class PatientCreateView(LoginRequiredMixin, CreateView):
    model = Patient
    form_class = PatientForm
    template_name = 'patients/patient_form.html'
    success_url = reverse_lazy('patient_list')

    def form_valid(self, form):
        form.instance.clinic = self.request.user.clinic
        return super().form_valid(form)


class PatientUpdateView(LoginRequiredMixin, ClinicQuerysetMixin, UpdateView):
    model = Patient
    form_class = PatientForm
    template_name = 'patients/patient_form.html'
    success_url = reverse_lazy('patient_list')


class PatientDeleteView(LoginRequiredMixin, ClinicQuerysetMixin, DeleteView):
    model = Patient
    template_name = 'patients/patient_confirm_delete.html'
    success_url = reverse_lazy('patient_list')


@login_required
def patient_search(request):
    query = request.GET.get("q", "")

    patients = Patient.objects.filter(
        clinic=request.user.clinic
    ).filter(
        Q(full_name__icontains=query) |
        Q(cpf__icontains=query) |
        Q(email__icontains=query) |
        Q(phone__icontains=query)
    )[:20]

    data = [
        {
            "id": p.id,
            "full_name": p.full_name,
            "cpf": p.cpf,
            "email": p.email,
            "phone": p.phone,
        }
        for p in patients
    ]

    return JsonResponse(data, safe=False)
