from django.contrib import admin
from django.urls import path, include
from django.contrib.auth import views as auth_views
from users.views import CustomLoginView

urlpatterns = [
    path('admin/', admin.site.urls),
    path("accounts/login/", CustomLoginView.as_view(), name="login"),   
    path("accounts/logout/",auth_views.LogoutView.as_view(), name="logout"),
    path('patients/', include('patients.urls')),
    path('appointments/', include('appointments.urls')),
    path('api/', include('appointments.urls'))
]