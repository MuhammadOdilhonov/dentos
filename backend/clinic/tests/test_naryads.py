from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from clinic.models import ClinicTenant, PlatformUser, Employee, Patient, PatientRecord
from clinic.naryads import snapshot_naryads, snapshot_log
from clinic.serializers import EmployeeSerializer


@override_settings(ENFORCE_API_AUTH=True)
class NaryadJournalTests(TestCase):
    def setUp(self):
        ClinicTenant.objects.create(name='Demo')
        self.clinic = ClinicTenant.objects.create(name='A', status='active')
        self.other = ClinicTenant.objects.create(name='B', status='active')
        self.employee = Employee.objects.create(clinic=self.clinic, username='doctor_a', full_name='Doctor A', commission_rate=0)
        self.colleague = Employee.objects.create(clinic=self.clinic, username='doctor_b', full_name='Doctor B')
        self.foreign = Employee.objects.create(clinic=self.other, full_name='Other clinic')
        self.patient = Patient.objects.create(clinic=self.clinic, full_name='Patient A', phone='123')
        PlatformUser.objects.create(clinic=self.clinic, username='doctor_a', password='test123', role='doctor')
        PlatformUser.objects.create(clinic=self.clinic, username='manager', password='test123', role='director')
        self.row = {'id': 123, 'doctor_id': self.employee.id, 'doctor': 'Doctor A', 'title': 'Service', 'unitPrice': 100000, 'quantity': 2, 'percent': 99}

    def login(self, username='doctor_a'):
        client = APIClient()
        response = client.post('/api/auth/login/', {'username': username, 'password': 'test123'}, format='json', HTTP_X_DENTOS_REQUEST='1')
        self.assertEqual(response.status_code, 200)
        return client

    def test_server_uses_doctor_zero_and_preserves_history(self):
        rows = snapshot_naryads(self.patient, [self.row], [])
        self.assertEqual(rows[0]['percent'], 0)
        self.assertEqual(rows[0]['doctor_share'], 0)
        self.assertEqual(rows[0]['clinic_share'], 200000)
        self.employee.commission_rate = 50
        self.employee.save()
        changed = {**rows[0], 'percent': 50, 'price': 1}
        kept = snapshot_naryads(self.patient, [changed], rows)[0]
        self.assertEqual(kept['percent'], 0)
        self.assertEqual(kept['price'], 200000)

    def test_foreign_employee_and_bad_price_rejected(self):
        for change in [{'doctor_id': self.foreign.id}, {'unitPrice': -1}, {'quantity': 1.5}, {'unitPrice': 'NaN'}]:
            with self.assertRaises(ValidationError):
                snapshot_naryads(self.patient, [{**self.row, **change}], [])

    def test_log_and_cancellation_reuse_stored_commission(self):
        rows = snapshot_naryads(self.patient, [self.row], [])
        record = PatientRecord.objects.create(patient=self.patient, section='naryads', value=rows)
        self.employee.commission_rate = 80
        self.employee.save()
        log = snapshot_log(self.patient, [{**self.row, 'percent': 80, 'action': 'added'}], [])
        self.assertEqual(log[0]['percent'], 0)
        record.delete()
        removed = snapshot_log(self.patient, [{**self.row, 'id': 999, 'naryad_id': 123, 'action': 'removed'}], log)
        self.assertEqual(removed[0]['percent'], 0)
        self.assertEqual(removed[0]['doctor_share'], 0)

    def test_own_journal_only_and_read_only(self):
        PatientRecord.objects.create(patient=self.patient, section='naryads', value=[self.row, {**self.row, 'id': 124, 'doctor_id': self.colleague.id}])
        client = self.login()
        url = f'/api/employees/{self.employee.id}/naryad-journal/'
        response = client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(client.get(f'/api/employees/{self.colleague.id}/naryad-journal/').status_code, 403)
        self.assertEqual(client.get(f'/api/employees/{self.foreign.id}/naryad-journal/').status_code, 404)
        self.assertEqual(client.post(url, {}, format='json', HTTP_X_DENTOS_REQUEST='1').status_code, 403)
        self.assertEqual(self.login('manager').get(f'/api/employees/{self.colleague.id}/naryad-journal/').status_code, 200)

    def test_duplicate_names_never_expose_legacy_rows(self):
        Employee.objects.create(clinic=self.clinic, full_name=self.employee.full_name)
        legacy = {'id': 1, 'doctor': self.employee.full_name, 'price': 100}
        PatientRecord.objects.create(patient=self.patient, section='naryads', value=[legacy])
        response = self.login().get(f'/api/employees/{self.employee.id}/naryad-journal/')
        self.assertEqual(response.data, [])

    def test_employee_commission_bounds(self):
        for rate in [-1, 101]:
            serializer = EmployeeSerializer(self.employee, data={'commission_rate': rate}, partial=True)
            self.assertFalse(serializer.is_valid())
        serializer = EmployeeSerializer(self.employee, data={'commission_rate': 0}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
