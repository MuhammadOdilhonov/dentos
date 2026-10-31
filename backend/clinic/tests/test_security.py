"""Auth-enabled tenant isolation, media permission, payment idempotency and
chart version-conflict tests.

The legacy conversation suite runs with ENFORCE_API_AUTH=False. These tests
flip it on (as production does) and prove that the cookie session, clinic
boundary, private media proxy, idempotent payments and optimistic-locking chart
saves all behave. Nothing here touches a real clinic DB or sends Telegram.
"""
import datetime
import uuid

from django.contrib.auth.hashers import make_password
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from clinic.models import (
    ClinicTenant, PlatformUser, Employee, Patient, Appointment,
    FinancialTransaction, PatientMedia, PatientRecord, DentalTechnician,
    DentalLabOrder, ServiceCatalogItem,
)

# Writes must carry the custom header (CSRF guard in AccountMiddleware).
WRITE = {'HTTP_X_DENTOS_REQUEST': '1'}


@override_settings(ENFORCE_API_AUTH=True)
class TenantSecurityTests(TestCase):
    def setUp(self):
        # Clinic #1 is the read-only demo clinic — real clinics use higher ids.
        self.demo = ClinicTenant.objects.create(name='Demo klinika')  # pk may be 1
        self.a = ClinicTenant.objects.create(name='Klinika A', status='active')
        self.b = ClinicTenant.objects.create(name='Klinika B', status='active')
        self.dir_a = PlatformUser.objects.create(
            username='dir_a', password=make_password('A-strong-pass-123!'),
            full_name='Director A', role='director', clinic=self.a)
        self.dir_b = PlatformUser.objects.create(
            username='dir_b', password=make_password('B-strong-pass-123!'),
            full_name='Director B', role='director', clinic=self.b)
        self.doc_a = Employee.objects.create(full_name='Doc A', clinic=self.a, role='doctor')
        self.doc_b = Employee.objects.create(full_name='Doc B', clinic=self.b, role='doctor')
        # Clinic A da login qiladigan oddiy shifokor (katalogni o'zgartira olmasligi kerak).
        self.doctor_user_a = PlatformUser.objects.create(
            username='doc_a_login', password=make_password('Doc-A-pass-123!'),
            full_name='Doc A Login', role='doctor', clinic=self.a)
        self.pat_a = Patient.objects.create(full_name='Patient A', phone='+998900000001', clinic=self.a)
        self.pat_b = Patient.objects.create(full_name='Patient B', phone='+998900000002', clinic=self.b)

    # ── helpers ────────────────────────────────────────────────────────────
    def login(self, username, password):
        c = APIClient()
        r = c.post('/api/auth/login/', {'username': username, 'password': password},
                   format='json', **WRITE)
        self.assertEqual(r.status_code, 200, r.content)
        return c

    def appt(self, patient, doctor, clinic, **kw):
        now = datetime.datetime(2026, 11, 1, 10, 0, 0)
        return Appointment.objects.create(
            patient=patient, doctor=doctor, clinic=clinic,
            start_time=now, end_time=now + datetime.timedelta(minutes=30), **kw)

    # ── authentication / session ─────────────────────────────────────────────
    def test_unauthenticated_request_rejected(self):
        r = APIClient().get('/api/patients/')
        self.assertEqual(r.status_code, 401)

    def test_login_me_logout_cycle(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        me = c.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data['user']['role'], 'director')
        self.assertEqual(me.data['user']['clinic'], self.a.pk)
        self.assertNotIn('password', me.data['user'])
        out = c.post('/api/auth/logout/', {}, format='json', **WRITE)
        self.assertEqual(out.status_code, 200)
        # Cookie must be deleted; a fresh client without it is anonymous.
        self.assertEqual(APIClient().get('/api/auth/me/').status_code, 401)

    def test_wrong_password_rejected_and_hash_never_returned(self):
        r = APIClient().post('/api/auth/login/', {'username': 'dir_a', 'password': 'nope'},
                             format='json', **WRITE)
        self.assertEqual(r.status_code, 400)
        c = self.login('dir_a', 'A-strong-pass-123!')
        # The stored value is a hash (algo$...), never the raw password, and the
        # login payload never exposes it.
        self.assertIn('$', self.dir_a.password)
        self.assertNotIn('A-strong-pass-123!', self.dir_a.password)
        r = c.get('/api/patients/')
        self.assertNotIn('password', r.content.decode())

    def test_write_requires_csrf_header(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        # Same session, but missing X-Dentos-Request header.
        r = c.post('/api/patients/', {'full_name': 'X', 'phone': '+998900000009'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_cross_origin_write_blocked(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        r = c.post('/api/patients/', {'full_name': 'X', 'phone': '+998900000009'},
                   format='json', HTTP_X_DENTOS_REQUEST='1', HTTP_ORIGIN='https://evil.example')
        self.assertEqual(r.status_code, 403)

    # ── tenant isolation ──────────────────────────────────────────────────────
    def test_list_is_scoped_to_own_clinic(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        ids = {p['id'] for p in c.get('/api/patients/').json()}
        self.assertIn(self.pat_a.pk, ids)
        self.assertNotIn(self.pat_b.pk, ids)

    def test_clinic_query_override_rejected(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        r = c.get(f'/api/patients/?clinic={self.b.pk}')
        self.assertEqual(r.status_code, 403)

    def test_clinic_header_override_rejected(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        r = c.get('/api/patients/', HTTP_X_CLINIC_ID=str(self.b.pk))
        self.assertEqual(r.status_code, 403)

    def test_cross_clinic_object_read_is_404(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        self.assertEqual(c.get(f'/api/patients/{self.pat_b.pk}/').status_code, 404)

    def test_cross_clinic_object_write_is_404(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        r = c.patch(f'/api/patients/{self.pat_b.pk}/', {'full_name': 'hacked'},
                    format='json', **WRITE)
        self.assertEqual(r.status_code, 404)
        self.pat_b.refresh_from_db()
        self.assertEqual(self.pat_b.full_name, 'Patient B')

    def test_create_is_forced_into_own_clinic(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        r = c.post('/api/patients/', {'full_name': 'New', 'phone': '+998900000010',
                                      'clinic': self.b.pk}, format='json', **WRITE)
        # TenantPermission (403) or tenant serializer (400) — either way, denied.
        self.assertIn(r.status_code, (400, 403))
        self.assertFalse(Patient.objects.filter(full_name='New', clinic=self.b).exists())

    def test_related_object_must_belong_to_clinic(self):
        # An appointment that references clinic B's doctor must be rejected for clinic A.
        c = self.login('dir_a', 'A-strong-pass-123!')
        r = c.post('/api/appointments/', {
            'patient': self.pat_a.pk, 'doctor': self.doc_b.pk,
            'start_time': '2026-11-02T10:00:00', 'end_time': '2026-11-02T10:30:00',
        }, format='json', **WRITE)
        self.assertIn(r.status_code, (400, 403))

    # ── private media proxy ───────────────────────────────────────────────────
    def test_media_download_scoped_to_clinic(self):
        from django.core.files.base import ContentFile
        media_b = PatientMedia.objects.create(
            clinic=self.b, patient=self.pat_b, kind='foto',
            file=ContentFile(b'\x89PNG fake', name='x.png'),
            file_name='x.png', file_size=9, file_type='image/png')
        c = self.login('dir_a', 'A-strong-pass-123!')
        self.assertEqual(c.get(f'/api/patient-media/{media_b.pk}/download/').status_code, 404)
        # Owner can read it.
        cb = self.login('dir_b', 'B-strong-pass-123!')
        self.assertEqual(cb.get(f'/api/patient-media/{media_b.pk}/download/').status_code, 200)

    # ── payment idempotency ───────────────────────────────────────────────────
    def test_payment_is_idempotent_on_request_id(self):
        apt = self.appt(self.pat_a, self.doc_a, self.a, price=100, status='debt')
        c = self.login('dir_a', 'A-strong-pass-123!')
        rid = str(uuid.uuid4())
        body = {'amount': '40', 'request_id': rid}
        r1 = c.post(f'/api/appointments/{apt.pk}/record_payment/', body, format='json', **WRITE)
        r2 = c.post(f'/api/appointments/{apt.pk}/record_payment/', body, format='json', **WRITE)
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        apt.refresh_from_db()
        self.assertEqual(apt.paid_amount, 40)  # applied once, not twice
        self.assertEqual(FinancialTransaction.objects.filter(request_id=rid).count(), 1)

    def test_same_request_id_different_amount_conflict(self):
        apt = self.appt(self.pat_a, self.doc_a, self.a, price=100, status='debt')
        c = self.login('dir_a', 'A-strong-pass-123!')
        rid = str(uuid.uuid4())
        c.post(f'/api/appointments/{apt.pk}/record_payment/', {'amount': '40', 'request_id': rid},
               format='json', **WRITE)
        r = c.post(f'/api/appointments/{apt.pk}/record_payment/', {'amount': '50', 'request_id': rid},
                   format='json', **WRITE)
        self.assertEqual(r.status_code, 409)

    def test_payment_requires_kassa_role(self):
        apt = self.appt(self.pat_a, self.doc_a, self.a, price=100, status='debt')
        doctor = PlatformUser.objects.create(
            username='doc_login_a', password=make_password('Doc-pass-123!'),
            full_name='Doc Login', role='doctor', clinic=self.a)
        c = self.login('doc_login_a', 'Doc-pass-123!')
        r = c.post(f'/api/appointments/{apt.pk}/record_payment/',
                   {'amount': '10', 'request_id': str(uuid.uuid4())}, format='json', **WRITE)
        self.assertEqual(r.status_code, 403)

    # ── chart optimistic concurrency ──────────────────────────────────────────
    def test_patient_record_version_conflict(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        url = f'/api/patient-records/{self.pat_a.pk}/'
        first = c.put(url, {'section': 'notes', 'value': [{'t': 'one'}], 'version': 0},
                      format='json', **WRITE)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['version'], 1)
        # A stale writer still believing version 0 is rejected, data preserved.
        stale = c.put(url, {'section': 'notes', 'value': [{'t': 'overwrite'}], 'version': 0},
                      format='json', **WRITE)
        self.assertEqual(stale.status_code, 409)
        # The fresh version wins.
        ok = c.put(url, {'section': 'notes', 'value': [{'t': 'two'}], 'version': 1},
                   format='json', **WRITE)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data['version'], 2)
        row = PatientRecord.objects.get(patient=self.pat_a, section='notes')
        self.assertEqual(row.value, [{'t': 'two'}])

    def test_patient_record_lock_returns_controlled_503_not_500(self):
        # Qayta urinishlar tugaganda ham baza band bo'lsa (SQLite lock) — endpoint
        # xom 500 (stack-trace) EMAS, boshqariladigan 503 qaytarishi kerak; frontend
        # buni "saqlanmadi, qayta urinib ko'ring" deb ko'rsatadi (saqlandi deb emas).
        from unittest import mock
        from django.db import OperationalError
        c = self.login('dir_a', 'A-strong-pass-123!')
        url = f'/api/patient-records/{self.pat_a.pk}/'
        with mock.patch('clinic.patient_records._write_section',
                        side_effect=OperationalError('database is locked')):
            r = c.put(url, {'section': 'notes', 'value': [{'t': 'x'}], 'version': 0},
                      format='json', **WRITE)
        self.assertEqual(r.status_code, 503, r.content)
        self.assertIn('detail', r.data)
        # Hech narsa saqlanmagan bo'lishi kerak (yolg'on muvaffaqiyat yo'q).
        self.assertFalse(PatientRecord.objects.filter(patient=self.pat_a, section='notes').exists())

    def test_patient_record_cross_clinic_is_404(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        r = c.put(f'/api/patient-records/{self.pat_b.pk}/',
                  {'section': 'notes', 'value': [], 'version': 0}, format='json', **WRITE)
        self.assertEqual(r.status_code, 404)

    # ── service/naryad catalog persistence ────────────────────────────────────
    def test_catalog_persists_and_is_clinic_scoped(self):
        ca = self.login('dir_a', 'A-strong-pass-123!')
        cb = self.login('dir_b', 'B-strong-pass-123!')
        created = ca.post('/api/service-catalog/', {
            'name': 'Tsirkon toj', 'category': 'Ортопедия', 'base_price': '1500000',
            'default_percent': 35, 'description': 'test'}, format='json', **WRITE)
        self.assertEqual(created.status_code, 201, created.content)
        item_id = created.json()['id']
        # Clinic A sees its item after a fresh request (persisted in DB).
        listed = {i['id'] for i in ca.get('/api/service-catalog/').json()}
        self.assertIn(item_id, listed)
        # Clinic B must NOT see clinic A's catalog, and cannot read the object.
        self.assertNotIn(item_id, {i['id'] for i in cb.get('/api/service-catalog/').json()})
        self.assertEqual(cb.get(f'/api/service-catalog/{item_id}/').status_code, 404)
        # Price update persists.
        upd = ca.patch(f'/api/service-catalog/{item_id}/', {'base_price': '1750000'},
                       format='json', **WRITE)
        self.assertEqual(upd.status_code, 200)
        self.assertEqual(ca.get(f'/api/service-catalog/{item_id}/').json()['base_price'], '1750000.00')

    def test_catalog_cross_clinic_write_blocked(self):
        ca = self.login('dir_a', 'A-strong-pass-123!')
        created = ca.post('/api/service-catalog/', {'name': 'X', 'base_price': '1000'},
                          format='json', **WRITE).json()
        cb = self.login('dir_b', 'B-strong-pass-123!')
        self.assertEqual(cb.patch(f"/api/service-catalog/{created['id']}/",
                                  {'base_price': '999'}, format='json', **WRITE).status_code, 404)
        self.assertEqual(cb.delete(f"/api/service-catalog/{created['id']}/", **WRITE).status_code, 404)

    # ── catalog write-role enforcement (issue #1) ─────────────────────────────
    def test_doctor_cannot_write_catalog_but_can_read(self):
        item = ServiceCatalogItem.objects.create(clinic=self.a, name='Seed', base_price=100)
        c = self.login('doc_a_login', 'Doc-A-pass-123!')
        # Read allowed.
        self.assertEqual(c.get('/api/service-catalog/').status_code, 200)
        # Create / patch / delete denied (backend, not just UI).
        self.assertEqual(c.post('/api/service-catalog/', {'name': 'Nope', 'base_price': '1'},
                                format='json', **WRITE).status_code, 403)
        self.assertEqual(c.patch(f'/api/service-catalog/{item.pk}/', {'base_price': '5'},
                                 format='json', **WRITE).status_code, 403)
        self.assertEqual(c.delete(f'/api/service-catalog/{item.pk}/', **WRITE).status_code, 403)
        item.refresh_from_db()
        self.assertEqual(item.base_price, 100)

    def test_director_can_write_catalog(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        r = c.post('/api/service-catalog/', {'name': 'OK', 'base_price': '100000', 'default_percent': 40},
                   format='json', **WRITE)
        self.assertEqual(r.status_code, 201, r.content)

    # ── catalog value validation (issue #2) ──────────────────────────────────
    def test_catalog_rejects_invalid_price_and_percent(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        self.assertEqual(c.post('/api/service-catalog/', {'name': 'Neg', 'base_price': '-100'},
                                format='json', **WRITE).status_code, 400)
        self.assertEqual(c.post('/api/service-catalog/', {'name': 'Pct', 'base_price': '100', 'default_percent': 150},
                                format='json', **WRITE).status_code, 400)
        # Boundary values 0 and 100 are valid.
        self.assertEqual(c.post('/api/service-catalog/', {'name': 'Zero', 'base_price': '0', 'default_percent': 0},
                                format='json', **WRITE).status_code, 201)
        self.assertEqual(c.post('/api/service-catalog/', {'name': 'Hundred', 'base_price': '100', 'default_percent': 100},
                                format='json', **WRITE).status_code, 201)

    def test_catalog_update_also_validates(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        item = c.post('/api/service-catalog/', {'name': 'V', 'base_price': '100', 'default_percent': 30},
                      format='json', **WRITE).json()
        self.assertEqual(c.patch(f"/api/service-catalog/{item['id']}/", {'base_price': '-1'},
                                 format='json', **WRITE).status_code, 400)
        self.assertEqual(c.patch(f"/api/service-catalog/{item['id']}/", {'default_percent': 101},
                                 format='json', **WRITE).status_code, 400)

    # ── catalog bulk import: atomic + idempotent (issue #5) ───────────────────
    def test_bulk_import_is_idempotent(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        body = {'items': [
            {'name': 'A svc', 'base_price': '100', 'default_percent': 30},
            {'name': 'B svc', 'base_price': '200', 'default_percent': 40}]}
        r1 = c.post('/api/service-catalog/bulk_import/', body, format='json', **WRITE)
        self.assertEqual(r1.status_code, 200, r1.content)
        self.assertEqual(r1.json(), {'created': 2, 'skipped': 2 - 2})
        # Re-import: existing names skipped, no duplicates.
        r2 = c.post('/api/service-catalog/bulk_import/', body, format='json', **WRITE)
        self.assertEqual(r2.json(), {'created': 0, 'skipped': 2})
        self.assertEqual(ServiceCatalogItem.objects.filter(clinic=self.a, name='A svc').count(), 1)

    def test_bulk_import_is_atomic_on_error(self):
        c = self.login('dir_a', 'A-strong-pass-123!')
        # Second item invalid (negative price) → entire import rolled back.
        body = {'items': [
            {'name': 'Good', 'base_price': '100'},
            {'name': 'Bad', 'base_price': '-5'}]}
        r = c.post('/api/service-catalog/bulk_import/', body, format='json', **WRITE)
        self.assertEqual(r.status_code, 400)
        self.assertFalse(ServiceCatalogItem.objects.filter(clinic=self.a, name='Good').exists())

    def test_bulk_import_doctor_denied_and_clinic_scoped(self):
        doc = self.login('doc_a_login', 'Doc-A-pass-123!')
        self.assertEqual(doc.post('/api/service-catalog/bulk_import/',
                                  {'items': [{'name': 'Z', 'base_price': '1'}]},
                                  format='json', **WRITE).status_code, 403)
        # Imported items stay within the importing clinic.
        ca = self.login('dir_a', 'A-strong-pass-123!')
        ca.post('/api/service-catalog/bulk_import/', {'items': [{'name': 'OnlyA', 'base_price': '1'}]},
                format='json', **WRITE)
        cb = self.login('dir_b', 'B-strong-pass-123!')
        self.assertEqual(cb.get('/api/service-catalog/').json(), [])

    # ── YANGI KLINIKA standart katalog seed (createClinic → bulk_import X-Clinic-ID) ──
    def test_superadmin_seeds_default_catalog_for_target_clinic(self):
        # Yangi klinika yaratilganda frontend (createClinic) superadmin sifatida X-Clinic-ID
        # bilan standart katalogni (narx 0, foiz bilan) YANGI klinikaga bulk_import qiladi.
        PlatformUser.objects.create(
            username='super_x', password=make_password('Super-strong-123!'),
            full_name='Super', role='superadmin')
        c = self.login('super_x', 'Super-strong-123!')
        body = {'items': [
            {'name': 'Seeded 1', 'base_price': 0, 'default_percent': 50},
            {'name': 'Seeded 2', 'base_price': 0, 'default_percent': 35}]}
        r = c.post('/api/service-catalog/bulk_import/', body, format='json',
                   HTTP_X_CLINIC_ID=str(self.a.pk), **WRITE)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['created'], 2)
        items = ServiceCatalogItem.objects.filter(clinic=self.a)
        self.assertEqual(items.count(), 2)
        self.assertEqual(float(items.get(name='Seeded 1').base_price), 0.0)   # narx 0 (yozilmagan)
        self.assertEqual(items.get(name='Seeded 1').default_percent, 50)      # foiz saqlandi
        # Idempotent: qayta seed dublikat yaratmaydi.
        r2 = c.post('/api/service-catalog/bulk_import/', body, format='json',
                    HTTP_X_CLINIC_ID=str(self.a.pk), **WRITE)
        self.assertEqual(r2.json(), {'created': 0, 'skipped': 2})

    def test_non_superadmin_cannot_seed_other_clinic(self):
        # Oddiy direktor (B) X-Clinic-ID bilan A klinikaga yoza OLMAYDI (cross-clinic 403).
        cb = self.login('dir_b', 'B-strong-pass-123!')
        r = cb.post('/api/service-catalog/bulk_import/',
                    {'items': [{'name': 'Hack', 'base_price': 0}]},
                    format='json', HTTP_X_CLINIC_ID=str(self.a.pk), **WRITE)
        self.assertEqual(r.status_code, 403)
        self.assertFalse(ServiceCatalogItem.objects.filter(clinic=self.a, name='Hack').exists())

    # ── doctor-specific pricing persistence + isolation (issue #4) ────────────
    def test_doctor_naryad_rate_persists_and_isolated(self):
        ca = self.login('dir_a', 'A-strong-pass-123!')
        svc = ca.post('/api/service-catalog/', {'name': 'Crown', 'base_price': '1000000', 'default_percent': 35},
                      format='json', **WRITE).json()
        rate = ca.post('/api/doctor-naryads/', {
            'doctor_id': self.doc_a.pk, 'naryad_id': str(svc['id']),
            'custom_price': '1200000', 'commission_percent': 40, 'is_custom_price': True},
            format='json', **WRITE)
        self.assertEqual(rate.status_code, 201, rate.content)
        # Persisted + readable by doctor id.
        listed = ca.get(f'/api/doctor-naryads/?doctor={self.doc_a.pk}').json()
        self.assertEqual(len(listed), 1)
        self.assertEqual(str(listed[0]['naryad_id']), str(svc['id']))
        self.assertEqual(listed[0]['custom_price'], '1200000.00')
        # Clinic B cannot see it.
        cb = self.login('dir_b', 'B-strong-pass-123!')
        self.assertEqual(cb.get('/api/doctor-naryads/').json(), [])

    def test_doctor_naryad_rate_rejects_foreign_doctor_or_service(self):
        ca = self.login('dir_a', 'A-strong-pass-123!')
        svc = ca.post('/api/service-catalog/', {'name': 'X', 'base_price': '1000'}, format='json', **WRITE).json()
        # doctor from clinic B — must be rejected.
        r = ca.post('/api/doctor-naryads/', {'doctor_id': self.doc_b.pk, 'naryad_id': str(svc['id']),
                                             'custom_price': '1', 'commission_percent': 10},
                    format='json', **WRITE)
        self.assertEqual(r.status_code, 400)

    def test_doctor_naryad_invalid_service_id_is_400_not_500(self):
        ca = self.login('dir_a', 'A-strong-pass-123!')
        for bad in ['nar-6', '', 'abc', '0', '-3']:
            r = ca.post('/api/doctor-naryads/', {
                'doctor_id': self.doc_a.pk, 'naryad_id': bad,
                'custom_price': '100', 'commission_percent': 35}, format='json', **WRITE)
            self.assertEqual(r.status_code, 400, f'{bad!r} → {r.status_code}: {r.content}')
        # Numerik, lekin mavjud bo'lmagan ID — baribir 400 (500 emas).
        r = ca.post('/api/doctor-naryads/', {'doctor_id': self.doc_a.pk, 'naryad_id': '999999',
                                             'custom_price': '100', 'commission_percent': 35},
                    format='json', **WRITE)
        self.assertEqual(r.status_code, 400)

    def test_doctor_naryad_cross_clinic_service_denied(self):
        cb = self.login('dir_b', 'B-strong-pass-123!')
        svc_b = cb.post('/api/service-catalog/', {'name': 'B svc', 'base_price': '1'}, format='json', **WRITE).json()
        ca = self.login('dir_a', 'A-strong-pass-123!')
        # Clinic A tries to attach clinic B's service id.
        r = ca.post('/api/doctor-naryads/', {'doctor_id': self.doc_a.pk, 'naryad_id': str(svc_b['id']),
                                             'custom_price': '100', 'commission_percent': 35},
                    format='json', **WRITE)
        self.assertEqual(r.status_code, 400)

    def test_doctor_naryad_patch_pair_change_rejected_not_500(self):
        ca = self.login('dir_a', 'A-strong-pass-123!')
        svcA = ca.post('/api/service-catalog/', {'name': 'SvcA', 'base_price': '100'}, format='json', **WRITE).json()
        svcB = ca.post('/api/service-catalog/', {'name': 'SvcB', 'base_price': '200'}, format='json', **WRITE).json()
        ca.post('/api/doctor-naryads/', {'doctor_id': self.doc_a.pk, 'naryad_id': str(svcA['id']),
                                         'custom_price': '100', 'commission_percent': 30}, format='json', **WRITE)
        rateB = ca.post('/api/doctor-naryads/', {'doctor_id': self.doc_a.pk, 'naryad_id': str(svcB['id']),
                                                 'custom_price': '200', 'commission_percent': 30}, format='json', **WRITE).json()
        # PATCH B's pair to A's service → controlled 400, NOT 500 (unique constraint intact).
        r = ca.patch(f"/api/doctor-naryads/{rateB['id']}/", {'naryad_id': str(svcA['id'])}, format='json', **WRITE)
        self.assertEqual(r.status_code, 400, r.content)
        # Changing only price on B still works.
        ok = ca.patch(f"/api/doctor-naryads/{rateB['id']}/", {'custom_price': '250'}, format='json', **WRITE)
        self.assertEqual(ok.status_code, 200)

    def test_doctor_naryad_repeat_post_is_idempotent(self):
        ca = self.login('dir_a', 'A-strong-pass-123!')
        svc = ca.post('/api/service-catalog/', {'name': 'Rep', 'base_price': '100'}, format='json', **WRITE).json()
        body = {'doctor_id': self.doc_a.pk, 'naryad_id': str(svc['id']), 'custom_price': '100', 'commission_percent': 30}
        self.assertEqual(ca.post('/api/doctor-naryads/', body, format='json', **WRITE).status_code, 201)
        body['custom_price'] = '150'
        self.assertIn(ca.post('/api/doctor-naryads/', body, format='json', **WRITE).status_code, (200, 201))
        rates = ca.get(f'/api/doctor-naryads/?doctor={self.doc_a.pk}').json()
        self.assertEqual(len(rates), 1)
        self.assertEqual(rates[0]['custom_price'], '150.00')

    def test_doctor_naryad_concurrent_create_falls_back_to_update(self):
        # IntegrityError (parallel create poygasi) — endpoint 500 bermasin, update'ga o'tsin.
        from unittest.mock import patch
        from django.db import IntegrityError
        from clinic.models import DoctorNaryadRate, ServiceCatalogItem
        svc = ServiceCatalogItem.objects.create(clinic=self.a, name='Race', base_price=100)
        # "Yutgan" so'rov yozuvni allaqachon yaratgan holatni simulyatsiya qilamiz.
        DoctorNaryadRate.objects.create(clinic=self.a, doctor=self.doc_a, service=svc,
                                        custom_price=100, commission_percent=30)
        ca = self.login('dir_a', 'A-strong-pass-123!')
        with patch('clinic.models.DoctorNaryadRate.objects.update_or_create', side_effect=IntegrityError('dup')):
            r = ca.post('/api/doctor-naryads/', {'doctor_id': self.doc_a.pk, 'naryad_id': str(svc.pk),
                                                 'custom_price': '175', 'commission_percent': 40},
                        format='json', **WRITE)
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertEqual(DoctorNaryadRate.objects.filter(clinic=self.a, doctor=self.doc_a, service=svc).count(), 1)
        self.assertEqual(str(DoctorNaryadRate.objects.get(doctor=self.doc_a, service=svc).custom_price), '175.00')

    def test_doctor_cannot_write_doctor_naryad_rate(self):
        item = ServiceCatalogItem.objects.create(clinic=self.a, name='Seed', base_price=100)
        c = self.login('doc_a_login', 'Doc-A-pass-123!')
        r = c.post('/api/doctor-naryads/', {'doctor_id': self.doc_a.pk, 'naryad_id': str(item.pk),
                                            'custom_price': '1', 'commission_percent': 10},
                   format='json', **WRITE)
        self.assertEqual(r.status_code, 403)

    # ── login formasi "Telefon yoki Email" — backend telefon bilan ham kirsin ──
    def test_login_by_phone_unique_match(self):
        self.dir_a.phone = '+998 90 111 22 33'
        self.dir_a.save(update_fields=['phone'])
        # Xalqaro format
        r = self.client.post('/api/auth/login/', {'username': '+998 90 111 22 33', 'password': 'A-strong-pass-123!'}, format='json', **WRITE)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['user']['username'], 'dir_a')
        # Lokal 9-xonali format ham normalizatsiya bo'lib mos kelsin
        r2 = self.client.post('/api/auth/login/', {'username': '901112233', 'password': 'A-strong-pass-123!'}, format='json', **WRITE)
        self.assertEqual(r2.status_code, 200, r2.content)

    def test_login_by_phone_wrong_password_is_400(self):
        self.dir_a.phone = '+998 90 111 22 33'
        self.dir_a.save(update_fields=['phone'])
        r = self.client.post('/api/auth/login/', {'username': '901112233', 'password': 'nope'}, format='json', **WRITE)
        self.assertEqual(r.status_code, 400)

    def test_login_by_ambiguous_phone_refuses_to_guess(self):
        # Ikki klinikadagi ikki akkaunt bir xil telefonga ega — login TAXMIN qilmasin.
        self.dir_a.phone = '+998 90 111 22 33'; self.dir_a.save(update_fields=['phone'])
        self.dir_b.phone = '+998 90 111 22 33'; self.dir_b.save(update_fields=['phone'])
        r = self.client.post('/api/auth/login/', {'username': '901112233', 'password': 'A-strong-pass-123!'}, format='json', **WRITE)
        self.assertEqual(r.status_code, 400)  # klinikalararo fallback yo'q, dublikatda kirmaydi

    # ── role scoping ──────────────────────────────────────────────────────────
    def test_technician_can_only_reach_lab_orders(self):
        tech = DentalTechnician.objects.create(
            name='Tech One', username='tech1', password=make_password('Tech-pass-123!'),
            lab_name='Lab')
        order = DentalLabOrder.objects.create(
            patient=self.pat_a, doctor=self.doc_a, technician_name='Tech One',
            technician=tech, tooth_numbers='11', work_type='crown', clinic=self.a)
        c = self.login('tech1', 'Tech-pass-123!')
        # Patients are off-limits for a technician.
        self.assertEqual(c.get('/api/patients/').status_code, 403)
        # Their own lab order is visible.
        ids = {o['id'] for o in c.get('/api/lab-orders/').json()}
        self.assertIn(order.pk, ids)


class CreateAdminCommandTests(TestCase):
    """Production bootstrap: xavfsiz superadmin yaratish (seed_platform'siz)."""
    def _run(self, **env):
        import os
        from io import StringIO
        from django.core.management import call_command
        old = {k: os.environ.get(k) for k in ('DJANGO_ADMIN_USERNAME', 'DJANGO_ADMIN_PASSWORD', 'DJANGO_ADMIN_NAME')}
        try:
            for k in old:
                os.environ.pop(k, None)
            for k, v in env.items():
                os.environ[k] = v
            out = StringIO()
            call_command('create_admin', stdout=out, stderr=out)
            return out.getvalue()
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_requires_password_env(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self._run(DJANGO_ADMIN_USERNAME='admin@dentos.cc')  # no password

    def test_rejects_weak_password(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self._run(DJANGO_ADMIN_USERNAME='admin@dentos.cc', DJANGO_ADMIN_PASSWORD='123')

    def test_creates_superadmin_hashed(self):
        self._run(DJANGO_ADMIN_USERNAME='root@dentos.cc', DJANGO_ADMIN_PASSWORD='Str0ng-Admin-Pass!xq',
                  DJANGO_ADMIN_NAME='Root Admin')
        u = PlatformUser.objects.get(username='root@dentos.cc')
        self.assertEqual(u.role, 'superadmin')
        self.assertIn('$', u.password)
        self.assertNotIn('Str0ng-Admin-Pass!xq', u.password)

    def test_does_not_overwrite_existing_without_flag(self):
        from django.core.management.base import CommandError
        self._run(DJANGO_ADMIN_USERNAME='root@dentos.cc', DJANGO_ADMIN_PASSWORD='Str0ng-Admin-Pass!xq')
        before = PlatformUser.objects.get(username='root@dentos.cc').password
        with self.assertRaises(CommandError):
            self._run(DJANGO_ADMIN_USERNAME='root@dentos.cc', DJANGO_ADMIN_PASSWORD='Another-Str0ng!pw22')
        self.assertEqual(PlatformUser.objects.get(username='root@dentos.cc').password, before)


@override_settings(ENFORCE_API_AUTH=True)
class DemoClinicTests(TestCase):
    """Clinic pk=1 is the shared read-only demo account."""
    def setUp(self):
        self.demo = ClinicTenant.objects.filter(pk=1).first() or ClinicTenant.objects.create(name='Demo')
        if self.demo.pk != 1:
            self.skipTest('demo clinic is not pk=1 in this DB ordering')
        self.demo.status = 'active'
        self.demo.save()
        self.user = PlatformUser.objects.create(
            username='demo_dir', password=make_password('Demo-pass-123!'),
            full_name='Demo Director', role='director', clinic=self.demo)
        self.patient = Patient.objects.create(full_name='Demo Patient', phone='+998900000100', clinic=self.demo)

    def test_demo_clinic_is_read_only(self):
        c = APIClient()
        r = c.post('/api/auth/login/', {'username': 'demo_dir', 'password': 'Demo-pass-123!'},
                   format='json', **WRITE)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(c.get('/api/patients/').status_code, 200)  # read ok
        w = c.post('/api/patients/', {'full_name': 'Blocked', 'phone': '+998900000101'},
                   format='json', **WRITE)
        self.assertEqual(w.status_code, 403)  # writes blocked
