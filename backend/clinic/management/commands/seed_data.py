from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import datetime, time, timedelta
from clinic.models import Employee, Patient, Appointment, FinancialTransaction, ClinicTask, WarehouseItem, DentalLabOrder

class Command(BaseCommand):
    help = 'Seeds initial clinic data for 32Desk'

    def handle(self, *args, **kwargs):
        self.stdout.write("Очистка и создание демонстрационных данных 32Desk...")
        
        # 1. Doctors / Employees
        doctors_data = [
            {
                'full_name': 'Сардор Алимов',
                'role': 'doctor',
                'specialty': 'Хирург / Имплантолог',
                'chair': 'Кресло 1 (Хирургия)',
                'color': '#0EA5E9',
                'phone': '+998 90 111 22 33',
                'avatar': 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80'
            },
            {
                'full_name': 'Сервер Усманов',
                'role': 'doctor',
                'specialty': 'Ортопед / Протезист',
                'chair': 'Кресло 2 (Ортопедия)',
                'color': '#8B5CF6',
                'phone': '+998 90 222 33 44',
                'avatar': 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150&auto=format&fit=crop&q=80'
            },
            {
                'full_name': 'Озод Расулов',
                'role': 'doctor',
                'specialty': 'Ортодонт',
                'chair': 'Кресло 3 (Ортодонтия)',
                'color': '#10B981',
                'phone': '+998 90 333 44 55',
                'avatar': 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80'
            },
            {
                'full_name': 'Мальвина Абдуллаева',
                'role': 'doctor',
                'specialty': 'Терапевт / Детский врач',
                'chair': 'Кресло 4 (Терапия)',
                'color': '#F59E0B',
                'phone': '+998 90 444 55 66',
                'avatar': 'https://images.unsplash.com/photo-1594824813589-32219d525f69?w=150&auto=format&fit=crop&q=80'
            },
            {
                'full_name': 'Музаффар Олимов (MO)',
                'role': 'admin',
                'specialty': 'Главный врач / Администратор',
                'chair': 'Кабинет 101',
                'color': '#475569',
                'phone': '+998 90 999 00 00',
                'avatar': 'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=150&auto=format&fit=crop&q=80'
            }
        ]

        # Agar klinika 1 da allaqachon HAQIQIY (login/username'li) xodimlar bo'lsa,
        # demo Cyrillic dublikatlarni YARATMAYMIZ — mavjudlarini qayta ishlatamiz.
        from clinic.models import Employee as _Emp
        existing_real = list(_Emp.objects.filter(clinic_id=1).exclude(username='').order_by('id'))
        existing_docs = [e for e in existing_real if e.role == 'doctor']
        existing_admins = [e for e in existing_real if e.role == 'admin']

        if len(existing_docs) >= 3:
            # Mavjud haqiqiy xodimlarni ishlatamiz (dublikat yaratmaymiz)
            doc_objs = (existing_docs + existing_admins)[:5]
            while len(doc_objs) < 5:
                doc_objs.append(existing_docs[0])
        else:
            doc_objs = []
            for d in doctors_data:
                doc, _ = Employee.objects.update_or_create(
                    full_name=d['full_name'],
                    defaults=d
                )
                doc_objs.append(doc)

        sardor, server, ozod, malvina = doc_objs[0], doc_objs[1], doc_objs[2], doc_objs[3]
        admin_user = doc_objs[4]

        # 2. Patients
        patients_data = [
            {
                'full_name': 'Лиля Гафарова',
                'phone': '+998 90 123 45 67',
                'category_status': 'VIP',
                'gender': 'Ж',
                'birth_date': '1992-05-14',
                'balance': 0,
                'medical_history': 'Аллергия на пенициллин. Завершен 1 этап протезирования.',
                'notes': 'Предпочитает утреннее время. Внимательна к деталям.'
            },
            {
                'full_name': 'Рустам Ахмедов',
                'phone': '+998 93 987 65 43',
                'category_status': 'Постоянный',
                'gender': 'М',
                'birth_date': '1985-11-20',
                'balance': -400000,
                'medical_history': 'Удаление зуба мудрости 38. Назначен контрольный осмотр.',
                'notes': 'Остаток задолженности 400,000 UZS.'
            },
            {
                'full_name': 'Дильноза Каримова',
                'phone': '+998 97 555 12 34',
                'category_status': 'Первичный',
                'gender': 'Ж',
                'birth_date': '2001-08-09',
                'balance': 0,
                'medical_history': 'Установка брекет-системы Damon Q.',
                'notes': 'Плановый визит раз в месяц.'
            },
            {
                'full_name': 'Бахром Юсупов',
                'phone': '+998 99 444 88 99',
                'category_status': 'Обычный',
                'gender': 'М',
                'birth_date': '1979-03-25',
                'balance': -320000,
                'medical_history': 'Лечение глубокого кариеса 26 зуба.',
                'notes': 'Остаток долга 320,000 UZS.'
            },
            {
                'full_name': 'Елена Смирнова',
                'phone': '+998 91 222 33 44',
                'category_status': 'VIP',
                'gender': 'Ж',
                'birth_date': '1988-12-03',
                'balance': 500000,
                'medical_history': 'Дентальная имплантация Straumann 46, 47.',
                'notes': 'Депозит 500,000 UZS.'
            },
            {
                'full_name': 'Азиз Рахимов',
                'phone': '+998 90 777 66 55',
                'category_status': 'Постоянный',
                'gender': 'М',
                'birth_date': '1995-07-19',
                'balance': 0,
                'medical_history': 'Циркониевые коронки на фронтальные зубы.',
                'notes': 'Примерка каркаса прошла успешно.'
            },
            {
                'full_name': 'Зухра Исмаилова',
                'phone': '+998 94 333 22 11',
                'category_status': 'Обычный',
                'gender': 'Ж',
                'birth_date': '2003-01-30',
                'balance': 0,
                'medical_history': 'Консультация по элайнерам.',
                'notes': 'Ожидается 3D-план.'
            },
            {
                'full_name': 'Жасур Умаров',
                'phone': '+998 90 888 11 22',
                'category_status': 'Постоянный',
                'gender': 'М',
                'birth_date': '1990-09-12',
                'balance': 0,
                'medical_history': 'Гигиеническая чистка AirFlow каждые 6 месяцев.',
                'notes': 'Всегда пунктуален.'
            }
        ]

        patient_objs = []
        for p in patients_data:
            pt, _ = Patient.objects.update_or_create(
                phone=p['phone'],
                defaults=p
            )
            patient_objs.append(pt)

        # 3. Appointments for today (and nearby)
        today = timezone.now().date()
        
        appointments_data = [
            {
                'patient': patient_objs[0], # Лиля Гафарова
                'doctor': sardor,
                'start_time': datetime.combine(today, time(9, 30)),
                'end_time': datetime.combine(today, time(10, 30)),
                'treatment_notes': 'снятие коронок, 17 ресто',
                'sms_sent': True,
                'status': 'confirmed', # Зеленый
                'color_code': '#10B981',
                'price': 450000,
                'paid_amount': 450000,
                'chair_name': 'Кресло 1'
            },
            {
                'patient': patient_objs[1], # Рустам Ахмедов
                'doctor': server,
                'start_time': datetime.combine(today, time(10, 0)),
                'end_time': datetime.combine(today, time(11, 30)),
                'treatment_notes': '38 уд, сложная экстракция',
                'sms_sent': True,
                'status': 'in_progress', # Фиолетовый
                'color_code': '#8B5CF6',
                'price': 600000,
                'paid_amount': 200000,
                'chair_name': 'Кресло 2'
            },
            {
                'patient': patient_objs[2], # Дильноза Каримова
                'doctor': ozod,
                'start_time': datetime.combine(today, time(11, 0)),
                'end_time': datetime.combine(today, time(12, 0)),
                'treatment_notes': 'активация брекет-системы',
                'sms_sent': False,
                'status': 'reserved', # Синий
                'color_code': '#3B82F6',
                'price': 350000,
                'paid_amount': 0,
                'chair_name': 'Кресло 3'
            },
            {
                'patient': patient_objs[3], # Бахром Юсупов
                'doctor': malvina,
                'start_time': datetime.combine(today, time(12, 30)),
                'end_time': datetime.combine(today, time(14, 0)),
                'treatment_notes': 'лечение пульпита 26, пломба',
                'sms_sent': True,
                'status': 'debt', # Оранжевый
                'color_code': '#F59E0B',
                'price': 520000,
                'paid_amount': 200000,
                'chair_name': 'Кресло 4'
            },
            {
                'patient': patient_objs[4], # Елена Смирнова
                'doctor': sardor,
                'start_time': datetime.combine(today, time(14, 30)),
                'end_time': datetime.combine(today, time(16, 0)),
                'treatment_notes': 'установка имплантата Straumann BLX 46',
                'sms_sent': True,
                'status': 'confirmed',
                'color_code': '#10B981',
                'price': 3500000,
                'paid_amount': 3500000,
                'chair_name': 'Кресло 1'
            },
            {
                'patient': patient_objs[5], # Азиз Рахимов
                'doctor': server,
                'start_time': datetime.combine(today, time(15, 0)),
                'end_time': datetime.combine(today, time(16, 30)),
                'treatment_notes': 'примерка циркониевого моста 14-16',
                'sms_sent': True,
                'status': 'completed',
                'color_code': '#64748B',
                'price': 1800000,
                'paid_amount': 1800000,
                'chair_name': 'Кресло 2'
            },
            {
                'patient': patient_objs[6], # Зухра Исмаилова
                'doctor': ozod,
                'start_time': datetime.combine(today, time(16, 30)),
                'end_time': datetime.combine(today, time(17, 30)),
                'treatment_notes': 'слепки элайнеров, фотопротокол',
                'sms_sent': False,
                'status': 'reserved',
                'color_code': '#3B82F6',
                'price': 200000,
                'paid_amount': 0,
                'chair_name': 'Кресло 3'
            },
            {
                'patient': patient_objs[7], # Жасур Умаров
                'doctor': malvina,
                'start_time': datetime.combine(today, time(17, 30)),
                'end_time': datetime.combine(today, time(18, 30)),
                'treatment_notes': 'профгигиена AirFlow + фторирование',
                'sms_sent': True,
                'status': 'confirmed',
                'color_code': '#10B981',
                'price': 300000,
                'paid_amount': 300000,
                'chair_name': 'Кресло 4'
            },
            {
                'patient': patient_objs[0],
                'doctor': sardor,
                'start_time': datetime.combine(today, time(19, 0)),
                'end_time': datetime.combine(today, time(20, 30)),
                'treatment_notes': 'фиксация временных коронок PMMA',
                'sms_sent': True,
                'status': 'reserved',
                'color_code': '#3B82F6',
                'price': 400000,
                'paid_amount': 0,
                'chair_name': 'Кресло 1'
            }
        ]

        # Faqat demo klinika (1) va biriktirilmagan (orphan) yozuvlarni tozalaymiz —
        # boshqa klinikalar ma'lumotlariga tegmaymiz.
        Appointment.objects.filter(clinic_id__in=[1, None]).delete()
        FinancialTransaction.objects.filter(clinic_id__in=[1, None]).delete()

        created_apts = []
        for apt_data in appointments_data:
            apt = Appointment.objects.create(**apt_data)
            created_apts.append(apt)
            if apt.paid_amount > 0:
                FinancialTransaction.objects.create(
                    appointment=apt,
                    patient=apt.patient,
                    amount=apt.paid_amount,
                    type='income',
                    category='Оплата приема',
                    payment_method='Наличные' if apt.price < 500000 else 'Карта (Uzcard/Humo)',
                    notes=f"Оплата приема {apt.treatment_notes}"
                )

        # Additional financial records
        FinancialTransaction.objects.create(
            amount=250000,
            type='expense',
            category='Закупка материалов',
            payment_method='Перевод',
            notes='Перчатки нитриловые и маски трехслойные (2 коробки)'
        )
        FinancialTransaction.objects.create(
            amount=480000,
            type='expense',
            category='Лаборатория',
            payment_method='Наличные',
            notes='Оплата зубному технику за литье каркаса'
        )

        # 4. Tasks (representing clinic tasks)
        ClinicTask.objects.all().delete()
        tasks_data = [
            {
                'title': 'Отправить SMS напоминание о повторном приеме Лиле Гафаровой',
                'assignee': admin_user,
                'patient': patient_objs[0],
                'priority': 'high',
                'status': 'pending',
                'due_date': today
            },
            {
                'title': 'Контрольный звонок после удаления зуба 38 Рустаму Ахмедову',
                'assignee': malvina,
                'patient': patient_objs[1],
                'priority': 'high',
                'status': 'pending',
                'due_date': today
            },
            {
                'title': 'Забрать циркониевый мост из лаборатории DentalArt',
                'assignee': server,
                'patient': patient_objs[5],
                'priority': 'medium',
                'status': 'pending',
                'due_date': today + timedelta(days=1)
            },
            {
                'title': 'Стерилизация наконечников и хирургического набора автоклав B',
                'assignee': admin_user,
                'priority': 'high',
                'status': 'in_progress',
                'due_date': today
            },
            {
                'title': 'Пополнить запас анестетиков Убистезин Форте 1:100 000',
                'assignee': sardor,
                'priority': 'medium',
                'status': 'pending',
                'due_date': today + timedelta(days=2)
            }
        ]
        for t in tasks_data:
            ClinicTask.objects.create(**t)

        # 5. Warehouse items
        WarehouseItem.objects.all().delete()
        warehouse_data = [
            {'name': 'Анестетик Убистезин Форте (50 карпул)', 'category': 'Анестезия', 'quantity': 8, 'unit': 'уп', 'min_quantity': 3, 'cost': 320000},
            {'name': 'Композит Filtek Ultimate Body A2', 'category': 'Пломбировочные', 'quantity': 14, 'unit': 'шприц', 'min_quantity': 5, 'cost': 280000},
            {'name': 'Перчатки нитриловые неопудренные (р-р M)', 'category': 'Расходники', 'quantity': 25, 'unit': 'пачка', 'min_quantity': 10, 'cost': 65000},
            {'name': 'Слюноотсосы одноразовые (100 шт)', 'category': 'Расходники', 'quantity': 18, 'unit': 'уп', 'min_quantity': 5, 'cost': 35000},
            {'name': 'Боры алмазные конусные Mani (набор)', 'category': 'Инструменты', 'quantity': 6, 'unit': 'набор', 'min_quantity': 2, 'cost': 150000},
            {'name': 'Имплантат Straumann BLX 4.0x10mm', 'category': 'Имплантология', 'quantity': 4, 'unit': 'шт', 'min_quantity': 2, 'cost': 1800000},
            {'name': 'А-Силикон Elite HD+ слепочная масса', 'category': 'Ортопедия', 'quantity': 3, 'unit': 'набор', 'min_quantity': 2, 'cost': 420000},
            {'name': 'Брекеты керамические Damon Clear 2', 'category': 'Ортодонтия', 'quantity': 5, 'unit': 'набор', 'min_quantity': 2, 'cost': 2400000}
        ]
        for w in warehouse_data:
            WarehouseItem.objects.create(**w)

        # 6. Dental Lab orders
        DentalLabOrder.objects.all().delete()
        lab_data = [
            {
                'patient': patient_objs[5],
                'doctor': server,
                'technician_name': 'Лаборатория "DentalArt" (Алишер)',
                'tooth_numbers': '14, 15, 16',
                'work_type': 'Циркониевый мостовидный протез',
                'status': 'Готово к примерке',
                'color_shade': 'A2',
                'due_date': today + timedelta(days=1),
                'cost': 1200000,
                'notes': 'Текстура натуральная, индивидуализация фиссур.'
            },
            {
                'patient': patient_objs[0],
                'doctor': sardor,
                'technician_name': 'Лаборатория "MasterDent" (Фарход)',
                'tooth_numbers': '17, 18',
                'work_type': 'Временные фрезерованные коронки PMMA',
                'status': 'В работе',
                'color_shade': 'A3',
                'due_date': today + timedelta(days=2),
                'cost': 400000,
                'notes': 'Высокая окклюзионная нагрузка.'
            },
            {
                'patient': patient_objs[6],
                'doctor': ozod,
                'technician_name': 'Орто-центр "SmileAlign"',
                'tooth_numbers': 'Верхняя и нижняя челюсти',
                'work_type': 'Набор элайнеров (24 каппы)',
                'status': '3D-Моделирование',
                'color_shade': 'Прозрачный',
                'due_date': today + timedelta(days=7),
                'cost': 4500000,
                'notes': 'Срок лечения 12 месяцев.'
            }
        ]
        for l in lab_data:
            DentalLabOrder.objects.create(**l)

        # Barcha demo yozuvlarni demo klinikaga (id=1) biriktiramiz — aks holda
        # multi-tenant scoping tufayli direktor dashboardida ko'rinmaydi (orphan bo'lib qoladi).
        from clinic.models import ClinicTenant, Workplace, Specialty, Branch
        demo_clinic = ClinicTenant.objects.filter(id=1).first()
        if demo_clinic:
            for M in [Employee, Patient, Appointment, FinancialTransaction,
                      ClinicTask, WarehouseItem, DentalLabOrder, Workplace, Specialty]:
                M.objects.filter(clinic_id__isnull=True).update(clinic_id=demo_clinic.id)

            # --- TAKRORIY (duplikat) demo xodimlarni tozalash ---
            # Agar klinikada login/username'li va filialga biriktirilgan HAQIQIY xodimlar
            # mavjud bo'lsa, username'siz VA filialsiz demo-dublikatlarni o'chiramiz
            # (ro'yxat ikki marta — lotin + kirill — chiqmasligi uchun).
            real_staff_exists = Employee.objects.filter(
                clinic_id=demo_clinic.id, branch__isnull=False
            ).exclude(username='').exists()
            if real_staff_exists:
                Employee.objects.filter(
                    clinic_id=demo_clinic.id, branch__isnull=True, username=''
                ).delete()

            # --- FILIALGA BIRIKTIRISH: hech bir xodim/kreslo filialsiz qolmasin ---
            # Aks holda filial bo'yicha filtrlashda ular barcha filialda ko'rinib ketadi.
            branches = list(Branch.objects.filter(clinic_id=demo_clinic.id).order_by('id'))
            if branches:
                unassigned_emps = list(Employee.objects.filter(clinic_id=demo_clinic.id, branch__isnull=True).order_by('id'))
                for i, emp in enumerate(unassigned_emps):
                    emp.branch = branches[i % len(branches)]
                    emp.save(update_fields=['branch'])
                unassigned_wps = list(Workplace.objects.filter(clinic_id=demo_clinic.id, branch__isnull=True).order_by('id'))
                for i, wp in enumerate(unassigned_wps):
                    wp.branch = branches[i % len(branches)]
                    wp.save(update_fields=['branch'])

        self.stdout.write(self.style.SUCCESS("[OK] Demo data for 32Desk created successfully!"))
