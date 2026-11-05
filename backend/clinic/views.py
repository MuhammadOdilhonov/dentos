from django.conf import settings
from .access import login_response
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum, Q, Count
from decimal import Decimal
import datetime
from django.contrib.auth.hashers import check_password, identify_hasher

def _password_matches(raw, stored):
    try:
        identify_hasher(stored)
    except ValueError:
        import secrets
        return secrets.compare_digest(str(raw), str(stored))
    return check_password(raw, stored)


from .models import (
    Employee, Patient, Appointment, FinancialTransaction, ClinicTask,
    WarehouseItem, DentalLabOrder, DentalTechnician, PlatformSetting, ClinicTenant,
    PlatformUser, Workplace, Specialty, Branch, PatientMedia, PhotoProtocol,
    ServiceCatalogItem, DoctorNaryadRate, ServiceCategory
)
from .serializers import (
    EmployeeSerializer, PatientSerializer, AppointmentSerializer,
    FinancialTransactionSerializer, ClinicTaskSerializer,
    WarehouseItemSerializer, DentalLabOrderSerializer,
    DentalTechnicianSerializer, PlatformSettingSerializer, ClinicTenantSerializer,
    PlatformUserSerializer, WorkplaceSerializer, SpecialtySerializer, BranchSerializer,
    PatientMediaSerializer, PhotoProtocolSerializer, ServiceCatalogItemSerializer,
    DoctorNaryadRateSerializer, ServiceCategorySerializer
)


def _clinic_modules_payload(clinic):
    """Klinikaning yoqilgan modullari — login/dossier javobida frontend modul-gate uchun.

    enabled_modules JSON (sms/telegram/lab/charts_3d/chairs/commissions) + maxsus tarif
    bayroqlari (has_auto_reminders / has_ai_agent) birlashtiriladi. Klinika bo'lmasa
    (superadmin) bo'sh dict — frontend superadminni har doim to'liq ochiq deb oladi.
    """
    if not clinic:
        return {}
    mods = dict(clinic.enabled_modules or {})
    mods['auto_reminders'] = bool(clinic.has_auto_reminders)
    mods['ai_agent'] = bool(clinic.has_ai_agent)
    return mods


@api_view(['POST'])
def auth_login(request):
    """Bazadagi login/parol (yoki gmail) bo'yicha kirish. Rol va klinika ma'lumoti qaytariladi.

    Avval PlatformUser (superadmin/director/admin/kassa/doctor), topilmasa
    DentalTechnician jadvalidan texnik sifatida tekshiriladi.
    """
    username = (request.data.get('username') or request.data.get('email') or '').strip()
    password = (request.data.get('password') or '').strip()

    u = PlatformUser.objects.filter(Q(username__iexact=username) | Q(username__iexact=username.lower()), is_active=True).first()
    if u and _password_matches(password, u.password):
        # Sync branch with Employee table if needed
        if u.role in ('doctor', 'admin', 'kassa', 'deputy_director'):
            emp = None
            if u.username:
                emp = Employee.objects.filter(username__iexact=u.username, clinic_id=u.clinic_id).first()
            if not emp and u.full_name:
                emp = Employee.objects.filter(full_name__iexact=u.full_name, clinic_id=u.clinic_id).first()


            if emp and emp.branch and u.branch_id != emp.branch_id:
                u.branch = emp.branch
                u.save(update_fields=['branch'])
        user_data = PlatformUserSerializer(u).data
        # Klinika modul-gate ma'lumoti: bloklangan modullar login paytida yuboriladi,
        # frontend shu bo'yicha sidebar/sahifalarni butunlay yopadi (superadmin har doim ochiq).
        user_data['enabled_modules'] = _clinic_modules_payload(u.clinic)
        return login_response(u, {'ok': True, 'user': user_data})

    tech = DentalTechnician.objects.filter(Q(username__iexact=username) | Q(username__iexact=username.lower()), is_active=True).first()
    if tech and _password_matches(password, tech.password):
        clinic_name = (tech.linked_clinics or ['Dental Lab'])[0]
        parts = [p for p in tech.name.split() if p]
        initials = (parts[0][0] + parts[1][0]).upper() if len(parts) >= 2 else tech.name[:2].upper()
        return login_response(tech, {'ok': True, 'user': {
            'id': tech.id,
            'username': tech.username,
            'full_name': tech.name,
            'role': 'technician',
            'role_label': 'Zubnoy Texnik',
            'clinic': None,
            'clinic_name': tech.lab_name or clinic_name,
            'initials': initials,
            'is_active': True,
        }})

    # Login formasi "Telefon raqami yoki Email" deydi — shu va'dani backend ham bajaradi.
    # FAQAT akkauntning O'Z telefoni bo'yicha va AYNAN BITTA faol moslik bo'lsa kiritamiz.
    # Noaniq (0 yoki >1 moslik) bo'lsa — boshqa akkauntni TAXMIN QILMAYMIZ, klinikalararo
    # yoki klinika-telefoni fallback YO'Q; oddiy "login yoki parol noto'g'ri" qaytadi.
    from .telegram_login import normalize_phone, account_payload
    phone = normalize_phone(username)
    if phone:
        matches = {}
        for pu in PlatformUser.objects.filter(is_active=True).exclude(phone=''):
            if normalize_phone(pu.phone) == phone:
                matches[('platform', pu.pk)] = pu
        for t in DentalTechnician.objects.filter(is_active=True).exclude(phone=''):
            if normalize_phone(t.phone) == phone:
                matches[('technician', t.pk)] = t
        if len(matches) == 1:
            acct = next(iter(matches.values()))
            if _password_matches(password, acct.password):
                return login_response(acct, {'ok': True, 'user': account_payload(acct)})

    return Response({'ok': False, 'message': 'Login yoki parol noto‘g‘ri'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def update_profile(request):
    """
    Foydalanuvchi profilini yangilash:
    Gmail/username, parol, F.I.O, telefon raqam.
    Sozlamalar bo'limidan direktor yoki boshqa xodim o'zgartiradi.
    """
    account = getattr(request.user, 'account', None)
    if not isinstance(account, PlatformUser):
        return Response({'detail': 'Ruxsat yo‘q.'}, status=403)
    from django.contrib.auth.hashers import make_password
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError
    new_password = request.data.get('password', '')
    if new_password:
        if not _password_matches(request.data.get('current_password', ''), account.password):
            return Response({'detail': 'Joriy parol noto‘g‘ri.'}, status=400)
        try:
            validate_password(new_password)
        except ValidationError as exc:
            return Response({'detail': exc.messages}, status=400)
        account.password = make_password(new_password)
    username = str(request.data.get('username') or request.data.get('email') or account.username).strip()
    if PlatformUser.objects.filter(username__iexact=username).exclude(pk=account.pk).exists():
        return Response({'detail': 'Login band.'}, status=400)
    old_username = account.username
    account.username = username
    account.full_name = request.data.get('full_name') or request.data.get('name') or account.full_name
    account.phone = request.data.get('phone') or account.phone
    account.save()
    Employee.objects.filter(username=old_username, clinic_id=account.clinic_id).update(
        username=username, full_name=account.full_name, phone=account.phone, password=account.password)
    return login_response(account, {'ok': True, 'user': PlatformUserSerializer(account).data})


# ──────────────────────────────────────────────────────────────────────────
# SMS / Telegram KOD orqali kirish (OTP). Telefon raqamiga 6 xonali kod yuboriladi
# (SMS: sms_service, Telegram: ulangan klinika sessiyasi), so'ng tekshiriladi.
# Provider sozlanmagan bo'lsa — javobda `dev_code` qaytadi (test rejimi).
# ──────────────────────────────────────────────────────────────────────────
_OTP_STORE = {}  # normalized_phone -> {'code': str, 'exp': datetime, 'method': str}


def _norm_phone(p):
    return ''.join(ch for ch in str(p or '') if ch.isdigit())


def _find_user_by_phone(phone_digits):
    """Telefon raqami bo'yicha PlatformUser topadi (Employee yoki klinika direktori orqali)."""
    if not phone_digits:
        return None
    # 1) Xodim telefoni
    for emp in Employee.objects.exclude(phone='').only('id', 'phone', 'username', 'full_name', 'clinic_id'):
        if _norm_phone(emp.phone) and _norm_phone(emp.phone) == phone_digits:
            pu = PlatformUser.objects.filter(username__iexact=emp.username).first() if emp.username else None
            if pu:
                return pu
            return PlatformUser.objects.filter(full_name__iexact=emp.full_name, clinic_id=emp.clinic_id).first()
    # 2) Klinika (direktor) telefoni
    for c in ClinicTenant.objects.exclude(phone='').only('id', 'phone'):
        if _norm_phone(c.phone) == phone_digits:
            return PlatformUser.objects.filter(clinic_id=c.id, role='director').first()
    return None


@api_view(['POST'])
def request_login_code(request):
    return Response({'ok': False, 'message': 'Telegram orqali kirish bo‘limidan foydalaning.'}, status=410)


@api_view(['POST'])
def verify_login_code(request):
    return Response({'ok': False, 'message': 'Telegram orqali yangi kod so‘rang.'}, status=410)


def get_clinic_id(request):
    """
    Extract clinic_id from query params (?clinic=), headers (X-Clinic-ID),
    or auth user.
    """
    cid = request.query_params.get('clinic') or request.headers.get('X-Clinic-ID') or request.headers.get('X-Clinic-Id')
    if cid:
        try:
            return int(cid)
        except (ValueError, TypeError):
            pass
    return None


class TenantViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        qs = super().get_queryset()
        if not settings.ENFORCE_API_AUTH:
            return qs
        user = self.request.user
        if user.is_superuser:
            return qs
        if getattr(user, 'kind', None) == 'technician':
            if qs.model is DentalTechnician:
                return qs.filter(pk=user.pk)
            if qs.model is DentalLabOrder:
                return qs.filter(technician_id=user.pk)
            return qs.none()
        if qs.model is ClinicTenant:
            return qs.filter(pk=user.clinic_id)
        if any(f.name == 'clinic' for f in qs.model._meta.fields):
            return qs.filter(clinic_id=user.clinic_id)
        return qs

class EmployeeViewSet(TenantViewSet):
    queryset = Employee.objects.all().order_by('id')
    serializer_class = EmployeeSerializer

    @action(detail=True, methods=['get'], url_path='naryad-journal')
    def naryad_journal(self, request, pk=None):
        from .naryads import employee_journal
        return Response(employee_journal(request, self.get_object()))

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            # Klinika aniqlanmasa — boshqa klinika xodimlari oqib ketmasin
            return qs.none()
        active_only = self.request.query_params.get('active', None)
        if active_only == 'true':
            qs = qs.filter(is_active=True)
        branch_id = self.request.query_params.get('branch', None)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            emp = serializer.save(clinic_id=clinic_id)
        else:
            emp = serializer.save()
        self._sync_platform_user(emp)

    def perform_update(self, serializer):
        emp = serializer.save()
        self._sync_platform_user(emp)

    def _sync_platform_user(self, emp):
        if not emp.can_login:
            # If user exists, deactivate them
            if emp.username:
                PlatformUser.objects.filter(username__iexact=emp.username).update(is_active=False)
            return

        # Ensure username exists
        if not emp.username:
            import re
            base_name = ''
            if emp.full_name:
                parts = emp.full_name.strip().split()
                base_name = parts[0].lower()
            elif emp.first_name:
                base_name = emp.first_name.strip().lower()
            clean_name = re.sub(r'[^a-z0-9]', '', base_name) or 'user'
            prefix = 'dr_' if emp.role == 'doctor' else ''
            candidate = f"{prefix}{clean_name}"
            counter = 1
            final_user = candidate
            while PlatformUser.objects.filter(username__iexact=final_user).exists():
                counter += 1
                final_user = f"{candidate}{counter}"
            emp.username = final_user

        if not emp.password:
            emp.password = '123456'

        emp.save(update_fields=['username', 'password'])

        u = None
        if emp.username:
            u = PlatformUser.objects.filter(username__iexact=emp.username).first()
        if not u and emp.full_name:
            u = PlatformUser.objects.filter(full_name__iexact=emp.full_name, clinic=emp.clinic).first()
        if not u and emp.role == 'doctor' and emp.clinic_id == 1:
            name_lower = (emp.full_name or '').lower()
            if 'alimov' in name_lower or 'алимов' in name_lower or emp.id == 1:
                u = PlatformUser.objects.filter(username='doctor').first()

        if u:
            u.username = emp.username
            u.full_name = emp.full_name
            u.password = emp.password or '123456'
            u.role = emp.role
            u.clinic = emp.clinic
            u.branch = emp.branch
            u.phone = emp.phone or u.phone
            u.is_active = emp.is_active and emp.can_login
            u.save()
        else:
            PlatformUser.objects.create(
                username=emp.username,
                full_name=emp.full_name,
                password=emp.password or '123456',
                role=emp.role,
                clinic=emp.clinic,
                branch=emp.branch,
                phone=emp.phone or '',
                is_active=emp.is_active and emp.can_login
            )

class BranchViewSet(TenantViewSet):
    queryset = Branch.objects.all().order_by('id')
    serializer_class = BranchSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            # Klinika aniqlanmagan bo'lsa — hech qanday filial qaytmasin
            # (boshqa klinika / demo filiallari oqib ketmasligi uchun)
            qs = qs.none()
        active_only = self.request.query_params.get('active', None)
        if active_only == 'true':
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

class WorkplaceViewSet(TenantViewSet):
    queryset = Workplace.objects.filter(is_active=True).order_by('id')
    serializer_class = WorkplaceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            qs = qs.none()
        branch_id = self.request.query_params.get('branch', None)
        if branch_id:
            return qs.filter(branch_id=branch_id)
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

class SpecialtyViewSet(TenantViewSet):
    queryset = Specialty.objects.filter(is_active=True).order_by('id')
    serializer_class = SpecialtySerializer

    def _current_clinic_id(self):
        clinic_id = get_clinic_id(self.request)
        if clinic_id is None and getattr(settings, 'ENFORCE_API_AUTH', False):
            clinic_id = getattr(self.request.user, 'clinic_id', None)
        return clinic_id

    def get_queryset(self):
        # GLOBAL standart (is_default=True, clinic=None) — BARCHA klinikaga ko'rinadi.
        # Qolgani faqat o'z klinikasiga. Standartlar birinchi, keyin o'z qo'shganlari.
        from django.db.models import Q
        clinic_id = self._current_clinic_id()
        qs = Specialty.objects.filter(is_active=True).filter(
            Q(is_default=True) | Q(clinic_id=clinic_id)
        )
        return qs.order_by('-is_default', 'id')

    def perform_create(self, serializer):
        # Klinika o'zi qo'shgani — faqat o'ziga ko'rinadi, o'chirsa bo'ladi (is_default=False).
        serializer.save(clinic_id=self._current_clinic_id(), is_default=False)

    def perform_destroy(self, instance):
        # Standart (global) mutaxassislikni o'chirib bo'lmaydi — majburiy.
        if instance.is_default:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Standart mutaxassislikni o‘chirib bo‘lmaydi.')
        instance.delete()

class ServiceCategoryViewSet(TenantViewSet):
    """Klinika xizmat guruhlari (32desk «Услуга») — chap panel CRUD, klinika scoping."""
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

    def perform_destroy(self, instance):
        # Kategoriya o'chsa — ICHIDAGI NARYADLAR HAM o'chadi (foydalanuvchi talabi).
        # Eski matnli `category` bir xil bo'lgan (ref biriktirilmagan) naryadlar ham o'chadi.
        from django.db.models import Q
        ServiceCatalogItem.objects.filter(
            Q(category_ref=instance) | Q(category_ref__isnull=True, clinic=instance.clinic, category=instance.name)
        ).delete()
        instance.delete()


class ServiceCatalogItemViewSet(TenantViewSet):
    """Klinika xizmatlar/naryad narx katalogi — BAZADA, klinika bo'yicha scoping."""
    queryset = ServiceCatalogItem.objects.select_related('category_ref').all()
    serializer_class = ServiceCatalogItemSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        category_ref = self.request.query_params.get('category_ref')
        if category_ref:
            qs = qs.filter(category_ref_id=category_ref)
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

    @action(detail=False, methods=['post'])
    def bulk_import(self, request):
        """Nazoratli import — ATOMAR va IDEMPOTENT.

        Body: {items: [{name, category, base_price, default_percent, description}, ...]}
        Hammasi bitta tranzaksiyada; nomi allaqachon mavjud xizmat O'TKAZIB YUBORILADI
        (takroriy so'rov dublikat yaratmaydi). O'rtada xato bo'lsa — hech narsa yozilmaydi.
        """
        from django.db import transaction
        from rest_framework.exceptions import ValidationError as DRFValidationError
        clinic_id = get_clinic_id(request)
        if not clinic_id:
            return Response({'detail': 'Klinika kerak.'}, status=400)
        items = request.data.get('items')
        if not isinstance(items, list) or not items:
            return Response({'detail': 'items ro‘yxati kerak.'}, status=400)
        created, skipped = 0, 0
        try:
            with transaction.atomic():
                existing = {n.lower().strip() for n in ServiceCatalogItem.objects.filter(
                    clinic_id=clinic_id).values_list('name', flat=True)}
                cat_cache = {}  # nom(lower) -> ServiceCategory
                for it in items:
                    name = str(it.get('name', '')).strip()
                    if not name:
                        raise ValueError('Xizmat nomi bo‘sh.')
                    if name.lower() in existing:
                        skipped += 1
                        continue
                    cat_name = str(it.get('category', '')).strip()
                    cat_ref_id = None
                    if cat_name:
                        cat = cat_cache.get(cat_name.lower())
                        if cat is None:
                            cat, _ = ServiceCategory.objects.get_or_create(
                                clinic_id=clinic_id, name=cat_name)
                            cat_cache[cat_name.lower()] = cat
                        cat_ref_id = cat.id
                    ser = ServiceCatalogItemSerializer(data={
                        'name': name, 'category': cat_name, 'category_ref': cat_ref_id,
                        'base_price': it.get('base_price', 0),
                        'default_percent': it.get('default_percent'),
                        'description': it.get('description', '')},
                        context={'request': request})
                    ser.is_valid(raise_exception=True)
                    ser.save(clinic_id=clinic_id)
                    existing.add(name.lower())
                    created += 1
        except DRFValidationError:
            raise
        except Exception as exc:
            return Response({'detail': f'Import bekor qilindi: {exc}'}, status=400)
        return Response({'created': created, 'skipped': skipped}, status=200)

class DoctorNaryadRateViewSet(TenantViewSet):
    """Shifokorga xos naryad narx/foizi — BAZADA, klinika bo'yicha scoping."""
    queryset = DoctorNaryadRate.objects.all().select_related('service', 'doctor')
    serializer_class = DoctorNaryadRateSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        doctor_id = self.request.query_params.get('doctor')
        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)
        return qs

    def perform_create(self, serializer):
        # Upsert: shu klinika+shifokor+xizmat uchun yozuv bo'lsa — yangilaymiz
        # (unique cheklovni buzmaslik + frontend "assign" idempotent bo'lishi uchun).
        # PARALLEL ikki "assign" bir vaqtda kelsa ham 500/dublikat bo'lmasligi uchun
        # IntegrityError'ni ushlab, yutqazgan so'rovni UPDATE'ga aylantiramiz.
        from django.db import transaction, IntegrityError
        clinic_id = get_clinic_id(self.request)
        data = serializer.validated_data
        if not clinic_id:
            serializer.save()
            return
        doctor_id = data.get('doctor_id')
        service_id = data.get('service_id')
        defaults = {k: data[k] for k in ('custom_price', 'commission_percent', 'is_custom_price', 'notes') if k in data}
        try:
            with transaction.atomic():
                obj, _created = DoctorNaryadRate.objects.update_or_create(
                    clinic_id=clinic_id, doctor_id=doctor_id, service_id=service_id,
                    defaults=defaults)
        except IntegrityError:
            # Parallel create poygasi — yutqazgan so'rov mavjud yozuvni yangilaydi.
            obj = DoctorNaryadRate.objects.get(
                clinic_id=clinic_id, doctor_id=doctor_id, service_id=service_id)
            for k, v in defaults.items():
                setattr(obj, k, v)
            obj.save(update_fields=list(defaults.keys()) or None)
        serializer.instance = obj

class PatientViewSet(TenantViewSet):
    queryset = Patient.objects.all().order_by('-created_at')
    serializer_class = PatientSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        query = self.request.query_params.get('search', None)
        if query:
            qs = qs.filter(
                Q(full_name__icontains=query) |
                Q(phone__icontains=query) |
                Q(id__iexact=query)
            )
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

class AppointmentViewSet(TenantViewSet):
    queryset = Appointment.objects.all().select_related('patient', 'doctor').order_by('start_time')
    serializer_class = AppointmentSerializer

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        clinic_id = get_clinic_id(request)
        if clinic_id:
            data['clinic'] = clinic_id

        patient = None
        patient_id = data.get('patient')
        if patient_id:
            patient = Patient.objects.filter(id=patient_id).first()
        if patient is None:
            patient = Patient.objects.create(
                clinic_id=clinic_id,
                full_name=(data.get('patient_name') or 'Yangi bemor').strip() or 'Yangi bemor',
                phone=(data.get('patient_phone') or '').strip(),
            )
        data['patient'] = patient.id

        doctor = None
        doctor_id = data.get('doctor')
        if doctor_id:
            doctor = Employee.objects.filter(id=doctor_id).first()
        if doctor is None:
            doc_qs = Employee.objects.filter(role='doctor', is_active=True)
            if clinic_id:
                doc_qs = doc_qs.filter(clinic_id=clinic_id)
            doctor = doc_qs.first()
        if doctor is None:
            return Response({'detail': 'Shifokor topilmadi'}, status=status.HTTP_400_BAD_REQUEST)
        data['doctor'] = doctor.id

        if not data.get('branch') and doctor and doctor.branch:
            data['branch'] = doctor.branch.id

        svc_lang = data.get('patient_service_lang') or data.get('service_lang')
        if svc_lang and svc_lang in ('uz', 'ru', 'en') and patient:
            if patient.service_lang != svc_lang:
                patient.service_lang = svc_lang
                patient.save(update_fields=['service_lang'])

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

    def perform_update(self, serializer):
        instance = serializer.save()
        svc_lang = self.request.data.get('patient_service_lang') or self.request.data.get('service_lang')
        if svc_lang and svc_lang in ('uz', 'ru', 'en') and instance.patient:
            if instance.patient.service_lang != svc_lang:
                instance.patient.service_lang = svc_lang
                instance.patient.save(update_fields=['service_lang'])

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        date_str = self.request.query_params.get('date', None)
        doctor_id = self.request.query_params.get('doctor', None)
        status_filter = self.request.query_params.get('status', None)

        if date_str:
            try:
                target_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
                qs = qs.filter(start_time__date=target_date)
            except ValueError:
                pass

        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)

        if status_filter:
            qs = qs.filter(status=status_filter)

        branch_id = self.request.query_params.get('branch', None)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        return qs

    def destroy(self, request, *args, **kwargs):
        apt = self.get_object()
        today = datetime.date.today()
        apt_date = apt.start_time.date()

        # Qabul kuni yoki o'tgan sanadagi qabulni o'chirib bo'lmaydi!
        if apt_date <= today:
            return Response(
                {
                    'ok': False,
                    'error': 'cannot_delete_today',
                    'detail': "Qabul kuni yoki o‘tgan sanadagi yozuvni o‘chirib bo‘lmaydi! Faqat «Kelmadi» holatiga o‘tkazish mumkin."
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def toggle_sms(self, request, pk=None):
        apt = self.get_object()
        apt.sms_sent = not apt.sms_sent
        apt.save()
        return Response({'status': 'ok', 'sms_sent': apt.sms_sent})

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        apt = self.get_object()
        new_status = request.data.get('status')
        color_map = {
            'new': '#3B82F6',
            'confirmed': '#06B6D4',
            'unconfirmed': '#F59E0B',
            'late': '#F97316',
            'arrived': '#EAB308',
            'in_progress': '#10B981',
            'waiting_bill': '#F59E0B',
            'cancelled': '#EF4444',
            'no_show': '#DC2626',
            'completed': '#64748B',
            'debt': '#EA580C',
            'reserved': '#3B82F6',
        }
        if new_status:
            apt.status = new_status
            apt.color_code = color_map.get(new_status, apt.color_code)
            apt.save()
        return Response(AppointmentSerializer(apt).data)

    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        import uuid
        from django.db import transaction
        try:
            amount = Decimal(str(request.data.get('amount', '0')))
            request_id = uuid.UUID(str(request.data.get('request_id')))
            if not amount.is_finite() or amount <= 0 or amount > Decimal('9999999999.99'):
                raise ValueError()
        except Exception:
            return Response({'detail': 'Musbat summa va noyob request_id kerak.'}, status=400)
        with transaction.atomic():
            apt = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            previous = FinancialTransaction.objects.filter(request_id=request_id).first()
            if previous:
                if previous.appointment_id != apt.pk or previous.amount != amount:
                    return Response({'detail': 'request_id boshqa to‘lovga tegishli.'}, status=409)
                return Response(AppointmentSerializer(apt).data)
            apt.paid_amount += amount
            if apt.paid_amount >= apt.price and apt.status == 'debt':
                apt.status, apt.color_code = 'completed', '#64748B'
            apt.save()
            FinancialTransaction.objects.create(
                request_id=request_id, clinic=apt.clinic, appointment=apt, branch=apt.branch,
                patient=apt.patient, doctor=apt.doctor, amount=amount, type='income',
                category='Оплата приема', payment_method=request.data.get('payment_method', 'Наличные'),
                cash_register=request.data.get('cash_register', 'cash'),
                operator_name=getattr(getattr(request.user, 'account', None), 'full_name', '') or 'Kassir',
                notes=f'Оплата приема #{apt.id}')
        return Response(AppointmentSerializer(apt).data)

class FinancialTransactionViewSet(TenantViewSet):
    queryset = FinancialTransaction.objects.all().select_related('patient', 'appointment', 'doctor', 'technician').order_by('-date')
    serializer_class = FinancialTransactionSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        type_param = self.request.query_params.get('type')
        if type_param:
            qs = qs.filter(type=type_param)
        doctor_id = self.request.query_params.get('doctor')
        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)
        tech_id = self.request.query_params.get('technician')
        if tech_id:
            qs = qs.filter(technician_id=tech_id)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category__icontains=category)
        branch_id = self.request.query_params.get('branch')
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

class ClinicTaskViewSet(TenantViewSet):
    queryset = ClinicTask.objects.all().select_related('assignee', 'patient', 'branch', 'creator').order_by('-created_at')
    serializer_class = ClinicTaskSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        branch_id = self.request.query_params.get('branch')
        if branch_id:
            qs = qs.filter(Q(branch_id=branch_id) | Q(assignee__branch_id=branch_id))
        creator_id = self.request.query_params.get('creator')
        if creator_id:
            qs = qs.filter(creator_id=creator_id)
        assignee_id = self.request.query_params.get('assignee')
        if assignee_id:
            qs = qs.filter(assignee_id=assignee_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

class WarehouseItemViewSet(TenantViewSet):
    queryset = WarehouseItem.objects.all().order_by('name')
    serializer_class = WarehouseItemSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

class DentalLabOrderViewSet(TenantViewSet):
    queryset = DentalLabOrder.objects.all().select_related('patient', 'doctor').order_by('-created_at')
    serializer_class = DentalLabOrderSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        clinic = self.request.query_params.get('clinic')
        if clinic:
            qs = qs.filter(Q(clinic_name__icontains=clinic) | Q(clinic_id=clinic_id if clinic_id else -1))
        tech_id = self.request.query_params.get('technician')
        if tech_id:
            qs = qs.filter(Q(technician_id=tech_id) | Q(technician_name__icontains=tech_id))
        branch_id = self.request.query_params.get('branch')
        if branch_id:
            qs = qs.filter(Q(branch_id=branch_id) | Q(doctor__branch_id=branch_id) | Q(destination_branch_id=branch_id))
        mode = self.request.query_params.get('mode')
        date_param = self.request.query_params.get('date')
        if mode == 'keladi' and date_param:
            qs = qs.filter(Q(received_date=date_param) | Q(zdacha_date=date_param))
        elif mode == 'ketadi' and date_param:
            qs = qs.filter(Q(due_date=date_param) | Q(zdacha_date=date_param) | Q(primerka_date=date_param))
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        order = self.get_object()
        new_status = request.data.get('status')
        if new_status:
            order.status = new_status
            if 'return_items' in request.data:
                order.return_items = request.data.get('return_items')
            if 'clinic_received_items' in request.data:
                order.clinic_received_items = request.data.get('clinic_received_items')
            order.save()
        return Response(DentalLabOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def set_cost(self, request, pk=None):
        order = self.get_object()
        cost = request.data.get('cost')
        if cost is not None:
            order.cost = cost
            order.save()
        return Response(DentalLabOrderSerializer(order).data)

@api_view(['GET'])
def global_search(request):
    query = request.query_params.get('q', '').strip()
    if not query:
        return Response({'patients': [], 'appointments': []})

    clinic_id = get_clinic_id(request)
    p_qs = Patient.objects.filter(
        Q(full_name__icontains=query) | Q(phone__icontains=query)
    )
    if clinic_id:
        p_qs = p_qs.filter(clinic_id=clinic_id)
    patients = p_qs[:10]

    a_qs = Appointment.objects.filter(
        Q(patient__full_name__icontains=query) | Q(treatment_notes__icontains=query)
    )
    if clinic_id:
        a_qs = a_qs.filter(clinic_id=clinic_id)
    appointments = a_qs[:10]

    return Response({
        'patients': PatientSerializer(patients, many=True).data,
        'appointments': AppointmentSerializer(appointments, many=True).data
    })

@api_view(['GET'])
def dashboard_stats(request):
    today = timezone.now().date()
    clinic_id = get_clinic_id(request)
    branch_id = request.query_params.get('branch', None)

    today_appointments = Appointment.objects.filter(start_time__date=today)
    if clinic_id:
        today_appointments = today_appointments.filter(clinic_id=clinic_id)
    if branch_id:
        today_appointments = today_appointments.filter(branch_id=branch_id)

    total_today = today_appointments.count()
    completed_today = today_appointments.filter(status='completed').count()
    in_progress = today_appointments.filter(status='in_progress').count()

    tx_qs = FinancialTransaction.objects.filter(date__date=today)
    if clinic_id:
        tx_qs = tx_qs.filter(clinic_id=clinic_id)
    if branch_id:
        tx_qs = tx_qs.filter(branch_id=branch_id)

    today_income = tx_qs.filter(type='income').aggregate(total=Sum('amount'))['total'] or 0
    today_expense = tx_qs.filter(type='expense').aggregate(total=Sum('amount'))['total'] or 0
    
    patient_qs = Patient.objects.all()
    if clinic_id:
        patient_qs = patient_qs.filter(clinic_id=clinic_id)
    total_patients = patient_qs.count()

    task_qs = ClinicTask.objects.filter(status='pending')
    if clinic_id:
        task_qs = task_qs.filter(clinic_id=clinic_id)
    pending_tasks = task_qs.count()
    total_tasks_badge = pending_tasks if clinic_id != 1 else 1192

    # Doctors workload
    doctors = Employee.objects.filter(role='doctor')
    if clinic_id:
        doctors = doctors.filter(clinic_id=clinic_id)
    if branch_id:
        doctors = doctors.filter(branch_id=branch_id)

    doctors_stat = []
    for doc in doctors:
        doc_apts = today_appointments.filter(doctor=doc).count()
        doctors_stat.append({
            'id': doc.id,
            'name': doc.full_name,
            'specialty': doc.specialty,
            'avatar': doc.avatar,
            'chair': doc.chair,
            'branch': doc.branch_id,
            'branch_name': doc.branch.name if doc.branch else None,
            'appointments_count': doc_apts
        })

    return Response({
        'today': str(today),
        'branch_id': branch_id,
        'total_appointments_today': total_today,
        'completed_today': completed_today,
        'in_progress_today': in_progress,
        'income_today': float(today_income),
        'expense_today': float(today_expense),
        'cash_balance': float(today_income - today_expense),
        'total_patients': total_patients,
        'pending_tasks': pending_tasks,
        'tasks_badge_count': total_tasks_badge,
        'doctors': doctors_stat
    })

@api_view(['GET'])
def pulse_monitor(request):
    today = timezone.now().date()
    clinic_id = get_clinic_id(request)
    appointments = Appointment.objects.filter(start_time__date=today)
    if clinic_id:
        appointments = appointments.filter(clinic_id=clinic_id)
    active_now = appointments.filter(status='in_progress')
    waiting = appointments.filter(status='confirmed')
    
    return Response({
        'active_chairs_count': active_now.count(),
        'waiting_room_count': waiting.count(),
        'current_active': AppointmentSerializer(active_now, many=True).data,
        'waiting_patients': AppointmentSerializer(waiting, many=True).data,
        'occupancy_rate': 0 if not appointments.exists() else 78,
    })

class DentalTechnicianViewSet(TenantViewSet):
    queryset = DentalTechnician.objects.all().order_by('-created_at')
    serializer_class = DentalTechnicianSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        all_requested = self.request.query_params.get('all', None)
        if all_requested == 'true' or self.request.user.is_superuser:
            return qs

        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            clinic = ClinicTenant.objects.filter(id=clinic_id).first()
            if clinic:
                linked_ids = clinic.linked_technicians or []
                return qs.filter(id__in=linked_ids)
            return qs.none()
        # Default demo clinic (id 1)
        return qs.filter(id__in=[1, 2, 3])

    @action(detail=False, methods=['get'])
    def available(self, request):
        """Klinikaga ulanishi mumkin bo'lgan barcha faol laboratoriya texniklari"""
        techs = self.get_queryset().filter(is_active=True).order_by('name')
        return Response(DentalTechnicianSerializer(techs, many=True).data)

    @action(detail=False, methods=['post'])
    def toggle_link(self, request):
        """Klinikaga laboratoriya texnikini ulash yoki ulanishni bekor qilish"""
        clinic_id = get_clinic_id(request)
        if not clinic_id:
            return Response({'ok': False, 'message': 'Klinika aniqlanmadi'}, status=status.HTTP_400_BAD_REQUEST)
        tech_id = request.data.get('technician_id')
        action_type = request.data.get('action', 'link')
        clinic = ClinicTenant.objects.filter(id=clinic_id).first()
        tech = DentalTechnician.objects.filter(id=tech_id).first()
        if not clinic or not tech:
            return Response({'ok': False, 'message': 'Klinika yoki texnik topilmadi'}, status=status.HTTP_404_NOT_FOUND)

        linked_techs = list(clinic.linked_technicians or [])
        tech_clinics = list(tech.linked_clinics or [])
        if action_type == 'link':
            if tech.id not in linked_techs:
                linked_techs.append(tech.id)
            if clinic.name not in tech_clinics:
                tech_clinics.append(clinic.name)
        else:
            if tech.id in linked_techs:
                linked_techs.remove(tech.id)
            if clinic.name in tech_clinics:
                tech_clinics.remove(clinic.name)

        clinic.linked_technicians = linked_techs
        clinic.save(update_fields=['linked_technicians'])
        tech.linked_clinics = tech_clinics
        tech.save(update_fields=['linked_clinics'])
        return Response({'ok': True, 'linked_technicians': linked_techs, 'action': action_type})

    @action(detail=False, methods=['post'])
    def login(self, request):
        username = (request.data.get('username') or '').strip()
        password = (request.data.get('password') or '').strip()
        tech = DentalTechnician.objects.filter(username=username, is_active=True).first()
        if not tech or not _password_matches(password, tech.password):
            return Response({'ok': False, 'message': 'Login yoki parol noto‘g‘ri yoki hisob faol emas'}, status=status.HTTP_400_BAD_REQUEST)
        return login_response(tech, {
            'ok': True,
            'technician': DentalTechnicianSerializer(tech).data
        })

    @action(detail=True, methods=['post'])
    def update_price_list(self, request, pk=None):
        tech = self.get_object()
        prices = request.data.get('price_list')
        if isinstance(prices, list):
            tech.price_list = prices
            tech.save(update_fields=['price_list'])
            return Response({'ok': True, 'price_list': tech.price_list})
        return Response({'ok': False, 'message': 'Noto‘g‘ri format'}, status=status.HTTP_400_BAD_REQUEST)

class PlatformSettingViewSet(TenantViewSet):
    queryset = PlatformSetting.objects.all()
    serializer_class = PlatformSettingSerializer

    @action(detail=False, methods=['get', 'post'])
    def current(self, request):
        obj, _ = PlatformSetting.objects.get_or_create(id=1, defaults={
            'clinic_name': 'Dentos Stomatologiya Klinikasi',
            'plan_tier': 'Pro',
            'storage_quota_gb': 50.0,
            'storage_used_gb': 4.8,
            'enabled_modules': {
                'sms_reminders': True,
                'telegram_reminders': True,
                'whatsapp_api': True,
                'dental_lab': True,
                'tooth_chart': True,
                'finance_payroll': True,
                'multi_chair': True
            },
            'max_doctors': 15
        })
        if request.method == 'POST':
            data = request.data
            if 'storage_quota_gb' in data:
                obj.storage_quota_gb = data['storage_quota_gb']
            if 'storage_used_gb' in data:
                obj.storage_used_gb = data['storage_used_gb']
            if 'plan_tier' in data:
                obj.plan_tier = data['plan_tier']
            if 'enabled_modules' in data:
                obj.enabled_modules = data['enabled_modules']
            if 'max_doctors' in data:
                obj.max_doctors = data['max_doctors']
            obj.save()
        return Response(PlatformSettingSerializer(obj).data)

class ClinicTenantViewSet(TenantViewSet):
    queryset = ClinicTenant.objects.all().order_by('-created_at')
    serializer_class = ClinicTenantSerializer

    def perform_update(self, serializer):
        instance = serializer.instance
        # Demo klinika (id=1) — xotira kvotasi 1 GB da QOTIB qoladi, oshirib bo'lmaydi
        if instance and instance.id == 1:
            serializer.save(storage_quota_gb=1)
        else:
            serializer.save()

    def create(self, request, *args, **kwargs):
        import re, random, string
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Extract or auto-generate director credentials (gmail & password)
        director_email = (request.data.get('director_email') or request.data.get('email') or '').strip().lower()
        director_password = (request.data.get('director_password') or request.data.get('password') or '').strip()
        director_name = serializer.validated_data.get('director_name') or 'Klinika Rahbari'

        if not director_email:
            slug = re.sub(r'[^a-zA-Z0-9]', '', str(serializer.validated_data.get('name', '')).lower())[:10] or 'clinic'
            director_email = f"director.{slug}@gmail.com"

        if not director_password:
            chars = string.ascii_letters + string.digits
            director_password = ''.join(random.choice(chars) for _ in range(8))

        if PlatformUser.objects.filter(username__iexact=director_email).exists():
            return Response({'detail': 'Login band.'}, status=400)
        from django.contrib.auth.hashers import make_password
        clinic = serializer.save()
        # Standart 10 mutaxassislik GLOBAL (clinic=None) — har klinikaga alohida
        # seed qilinmaydi, barchasiga avtomatik ko'rinadi (SpecialtyViewSet.get_queryset).
        # Create or update PlatformUser for this director
        user, _ = PlatformUser.objects.get_or_create(
            username=director_email,
            defaults={
                'password': director_password,
                'full_name': director_name,
                'role': 'director',
                'clinic': clinic,
                'is_active': True
            }
        )
        user.password = make_password(director_password)
        user.full_name = director_name
        user.clinic = clinic
        user.role = 'director'
        user.is_active = True
        user.save()

        res_data = serializer.data
        res_data['credentials'] = {
            'email': director_email,
            'password': director_password,
            'role': 'director',
            'full_name': director_name,
            'clinic_id': clinic.id,
            'clinic_name': clinic.name
        }
        return Response(res_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def dossier(self, request, pk=None):
        clinic = self.get_object()
        # FAQAT shu klinikaga tegishli xodim/bemor (aks holda boshqa klinika ma'lumoti oqib ketadi)
        employees = Employee.objects.filter(clinic_id=clinic.id).order_by('id')
        patients = Patient.objects.filter(clinic_id=clinic.id).order_by('-created_at')[:50]

        tech_ids = clinic.linked_technicians or []
        linked_techs = DentalTechnician.objects.filter(id__in=tech_ids)
        all_techs = DentalTechnician.objects.all()

        from .serializers import compute_storage_used_gb
        storage_quota = float(clinic.storage_quota_gb)
        storage_used = compute_storage_used_gb(clinic.id)  # REAL ma'lumot bo'yicha

        # Direktorning HAQIQIY login (PlatformUser username) — passportda to'g'ri ko'rsatish uchun
        director_user = PlatformUser.objects.filter(clinic_id=clinic.id, role='director').first()
        clinic_data = ClinicTenantSerializer(clinic).data
        clinic_data['director_email'] = director_user.username if director_user else ''
        # Superadmin direktor parolini ko'rishi/boshqarishi uchun qaytaramiz
        clinic_data['director_password'] = ''

        return Response({
            'clinic': clinic_data,
            'employees': EmployeeSerializer(employees, many=True).data,
            'patients': PatientSerializer(patients, many=True).data,
            'storage': {
                'quota_gb': storage_quota,
                'used_gb': storage_used,
                'free_gb': max(0.0, round(storage_quota - storage_used, 2)),
                'usage_percent': min(100.0, round((storage_used / (storage_quota or 1.0)) * 100, 1)),
                'breakdown': {
                    'dicom_kt_gb': round(storage_used * 0.58, 2),
                    'photos_gb': round(storage_used * 0.26, 2),
                    'backups_gb': round(storage_used * 0.16, 2)
                }
            },
            'linked_technicians': DentalTechnicianSerializer(linked_techs, many=True).data,
            'all_available_technicians': DentalTechnicianSerializer(all_techs, many=True).data
        })

    @action(detail=True, methods=['post'])
    def set_director_credentials(self, request, pk=None):
        """Superadmin klinika direktorining Gmail (login) va/yoki parolini o'zgartiradi.

        Direktor PlatformUser topilmasa — yaratamiz. Gmail band bo'lsa xato qaytaramiz.
        """
        clinic = self.get_object()
        new_email = (request.data.get('director_email') or request.data.get('email') or '').strip()
        new_password = (request.data.get('director_password') or request.data.get('password') or '').strip()

        if not new_email and not new_password:
            return Response({'ok': False, 'message': 'Yangi Gmail yoki parol kiriting'}, status=status.HTTP_400_BAD_REQUEST)

        director = PlatformUser.objects.filter(clinic_id=clinic.id, role='director').first()
        if not director:
            director = PlatformUser.objects.create(
                username=new_email or f"director.clinic{clinic.id}@gmail.com",
                password=new_password or '123456',
                full_name=clinic.director_name or 'Klinika Rahbari',
                role='director',
                clinic=clinic,
                is_active=True,
            )
        else:
            if new_email and new_email.lower() != director.username.lower():
                clash = PlatformUser.objects.filter(username__iexact=new_email).exclude(id=director.id).exists()
                if clash:
                    return Response({'ok': False, 'message': 'Bu Gmail allaqachon band. Boshqasini kiriting.'}, status=status.HTTP_400_BAD_REQUEST)
                director.username = new_email
            if new_password:
                director.password = new_password
            director.save()

        return Response({
            'ok': True,
            'message': 'Direktor kirish ma’lumotlari yangilandi',
            'director_email': director.username,
            'director_password': '',
        })

    @action(detail=True, methods=['post'])
    def link_technician(self, request, pk=None):
        clinic = self.get_object()
        tech_id = request.data.get('technician_id')
        action_type = request.data.get('action', 'link')

        tech = DentalTechnician.objects.filter(id=tech_id).first()
        if not tech:
            return Response({'ok': False, 'message': 'Texnik topilmadi'}, status=status.HTTP_404_NOT_FOUND)

        linked_techs = list(clinic.linked_technicians or [])
        tech_clinics = list(tech.linked_clinics or [])

        if action_type == 'link':
            if tech.id not in linked_techs:
                linked_techs.append(tech.id)
            if clinic.name not in tech_clinics:
                tech_clinics.append(clinic.name)
        elif action_type == 'unlink':
            if tech.id in linked_techs:
                linked_techs.remove(tech.id)
            if clinic.name in tech_clinics:
                tech_clinics.remove(clinic.name)

        clinic.linked_technicians = linked_techs
        clinic.save(update_fields=['linked_technicians'])
        tech.linked_clinics = tech_clinics
        tech.save(update_fields=['linked_clinics'])

        return Response({
            'ok': True,
            'clinic': ClinicTenantSerializer(clinic).data,
            'linked_technicians': linked_techs
        })


@api_view(['GET'])
def serve_dental_media_sample(request, sample_type):
    """
    Serves local dental media test files:
    - 'rentgen': C:\\Users\\user\\Downloads\\Telegram Desktop\\Одилхонова Муслимахон.zip
    - 'scan': C:\\Users\\user\\Downloads\\Telegram Desktop\\160926-Nasarullaev Shaxruh проект.zip
    """
    import os
    from django.http import FileResponse, Http404

    if sample_type == 'rentgen':
        path = r'C:\Users\user\Downloads\Telegram Desktop\Одилхонова Муслимахон.zip'
        filename = 'Odilxonova_Muslimaxon_3D_CBCT.zip'
    elif sample_type == 'scan':
        path = r'C:\Users\user\Downloads\Telegram Desktop\160926-Nasarullaev Shaxruh проект.zip'
        filename = '160926_Nasarullaev_Shaxruh_scan.zip'
    else:
        raise Http404("Noma'lum namuna turi")

    if not os.path.exists(path):
        raise Http404("Fayl topilmadi")

    response = FileResponse(open(path, 'rb'), content_type='application/zip')
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    return response


@api_view(['GET', 'POST'])
def monthly_plan(request):
    """Klinikaning oylik moliyaviy rejasi — BAZADA (localStorage emas).

    GET  ?clinic=<id>&month=YYYY-MM  -> {exists, single_clinic_plan, branch_plans, acknowledged}
         month berilmasa server joriy oyni oladi.
    POST body: {clinic, month?, single_clinic_plan, branch_plans, acknowledged}
    """
    from .models import ClinicMonthlyPlan

    clinic_id = get_clinic_id(request) or request.data.get('clinic') or request.query_params.get('clinic')
    try:
        clinic_id = int(clinic_id) if clinic_id else None
    except (ValueError, TypeError):
        clinic_id = None
    if not clinic_id:
        return Response({'ok': False, 'error': 'clinic kerak'}, status=400)

    def _current_month():
        return timezone.now().strftime('%Y-%m')

    if request.method == 'GET':
        month = request.query_params.get('month') or _current_month()
        plan = ClinicMonthlyPlan.objects.filter(clinic_id=clinic_id, month=month).first()
        if not plan:
            return Response({
                'exists': False, 'month': month,
                'single_clinic_plan': 0, 'branch_plans': {}, 'acknowledged': False,
            })
        return Response({
            'exists': True, 'month': plan.month,
            'single_clinic_plan': float(plan.single_clinic_plan),
            'branch_plans': plan.branch_plans or {},
            'acknowledged': plan.acknowledged,
        })

    # POST — upsert
    month = request.data.get('month') or _current_month()
    single = request.data.get('single_clinic_plan', 0) or 0
    branch_plans = request.data.get('branch_plans') or {}
    acknowledged = bool(request.data.get('acknowledged', True))
    try:
        single = Decimal(str(single))
    except Exception:
        single = Decimal('0')
    # branch_plans kalitlarini stringga keltiramiz (JSON uchun)
    if isinstance(branch_plans, dict):
        branch_plans = {str(k): float(v or 0) for k, v in branch_plans.items()}
    else:
        branch_plans = {}

    plan, _created = ClinicMonthlyPlan.objects.update_or_create(
        clinic_id=clinic_id, month=month,
        defaults={
            'single_clinic_plan': single,
            'branch_plans': branch_plans,
            'acknowledged': acknowledged,
        },
    )
    return Response({
        'ok': True, 'exists': True, 'month': plan.month,
        'single_clinic_plan': float(plan.single_clinic_plan),
        'branch_plans': plan.branch_plans or {},
        'acknowledged': plan.acknowledged,
    })


class PatientMediaViewSet(TenantViewSet):
    """Bemor media fayllari (foto/rentgen/skan) — BAZADA. Klinika bo'yicha scoping."""
    queryset = PatientMedia.objects.all().order_by('-uploaded_at')
    serializer_class = PatientMediaSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        patient_id = self.request.query_params.get('patient')
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        kind = self.request.query_params.get('kind')
        if kind:
            qs = qs.filter(kind=kind)
        return qs

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError
        from django.db import transaction
        clinic_id = get_clinic_id(self.request)
        f = self.request.FILES.get('file')
        if not f:
            raise ValidationError({'file': 'Fayl kerak.'})
        if f.size > settings.MAX_PATIENT_FILE_BYTES:
            raise ValidationError({'file': 'Fayl ruxsat etilgan hajmdan katta.'})
        from pathlib import PurePath
        suffix = PurePath(f.name).suffix.lower()
        if suffix not in {'.jpg', '.jpeg', '.png', '.webp', '.dcm', '.dicom', '.zip', '.stl', '.ply', '.obj', '.pdf'}:
            raise ValidationError({'file': 'Fayl turi ruxsat etilmagan.'})
        with transaction.atomic():
            clinic = ClinicTenant.objects.select_for_update().get(pk=clinic_id)
            total = PatientMedia.objects.filter(clinic_id=clinic_id).aggregate(n=Sum('file_size'))['n'] or 0
            if total + f.size > float(clinic.storage_quota_gb) * 1024 ** 3:
                raise ValidationError({'file': 'Klinika xotira limiti tugadi.'})
            # storage_backend tegi PatientMedia.save() ichida avtomatik qo'yiladi (3 tur ham).
            serializer.save(clinic=clinic, file_name=f.name, file_size=f.size,
                            file_type=getattr(f, 'content_type', '') or 'application/octet-stream')

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        from django.http import FileResponse
        from .storage import open_media_for_read
        media = self.get_object()
        if not media.file:
            return Response(status=404)
        # Proxy through the authenticated backend: no storage credential or permanent public URL
        # reaches the browser. open_media_for_read fayl saqlangan backend'dan ochadi
        # (eski local/B2 fayllar yangi Cloupard'ga ko'chmasa ham ochiladi).
        response = FileResponse(open_media_for_read(media), content_type=media.file_type or 'application/octet-stream',
                                as_attachment=False, filename=media.file_name)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    @action(detail=True, methods=['get'], url_path='access-url')
    def access_url(self, request, pk=None):
        """Katta fayl (skan/rentgen) uchun kirish havolasi — ruxsat get_object() da
        klinika bo'yicha tekshiriladi. Remote (Cloupard/B2) → qisqa muddatli presigned
        URL (brauzer to'g'ridan yuklaydi, Django 57MB tashimaydi). Lokal → proksi yo'li."""
        from .storage import media_remote_url
        media = self.get_object()
        if not media.file:
            return Response(status=404)
        url = media_remote_url(media) or f'/api/patient-media/{media.pk}/download/'
        return Response({'url': url, 'file_name': media.file_name, 'file_type': media.file_type})

    def update(self, request, *args, **kwargs):
        return Response({'detail': 'Faylni o‘zgartirish uchun yangi fayl yuklang.'}, status=405)

    def perform_destroy(self, instance):
        # Do not silently delete retained B2 object versions. Orphan cleanup is a separate audited task.
        instance.delete()


@api_view(['GET', 'POST'])
def photo_protocol(request):
    """Bemor foto-protokol hujjati (slaydlar JSON) — BAZADA.

    GET  ?clinic=<id>&patient=<id> -> {exists, doc}
    POST body: {clinic?, patient, doc}
    """
    clinic_id = get_clinic_id(request) or request.data.get('clinic') or request.query_params.get('clinic')
    try:
        clinic_id = int(clinic_id) if clinic_id else None
    except (ValueError, TypeError):
        clinic_id = None
    patient_id = request.data.get('patient') or request.query_params.get('patient')
    try:
        patient_id = int(patient_id) if patient_id else None
    except (ValueError, TypeError):
        patient_id = None
    if not patient_id:
        return Response({'ok': False, 'error': 'patient kerak'}, status=400)

    from django.shortcuts import get_object_or_404
    get_object_or_404(Patient, pk=patient_id, clinic_id=clinic_id)
    if request.method == 'GET':
        pp = PhotoProtocol.objects.filter(patient_id=patient_id, clinic_id=clinic_id).first()
        if not pp:
            return Response({'exists': False, 'doc': []})
        return Response({'exists': True, 'doc': pp.doc or []})

    doc = request.data.get('doc')
    if doc is None:
        doc = []
    from .photo_assets import persist_images
    doc = persist_images(doc, patient_id, clinic_id)
    pp, _created = PhotoProtocol.objects.update_or_create(
        patient_id=patient_id,
        defaults={'doc': doc, 'clinic_id': clinic_id},
    )
    return Response({'ok': True, 'exists': True, 'doc': pp.doc or []})


@api_view(['GET'])
def patient_media_presence(request):
    """Klinika bo'yicha har bemorda foto/rentgen/skan bor-yo'qligi + umumiy hisob.

    GET ?clinic=<id> -> {
        map: {"<pid>": {foto,rentgen,skan}}, totals: {foto,rentgen,skan,patients_with_media}
    }
    Yashil ptichka (frontend) va admin umumiy hisobi uchun yagona manba.
    """
    clinic_id = get_clinic_id(request) or request.query_params.get('clinic')
    try:
        clinic_id = int(clinic_id) if clinic_id else None
    except (ValueError, TypeError):
        clinic_id = None

    if not clinic_id and not request.user.is_superuser:
        return Response({'detail': 'Klinika kerak.'}, status=400)
    media_qs = PatientMedia.objects.all()
    proto_qs = PhotoProtocol.objects.all()
    if clinic_id:
        media_qs = media_qs.filter(clinic_id=clinic_id)
        proto_qs = proto_qs.filter(clinic_id=clinic_id)

    presence = {}

    def _slot(pid):
        return presence.setdefault(str(pid), {'foto': False, 'rentgen': False, 'skan': False})

    for pid, kind in media_qs.values_list('patient_id', 'kind'):
        slot = _slot(pid)
        if kind in slot:
            slot[kind] = True

    # Foto-protokolda rasm bo'lsa — foto mavjud deb belgilaymiz
    for pid, doc in proto_qs.values_list('patient_id', 'doc'):
        if _doc_has_image(doc):
            _slot(pid)['foto'] = True

    totals = {
        'foto': sum(1 for v in presence.values() if v['foto']),
        'rentgen': sum(1 for v in presence.values() if v['rentgen']),
        'skan': sum(1 for v in presence.values() if v['skan']),
        'patients_with_media': len(presence),
        'files_total': media_qs.count(),
    }
    return Response({'map': presence, 'totals': totals})


def _doc_has_image(doc):
    """Foto-protokol hujjatida (turli eski/yangi formatlarda) rasm bor-yo'qligi."""
    if not isinstance(doc, list):
        return False
    for b in doc:
        if not isinstance(b, dict):
            continue
        if (b.get('kind') == 'image' and b.get('url')) or (b.get('type') == 'image' and b.get('src')):
            return True
        els = b.get('elements')
        if isinstance(els, list) and any(
            isinstance(e, dict) and e.get('type') == 'image' and (e.get('src') or e.get('url')) for e in els
        ):
            return True
    return False


