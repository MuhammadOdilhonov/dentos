from django.conf import settings
from .access import login_response
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum, Q, Count
from decimal import Decimal, InvalidOperation
import datetime
import zipfile
import xml.etree.ElementTree as ET
import io
import re
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
            qs = qs.filter(clinic_id=user.clinic_id)

        # Agar foydalanuvchi ma'lum bir filialga biriktirilgan bo'lsa
        # (masalan deputy_director biror filialga biriktirilgan bo'lsa)
        # Boshqa filial ma'lumotlarini ko'ra olmaydi!
        # Agar deputy_director filialga biriktirilmagan bo'lsa (branch_id is None) — barcha filiallarni ko'radi.
        user_branch_id = getattr(user, 'branch_id', None)
        user_role = getattr(user, 'role', None)
        if user_branch_id and user_role in ('deputy_director', 'admin', 'doctor', 'kassa'):
            if qs.model is ServiceCatalogItem:
                from django.db.models import Q
                qs = qs.exclude(
                    ~Q(branch_id=user_branch_id) & Q(branch_id__isnull=False)
                ).exclude(
                    ~Q(category_ref__branch_id=user_branch_id) & Q(category_ref__branch_id__isnull=False)
                ).filter(
                    Q(branch_id=user_branch_id) |
                    Q(category_ref__branch_id=user_branch_id) |
                    (Q(branch__isnull=True) & (Q(category_ref__isnull=True) | Q(category_ref__branch__isnull=True)))
                )
            elif qs.model is ServiceCategory:
                from django.db.models import Q
                qs = qs.filter(Q(branch_id=user_branch_id) | Q(branch__isnull=True))
            elif any(f.name == 'branch' for f in qs.model._meta.fields):
                qs = qs.filter(branch_id=user_branch_id)

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
    """Klinika xizmat guruhlari (32desk «Услуga») — chap panel CRUD, klinika scoping."""
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        elif not self.request.user.is_superuser:
            return qs.none()
        branch = self.request.query_params.get('branch')
        if branch and branch != 'all':
            from django.db.models import Q
            # Filialga tegishli yoki umumiy (branch=null) kategoriyalar
            qs = qs.filter(Q(branch_id=branch) | Q(branch__isnull=True))
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        user = self.request.user
        branch_id = getattr(user, 'branch_id', None) if getattr(user, 'role', None) == 'deputy_director' else None
        kwargs = {}
        if clinic_id and not serializer.validated_data.get('clinic'):
            kwargs['clinic_id'] = clinic_id
        if branch_id and not serializer.validated_data.get('branch'):
            kwargs['branch_id'] = branch_id
        serializer.save(**kwargs)

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
        branch = self.request.query_params.get('branch')
        if branch and branch != 'all':
            from django.db.models import Q
            # Boshqa filialga biriktirilgan naryadlar yoki boshqa filial kategoriyasiga tegishli naryadlar chiqarilmaydi
            qs = qs.exclude(
                ~Q(branch_id=branch) & Q(branch_id__isnull=False)
            ).exclude(
                ~Q(category_ref__branch_id=branch) & Q(category_ref__branch_id__isnull=False)
            ).filter(
                Q(branch_id=branch) |
                Q(category_ref__branch_id=branch) |
                (Q(branch__isnull=True) & (Q(category_ref__isnull=True) | Q(category_ref__branch__isnull=True)))
            )
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        user = self.request.user
        branch_id = getattr(user, 'branch_id', None) if getattr(user, 'role', None) == 'deputy_director' else None
        kwargs = {}
        if clinic_id and not serializer.validated_data.get('clinic'):
            kwargs['clinic_id'] = clinic_id
        if branch_id and not serializer.validated_data.get('branch'):
            kwargs['branch_id'] = branch_id
        cat_ref = serializer.validated_data.get('category_ref')
        if cat_ref and cat_ref.branch_id and 'branch_id' not in kwargs and not serializer.validated_data.get('branch'):
            kwargs['branch_id'] = cat_ref.branch_id
        serializer.save(**kwargs)

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
        if data.get('status') == 'blocked':
            data['patient'] = None
        else:
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
        branch = self.request.query_params.get('branch')
        if branch:
            if branch in ('null', 'none'):
                qs = qs.filter(branch__isnull=True)
            elif branch != 'all':
                qs = qs.filter(branch_id=branch)
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        user = self.request.user
        branch_id = getattr(user, 'branch_id', None) if getattr(user, 'role', None) == 'deputy_director' else None
        kwargs = {}
        if clinic_id and not serializer.validated_data.get('clinic'):
            kwargs['clinic_id'] = clinic_id
        if branch_id and not serializer.validated_data.get('branch'):
            kwargs['branch_id'] = branch_id
        serializer.save(**kwargs)

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

    def create(self, request, *args, **kwargs):
        # Media HAR DOIM bemorga biriktiriladi — klinikani BEMORDAN olamiz (eng ishonchli manba).
        # Shunda frontend X-Clinic-ID'ni noto'g'ri/eskirgan yuborsa ham fayl bemorning TO'G'RI
        # klinikasiga tushadi (serializer "Obyekt shu klinikaga tegishli emas" 400 bermaydi).
        # XAVFSIZLIK saqlanadi: boshqa klinika foydalanuvchisi (superadmin emas) baribir rad etiladi.
        patient_id = request.data.get('patient')
        patient = Patient.objects.filter(pk=patient_id).first() if patient_id else None
        if patient and patient.clinic_id:
            req_cid = get_clinic_id(request)
            if request.user.is_superuser or not req_cid or int(req_cid) == patient.clinic_id:
                q = request._request.GET.copy()
                q['clinic'] = str(patient.clinic_id)
                request._request.GET = q
                request._request.META['HTTP_X_CLINIC_ID'] = str(patient.clinic_id)
        try:
            return super().create(request, *args, **kwargs)
        except Exception as exc:
            import logging
            logging.getLogger('django').warning(
                '[patient-media POST RAD] %s: %r | file=%r patient=%r X-Clinic-ID=%r',
                type(exc).__name__, getattr(exc, 'detail', str(exc)),
                getattr(request.FILES.get('file'), 'name', None),
                request.data.get('patient'), request.headers.get('X-Clinic-ID'))
            raise

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
        # Ruxsat etilgan turlar KENGAYTIRILDI: barcha keng tarqalgan rasm formatlari
        # (HEIC/HEIF — iPhone, gif/bmp/avif/tiff) + VIDEO (mp4/webm/mov/m4v) foto-protokol uchun.
        allowed_suffixes = {
            '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.tif', '.tiff',
            '.heic', '.heif', '.jfif',
            '.dcm', '.dicom', '.zip', '.stl', '.ply', '.obj', '.pdf',
            '.mp4', '.webm', '.mov', '.m4v', '.ogg', '.ogv',
        }
        if suffix not in allowed_suffixes:
            raise ValidationError({'file': f'Fayl turi ruxsat etilmagan: {suffix or "kengaytmasiz"}.'})
        # Klinika aniq bo'lmasa — 400 (aks holda .get(pk=None) 500 berardi).
        if not clinic_id:
            raise ValidationError({'file': 'Klinika aniqlanmadi (X-Clinic-ID yo‘q).'})
        with transaction.atomic():
            try:
                clinic = ClinicTenant.objects.select_for_update().get(pk=clinic_id)
            except ClinicTenant.DoesNotExist:
                raise ValidationError({'file': 'Klinika topilmadi.'})
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


@api_view(['GET', 'POST', 'DELETE'])
def photo_protocol(request):
    """Bemor foto-protokol PREZENTATSIYALARI (3 tagacha slot) — BAZADA.

    GET  ?patient=<id>&slot=<1..3>      -> {exists, doc, title, slot}
    GET  ?patient=<id>&presentations=1  -> {presentations:[{slot,title,hasContent,updated_at}]}
    POST {clinic?, patient, slot, doc, title?} -> slotni saqlaydi
    DELETE {clinic?, patient, slot}     -> slotni o'chiradi
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

    def _slot_num(val, default=1):
        try:
            s = int(val)
            return s if 1 <= s <= 3 else default
        except (ValueError, TypeError):
            return default

    if request.method == 'GET':
        # Prezentatsiyalar ro'yxati (tablar uchun)
        if request.query_params.get('presentations'):
            rows = PhotoProtocol.objects.filter(patient_id=patient_id, clinic_id=clinic_id).order_by('slot')
            items = [{
                'slot': r.slot,
                'title': r.title or f'Prezentatsiya {r.slot}',
                'hasContent': bool(r.doc),
                'updated_at': r.updated_at.isoformat() if r.updated_at else None,
            } for r in rows]
            return Response({'presentations': items})
        slot = _slot_num(request.query_params.get('slot'))
        pp = PhotoProtocol.objects.filter(patient_id=patient_id, clinic_id=clinic_id, slot=slot).first()
        if not pp:
            return Response({'exists': False, 'doc': [], 'title': '', 'slot': slot})
        return Response({'exists': True, 'doc': pp.doc or [], 'title': pp.title or '', 'slot': slot})

    if request.method == 'DELETE':
        slot = _slot_num(request.data.get('slot') or request.query_params.get('slot'))
        PhotoProtocol.objects.filter(patient_id=patient_id, clinic_id=clinic_id, slot=slot).delete()
        return Response({'ok': True, 'deleted': slot})

    # POST — slotni saqlash
    slot = _slot_num(request.data.get('slot'))
    doc = request.data.get('doc')
    if doc is None:
        doc = []
    from .photo_assets import persist_images
    doc = persist_images(doc, patient_id, clinic_id)
    defaults = {'doc': doc, 'clinic_id': clinic_id}
    title = request.data.get('title')
    if isinstance(title, str) and title.strip():
        defaults['title'] = title.strip()[:120]
    pp, _created = PhotoProtocol.objects.update_or_create(
        patient_id=patient_id, slot=slot, defaults=defaults,
    )
    return Response({'ok': True, 'exists': True, 'doc': pp.doc or [], 'title': pp.title or '', 'slot': slot})


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


# ══════════════════════════════════════════════════════════════════════════════
# EXCEL IMPORT / EXPORT  —  superadmin paneli uchun
# ══════════════════════════════════════════════════════════════════════════════

def _parse_xlsx_rows(fileobj):
    """XLSX faylidan (zipfile+xml) qator ro'yxatini qaytaradi.
    Har qator dict: {full_name, birth_date_str, phone, tags, balance_str}
    """
    with zipfile.ZipFile(fileobj) as z:
        # Shared strings
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss_xml = ET.fromstring(z.read('xl/sharedStrings.xml'))
            ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in ss_xml.findall('.//x:si', ns):
                texts = [t.text or '' for t in si.findall('.//x:t', ns)]
                shared.append(''.join(texts))

        # Birinchi sheet
        ws_xml = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

        def cell_value(c):
            t = c.get('t', '')
            v_el = c.find('x:v', ns)
            if v_el is None:
                return ''
            if t == 's':
                idx = int(v_el.text)
                return shared[idx] if idx < len(shared) else ''
            if t == 'inlineStr':
                is_el = c.find('.//x:t', ns)
                return is_el.text if is_el is not None else ''
            return v_el.text or ''

        def col_index(ref):
            # 'F5' -> 5 (0-based). xlsx bo'sh katakni TUSHIRIB qoldiradi, shuning uchun
            # katakning 'r' (masalan "F5") atributidan haqiqiy ustunni aniqlaymiz —
            # aks holda Источник/Теги bo'sh bo'lsa Баланс chapga siljib ketadi.
            letters = ''.join(ch for ch in ref if ch.isalpha())
            idx = 0
            for ch in letters:
                idx = idx * 26 + (ord(ch.upper()) - ord('A') + 1)
            return idx - 1 if idx else 0

        rows_raw = []
        for row in ws_xml.findall('.//x:row', ns):
            cells = row.findall('x:c', ns)
            if not cells:
                rows_raw.append([])
                continue
            vals = {}
            max_idx = 0
            for pos, c in enumerate(cells):
                ref = c.get('r', '')
                ci = col_index(ref) if ref else pos
                vals[ci] = cell_value(c)
                if ci > max_idx:
                    max_idx = ci
            rows_raw.append([vals.get(i, '') for i in range(max_idx + 1)])

    if not rows_raw:
        return []

    headers = [h.strip().lower() for h in rows_raw[0]]

    # Ustun indekslarini topamiz (nomi bo'yicha moslashuvchan)
    def find_col(patterns):
        for i, h in enumerate(headers):
            for p in patterns:
                if p in h:
                    return i
        return -1

    col_name    = find_col(['фио', 'ф.и.о', 'имя', 'name', 'full'])
    col_birth   = find_col(['рождения', 'birth', 'дата'])
    col_phone   = find_col(['телефон', 'phone', 'номер'])
    col_tags    = find_col(['тег', 'tag'])
    col_balance = find_col(['баланс', 'balance', 'долг'])

    parsed = []
    for row in rows_raw[1:]:
        def get(i):
            return row[i].strip() if i >= 0 and i < len(row) else ''

        name = get(col_name)
        if not name:
            continue  # ism yo'q — o'tkazib yuboramiz

        parsed.append({
            'full_name':     name,
            'birth_date_str': get(col_birth),
            'phone':         get(col_phone),
            'tags':          get(col_tags),
            'balance_str':   get(col_balance),
        })
    return parsed


def _clean_phone(raw: str) -> str:
    """'+998 90 918 18 94'  →  '+99890918918' — faqat raqamlar va bosh + saqlanadi."""
    digits = re.sub(r'[^\d+]', '', raw)
    return digits[:20]


def _parse_date(raw: str):
    """'DD.MM.YYYY' yoki 'YYYY-MM-DD' — datetime.date yoki None."""
    raw = raw.strip()
    for fmt in ('%d.%m.%Y', '%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            return datetime.datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    return None


def _parse_balance(raw: str):
    """'-50750000' → Decimal('-50750000'). Bo'sh yoki yaroqsiz → 0."""
    cleaned = re.sub(r'[^\d.\-]', '', raw)
    if not cleaned:
        return Decimal('0')
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return Decimal('0')


@api_view(['POST'])
def excel_import_patients(request):
    """Superadmin: XLSX faylini yuklaydi va klinika bemorlarini importa qiladi.

    POST /api/patients/excel-import/?clinic=<id>
    multipart: file=<xlsx>

    Qaytaradi: {total, created, updated, skipped, errors:[{row,reason}]}
    """
    if not request.user.is_authenticated or not request.user.is_superuser:
        return Response({'detail': 'Faqat superadmin.'}, status=403)

    clinic_id = request.query_params.get('clinic') or request.data.get('clinic')
    if not clinic_id:
        return Response({'detail': 'clinic parametri kerak.'}, status=400)
    try:
        clinic_id = int(clinic_id)
        clinic = ClinicTenant.objects.get(pk=clinic_id)
    except (ValueError, ClinicTenant.DoesNotExist):
        return Response({'detail': 'Klinika topilmadi.'}, status=404)

    xlsx_file = request.FILES.get('file')
    if not xlsx_file:
        return Response({'detail': 'file yuklang (xlsx).'}, status=400)
    if not xlsx_file.name.lower().endswith(('.xlsx', '.xls')):
        return Response({'detail': 'Faqat .xlsx fayl qabul qilinadi.'}, status=400)
    if xlsx_file.size > 20 * 1024 * 1024:
        return Response({'detail': 'Fayl 20 MB dan katta bo\'lmasin.'}, status=400)

    try:
        rows = _parse_xlsx_rows(io.BytesIO(xlsx_file.read()))
    except Exception as exc:
        return Response({'detail': f'Fayl o\'qilmadi: {exc}'}, status=400)

    created_count = 0
    updated_count = 0
    skipped_count = 0
    imported_ids = []   # yaratilgan + yangilangan bemor ID'lari (o'chirish tugmasi uchun)
    errors = []

    for idx, row in enumerate(rows, start=2):  # 2-qatordan (1 sarlavha)
        full_name = row['full_name']
        if not full_name:
            skipped_count += 1
            continue

        phone = _clean_phone(row['phone'])
        balance = _parse_balance(row['balance_str'])
        birth_date = _parse_date(row['birth_date_str'])
        tags = row['tags'].strip()
        notes_val = f'[Excel import teglari: {tags}]' if tags else ''

        try:
            obj = None
            if phone:
                # Telefon bo'yicha mavjud bemorni topamiz (dublikat bo'lsa birinchisi —
                # get_or_create MultipleObjectsReturned bermasin).
                obj = Patient.objects.filter(clinic=clinic, phone=phone).first()

            if obj:
                obj.full_name = full_name
                if balance != Decimal('0'):
                    obj.balance = balance
                if birth_date:
                    obj.birth_date = birth_date
                if notes_val and not obj.notes:
                    obj.notes = notes_val
                obj.save(update_fields=['full_name', 'balance', 'birth_date', 'notes'])
                updated_count += 1
            else:
                obj = Patient.objects.create(
                    clinic=clinic,
                    full_name=full_name,
                    phone=phone,
                    balance=balance,
                    birth_date=birth_date,
                    notes=notes_val,
                )
                created_count += 1
            imported_ids.append(obj.id)
        except Exception as exc:
            errors.append({'row': idx, 'name': full_name, 'reason': str(exc)})

    return Response({
        'ok': True,
        'total': len(rows),
        'created': created_count,
        'updated': updated_count,
        'skipped': skipped_count,
        'importedIds': imported_ids,
        'errors': errors[:50],  # ko'pi bilan 50 ta xato
    })


@api_view(['DELETE'])
def excel_delete_imported_patients(request):
    """Superadmin: ID ro'yxati bo'yicha bemorlarni o'chiradi.

    DELETE /api/patients/excel-delete/?clinic=<id>
    JSON body: {ids: [1,2,3,...]}
    """
    if not request.user.is_authenticated or not request.user.is_superuser:
        return Response({'detail': 'Faqat superadmin.'}, status=403)

    clinic_id = request.query_params.get('clinic') or request.data.get('clinic')
    ids = request.data.get('ids', [])
    if not ids or not isinstance(ids, list):
        return Response({'detail': 'ids ro\'yxati kerak.'}, status=400)

    try:
        clinic_id = int(clinic_id)
    except (ValueError, TypeError):
        return Response({'detail': 'clinic kerak.'}, status=400)

    # Faqat shu klinikaning bemorlarini o'chiramiz (xavfsizlik)
    qs = Patient.objects.filter(clinic_id=clinic_id, id__in=ids)
    deleted, _ = qs.delete()
    return Response({'ok': True, 'deleted': deleted})


@api_view(['GET'])
def excel_export_patients(request):
    """Superadmin: klinika bemorlarini XLSX formatida yuklab beradi.

    GET /api/patients/excel-export/?clinic=<id>
    """
    if not request.user.is_authenticated or not request.user.is_superuser:
        return Response({'detail': 'Faqat superadmin.'}, status=403)

    clinic_id = request.query_params.get('clinic')
    if not clinic_id:
        return Response({'detail': 'clinic kerak.'}, status=400)
    try:
        clinic_id = int(clinic_id)
    except ValueError:
        return Response({'detail': 'clinic noto\'g\'ri.'}, status=400)

    patients = Patient.objects.filter(clinic_id=clinic_id).order_by('full_name')

    # XLSX ni Python stdlib bilan yaratamiz (openpyxl yo'q)
    # Minimal xlsx: 1 sheet, shared strings, to'g'ri namespace
    NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

    headers = ['ФИО', 'Дата рождения', 'Номер телефона', 'Баланс', 'Категория', 'Заметки']

    # Shared strings ro'yxati — barcha matn qiymatlar
    shared = []
    shared_map = {}

    def add_shared(val: str) -> int:
        if val not in shared_map:
            shared_map[val] = len(shared)
            shared.append(val)
        return shared_map[val]

    # Rows data
    rows_data = []
    for h in headers:
        # sarlavha
        pass
    rows_data.append(headers)
    for p in patients:
        bd = p.birth_date.strftime('%d.%m.%Y') if p.birth_date else ''
        rows_data.append([
            p.full_name or '',
            bd,
            p.phone or '',
            str(p.balance or 0),
            p.category_status or '',
            p.notes or '',
        ])

    # Shared strings indekslarini yig'amiz
    for row in rows_data:
        for cell in row:
            add_shared(str(cell))

    def esc(s):
        return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;').replace("'", '&apos;')

    # sheet1.xml
    sheet_lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<sheetData>',
    ]
    col_letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for r_idx, row in enumerate(rows_data, 1):
        sheet_lines.append(f'<row r="{r_idx}">')
        for c_idx, val in enumerate(row):
            col = col_letters[c_idx]
            ref = f'{col}{r_idx}'
            si = shared_map.get(str(val), 0)
            sheet_lines.append(f'<c r="{ref}" t="s"><v>{si}</v></c>')
        sheet_lines.append('</row>')
    sheet_lines += ['</sheetData>', '</worksheet>']
    sheet_xml = '\n'.join(sheet_lines).encode('utf-8')

    # sharedStrings.xml
    ss_lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(shared)}" uniqueCount="{len(shared)}">',
    ]
    for s in shared:
        ss_lines.append(f'<si><t xml:space="preserve">{esc(s)}</t></si>')
    ss_lines.append('</sst>')
    ss_xml = '\n'.join(ss_lines).encode('utf-8')

    # workbook.xml
    wb_xml = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Bemorlar" sheetId="1" r:id="rId1"/></sheets>
</workbook>'''

    # workbook.xml.rels
    wb_rels = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>'''

    # _rels/.rels
    rels = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''

    # [Content_Types].xml
    ct = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>'''

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', ct)
        zf.writestr('_rels/.rels', rels)
        zf.writestr('xl/workbook.xml', wb_xml)
        zf.writestr('xl/_rels/workbook.xml.rels', wb_rels)
        zf.writestr('xl/worksheets/sheet1.xml', sheet_xml)
        zf.writestr('xl/sharedStrings.xml', ss_xml)

    buf.seek(0)
    from django.http import HttpResponse
    today = datetime.date.today().strftime('%Y-%m-%d')
    fname = f'bemorlar_klinika_{clinic_id}_{today}.xlsx'
    resp = HttpResponse(
        buf.read(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    resp['Content-Disposition'] = f'attachment; filename="{fname}"'
    return resp

