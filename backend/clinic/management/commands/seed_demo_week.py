"""Demo klinika (clinic 1) joriy hafta jadvalini seed qiladi.
Ishga tushirish:  python manage.py seed_demo_week
"""
from django.core.management.base import BaseCommand
from clinic.demo_week import seed_demo_week


class Command(BaseCommand):
    help = 'Demo klinika (clinic 1) uchun joriy hafta zapis+status+narx+moliya jadvalini seed qiladi.'

    def handle(self, *args, **kwargs):
        n = seed_demo_week()
        self.stdout.write(self.style.SUCCESS(f'Demo hafta seed qilindi: {n} ta zapis (+ completed/debt moliya). Bugun markazda.'))
