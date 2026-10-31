from rest_framework.permissions import BasePermission, SAFE_METHODS

# Demo (namoyish) klinika — faqat ko'rish mumkin, yozib bo'lmaydi.
DEMO_CLINIC_ID = 1


def _request_clinic_id(request):
    cid = (request.query_params.get('clinic')
           or request.headers.get('X-Clinic-ID')
           or request.headers.get('X-Clinic-Id'))
    try:
        return int(cid) if cid else None
    except (ValueError, TypeError):
        return None


class BlockDemoWrites(BasePermission):
    """Demo klinika (id=1) uchun har qanday yozishni (POST/PUT/PATCH/DELETE) bloklaydi.

    Ko'rish (GET/HEAD/OPTIONS) va boshqa klinikalar to'liq ishlaydi. Superuser
    istisno. Login so'rovida klinika aniqlanmagani uchun (clinic header yo'q)
    bloklanmaydi.
    """
    message = ("Demo rejim: bu namoyish akkaunti — faqat ko'rish mumkin. "
               "O'zgartirish uchun o'z klinika akkauntingizga kiring.")

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        # Sessiyadan chiqish (logout) klinika ma'lumotiga YOZISH emas — demo akkaunt ham
        # chiqa olishi SHART. Aks holda logout 403 bo'lib, cookie o'chmaydi va foydalanuvchi
        # qayta avtomatik kirib qoladi (access.py middleware ham logout'ni istisno qiladi).
        if request.path.rstrip('/') == '/api/auth/logout':
            return True
        if getattr(request.user, 'is_superuser', False):
            return True
        return _request_clinic_id(request) != DEMO_CLINIC_ID
