from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('clinic.urls')),
]

# Dev: bemor media fayllarini (patient_media/...) to'g'ridan serve qilamiz
# Patient files are only served by authenticated /api/patient-media/<id>/download/.
