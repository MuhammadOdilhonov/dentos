import datetime as dt
from unittest.mock import patch, Mock
from django.test import TestCase
from django.utils import timezone
from django.core.management import call_command
from django.core.management.base import CommandError
from clinic.models import ClinicTenant, Patient, Employee, Appointment
from clinic.reception_models import ReceptionContact, ReceptionMessage, ReceptionDelivery
from clinic.reception import respond
from clinic.reception_account import prepare_message, account_for_clinic, run_account_reminders, mark_delivered
from clinic.reception_time import learn_timezone, patient_zone, due_reminder, appointment_time
from clinic.telegram_auth import _clinic_id_for_session, _route_inbound_message


class AccountReceptionTests(TestCase):
    def setUp(self):
        self.clinic = ClinicTenant.objects.create(name='Clinic',has_ai_agent=True,has_auto_reminders=True)
        self.patient = Patient.objects.create(clinic=self.clinic,full_name='Ali Vali',phone='+998901234567')
        self.doctor = Employee.objects.create(clinic=self.clinic,full_name='Doctor',schedule='Пн-Сб 09:00 - 18:00')
        self.contact = ReceptionContact.objects.create(clinic=self.clinic,key='tg:+998000:7',telegram_account='+998000',patient=self.patient)
        self.sessions = {'+998000':{'session':'test-session','clinic_id':self.clinic.pk,'user':{'id':100},'connected':True}}
        self.now = dt.datetime(2026,10,19,18)
        self.apt = Appointment.objects.create(clinic=self.clinic,patient=self.patient,doctor=self.doctor,start_time=dt.datetime(2026,10,20,10),end_time=dt.datetime(2026,10,20,10,30))

    def test_account_route_uses_reception(self):
        with patch('clinic.reception.now_local',return_value=dt.datetime(2026,10,19,8)):
            result = prepare_message(self.clinic.pk,'+998000',7,1,'kelaman',phone=self.patient.phone,access_hash=123)
        self.assertEqual(result.result['action'],'confirmed')
        self.apt.refresh_from_db()
        self.assertEqual(self.apt.status,'confirmed')
        self.assertIn('UTC+05:00',result.result['reply'])
        self.assertEqual(ReceptionContact.objects.get(pk=self.contact.pk).telegram_access_hash,123)

    def test_duplicate_inbound_is_not_applied_twice(self):
        a = prepare_message(self.clinic.pk,'+998000',7,1,'salom')
        b = prepare_message(self.clinic.pk,'+998000',7,1,'different')
        self.assertEqual(a.pk,b.pk)
        mark_delivered(a.pk,30)
        mark_delivered(a.pk,30)
        self.assertEqual(ReceptionMessage.objects.filter(direction='out').count(),1)

    def test_account_bot_or_unbound_never_selected(self):
        for sessions in [{'bot_1':{'session':'x','clinic_id':self.clinic.pk,'user':{'is_bot':True}}}, {'+111':{'session':'x'}}]:
            with patch('clinic.telegram_auth._load_sessions',return_value=sessions):
                self.assertIsNone(_clinic_id_for_session('x'))
                self.assertEqual(account_for_clinic(self.clinic.pk),(None,None))
        with patch('clinic.telegram_auth._load_sessions',return_value=self.sessions):
            self.assertEqual(account_for_clinic(self.clinic.pk)[0],'+998000')
            self.assertIsNone(account_for_clinic(self.clinic.pk, '+wrong')[0])

    def test_disabled_clinic_no_reply(self):
        self.clinic.has_ai_agent=False;self.clinic.save()
        self.assertIsNone(prepare_message(self.clinic.pk,'+998000',7,1,'salom'))
        self.assertEqual(_route_inbound_message(999,self.patient.phone,'salom',contact_key='tg:x'),'')

    def test_patient_bot_worker_disabled(self):
        with self.assertRaises(CommandError): call_command('run_reception_bot',clinic=self.clinic.pk)

    def test_new_hidden_phone_lead_can_continue(self):
        key = 'tg:+998000:8'
        self.assertEqual(respond(self.clinic.pk,key,'zapis')['action'],'contact')
        self.assertEqual(respond(self.clinic.pk,key,'+998909999999')['action'],'name')
        self.assertEqual(respond(self.clinic.pk,key,'New Patient')['action'],'doctor')
        self.assertIsNotNone(ReceptionContact.objects.get(key=key).patient_id)

    def test_typed_number_does_not_claim_existing_patient(self):
        key='tg:+998000:8'
        respond(self.clinic.pk,key,'zapis')
        respond(self.clinic.pk,key,self.patient.phone)
        self.assertIsNone(ReceptionContact.objects.get(key=key).patient_id)

    def test_explicit_location_only(self):
        self.assertFalse(learn_timezone(self.contact,'London manzili qayerda?'))
        self.assertFalse(learn_timezone(self.contact,'Men Londonga boraman'))
        self.assertTrue(learn_timezone(self.contact,'Men hozir Londondaman'))
        self.assertEqual(patient_zone(self.contact).key,'Europe/London')
        self.assertIn('London',appointment_time(self.apt.start_time,self.contact))

    def test_dst_and_location_expiry(self):
        learn_timezone(self.contact,"I'm in London")
        self.assertIn('06:00',appointment_time(dt.datetime(2026,10,20,10),self.contact))
        self.assertIn('05:00',appointment_time(dt.datetime(2026,11,20,10),self.contact))
        self.contact.timezone_updated_at=timezone.now()-dt.timedelta(days=31)
        self.assertEqual(patient_zone(self.contact).key,'Asia/Tashkent')

    def test_local_hour_not_tashkent_hour(self):
        learn_timezone(self.contact,"I'm in London")
        cfg={'schedule_hour':18,'day_before':True,'this_week':False}
        self.assertIsNone(due_reminder(self.apt,self.contact,dt.datetime(2026,10,19,18),cfg))
        self.assertEqual(due_reminder(self.apt,self.contact,dt.datetime(2026,10,19,22),cfg),'day')
        self.assertIsNone(due_reminder(self.apt,self.contact,dt.datetime(2026,10,20,1),cfg))

    def test_unknown_timezone_no_phone_inference(self):
        self.patient.phone='+447700900000'; self.patient.save()
        self.assertEqual(patient_zone(self.contact).key,'Asia/Tashkent')

    def test_natural_greeting_and_truthful_identity(self):
        self.assertNotIn('avtomatik administrator',respond(self.clinic.pk,self.contact.key,'salom')['reply'])
        self.assertIn('virtual',respond(self.clinic.pk,self.contact.key,'botmisan')['reply'])

    @patch('clinic.reminders._config',return_value={'enabled':True,'send_telegram':True,'day_before':True,'this_week':False,'schedule_hour':18})
    def test_reminders_use_correct_account_and_deduplicate(self,cfg):
        def complete(coro):
            coro.close()
            return 100
        with patch('clinic.telegram_auth._load_sessions',return_value=self.sessions), patch('clinic.reception_account.now_local',return_value=self.now), patch('clinic.telegram_auth._manager.run',side_effect=complete) as send:
            self.assertEqual(run_account_reminders(self.clinic.pk)['sent'],1)
            self.assertEqual(run_account_reminders(self.clinic.pk)['sent'],0)
            self.assertEqual(send.call_count,1)
            self.assertEqual(ReceptionMessage.objects.filter(direction='out').count(),1)
            self.contact.opted_out=True;self.contact.save()
            ReceptionDelivery.objects.all().delete()
            self.assertEqual(run_account_reminders(self.clinic.pk)['sent'],0)

    @patch('clinic.reminders._config',return_value={'enabled':True,'send_telegram':True,'day_before':True,'this_week':False,'schedule_hour':18})
    def test_failed_delivery_is_retryable(self,cfg):
        def fail(coro):
            coro.close()
            raise RuntimeError('offline')
        with patch('clinic.telegram_auth._load_sessions',return_value=self.sessions), patch('clinic.reception_account.now_local',return_value=self.now), patch('clinic.telegram_auth._manager.run',side_effect=fail):
            self.assertEqual(run_account_reminders(self.clinic.pk)['failed'],1)
            item=ReceptionDelivery.objects.get()
            self.assertIsNone(item.sent_at)
            self.assertIsNone(item.claimed_at)

    @patch('clinic.reception.now_local',return_value=dt.datetime(2026,10,19,8))
    def test_full_request_retained_through_new_lead_onboarding(self,_):
        key = 'tg:+998000:9'
        self.assertEqual(respond(self.clinic.pk,key,'ertaga soat 16 ga yozib qoying')['action'],'contact')
        respond(self.clinic.pk,key,'+998909876543')
        respond(self.clinic.pk,key,'New Person')
        result = respond(self.clinic.pk,key,'1')
        self.assertEqual(result['action'],'review')
        self.assertIn('16:00',result['reply'])
        self.assertFalse(Appointment.objects.filter(patient__full_name='New Person').exists())
        self.assertEqual(respond(self.clinic.pk,key,'ha albatta boraman')['action'],'saved')

    @patch('clinic.reception.now_local',return_value=dt.datetime(2026,10,19,8))
    def test_reschedule_with_day_and_time_reaches_review(self,_):
        result=respond(self.clinic.pk,self.contact.key,"ertaga soat 16 ga ko'chiring")
        self.assertEqual(result['action'],'review')
        self.apt.refresh_from_db()
        self.assertEqual(self.apt.start_time.hour,10)

    def test_future_and_negative_location_not_learned(self):
        self.assertFalse(learn_timezone(self.contact,'Men Londonga bormoqchiman'))
        self.assertFalse(learn_timezone(self.contact,'Men hozir Londonda emasman'))

    def test_symptom_lead_is_offered_consultation_without_staff_handoff(self):
        result=respond(self.clinic.pk,'tg:+998000:77',"tishim og'riyapti")
        self.assertEqual(result['action'],'contact')
        self.assertFalse(ReceptionContact.objects.get(key='tg:+998000:77').human_requested)

    def test_legacy_patient_bot_transport_cannot_send(self):
        from clinic.reception_bot import Bot, BotError
        with self.assertRaises(BotError):
            Bot('not-a-token').call('sendMessage',chat_id=1,text='no delivery')
