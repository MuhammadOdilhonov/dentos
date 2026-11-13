"""Server-side account authentication and tenant boundary (never trust a clinic header)."""
import hashlib
from urllib.parse import urlsplit
from django.conf import settings
from django.core import signing
from django.http import JsonResponse
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

COOKIE = 'dentos_session'
PUBLIC = {'/api/auth/login/', '/api/auth/telegram-bot/', '/api/auth/telegram/request/',
          '/api/auth/telegram/verify/', '/api/technicians/login/', '/api/health/'}

def fingerprint(account):
    return hashlib.sha256(account.password.encode()).hexdigest()

def login_response(account, data):
    from rest_framework.response import Response
    from .models import DentalTechnician
    payload = {'id': account.pk, 'kind': 'technician' if isinstance(account, DentalTechnician) else 'platform',
               'password': fingerprint(account)}
    response = Response(data)
    response.set_cookie(COOKIE, signing.dumps(payload, salt=COOKIE), max_age=43200,
                        httponly=True, secure=settings.SESSION_COOKIE_SECURE, samesite='Lax', path='/')
    response['Cache-Control'] = 'no-store'
    return response

class AccountPrincipal:
    is_authenticated = True
    is_anonymous = False
    def __init__(self, account, kind):
        self.account = account
        self.pk = self.id = account.pk
        self.kind = kind
        self.role = 'technician' if kind == 'technician' else account.role
        self.is_superuser = self.role == 'superadmin'
        self.clinic_id = getattr(account, 'clinic_id', None)
        self.branch_id = getattr(account, 'branch_id', None)

class AccountAuthentication(BaseAuthentication):
    def authenticate(self, request):
        principal = getattr(request._request, 'crm_principal', None)
        return (principal, None) if principal else None

class AccountMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith('/api/') or not settings.ENFORCE_API_AUTH:
            return self.get_response(request)
        if request.method == 'OPTIONS' or request.path in PUBLIC:
            return self.get_response(request)
        from .models import PlatformUser, DentalTechnician
        try:
            payload = signing.loads(request.COOKIES.get(COOKIE, ''), salt=COOKIE, max_age=43200)
            model = DentalTechnician if payload['kind'] == 'technician' else PlatformUser
            account = model.objects.get(pk=payload['id'], is_active=True)
            if fingerprint(account) != payload['password']:
                raise ValueError()
        except (signing.BadSignature, KeyError, ValueError, PlatformUser.DoesNotExist, DentalTechnician.DoesNotExist):
            return JsonResponse({'detail': 'Kirish talab qilinadi.'}, status=401)
        principal = request.crm_principal = AccountPrincipal(account, payload['kind'])
        if request.method not in ('GET', 'HEAD'):
            # A custom header plus a strict origin allowlist prevents cookie CSRF.
            origin = request.headers.get('Origin')
            allowed = set(settings.CORS_ALLOWED_ORIGINS) | {f'{request.scheme}://{request.get_host()}'}
            if request.headers.get('X-Dentos-Request') != '1' or (origin and origin not in allowed):
                return JsonResponse({'detail': 'CSRF tekshiruvi rad etdi.'}, status=403)
        if not principal.is_superuser and principal.kind != 'technician':
            cid = principal.clinic_id
            if not cid or (account.clinic and account.clinic.status != 'active'):
                return JsonResponse({'detail': 'Faol klinika topilmadi.'}, status=403)
            for value in (request.GET.get('clinic'), request.headers.get('X-Clinic-ID')):
                if value and str(value) != str(cid):
                    return JsonResponse({'detail': 'Boshqa klinikaga ruxsat yo‘q.'}, status=403)
            query = request.GET.copy()
            query['clinic'] = str(cid)
            request.GET = query
            request.META['HTTP_X_CLINIC_ID'] = str(cid)
            if cid == 1 and request.method not in ('GET', 'HEAD') and request.path != '/api/auth/logout/':
                return JsonResponse({'detail': 'Demo faqat ko‘rish uchun.'}, status=403)
        if not principal.is_superuser:
            path = request.path
            write = request.method not in ('GET', 'HEAD')
            if path.startswith(('/api/whatsapp/', '/api/ai-agent/chat/')):
                return JsonResponse({'detail': 'Bu eski integratsiya production uchun yoqilmagan.'}, status=503)
            if write and (path.startswith('/api/finance/') or path.endswith('/record_payment/')) and principal.role not in ('director', 'deputy_director', 'kassa'):
                return JsonResponse({'detail': 'Kassa ruxsati kerak.'}, status=403)
            if path.startswith('/api/telegram/') and path not in ('/api/telegram/chat/', '/api/telegram/send/', '/api/telegram/status/') and not path.startswith('/api/telegram/media/') and principal.role not in ('director', 'deputy_director', 'admin'):
                return JsonResponse({'detail': 'Telegram ulash ruxsati yo‘q.'}, status=403)
            if path.startswith('/api/platform-settings/') and write:
                return JsonResponse({'detail': 'Faqat platforma administratori.'}, status=403)
            if path.startswith('/api/clinics/') and write:
                return JsonResponse({'detail': 'Faqat platforma administratori.'}, status=403)
            # Narx katalogi va shifokorga xos narx/tarif — direktor boshqaradi.
            # Oddiy shifokor FAQAT o‘qiydi (UI tugmasini yashirish yetarli emas).
            if write and path.startswith(('/api/service-catalog/', '/api/doctor-naryads/')) and principal.role not in ('director', 'deputy_director', 'admin'):
                return JsonResponse({'detail': 'Narx katalogini o‘zgartirish ruxsati yo‘q.'}, status=403)
            if principal.kind == 'technician':
                if not any(path.startswith(p) for p in ('/api/lab-orders/', '/api/technicians/', '/api/auth/logout/', '/api/auth/me/')):
                    return JsonResponse({'detail': 'Texnik uchun bu bo‘lim yopiq.'}, status=403)
            elif write and path.startswith(('/api/employees/', '/api/branches/', '/api/workplaces/', '/api/specialties/')) and principal.role not in ('director', 'deputy_director', 'admin'):
                return JsonResponse({'detail': 'Xodimlarni boshqarish ruxsati yo‘q.'}, status=403)
        response = self.get_response(request)
        response['Cache-Control'] = 'no-store'
        return response

class TenantPermission(BasePermission):
    def has_permission(self, request, view):
        if not settings.ENFORCE_API_AUTH or request.path in PUBLIC:
            return True
        user = request.user
        if not user.is_authenticated:
            return False
        if not user.is_superuser and getattr(user, 'kind', None) != 'technician':
            for field in ('clinic', 'clinic_id'):
                value = request.data.get(field) if isinstance(request.data, dict) or hasattr(request.data, 'get') else None
                if value is not None and str(value) != str(user.clinic_id):
                    raise PermissionDenied('Klinika identifikatori mos emas.')
        return True
