from django import forms
from .models import Appointment
from doctors.models import DoctorProfile
from patients.models import Patient


class AppointmentForm(forms.ModelForm):

    class Meta:
        model = Appointment
        fields = ['patient', 'doctor', 'scheduled_date', 'status']

    def __init__(self, *args, **kwargs):
        clinic = kwargs.pop('clinic', None)
        super().__init__(*args, **kwargs)

        if clinic:
            self.fields['patient'].queryset = Patient.objects.filter(clinic=clinic)
            self.fields['doctor'].queryset = DoctorProfile.objects.filter(clinic=clinic)

    scheduled_at = forms.SplitDateTimeField(
        widget=forms.SplitDateTimeWidget(
            date_attrs={
                "type": "date",
                "class": "w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            },
            time_attrs={
                "type": "time",
                "class": "w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            },
        )
    )
    
    class Meta:
        model = Appointment
        fields = "__all__"
        widgets = {
            "patient": forms.Select(attrs={
                "class": "select2 w-full"
            }),
            "doctor": forms.Select(attrs={
                "class": "select2 w-full"
            }),
        }