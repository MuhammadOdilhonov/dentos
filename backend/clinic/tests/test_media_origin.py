from types import SimpleNamespace
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory
from clinic.serializers import PatientMediaSerializer

class MediaOriginTests(SimpleTestCase):
    def test_download_uses_browser_origin_through_proxy(self):
        request = APIRequestFactory().get('/', HTTP_HOST='127.0.0.1:8000')
        serializer = PatientMediaSerializer(context={'request': request})
        self.assertEqual(serializer.get_file_url(SimpleNamespace(file=True, pk=123)),
                         '/api/patient-media/123/download/')
