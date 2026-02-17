from django import forms
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth import authenticate, get_user_model

User = get_user_model()


class EmailAuthenticationForm(AuthenticationForm):
    username = forms.EmailField(label="Email")

    def clean(self):
        email = self.cleaned_data.get("username")
        password = self.cleaned_data.get("password")

        if email and password:
            try:
                user_obj = User.objects.get(email=email)
            except User.DoesNotExist:
                raise forms.ValidationError("Credenciais inválidas.")

            self.user_cache = authenticate(
                self.request,
                username=user_obj.username,
                password=password
            )

            if self.user_cache is None:
                raise forms.ValidationError("Credenciais inválidas.")

        return self.cleaned_data
