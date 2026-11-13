from .tenant_serializers import TenantModelSerializer
from rest_framework import serializers
from .models import (
    Employee, Patient, Appointment, FinancialTransaction, ClinicTask,
    WarehouseItem, DentalLabOrder, DentalTechnician, PlatformSetting, ClinicTenant,
    PlatformUser, Workplace, Specialty, Branch, PatientMedia, PhotoProtocol,
    ServiceCatalogItem, DoctorNaryadRate, ServiceCategory
)


class PatientMediaSerializer(TenantModelSerializer):
    file_url = serializers.SerializerMethodField()
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)

    class Meta:
        model = PatientMedia
        fields = ['id', 'clinic', 'patient', 'patient_name', 'kind', 'file', 'file_url',
                  'file_name', 'file_size', 'file_type', 'meta', 'uploaded_at']
        read_only_fields = ['uploaded_at', 'file_size', 'file_type', 'file_name']

    def get_file_url(self, obj):
        if not obj.file:
            return None
        # NISBIY (same-origin) URL qaytaramiz — absolute EMAS. Absolute URL proksi orqasida
        # backend hostini (masalan 127.0.0.1:8000 / backend.dentos.cc) oladi; brauzerning
        # httpOnly `dentos_session` cookie'si esa ilova origini (localhost:3000 / dentos.cc)
        # ga bog'langan va boshqa hostga YUBORILMAYDI → download 401 ("Kirish talab qilinadi").
        # Nisbiy URL ilova origini orqali (/api proksi) so'raladi → cookie yuboriladi, xususiy
        # media autentifikatsiyasi saqlanadi (fayl public qilinmaydi).
        return f'/api/patient-media/{obj.pk}/download/'


class PhotoProtocolSerializer(TenantModelSerializer):
    class Meta:
        model = PhotoProtocol
        fields = ['id', 'clinic', 'patient', 'doc', 'updated_at']
        read_only_fields = ['updated_at']

class BranchSerializer(TenantModelSerializer):
    doctors_count = serializers.SerializerMethodField()
    chairs_count = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = '__all__'

    def get_doctors_count(self, obj):
        return obj.employees.filter(role='doctor', is_active=True).count()

    def get_chairs_count(self, obj):
        return obj.workplaces.filter(is_active=True).count()

class WorkplaceSerializer(TenantModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Workplace
        fields = '__all__'

class SpecialtySerializer(TenantModelSerializer):
    name = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Specialty
        fields = '__all__'
        read_only_fields = ['is_default']

    def validate(self, attrs):
        # 3 tilli nomlar — kamida bittasi to'ldirilsa yetadi; name (kanonik) bo'sh
        # bo'lsa ruscha → o'zbekcha → inglizchadan to'ldiramiz (eski klient faqat
        # name yuborsa ham ishlaydi).
        name = (attrs.get('name') or '').strip()
        ru = (attrs.get('name_ru') or '').strip()
        uz = (attrs.get('name_uz') or '').strip()
        en = (attrs.get('name_en') or '').strip()
        canonical = name or ru or uz or en
        if not canonical:
            raise serializers.ValidationError({'name': 'Mutaxassislik nomi kiritilishi shart.'})
        attrs['name'] = canonical
        attrs['name_ru'] = ru or name or canonical
        attrs['name_uz'] = uz
        attrs['name_en'] = en
        return attrs

class ServiceCategorySerializer(TenantModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = ServiceCategory
        fields = ['id', 'clinic', 'branch', 'branch_name', 'name', 'description', 'show_in_calendar', 'created_at', 'item_count']
        read_only_fields = ['created_at', 'item_count', 'branch_name']

    def get_item_count(self, obj):
        # select_related/annotate ViewSetda; bo'lmasa oddiy count
        return getattr(obj, 'item_count', None) if hasattr(obj, 'item_count') else obj.items.count()


class ServiceCatalogItemSerializer(TenantModelSerializer):
    # O'ng paneldagi kichik kategoriya nomi uchun (faqat o'qish)
    category_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = ServiceCatalogItem
        fields = [
            'id', 'clinic', 'branch', 'branch_name', 'name', 'category', 'category_ref', 'category_name',
            'code', 'base_price', 'default_percent', 'description',
            'duration_min', 'buffer_min', 'price_fixed', 'duration_fixed', 'show_in_calendar',
            'package_items', 'diagnoses', 'manipulations', 'reminder_enabled', 'reminder_days',
            'created_at',
        ]
        read_only_fields = ['created_at', 'category_name', 'branch_name']

    def get_category_name(self, obj):
        if obj.category_ref_id:
            return obj.category_ref.name
        return obj.category or ''

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # category_ref berilsa — eski matnli `category` ni nom bilan sinxronlab,
        # kassa/hisobot kabi eski iste'molchilar to'g'ri ko'rsatishi uchun.
        if 'category_ref' in attrs and attrs['category_ref'] is not None:
            attrs['category'] = attrs['category_ref'].name
        return attrs

    def validate_base_price(self, value):
        if value is None or value < 0:
            raise serializers.ValidationError('Narx manfiy bo‘lmasligi kerak.')
        return value

    def validate_default_percent(self, value):
        if value is not None and (value < 0 or value > 100):
            raise serializers.ValidationError('Foiz 0 dan 100 gacha bo‘lishi kerak.')
        return value

class DoctorNaryadRateSerializer(TenantModelSerializer):
    # Frontend shakliga moslash: doctor_id (int) va naryad_id (service id, string).
    doctor_id = serializers.IntegerField()
    naryad_id = serializers.CharField(source='service_id')
    name = serializers.CharField(source='service.name', read_only=True)
    category = serializers.CharField(source='service.category', read_only=True)

    class Meta:
        model = DoctorNaryadRate
        fields = ['id', 'doctor_id', 'naryad_id', 'name', 'category', 'custom_price',
                  'commission_percent', 'is_custom_price', 'notes', 'clinic']
        read_only_fields = ['clinic']

    def validate_custom_price(self, value):
        if value is None or value < 0:
            raise serializers.ValidationError('Narx manfiy bo‘lmasligi kerak.')
        return value

    def validate_commission_percent(self, value):
        if value is None or value < 0 or value > 100:
            raise serializers.ValidationError('Foiz 0 dan 100 gacha bo‘lishi kerak.')
        return value

    def validate_naryad_id(self, value):
        # ORM so'rovidan OLDIN ID formatini tekshiramiz — aks holda raqam bo'lmagan
        # qiymat (eski "nar-*", bo'sh, yaroqsiz) integer PK filtriga tushib 500 berardi.
        try:
            parsed = int(str(value).strip())
        except (TypeError, ValueError):
            raise serializers.ValidationError('Xizmat ID butun son bo‘lishi kerak (eski "nar-*" ID qo‘llab-quvvatlanmaydi).')
        if parsed <= 0:
            raise serializers.ValidationError('Xizmat ID noto‘g‘ri.')
        return parsed  # source='service_id' — int sifatida saqlanadi

    def validate(self, attrs):
        from .views import get_clinic_id
        from .models import Employee, ServiceCatalogItem
        request = self.context.get('request')
        cid = get_clinic_id(request) if request else None
        # UPDATE'da (doctor,service) JUFTLIGINI o'zgartirishga ruxsat bermaymiz —
        # bu identifikator; almashtirilsa unique cheklovni buzib 500 berardi. Yangi
        # juftlik uchun yangi biriktirma yaratiladi.
        if self.instance is not None:
            if 'doctor_id' in attrs and attrs['doctor_id'] != self.instance.doctor_id:
                raise serializers.ValidationError({'doctor_id': 'Biriktirmada shifokorni o‘zgartirib bo‘lmaydi; yangi biriktirma yarating.'})
            if 'service_id' in attrs and attrs['service_id'] != self.instance.service_id:
                raise serializers.ValidationError({'naryad_id': 'Biriktirmada xizmatni o‘zgartirib bo‘lmaydi; yangi biriktirma yarating.'})
        doctor_id = attrs.get('doctor_id', getattr(self.instance, 'doctor_id', None))
        service_id = attrs.get('service_id', getattr(self.instance, 'service_id', None))
        # Bog'langan shifokor va xizmat AYNAN shu klinikaga tegishli bo'lishi shart.
        if cid:
            if doctor_id is not None and not Employee.objects.filter(pk=doctor_id, clinic_id=cid).exists():
                raise serializers.ValidationError({'doctor_id': 'Shifokor shu klinikaga tegishli emas.'})
            if service_id is not None and not ServiceCatalogItem.objects.filter(pk=service_id, clinic_id=cid).exists():
                raise serializers.ValidationError({'naryad_id': 'Xizmat topilmadi yoki shu klinikaga tegishli emas.'})
        elif not (request and request.user.is_superuser):
            raise serializers.ValidationError('Klinika kerak.')
        return attrs

class EmployeeSerializer(TenantModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    def validate_commission_rate(self, value):
        if not value.is_finite() or value < 0 or value > 100:
            raise serializers.ValidationError('Shifokor foizi 0–100 oralig‘ida bo‘lishi kerak.')
        return value

    def update(self, instance, validated_data):
        if 'password' in validated_data and not validated_data['password']:
            validated_data.pop('password')
        return super().update(instance, validated_data)

    class Meta:
        model = Employee
        fields = '__all__'

class PatientSerializer(TenantModelSerializer):
    class Meta:
        model = Patient
        fields = '__all__'

class AppointmentSerializer(TenantModelSerializer):
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

class FinancialTransactionSerializer(TenantModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.full_name', read_only=True)
    technician_name = serializers.CharField(source='technician.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = FinancialTransaction
        fields = '__all__'

class ClinicTaskSerializer(TenantModelSerializer):
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

class WarehouseItemSerializer(TenantModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = WarehouseItem
        fields = '__all__'

class DentalLabOrderSerializer(TenantModelSerializer):
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

class DentalTechnicianSerializer(TenantModelSerializer):
    class Meta:
        model = DentalTechnician
        fields = '__all__'

class PlatformSettingSerializer(TenantModelSerializer):
    class Meta:
        model = PlatformSetting
        fields = '__all__'

def compute_storage_used_gb(clinic_id):
    from django.db.models import Sum
    total = PatientMedia.objects.filter(clinic_id=clinic_id).aggregate(total=Sum('file_size'))['total'] or 0
    return round(total / (1024 ** 3), 6)


class ClinicTenantSerializer(TenantModelSerializer):
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

class PlatformUserSerializer(TenantModelSerializer):
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

