"""Dedicated patient bot transport. Keep separate from the CRM login bot."""
import datetime as dt
import requests
from django.db import transaction
from django.utils import timezone
from .models import ClinicTenant, Appointment
from .reception_models import ReceptionContact, ReceptionDelivery, ReceptionUpdate
from .reception import respond, say, describe, now_local, ACTIVE


class BotError(Exception):
    def __init__(self, code=0, retry_after=5):
        self.code, self.retry_after = code, retry_after
        super().__init__(f'Telegram request failed ({code})')


class Bot:
    def __init__(self, token):
        self.token = token

    def call(self, method, **payload):
        # Legacy fixtures only. Production patients use reception_account/Telethon.
        # The dedicated login bot in telegram_login.py is unaffected.
        raise BotError(403)

    def send(self, chat_id, result):
        if not result.get('reply'): return
        markup = {'remove_keyboard':True}
        if result.get('request_contact'):
            label = {'uz':'Telefonimni ulash','ru':'Поделиться контактом','en':'Share my contact'}[result['language']]
            markup = {'keyboard':[[{'text':label,'request_contact':True}]],'resize_keyboard':True,'one_time_keyboard':True}
        self.call('sendMessage',chat_id=chat_id,text=result['reply'][:4096],reply_markup=markup)


@transaction.atomic
def prepare_update(clinic_id, update):
    ClinicTenant.objects.select_for_update().get(pk=clinic_id)
    record = ReceptionUpdate.objects.filter(clinic_id=clinic_id,update_id=update['update_id']).first()
    if record: return record
    message = update.get('message',{})
    sender, chat = message.get('from',{}), message.get('chat',{})
    result = {}
    if chat.get('type') == 'private' and sender.get('id') == chat.get('id') and not sender.get('is_bot'):
        shared = message.get('contact',{})
        verified = shared.get('phone_number','') if shared.get('user_id') == sender['id'] else ''
        text = message.get('text') or ('contact' if verified else 'unsupported')
        result = respond(clinic_id, f"bot:{chat['id']}",text,verified_phone=verified,display_name=sender.get('first_name',''))
        result['chat_id'] = chat['id']
    return ReceptionUpdate.objects.create(clinic_id=clinic_id,update_id=update['update_id'],reply=result)


def handle_update(clinic_id, update, bot):
    record = prepare_update(clinic_id,update)
    if record.delivered: return
    try:
        if record.reply.get('chat_id'):
            bot.send(record.reply['chat_id'],record.reply)
    except BotError as error:
        if error.code != 403: raise
        ReceptionContact.objects.filter(clinic_id=clinic_id,key=f"bot:{record.reply['chat_id']}").update(opted_out=True)
    record.delivered = True
    record.save(update_fields=['delivered'])


def send_reminders(clinic_id, bot, now=None):
    """One worker per clinic. Successful deliveries only; failed sends retry next tick."""
    clinic = ClinicTenant.objects.get(pk=clinic_id)
    if not clinic.has_auto_reminders: return 0
    now = now or now_local()
    hour = int((clinic.ai_agent_settings or {}).get('reception_reminder_hour',18))
    if now.hour < hour: return 0
    today = now.date()
    count = 0
    contacts = ReceptionContact.objects.filter(clinic=clinic,key__startswith='bot:',opted_out=False,patient__isnull=False)
    for contact in contacts:
        appointments = Appointment.objects.filter(clinic=clinic,patient=contact.patient,status__in=ACTIVE,start_time__gt=now).select_related('doctor','branch','clinic')
        for apt in appointments:
            delta = (apt.start_time.date() - today).days
            # Monday gets the day-before message only, not two messages on Sunday.
            kind = 'day' if delta == 1 else 'week' if today.weekday() == 6 and 2 <= delta <= 7 else None
            if not kind: continue
            delivery,_ = ReceptionDelivery.objects.get_or_create(contact=contact,appointment=apt,scheduled_for=apt.start_time,kind=kind)
            if delivery.sent_at: continue
            text = say(contact.language,kind) + '\n\n' + describe(apt) + '\n\n' + say(contact.language,'existing')
            try:
                bot.send(int(contact.key.split(':')[1]),{'reply':text,'language':contact.language})
            except BotError as error:
                if error.code == 403:
                    contact.opted_out = True
                    contact.save(update_fields=['opted_out'])
                if error.code == 429: raise
                continue
            delivery.sent_at = timezone.now()
            delivery.save(update_fields=['sent_at'])
            count += 1
    return count
