"""Employee-scoped, read-only journal. Never recalculate historical commissions."""
from rest_framework.exceptions import PermissionDenied
from .models import Employee, PatientRecord
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from rest_framework.exceptions import ValidationError

SNAPSHOT_FIELDS = ('doctor_id', 'doctor', 'percent', 'doctor_share', 'clinic_share', 'unitPrice', 'quantity', 'price', 'created_at')


def snapshot_naryads(patient, value, previous):
    """Validate new lines and calculate their commission from the scoped employee."""
    if not isinstance(value, list):
        raise ValidationError('Naryadlar ro‘yxat bo‘lishi kerak.')
    existing = {str(row.get('id')): row for row in (previous or []) if isinstance(row, dict)}
    result = []
    for row in value:
        if not isinstance(row, dict):
            raise ValidationError('Naryad qatori noto‘g‘ri.')
        row = dict(row)
        old = existing.get(str(row.get('id')))
        if old is not None:
            # Historical rows (including missing legacy fields) never inherit today's rate.
            for field in SNAPSHOT_FIELDS:
                if field in old:
                    row[field] = old[field]
                else:
                    row.pop(field, None)
        elif row.get('doctor_id') is not None:
            try:
                doctor = Employee.objects.get(pk=row['doctor_id'], clinic=patient.clinic, role='doctor', is_active=True)
                price = Decimal(str(row.get('unitPrice')))
                quantity = Decimal(str(row.get('quantity')))
                rate = doctor.commission_rate
                if not all(v.is_finite() for v in (price, quantity, rate)) or price < 0 or quantity < 1 or quantity != quantity.to_integral_value() or not 0 <= rate <= 100:
                    raise ValueError()
                total = (price * quantity).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
                share = (total * rate / 100).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
            except (Employee.DoesNotExist, ValueError, TypeError, InvalidOperation):
                raise ValidationError('Shifokor, narx, son yoki foiz noto‘g‘ri.')
            row.update(doctor=doctor.full_name, percent=float(rate), price=float(total),
                       doctor_share=float(share), clinic_share=float(total - share))
        result.append(row)
    return result


def snapshot_log(patient, value, previous):
    if not isinstance(value, list):
        raise ValidationError('Naryad jurnali ro‘yxat bo‘lishi kerak.')
    sources = {str(row.get('naryad_id', row.get('id'))): row for row in (previous or []) if isinstance(row, dict)}
    current = PatientRecord.objects.filter(patient=patient, section='naryads').first()
    if current and isinstance(current.value, list):
        sources.update({str(row.get('id')): row for row in current.value if isinstance(row, dict)})
    result = []
    for row in value:
        if not isinstance(row, dict):
            raise ValidationError('Jurnal qatori noto‘g‘ri.')
        row = dict(row)
        source = sources.get(str(row.get('naryad_id', row.get('id'))))
        if source is None and row.get('doctor_id') is not None:
            source = snapshot_naryads(patient, [row], [])[0]
        if source:
            for field in SNAPSHOT_FIELDS:
                if field in source:
                    row[field] = source[field]
                else:
                    row.pop(field, None)
        result.append(row)
    return result


def employee_journal(request, employee):
    principal = request.user
    if getattr(principal, 'role', None) not in ('director', 'deputy_director', 'admin', 'superadmin'):
        username = getattr(getattr(principal, 'account', None), 'username', '')
        matches = Employee.objects.filter(clinic=employee.clinic, username__iexact=username) if username else Employee.objects.none()
        if matches.count() != 1 or matches.first().pk != employee.pk:
            raise PermissionDenied('Faqat o‘zingizning naryad jurnalingizni ko‘ra olasiz.')

    # Legacy names are accepted only when unambiguous within this clinic.
    unique_name = Employee.objects.filter(clinic=employee.clinic, full_name=employee.full_name).count() == 1
    result = []
    records = PatientRecord.objects.filter(patient__clinic=employee.clinic, section__in=['naryads', 'naryad_log']).select_related('patient').order_by('patient_id', 'section')
    seen = set()
    for record in records:
        if not isinstance(record.value, list):
            continue
        for item in record.value:
            if not isinstance(item, dict):
                continue
            owner = item.get('doctor_id')
            if str(owner) != str(employee.pk) and not (owner is None and unique_name and item.get('doctor') == employee.full_name):
                continue
            key = (record.patient_id, str(item.get('naryad_id', item.get('id'))), item.get('action', 'added'))
            if key in seen:
                continue
            seen.add(key)
            result.append({**item, 'patient_id': record.patient_id,
                           'patient_name': record.patient.full_name, 'doctor_id': employee.pk,
                           'action': item.get('action', 'added')})
    return sorted(result, key=lambda row: str(row.get('created_at') or ''), reverse=True)
