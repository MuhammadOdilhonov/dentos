"""Tests for comprehensive clinic deletion and patients bulk deletion."""
from decimal import Decimal
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.models import User as DjangoAuthUser
from django.core import signing
from rest_framework.test import APIClient
from clinic.models import (
    ClinicTenant, Patient, PatientMedia, Employee, PlatformUser, Branch,
    Appointment, FinancialTransaction, DentalTechnician, DentalLabOrder,
    PhotoProtocol, PatientRecord
)
from clinic.access import COOKIE, fingerprint


class ClinicAndPatientDeletionTests(TestCase):
    def setUp(self):
        # Create demo clinic with id=1 FIRST
        self.demo_clinic = ClinicTenant.objects.create(
            id=1,
            name='Demo Klinika',
            branch='Demo Filial'
        )

        self.clinic = ClinicTenant.objects.create(
            id=2,
            name="Test Klinika O'chirish",
            branch="Markaz",
            cloud_storage_quota_gb=Decimal('50.0'),
            server_storage_quota_gb=Decimal('5.0')
        )
        self.superadmin = PlatformUser.objects.create(
            username="super_test@dentos.cc",
            role="superadmin",
            clinic=self.clinic,
            password="test-password-123",
            is_active=True
        )
        self.director = PlatformUser.objects.create(
            username="director_test@dentos.cc",
            role="director",
            clinic=self.clinic,
            password="test-password-123",
            is_active=True
        )
        self.doctor_user = PlatformUser.objects.create(
            username="doctor_test@dentos.cc",
            role="doctor",
            clinic=self.clinic,
            password="test-password-123",
            is_active=True
        )

        self.client_super = APIClient(enforce_csrf=False)
        tok_super = signing.dumps(
            {'id': self.superadmin.pk, 'kind': 'platform', 'password': fingerprint(self.superadmin)},
            salt=COOKIE
        )
        self.client_super.cookies[COOKIE] = tok_super

        self.client_director = APIClient(enforce_csrf=False)
        tok_dir = signing.dumps(
            {'id': self.director.pk, 'kind': 'platform', 'password': fingerprint(self.director)},
            salt=COOKIE
        )
        self.client_director.cookies[COOKIE] = tok_dir

        self.client_doctor = APIClient(enforce_csrf=False)
        tok_doc = signing.dumps(
            {'id': self.doctor_user.pk, 'kind': 'platform', 'password': fingerprint(self.doctor_user)},
            salt=COOKIE
        )
        self.client_doctor.cookies[COOKIE] = tok_doc

    def test_clear_all_patients(self):
        # Create patients, media, appointments, transactions
        p1 = Patient.objects.create(clinic=self.clinic, full_name="Bemor Bir", phone="+998901111111")
        p2 = Patient.objects.create(clinic=self.clinic, full_name="Bemor Ikki", phone="+998902222222")

        fake_file = SimpleUploadedFile("pic1.jpg", b"fake-jpeg-data")
        m1 = PatientMedia.objects.create(clinic=self.clinic, patient=p1, kind="foto", file=fake_file, file_name="pic1.jpg")
        
        doc = Employee.objects.create(clinic=self.clinic, full_name="Dr. Aliyev", role="doctor")
        Appointment.objects.create(clinic=self.clinic, patient=p1, doctor=doc, start_time="2026-11-20 10:00:00", end_time="2026-11-20 10:30:00")
        FinancialTransaction.objects.create(clinic=self.clinic, patient=p1, amount=100000, type="income", payment_method="Наличные")
        PatientRecord.objects.create(patient=p1, section="diagnosis", value=[{"text": "Karies"}])

        self.assertEqual(Patient.objects.filter(clinic=self.clinic).count(), 2)
        self.assertEqual(PatientMedia.objects.filter(clinic=self.clinic).count(), 1)

        # Clear all patients as director
        r = self.client_director.post(
            f"/api/patients/clear-all/?clinic={self.clinic.id}",
            HTTP_X_CLINIC_ID=str(self.clinic.id),
            HTTP_X_DENTOS_REQUEST='1'
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['ok'])
        self.assertEqual(r.data['deleted'], 2)

        # Verify all patients and cascaded records deleted
        self.assertEqual(Patient.objects.filter(clinic=self.clinic).count(), 0)
        self.assertEqual(PatientMedia.objects.filter(clinic=self.clinic).count(), 0)
        self.assertEqual(Appointment.objects.filter(clinic=self.clinic).count(), 0)
        self.assertEqual(FinancialTransaction.objects.filter(clinic=self.clinic).count(), 0)
        self.assertEqual(PatientRecord.objects.filter(patient_id=p1.id).count(), 0)

    def test_doctor_cannot_clear_all_patients(self):
        p1 = Patient.objects.create(clinic=self.clinic, full_name="Bemor Bir", phone="+998901111111")
        r = self.client_doctor.post(
            f"/api/patients/clear-all/?clinic={self.clinic.id}",
            HTTP_X_CLINIC_ID=str(self.clinic.id),
            HTTP_X_DENTOS_REQUEST='1'
        )
        self.assertEqual(r.status_code, 403)
        self.assertEqual(Patient.objects.filter(clinic=self.clinic).count(), 1)

    def test_demo_clinic_patients_cannot_be_cleared(self):
        r = self.client_super.post(
            f"/api/patients/clear-all/?clinic={self.demo_clinic.id}",
            HTTP_X_CLINIC_ID=str(self.demo_clinic.id),
            HTTP_X_DENTOS_REQUEST='1'
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("Demo", r.data['detail'])

    def test_excel_delete_all_flag(self):
        p1 = Patient.objects.create(clinic=self.clinic, full_name="Bemor A", phone="+998903333333")
        p2 = Patient.objects.create(clinic=self.clinic, full_name="Bemor B", phone="+998904444444")

        r = self.client_super.delete(
            f"/api/patients/excel-delete/?clinic={self.clinic.id}",
            {'all': True},
            format='json',
            HTTP_X_CLINIC_ID=str(self.clinic.id),
            HTTP_X_DENTOS_REQUEST='1'
        )
        if r.status_code != 200:
            print("EXCEL_DELETE_ERROR_DEBUG:", r.status_code, r.data)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['deleted'], 2)
        self.assertEqual(Patient.objects.filter(clinic=self.clinic).count(), 0)

    def test_clinic_full_deletion(self):
        # Create full clinic data graph
        p = Patient.objects.create(clinic=self.clinic, full_name="Bemor Test", phone="+998905555555")
        fake_file = SimpleUploadedFile("oral.jpg", b"fake-oral-photo")
        PatientMedia.objects.create(clinic=self.clinic, patient=p, kind="foto", file=fake_file, file_name="oral.jpg")
        
        branch = Branch.objects.create(clinic=self.clinic, name="Filial 1")
        doc = Employee.objects.create(clinic=self.clinic, full_name="Dr. Karimov", role="doctor", branch=branch)
        Appointment.objects.create(clinic=self.clinic, patient=p, doctor=doc, start_time="2026-11-20 14:00:00", end_time="2026-11-20 14:30:00")
        
        # Link technician
        tech = DentalTechnician.objects.create(
            name="Tech Jasur",
            username="tech_jasur",
            password="123",
            linked_clinics=[self.clinic.name, "Boshqa Klinika"]
        )

        # Delete clinic as superadmin
        r = self.client_super.delete(
            f"/api/clinics/{self.clinic.id}/",
            HTTP_X_DENTOS_REQUEST='1'
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['ok'])

        # Verify clinic is gone
        self.assertFalse(ClinicTenant.objects.filter(id=self.clinic.id).exists())

        # Verify all clinic data is deleted completely
        self.assertFalse(PlatformUser.objects.filter(clinic_id=self.clinic.id).exists())
        self.assertFalse(Employee.objects.filter(clinic_id=self.clinic.id).exists())
        self.assertFalse(Patient.objects.filter(clinic_id=self.clinic.id).exists())
        self.assertFalse(PatientMedia.objects.filter(clinic_id=self.clinic.id).exists())
        self.assertFalse(Branch.objects.filter(clinic_id=self.clinic.id).exists())
        self.assertFalse(Appointment.objects.filter(clinic_id=self.clinic.id).exists())

        # Verify technician link was cleaned up
        tech.refresh_from_db()
        self.assertNotIn(self.clinic.name, tech.linked_clinics)
        self.assertIn("Boshqa Klinika", tech.linked_clinics)

    def test_demo_clinic_cannot_be_deleted(self):
        r = self.client_super.delete(
            f"/api/clinics/{self.demo_clinic.id}/",
            HTTP_X_DENTOS_REQUEST='1'
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("Demo", r.data['detail'])
        self.assertTrue(ClinicTenant.objects.filter(id=self.demo_clinic.id).exists())
