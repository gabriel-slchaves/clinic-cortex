from django.urls import path
from .views import (
    PatientListView,
    PatientCreateView,
    PatientUpdateView,
    PatientDeleteView,
    patient_search
)

urlpatterns = [
    path('', PatientListView.as_view(), name='patient_list'),
    path('novo/', PatientCreateView.as_view(), name='patients_create'),
    path('<int:pk>/editar/', PatientUpdateView.as_view(), name='patients_update'),
    path('<int:pk>/deletar/', PatientDeleteView.as_view(), name='patients_delete'),
    path('search/', patient_search, name='patient_search'),
]
