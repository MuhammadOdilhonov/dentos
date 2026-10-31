import time
from django.core.management.base import BaseCommand, CommandError
from clinic.models import TelegramLoginCursor
from clinic.telegram_login import bot_call, handle_update

class Command(BaseCommand):
    help = 'Run the dedicated Telegram login bot (one process only).'
    requires_system_checks = []

    def handle(self, *args, **options):
        info = bot_call('getWebhookInfo')
        if info.get('url'):
            raise CommandError('Bot webhook orqali ishlayapti. Mavjud webhookni tekshirmasdan polling yoqilmaydi.')
        bot = bot_call('getMe')
        self.stdout.write('Login bot started: @' + bot['username'])
        cursor, _ = TelegramLoginCursor.objects.get_or_create(pk=1)
        while True:
            try:
                updates = bot_call('getUpdates', offset=cursor.offset, timeout=25, allowed_updates=['message'])
                for update in updates:
                    handle_update(update)
                    cursor.offset = update['update_id'] + 1
                    cursor.save(update_fields=['offset'])
            except KeyboardInterrupt:
                return
            except Exception:
                self.stderr.write('Telegram login bot vaqtincha ulanmayapti; qayta urinish...')
                time.sleep(5)
