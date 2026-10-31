import datetime
from unittest.mock import patch
from django.core.cache import cache
from django.contrib.auth.hashers import check_password
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from clinic.models import (ClinicTenant, Employee, PlatformUser,
    TelegramLoginContact, TelegramLoginChallenge, DentalTechnician)
from clinic.telegram_login import handle_update, find_account


class TelegramLoginTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.clinic = ClinicTenant.objects.create(name='Test clinic')
        self.user = PlatformUser.objects.create(username='audit-director', password='old-test-password', full_name='Audit Director', role='director', clinic=self.clinic)
        self.employee = Employee.objects.create(username=self.user.username, clinic=self.clinic, full_name=self.user.full_name, phone='+998 90 123 45 67', role='director')
        self.phone = '998901234567'
        self.contact = TelegramLoginContact.objects.create(phone=self.phone, telegram_user_id=100, chat_id=100)
        self.bot = patch('clinic.telegram_login.bot_call', return_value={'message_id':1}).start()
        self.addCleanup(patch.stopall)

    def issue(self, purpose='login'):
        with patch('clinic.telegram_login.secrets.randbelow', return_value=123456):
            return self.client.post('/api/auth/telegram/request/', {'phone':self.phone,'purpose':purpose}, format='json')

    def verify(self, challenge, code='123456', **extra):
        return self.client.post('/api/auth/telegram/verify/', {'phone':self.phone, 'challenge_id':challenge, 'code':code, **extra}, format='json')

    def test_success_and_single_use(self):
        response=self.issue(); self.assertEqual(response.status_code,200)
        self.assertNotIn('dev_code',response.data); self.assertNotIn('123456',str(response.data))
        saved=TelegramLoginChallenge.objects.get(pk=response.data['challenge_id'])
        self.assertNotEqual(saved.code_hash,'123456')
        verified=self.verify(str(saved.pk)); self.assertEqual(verified.status_code,200)
        self.assertEqual(verified.data['user']['role'],'director')
        self.assertEqual(verified.data['user']['clinic'],self.clinic.pk)
        self.assertEqual(self.verify(str(saved.pk)).status_code,400)

    def test_wrong_code_locks_after_five_attempts(self):
        cid=self.issue().data['challenge_id']
        for _ in range(5): self.assertEqual(self.verify(cid,'000000').status_code,400)
        self.assertEqual(self.verify(cid).status_code,400)

    def test_expiry(self):
        cid=self.issue().data['challenge_id']
        TelegramLoginChallenge.objects.filter(pk=cid).update(expires_at=timezone.now()-datetime.timedelta(seconds=1))
        self.assertEqual(self.verify(cid).status_code,400)

    def test_phone_and_challenge_must_match(self):
        cid=self.issue().data['challenge_id'];self.phone='998901111111'
        self.assertEqual(self.verify(cid).status_code,400)

    def test_resend_cooldown(self):
        self.assertEqual(self.issue().status_code,200)
        self.assertEqual(self.issue().status_code,429)

    def test_delivery_failure_never_claims_sent(self):
        self.bot.side_effect=RuntimeError('Telegram unavailable')
        response=self.issue();self.assertEqual(response.status_code,502)
        self.assertFalse(response.data['ok'])
        self.assertNotIn('challenge_id',response.data)

    def test_bot_not_started(self):
        self.contact.delete();response=self.issue()
        self.assertEqual(response.status_code,409);self.assertTrue(response.data['needs_start'])
        self.assertEqual(response.data['bot_url'],'https://t.me/dentosccbot?start=login')

    def test_disabled_account_cannot_login(self):
        cid=self.issue().data['challenge_id']
        self.user.is_active=False;self.user.save()
        self.assertEqual(self.verify(cid).status_code,400)

    def test_ambiguous_phone_is_rejected(self):
        other=PlatformUser.objects.create(username='other',password='test',full_name='Other',clinic=self.clinic)
        Employee.objects.create(username=other.username,full_name='Other',clinic=self.clinic,phone=self.phone)
        self.assertIsNone(find_account(self.phone));self.assertEqual(self.issue().status_code,400)

    def test_forged_contact_rejected(self):
        self.contact.delete()
        handle_update({'message':{'from':{'id':100},'chat':{'id':100,'type':'private'},'contact':{'user_id':200,'phone_number':self.phone}}})
        self.assertFalse(TelegramLoginContact.objects.exists())

    def test_own_contact_binds_phone(self):
        self.contact.delete()
        handle_update({'message':{'from':{'id':100},'chat':{'id':100,'type':'private'},'contact':{'user_id':100,'phone_number':self.phone}}})
        self.assertEqual(TelegramLoginContact.objects.get().telegram_user_id,100)

    def test_group_contact_ignored(self):
        self.contact.delete()
        handle_update({'message':{'from':{'id':100},'chat':{'id':-1,'type':'group'},'contact':{'user_id':100,'phone_number':self.phone}}})
        self.assertFalse(TelegramLoginContact.objects.exists());self.bot.assert_not_called()

    def test_start_requests_contact(self):
        handle_update({'message':{'from':{'id':100},'chat':{'id':100,'type':'private'},'text':'/start'}})
        self.assertTrue(self.bot.call_args.kwargs['reply_markup']['keyboard'][0][0]['request_contact'])

    def test_reset_hashes_password_and_old_password_stops_working(self):
        cid=self.issue('reset').data['challenge_id']
        response=self.verify(cid,new_password='Fresh-Audit-Password!975')
        self.assertEqual(response.status_code,200)
        self.user.refresh_from_db();self.employee.refresh_from_db()
        self.assertTrue(check_password('Fresh-Audit-Password!975',self.user.password))
        self.assertEqual(self.employee.password,self.user.password)
        old=self.client.post('/api/auth/login/',{'username':self.user.username,'password':'old-test-password'},format='json')
        self.assertEqual(old.status_code,400)
        new=self.client.post('/api/auth/login/',{'username':self.user.username,'password':'Fresh-Audit-Password!975'},format='json')
        self.assertEqual(new.status_code,200)

    def test_weak_reset_password_rejected(self):
        cid=self.issue('reset').data['challenge_id']
        self.assertEqual(self.verify(cid,new_password='123').status_code,400)

    def test_legacy_code_endpoint_disabled(self):
        self.assertEqual(self.client.post('/api/auth/request-code/',{'phone':self.phone,'method':'telegram'},format='json').status_code,410)

    def test_technician_phone_recognized(self):
        tech=DentalTechnician.objects.create(name='Audit Tech',username='audit-tech',password='test-password',phone='998901111112')
        self.assertEqual(find_account('998901111112').pk,tech.pk)

    def test_platform_phone_direct_match(self):
        # Xodim/username bog'lanishisiz ham login akkaunt o'z telefoni bo'yicha topiladi
        user=PlatformUser.objects.create(username='kassa-1',password='test',full_name='Kassir Bir',role='kassa',clinic=self.clinic,phone='+998 90 777 66 55')
        self.assertEqual(find_account('998907776655').pk,user.pk)

    def test_same_account_multiple_sources_not_ambiguous(self):
        # Bir xil akkaunt ham o'z telefoni, ham xodim telefoni orqali kelsa — BITTA deb sanaladi
        self.user.phone='+998 90 123 45 67';self.user.save(update_fields=['phone'])
        self.assertEqual(find_account(self.phone).pk,self.user.pk)
