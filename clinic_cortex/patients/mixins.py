class ClinicQuerysetMixin:

    def get_queryset(self):
        return super().get_queryset().filter(
            clinic=self.request.user.clinic,
        )