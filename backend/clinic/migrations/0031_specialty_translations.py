from django.db import migrations, models


class Migration(migrations.Migration):
    """Faqat SXEMA: Specialty ga 3 tilli nom + is_default ustunlari.

    Ma'lumot (10 global default + mavjud yozuvlar tarjimasi) 0032 da — alohida
    tranzaksiyada. Shunda Postgres'da "pending trigger events" muammosi chiqmaydi.
    is_default db_index'siz (kichik jadval — indeks shart emas).
    """

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
            field=models.BooleanField(default=False),
        ),
    ]
