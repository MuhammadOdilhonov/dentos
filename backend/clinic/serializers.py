from rest_framework import serializers
from .models import (
    Employee, Patient, Appointment, FinancialTransaction, ClinicTask,
    WarehouseItem, DentalLabOrder, DentalTechnician, PlatformSetting, ClinicTenant,
    PlatformUser, Workplace, Specialty, Branch
)

class BranchSerializer(serializers.ModelSerializer):
    doctors_count = serializers.SerializerMethodField()
    chairs_count = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = '__all__'

    def get_doctors_count(self, obj):
        return obj.employees.filter(role='doctor', is_active=True).count()

    def get_chairs_count(self, obj):
        return obj.workplaces.filter(is_active=True).count()

class WorkplaceSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Workplace
        fields = '__all__'

class SpecialtySerializer(serializers.ModelSerializer):
    class Meta:
        model = Specialty
        fields = '__all__'

class EmployeeSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Employee
        fields = '__all__'

class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = '__all__'

class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_phone = serializers.CharField(source='patient.phone', read_only=True)
    patient_service_lang = serializers.CharField(source='patient.service_lang', read_only=True)
    doctor_name = serializers.CharField(source='doctor.full_name', read_only=True)
    doctor_color = serializers.CharField(source='doctor.color', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    branch_address = serializers.CharField(source='branch.address', read_only=True)
    branch_phone = serializers.CharField(source='branch.phone', read_only=True)
    branch_location_url = serializers.CharField(source='branch.location_url', read_only=True)

    class Meta:
        model = Appointment
        fields = '__all__'

class FinancialTransactionSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.full_name', read_only=True)
    technician_name = serializers.CharField(source='technician.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = FinancialTransaction
        fields = '__all__'

class ClinicTaskSerializer(serializers.ModelSerializer):
    assignee_name = serializers.SerializerMethodField()
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    branch_name = serializers.SerializerMethodField()
    creator_name = serializers.SerializerMethodField()

    class Meta:
        model = ClinicTask
        fields = '__all__'

    def get_assignee_name(self, obj):
        return obj.assignee.full_name if obj.assignee else ''

    def get_branch_name(self, obj):
        if obj.branch:
            return obj.branch.name
        if obj.assignee and obj.assignee.branch:
            return obj.assignee.branch.name
        return obj.branch_name or ''

    def get_creator_name(self, obj):
        if obj.creator:
            return obj.creator.full_name
        return obj.creator_name or ''

class WarehouseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = WarehouseItem
        fields = '__all__'

class DentalLabOrderSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_phone = serializers.CharField(source='patient.phone', read_only=True)
    doctor_name = serializers.CharField(source='doctor.full_name', read_only=True)
    doctor_branch_id = serializers.IntegerField(source='doctor.branch.id', read_only=True)
    doctor_branch_name = serializers.CharField(source='doctor.branch.name', read_only=True)
    branch_name = serializers.SerializerMethodField()
    destination_branch_name = serializers.SerializerMethodField()

    class Meta:
        model = DentalLabOrder
        fields = '__all__'

    def get_branch_name(self, obj):
        if obj.branch:
            return obj.branch.name
        if obj.doctor and obj.doctor.branch:
            return obj.doctor.branch.name
        return obj.branch_name or 'Toshkent Markaziy filiali'

    def get_destination_branch_name(self, obj):
        if obj.destination_branch:
            return obj.destination_branch.name
        if obj.branch:
            return obj.branch.name
        if obj.doctor and obj.doctor.branch:
            return obj.doctor.branch.name
        return obj.destination_branch_name or 'Toshkent Markaziy filiali'

class DentalTechnicianSerializer(serializers.ModelSerializer):
    class Meta:
        model = DentalTechnician
        fields = '__all__'

class PlatformSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformSetting
        fields = '__all__'

def compute_storage_used_gb(clinic_id):
    """Klinikaning REAL ma'lumotlari bo'yicha ishlatilgan xotirani (GB) hisoblaydi.

    Fayllar (rentgen/skan/foto) brauzer localStorage'da bo'lgani uchun backend ularni
    o'lchay olmaydi — shuning uchun yozuvlar soniga qarab real-ga yaqin TAXMIN beramiz.
    Bo'sh klinika = 0 GB, ma'lumot qo'shilgani sari o'sadi, o'chirilsa kamayadi.
    """
    from .models import Patient, Appointment, DentalLabOrder, Employee, WarehouseItem
    patients = Patient.objects.filter(clinic_id=clinic_id).count()
    appts = Appointment.objects.filter(clinic_id=clinic_id).count()
    labs = DentalLabOrder.objects.filter(clinic_id=clinic_id).count()
    emps = Employee.objects.filter(clinic_id=clinic_id).count()
    warehouse = WarehouseItem.objects.filter(clinic_id=clinic_id).count()
    # Taxminiy o'lchamlar (GB): bemor kartasi + rasm/rentgen, qabul yozuvi, lab buyurtma, xodim profili
    gb = (patients * 0.08) + (appts * 0.012) + (labs * 0.05) + (emps * 0.025) + (warehouse * 0.002)
    return round(gb, 2)


class ClinicTenantSerializer(serializers.ModelSerializer):
    doctors_count = serializers.SerializerMethodField()
    patients_count = serializers.SerializerMethodField()
    storage_used_gb = serializers.SerializerMethodField()

    class Meta:
        model = ClinicTenant
        fields = '__all__'

    def get_doctors_count(self, obj):
        return Employee.objects.filter(role='doctor', clinic_id=obj.id).count()

    def get_patients_count(self, obj):
        return Patient.objects.filter(clinic_id=obj.id).count()

    def get_storage_used_gb(self, obj):
        # Har doim REAL ma'lumot bo'yicha hisoblab qaytaramiz (bazadagi eski qiymatni emas)
        return compute_storage_used_gb(obj.id)

class PlatformUserSerializer(serializers.ModelSerializer):
    role_label = serializers.SerializerMethodField()
    clinic_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    initials = serializers.CharField(read_only=True)

    class Meta:
        model = PlatformUser
        fields = ['id', 'username', 'full_name', 'role', 'role_label', 'clinic',
                  'clinic_name', 'branch', 'branch_name', 'avatar', 'initials', 'is_active']

    def get_role_label(self, obj):
        return PlatformUser.ROLE_LABELS.get(obj.role, obj.role)

    def get_clinic_name(self, obj):
        return obj.clinic.name if obj.clinic else 'dentOS Platforma'

