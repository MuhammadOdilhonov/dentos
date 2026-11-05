from django.db import migrations


def backfill(apps, schema_editor):
    """Eski matnli `category` qiymatlaridan ServiceCategory yozuvlarini yaratadi va
    har bir naryadni (ServiceCatalogItem) o'z guruhiga (category_ref) ulaydi.

    Serverdagi mavjud ma'lumot ustida xavfsiz ishlaydi: faqat QO'SHADI va bog'laydi,
    hech narsa o'chirmaydi. Idempotent — qayta ishga tushsa dublikat yaratmaydi.
    """
    ServiceCategory = apps.get_model('clinic', 'ServiceCategory')
    ServiceCatalogItem = apps.get_model('clinic', 'ServiceCatalogItem')

    # (clinic_id, category_nomi) -> ServiceCategory keshi
    cache = {}
    for item in ServiceCatalogItem.objects.all().iterator():
        name = (item.category or '').strip()
        if not name or item.category_ref_id:
            continue
        key = (item.clinic_id, name.lower())
        cat = cache.get(key)
        if cat is None:
            cat, _ = ServiceCategory.objects.get_or_create(
                clinic_id=item.clinic_id,
                name=name,
                defaults={'description': '', 'show_in_calendar': False},
            )
            cache[key] = cat
        item.category_ref_id = cat.id
        item.save(update_fields=['category_ref'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0033_service_category_and_procedure_fields'),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
