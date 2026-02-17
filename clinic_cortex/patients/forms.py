from django import forms
from .models import Patient

class PatientForm(forms.ModelForm):
    class Meta:
        model = Patient
        fields = [
            "full_name",
            "cpf",
            "email",
            "phone",
        ]

        widgets = {
            "full_name": forms.TextInput(attrs={
                "class": "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition",
                "placeholder": "Nome completo"
            }),
            "cpf": forms.TextInput(attrs={
                "class": "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition",
                "placeholder": "000.000.000-00"
            }),
            "email": forms.EmailInput(attrs={
                "class": "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition",
                "placeholder": "email@exemplo.com"
            }),
            "phone": forms.TextInput(attrs={
                "class": "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition",
                "placeholder": "(00) 00000-0000"
            }),
        }
