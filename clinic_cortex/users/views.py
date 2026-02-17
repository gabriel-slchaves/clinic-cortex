from django.shortcuts import render
from django.contrib.auth.views import LoginView
from .forms import EmailAuthenticationForm


class CustomLoginView(LoginView):
    authentication_form = EmailAuthenticationForm
    template_name = "registration/login.html"
