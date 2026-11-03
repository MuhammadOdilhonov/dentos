from django.db import migrations, models


# models.py dagi DEFAULT_SPECIALTIES bilan bir xil — migratsiya tarixi uchun shu yerda nusxa.
DEFAULT_SPECIALTIES = [
    {'ru': 'Терапевт',                  'uz': 'Terapevt',                    'en': 'Therapist'},
    {'ru': 'Ортопед',                   'uz': 'Ortoped',                     'en': 'Orthopedist'},
    {'ru': 'Ортодонт',                  'uz': 'Ortodont',                    'en': 'Orthodontist'},
    {'ru': 'Хирург',                    'uz': 'Xirurg',                      'en': 'Surgeon'},
    {'ru': 'Имплантолог',               'uz': 'Implantolog',                 'en': 'Implantologist'},
    {'ru': 'Пародонтолог',              'uz': 'Parodontolog',                'en': 'Periodontist'},
    {'ru': 'Детский стоматолог',        'uz': 'Bolalar stomatologi',         'en': 'Pediatric dentist'},
    {'ru': 'Ассистент врача',           'uz': 'Shifokor assistenti',         'en': "Doctor's assistant"},
    {'ru': 'Гигиенист',                 'uz': 'Gigienist',                   'en': 'Hygienist'},
    {'ru': 'Стоматолог общей практики', 'uz': 'Umumiy amaliyot stomatologi', 'en': 'General dentist'},
]


def backfill(apps, schema_editor):
    Specialty = apps.get_model('clinic', 'Specialty')
    by_ru = {s['ru']: s for s in DEFAULT_SPECIALTIES}

    # 1) Mavjud mutaxassisliklar: name_ru bo'sh bo'lsa name dan, uz/en ni standartdan.
    for sp in Specialty.objects.all():
        changed = False
        if not sp.name_ru:
            sp.name_ru = sp.name
            changed = True
        match = by_ru.get(sp.name)
        if match:
            if not sp.name_uz:
                sp.name_uz = match['uz']
                changed = True
            if not sp.name_en:
                sp.name_en = match['en']
                changed = True
        if changed:
            sp.save(update_fields=['name_ru', 'name_uz', 'name_en'])

    # 2) GLOBAL 10 standart mutaxassislik (clinic=None, is_default=True) — bitta marta.
    #    Barcha klinikaga (eski/yangi) ko'rinadi, o'chirib bo'lmaydi.
    for s in DEFAULT_SPECIALTIES:
        Specialty.objects.update_or_create(
            is_default=True,
            clinic__isnull=True,
            name=s['ru'],
            defaults={
                'name_ru': s['ru'],
                'name_uz': s['uz'],
                'name_en': s['en'],
                'is_active': True,
                'clinic': None,
            },
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0030_doctornaryadrate_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='specialty',
            name='name_ru',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='specialty',
            name='name_uz',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='specialty',
            name='name_en',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='specialty',
            name='is_default',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.RunPython(backfill, noop),
    ]
