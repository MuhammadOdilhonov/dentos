from django.contrib import admin
from .models import (
    Employee, Patient, Appointment, FinancialTransaction, ClinicTask,
    WarehouseItem, DentalLabOrder, DentalTechnician, ClinicTenant,
    PlatformSetting, PlatformUser, Branch, Workplace, Specialty
)

admin.site.register(Branch)
admin.site.register(Workplace)
admin.site.register(Specialty)
admin.site.register(Employee)
admin.site.register(Patient)
admin.site.register(Appointment)
admin.site.register(FinancialTransaction)
admin.site.register(ClinicTask)
admin.site.register(WarehouseItem)
admin.site.register(DentalLabOrder)
admin.site.register(DentalTechnician)
admin.site.register(ClinicTenant)
admin.site.register(PlatformSetting)
admin.site.register(PlatformUser)

