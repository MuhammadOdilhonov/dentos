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


# Reception monitoring: staff can observe conversations without answering each message.
from django.utils import timezone
from .reception_models import ReceptionContact, ReceptionMessage, ReceptionDelivery


class ReceptionMessageInline(admin.TabularInline):
    model = ReceptionMessage
    fields = ('created_at', 'direction', 'text', 'delivered')
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ReceptionContact)
class ReceptionContactAdmin(admin.ModelAdmin):
    list_display = ('clinic', 'patient', 'key', 'language', 'conversation_stage', 'timezone_name', 'human_requested', 'opted_out', 'updated_at')
    list_filter = ('clinic', 'human_requested', 'opted_out', 'language')
    search_fields = ('patient__full_name', 'key')
    readonly_fields = ('clinic', 'key', 'patient', 'state', 'telegram_account', 'telegram_access_hash', 'timezone_name', 'timezone_source', 'timezone_updated_at', 'updated_at')
    inlines = [ReceptionMessageInline]
    actions = ['pause_replies', 'resume_replies']

    def conversation_stage(self, obj):
        return obj.state.get('stage', '')

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        clinic_id = Employee.objects.filter(user=request.user).values_list('clinic_id', flat=True).first()
        return qs.filter(clinic_id=clinic_id) if clinic_id else qs.none()

    def has_add_permission(self, request):
        return False

    @admin.action(description='Avtomatik suhbatni pauza qilish')
    def pause_replies(self, request, queryset):
        queryset.update(human_requested=True)

    @admin.action(description='Avtomatik suhbatni davom ettirish')
    def resume_replies(self, request, queryset):
        queryset.update(human_requested=False)
