"""Durable patient chart sections used by the existing UI. Optimistic concurrency."""
import time
from django.db import transaction, OperationalError
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Patient, PatientRecord

SECTIONS = {'notes', 'payments', 'treatments', 'naryads', 'checkout', 'xrays', 'scan',
            'comms', 'tgchat', 'plans', 'cancelled_treatments', 'naryad_log'}

# Natija turlari (qaytarilgan tuple'ning birinchi elementi).
_OK, _CONFLICT = 'ok', 'conflict'


def _write_section(patient, section, value, expected_version, attempts=8):
    """Bitta bo'limni yozadi. SQLite lokalda bir vaqtda ko'p yozuvda vaqtincha
    "database is locked" (OperationalError) berishi mumkin (WAL + busy_timeout
    ko'pini tutadi, lekin dev runserver + WAL checkpoint ostida ba'zan o'tib
    ketadi). Shu sabab lock bo'lsa qisqa kutib QAYTA URINAMIZ — foydalanuvchiga
    500 umuman yetib bormaydi. Productionda (PostgreSQL) bu yo'l baribir ishlaydi."""
    last = None
    for i in range(attempts):
        try:
            with transaction.atomic():
                # Lock the parent as well to serialize the first insert on PostgreSQL.
                Patient.objects.select_for_update().get(pk=patient.pk)
                row = PatientRecord.objects.filter(patient=patient, section=section).first()
                current = row.version if row else 0
                if expected_version != current:
                    return (_CONFLICT, current)
                if section == 'naryads':
                    from .naryads import snapshot_naryads
                    value = snapshot_naryads(patient, value, row.value if row else [])
                elif section == 'naryad_log':
                    from .naryads import snapshot_log
                    value = snapshot_log(patient, value, row.value if row else [])
                if not row:
                    row = PatientRecord(patient=patient, section=section)
                row.value, row.version = value, current + 1
                row.save()
                return (_OK, row)
        except OperationalError as exc:
            if 'lock' not in str(exc).lower():
                raise
            last = exc
            time.sleep(0.12 * (i + 1))  # ortib boruvchi kutish (0.12s..~1s)
    raise last


@api_view(['GET', 'PUT'])
def patient_record(request, patient_id):
    from .views import get_clinic_id
    cid = get_clinic_id(request)
    patient = get_object_or_404(Patient, pk=patient_id, clinic_id=cid)
    if request.method == 'GET':
        rows = PatientRecord.objects.filter(patient=patient)
        return Response({row.section: {'value': row.value, 'version': row.version} for row in rows})
    section = request.data.get('section')
    if section not in SECTIONS:
        return Response({'detail': 'Noma’lum bo‘lim.'}, status=400)
    value = request.data.get('value')
    if not isinstance(value, (list, dict)):
        return Response({'detail': 'JSON ro‘yxat yoki obyekt kerak.'}, status=400)
    try:
        kind, payload = _write_section(patient, section, value, request.data.get('version'))
    except OperationalError:
        # Qayta urinishlar tugaganda ham baza band (SQLite lokal, kam uchraydi). Xom 500
        # (stack-trace) o'rniga BOSHQARILADIGAN 503 qaytaramiz — frontend buni "saqlanmadi,
        # qayta urinib ko'ring" deb ko'rsatadi; ma'lumot SAQLANDI deb YOLG'ON ko'rsatilmaydi.
        return Response(
            {'detail': 'Baza hozir band — o‘zgarish saqlanmadi. Bir lahzadan so‘ng qayta urinib ko‘ring.'},
            status=503,
        )
    if kind == _CONFLICT:
        return Response({'detail': 'Boshqa xodim o‘zgartirdi. Sahifani yangilang.', 'version': payload}, status=409)
    return Response({'value': payload.value, 'version': payload.version})
