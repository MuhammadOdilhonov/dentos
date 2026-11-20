"""Move embedded photo bytes out of chart JSON and into private media storage."""
import base64
import hashlib
import re
from django.core.files.base import ContentFile
from rest_framework.exceptions import ValidationError
from .models import PatientMedia

def persist_images(doc, patient_id, clinic_id):
    if not isinstance(doc, list):
        raise ValidationError({'doc': 'Slaydlar ro‘yxati kerak.'})
    def visit(value):
        if isinstance(value, list):
            return [visit(item) for item in value]
        if isinstance(value, dict):
            return {key: visit(item) for key, item in value.items()}
        if isinstance(value, str) and value.startswith('blob:'):
            raise ValidationError({'doc': 'Vaqtinchalik blob URL o‘rniga faylni yuklang.'})
        if isinstance(value, str) and value.startswith('data:image/'):
            # FORMAT CHEKLOVI YUMSHATILDI: endi har qanday rasm subtipi (png/jpeg/webp/gif/
            # bmp/avif/tiff/heic/heif/svg...) qabul qilinadi. Frontend rasmlarni canvas orqali
            # JPEG'ga qayta kodlaydi, lekin to'g'ridan-to'g'ri boshqa format yuborilsa ham saqlanadi.
            match = re.fullmatch(r'data:image/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)', value)
            if not match:
                raise ValidationError({'doc': 'Rasm formati noto‘g‘ri.'})
            subtype = match[1].lower()
            ext = {
                'jpeg': 'jpg', 'jpg': 'jpg', 'png': 'png', 'webp': 'webp', 'gif': 'gif',
                'bmp': 'bmp', 'avif': 'avif', 'tiff': 'tiff', 'x-tiff': 'tiff',
                'heic': 'heic', 'heif': 'heif', 'svg+xml': 'svg',
            }.get(subtype, 'img')
            try:
                raw = base64.b64decode(match[2], validate=True)
            except ValueError:
                raise ValidationError({'doc': 'Buzilgan rasm.'})
            if len(raw) > 30 * 1024 * 1024:
                raise ValidationError({'doc': 'Bitta foto 30 MB dan oshmasin.'})
            digest = hashlib.sha256(raw).hexdigest()
            media = PatientMedia.objects.filter(patient_id=patient_id, clinic_id=clinic_id,
                                                 kind='foto', meta__sha256=digest).first()
            if not media:
                from django.db import transaction
                from django.db.models import Sum
                from .models import ClinicTenant
                with transaction.atomic():
                    clinic = ClinicTenant.objects.select_for_update().get(pk=clinic_id)
                    total = PatientMedia.objects.filter(clinic_id=clinic_id).aggregate(n=Sum('file_size'))['n'] or 0
                    cloud_quota = float(clinic.cloud_storage_quota_gb if clinic.cloud_storage_quota_gb is not None else (clinic.storage_quota_gb if clinic.storage_quota_gb is not None else 1000.0))
                    if total + len(raw) > cloud_quota * 1024 ** 3:
                        raise ValidationError({'doc': f"Klinika Cloud (Cloupard) xotira limiti to‘ldi ({cloud_quota} GB)."})
                    media = PatientMedia.objects.create(patient_id=patient_id, clinic_id=clinic_id, kind='foto',
                        file=ContentFile(raw, name=f'photo.{ext}'), file_name=f'photo.{ext}',
                        file_size=len(raw), file_type=f'image/{subtype}', meta={'sha256': digest})
            return f'/api/patient-media/{media.pk}/download/'
        # A chart may only reference files belonging to its patient.
        if isinstance(value, str) and '/api/patient-media/' in value:
            match = re.search(r'/api/patient-media/(\d+)/download/', value)
            if not match or not PatientMedia.objects.filter(pk=match[1], patient_id=patient_id, clinic_id=clinic_id).exists():
                raise ValidationError({'doc': 'Boshqa bemor fayliga ruxsat yo‘q.'})
            return f'/api/patient-media/{match[1]}/download/'
        return value
    return visit(doc)
