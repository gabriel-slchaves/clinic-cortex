from django.db import models
from django.core.validators import RegexValidator


class Clinic(models.Model):
    corporate_name = models.CharField(
        max_length=200,
        verbose_name='Razão Social'
    )

    trade_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Nome Fantasia"
    )

    cnpj = models.CharField(
        max_length=14,
        unique=True,
        validators=[
            RegexValidator(
                regex=r'^\d{14}$',
                message="O CNPJ deve conter exatamente 14 números."
            )
        ],
        verbose_name="CNPJ"
    )

    email = models.EmailField(blank=True, null=True, verbose_name="E-mail")
    phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="Telefone")

    street = models.CharField(max_length=255, blank=True, verbose_name="Rua")
    number = models.CharField(max_length=20, blank=True, verbose_name="Número")
    complement = models.CharField(max_length=100, blank=True, verbose_name="Complemento")
    neighborhood = models.CharField(max_length=100, blank=True, verbose_name="Bairro")
    city = models.CharField(max_length=100, blank=True, verbose_name="Cidade")
    state = models.CharField(max_length=2, blank=True, verbose_name="Estado")
    zip_code = models.CharField(max_length=8, blank=True, verbose_name="CEP")

    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.trade_name or self.corporate_name

    class Meta: #Subclasse para definir METADADOS
        verbose_name = "Clínica"
        verbose_name_plural = "Clínicas"
        ordering = ['trade_name', 'corporate_name']