"""Patient reception through the clinic's personal Telegram account (Telethon)."""
import datetime as dt
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from telethon.tl.types import InputPeerUser
from .models import ClinicTenant, Patient, Appointment
from .reception_models import ReceptionContact, ReceptionMessage, ReceptionDelivery
from .reception import respond, now_local, ACTIVE, say, describe
from .reception_time import due_reminder


def account_for_clinic(clinic_id, preferred=''):
    from .telegram_auth import _load_sessions, _clinic_id_for_session
    candidates = {}
    for account, data in _load_sessions().items():
        if data.get('user',{}).get('is_bot') or account.startswith('bot_') or not data.get('connected',True): continue
        if _clinic_id_for_session(data.get('session')) == clinic_id:
            candidates[account] = data
    if preferred:
        return (preferred,candidates[preferred]) if preferred in candidates else (None,None)
    return next(iter(candidates.items())) if len(candidates) == 1 else (None,None)


@transaction.atomic
def prepare_message(clinic_id, account, sender_id, message_id, text, phone='', name='', access_hash=None):
    clinic = ClinicTenant.objects.select_for_update().filter(pk=clinic_id,status='active').first()
    if not clinic or not clinic.has_ai_agent: return None
    key = f'tg:{account}:{sender_id}'
    contact,_ = ReceptionContact.objects.select_for_update().get_or_create(clinic=clinic,key=key)
    previous = ReceptionMessage.objects.filter(contact=contact,direction='in',remote_id=message_id).first()
    if previous: return previous
    contact.telegram_account = account
    if access_hash is not None: contact.telegram_access_hash = access_hash
    contact.save(update_fields=['telegram_account', 'telegram_access_hash'])
    result = respond(clinic_id,key,text,verified_phone=phone,display_name=name)
    return ReceptionMessage.objects.create(contact=contact,remote_id=message_id,text=text[:4000],result=result)


def mark_delivered(record_id, outgoing_id=None):
    record = ReceptionMessage.objects.get(pk=record_id)
    if outgoing_id is not None and record.result.get('reply'):
        ReceptionMessage.objects.get_or_create(contact=record.contact,direction='out',remote_id=outgoing_id,defaults={'text':record.result['reply'],'delivered':True})
    record.delivered = True
    record.save(update_fields=['delivered'])


async def send_contact(session, contact, text):
    from .telegram_auth import _manager
    client = await _manager._get_client(session)
    peer_id = int(contact.key.rsplit(':',1)[1])
    peer = InputPeerUser(peer_id, contact.telegram_access_hash) if contact.telegram_access_hash is not None else peer_id
    message = await client.send_message(peer,text)
    return message.id


async def resolve_patient(session, phone, name):
    from .telegram_auth import _manager, _resolve_entity
    client = await _manager._get_client(session)
    return await _resolve_entity(client,phone,name)


def run_account_reminders(clinic_id=None):
    from .telegram_auth import _manager
    from .reminders import _config
    now = now_local()
    clinics = ClinicTenant.objects.filter(status='active',has_auto_reminders=True)
    if clinic_id is not None: clinics = clinics.filter(pk=clinic_id)
    count, failures = 0, 0
    for clinic in clinics:
        cfg = _config(clinic.pk)
        if not cfg.get('enabled') or not cfg.get('send_telegram'): continue
        appointments = Appointment.objects.filter(clinic=clinic,status__in=ACTIVE,start_time__gt=now).select_related('patient','doctor','branch','clinic')
        for apt in appointments:
            contacts = list(ReceptionContact.objects.filter(clinic=clinic,patient=apt.patient,key__startswith='tg:'))
            # Never bypass a stored opt-out by creating a second contact.
            if contacts and not any(not c.opted_out for c in contacts): continue
            contact = next((c for c in contacts if not c.opted_out and c.telegram_account),None)
            preferred = contact.telegram_account if contact else (apt.branch.telegram_phone if apt.branch and not apt.branch.use_global_telegram else '')
            account, data = account_for_clinic(clinic.pk,preferred)
            if not data: continue
            kind = due_reminder(apt,contact,now,cfg)
            if not kind: continue
            delivery = None
            try:
                if contact is None:
                    if not apt.patient.phone: continue
                    entity = _manager.run(resolve_patient(data['session'],apt.patient.phone,apt.patient.full_name))
                    if not entity or getattr(entity,'bot',False): continue
                    contact,_ = ReceptionContact.objects.get_or_create(clinic=clinic,key=f'tg:{account}:{entity.id}',defaults={'patient':apt.patient,'telegram_account':account,'telegram_access_hash':getattr(entity,'access_hash',None),'language':apt.patient.service_lang if apt.patient.service_lang in ['uz','ru','en'] else 'uz'})
                    if contact.patient_id != apt.patient_id or contact.opted_out: continue
                delivery,_ = ReceptionDelivery.objects.get_or_create(contact=contact,appointment=apt,scheduled_for=apt.start_time,kind=kind)
                if delivery.sent_at: continue
                claimed = ReceptionDelivery.objects.filter(pk=delivery.pk, sent_at__isnull=True).filter(Q(claimed_at__isnull=True) | Q(claimed_at__lt=timezone.now()-dt.timedelta(minutes=3))).update(claimed_at=timezone.now())
                if not claimed: continue
                if kind == 'hour':
                    lead = {'uz':'Qabulingizga oz vaqt qoldi. Yo‘ldamisiz?', 'ru':'Скоро ваш приём. Вы уже в пути?', 'en':'Your appointment is coming up soon. Are you on your way?'}[contact.language]
                else:
                    lead = {'uz':'Assalomu alaykum! Klinikamizdagi qabulingizni eslatib qo‘ymoqchimiz. Kela olasizmi?', 'ru':'Здравствуйте! Хотим напомнить о вашем приёме. Сможете прийти?', 'en':'Hello! A reminder about your appointment. Will you be able to attend?'}[contact.language]
                text = lead + '\n\n' + describe(apt,contact) + '\n\n' + {'uz':'Vaqt mos kelmasa, shu yerga yozing — boshqa vaqtni kelishamiz.', 'ru':'Если время неудобно, напишите здесь — подберём другое.', 'en':'If the time no longer works, write here and we can arrange another.'}[contact.language]
                outgoing_id = _manager.run(send_contact(data['session'],contact,text))
                ReceptionMessage.objects.get_or_create(contact=contact,direction='out',remote_id=outgoing_id,defaults={'text':text,'delivered':True})
                delivery.sent_at = timezone.now()
                delivery.save(update_fields=['sent_at'])
                count += 1
            except Exception:
                # Retry next tick; never log credentials, phone numbers or message content.
                if delivery is not None:
                    ReceptionDelivery.objects.filter(pk=delivery.pk, sent_at__isnull=True).update(claimed_at=None)
                failures += 1
    return {'ok':True,'sent':count,'failed':failures}
