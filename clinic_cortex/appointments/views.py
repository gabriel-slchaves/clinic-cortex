from django.views.generic import ListView, CreateView, UpdateView, DeleteView
from django.urls import reverse_lazy
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import get_object_or_404
from datetime import date

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import Appointment
from .forms import AppointmentForm
from .services.slot_generator import generate_day_slots
from patients.mixins import ClinicQuerysetMixin
from doctors.models import DoctorProfile


# =============================
# CRUD VIEWS
# =============================

class AppointmentListView(LoginRequiredMixin, ClinicQuerysetMixin, ListView):
    model = Appointment
    template_name = 'appointments/appointment_list.html'
    context_object_name = 'appointments'


class AppointmentCreateView(LoginRequiredMixin, CreateView):
    model = Appointment
    form_class = AppointmentForm
    template_name = 'appointments/appointment_form.html'
    success_url = reverse_lazy('appointments:appointment_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['clinic'] = self.request.user.clinic
        return kwargs

    def form_valid(self, form):
        form.instance.clinic = self.request.user.clinic
        return super().form_valid(form)


class AppointmentUpdateView(LoginRequiredMixin, ClinicQuerysetMixin, UpdateView):
    model = Appointment
    form_class = AppointmentForm
    template_name = 'appointments/appointment_form.html'
    success_url = reverse_lazy('appointments:appointment_list')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['clinic'] = self.request.user.clinic
        return kwargs


class AppointmentDeleteView(LoginRequiredMixin, DeleteView):
    model = Appointment
    template_name = "appointments/appointment_confirm_delete.html"
    success_url = reverse_lazy("appointments:appointment_list")


# =============================
# API VIEW (CORRETA)
# =============================

class DoctorSlotsAPIView(APIView):

    def get(self, request, doctor_id):
        doctor = get_object_or_404(DoctorProfile, id=doctor_id)

        selected_date = request.GET.get("date")
        if not selected_date:
            return Response(
                {"error": "date is required (YYYY-MM-DD)"},
                status=status.HTTP_400_BAD_REQUEST
            )

        selected_date = date.fromisoformat(selected_date)

        slots = generate_day_slots(doctor, selected_date)

        return Response({
            "doctor": doctor.user.get_full_name(),
            "date": selected_date.isoformat(),
            "slots": [
                {
                    "start": slot["start"].isoformat(),
                    "end": slot["end"].isoformat(),
                    "available": slot["available"]
                }
                for slot in slots
            ]
        })
