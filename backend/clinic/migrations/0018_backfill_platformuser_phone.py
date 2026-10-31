"""PlatformUser.phone ni mavjud ma'lumotdan to'ldirish (Telegram/SMS kirish uchun).

Manba (ustuvorlik bo'yicha): bog'langan Employee telefoni (username+clinic yoki F.I.O),
direktor uchun klinika telefoni, texnik uchun texnik telefoni.
"""
import re
from django.db import migrations


def _norm(value):
    return re.sub(r'\D', '', str(value or ''))


def backfill(apps, schema_editor):
    PlatformUser = apps.get_model('clinic', 'PlatformUser')
    Employee = apps.get_model('clinic', 'Employee')
    ClinicTenant = apps.get_model('clinic', 'ClinicTenant')
    DentalTechnician = apps.get_model('clinic', 'DentalTechnician')

    for u in PlatformUser.objects.all():
        if _norm(u.phone):
            continue
        phone = ''

        # 1) Bog'langan xodim (username + clinic), yoki F.I.O bo'yicha
        if u.username:
            emp = Employee.objects.filter(username__iexact=u.username, clinic_id=u.clinic_id).exclude(phone='').first() \
                or Employee.objects.filter(username__iexact=u.username).exclude(phone='').first()
            if not emp and u.full_name:
                emp = Employee.objects.filter(full_name__iexact=u.full_name, clinic_id=u.clinic_id).exclude(phone='').first()
            if emp:
                phone = emp.phone

        # 2) Direktor -> klinika telefoni
        if not phone and u.role == 'director' and u.clinic_id:
            clinic = ClinicTenant.objects.filter(id=u.clinic_id).exclude(phone='').first()
            if clinic:
                phone = clinic.phone

        # 3) Texnik -> texnik telefoni
        if not phone and u.role == 'technician' and u.username:
            tech = DentalTechnician.objects.filter(username=u.username).exclude(phone='').first()
            if tech:
                phone = tech.phone

        if phone:
            u.phone = phone
            u.save(update_fields=['phone'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0017_platformuser_phone'),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
