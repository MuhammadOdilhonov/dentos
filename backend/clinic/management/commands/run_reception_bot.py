from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Disabled: patients use the clinic Telegram account; bots are for login only.'
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('--clinic', type=int)
        parser.add_argument('--check', action='store_true')

    def handle(self, *args, **options):
        raise CommandError('Bemor botidan foydalanilmaydi. CRM sozlamalarida klinika Telegram akkauntini raqam yoki QR orqali ulang. Bot faqat login uchun.')
