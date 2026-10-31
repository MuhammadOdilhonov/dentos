"""Private medical object storage. Credentials only exist on the server."""
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from storages.backends.s3 import S3Storage
from botocore.config import Config

class PrivateB2Storage(S3Storage):
    def __init__(self, **kwargs):
        if not settings.B2_MEDICAL_STORAGE_APPROVED:
            raise ImproperlyConfigured('B2 medical storage approval is required before enabling remote storage.')
        super().__init__(
            access_key=settings.B2_KEY_ID, secret_key=settings.B2_APPLICATION_KEY,
            bucket_name=settings.B2_BUCKET_NAME, endpoint_url=settings.B2_ENDPOINT,
            region_name=settings.B2_REGION, default_acl=None, file_overwrite=False,
            querystring_auth=True, querystring_expire=300, max_memory_size=8388608,
            object_parameters={'ServerSideEncryption': 'AES256', 'CacheControl': 'private, no-store'},
            client_config=Config(signature_version='s3v4', connect_timeout=10, read_timeout=90,
                                 retries={'max_attempts': 3, 'mode': 'standard'},
                                 s3={'addressing_style': 'path'}, request_checksum_calculation='when_required',
                                 response_checksum_validation='when_required'),
            **kwargs)
