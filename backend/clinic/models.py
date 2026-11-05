from django.db import models
import uuid
from pathlib import PurePath
from django.contrib.auth.models import User

class UserRole(models.TextChoices):
    SUPERADMIN = 'superadmin', 'SuperAdmin'
    DIRECTOR = 'director', 'Direktor / Bosh vrach'
    DEPUTY_DIRECTOR = 'deputy_director', 'Direktor o\'rinbosari / Upravlyayushiy'
    DOCTOR = 'doctor', 'Доктор'
    ADMIN = 'admin', 'Администратор'
    KASSA = 'kassa', 'Kassa'
    TECHNICIAN = 'technician', 'Зубной техник'

class PasswordModel(models.Model):
    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        from django.contrib.auth.hashers import identify_hasher, make_password
        if self.password:
            try:
                identify_hasher(self.password)
            except ValueError:
                self.password = make_password(self.password)
        return super().save(*args, **kwargs)

class Employee(PasswordModel):
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, null=True, blank=True, related_name='employees')
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True, blank=True)
    branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='employees')
    full_name = models.CharField(max_length=255)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.DOCTOR)
    avatar = models.CharField(max_length=500, blank=True, null=True)
    chair = models.CharField(max_length=100, blank=True, default='Кресло 1')
    specialty = models.CharField(max_length=100, blank=True, default='Терапевт')
    color = models.CharField(max_length=20, blank=True, default='#3B82F6')
    phone = models.CharField(max_length=20, blank=True)
    phone_extra = models.CharField(max_length=50, blank=True)
    email = models.CharField(max_length=255, blank=True)
    gender = models.CharField(max_length=20, blank=True, default='male') # male / female
    schedule = models.CharField(max_length=255, blank=True, default='Пн-Сб 09:00 - 18:00')
    schedule_details = models.JSONField(default=list, blank=True) # Detailed intervals with assigned chairs
    salary_rate = models.CharField(max_length=100, blank=True, default='0')
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=35.0)
    experience_years = models.PositiveIntegerField(default=3)
    bio = models.TextField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    assigned_chairs = models.JSONField(default=list, blank=True)
    certificates = models.JSONField(default=list, blank=True)
    diplomas = models.JSONField(default=list, blank=True)
    can_login = models.BooleanField(default=True)
    username = models.CharField(max_length=100, blank=True)
    password = models.CharField(max_length=128, blank=True, default='123456')
    naryad_type = models.CharField(max_length=50, blank=True, default='clinic') # clinic (umumiy) or personal (shaxsiy)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.full_name} ({self.get_role_display()})"

class Patient(models.Model):
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, null=True, blank=True, related_name='patients')
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    category_status = models.CharField(max_length=50, default='Обычный') # VIP, Постоянный, Первичный, etc.
    gender = models.CharField(max_length=10, blank=True, default='М')
    birth_date = models.DateField(null=True, blank=True)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0) # Debt or prepayment
    medical_history = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    service_lang = models.CharField(max_length=5, default='uz')  # xizmat tili: uz/ru/en — xabar shu tilda yuboriladi
    # Bemorga maxsus foiz (%). Belgilangan bo'lsa — naryadda xizmatning standart
    # foizi o'rniga shu qo'llanadi. null = standart foiz ishlatiladi.
    default_percent = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.full_name

class Appointment(models.Model):
    STATUS_CHOICES = (
        ('new', 'Новый'),
        ('unconfirmed', 'Не подтвержден'),
        ('confirmed', 'Подтвержден'),
        ('late', 'Опоздал'),
        ('arrived', 'Прибыл'),
        ('in_progress', 'На приёме'),
        ('waiting_bill', 'Ждёт счёт'),
        ('cancelled', 'Отменен'),
        ('no_show', 'Не явился (Келмади)'),
        ('completed', 'Завершен'),
        ('debt', 'Задолженность'),
        ('reserved', 'Забронировано'),
    )
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, null=True, blank=True, related_name='appointments')
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='appointments')
    doctor = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='appointments')
    branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    treatment_notes = models.TextField(blank=True) # "снятие коронок", "17 ресто", "38 уд"
    sms_sent = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='unconfirmed')
    color_code = models.CharField(max_length=20, default='#F59E0B')
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    chair_name = models.CharField(max_length=100, blank=True, default='Кресло 1')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.patient.full_name} - {self.doctor.full_name} ({self.start_time.strftime('%H:%M')})"

class FinancialTransaction(models.Model):
    request_id = models.UUIDField(null=True, blank=True, unique=True, editable=False)
    TYPE_CHOICES = (
        ('income', 'Приход'),
        ('expense', 'Расход'),
    )
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, null=True, blank=True, related_name='transactions')
    appointment = models.ForeignKey(Appointment, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    patient = models.ForeignKey(Patient, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    doctor = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='financial_transactions')
    technician = models.ForeignKey('DentalTechnician', on_delete=models.SET_NULL, null=True, blank=True, related_name='financial_transactions')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='income')
    category = models.CharField(max_length=100, default='Оплата услуг')
    is_prepayment = models.BooleanField(default=False)
    payment_method = models.CharField(max_length=50, default='Наличные') # Наличные, Карта, Click, Payme, Перечисление
    cash_register = models.CharField(max_length=50, default='cash') # cash, terminal, online, bank_transfer
    operator_name = models.CharField(max_length=255, blank=True, default='Kassir')
    date = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.type.upper()}: {self.amount} ({self.payment_method})"

class ClinicTask(models.Model):
    PRIORITY_CHOICES = (
        ('low', 'Низкий'),
        ('medium', 'Средний'),
        ('high', 'Высокий'),
    )
    STATUS_CHOICES = (
        ('pending', 'Ожидает'),
        ('in_progress', 'В работе'),
        ('completed', 'Выполнено'),
    )
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, null=True, blank=True, related_name='tasks')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    assignee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    patient = models.ForeignKey(Patient, on_delete=models.SET_NULL, null=True, blank=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    due_date = models.DateField(null=True, blank=True)
    branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    branch_name = models.CharField(max_length=255, blank=True)
    creator = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_tasks')
    creator_name = models.CharField(max_length=255, blank=True)
    creator_role = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

class WarehouseItem(models.Model):
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, null=True, blank=True, related_name='warehouse_items')
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, default='Расходные материалы')
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit = models.CharField(max_length=20, default='шт')
    min_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=5)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.quantity} {self.unit})"

class DentalLabOrder(models.Model):
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, null=True, blank=True, related_name='lab_orders')
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='lab_orders')
    doctor = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='lab_orders')
    technician = models.ForeignKey('DentalTechnician', on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    technician_name = models.CharField(max_length=255)
    order_number = models.CharField(max_length=50, blank=True)
    tooth_numbers = models.CharField(max_length=100) # e.g. "16, 17, 26"
    work_type = models.CharField(max_length=255) # e.g. "Циркон с нанесением", "E-max"
    implant_system = models.CharField(max_length=100, blank=True) # e.g. Osstem, Dio
    fixation_type = models.CharField(max_length=50, blank=True) # e.g. "Винтовая", "Цементная"
    status = models.CharField(max_length=50, default='biriktirildi') # biriktirildi, chiqarilvoti, texnik oldi, texnik chiqarvorvoti, klinika oldi
    color_shade = models.CharField(max_length=20, blank=True, default='A2')
    shade_details = models.JSONField(default=dict, blank=True) # cervical, body, incisal, notes
    attached_items = models.JSONField(default=dict, blank=True) # slepki, lozhka, registrator_prikusa, transfer_count, analog_count, has_photo, has_xray, has_scan
    return_items = models.JSONField(default=dict, blank=True) # work_ready, lozhka_returned, transfer_returned, analog_returned, notes, dispatched_at
    clinic_received_items = models.JSONField(default=dict, blank=True) # work_ok, lozhka_ok, transfer_ok, analog_ok, received_at, received_by
    received_date = models.DateField(null=True, blank=True) # Kelgan sana (Keladi)
    due_date = models.DateField(null=True, blank=True) # Ketadigan / topshiriladigan sana (Ketadi)
    primerka_date = models.DateField(null=True, blank=True) # Primerka sanasi
    zdacha_date = models.DateField(null=True, blank=True) # Zdacha sanasi
    dispatch_status = models.CharField(max_length=50, default='in_lab') # in_lab, ready_for_dispatch, dispatched
    clinic_name = models.CharField(max_length=255, blank=True, default='Toshkent Markaziy')
    clinic_logo = models.CharField(max_length=100, blank=True, default='TM')
    branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='lab_orders')
    branch_name = models.CharField(max_length=255, blank=True)
    destination_branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='dest_lab_orders')
    destination_branch_name = models.CharField(max_length=255, blank=True)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0) # Texnik belgilagan narx
    clinic_price = models.DecimalField(max_digits=12, decimal_places=2, default=0) # Klinikadagi narx
    orthopedist_wishes = models.TextField(blank=True)
    patient_wishes = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Лаб #{self.order_number or self.id}: {self.work_type} - {self.patient.full_name}"

class DentalTechnician(PasswordModel):
    name = models.CharField(max_length=255)
    lab_name = models.CharField(max_length=255, default='Dental Lab Pro')
    phone = models.CharField(max_length=50, blank=True)
    username = models.CharField(max_length=100, unique=True)
    password = models.CharField(max_length=100)
    linked_clinics = models.JSONField(default=list, blank=True)
    price_list = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.lab_name})"

class ClinicTenant(models.Model):
    name = models.CharField(max_length=255)
    logo = models.CharField(max_length=255, blank=True, default='DENT')
    branch = models.CharField(max_length=255, default='Toshkent Markaziy Filial')
    director_name = models.CharField(max_length=255, blank=True, default='Музаффар Олимов')
    phone = models.CharField(max_length=50, blank=True, default='+998 71 200-00-32')
    plan_tier = models.CharField(max_length=50, default='Pro')
    max_doctors = models.PositiveIntegerField(default=10)
    storage_quota_gb = models.DecimalField(max_digits=8, decimal_places=2, default=50.0)
    storage_used_gb = models.DecimalField(max_digits=8, decimal_places=2, default=0.0)  # yangi klinika 0 GB dan boshlaydi, real data bo'yicha hisoblanadi
    enabled_modules = models.JSONField(default=dict, blank=True)
    linked_technicians = models.JSONField(default=list, blank=True) # list of technician IDs or usernames
    has_auto_reminders = models.BooleanField(default=False) # Avtomatik eslatma va nlp status yangilash moduli
    has_ai_agent = models.BooleanField(default=False) # Sun'iy intellektli administrator/zapis yozish moduli
    ai_agent_settings = models.JSONField(default=dict, blank=True) # AI konsultatsiya va qabul sozlamalari
    status = models.CharField(max_length=20, default='active') # active, paused
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.branch})"

def _patient_media_path(instance, filename):
    pid = instance.patient_id or 0
    suffix = PurePath(filename).suffix.lower()[:12]
    return f"patient_media/{uuid.uuid4().hex}{suffix}"


class PatientMedia(models.Model):
    """Bemor media fayllari — BAZADA (brauzer IndexedDB/localStorage emas).

    kind: foto (rasm), rentgen (rentgen/KT zip yoki rasm), skan (3D skan zip/stl).
    Fayl diskda (MEDIA_ROOT/patient_media/...), bazada metadata. Har qanday sessiya/
    qurilmadan bir xil ko'rinadi; admin umumiy hisob uchun shu yozuvlarni sanaydi.
    """
    KIND_CHOICES = (
        ('foto', 'Foto'),
        ('rentgen', 'Rentgen / KT'),
        ('skan', '3D Skan'),
    )
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, null=True, blank=True, related_name='patient_media')
    patient = models.ForeignKey('Patient', on_delete=models.CASCADE, related_name='media')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, db_index=True)
    file = models.FileField(upload_to=_patient_media_path, null=True, blank=True)
    file_name = models.CharField(max_length=500, blank=True)
    file_size = models.BigIntegerField(default=0)
    file_type = models.CharField(max_length=120, blank=True)
    meta = models.JSONField(default=dict, blank=True)  # extractedList, filesCount, notes, scanDate, ...
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']
        indexes = [models.Index(fields=['clinic', 'patient', 'kind'])]

    def save(self, *args, **kwargs):
        # Fayl BIRINCHI marta yozilganda u qaysi backend'ga tushganini belgilab qo'yamiz
        # (foto/rentgen/skan — barcha yo'llar uchun yagona joy). Download keyinchalik aynan
        # shu backend'dan o'qiydi; eski (local/B2) fayllar buzilmaydi.
        if self.file and not (self.meta or {}).get('storage_backend'):
            from django.conf import settings
            meta = dict(self.meta or {})
            meta['storage_backend'] = getattr(settings, 'MEDIA_STORAGE', 'local')
            self.meta = meta
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.kind} • {self.file_name} (bemor {self.patient_id})"


class PhotoProtocol(models.Model):
    """Bemor foto-protokoli — slaydlar hujjati (JSON). BAZADA saqlanadi.

    doc: slaydlar/bloklar ro'yxati. Slayddagi rasmlar PatientMedia(kind=foto)
    fayllariga URL orqali bog'lanadi (JSON ichida base64 shishmaydi).
    """
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, null=True, blank=True, related_name='photo_protocols')
    patient = models.OneToOneField('Patient', on_delete=models.CASCADE, related_name='photo_protocol')
    doc = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Foto-protokol (bemor {self.patient_id})"


class ClinicMonthlyPlan(models.Model):
    """Klinikaning oylik moliyaviy rejasi — BAZADA saqlanadi (brauzer localStorage emas).

    Bitta klinika + oy (YYYY-MM) uchun bitta yozuv. Filiallar bo'lsa branch_plans
    ichida {branch_id: summa}, aks holda single_clinic_plan ishlatiladi. acknowledged
    = direktor shu oy uchun rejani ko'rib/tasdiqlagan (avto-modal qayta ochilmasin).
    """
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE, related_name='monthly_plans')
    month = models.CharField(max_length=7, db_index=True)  # 'YYYY-MM'
    single_clinic_plan = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    branch_plans = models.JSONField(default=dict, blank=True)  # {branch_id: amount}
    acknowledged = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('clinic', 'month')

    def __str__(self):
        return f"Reja {self.clinic_id} {self.month}: {self.single_clinic_plan}"


class Branch(models.Model):
    clinic = models.ForeignKey(ClinicTenant, on_delete=models.CASCADE, null=True, blank=True, related_name='branches')
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    location_url = models.CharField(max_length=500, blank=True) # Google Maps / Yandex Maps havola yoki lokatsiya
    use_global_telegram = models.BooleanField(default=True)
    telegram_bot_token = models.CharField(max_length=255, blank=True)
    telegram_chat_id = models.CharField(max_length=100, blank=True)
    telegram_phone = models.CharField(max_length=50, blank=True) # Alohida filial telegram ulangan raqami
    whatsapp_phone = models.CharField(max_length=50, blank=True) # Alohida filial whatsapp raqami
    include_location_in_sms = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.address})"

class PlatformUser(PasswordModel):
    """Platformaga login qiluvchi foydalanuvchi — rol va klinikaga bog'liq.

    Login/parol/rol/klinika BAZADA saqlanadi (frontend demo emas). superadmin
    klinikaga bog'lanmaydi (butun platformani ko'radi), qolganlar bitta klinikaga tegishli.
    """
    username = models.CharField(max_length=100, unique=True)
    password = models.CharField(max_length=128, default='123456')
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True, default='')  # Telegram/SMS kirish uchun
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.ADMIN)
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    avatar = models.CharField(max_length=500, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    ROLE_LABELS = {
        'superadmin': 'SuperAdmin / Platforma',
        'director': 'Direktor / Bosh vrach',
        'deputy_director': 'Direktor o\'rinbosari / Upravlyayushiy',
        'admin': 'Administrator',
        'kassa': 'Kassir',
        'doctor': 'Vrach-Stomatolog',
        'technician': 'Zubnoy Texnik',
    }

    @property
    def initials(self):
        parts = [p for p in self.full_name.split() if p]
        if not parts:
            return self.username[:2].upper()
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[1][0]).upper()

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

class PlatformSetting(models.Model):
    clinic_name = models.CharField(max_length=255, default='Dentos Stomatologiya Klinikasi')
    plan_tier = models.CharField(max_length=50, default='Pro')
    storage_quota_gb = models.DecimalField(max_digits=8, decimal_places=2, default=50.0)
    storage_used_gb = models.DecimalField(max_digits=8, decimal_places=2, default=4.8)
    enabled_modules = models.JSONField(default=dict, blank=True)
    max_doctors = models.PositiveIntegerField(default=15)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.clinic_name} ({self.storage_quota_gb} GB)"

class Workplace(models.Model):
    name = models.CharField(max_length=255) # e.g. "Кабинет 1 - Кресло 1"
    color = models.CharField(max_length=50, default='#3B82F6')
    clinic = models.ForeignKey(ClinicTenant, on_delete=models.CASCADE, null=True, blank=True, related_name='workplaces')
    branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='workplaces')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.color})"

# Platforma standart mutaxassisliklari (10 ta) — GLOBAL, barcha klinikaga ko'rinadi,
# o'chirib bo'lmaydi. clinic=None, is_default=True bo'lib BITTA marta saqlanadi.
# 3 tilda (ru / uz / en). name = kanonik qiymat (ruscha) — xodim.specialty shu matnda
# saqlanadi, shuning uchun mavjud ma'lumot buzilmasin. Ko'rsatishda til bo'yicha tarjima.
DEFAULT_SPECIALTIES = [
    {'ru': 'Терапевт',                 'uz': 'Terapevt',                  'en': 'Therapist'},
    {'ru': 'Ортопед',                  'uz': 'Ortoped',                   'en': 'Orthopedist'},
    {'ru': 'Ортодонт',                 'uz': 'Ortodont',                  'en': 'Orthodontist'},
    {'ru': 'Хирург',                   'uz': 'Xirurg',                    'en': 'Surgeon'},
    {'ru': 'Имплантолог',              'uz': 'Implantolog',               'en': 'Implantologist'},
    {'ru': 'Пародонтолог',             'uz': 'Parodontolog',              'en': 'Periodontist'},
    {'ru': 'Детский стоматолог',       'uz': 'Bolalar stomatologi',       'en': 'Pediatric dentist'},
    {'ru': 'Ассистент врача',          'uz': 'Shifokor assistenti',       'en': "Doctor's assistant"},
    {'ru': 'Гигиенист',                'uz': 'Gigienist',                 'en': 'Hygienist'},
    {'ru': 'Стоматолог общей практики', 'uz': 'Umumiy amaliyot stomatologi', 'en': 'General dentist'},
]


class Specialty(models.Model):
    name = models.CharField(max_length=255)  # kanonik nom (ruscha) — e.g. "Терапевт"
    name_ru = models.CharField(max_length=255, blank=True, default='')
    name_uz = models.CharField(max_length=255, blank=True, default='')
    name_en = models.CharField(max_length=255, blank=True, default='')
    # GLOBAL standart mutaxassislik — barcha klinikaga ko'rinadi, o'chirib bo'lmaydi.
    is_default = models.BooleanField(default=False)
    clinic = models.ForeignKey(ClinicTenant, on_delete=models.CASCADE, null=True, blank=True, related_name='specialties')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


def ensure_default_specialties():
    """Platforma 10 global standart mutaxassisligini (clinic=None, is_default=True)
    mavjud qiladi. Idempotent — bor bo'lsa tarjimasini yangilaydi, yo'g'ini qo'shadi.
    """
    for s in DEFAULT_SPECIALTIES:
        Specialty.objects.update_or_create(
            is_default=True,
            clinic__isnull=True,
            name=s['ru'],
            defaults={
                'name_ru': s['ru'],
                'name_uz': s['uz'],
                'name_en': s['en'],
                'is_active': True,
                'clinic': None,
            },
        )



class TelegramLoginContact(models.Model):
    phone = models.CharField(max_length=20, unique=True)
    telegram_user_id = models.BigIntegerField(unique=True)
    chat_id = models.BigIntegerField()
    verified_at = models.DateTimeField(auto_now=True)


class TelegramLoginChallenge(models.Model):
    import uuid
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=20, db_index=True)
    purpose = models.CharField(max_length=10, default='login')
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed = models.BooleanField(default=False)
    sent = models.BooleanField(default=False)


class TelegramLoginCursor(models.Model):
    offset = models.BigIntegerField(default=0)

# Persistent reception conversations and delivery records.
from .reception_models import ReceptionContact, ReceptionDelivery, ReceptionUpdate, ReceptionMessage


class PatientRecord(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='chart_records')
    section = models.CharField(max_length=40)
    value = models.JSONField(default=list)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['patient', 'section'], name='unique_patient_record_section')]


class ServiceCategory(models.Model):
    """Klinika xizmat guruhi/kategoriyasi — 32desk «Услуга» (chap panel).

    Har bir klinika o'z kategoriyalarini yaratadi/tahrirlaydi. Naryad (ServiceCatalogItem)
    shu guruhga `category_ref` orqali ulanadi. Eski matnli `category` ustuni mosligi
    uchun saqlanadi (serializerda nom bilan sinxronlanadi). Demo (clinic 1) bu modeldan
    foydalanmaydi — frontend demo hardcoded ko'rsatadi.
    """
    clinic = models.ForeignKey(ClinicTenant, on_delete=models.CASCADE, null=True, blank=True, related_name='service_categories')
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    show_in_calendar = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name', 'id']
        constraints = [
            models.UniqueConstraint(fields=['clinic', 'name'], name='uniq_service_category_per_clinic'),
        ]

    def __str__(self):
        return self.name


class ServiceCatalogItem(models.Model):
    """Klinikaning xizmatlar/naryad narx katalogi — BAZADA (brauzer localStorage emas).

    Har bir klinika o'z katalogiga ega; narxlar boshqa qurilma/sessiyada ham bir xil
    ko'rinadi. Demo (clinic 1) bu modeldan foydalanmaydi — frontend demo'da hardcoded
    DEFAULT_NARYAD_CATALOG ko'rsatadi (saqlanmaydi).
    """
    clinic = models.ForeignKey(ClinicTenant, on_delete=models.CASCADE, null=True, blank=True, related_name='service_catalog')
    name = models.CharField(max_length=500)
    # Eski matnli kategoriya — orqaga moslik (kassa/hisobot `category` ni o'qiydi).
    # category_ref bilan sinxron: serializer category_ref.name ni shu yerga yozadi.
    category = models.CharField(max_length=120, blank=True)
    category_ref = models.ForeignKey(ServiceCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    code = models.CharField(max_length=40, blank=True)
    base_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    default_percent = models.PositiveIntegerField(null=True, blank=True)
    description = models.TextField(blank=True)
    # 32desk «Основные» qo'shimcha metama'lumot
    duration_min = models.PositiveIntegerField(null=True, blank=True)
    buffer_min = models.PositiveIntegerField(null=True, blank=True)
    price_fixed = models.BooleanField(default=True)
    duration_fixed = models.BooleanField(default=True)
    show_in_calendar = models.BooleanField(default=False)
    # 32desk qolgan tablar — ma'lumot saqlash (chuqur integratsiyasiz)
    package_items = models.JSONField(default=list, blank=True)   # [{service_id, name, qty, price}]
    diagnoses = models.JSONField(default=list, blank=True)        # [{code, name}]
    manipulations = models.JSONField(default=list, blank=True)    # [{name, note}]
    reminder_enabled = models.BooleanField(default=False)
    reminder_days = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', 'id']
        indexes = [models.Index(fields=['clinic', 'category'])]
        constraints = [
            models.CheckConstraint(check=models.Q(base_price__gte=0), name='service_base_price_non_negative'),
            models.CheckConstraint(
                check=models.Q(default_percent__isnull=True) | models.Q(default_percent__gte=0, default_percent__lte=100),
                name='service_default_percent_0_100'),
        ]

    def __str__(self):
        return f'{self.name} ({self.base_price})'


class DoctorNaryadRate(models.Model):
    """Shifokorga xos naryad narxi/foizi — BAZADA, klinika+shifokor+xizmat bo'yicha.

    Umumiy katalog (ServiceCatalogItem) ustiga bir shifokor uchun maxsus narx yoki
    komissiya foizini belgilaydi. Boshqa qurilma/sessiyada ham bir xil ko'rinadi.
    Demo (clinic 1) bu modeldan foydalanmaydi (frontend hardcoded ko'rsatadi).
    """
    clinic = models.ForeignKey(ClinicTenant, on_delete=models.CASCADE, null=True, blank=True, related_name='doctor_naryad_rates')
    doctor = models.ForeignKey('Employee', on_delete=models.CASCADE, related_name='naryad_rates')
    service = models.ForeignKey(ServiceCatalogItem, on_delete=models.CASCADE, related_name='doctor_rates')
    custom_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    commission_percent = models.PositiveIntegerField(default=0)
    is_custom_price = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(fields=['doctor', 'service'], name='unique_doctor_service_rate'),
            models.CheckConstraint(check=models.Q(custom_price__gte=0), name='rate_custom_price_non_negative'),
            models.CheckConstraint(check=models.Q(commission_percent__gte=0, commission_percent__lte=100), name='rate_commission_0_100'),
        ]

    def __str__(self):
        return f'doctor={self.doctor_id} service={self.service_id} price={self.custom_price}'
