"""Demo klinika (clinic 1) uchun joriy HAFTA jadvalini seed qiladi.

Bugunga NISBATAN (-3 .. +3 kun) zapislar yaratadi — turli status va narxlar bilan,
+ completed/debt lar uchun moliya (FinancialTransaction). Bugun markazda bo'ladi:
chapga (o'tgan kunlar) va o'ngga (kelgusi) surilib zapislar ko'rinadi.

Idempotent + deterministik (random.seed) — har kuni qayta chaqirilsa dates bugunga suriladi.
Demo'da yangi qo'shib bo'lmaydi (BlockDemoWrites) — bu faqat ko'rsatish uchun.
"""
from datetime import timedelta, datetime, time as dtime
from django.conf import settings
from django.utils import timezone
import random

DEMO_CLINIC_ID = 1

SERVICES = [
    ('Консультация + 3D рентген', 300000),
    ('Лечение кариеса + световая пломба', 650000),
    ('Эндодонтия (1 канал)', 800000),
    ('Профгигиена полости рта (GBT)', 1500000),
    ('Циркониевая коронка Prettau', 2400000),
    ('Имплант Osstem TS-III', 4200000),
    ('Удаление зуба', 450000),
    ('Отбеливание Beyond', 2500000),
    ('Винир E.max', 3000000),
    ('Металлокерамическая коронка', 1200000),
]
PAST_STATUSES = ['completed', 'completed', 'completed', 'no_show', 'cancelled', 'debt']
TODAY_STATUSES = ['in_progress', 'arrived', 'confirmed', 'waiting_bill', 'completed', 'confirmed']
FUTURE_STATUSES = ['confirmed', 'unconfirmed', 'reserved', 'confirmed', 'new']
COLORS = {
    'completed': '#64748B', 'no_show': '#EF4444', 'cancelled': '#9CA3AF', 'debt': '#F59E0B',
    'in_progress': '#3B82F6', 'arrived': '#10B981', 'confirmed': '#8B5CF6', 'waiting_bill': '#F97316',
    'unconfirmed': '#F59E0B', 'reserved': '#06B6D4', 'new': '#22C55E',
}


def seed_demo_week():
    from .models import ClinicTenant, Employee, Patient, Appointment, FinancialTransaction, Branch
    clinic = ClinicTenant.objects.filter(id=DEMO_CLINIC_ID).first()
    if not clinic:
        return 0
    doctors = list(Employee.objects.filter(clinic_id=DEMO_CLINIC_ID, role='doctor'))
    patients = list(Patient.objects.filter(clinic_id=DEMO_CLINIC_ID))
    branch = Branch.objects.filter(clinic_id=DEMO_CLINIC_ID).first()
    if not doctors or not patients:
        return 0

    # Idempotent: eski demo zapis + moliyani tozalaymiz
    FinancialTransaction.objects.filter(clinic_id=DEMO_CLINIC_ID).delete()
    Appointment.objects.filter(clinic_id=DEMO_CLINIC_ID).delete()

    tz = timezone.get_current_timezone()
    today = timezone.now().date()  # USE_TZ False bo'lsa ham ishlaydi
    rnd = random.Random(42)  # barqaror ko'rinish

    created = 0
    for offset in range(-3, 4):  # bugundan -3 .. +3 (7 kun, bugun markazda)
        day = today + timedelta(days=offset)
        if day.weekday() == 6:  # yakshanba — dam
            continue
        n = rnd.randint(3, 5)
        hours = sorted(rnd.sample([9, 10, 11, 12, 14, 15, 16, 17], n))
        for h in hours:
            doc = rnd.choice(doctors)
            pat = rnd.choice(patients)
            svc, price = rnd.choice(SERVICES)
            if offset < 0:
                status = rnd.choice(PAST_STATUSES)
            elif offset == 0:
                status = rnd.choice(TODAY_STATUSES)
            else:
                status = rnd.choice(FUTURE_STATUSES)
            naive_start = datetime.combine(day, dtime(h, rnd.choice([0, 30])))
            start = timezone.make_aware(naive_start, tz) if settings.USE_TZ else naive_start
            end = start + timedelta(minutes=rnd.choice([30, 60, 90]))
            paid = price if status == 'completed' else (round(price * 0.5) if status == 'debt' else 0)
            apt = Appointment.objects.create(
                clinic=clinic, patient=pat, doctor=doc, branch=branch,
                start_time=start, end_time=end, treatment_notes=svc,
                status=status, price=price, color_code=COLORS.get(status, '#F59E0B'),
                chair_name=f'Кресло {rnd.randint(1, 3)}', paid_amount=paid,
            )
            created += 1
            # Moliya: completed → to'liq, debt → qisman (narxlar moliyada ko'rinsin)
            if status in ('completed', 'debt'):
                ft = FinancialTransaction.objects.create(
                    clinic=clinic, appointment=apt, branch=branch, patient=pat, doctor=doc,
                    amount=paid, type='income',
                    category='Оплата приема' if status == 'completed' else 'Частичная оплата',
                    payment_method=rnd.choice(['Наличные', 'Карта', 'Payme', 'Click', 'Перечисление']),
                    operator_name='Kassir', notes=svc,
                )
                # date auto_now_add — zapis sanasiga moslaymiz (update bypass qiladi)
                FinancialTransaction.objects.filter(pk=ft.pk).update(date=start)

    # ─── XARAJATLAR (hisobotда "Chiqim": oylik, avans, texnik, arenda, material, kommunal) ───
    expenses = [
        ('Зарплата врачу', 8000000, 'Перечисление', True),
        ('Аванс врачу', 2000000, 'Наличные', True),
        ('Оплата зуботехнику', 3500000, 'Карта', False),
        ('Аренда помещения', 12000000, 'Перечисление', False),
        ('Стоматологические материалы', 5500000, 'Карта', False),
        ('Коммунальные услуги', 1800000, 'Наличные', False),
        ('Реклама / маркетинг', 2200000, 'Click', False),
    ]
    for i, (cat, amt, method, is_doc) in enumerate(expenses):
        d = today - timedelta(days=rnd.randint(0, 5))
        naive = datetime.combine(d, dtime(rnd.randint(9, 17), 0))
        when = timezone.make_aware(naive, tz) if settings.USE_TZ else naive
        ft = FinancialTransaction.objects.create(
            clinic=clinic, branch=branch, amount=amt, type='expense',
            category=cat, payment_method=method, operator_name='Kassir',
            doctor=(doctors[i % len(doctors)] if is_doc else None), notes='Demo xarajat',
        )
        FinancialTransaction.objects.filter(pk=ft.pk).update(date=when)

    return created
