from django.conf import settings
from django.contrib.auth.hashers import make_password, identify_hasher
from rest_framework import serializers

class TenantModelSerializer(serializers.ModelSerializer):
    def get_fields(self):
        fields = super().get_fields()
        for name in ('password', 'telegram_bot_token'):
            if name in fields:
                fields[name].write_only = True
        # Never accept a Django auth-user binding from a client.
        if 'user' in fields:
            fields['user'].read_only = True
        return fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        if not request:
            return attrs
        from .views import get_clinic_id
        from .models import ClinicTenant, DentalTechnician
        cid = get_clinic_id(request)
        model = self.Meta.model
        if 'clinic' in self.fields and model is not ClinicTenant:
            if not cid and not request.user.is_superuser:
                raise serializers.ValidationError('Klinika kerak.')
            if cid:
                if attrs.get('clinic') and attrs['clinic'].pk != cid:
                    raise serializers.ValidationError({'clinic': 'Boshqa klinikaga ruxsat yo‘q.'})
                attrs['clinic'] = ClinicTenant.objects.get(pk=cid)
                for name, value in attrs.items():
                    if name != 'clinic' and hasattr(value, 'clinic_id') and value.clinic_id != cid:
                        raise serializers.ValidationError({name: 'Obyekt shu klinikaga tegishli emas.'})
                tech = attrs.get('technician')
                if tech and tech.pk not in (attrs['clinic'].linked_technicians or []):
                    raise serializers.ValidationError({'technician': 'Texnik klinikaga ulanmagan.'})
        if model.__name__ == 'Employee' and attrs.get('role') == 'superadmin':
            raise serializers.ValidationError({'role': 'Bu rol xodimga berilmaydi.'})
        if attrs.get('password'):
            try:
                identify_hasher(attrs['password'])
            except ValueError:
                attrs['password'] = make_password(attrs['password'])
        if model.__name__ == 'Appointment':
            start = attrs.get('start_time', getattr(self.instance, 'start_time', None))
            end = attrs.get('end_time', getattr(self.instance, 'end_time', None))
            if start and end and end <= start:
                raise serializers.ValidationError({'end_time': 'Tugash vaqti boshlanishdan keyin bo‘lsin.'})
        return attrs
