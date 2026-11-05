from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from clinic.models import ClinicTenant, PlatformUser, ServiceCategory, ServiceCatalogItem

# Yozish so'rovlari maxsus sarlavha bilan kelishi shart (AccountMiddleware CSRF himoyasi).
WRITE = {'HTTP_X_DENTOS_REQUEST': '1'}


@override_settings(ENFORCE_API_AUTH=True)
class ServiceCategoryTests(TestCase):
    def setUp(self):
        ClinicTenant.objects.create(name='Demo')
        self.clinic = ClinicTenant.objects.create(name='A', status='active')
        self.other = ClinicTenant.objects.create(name='B', status='active')
        PlatformUser.objects.create(clinic=self.clinic, username='manager', password='test123', role='director')
        PlatformUser.objects.create(clinic=self.other, username='manager_b', password='test123', role='director')

    def login(self, username='manager'):
        client = APIClient()
        r = client.post('/api/auth/login/', {'username': username, 'password': 'test123'},
                        format='json', HTTP_X_DENTOS_REQUEST='1')
        self.assertEqual(r.status_code, 200)
        return client

    def test_create_category_scoped_to_clinic(self):
        client = self.login()
        r = client.post('/api/service-categories/', {'name': 'Ортопедия', 'show_in_calendar': True}, format='json', **WRITE)
        self.assertEqual(r.status_code, 201, r.content)
        cat = ServiceCategory.objects.get(name='Ортопедия')
        self.assertEqual(cat.clinic_id, self.clinic.id)
        self.assertTrue(cat.show_in_calendar)

    def test_category_ref_syncs_legacy_string(self):
        client = self.login()
        cat = ServiceCategory.objects.create(clinic=self.clinic, name='Терапия')
        r = client.post('/api/service-catalog/', {
            'name': 'Пломба', 'category_ref': cat.id, 'base_price': 300000,
        }, format='json', **WRITE)
        self.assertEqual(r.status_code, 201, r.content)
        item = ServiceCatalogItem.objects.get(name='Пломба')
        self.assertEqual(item.category_ref_id, cat.id)
        # eski matnli `category` nom bilan sinxron (kassa/hisobot uchun)
        self.assertEqual(item.category, 'Терапия')

    def test_delete_category_cascades_items(self):
        client = self.login()
        cat = ServiceCategory.objects.create(clinic=self.clinic, name='Хирургия')
        other = ServiceCategory.objects.create(clinic=self.clinic, name='Терапия')
        linked = ServiceCatalogItem.objects.create(clinic=self.clinic, name='Удаление', category='Хирургия', category_ref=cat, base_price=200000)
        legacy = ServiceCatalogItem.objects.create(clinic=self.clinic, name='Шов', category='Хирургия', base_price=100000)  # ref yo'q, matn mos
        keep = ServiceCatalogItem.objects.create(clinic=self.clinic, name='Пломба', category='Терапия', category_ref=other, base_price=300000)
        r = client.delete(f'/api/service-categories/{cat.id}/', **WRITE)
        self.assertEqual(r.status_code, 204)
        # Kategoriya bilan birga ichidagi naryadlar ham o'chadi
        self.assertFalse(ServiceCatalogItem.objects.filter(id=linked.id).exists())
        self.assertFalse(ServiceCatalogItem.objects.filter(id=legacy.id).exists())
        # Boshqa kategoriya naryadi tegilmaydi
        self.assertTrue(ServiceCatalogItem.objects.filter(id=keep.id).exists())

    def test_tenant_isolation(self):
        ServiceCategory.objects.create(clinic=self.clinic, name='A-cat')
        ServiceCategory.objects.create(clinic=self.other, name='B-cat')
        client = self.login('manager')
        names = {c['name'] for c in client.get('/api/service-categories/').json()}
        self.assertIn('A-cat', names)
        self.assertNotIn('B-cat', names)

    def test_bulk_import_creates_and_links_categories(self):
        client = self.login()
        r = client.post('/api/service-catalog/bulk_import/', {'items': [
            {'name': 'Чистка', 'category': 'Гигиена', 'base_price': 100000},
            {'name': 'Скейлинг', 'category': 'Гигиена', 'base_price': 150000},
        ]}, format='json', **WRITE)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['created'], 2)
        # bitta kategoriya yaratilib, ikkala naryad shunga ulanadi
        cats = ServiceCategory.objects.filter(clinic=self.clinic, name='Гигиена')
        self.assertEqual(cats.count(), 1)
        for it in ServiceCatalogItem.objects.filter(clinic=self.clinic):
            self.assertEqual(it.category_ref_id, cats.first().id)
