"""Platforma seed: klinikalar, zubnoy texniklar, platforma sozlamasi va login foydalanuvchilari.

Ishga tushirish:  python manage.py seed_platform
Barcha parollar: 123456
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.hashers import make_password
from clinic.models import ClinicTenant, DentalTechnician, PlatformSetting, PlatformUser

# SuperAdmin — platforma egasi. Login Gmail, parol hash'lanadi (plain saqlanmaydi).
SUPERADMIN_USERNAME = 'ikromifortik@gmail.com'
SUPERADMIN_PASSWORD = 'muhammad0303'


CLINICS = [
    {
        'name': 'Toshkent Markaziy', 'logo': 'TM', 'branch': 'Toshkent sh., Amir Temur 104',
        'director_name': 'Jasur Usmonov', 'phone': '+998 90 100 32 32', 'plan_tier': 'Enterprise',
        'max_doctors': 25, 'storage_quota_gb': 1, 'storage_used_gb': 0, 'status': 'active',
        'enabled_modules': {'sms': True, 'telegram': True, 'whatsapp': True, 'lab': True, 'charts_3d': True, 'chairs': True, 'commissions': True},
    },
    {
        'name': 'Dental Academy Chilonzor', 'logo': 'DA', 'branch': 'Toshkent sh., Chilonzor 9-mavze',
        'director_name': 'Malika Rahimova', 'phone': '+998 90 744 18 05', 'plan_tier': 'Professional',
        'max_doctors': 15, 'storage_quota_gb': 60, 'storage_used_gb': 22.4, 'status': 'active',
        'enabled_modules': {'sms': True, 'telegram': True, 'whatsapp': False, 'lab': True, 'charts_3d': True, 'chairs': True, 'commissions': False},
    },
    {
        'name': 'Smile City Samarqand', 'logo': 'SC', 'branch': 'Samarqand sh., Registon ko‘chasi 12',
        'director_name': 'Bekzod Toshpo‘latov', 'phone': '+998 91 530 77 40', 'plan_tier': 'Standard',
        'max_doctors': 10, 'storage_quota_gb': 40, 'storage_used_gb': 11.9, 'status': 'active',
        'enabled_modules': {'sms': True, 'telegram': False, 'whatsapp': False, 'lab': True, 'charts_3d': False, 'chairs': True, 'commissions': False},
    },
    {
        'name': 'White Dent Yunusobod', 'logo': 'WD', 'branch': 'Toshkent sh., Yunusobod 4-mavze 18',
        'director_name': 'Dilnoza Karimova', 'phone': '+998 93 210 64 21', 'plan_tier': 'Professional',
        'max_doctors': 12, 'storage_quota_gb': 50, 'storage_used_gb': 7.3, 'status': 'paused',
        'enabled_modules': {'sms': True, 'telegram': True, 'whatsapp': False, 'lab': False, 'charts_3d': True, 'chairs': False, 'commissions': True},
    },
]

TECHNICIANS = [
    {
        'name': 'Алишер Каримов', 'lab_name': 'Apex Dental Lab', 'phone': '+998 90 123 45 67',
        'username': 'texnik_alisher', 'password': '123456',
        'linked_clinics': ['Toshkent Markaziy', 'Dental Academy Chilonzor'],
        'price_list': [
            {'id': 'tp1-1', 'name': 'Циркониевая коронка Prettau Multi-layer', 'category': 'Цирконий', 'price': 950000, 'lead_days': 3, 'material': 'Zirconia Katana HT'},
            {'id': 'tp1-2', 'name': 'Керамический винир E.max Press', 'category': 'Эстетика', 'price': 1200000, 'lead_days': 4, 'material': 'IPS e.max Press LT'},
            {'id': 'tp1-3', 'name': 'Металлокерамическая коронка Ivoclar', 'category': 'Металлокерамика', 'price': 450000, 'lead_days': 2, 'material': 'Ivoclar IPS Classic'},
            {'id': 'tp1-4', 'name': 'Индивидуальный титановый абатмент CAD/CAM', 'category': 'Имплантология', 'price': 650000, 'lead_days': 2, 'material': 'Titanium Grade 5'},
        ],
    },
    {
        'name': 'Фарход Юсупов', 'lab_name': 'MasterDent CAD/CAM Lab', 'phone': '+998 90 987 12 34',
        'username': 'texnik_farhod', 'password': '123456',
        'linked_clinics': ['Smile City Samarqand'],
        'price_list': [
            {'id': 'tp2-1', 'name': 'Временная коронка PMMA (фрезерованная)', 'category': 'Временные', 'price': 180000, 'lead_days': 1, 'material': 'PMMA Multi'},
            {'id': 'tp2-2', 'name': 'Бюгельный протез на замках Bredent', 'category': 'Съемные протезы', 'price': 3200000, 'lead_days': 6, 'material': 'Bredent VKS'},
            {'id': 'tp2-3', 'name': 'Циркониевый мостовидный протез (за единицу)', 'category': 'Цирконий', 'price': 900000, 'lead_days': 4, 'material': 'Zirconia Prettau'},
        ],
    },
    {
        'name': 'Дилшод Хакимов', 'lab_name': 'SmileAlign Orto Lab', 'phone': '+998 93 405 90 12',
        'username': 'texnik_dilshod', 'password': '123456',
        'linked_clinics': ['Dental Academy Chilonzor', 'White Dent Yunusobod'],
        'price_list': [
            {'id': 'tp3-1', 'name': 'Набор элайнеров (полный кейс, 24 каппы)', 'category': 'Ортодонтия', 'price': 4500000, 'lead_days': 10, 'material': 'Zendura FLX'},
            {'id': 'tp3-2', 'name': 'Ретенционная прозрачная каппа (1 челюсть)', 'category': 'Ортодонтия', 'price': 300000, 'lead_days': 2, 'material': 'Erkodent'},
            {'id': 'tp3-3', 'name': 'Ночная разгрузочная каппа (бруксизм)', 'category': 'Ортодонтия', 'price': 420000, 'lead_days': 3, 'material': 'Bio-Splint'},
        ],
    },
]


class Command(BaseCommand):
    help = 'Klinikalar, texniklar, platforma sozlamasi va login foydalanuvchilarini seed qiladi'

    def handle(self, *args, **kwargs):
        # 1. Klinikalar
        clinics_by_name = {}
        for c in CLINICS:
            obj, _ = ClinicTenant.objects.update_or_create(name=c['name'], defaults=c)
            clinics_by_name[c['name']] = obj
        self.stdout.write(self.style.SUCCESS(f"{len(CLINICS)} klinika"))

        # 2. Texniklar + ikki tomonlama bog'lash
        techs = []
        for t in TECHNICIANS:
            obj, _ = DentalTechnician.objects.update_or_create(username=t['username'], defaults=t)
            techs.append(obj)
        for clinic in clinics_by_name.values():
            linked_ids = [tech.id for tech in techs if clinic.name in (tech.linked_clinics or [])]
            clinic.linked_technicians = linked_ids
            clinic.save(update_fields=['linked_technicians'])
        self.stdout.write(self.style.SUCCESS(f"{len(TECHNICIANS)} zubnoy texnik"))

        # 3. Platforma sozlamasi
        PlatformSetting.objects.update_or_create(id=1, defaults={
            'clinic_name': 'dentOS Platforma',
            'plan_tier': 'Enterprise',
            'storage_quota_gb': 500,
            'storage_used_gb': 83.2,
            'max_doctors': 62,
            'enabled_modules': {
                'sms_reminders': True, 'telegram_bot': True, 'dental_lab': True,
                'three_d_chart': True, 'chair_management': True, 'doctor_commission': True,
            },
        })
        self.stdout.write(self.style.SUCCESS("Platforma sozlamasi"))

        # 4. SuperAdmin — alohida (Gmail login, hash'langan parol).
        #    Eski demo 'superadmin'/123456 akkaunti bo'lsa — XAVFSIZLIK uchun o'chiriladi.
        PlatformUser.objects.filter(username='superadmin').delete()
        PlatformUser.objects.update_or_create(
            username=SUPERADMIN_USERNAME,
            defaults={
                'full_name': 'dentOS SuperAdmin',
                'role': 'superadmin',
                'clinic': None,
                'password': make_password(SUPERADMIN_PASSWORD),
                'is_active': True,
            },
        )
        self.stdout.write(self.style.SUCCESS(f"SuperAdmin: {SUPERADMIN_USERNAME} (parol hash'langan)"))

        # 5. Qolgan demo login foydalanuvchilari (rol + klinika, parol 123456)
        c1 = clinics_by_name['Toshkent Markaziy']
        users = [
            {'username': 'director', 'full_name': 'Jasur Usmonov', 'role': 'director', 'clinic': c1},
            {'username': 'deputy_director', 'full_name': 'Muzaffar Olimov', 'role': 'deputy_director', 'clinic': c1},
            {'username': 'admin', 'full_name': 'Aziza Karimova', 'role': 'admin', 'clinic': c1},
            {'username': 'kassa', 'full_name': 'Dilorom Saidova', 'role': 'kassa', 'clinic': c1},
            {'username': 'doctor', 'full_name': 'Sardor Alimov', 'role': 'doctor', 'clinic': c1},
        ]
        for u in users:
            PlatformUser.objects.update_or_create(
                username=u['username'],
                defaults={'full_name': u['full_name'], 'role': u['role'], 'clinic': u['clinic'], 'password': '123456', 'is_active': True},
            )
        self.stdout.write(self.style.SUCCESS(f"{len(users)} demo foydalanuvchi (director/admin/kassa/doctor = 123456) + texnik_alisher"))
        self.stdout.write(self.style.SUCCESS("SEED TUGADI."))
