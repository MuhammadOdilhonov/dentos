"""Tests for Cloud (Cloupard S3) and Main Server storage quotas, accounting, and caching."""
import io
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient
from clinic.models import (
    ClinicTenant, Patient, PatientMedia, Employee, PlatformUser, Branch, FinancialTransaction
)
from clinic.access import COOKIE, fingerprint
from clinic.storage_calculator import compute_clinic_storage
from django.core import signing


class StorageAccountingAndQuotaTests(TestCase):
    def setUp(self):
        self.clinic = ClinicTenant.objects.create(
            name="Test Klinika",
            branch="Markaz",
            cloud_storage_quota_gb=Decimal('100.0'),
            server_storage_quota_gb=Decimal('5.0'),
            storage_quota_gb=Decimal('100.0')
        )
        self.user = PlatformUser.objects.create(
            username="superadmin_test@dentos.cc",
            role="superadmin",
            clinic=self.clinic,
            password="test-password-123",
            is_active=True
        )
        self.client = APIClient(enforce_csrf=False)
        token = signing.dumps(
            {'id': self.user.pk, 'kind': 'platform', 'password': fingerprint(self.user)},
            salt=COOKIE
        )
        self.client.cookies[COOKIE] = token

        self.patient = Patient.objects.create(
            clinic=self.clinic,
            full_name="Alisher Navoiy",
            phone="+998901234567"
        )

    def test_compute_clinic_storage_breakdown(self):
        # Create media
        PatientMedia.objects.create(
            clinic=self.clinic,
            patient=self.patient,
            kind="foto",
            file_name="oral_photo.jpg",
            file_size=2048576, # 2 MB
            file_type="image/jpeg"
        )
        PatientMedia.objects.create(
            clinic=self.clinic,
            patient=self.patient,
            kind="rentgen",
            file_name="cbct.zip",
            file_size=10485760, # 10 MB
            file_type="application/zip"
        )
        PatientMedia.objects.create(
            clinic=self.clinic,
            patient=self.patient,
            kind="skan",
            file_name="scan.stl",
            file_size=5242880, # 5 MB
            file_type="application/octet-stream"
        )

        # Create doctor with avatar
        Employee.objects.create(
            clinic=self.clinic,
            full_name="Dr. Shokirov",
            role="doctor",
            avatar="data:image/jpeg;base64,sampleavatardatabytes"
        )

        res = compute_clinic_storage(self.clinic.id)
        self.assertIsNotNone(res)
        
        # Check Cloud storage
        cloud = res['cloud']
        self.assertEqual(cloud['quota_gb'], 100.0)
        self.assertEqual(cloud['breakdown']['foto']['count'], 1)
        self.assertEqual(cloud['breakdown']['foto']['bytes'], 2048576)
        self.assertEqual(cloud['breakdown']['rentgen']['count'], 1)
        self.assertEqual(cloud['breakdown']['rentgen']['bytes'], 10485760)
        self.assertEqual(cloud['breakdown']['skan']['count'], 1)
        self.assertEqual(cloud['breakdown']['skan']['bytes'], 5242880)
        self.assertFalse(cloud['warning'])

        # Check Server storage
        server = res['server']
        self.assertEqual(server['quota_gb'], 5.0)
        self.assertGreater(server['used_bytes'], 0)
        self.assertEqual(server['breakdown']['doctor_avatars']['count'], 1)
        self.assertGreater(server['breakdown']['patients_records']['bytes'], 0)
        self.assertFalse(server['warning'])

    def test_cloud_warning_when_under_10gb_remaining(self):
        # Set quota to 15 GB and used to 6 GB -> 9 GB free (<= 10 GB)
        self.clinic.cloud_storage_quota_gb = Decimal('15.0')
        self.clinic.save()

        # Add 6 GB of media
        PatientMedia.objects.create(
            clinic=self.clinic,
            patient=self.patient,
            kind="foto",
            file_name="big_collection.zip",
            file_size=6 * (1024 ** 3),
            file_type="application/zip"
        )

        res = compute_clinic_storage(self.clinic.id)
        self.assertTrue(res['cloud']['warning'])
        self.assertIn("10 GB dan kam", res['cloud']['warning_message'])

    def test_server_warning_when_under_1gb_remaining(self):
        # Set server quota to 0.5 GB (~500 MB) -> free is 0.5 GB (<= 1 GB)
        self.clinic.server_storage_quota_gb = Decimal('0.5')
        self.clinic.save()

        res = compute_clinic_storage(self.clinic.id)
        self.assertTrue(res['server']['warning'])
        self.assertIn("1 GB dan kam", res['server']['warning_message'])

    def test_upload_rejects_when_cloud_quota_exceeded(self):
        # Quota 0.001 GB (~1000 KB)
        self.clinic.cloud_storage_quota_gb = Decimal('0.001')
        self.clinic.save()

        # Try to upload 5 MB file
        fake_file = SimpleUploadedFile("big_scan.stl", b"0" * (5 * 1024 * 1024))
        r = self.client.post(
            "/api/patient-media/",
            {
                "patient": self.patient.id,
                "kind": "skan",
                "file": fake_file
            },
            format="multipart",
            HTTP_X_CLINIC_ID=str(self.clinic.id),
            HTTP_X_DENTOS_REQUEST='1'
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("Cloud (Cloupard) xotira limiti", str(r.data))

    def test_patient_media_download_cache_control_and_etag(self):
        fake_content = b"fake-jpeg-content"
        media = PatientMedia.objects.create(
            clinic=self.clinic,
            patient=self.patient,
            kind="foto",
            file=SimpleUploadedFile("pic.jpg", fake_content),
            file_name="pic.jpg",
            file_size=len(fake_content),
            file_type="image/jpeg"
        )

        # First request: gets file and headers
        r = self.client.get(f"/api/patient-media/{media.id}/download/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("max-age=86400", r.headers.get("Cache-Control", ""))
        etag = r.headers.get("ETag")
        self.assertIsNotNone(etag)

        # Second request with If-None-Match -> 304 Not Modified
        r2 = self.client.get(f"/api/patient-media/{media.id}/download/", HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(r2.status_code, 304)

    def test_dossier_and_storage_endpoints(self):
        # Test /api/clinics/{id}/dossier/
        r = self.client.get(f"/api/clinics/{self.clinic.id}/dossier/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("cloud", r.data["storage"])
        self.assertIn("server", r.data["storage"])

        # Test /api/clinics/{id}/storage/
        r2 = self.client.get(f"/api/clinics/{self.clinic.id}/storage/")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data["cloud"]["quota_gb"], 100.0)
        self.assertEqual(r2.data["server"]["quota_gb"], 5.0)
