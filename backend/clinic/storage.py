"""Private medical object storage. Credentials only exist on the server."""
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from storages.backends.s3 import S3Storage
from botocore.config import Config


# Umumiy, backend'dan backend'ga o'zgarmaydigan S3 sozlamalari — bir joyda, takrorlanmaydi.
# (B2 va Cloupard bir xil S3v4 protokolini ishlatadi.)
def _s3_client_config():
    return Config(signature_version='s3v4', connect_timeout=10, read_timeout=90,
                  retries={'max_attempts': 3, 'mode': 'standard'},
                  s3={'addressing_style': 'path'}, request_checksum_calculation='when_required',
                  response_checksum_validation='when_required')


_COMMON_S3_KWARGS = dict(
    default_acl=None, file_overwrite=False, querystring_auth=True, querystring_expire=300,
    max_memory_size=8388608,
)

# B2 SSE-S3 (AES256) ni qo'llaydi.
_B2_OBJECT_PARAMETERS = {'ServerSideEncryption': 'AES256', 'CacheControl': 'private, no-store'}
# Cloupard (S3-mos) SSE-S3 sarlavhasini QO'LLAMAYDI → PutObject/CreateMultipartUpload
# "InternalError" qaytaradi. Shuning uchun ServerSideEncryption YUBORILMAYDI (shifrlash
# Cloupard tomonida — bucket darajasida). CacheControl saqlanadi (fayl keshlanmasin).
_CLOUPARD_OBJECT_PARAMETERS = {'CacheControl': 'private, no-store'}


# OLD: Backblaze B2 S3 — avval yagona standart (yozish) backend edi. ENDI standart emas,
# lekin eski (B2'ga yuklangan) fayllarni O'QISH uchun saqlanadi — migratsiya qilinmagan
# fayllar buzilmasin. MEDIA_STORAGE=b2 bo'lsa yana standart sifatida ishlaydi.
class PrivateB2Storage(S3Storage):
    def __init__(self, **kwargs):
        if not settings.B2_MEDICAL_STORAGE_APPROVED:
            raise ImproperlyConfigured('B2 medical storage approval is required before enabling remote storage.')
        super().__init__(
            access_key=settings.B2_KEY_ID, secret_key=settings.B2_APPLICATION_KEY,
            bucket_name=settings.B2_BUCKET_NAME, endpoint_url=settings.B2_ENDPOINT,
            region_name=settings.B2_REGION, object_parameters=_B2_OBJECT_PARAMETERS,
            client_config=_s3_client_config(), **_COMMON_S3_KWARGS, **kwargs)


# NEW: Cloupard S3 Object Storage — yangi yuklashlar uchun standart backend.
# Endpoint, region, bucket, Access Key va Secret Key FAQAT serverdagi muhit
# o'zgaruvchilaridan olinadi (kodda hardcode yo'q, brauzerga hech narsa chiqmaydi).
class PrivateCloupardStorage(S3Storage):
    def __init__(self, **kwargs):
        if not (settings.CLOUPARD_ENDPOINT and settings.CLOUPARD_ACCESS_KEY and settings.CLOUPARD_SECRET_KEY):
            raise ImproperlyConfigured(
                'Cloupard S3 uchun CLOUPARD_ENDPOINT, CLOUPARD_ACCESS_KEY va '
                'CLOUPARD_SECRET_KEY (.env) to\'ldirilishi shart.')
        super().__init__(
            access_key=settings.CLOUPARD_ACCESS_KEY, secret_key=settings.CLOUPARD_SECRET_KEY,
            bucket_name=settings.CLOUPARD_BUCKET_NAME, endpoint_url=settings.CLOUPARD_ENDPOINT,
            region_name=settings.CLOUPARD_REGION, object_parameters=_CLOUPARD_OBJECT_PARAMETERS,
            client_config=_s3_client_config(), **_COMMON_S3_KWARGS, **kwargs)


def open_media_for_read(media):
    """PatientMedia faylni U SAQLANGAN backend'dan ochadi.

    Eski fayllar (local disk yoki B2) avtomatik Cloupard'ga ko'chmaydi — shuning uchun
    har bir yozuv o'z joyidan o'qiladi:
      - meta['storage_backend'] belgilangan bo'lsa → o'sha backend;
      - belgilanmagan (cutover'dan oldingi) yozuv → settings.MEDIA_STORAGE_LEGACY.
    Joriy (default) backend bilan mos kelsa — mavjud xatti-harakat (media.file.open)."""
    backend = (media.meta or {}).get('storage_backend') or getattr(settings, 'MEDIA_STORAGE_LEGACY', 'local')
    current = getattr(settings, 'MEDIA_STORAGE', 'local')
    if backend == current:
        return media.file.open('rb')
    if backend == 'b2':
        return PrivateB2Storage().open(media.file.name, 'rb')
    if backend == 'cloupard':
        return PrivateCloupardStorage().open(media.file.name, 'rb')
    # local yoki noma'lum → fayl tizimi (MEDIA_ROOT) orqali aniq o'qiymiz.
    from django.core.files.storage import FileSystemStorage
    return FileSystemStorage().open(media.file.name, 'rb')


def media_remote_url(media):
    """Remote (Cloupard/B2) fayl uchun qisqa muddatli presigned URL qaytaradi.

    Katta fayllar (3D skan/DICOM, o'nlab MB) Django proksi orqali oqitilsa sekin va
    timeout bo'ladi. Buning o'rniga ruxsat tekshirilgach, brauzer to'g'ridan-to'g'ri
    Cloupard'dan presigned havola bilan yuklaydi (kalit chiqmaydi — faqat imzo).
    Lokal fayl uchun None (u proksi orqali oqib beriladi)."""
    backend = (media.meta or {}).get('storage_backend') or getattr(settings, 'MEDIA_STORAGE_LEGACY', 'local')
    current = getattr(settings, 'MEDIA_STORAGE', 'local')
    if backend == current and current in ('cloupard', 'b2'):
        return media.file.url  # default storage presigned (querystring_auth=True)
    if backend == 'b2':
        return PrivateB2Storage().url(media.file.name)
    if backend == 'cloupard':
        return PrivateCloupardStorage().url(media.file.name)
    return None  # local → proksi
