"""Production uchun XAVFSIZ boshlang'ich superadmin yaratish.

seed_platform'dan FARQI: bu yerda kodga yozilgan parol YO'Q, namuna klinikalar
YARATILMAYDI va mavjud akkaunt avtomatik ALMASHTIRILMAYDI.

Ishga tushirish (parol env orqali — logga/chatga chiqmaydi):
    DJANGO_ADMIN_USERNAME=admin@dentos.cc \
    DJANGO_ADMIN_PASSWORD='...' \
    DJANGO_ADMIN_NAME='Platform Admin' \
    python manage.py create_admin

yoki argument bilan (parolni argumentda bermang — shell history'da qoladi):
    python manage.py create_admin --username admin@dentos.cc --name 'Platform Admin'
    (parol baribir DJANGO_ADMIN_PASSWORD env'dan olinadi)

Mavjud bir xil username bo'lsa — ALMASHTIRMAYMIZ (xatwith chiqamiz), faqat
--reset-password bilan (va parol env bilan) parolni yangilash mumkin.
"""
import os
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from clinic.models import PlatformUser


class Command(BaseCommand):
    help = 'Create a production superadmin safely (no hardcoded credentials, no demo data).'

    def add_arguments(self, parser):
        parser.add_argument('--username', default=os.environ.get('DJANGO_ADMIN_USERNAME'))
        parser.add_argument('--name', default=os.environ.get('DJANGO_ADMIN_NAME', 'Platform Admin'))
        parser.add_argument('--reset-password', action='store_true',
                            help='Mavjud akkaunt parolini yangilash (aks holda mavjud akkaunt o‘zgarmaydi).')

    def handle(self, *args, **opts):
        username = (opts.get('username') or '').strip()
        password = os.environ.get('DJANGO_ADMIN_PASSWORD', '')
        name = (opts.get('name') or 'Platform Admin').strip()

        if not username:
            raise CommandError('username kerak: --username yoki DJANGO_ADMIN_USERNAME env.')
        if not password:
            raise CommandError('Parolni faqat DJANGO_ADMIN_PASSWORD env orqali bering (argumentda EMAS).')

        # Parol kuchini tekshiramiz (parolni hech qachon chop etmaymiz).
        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError('Parol yetarlicha kuchli emas: ' + '; '.join(exc.messages))

        existing = PlatformUser.objects.filter(username__iexact=username).first()
        if existing:
            if not opts.get('reset_password'):
                raise CommandError(
                    f'"{username}" allaqachon mavjud. Avtomatik almashtirilmaydi. '
                    f'Parolni yangilash kerak bo‘lsa --reset-password bilan qayta ishga tushiring.')
            existing.password = make_password(password)
            existing.is_active = True
            existing.save(update_fields=['password', 'is_active'])
            self.stdout.write(self.style.SUCCESS(f'Parol yangilandi: {username} (superadmin).'))
            return

        PlatformUser.objects.create(
            username=username, password=make_password(password),
            full_name=name, role='superadmin', clinic=None, is_active=True)
        self.stdout.write(self.style.SUCCESS(
            f'Superadmin yaratildi: {username}. Parol env orqali berildi (bu yerda ko‘rsatilmaydi).'))
