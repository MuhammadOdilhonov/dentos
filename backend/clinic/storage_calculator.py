"""Storage calculation engine for Cloud (Cloupard S3) and Main Server data.

Strictly scopes all calculations to the given clinic_id.
Calculates exact bytes, MB, GB, quotas, free space, and warning thresholds:
- Cloud storage (Cloupard S3): Patient photos/videos, X-rays/CT, 3D Scans.
  Warning when remaining free space <= 10 GB.
- Server storage (Main server DB & local files):
  Text records, reports, doctor photos/avatars, branches, appointments,
  financial transactions, tasks, warehouse, and system messages.
  Warning when remaining free space <= 1 GB.
"""

import json
from decimal import Decimal
from django.db.models import Sum, Count
from .models import (
    ClinicTenant, PatientMedia, Patient, Appointment, FinancialTransaction,
    ClinicTask, WarehouseItem, DentalLabOrder, Employee, Branch, PatientRecord,
    PhotoProtocol, Workplace, PlatformUser, ClinicMonthlyPlan,
    ReceptionContact, ReceptionMessage, ReceptionUpdate, ReceptionDelivery,
    ServiceCategory, ServiceCatalogItem, DoctorNaryadRate, UserPreference
)


def _safe_str(val):
    if val is None:
        return ''
    if isinstance(val, (dict, list)):
        try:
            return json.dumps(val, ensure_ascii=False)
        except Exception:
            return str(val)
    return str(val)


def _calc_qs_bytes(qs, exclude_keys=None, overhead=128):
    """Calculate exact UTF-8 byte length of all fields in queryset values + DB overhead."""
    total = 0
    excludes = set(exclude_keys or [])
    for row in qs.values():
        row_len = sum(len(_safe_str(v).encode('utf-8')) for k, v in row.items() if k not in excludes)
        total += row_len + overhead
    return total


def compute_clinic_storage(clinic_id):
    """Calculate exact Cloud and Server storage usage and quotas for a clinic."""
    clinic = ClinicTenant.objects.filter(id=clinic_id).first()
    if not clinic:
        return None

    # ──────────────────────────────────────────────────────────────────────────
    # 1. CLOUD STORAGE (Cloupard S3): Foto, Rentgen/KT, 3D Skan
    # ──────────────────────────────────────────────────────────────────────────
    media_qs = PatientMedia.objects.filter(clinic_id=clinic_id)
    
    # Foto & video
    foto_agg = media_qs.filter(kind='foto').aggregate(bytes=Sum('file_size'), count=Count('id'))
    foto_bytes = foto_agg['bytes'] or 0
    foto_count = foto_agg['count'] or 0

    # Rentgen / KT
    xray_agg = media_qs.filter(kind='rentgen').aggregate(bytes=Sum('file_size'), count=Count('id'))
    xray_bytes = xray_agg['bytes'] or 0
    xray_count = xray_agg['count'] or 0

    # 3D Skan
    scan_agg = media_qs.filter(kind='skan').aggregate(bytes=Sum('file_size'), count=Count('id'))
    scan_bytes = scan_agg['bytes'] or 0
    scan_count = scan_agg['count'] or 0

    cloud_used_bytes = foto_bytes + xray_bytes + scan_bytes
    cloud_used_mb = round(cloud_used_bytes / (1024 ** 2), 2)
    cloud_used_gb = round(cloud_used_bytes / (1024 ** 3), 4)

    cloud_quota_gb = float(clinic.cloud_storage_quota_gb) if clinic.cloud_storage_quota_gb is not None else float(clinic.storage_quota_gb or 1000.0)
    cloud_free_gb = max(0.0, round(cloud_quota_gb - cloud_used_gb, 4))
    cloud_percent = min(100.0, round((cloud_used_gb / (cloud_quota_gb or 1.0)) * 100, 2))

    # Cloud warning: <= 10 GB remaining (or >= 90% full)
    cloud_warning = cloud_free_gb <= 10.0 or (cloud_percent >= 90.0 and cloud_used_gb > 0)
    cloud_limit_exceeded = cloud_used_bytes >= (cloud_quota_gb * (1024 ** 3))

    cloud_warning_msg = ''
    if cloud_limit_exceeded:
        cloud_warning_msg = f"Cloud (Cloupard) xotira limiti to'ldi ({cloud_quota_gb} GB)!"
    elif cloud_warning:
        cloud_warning_msg = f"Diqqat: Cloud (Cloupard) xotirada {round(cloud_free_gb, 1)} GB joy qoldi (10 GB dan kam)!"

    # ──────────────────────────────────────────────────────────────────────────
    # 2. SERVER STORAGE (Asosiy Server): Barcha matnlar, shifokorlar rasmlari,
    # filiallar, hisobotlar, va h.k.
    # ──────────────────────────────────────────────────────────────────────────
    
    # 2.1 Shifokorlar va xodimlar rasmlari (avatarlar) + klinika logotipi
    emps_qs = Employee.objects.filter(clinic_id=clinic_id)
    avatar_bytes = 0
    avatar_count = 0
    for row in emps_qs.values('avatar'):
        av = row.get('avatar') or ''
        if av:
            avatar_count += 1
            avatar_bytes += len(av.encode('utf-8'))
    logo_bytes = len((clinic.logo or '').encode('utf-8'))
    doctor_photos_bytes = avatar_bytes + logo_bytes

    # 2.2 Bemorlar va barcha tibbiy yozuvlar (matn)
    pats_qs = Patient.objects.filter(clinic_id=clinic_id)
    patient_bytes = _calc_qs_bytes(pats_qs, overhead=192)

    patient_recs_qs = PatientRecord.objects.filter(patient__clinic_id=clinic_id)
    rec_bytes = _calc_qs_bytes(patient_recs_qs, overhead=256)

    protocols_qs = PhotoProtocol.objects.filter(clinic_id=clinic_id)
    protocol_bytes = _calc_qs_bytes(protocols_qs, overhead=128)

    patients_records_bytes = patient_bytes + rec_bytes + protocol_bytes
    patients_records_count = pats_qs.count() + patient_recs_qs.count()

    # 2.3 Moliya, hisobotlar va rejalar
    txs_qs = FinancialTransaction.objects.filter(clinic_id=clinic_id)
    tx_bytes = _calc_qs_bytes(txs_qs, overhead=160)

    plans_qs = ClinicMonthlyPlan.objects.filter(clinic_id=clinic_id)
    plan_bytes = _calc_qs_bytes(plans_qs, overhead=96)
    finance_reports_bytes = tx_bytes + plan_bytes
    finance_reports_count = txs_qs.count() + plans_qs.count()

    # 2.4 Filiallar va xodimlar ma'lumotlari (matn, avatardan tashqari)
    branches_qs = Branch.objects.filter(clinic_id=clinic_id)
    branch_bytes = _calc_qs_bytes(branches_qs, overhead=128)

    emp_text_bytes = _calc_qs_bytes(emps_qs, exclude_keys=['avatar'], overhead=256)

    users_qs = PlatformUser.objects.filter(clinic_id=clinic_id)
    user_bytes = _calc_qs_bytes(users_qs, overhead=128)

    workplaces_qs = Workplace.objects.filter(clinic_id=clinic_id)
    wp_bytes = _calc_qs_bytes(workplaces_qs, overhead=96)

    branches_staff_bytes = branch_bytes + emp_text_bytes + user_bytes + wp_bytes
    branches_staff_count = branches_qs.count() + emps_qs.count() + users_qs.count()

    # 2.5 Telegram xabarlari, qabullar, vazifalar, omborxona, laboratoriya va katalog
    apts_qs = Appointment.objects.filter(clinic_id=clinic_id)
    apt_bytes = _calc_qs_bytes(apts_qs, overhead=160)

    tasks_qs = ClinicTask.objects.filter(clinic_id=clinic_id)
    task_bytes = _calc_qs_bytes(tasks_qs, overhead=128)

    wh_items_qs = WarehouseItem.objects.filter(clinic_id=clinic_id)
    wh_bytes = _calc_qs_bytes(wh_items_qs, overhead=128)

    labs_qs = DentalLabOrder.objects.filter(clinic_id=clinic_id)
    lab_bytes = _calc_qs_bytes(labs_qs, overhead=192)

    msgs_qs = ReceptionMessage.objects.filter(contact__clinic_id=clinic_id)
    msg_bytes = _calc_qs_bytes(msgs_qs, overhead=96)

    contacts_qs = ReceptionContact.objects.filter(clinic_id=clinic_id)
    contact_bytes = _calc_qs_bytes(contacts_qs, overhead=128)

    catalog_items_qs = ServiceCatalogItem.objects.filter(clinic_id=clinic_id)
    cat_bytes = _calc_qs_bytes(catalog_items_qs, overhead=96)

    other_text_bytes = apt_bytes + task_bytes + wh_bytes + lab_bytes + msg_bytes + contact_bytes + cat_bytes
    other_text_count = apts_qs.count() + tasks_qs.count() + wh_items_qs.count() + labs_qs.count() + msgs_qs.count() + catalog_items_qs.count()

    total_server_bytes = doctor_photos_bytes + patients_records_bytes + finance_reports_bytes + branches_staff_bytes + other_text_bytes
    server_used_mb = round(total_server_bytes / (1024 ** 2), 2)
    server_used_gb = round(total_server_bytes / (1024 ** 3), 6)

    server_quota_gb = float(clinic.server_storage_quota_gb) if clinic.server_storage_quota_gb is not None else 10.0
    server_free_gb = max(0.0, round(server_quota_gb - server_used_gb, 4))
    server_free_mb = max(0.0, round((server_quota_gb * 1024) - server_used_mb, 2))
    server_percent = min(100.0, round((server_used_gb / (server_quota_gb or 1.0)) * 100, 2))

    # Server warning: <= 1.0 GB remaining (or >= 90% full)
    server_warning = server_free_gb <= 1.0 or (server_percent >= 90.0 and server_used_gb > 0)
    server_limit_exceeded = total_server_bytes >= (server_quota_gb * (1024 ** 3))

    server_warning_msg = ''
    if server_limit_exceeded:
        server_warning_msg = f"Server xotira limiti to'ldi ({server_quota_gb} GB)!"
    elif server_warning:
        server_warning_msg = f"Diqqat: Server xotirasida {round(server_free_gb, 2)} GB ({round(server_free_mb, 1)} MB) joy qoldi (1 GB dan kam)!"

    return {
        'clinic_id': clinic.id,
        'clinic_name': clinic.name,
        'cloud': {
            'storage_name': 'Cloupard S3 (Cloud Object Storage)',
            'quota_gb': cloud_quota_gb,
            'used_bytes': cloud_used_bytes,
            'used_mb': cloud_used_mb,
            'used_gb': cloud_used_gb,
            'free_gb': cloud_free_gb,
            'usage_percent': cloud_percent,
            'warning': cloud_warning,
            'warning_threshold_gb': 10.0,
            'warning_message': cloud_warning_msg,
            'limit_exceeded': cloud_limit_exceeded,
            'breakdown': {
                'foto': {
                    'label': 'Fotolar va Prezentatsiya videolari',
                    'bytes': foto_bytes,
                    'mb': round(foto_bytes / (1024 ** 2), 2),
                    'gb': round(foto_bytes / (1024 ** 3), 4),
                    'count': foto_count,
                },
                'rentgen': {
                    'label': 'Rentgen va 3D KT / CBCT',
                    'bytes': xray_bytes,
                    'mb': round(xray_bytes / (1024 ** 2), 2),
                    'gb': round(xray_bytes / (1024 ** 3), 4),
                    'count': xray_count,
                },
                'skan': {
                    'label': '3D Skan (STL / PLY / OBJ)',
                    'bytes': scan_bytes,
                    'mb': round(scan_bytes / (1024 ** 2), 2),
                    'gb': round(scan_bytes / (1024 ** 3), 4),
                    'count': scan_count,
                },
            }
        },
        'server': {
            'storage_name': 'Asosiy Server (Database & Local Text/Media)',
            'quota_gb': server_quota_gb,
            'used_bytes': total_server_bytes,
            'used_mb': server_used_mb,
            'used_gb': server_used_gb,
            'free_gb': server_free_gb,
            'free_mb': server_free_mb,
            'usage_percent': server_percent,
            'warning': server_warning,
            'warning_threshold_gb': 1.0,
            'warning_message': server_warning_msg,
            'limit_exceeded': server_limit_exceeded,
            'breakdown': {
                'doctor_avatars': {
                    'label': 'Shifokorlar va xodimlar suratlari (avatarlar) & Logo',
                    'bytes': doctor_photos_bytes,
                    'mb': round(doctor_photos_bytes / (1024 ** 2), 2),
                    'gb': round(doctor_photos_bytes / (1024 ** 3), 4),
                    'count': avatar_count,
                },
                'patients_records': {
                    'label': 'Bemorlar va tibbiy yozuvlar (matn & anamnez)',
                    'bytes': patients_records_bytes,
                    'mb': round(patients_records_bytes / (1024 ** 2), 2),
                    'gb': round(patients_records_bytes / (1024 ** 3), 4),
                    'count': patients_records_count,
                },
                'finance_reports': {
                    'label': 'Moliya, to‘lovlar va hisobotlar',
                    'bytes': finance_reports_bytes,
                    'mb': round(finance_reports_bytes / (1024 ** 2), 2),
                    'gb': round(finance_reports_bytes / (1024 ** 3), 4),
                    'count': finance_reports_count,
                },
                'branches_staff': {
                    'label': 'Filiallar, xodimlar va foydalanuvchilar',
                    'bytes': branches_staff_bytes,
                    'mb': round(branches_staff_bytes / (1024 ** 2), 2),
                    'gb': round(branches_staff_bytes / (1024 ** 3), 4),
                    'count': branches_staff_count,
                },
                'other_system_text': {
                    'label': 'Telegram xabarlar, qabullar, ombor va laboratoriya',
                    'bytes': other_text_bytes,
                    'mb': round(other_text_bytes / (1024 ** 2), 2),
                    'gb': round(other_text_bytes / (1024 ** 3), 4),
                    'count': other_text_count,
                },
            }
        }
    }
