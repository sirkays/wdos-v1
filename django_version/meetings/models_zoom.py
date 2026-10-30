import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models
from django.utils import timezone


def _get_fernet() -> Fernet:
    raw_key = getattr(settings, 'ZOOM_FIELD_ENCRYPTION_KEY', '') or ''
    if raw_key:
        try:
            return Fernet(raw_key.encode('utf-8') if isinstance(raw_key, str) else raw_key)
        except Exception:
            digest = hashlib.sha256(raw_key.encode('utf-8')).digest()
            return Fernet(base64.urlsafe_b64encode(digest))
    fallback_digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    return Fernet(base64.urlsafe_b64encode(fallback_digest))


def encrypt_passcode(plain: str) -> str:
    if not plain:
        return ''
    return _get_fernet().encrypt(plain.encode('utf-8')).decode('utf-8')


def decrypt_passcode(token: str) -> str:
    if not token:
        return ''
    try:
        return _get_fernet().decrypt(token.encode('utf-8')).decode('utf-8')
    except (InvalidToken, ValueError):
        return ''


class VideoPlatformSettings(models.Model):
    """Singleton (pk=1) controlling whether new WDOS meetings use LiveKit or Zoom."""
    PROVIDERS = [
        ('livekit', 'LiveKit (WODDI Room)'),
        ('zoom', 'Zoom'),
    ]
    WAITING_ROOM_MODES = [
        ('off', 'WDOS lobby only'),
        ('everyone', 'Also Zoom waiting room'),
    ]
    JBH_MINUTES = [
        (0, 0),
        (5, 5),
        (10, 10),
        (15, 15),
    ]
    RECORDING_MODES = [
        ('none', 'None'),
        ('cloud', 'Cloud'),
        ('local', 'Local'),
    ]

    active_provider = models.CharField(max_length=16, choices=PROVIDERS, default='livekit')
    fallback_to_livekit = models.BooleanField(
        default=False,
        help_text='If enabled, fall back to LiveKit (WODDI Room) if Zoom provisioning fails at schedule time.',
    )
    zoom_waiting_room_mode = models.CharField(
        max_length=16,
        choices=WAITING_ROOM_MODES,
        default='off',
        help_text='Whether Zoom native waiting room is enabled in addition to the WDOS guest lobby.',
    )
    zoom_join_before_host = models.BooleanField(
        default=True,
        help_text='Mirrors WDOS room opening 15 minutes before the scheduled start time.',
    )
    zoom_jbh_minutes = models.PositiveSmallIntegerField(choices=JBH_MINUTES, default=15)
    zoom_auto_recording = models.CharField(max_length=16, choices=RECORDING_MODES, default='none')
    zoom_required_capacity = models.PositiveIntegerField(default=300)
    zoom_auto_cohost_managers = models.BooleanField(default=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Video platform settings'
        verbose_name_plural = 'Video platform settings'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f'Video Platform Settings (Active: {self.get_active_provider_display()})'


class ZoomHostAccount(models.Model):
    """Pool of licensed Zoom host users allocated to scheduled/instant meetings without overlap."""
    zoom_user_id = models.CharField(max_length=128, unique=True)
    email = models.EmailField()
    label = models.CharField(max_length=120)
    capacity = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['capacity', 'email']
        verbose_name = 'Zoom host account'
        verbose_name_plural = 'Zoom host accounts'

    def __str__(self):
        return f'{self.label} ({self.email} · cap {self.capacity})'


class ZoomMeeting(models.Model):
    """Zoom meeting record paired 1-to-1 with an operations.Meeting when platform='zoom'."""
    SYNC_STATES = [
        ('ok', 'OK'),
        ('pending_update', 'Pending Update'),
        ('pending_delete', 'Pending Delete'),
        ('error', 'Error'),
    ]

    meeting = models.OneToOneField(
        'operations.Meeting',
        related_name='zoom',
        on_delete=models.CASCADE,
    )
    host_account = models.ForeignKey(
        ZoomHostAccount,
        on_delete=models.PROTECT,
        related_name='zoom_meetings',
    )
    zoom_meeting_id = models.BigIntegerField(unique=True, db_index=True)
    zoom_uuid = models.CharField(max_length=128, blank=True, default='')
    meeting_type = models.PositiveSmallIntegerField(default=2)  # 2 = scheduled, 3 = recurring no fixed time
    passcode_enc = models.TextField()
    occupies_from = models.DateTimeField(null=True, blank=True)
    occupies_until = models.DateTimeField(null=True, blank=True)
    sync_state = models.CharField(max_length=20, choices=SYNC_STATES, default='ok')
    last_error = models.TextField(blank=True, default='')
    is_live = models.BooleanField(default=False)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Zoom meeting'
        verbose_name_plural = 'Zoom meetings'

    def set_passcode(self, plain: str):
        self.passcode_enc = encrypt_passcode(plain)

    def get_passcode(self) -> str:
        return decrypt_passcode(self.passcode_enc)

    def __str__(self):
        return f'Zoom #{self.zoom_meeting_id} ({self.meeting.title})'


class ZoomParticipantSession(models.Model):
    """Attendance and session duration tracking populated from Zoom participant webhooks."""
    zoom_meeting = models.ForeignKey(
        ZoomMeeting,
        on_delete=models.CASCADE,
        related_name='participant_sessions',
    )
    profile = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='zoom_sessions',
    )
    guest = models.ForeignKey(
        'meetings.GuestSession',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='zoom_sessions',
    )
    customer_key = models.CharField(max_length=64, db_index=True)
    participant_user_id = models.CharField(max_length=64, blank=True, default='')
    participant_uuid = models.CharField(max_length=128, blank=True, default='')
    name = models.CharField(max_length=120)
    joined_at = models.DateTimeField(default=timezone.now)
    left_at = models.DateTimeField(null=True, blank=True)
    leave_reason = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        ordering = ['-joined_at']
        verbose_name = 'Zoom participant session'
        verbose_name_plural = 'Zoom participant sessions'

    def __str__(self):
        return f'{self.name} in Zoom #{self.zoom_meeting.zoom_meeting_id}'


class ZoomWebhookEvent(models.Model):
    """Idempotency and audit log for incoming Zoom webhook deliveries."""
    dedupe_key = models.CharField(max_length=64, unique=True)
    event = models.CharField(max_length=120, db_index=True)
    event_ts = models.BigIntegerField()
    payload = models.JSONField(default=dict)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-received_at']
        verbose_name = 'Zoom webhook event'
        verbose_name_plural = 'Zoom webhook events'

    def __str__(self):
        return f'{self.event} @ {self.event_ts} ({self.dedupe_key[:10]})'
