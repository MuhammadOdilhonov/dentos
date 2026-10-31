"""Offline interactive demonstration using an in-memory database only."""
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from clinic.models import ClinicTenant, Employee
from clinic.reception import respond


class Command(BaseCommand):
    help = 'Offline reception demo: use --settings=core.test_settings. No Telegram messages.'
    requires_system_checks = []

    def handle(self,*args,**options):
        if settings.DATABASES['default']['NAME'] != ':memory:':
            raise CommandError('Use --settings=core.test_settings (demo must use in-memory database).')
        call_command('migrate',verbosity=0,interactive=False)
        clinic = ClinicTenant.objects.create(name='Demo klinika')
        Employee.objects.create(clinic=clinic,full_name='Demo Shifokor',specialty='Konsultatsiya',schedule='Пн-Сб 09:00 - 18:00')
        self.stdout.write('Offline demo. /contact = demo contact; /exit = exit. No real data or messages.')
        self.stdout.write(respond(clinic.pk,'tg:demo:1','/start')['reply'])
        while True:
            try: text = input('Siz: ').strip()
            except (EOFError,KeyboardInterrupt): return
            if text == '/exit': return
            result = respond(clinic.pk,'tg:demo:1', 'contact' if text == '/contact' else text, verified_phone='+998900000000' if text == '/contact' else '')
            self.stdout.write('Bot: ' + result['reply'])
