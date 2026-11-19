# Unique (patient, slot) — ALOHIDA migratsiya (sxema 0038'da tushib bo'lgach).
# Shunda Postgres'da "cannot CREATE INDEX ... pending trigger events" bo'lmaydi.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0038_photoprotocol_slot_photoprotocol_title_and_more'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='photoprotocol',
            constraint=models.UniqueConstraint(fields=('patient', 'slot'), name='uniq_photoprotocol_patient_slot'),
        ),
    ]
