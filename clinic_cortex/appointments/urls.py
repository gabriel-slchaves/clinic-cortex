from django.urls import path
from .views import AppointmentListView, AppointmentCreateView, AppointmentUpdateView, AppointmentDeleteView
from .views import DoctorSlotsAPIView

urlpatterns = [
    path('', AppointmentListView.as_view(), name='appointment_list'),
    path('create/', AppointmentCreateView.as_view(), name='appointment_create'),
    path("<int:pk>/update/", AppointmentUpdateView.as_view(), name="appointment_update"),
    path("<int:pk>/delete/", AppointmentDeleteView.as_view(), name="appointment_delete"),
    path("doctor/<int:doctor_id>/slots/",DoctorSlotsAPIView.as_view(),name="doctor_slots"),
    ]
