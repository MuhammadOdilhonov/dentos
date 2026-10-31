from django.db import models


class ReceptionContact(models.Model):
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE)
    key = models.CharField(max_length=160)
    patient = models.ForeignKey('Patient', null=True, blank=True, on_delete=models.SET_NULL)
    language = models.CharField(max_length=5, default='uz')
    state = models.JSONField(default=dict)
    opted_out = models.BooleanField(default=False)
    human_requested = models.BooleanField(default=False)
    telegram_account = models.CharField(max_length=80, blank=True)
    telegram_access_hash = models.BigIntegerField(null=True, blank=True)
    timezone_name = models.CharField(max_length=64, blank=True)
    timezone_source = models.CharField(max_length=32, blank=True)
    timezone_updated_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['clinic', 'key'], name='reception_contact_unique')]


class ReceptionDelivery(models.Model):
    contact = models.ForeignKey(ReceptionContact, on_delete=models.CASCADE)
    appointment = models.ForeignKey('Appointment', on_delete=models.CASCADE)
    scheduled_for = models.DateTimeField()
    kind = models.CharField(max_length=12)
    sent_at = models.DateTimeField(null=True)
    claimed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['contact', 'appointment', 'scheduled_for', 'kind'], name='reception_delivery_unique')]


class ReceptionUpdate(models.Model):
    clinic = models.ForeignKey('ClinicTenant', on_delete=models.CASCADE)
    update_id = models.BigIntegerField()
    reply = models.JSONField(default=dict)
    delivered = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['clinic', 'update_id'], name='reception_update_unique')]


class ReceptionMessage(models.Model):
    contact = models.ForeignKey(ReceptionContact, on_delete=models.CASCADE, related_name='messages')
    remote_id = models.BigIntegerField()
    direction = models.CharField(max_length=8, default='in')
    text = models.TextField(blank=True)
    result = models.JSONField(default=dict, blank=True)
    delivered = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['contact', 'direction', 'remote_id'], name='reception_message_unique')]
