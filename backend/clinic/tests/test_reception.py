import datetime as dt
from unittest.mock import patch, Mock
from django.test import TestCase
from clinic.models import ClinicTenant, Employee, Patient, Appointment, Branch, ClinicTask
from clinic.reception_models import ReceptionContact, ReceptionDelivery
from clinic.reception import respond, slots, parse_day, intent, language
from clinic.reception_bot import handle_update, send_reminders, BotError

NOW = dt.datetime(2026,10,19,8,0)


@patch('clinic.reception.now_local',return_value=NOW)
class ReceptionTests(TestCase):
    def setUp(self):
        self.clinic = ClinicTenant.objects.create(name='Test',has_ai_agent=True,has_auto_reminders=True)
        self.branch = Branch.objects.create(clinic=self.clinic,name='Main',address='Test address')
        self.doctor = Employee.objects.create(clinic=self.clinic,branch=self.branch,full_name='Doctor One',schedule='Пн-Сб 09:00 - 18:00')
        self.patient = Patient.objects.create(clinic=self.clinic,full_name='Ali Vali',phone='+998901234567')
        self.contact = ReceptionContact.objects.create(clinic=self.clinic,key='bot:7',patient=self.patient)

    def chat(self,text): return respond(self.clinic.pk,'bot:7',text)

    def appointment(self,day=20,hour=10,status='unconfirmed'):
        return Appointment.objects.create(clinic=self.clinic,patient=self.patient,doctor=self.doctor,branch=self.branch,start_time=dt.datetime(2026,10,day,hour),end_time=dt.datetime(2026,10,day,hour,30),status=status)

    def draft(self):
        self.assertEqual(self.chat('zapis')['action'],'doctor')
        self.assertEqual(self.chat('1')['action'],'date')
        self.assertEqual(self.chat('ertaga')['action'],'slots')
        self.assertEqual(self.chat('10:00')['action'],'review')

    def test_booking_requires_confirmation(self,_):
        self.draft()
        self.assertFalse(Appointment.objects.exists())
        self.assertEqual(self.chat('ha')['action'],'saved')
        self.assertEqual(Appointment.objects.count(),1)
        self.chat('ha')
        self.assertEqual(Appointment.objects.count(),1)

    def test_new_lead_verified_contact_name(self,_):
        self.assertEqual(respond(self.clinic.pk,'bot:8','zapis')['action'],'contact')
        self.assertEqual(respond(self.clinic.pk,'bot:8','contact',verified_phone='+998909999999')['action'],'name')
        result = respond(self.clinic.pk,'bot:8','New Patient')
        self.assertEqual(result['action'],'doctor')
        self.assertEqual(ReceptionContact.objects.get(key='bot:8').patient.full_name,'New Patient')

    def test_unverified_contact_and_name_cannot_link(self,_):
        respond(self.clinic.pk,'bot:9','zapis',display_name='Ali Vali')
        respond(self.clinic.pk,'bot:9','+998901234567')
        self.assertIsNone(ReceptionContact.objects.get(key='bot:9').patient_id)

    def test_reschedule_is_same_appointment(self,_):
        apt = self.appointment()
        self.assertEqual(self.chat("ko'chirish")['action'],'date')
        self.chat('21.10.2026')
        self.chat('11:00')
        apt.refresh_from_db()
        self.assertEqual(apt.start_time.day,20)
        self.chat('ha')
        apt.refresh_from_db()
        self.assertEqual(apt.start_time,dt.datetime(2026,10,21,11))
        self.assertEqual(Appointment.objects.count(),1)

    def test_cancel_requires_confirmation(self,_):
        apt = self.appointment()
        self.chat('bekor qilish')
        self.chat("yo'q")
        apt.refresh_from_db()
        self.assertEqual(apt.status,'unconfirmed')
        self.chat('bekor qilish')
        self.chat('ha')
        apt.refresh_from_db()
        self.assertEqual(apt.status,'cancelled')

    def test_cannot_come_not_confirmation(self,_):
        apt = self.appointment()
        self.chat('ha lekin kelolmayman')
        apt.refresh_from_db()
        self.assertEqual(apt.status,'unconfirmed')

    def test_chooses_between_multiple_appointments(self,_):
        first, second = self.appointment(), self.appointment(day=21)
        self.assertEqual(self.chat('kelaman')['action'],'choose_apt')
        self.chat('2')
        first.refresh_from_db(); second.refresh_from_db()
        self.assertEqual(first.status,'unconfirmed')
        self.assertEqual(second.status,'confirmed')

    def test_rechecks_slot_on_confirmation(self,_):
        self.draft()
        other = Patient.objects.create(clinic=self.clinic,full_name='Other',phone='123')
        Appointment.objects.create(clinic=self.clinic,patient=other,doctor=self.doctor,start_time=dt.datetime(2026,10,20,10),end_time=dt.datetime(2026,10,20,10,30),status='reserved')
        self.assertEqual(self.chat('ha')['action'],'unavailable')
        self.assertEqual(Appointment.objects.count(),1)

    def test_breaks_days_and_chair_conflicts(self,_):
        self.doctor.schedule_details = [{'day':'tuesday','enabled':True,'branch':self.branch.pk,'intervals':[{'start_hour':'09','start_min':'00','end_hour':'10','end_min':'00','chair':'A'}]}]
        self.doctor.save()
        self.assertEqual(len(slots(self.doctor,dt.date(2026,10,20))),2)
        self.assertEqual(slots(self.doctor,dt.date(2026,10,21)),[])
        other = Employee.objects.create(clinic=self.clinic,full_name='Other',branch=self.branch)
        Appointment.objects.create(clinic=self.clinic,patient=self.patient,doctor=other,branch=self.branch,chair_name='A',start_time=dt.datetime(2026,10,20,9),end_time=dt.datetime(2026,10,20,9,30),status='unconfirmed')
        self.assertEqual(len(slots(self.doctor,dt.date(2026,10,20))),1)

    def test_language_persists_for_numeric_messages(self,_):
        self.assertEqual(self.chat('запись')['language'],'ru')
        self.assertEqual(self.chat('1')['language'],'ru')
        self.assertEqual(self.chat('tomorrow')['language'],'en')
        self.assertEqual(self.chat('10:00')['language'],'en')

    def test_tenant_isolation(self,_):
        other = ClinicTenant.objects.create(name='Other')
        result = respond(other.pk,'bot:7','qabullarim')
        self.assertEqual(result['action'],'contact')
        self.assertIsNone(ReceptionContact.objects.get(clinic=other,key='bot:7').patient_id)

    def test_handoff_deduplicated_and_pauses(self,_):
        self.chat('operator')
        self.assertEqual(self.chat('zapis')['reply'],'')
        self.chat('/start')
        self.chat('operator')
        self.assertEqual(ClinicTask.objects.count(),1)

    def test_date_validation(self,_):
        self.assertEqual(parse_day('послезавтра'),dt.date(2026,10,21))
        self.assertIsNone(parse_day('31.02.2026'))
        self.assertEqual(slots(self.doctor,dt.date(2026,10,18)),[])
        self.assertEqual(slots(self.doctor,dt.date(2026,10,25)),[])

    def test_update_idempotence_and_contact_ownership(self,_):
        bot = Mock()
        update = {'update_id':1,'message':{'chat':{'id':9,'type':'private'},'from':{'id':9},'contact':{'user_id':7,'phone_number':self.patient.phone}}}
        handle_update(self.clinic.pk,update,bot)
        handle_update(self.clinic.pk,update,bot)
        self.assertEqual(bot.send.call_count,1)
        self.assertIsNone(ReceptionContact.objects.get(key='bot:9').patient_id)

    def test_failed_reply_retries_without_rebooking(self,_):
        self.draft()
        bot = Mock(); bot.send.side_effect = BotError()
        update = {'update_id':2,'message':{'chat':{'id':7,'type':'private'},'from':{'id':7},'text':'ha'}}
        with self.assertRaises(BotError): handle_update(self.clinic.pk,update,bot)
        bot.send.side_effect = None
        handle_update(self.clinic.pk,update,bot)
        self.assertEqual(Appointment.objects.count(),1)

    def test_reminders_deduplicate_retry_and_reschedule(self,_):
        apt = self.appointment()
        bot = Mock(); bot.send.side_effect = BotError()
        evening = NOW.replace(hour=18)
        self.assertEqual(send_reminders(self.clinic.pk,bot,evening),0)
        self.assertIsNone(ReceptionDelivery.objects.get().sent_at)
        bot.send.side_effect = None
        self.assertEqual(send_reminders(self.clinic.pk,bot,evening),1)
        self.assertEqual(send_reminders(self.clinic.pk,bot,evening),0)
        apt.start_time += dt.timedelta(hours=1); apt.save()
        self.assertEqual(send_reminders(self.clinic.pk,bot,evening),1)

    def test_sunday_daily_and_weekly_no_double(self,_):
        self.appointment(day=19)
        self.appointment(day=21)
        self.assertEqual(send_reminders(self.clinic.pk,Mock(),dt.datetime(2026,10,18,18)),2)
        self.assertEqual(set(ReceptionDelivery.objects.values_list('kind',flat=True)),{'day','week'})

    def test_optout_and_cancelled_do_not_remind(self,_):
        self.appointment(status='cancelled')
        self.assertEqual(send_reminders(self.clinic.pk,Mock(),NOW.replace(hour=18)),0)
        self.appointment()
        self.chat('/stop')
        self.assertEqual(send_reminders(self.clinic.pk,Mock(),NOW.replace(hour=18)),0)

    def test_existing_patient_shared_contact_continues(self,_):
        respond(self.clinic.pk,'bot:10','zapis')
        result = respond(self.clinic.pk,'bot:10','contact',verified_phone=self.patient.phone)
        self.assertEqual(result['action'],'doctor')
        self.assertEqual(ReceptionContact.objects.get(key='bot:10').patient_id,self.patient.pk)

    def test_sunday_name_does_not_match_saturday(self,_):
        self.assertEqual(parse_day('yakshanba'),dt.date(2026,10,25))

    def test_stale_selected_appointment_does_not_change_another(self,_):
        a, b = self.appointment(), self.appointment(day=21)
        self.chat('kelaman')
        a.status = 'cancelled'; a.save()
        self.assertEqual(self.chat('1')['action'],'none')
        b.refresh_from_db()
        self.assertEqual(b.status,'unconfirmed')

    def test_day_only_does_not_book_default_time(self,_):
        self.chat('zapis'); self.chat('1'); self.chat('ertaga')
        self.assertFalse(Appointment.objects.exists())
        self.assertEqual(self.chat('ha')['action'],'none')
        self.assertFalse(Appointment.objects.exists())
