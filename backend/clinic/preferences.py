"""Per-account UI preferences (e.g. qabullar taqvimidagi shifokor ustunlari tartibi).

Akkaunt login cookie'dagi principal (request.user) orqali aniqlanadi — klient
yuborgan id'ga ISHONILMAYDI. Shuning uchun har kim faqat O'Z sozlamasini o'qiydi
va yozadi; boshqa foydalanuvchiniki ko'rinmaydi."""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import UserPreference

# Ruxsat etilgan sozlama kalitlari (noma'lum kalit saqlanmaydi).
ALLOWED_KEYS = {'calendar_doctor_order'}


@api_view(['GET', 'PUT'])
def user_prefs(request):
    principal = request.user
    if not getattr(principal, 'is_authenticated', False):
        return Response({'detail': 'Kirish talab qilinadi.'}, status=401)
    kind = getattr(principal, 'kind', 'platform')
    account_id = principal.id

    if request.method == 'GET':
        rows = UserPreference.objects.filter(kind=kind, account_id=account_id)
        return Response({row.key: row.value for row in rows})

    key = request.data.get('key')
    if key not in ALLOWED_KEYS:
        return Response({'detail': 'Noma’lum sozlama kaliti.'}, status=400)
    value = request.data.get('value')
    if not isinstance(value, (list, dict)):
        return Response({'detail': 'JSON ro‘yxat yoki obyekt kerak.'}, status=400)
    UserPreference.objects.update_or_create(
        kind=kind, account_id=account_id, key=key,
        defaults={'value': value},
    )
    return Response({'ok': True, 'key': key, 'value': value})
