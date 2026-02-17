from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):

    model = User

    list_display = (
        'id',
        'username',
        'first_name',
        'last_name',
        'email',
        'role',
        'clinic',
        'is_staff',
    )


    fieldsets = UserAdmin.fieldsets + (
        ('Informações adicionais', {
            'fields': ('role', 'clinic')
        }),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Informações adicionais', {
            'fields': ('role', 'clinic')
        }),
    )
