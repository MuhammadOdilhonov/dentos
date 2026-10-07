from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum, Q, Count
import datetime

from .models import (
    Employee, Patient, Appointment, FinancialTransaction, ClinicTask,
    WarehouseItem, DentalLabOrder, DentalTechnician, PlatformSetting, ClinicTenant,
    PlatformUser, Workplace, Specialty, Branch
)
from .serializers import (
    EmployeeSerializer, PatientSerializer, AppointmentSerializer,
    FinancialTransactionSerializer, ClinicTaskSerializer,
    WarehouseItemSerializer, DentalLabOrderSerializer,
    DentalTechnicianSerializer, PlatformSettingSerializer, ClinicTenantSerializer,
    PlatformUserSerializer, WorkplaceSerializer, SpecialtySerializer, BranchSerializer
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
    if u and u.password == password:
        # Sync branch with Employee table if needed
        if u.role in ('doctor', 'admin', 'kassa', 'deputy_director'):
            emp = None
            if u.username:
                emp = Employee.objects.filter(username__iexact=u.username).first()
            if not emp and u.full_name:
                emp = Employee.objects.filter(full_name__iexact=u.full_name).first()
            if not emp and u.role == 'doctor':
                emp = Employee.objects.filter(Q(id=1) | Q(role='doctor')).first()

            if emp and emp.branch and u.branch_id != emp.branch_id:
                u.branch = emp.branch
                u.save(update_fields=['branch'])
        user_data = PlatformUserSerializer(u).data
        # Klinika modul-gate ma'lumoti: bloklangan modullar login paytida yuboriladi,
        # frontend shu bo'yicha sidebar/sahifalarni butunlay yopadi (superadmin har doim ochiq).
        user_data['enabled_modules'] = _clinic_modules_payload(u.clinic)
        return Response({'ok': True, 'user': user_data})

    tech = DentalTechnician.objects.filter(Q(username__iexact=username) | Q(username__iexact=username.lower()), password=password, is_active=True).first()
    if tech:
        clinic_name = (tech.linked_clinics or ['Dental Lab'])[0]
        parts = [p for p in tech.name.split() if p]
        initials = (parts[0][0] + parts[1][0]).upper() if len(parts) >= 2 else tech.name[:2].upper()
        return Response({'ok': True, 'user': {
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

    return Response({'ok': False, 'message': 'Login yoki parol noto‘g‘ri'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def update_profile(request):
    """
    Foydalanuvchi profilini yangilash:
    Gmail/username, parol, F.I.O, telefon raqam.
    Sozlamalar bo'limidan direktor yoki boshqa xodim o'zgartiradi.
    """
    user_id = request.data.get('user_id')
    current_username = (request.data.get('current_username') or '').strip()
    new_username = (request.data.get('username') or request.data.get('email') or '').strip()
    new_password = (request.data.get('password') or '').strip()
    new_name = (request.data.get('full_name') or request.data.get('name') or '').strip()
    new_phone = (request.data.get('phone') or '').strip()
    clinic_id = request.data.get('clinic_id') or get_clinic_id(request)
    role = (request.data.get('role') or '').strip()

    try:
        clinic_id = int(clinic_id) if clinic_id else None
    except (ValueError, TypeError):
        clinic_id = None

    u = None
    # 1. user_id bo'yicha (agar clinic_id berilgan bo'lsa — faqat shu klinikaga tegishli bo'lsa qabul qilamiz)
    if user_id:
        try:
            cand = PlatformUser.objects.filter(id=int(user_id)).first()
            if cand and (not clinic_id or cand.clinic_id == clinic_id or cand.role == 'superadmin'):
                u = cand
        except (ValueError, TypeError):
            pass
    # 2. joriy login bo'yicha
    if not u and current_username:
        u = PlatformUser.objects.filter(username__iexact=current_username).first()
    # 3. yangi login bo'yicha (o'zgartirilmagan bo'lsa ham)
    if not u and new_username:
        u = PlatformUser.objects.filter(username__iexact=new_username).first()
    # 4. klinika + rol bo'yicha (direktor uchun ishonchli yo'l)
    if not u and clinic_id:
        if role in ('director', '') or not role:
            u = PlatformUser.objects.filter(clinic_id=clinic_id, role='director').first()
        if not u and role:
            u = PlatformUser.objects.filter(clinic_id=clinic_id, role=role).first()
        if not u:
            u = PlatformUser.objects.filter(clinic_id=clinic_id).first()

    # Employee jadvalidan ham qidiramiz (sinxronlash uchun)
    emp = None
    if user_id:
        try:
            emp = Employee.objects.filter(id=int(user_id)).first()
            if emp and clinic_id and emp.clinic_id and emp.clinic_id != clinic_id:
                emp = None
        except (ValueError, TypeError):
            pass
    if not emp and current_username:
        emp = Employee.objects.filter(username__iexact=current_username).first()

    # PlatformUser topilmasa — avtomatik yaratamiz (klinika bo'lsa bog'laymiz, bo'lmasa ham yaratamiz)
    if not u:
        clinic = ClinicTenant.objects.filter(id=clinic_id).first() if clinic_id else None
        fallback_username = (new_username or current_username
                             or (f"director.clinic{clinic_id}@gmail.com" if clinic_id else None))
        if fallback_username:
            u = PlatformUser.objects.create(
                username=fallback_username,
                password=new_password or '123456',
                full_name=new_name or (clinic.director_name if clinic else None) or 'Klinika Rahbari',
                role=role or 'director',
                clinic=clinic,
                is_active=True
            )

    if not u and not emp:
        return Response({'ok': False, 'message': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    # Joriy parol kiritilgan bo'lsa — tekshiramiz (parol o'zgartirishda)
    current_password = (request.data.get('current_password') or '').strip()
    if new_password and current_password and u and u.password:
        if u.password != current_password:
            return Response({'ok': False, 'message': 'Joriy parol noto‘g‘ri'}, status=status.HTTP_400_BAD_REQUEST)

    if u:
        if new_username and new_username.lower() != u.username.lower():
            exists = PlatformUser.objects.filter(username__iexact=new_username).exclude(id=u.id).exists()
            if exists:
                return Response({'ok': False, 'message': 'Ushbu Gmail / Login allaqachon band. Boshqa kiriting.'}, status=status.HTTP_400_BAD_REQUEST)
            u.username = new_username

        if new_password:
            u.password = new_password

        if new_name:
            u.full_name = new_name
            if u.role == 'director' and u.clinic:
                u.clinic.director_name = new_name
                if new_phone:
                    u.clinic.phone = new_phone
                u.clinic.save(update_fields=['director_name', 'phone'] if new_phone else ['director_name'])

        u.save()

    # Sync Employee if exists
    if emp or (u and u.username):
        target_emp = emp or Employee.objects.filter(username__iexact=u.username).first()
        if target_emp:
            if new_name:
                target_emp.full_name = new_name
            if new_password:
                target_emp.password = new_password
            if new_username:
                target_emp.username = new_username
            if new_phone:
                target_emp.phone = new_phone
            target_emp.save()

    return Response({
        'ok': True,
        'message': 'Profil va kirish ma’lumotlari muvaffaqiyatli saqlandi',
        'user': PlatformUserSerializer(u).data if u else {
            'id': emp.id,
            'username': emp.username,
            'full_name': emp.full_name,
            'role': emp.role,
            'clinic': emp.clinic_id
        }
    })


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
    import random
    phone = _norm_phone(request.data.get('phone'))
    method = (request.data.get('method') or 'sms').strip().lower()
    if len(phone) < 7:
        return Response({'ok': False, 'message': 'Telefon raqamini to‘g‘ri kiriting'}, status=status.HTTP_400_BAD_REQUEST)

    user = _find_user_by_phone(phone)
    if not user:
        return Response({'ok': False, 'message': 'Bu raqam tizimda topilmadi. Administrator bilan bog‘laning.'}, status=status.HTTP_404_NOT_FOUND)

    code = f"{random.randint(0, 999999):06d}"
    _OTP_STORE[phone] = {'code': code, 'exp': timezone.now() + datetime.timedelta(minutes=5), 'method': method}

    sent = False
    dev_code = None
    msg_text = f"dentOS tizimiga kirish kodi: {code}. Hech kimga bermang. (5 daqiqa amal qiladi)"
    try:
        if method == 'telegram':
            # Ulangan klinika Telegram sessiyasi orqali yuborishga urinish
            from . import telegram_auth as _tg
            res = _tg._send_to(_tg._first_session(), '+' + phone, msg_text, '') if hasattr(_tg, '_first_session') else None
            sent = bool(res)
        else:
            from . import sms_service
            res = sms_service.send_sms('+' + phone, msg_text)
            sent = bool(res and res.get('ok'))
    except Exception as e:
        print('request_login_code send error:', e)
        sent = False

    # DEBUG (lokal/test) yoki yuborilmagan bo'lsa — kodni javobda qaytaramiz (frontend ko'rsatadi).
    # Productionda (DEBUG=False + real SMS/Telegram) kod sirli qoladi.
    from django.conf import settings as _settings
    if not sent or getattr(_settings, 'DEBUG', False):
        dev_code = code

    return Response({'ok': True, 'sent': sent, 'method': method, 'dev_code': dev_code,
                     'message': 'Kod yuborildi' if sent else 'Test rejimi: kod ekranda ko‘rsatiladi'})


@api_view(['POST'])
def verify_login_code(request):
    phone = _norm_phone(request.data.get('phone'))
    code = str(request.data.get('code') or '').strip()
    entry = _OTP_STORE.get(phone)
    if not entry:
        return Response({'ok': False, 'message': 'Avval kod so‘rang'}, status=status.HTTP_400_BAD_REQUEST)
    if timezone.now() > entry['exp']:
        _OTP_STORE.pop(phone, None)
        return Response({'ok': False, 'message': 'Kod muddati tugadi. Qayta so‘rang.'}, status=status.HTTP_400_BAD_REQUEST)
    if code != entry['code']:
        return Response({'ok': False, 'message': 'Kod noto‘g‘ri'}, status=status.HTTP_400_BAD_REQUEST)

    _OTP_STORE.pop(phone, None)
    user = _find_user_by_phone(phone)
    if not user:
        return Response({'ok': False, 'message': 'Foydalanuvchi topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    user_data = PlatformUserSerializer(user).data
    user_data['enabled_modules'] = _clinic_modules_payload(user.clinic)
    return Response({'ok': True, 'user': user_data})


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


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all().order_by('id')
    serializer_class = EmployeeSerializer

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
                is_active=emp.is_active and emp.can_login
            )

class BranchViewSet(viewsets.ModelViewSet):
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

class WorkplaceViewSet(viewsets.ModelViewSet):
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

class SpecialtyViewSet(viewsets.ModelViewSet):
    queryset = Specialty.objects.filter(is_active=True).order_by('id')
    serializer_class = SpecialtySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        clinic_id = get_clinic_id(self.request)
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)
        return qs

    def perform_create(self, serializer):
        clinic_id = get_clinic_id(self.request)
        if clinic_id and not serializer.validated_data.get('clinic'):
            serializer.save(clinic_id=clinic_id)
        else:
            serializer.save()

class PatientViewSet(viewsets.ModelViewSet):
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

class AppointmentViewSet(viewsets.ModelViewSet):
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
        import datetime
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
        apt = self.get_object()
        amount = float(request.data.get('amount', 0))
        payment_method = request.data.get('payment_method', 'Наличные')
        if amount > 0:
            apt.paid_amount += amount
            if apt.paid_amount >= apt.price and apt.status == 'debt':
                apt.status = 'completed'
                apt.color_code = '#64748B'
            apt.save()

            FinancialTransaction.objects.create(
                clinic=apt.clinic,
                appointment=apt,
                branch=apt.branch,
                patient=apt.patient,
                doctor=apt.doctor,
                amount=amount,
                type='income',
                category='Оплата приема',
                payment_method=payment_method,
                cash_register=request.data.get('cash_register', 'cash'),
                operator_name=request.data.get('operator_name', 'Kassir'),
                notes=f"Оплата приема #{apt.id} ({apt.treatment_notes})"
            )
        return Response(AppointmentSerializer(apt).data)

class FinancialTransactionViewSet(viewsets.ModelViewSet):
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

class ClinicTaskViewSet(viewsets.ModelViewSet):
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

class WarehouseItemViewSet(viewsets.ModelViewSet):
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

class DentalLabOrderViewSet(viewsets.ModelViewSet):
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

class DentalTechnicianViewSet(viewsets.ModelViewSet):
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
        techs = DentalTechnician.objects.filter(is_active=True).order_by('name')
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
        tech = DentalTechnician.objects.filter(username=username, password=password, is_active=True).first()
        if not tech:
            return Response({'ok': False, 'message': 'Login yoki parol noto‘g‘ri yoki hisob faol emas'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
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

class PlatformSettingViewSet(viewsets.ModelViewSet):
    queryset = PlatformSetting.objects.all()
    serializer_class = PlatformSettingSerializer

    @action(detail=False, methods=['get', 'post'])
    def current(self, request):
        obj, _ = PlatformSetting.objects.get_or_create(id=1, defaults={
            'clinic_name': '32Desk Stomatologiya Klinikasi',
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

class ClinicTenantViewSet(viewsets.ModelViewSet):
    queryset = ClinicTenant.objects.all().order_by('-created_at')
    serializer_class = ClinicTenantSerializer

    def create(self, request, *args, **kwargs):
        import re, random, string
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        clinic = serializer.save()

        # Extract or auto-generate director credentials (gmail & password)
        director_email = (request.data.get('director_email') or request.data.get('email') or '').strip().lower()
        director_password = (request.data.get('director_password') or request.data.get('password') or '').strip()
        director_name = clinic.director_name or 'Klinika Rahbari'

        if not director_email:
            slug = re.sub(r'[^a-zA-Z0-9]', '', clinic.name.lower())[:10] or 'clinic'
            director_email = f"director.{slug}@gmail.com"

        if not director_password:
            chars = string.ascii_letters + string.digits
            director_password = ''.join(random.choice(chars) for _ in range(8))

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
        user.password = director_password
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
        clinic_data['director_password'] = director_user.password if director_user else ''

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
            'director_password': director.password,
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

