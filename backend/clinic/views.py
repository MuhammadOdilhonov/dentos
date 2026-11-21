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
        if clinic_id:
            from .storage_calculator import compute_clinic_storage
            st = compute_clinic_storage(clinic_id)
            if st and st['server']['limit_exceeded']:
                raise ValidationError({'detail': f"Klinika server xotira limiti to‘ldi ({st['server']['quota_gb']} GB)."})
            if not serializer.validated_data.get('clinic'):
                serializer.save(clinic_id=clinic_id)
                return
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
        if clinic_id:
            from .storage_calculator import compute_clinic_storage
            st = compute_clinic_storage(clinic_id)
            if st and st['server']['limit_exceeded']:
                raise ValidationError({'detail': f"Klinika server xotira limiti to‘ldi ({st['server']['quota_gb']} GB)."})
            if not serializer.validated_data.get('clinic'):
                serializer.save(clinic_id=clinic_id)
                return
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
        if clinic_id:
            from .storage_calculator import compute_clinic_storage
            st = compute_clinic_storage(clinic_id)
            if st and st['server']['limit_exceeded']:
                raise ValidationError({'detail': f"Klinika server xotira limiti to‘ldi ({st['server']['quota_gb']} GB)."})
            if not serializer.validated_data.get('clinic'):
                serializer.save(clinic_id=clinic_id)
                return
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
        if clinic_id:
            from .storage_calculator import compute_clinic_storage
            st = compute_clinic_storage(clinic_id)
            if st and st['server']['limit_exceeded']:
                raise ValidationError({'detail': f"Klinika server xotira limiti to‘ldi ({st['server']['quota_gb']} GB)."})
            if not serializer.validated_data.get('clinic'):
                serializer.save(clinic_id=clinic_id)
                return
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
        if clinic_id:
            from .storage_calculator import compute_clinic_storage
            st = compute_clinic_storage(clinic_id)
            if st and st['server']['limit_exceeded']:
                raise ValidationError({'detail': f"Klinika server xotira limiti to‘ldi ({st['server']['quota_gb']} GB)."})
            if not serializer.validated_data.get('clinic'):
                serializer.save(clinic_id=clinic_id)
                return
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
        if clinic_id:
            from .storage_calculator import compute_clinic_storage
            st = compute_clinic_storage(clinic_id)
            if st and st['server']['limit_exceeded']:
                raise ValidationError({'detail': f"Klinika server xotira limiti to‘ldi ({st['server']['quota_gb']} GB)."})
            if not serializer.validated_data.get('clinic'):
                serializer.save(clinic_id=clinic_id)
                return
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
        if clinic_id:
            from .storage_calculator import compute_clinic_storage
            st = compute_clinic_storage(clinic_id)
            if st and st['server']['limit_exceeded']:
                raise ValidationError({'detail': f"Klinika server xotira limiti to‘ldi ({st['server']['quota_gb']} GB)."})
            if not serializer.validated_data.get('clinic'):
                serializer.save(clinic_id=clinic_id)
                return
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
            'storage_quota_gb': 1000.0,
            'storage_used_gb': 0.0,
            'cloud_storage_quota_gb': 1000.0,
            'server_storage_quota_gb': 10.0,
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
            if 'cloud_storage_quota_gb' in data:
                obj.cloud_storage_quota_gb = data['cloud_storage_quota_gb']
                obj.storage_quota_gb = data['cloud_storage_quota_gb']
            elif 'storage_quota_gb' in data:
                obj.storage_quota_gb = data['storage_quota_gb']
                obj.cloud_storage_quota_gb = data['storage_quota_gb']
            if 'server_storage_quota_gb' in data:
                obj.server_storage_quota_gb = data['server_storage_quota_gb']
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
            serializer.save(storage_quota_gb=1, cloud_storage_quota_gb=1, server_storage_quota_gb=1)
        else:
            cloud_q = serializer.validated_data.get('cloud_storage_quota_gb') or serializer.validated_data.get('storage_quota_gb')
            if cloud_q is not None:
                serializer.save(cloud_storage_quota_gb=cloud_q, storage_quota_gb=cloud_q)
            else:
                serializer.save()

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_authenticated or not request.user.is_superuser:
            return Response({'detail': 'Faqat superadmin klinikani o‘chira oladi.'}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        if instance.id == 1:
            return Response({'detail': 'Demo klinikani (id=1) o‘chirish mumkin emas.'}, status=status.HTTP_400_BAD_REQUEST)

        clinic_id = instance.id
        clinic_name = instance.name

        import logging
        logger = logging.getLogger(__name__)
        from django.db import transaction

        with transaction.atomic():
            # 1. Barcha PatientMedia fayllarini disk va Cloupard'dan tozalash
            media_files = PatientMedia.objects.filter(clinic_id=clinic_id)
            for m in media_files:
                if m.file:
                    try:
                        m.file.delete(save=False)
                    except Exception as e:
                        logger.warning(f"Clinic delete: media file removal failed: {e}")
            media_files.delete()

            # 2. Xodimlarning django auth User akkauntlarini o'chirish (agar mavjud bo'lsa)
            from django.contrib.auth.models import User as DjangoAuthUser
            employee_user_ids = list(Employee.objects.filter(clinic_id=clinic_id, user__isnull=False).values_list('user_id', flat=True))
            if employee_user_ids:
                DjangoAuthUser.objects.filter(id__in=employee_user_ids).delete()

            # 3. Klinika PlatformUser foydalanuvchilarini (direktor, admin va h.k.) butunlay o'chirish
            PlatformUser.objects.filter(clinic_id=clinic_id).delete()

            # 4. Zubnoy texniklarning linked_clinics ro'yxatidan bu klinikani tozalash
            for tech in DentalTechnician.objects.all():
                if tech.linked_clinics:
                    new_linked = [c for c in tech.linked_clinics if c != clinic_name and str(c) != str(clinic_id)]
                    if len(new_linked) != len(tech.linked_clinics):
                        tech.linked_clinics = new_linked
                        tech.save(update_fields=['linked_clinics'])

            # 5. Telegram sessiyasi bo'lsa, uni uzish va sessions.json'dan tozalash
            try:
                from .telegram_auth import _load_sessions, _save_sessions, _manager, _logout
                sessions = _load_sessions()
                removed_any = False
                for phone, s in list(sessions.items()):
                    if str(s.get('clinic_id')) == str(clinic_id):
                        sessions.pop(phone, None)
                        removed_any = True
                        if s.get('session'):
                            try:
                                _manager.run(_logout(s['session']))
                            except Exception:
                                pass
                if removed_any:
                    _save_sessions(sessions)
            except Exception as e:
                logger.warning(f"Clinic delete: Telegram session cleanup error: {e}")

            # 6. Klinikaning o'zini o'chirish (CASCADE orqali Patient, Appointment, FinancialTransaction, Branch va barcha jadvallar o'chadi)
            instance.delete()

        return Response({
            'ok': True,
            'message': f"«{clinic_name}» klinikasi va uning barcha ma'lumotlari butunlay o‘chirildi."
        }, status=status.HTTP_200_OK)

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
        patients_qs = Patient.objects.filter(clinic_id=clinic.id).order_by('-created_at')
        total_patients_count = patients_qs.count()
        dentos_patients_count = patients_qs.filter(source='dentos').count()
        excel_patients_count = patients_qs.filter(source='excel').count()
        patients = list(patients_qs[:1000])

        tech_ids = clinic.linked_technicians or []
        linked_techs = DentalTechnician.objects.filter(id__in=tech_ids)
        all_techs = DentalTechnician.objects.all()

        from .storage_calculator import compute_clinic_storage
        storage_info = compute_clinic_storage(clinic.id) or {}
        cloud = storage_info.get('cloud', {})
        server = storage_info.get('server', {})
        storage_quota = cloud.get('quota_gb', float(clinic.storage_quota_gb or 1000.0))
        storage_used = cloud.get('used_gb', 0.0)

        # Direktorning HAQIQIY login (PlatformUser username) — passportda to'g'ri ko'rsatish uchun
        director_user = PlatformUser.objects.filter(clinic_id=clinic.id, role='director').first()
        clinic_data = ClinicTenantSerializer(clinic).data
        clinic_data['director_email'] = director_user.username if director_user else ''
        # Superadmin direktor parolini ko'rishi/boshqarishi uchun qaytaramiz
        clinic_data['director_password'] = ''

        cloud_breakdown = cloud.get('breakdown', {})
        foto_item = cloud_breakdown.get('foto', {})
        rentgen_item = cloud_breakdown.get('rentgen', {})
        skan_item = cloud_breakdown.get('skan', {})

        return Response({
            'clinic': clinic_data,
            'employees': EmployeeSerializer(employees, many=True).data,
            'patients': PatientSerializer(patients, many=True).data,
            'patients_count': total_patients_count,
            'dentos_patients_count': dentos_patients_count,
            'excel_patients_count': excel_patients_count,
            'storage': {
                'quota_gb': storage_quota,
                'used_gb': storage_used,
                'free_gb': cloud.get('free_gb', max(0.0, round(storage_quota - storage_used, 2))),
                'usage_percent': cloud.get('usage_percent', min(100.0, round((storage_used / (storage_quota or 1.0)) * 100, 1))),
                'warning': cloud.get('warning', False) or server.get('warning', False),
                'cloud': cloud,
                'server': server,
                'breakdown': {
                    'dicom_kt_gb': round(rentgen_item.get('gb', 0.0) + skan_item.get('gb', 0.0), 3),
                    'photos_gb': round(foto_item.get('gb', 0.0), 3),
                    'backups_gb': round(server.get('used_gb', 0.0), 3)
                }
            },
            'linked_technicians': DentalTechnicianSerializer(linked_techs, many=True).data,
            'all_available_technicians': DentalTechnicianSerializer(all_techs, many=True).data
        })

    @action(detail=True, methods=['get'])
    def storage(self, request, pk=None):
        clinic = self.get_object()
        from .storage_calculator import compute_clinic_storage
        return Response(compute_clinic_storage(clinic.id))

    @action(detail=False, methods=['get'], url_path='my-storage')
    def my_storage(self, request):
        clinic_id = request.headers.get('X-Clinic-ID') or getattr(request, 'clinic_id', None)
        if not clinic_id and request.user.is_authenticated and hasattr(request.user, 'clinic') and request.user.clinic:
            clinic_id = request.user.clinic.id
        if not clinic_id:
            clinic = ClinicTenant.objects.first()
            clinic_id = clinic.id if clinic else 1
        from .storage_calculator import compute_clinic_storage
        info = compute_clinic_storage(clinic_id)
        if not info:
            return Response({'detail': 'Klinika topilmadi.'}, status=404)
        return Response(info)

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
            cloud_quota = float(clinic.cloud_storage_quota_gb if clinic.cloud_storage_quota_gb is not None else (clinic.storage_quota_gb if clinic.storage_quota_gb is not None else 1000.0))
            if total + f.size > cloud_quota * 1024 ** 3:
                raise ValidationError({'file': f"Klinika Cloud (Cloupard) xotira limiti to‘ldi ({cloud_quota} GB)."})
            # storage_backend tegi PatientMedia.save() ichida avtomatik qo'yiladi (3 tur ham).
            serializer.save(clinic=clinic, file_name=f.name, file_size=f.size,
                            file_type=getattr(f, 'content_type', '') or 'application/octet-stream')

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        from django.http import FileResponse, HttpResponseRedirect, HttpResponseNotModified
        from .storage import open_media_for_read, media_remote_url
        media = self.get_object()
        if not media.file:
            return Response(status=404)
        # VIDEO (remote): Django proksisi orqali oqitish SEKIN va seek (oldinga o'tish)
        # ishlamaydi. Ruxsat get_object() da tekshirilgach, brauzer to'g'ridan-to'g'ri
        # Cloupard presigned URL'dan oqizadi (tez + Range/seek). Lokal fayl (presigned
        # yo'q) yoki rasm → avvalgidek proksi (kichik foto autentifikatsiyasi saqlanadi).
        from pathlib import PurePath
        is_video = (media.file_type or '').lower().startswith('video/') or \
            PurePath(media.file_name or '').suffix.lower() in {'.mp4', '.webm', '.mov', '.m4v', '.ogg', '.ogv'}
        if is_video:
            remote = media_remote_url(media)
            if remote:
                return HttpResponseRedirect(remote)

        etag = f'"{media.id}-{media.file_size}"'
        if_none_match = request.headers.get('If-None-Match')
        if if_none_match and if_none_match.strip('"') == etag.strip('"'):
            return HttpResponseNotModified()

        # Proxy through the authenticated backend: no storage credential or permanent public URL
        # reaches the browser. open_media_for_read fayl saqlangan backend'dan ochadi
        # (eski local/B2 fayllar yangi Cloupard'ga ko'chmasa ham ochiladi).
        response = FileResponse(open_media_for_read(media), content_type=media.file_type or 'application/octet-stream',
                                as_attachment=False, filename=media.file_name)
        response['Cache-Control'] = 'private, max-age=86400, must-revalidate'
        response['ETag'] = etag
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


# ── Ko'p-varaqli XLSX o'qish (Счета/Оплаты tarixini import qilish uchun) ──────
_XL_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
_XL_RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'


def _xlsx_shared_strings(z):
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
        ns = {'x': _XL_NS}
        for si in ss.findall('.//x:si', ns):
            texts = [t.text or '' for t in si.findall('.//x:t', ns)]
            shared.append(''.join(texts))
    return shared


def _xlsx_sheet_paths(z):
    """{varaq nomi -> 'xl/worksheets/sheetN.xml'} — nomi bo'yicha topish uchun."""
    ns = {'x': _XL_NS}
    try:
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    except KeyError:
        return {}
    rid_to_target = {}
    for rel in rels:
        rid_to_target[rel.get('Id')] = rel.get('Target')
    result = {}
    for sh in wb.findall('.//x:sheets/x:sheet', ns):
        name = sh.get('name') or ''
        rid = sh.get('{%s}id' % _XL_RNS)
        target = (rid_to_target.get(rid) or '').lstrip('/')
        if target and not target.startswith('xl/'):
            target = 'xl/' + target
        if target:
            result[name] = target
    return result


def _xlsx_rows(z, shared, path):
    """Varaqdagi barcha qatorlarni list[list[str]] ko'rinishida qaytaradi."""
    ns = {'x': _XL_NS}
    ws = ET.fromstring(z.read(path))

    def cell_value(c):
        t = c.get('t', '')
        v_el = c.find('x:v', ns)
        if t == 'inlineStr':
            is_el = c.find('.//x:t', ns)
            return is_el.text if is_el is not None else ''
        if v_el is None:
            return ''
        if t == 's':
            try:
                idx = int(v_el.text)
            except (TypeError, ValueError):
                return ''
            return shared[idx] if idx < len(shared) else ''
        return v_el.text or ''

    def col_index(ref):
        letters = ''.join(ch for ch in ref if ch.isalpha())
        idx = 0
        for ch in letters:
            idx = idx * 26 + (ord(ch.upper()) - ord('A') + 1)
        return idx - 1 if idx else 0

    rows = []
    for row in ws.findall('.//x:row', ns):
        cells = row.findall('x:c', ns)
        if not cells:
            rows.append([])
            continue
        vals = {}
        max_idx = 0
        for pos, c in enumerate(cells):
            ref = c.get('r', '')
            ci = col_index(ref) if ref else pos
            vals[ci] = cell_value(c)
            if ci > max_idx:
                max_idx = ci
        rows.append([vals.get(i, '') for i in range(max_idx + 1)])
    return rows


def _norm_name(name: str) -> str:
    """Ism tokenlarini saralab kalit yasaydi — 'Familiya Ism' va 'Ism Familiya'
    bir xil kalit beradi (varaqlar orasida bog'lash uchun)."""
    if not name:
        return ''
    return ' '.join(sorted(str(name).strip().lower().split()))


def _parse_dt_text(s: str):
    """'03.11.2025 14:23' → datetime yoki None."""
    s = (s or '').strip()
    for fmt in ('%d.%m.%Y %H:%M', '%d.%m.%Y %H:%M:%S', '%d.%m.%Y', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _find_header_col(headers, patterns):
    for i, h in enumerate(headers):
        hl = (h or '').strip().lower()
        for p in patterns:
            if p in hl:
                return i
    return -1


def _parse_finance_sheets(fileobj):
    """XLSX'dan Счета (hisoblar) va Оплаты (to'lovlar) varaqlarini o'qiydi.
    Qaytaradi: (charges, payments) — har biri dict ro'yxati.
    Varaq yo'q bo'lsa bo'sh ro'yxat."""
    charges, payments = [], []
    with zipfile.ZipFile(fileobj) as z:
        shared = _xlsx_shared_strings(z)
        paths = _xlsx_sheet_paths(z)

        def match_sheet(patterns):
            for name, path in paths.items():
                nl = name.strip().lower()
                if any(p in nl for p in patterns):
                    return path
            return None

        # Счета — hisoblar (qarz manbai)
        sch_path = match_sheet(['счет', 'счёт', 'invoice', 'hisob'])
        if sch_path:
            rows = _xlsx_rows(z, shared, sch_path)
            if rows:
                hdr = rows[0]
                c_name = _find_header_col(hdr, ['фио', 'клиент', 'имя', 'name'])
                c_date = _find_header_col(hdr, ['дата'])
                c_serv = _find_header_col(hdr, ['услуг', 'servis', 'xizmat'])
                c_stat = _find_header_col(hdr, ['статус', 'status', 'holat'])
                c_sum = _find_header_col(hdr, ['сумма', 'summa', 'итог'])
                c_paid = _find_header_col(hdr, ['оплачено', 'to\'langan', 'paid'])

                def g(row, i):
                    return row[i].strip() if 0 <= i < len(row) else ''

                for row in rows[1:]:
                    nm = g(row, c_name)
                    if not nm:
                        continue
                    charges.append({
                        'name': nm,
                        'date': g(row, c_date),
                        'services': g(row, c_serv),
                        'status': g(row, c_stat),
                        'total': _parse_balance(g(row, c_sum)),
                        'paid': _parse_balance(g(row, c_paid)),
                    })

        # Оплаты — to'lovlar
        opl_path = match_sheet(['оплат', 'payment', 'to\'lov', 'tolov'])
        if opl_path:
            rows = _xlsx_rows(z, shared, opl_path)
            if rows:
                hdr = rows[0]
                c_name = _find_header_col(hdr, ['клиент', 'фио', 'имя', 'name'])
                c_date = _find_header_col(hdr, ['дата', 'date'])
                c_type = _find_header_col(hdr, ['тип', 'type', 'turi'])
                c_sum = _find_header_col(hdr, ['сумма', 'summa', 'amount'])

                def g2(row, i):
                    return row[i].strip() if 0 <= i < len(row) else ''

                for row in rows[1:]:
                    nm = g2(row, c_name)
                    if not nm:
                        continue
                    payments.append({
                        'name': nm,
                        'date': g2(row, c_date),
                        'ptype': g2(row, c_type),
                        'amount': _parse_balance(g2(row, c_sum)),
                    })
    return charges, payments


def _build_imported_ledger(clinic, charges, payments, name_to_patient):
    """charges + payments → ImportedLedgerEntry obyektlari ro'yxati (bazaga yozilmagan).
    Har bemor bo'yicha xronologik tartib va qoldiq qarz (running balance) hisoblanadi.

    Model (tekshirilgan): Dentos balansi = (Оплата + Погашение) − hisoblar.
    'Пополнение баланса' (avans) ALOHIDA hamyon — qarz qoldig'iga ta'sir qilmaydi."""
    from .models import ImportedLedgerEntry
    import itertools

    AVANS = 'Пополение баланса'          # eksportdagi imlo (sic)
    DEBT_REPAY = 'Погашение задолженности'

    # ── Nom bo'yicha bemorga bog'lash (patronim/otasining ismiga chidamli) ──
    # Bemorlar varag'ida FIO ko'pincha 3 so'z (Familiya Ism Otasining-ismi), lekin
    # Счета/Оплаты'da faqat 2 so'z (Ism Familiya). Shu sabab to'liq nom mos kelmaydi.
    # Yechim: har bemorning 2-so'zli juftliklari (familiya+ism) bo'yicha ham indeks.
    exact_map = dict(name_to_patient)   # norm(to'liq FIO) -> Patient
    pair_index = {}                      # "ism familiya" (2 so'z, saralangan) -> Patient
    ambiguous = set()
    for key, pat in name_to_patient.items():
        toks = key.split()
        if len(toks) >= 2:
            for combo in itertools.combinations(toks, 2):   # toks allaqachon saralangan
                pk = ' '.join(combo)
                if pk in pair_index and pair_index[pk] is not pat:
                    ambiguous.add(pk)   # bir juftlik 2 xil bemorda — ishonchsiz
                else:
                    pair_index[pk] = pat
    for pk in ambiguous:
        pair_index.pop(pk, None)        # noaniqlarni bog'lamaymiz (xato bog'lamaslik uchun)

    def match_patient(name_norm):
        p = exact_map.get(name_norm)
        if p is not None:
            return p
        toks = name_norm.split()         # _norm_name natijasi — saralangan
        if len(toks) == 2:
            return pair_index.get(' '.join(toks))
        if len(toks) >= 3:
            for combo in itertools.combinations(toks, 2):
                p = pair_index.get(' '.join(combo))
                if p is not None:
                    return p
        return None

    # name_norm -> hodisalar
    by_name = {}
    for ch in charges:
        k = _norm_name(ch['name'])
        by_name.setdefault(k, []).append(('charge', ch))
    for p in payments:
        k = _norm_name(p['name'])
        by_name.setdefault(k, []).append(('payment', p))

    EPOCH = datetime.datetime(1900, 1, 1)
    entries = []
    for k, evs in by_name.items():
        # xronologik tartib
        def ev_dt(e):
            raw = e[1]['date']
            return _parse_dt_text(raw) or EPOCH
        evs.sort(key=ev_dt)

        patient = match_patient(k)
        display_name = evs[0][1]['name'] if evs else ''
        running = Decimal('0')
        for si, (kind, data) in enumerate(evs):
            dt = _parse_dt_text(data['date'])
            if kind == 'charge':
                status_raw = (data['status'] or '').strip()
                cancelled = (status_raw == 'Отменен')
                total = data['total'] or Decimal('0')
                if cancelled:
                    status = 'cancelled'
                    paid = Decimal('0')
                elif status_raw == 'Оплачен':
                    status = 'paid_earlier'   # oldin to'langan (ko'pincha naqd)
                    paid = total
                    running -= total
                elif status_raw.startswith('Оплачен не'):
                    status = 'partial'
                    paid = data['paid'] or Decimal('0')
                    running -= total
                else:
                    status = 'debt'
                    paid = data['paid'] or Decimal('0')
                    running -= total
                entries.append(ImportedLedgerEntry(
                    clinic=clinic, patient=patient, patient_name=display_name,
                    event_date=dt, date_text=(data['date'] or ''), kind='charge',
                    detail=(data['services'] or '').replace('\n\n', '; ').replace('\n', ' ').strip(),
                    amount=total, paid=paid, running_balance=running,
                    status=status, sort_index=si,
                ))
            else:
                ptype = (data['ptype'] or '').strip()
                amt = data['amount'] or Decimal('0')
                if ptype == AVANS:
                    kind2, status = 'avans', 'avans'
                    # avans qarz qoldig'iga ta'sir qilmaydi
                elif ptype == DEBT_REPAY:
                    kind2, status = 'payment', 'debt_repay'
                    running += amt
                else:
                    kind2, status = 'payment', 'payment'
                    running += amt
                entries.append(ImportedLedgerEntry(
                    clinic=clinic, patient=patient, patient_name=display_name,
                    event_date=dt, date_text=(data['date'] or ''), kind=kind2,
                    detail=ptype, amount=amt, paid=Decimal('0'),
                    running_balance=running, status=status, sort_index=si,
                ))
    return entries


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
        raw_bytes = xlsx_file.read()
        rows = _parse_xlsx_rows(io.BytesIO(raw_bytes))
    except Exception as exc:
        return Response({'detail': f'Fayl o\'qilmadi: {exc}'}, status=400)

    created_count = 0
    updated_count = 0
    skipped_count = 0
    imported_ids = []   # yaratilgan + yangilangan bemor ID'lari (o'chirish tugmasi uchun)
    errors = []
    name_to_patient = {}   # _norm_name(FIO) -> Patient — moliyaviy tarixni bog'lash uchun

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
            # MUHIM: FAQAT telefon bo'yicha moslamaymiz — oila a'zolari ko'pincha bitta
            # telefonni baham ko'radi (Excel'da 1 telefonga 2-3 xil bemor). Telefon bo'yicha
            # birlashtirsak, turli odamlar bitta yozuvga qo'shilib, qarz balansi BOSHQA
            # odamga o'tib ketadi (soxta qarzdor). Shu sabab ISM + telefon bo'yicha moslaymiz.
            obj = Patient.objects.filter(clinic=clinic, full_name=full_name, phone=phone).first()

            if obj:
                obj.full_name = full_name
                # Excel'dagi balans HAR DOIM o'rnatiladi (0 bo'lsa ham — qarz uzilgan bo'lishi
                # mumkin; avval "0 bo'lsa tegma" edi va eski qarz qolib ketardi).
                obj.balance = balance
                if birth_date:
                    obj.birth_date = birth_date
                if notes_val and not obj.notes:
                    obj.notes = notes_val
                obj.source = 'excel'
                obj.save(update_fields=['full_name', 'balance', 'birth_date', 'notes', 'source'])
                updated_count += 1
            else:
                obj = Patient.objects.create(
                    clinic=clinic,
                    full_name=full_name,
                    phone=phone,
                    balance=balance,
                    birth_date=birth_date,
                    notes=notes_val,
                    source='excel',
                )
                created_count += 1
            imported_ids.append(obj.id)
            name_to_patient[_norm_name(full_name)] = obj
        except Exception as exc:
            errors.append({'row': idx, 'name': full_name, 'reason': str(exc)})

    # ── Moliyaviy tarix (Счета + Оплаты) ni import qilamiz ──────────────────
    # Bemorning "To'lovlar" tabida ALOHIDA "Excel'dan yuklangan" bo'limda chiqadi.
    ledger_created = 0
    try:
        charges, payments = _parse_finance_sheets(io.BytesIO(raw_bytes))
        if charges or payments:
            from .models import ImportedLedgerEntry
            # Qayta import: shu klinikaning eski ko'chirilgan tarixini tozalaymiz (idempotent)
            ImportedLedgerEntry.objects.filter(clinic=clinic).delete()
            ledger_objs = _build_imported_ledger(clinic, charges, payments, name_to_patient)
            if ledger_objs:
                ImportedLedgerEntry.objects.bulk_create(ledger_objs, batch_size=1000)
                ledger_created = len(ledger_objs)
    except Exception as exc:
        errors.append({'row': 0, 'name': 'Moliyaviy tarix (Счета/Оплаты)', 'reason': str(exc)})

    return Response({
        'ok': True,
        'total': len(rows),
        'created': created_count,
        'updated': updated_count,
        'skipped': skipped_count,
        'ledgerCreated': ledger_created,   # ko'chirilgan hisob/to'lov satrlari soni
        'importedIds': imported_ids,
        'errors': errors[:50],  # ko'pi bilan 50 ta xato
    })


@api_view(['GET'])
def patient_imported_ledger(request, pk):
    """Bemorning Excel'dan ko'chirilgan moliyaviy tarixi (hisoblar + to'lovlar).
    GET /api/patients/<pk>/imported-ledger/

    "To'lovlar" tabidagi ALOHIDA "Excel'dan yuklangan" bo'lim uchun."""
    from .models import Patient, ImportedLedgerEntry
    try:
        patient = Patient.objects.get(pk=pk)
    except Patient.DoesNotExist:
        return Response({'detail': 'Bemor topilmadi.'}, status=404)

    # Klinika scoping: superadmin bo'lmasa, so'ragan klinika bemor klinikasi bilan mos kelsin
    clinic_id = get_clinic_id(request)
    if not getattr(request.user, 'is_superuser', False):
        if clinic_id and patient.clinic_id and str(clinic_id) != str(patient.clinic_id):
            return Response({'detail': 'Ruxsat yo‘q.'}, status=403)

    # Bir necha akkaunt birlashtirilgan bo'lsa, har yozuvning ASL akkaunti (patient_name)
    # saqlanadi — "qaysi akkauntda buncha edi" ko'rinishi uchun. event_date bo'yicha
    # saralaymiz (turli akkauntlar bir xil shaxs — xronologik umumiy oqim).
    qs = ImportedLedgerEntry.objects.filter(patient=patient).order_by('event_date', 'sort_index', 'id')
    data = [{
        'id': e.id,
        'date': e.date_text,
        'account': e.patient_name,     # asl Excel ismi (birlashtirilganda qaysi akkaunt)
        'kind': e.kind,
        'detail': e.detail,
        'amount': float(e.amount),
        'paid': float(e.paid),
        'running_balance': float(e.running_balance),
        'status': e.status,
    } for e in qs]

    # Akkauntlar bo'yicha xulosa (nechta yozuv qaysi akkauntdan, qancha hisob/to'lov)
    from collections import OrderedDict
    acc_map = OrderedDict()
    for e in qs:
        key = e.patient_name or '—'
        a = acc_map.setdefault(key, {'name': key, 'count': 0, 'charged': 0.0, 'paid': 0.0})
        a['count'] += 1
        if e.kind == 'charge' and e.status != 'cancelled':
            a['charged'] += float(e.amount)
        elif e.kind == 'payment':
            a['paid'] += float(e.amount)
    accounts = list(acc_map.values())

    current = data[-1]['running_balance'] if data else 0
    return Response({
        'ok': True,
        'count': len(data),
        'current_balance': current,
        'official_balance': float(patient.balance),
        'account_count': len(accounts),   # nechta alohida akkaunt birlashgan
        'accounts': accounts,
        'entries': data,
    })


@api_view(['GET'])
def patient_merge_candidates(request, pk):
    """Bemorning mumkin bo'lgan dublikatlari (bir xil shaxs, alohida yozuvlar).
    Bir xil telefon YOKI bir xil (patronimga chidamli) ism bo'yicha topadi.
    GET /api/patients/<pk>/merge-candidates/"""
    from .models import Patient, ImportedLedgerEntry
    try:
        base = Patient.objects.get(pk=pk)
    except Patient.DoesNotExist:
        return Response({'detail': 'Bemor topilmadi.'}, status=404)

    base_norm = _norm_name(base.full_name)
    base_tokens = set(base_norm.split())
    base_phone = (base.phone or '').strip()

    cands = []
    qs = Patient.objects.filter(clinic=base.clinic).exclude(pk=base.pk)
    for p in qs:
        same_phone = bool(base_phone) and (p.phone or '').strip() == base_phone
        pn = _norm_name(p.full_name)
        ptoks = set(pn.split())
        # Ism mosligi: to'liq teng YOKI biri ikkinchisining ichki to'plami (patronim farqi)
        same_name = (pn == base_norm) or (base_tokens and ptoks and (base_tokens <= ptoks or ptoks <= base_tokens))
        if same_phone or same_name:
            n_led = ImportedLedgerEntry.objects.filter(patient=p).count()
            cands.append({
                'id': p.id,
                'name': p.full_name,
                'phone': p.phone,
                'balance': float(p.balance),
                'birth_date': p.birth_date.isoformat() if p.birth_date else '',
                'source': p.source,
                'ledger_count': n_led,
                'match': 'phone' if same_phone else 'name',
            })
    cands.sort(key=lambda c: (c['match'] != 'phone', c['name']))
    return Response({'ok': True, 'count': len(cands), 'candidates': cands})


@api_view(['POST'])
def patient_merge(request, pk):
    """Bir necha bemor yozuvini (bir xil shaxs) BITTAGA birlashtiradi.
    POST /api/patients/<pk>/merge/  body: {"source_ids": [id1, id2, ...]}

    <pk> — SAQLANADIGAN (asosiy) yozuv. source_ids undagi ustiga ko'chiriladi va
    o'chiriladi. Barcha tarix (qabullar, to'lovlar, Excel-tarix, media...) ko'chadi,
    balanslar qo'shiladi."""
    from django.db import transaction
    from .models import (Patient, Appointment, FinancialTransaction, ImportedLedgerEntry,
                         ClinicTask, DentalLabOrder, PatientMedia, PhotoProtocol, PatientRecord)
    from .reception_models import ReceptionContact

    try:
        survivor = Patient.objects.get(pk=pk)
    except Patient.DoesNotExist:
        return Response({'detail': 'Asosiy bemor topilmadi.'}, status=404)

    source_ids = request.data.get('source_ids') or []
    if not isinstance(source_ids, list) or not source_ids:
        return Response({'detail': 'source_ids ro\'yxati kerak.'}, status=400)
    source_ids = [int(s) for s in source_ids if str(s).isdigit() and int(s) != survivor.id]
    sources = list(Patient.objects.filter(clinic=survivor.clinic, id__in=source_ids))
    if not sources:
        return Response({'detail': 'Birlashtiriladigan yozuv topilmadi.'}, status=400)

    from decimal import Decimal
    merged_balance = Decimal(str(survivor.balance))
    with transaction.atomic():
        for src in sources:
            # Excel-tarix: manba hisobini (source_account) nomida saqlaymiz — "To'lovlar"da
            # qaysi akkauntdan kelgani ko'rinishi uchun (patient_name o'zgarmaydi).
            ImportedLedgerEntry.objects.filter(patient=src).update(patient=survivor)
            Appointment.objects.filter(patient=src).update(patient=survivor)
            FinancialTransaction.objects.filter(patient=src).update(patient=survivor)
            ClinicTask.objects.filter(patient=src).update(patient=survivor)
            DentalLabOrder.objects.filter(patient=src).update(patient=survivor)
            PatientMedia.objects.filter(patient=src).update(patient=survivor)
            PhotoProtocol.objects.filter(patient=src).update(patient=survivor)
            PatientRecord.objects.filter(patient=src).update(patient=survivor)
            ReceptionContact.objects.filter(patient=src).update(patient=survivor)
            merged_balance += Decimal(str(src.balance))
            # Agar asosiy yozuvda tug'ilgan sana/telefon bo'sh bo'lsa — manbadan to'ldiramiz
            if not survivor.birth_date and src.birth_date:
                survivor.birth_date = src.birth_date
            if not (survivor.phone or '').strip() and (src.phone or '').strip():
                survivor.phone = src.phone

        survivor.balance = merged_balance
        survivor.save()
        deleted_ids = [s.id for s in sources]
        Patient.objects.filter(id__in=deleted_ids).delete()

    return Response({
        'ok': True,
        'survivor_id': survivor.id,
        'merged_count': len(sources),
        'deleted_ids': deleted_ids,
        'new_balance': float(survivor.balance),
    })


def _delete_patients_and_media(clinic_id, ids=None, delete_all=False):
    """Klinika bemorlarini va ularning barcha media fayllarini (Cloupard/disk) to'liq tozalaydi."""
    from django.db import transaction
    from .models import Patient, PatientMedia, FinancialTransaction, ImportedLedgerEntry
    from .reception_models import ReceptionContact
    import logging
    logger = logging.getLogger(__name__)

    with transaction.atomic():
        if delete_all:
            pts_qs = Patient.objects.filter(clinic_id=clinic_id)
            # Bog'lanmagan (patient=None) ko'chirilgan tarixni ham tozalaymiz
            ImportedLedgerEntry.objects.filter(clinic_id=clinic_id).delete()
        else:
            pts_qs = Patient.objects.filter(clinic_id=clinic_id, id__in=ids or [])

        patient_ids = list(pts_qs.values_list('id', flat=True))
        if not patient_ids:
            return 0

        # 1. Barcha PatientMedia fayllarini disk va Cloupard'dan tozalash
        media_qs = PatientMedia.objects.filter(clinic_id=clinic_id, patient_id__in=patient_ids)
        for m in media_qs:
            if m.file:
                try:
                    m.file.delete(save=False)
                except Exception as e:
                    logger.warning(f"Patient media delete error: {e}")
        media_qs.delete()

        # 2. Bemorlarga tegishli to'lov tranzaksiyalari
        FinancialTransaction.objects.filter(clinic_id=clinic_id, patient_id__in=patient_ids).delete()

        # 3. Reception bog'lanmalari
        ReceptionContact.objects.filter(clinic_id=clinic_id, patient_id__in=patient_ids).delete()

        # 4. Bemorlarni o'chirish (CASCADE: Appointment, PatientRecord, PhotoProtocol, DentalLabOrder)
        Patient.objects.filter(clinic_id=clinic_id, id__in=patient_ids).delete()

        return len(patient_ids)


def _check_clinic_admin_or_superadmin(request, clinic_id_param):
    """Superadmin yoki klinikaning o'z direktori/admini ekanligini tekshiradi."""
    if not request.user.is_authenticated:
        return None, Response({'detail': 'Kirish talab qilinadi.'}, status=401)

    if request.user.is_superuser:
        if not clinic_id_param:
            return None, Response({'detail': 'Klinika identifikatori (clinic) kerak.'}, status=400)
        try:
            target_cid = int(clinic_id_param)
        except (ValueError, TypeError):
            return None, Response({'detail': 'Klinika identifikatori noto‘g‘ri.'}, status=400)
    else:
        # Klinika xodimi: faqat o'z direktori yoki admini
        user_role = getattr(request.user, 'role', None)
        if user_role not in ('director', 'deputy_director', 'admin'):
            return None, Response({'detail': 'Faqat klinika rahbari yoki administratoriga ruxsat berilgan.'}, status=403)

        user_cid = getattr(request.user, 'clinic_id', None)
        if not user_cid:
            principal = getattr(getattr(request, '_request', None), 'crm_principal', None)
            user_cid = getattr(principal, 'clinic_id', None)

        if not user_cid:
            return None, Response({'detail': 'Klinika aniqlanmadi.'}, status=400)

        if clinic_id_param and str(clinic_id_param) != str(user_cid):
            return None, Response({'detail': 'Boshqa klinika ma\'lumotlarini o‘chirish taqiqlangan.'}, status=403)

        target_cid = int(user_cid)

    if target_cid == 1:
        return None, Response({'detail': 'Demo klinika (id=1) bemorlarini o‘chirish mumkin emas.'}, status=400)

    return target_cid, None


@api_view(['DELETE', 'POST'])
def excel_delete_imported_patients(request):
    """Superadmin yoki klinika admini: ID ro'yxati bo'yicha yoki barcha bemorlarni o'chiradi.

    DELETE /api/patients/excel-delete/?clinic=<id>
    JSON body: {ids: [1,2,3,...]} yoki {all: true}
    """
    clinic_param = request.query_params.get('clinic') or request.data.get('clinic')
    clinic_id, err_resp = _check_clinic_admin_or_superadmin(request, clinic_param)
    if err_resp:
        return err_resp

    delete_all = bool(request.data.get('all') or request.query_params.get('all') in ('1', 'true', 'True'))
    ids = request.data.get('ids', [])

    if not delete_all and (not ids or not isinstance(ids, list)):
        return Response({'detail': 'ids ro\'yxati yoki all=true parametri kerak.'}, status=400)

    deleted = _delete_patients_and_media(clinic_id=clinic_id, ids=ids, delete_all=delete_all)
    return Response({'ok': True, 'deleted': deleted})


@api_view(['POST', 'DELETE'])
def clear_all_patients(request):
    """Klinika rahbari/admini yoki superadmin: klinikaning BARCHA bemorlarini to'liq o'chiradi.

    POST or DELETE /api/patients/clear-all/?clinic=<id>
    """
    clinic_param = request.query_params.get('clinic') or request.data.get('clinic')
    clinic_id, err_resp = _check_clinic_admin_or_superadmin(request, clinic_param)
    if err_resp:
        return err_resp

    deleted = _delete_patients_and_media(clinic_id=clinic_id, delete_all=True)
    return Response({
        'ok': True,
        'deleted': deleted,
        'message': f"Klinikaning barcha bemorlari ({deleted} ta) va ularning ma'lumotlari to‘liq o‘chirildi."
    })


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

