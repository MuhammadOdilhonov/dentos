from django.urls import path, include
from django.conf import settings
from rest_framework.routers import DefaultRouter
from .views import (
    EmployeeViewSet, PatientViewSet, AppointmentViewSet,
    FinancialTransactionViewSet, ClinicTaskViewSet,
    WarehouseItemViewSet, DentalLabOrderViewSet,
    DentalTechnicianViewSet, PlatformSettingViewSet, ClinicTenantViewSet,
    WorkplaceViewSet, SpecialtyViewSet, BranchViewSet,
    global_search, dashboard_stats, pulse_monitor, auth_login, update_profile, serve_dental_media_sample,
    request_login_code, verify_login_code, monthly_plan,
    PatientMediaViewSet, photo_protocol, patient_media_presence, ServiceCatalogItemViewSet,
    DoctorNaryadRateViewSet, ServiceCategoryViewSet
)
from . import telegram_auth
from . import whatsapp_api
from . import reminders
from . import ai_agent
from . import telegram_login

# Avto-eslatma rejalashtiruvchisini ishga tushiramiz (30 daqiqada tekshiradi)
if getattr(settings, 'START_BACKGROUND_SERVICES', True):
    reminders.start_scheduler()

# Ulangan Telegram sessiyalarini TINGLASHGA ulaymiz (incoming AI avto-javob uchun)
if getattr(settings, 'START_BACKGROUND_SERVICES', True):
    telegram_auth.start_listeners()

router = DefaultRouter()
router.register(r'branches', BranchViewSet)
router.register(r'employees', EmployeeViewSet)
router.register(r'workplaces', WorkplaceViewSet)
router.register(r'specialties', SpecialtyViewSet)
router.register(r'patients', PatientViewSet)
router.register(r'appointments', AppointmentViewSet)
router.register(r'finance', FinancialTransactionViewSet)
router.register(r'tasks', ClinicTaskViewSet)
router.register(r'warehouse', WarehouseItemViewSet)
router.register(r'lab-orders', DentalLabOrderViewSet)
router.register(r'technicians', DentalTechnicianViewSet)
router.register(r'platform-settings', PlatformSettingViewSet)
router.register(r'clinics', ClinicTenantViewSet)
router.register(r'patient-media', PatientMediaViewSet)
router.register(r'service-categories', ServiceCategoryViewSet)
router.register(r'service-catalog', ServiceCatalogItemViewSet)
router.register(r'doctor-naryads', DoctorNaryadRateViewSet)

from .patient_records import patient_record
from .health import health, logout, me
from .preferences import user_prefs

urlpatterns = [
    path('health/', health),
    path('auth/logout/', logout),
    path('auth/me/', me),
    path('me/prefs/', user_prefs),
    path('patient-records/<int:patient_id>/', patient_record),
    path('auth/telegram-bot/', telegram_login.bot_info),
    path('auth/telegram/request/', telegram_login.request_code),
    path('auth/telegram/verify/', telegram_login.verify_code),
    # MUHIM: router'dan OLDIN — aks holda /patient-media/<pk> bilan to'qnashadi
    path('patient-media/presence/', patient_media_presence, name='patient_media_presence'),
    path('', include(router.urls)),
    path('auth/login/', auth_login, name='auth_login'),
    path('auth/request-code/', request_login_code, name='request_login_code'),
    path('auth/verify-code/', verify_login_code, name='verify_login_code'),
    path('auth/update-profile/', update_profile, name='update_profile'),
    path('search/', global_search, name='global_search'),
    path('dashboard/stats/', dashboard_stats, name='dashboard_stats'),
    path('monthly-plan/', monthly_plan, name='monthly_plan'),
    path('photo-protocol/', photo_protocol, name='photo_protocol'),
    path('pulse/', pulse_monitor, name='pulse_monitor'),
    # Telegram akkaunt ulash (real, Telethon)
    path('telegram/send-code/', telegram_auth.send_code),
    path('telegram/resend-code/', telegram_auth.resend_code),
    path('telegram/sign-in/', telegram_auth.sign_in),
    path('telegram/password/', telegram_auth.sign_in_password),
    path('telegram/status/', telegram_auth.status),
    path('telegram/qr-start/', telegram_auth.qr_start),
    path('telegram/qr-status/', telegram_auth.qr_status),
    path('telegram/bot-login/', telegram_auth.bot_login),
    path('telegram/disconnect/', telegram_auth.disconnect),
    path('telegram/chat/', telegram_auth.chat),
    path('telegram/send/', telegram_auth.send_to),
    path('telegram/media/<str:filename>', telegram_auth.media),
    # WhatsApp Business Cloud API
    path('whatsapp/config/', whatsapp_api.config),
    path('whatsapp/send/', whatsapp_api.send),
    path('whatsapp/chat/', whatsapp_api.chat),
    path('whatsapp/webhook/', whatsapp_api.webhook),
    # Avto-eslatma (qabuldan oldin Telegram xabar)
    path('reminders/config/', reminders.config),
    path('reminders/run/', reminders.run_now),
    path('reminders/process-reply/', reminders.process_reply),
    # Sun'iy intellektli administrator va onlayn zapis
    path('ai-agent/chat/', ai_agent.ai_chat_message, name='ai_chat_message'),
    path('ai-agent/settings/', ai_agent.ai_agent_settings, name='ai_agent_settings'),
    # Dental Media Sample Loader (local test files)
    path('media-sample/<str:sample_type>/', serve_dental_media_sample, name='serve_dental_media_sample'),
]

