from django.conf import settings
from django.db import models
from django.utils import timezone
import uuid


def _private_path(instance, filename):
    # unguessable name: files are only ever handed out by the login-protected download view
    return f'meeting-files/{uuid.uuid4().hex}/{filename}'


class MeetingCheckin(models.Model):
    """Recorded the second someone joins (migration 052). Powers names-as-they-arrive."""
    meeting = models.ForeignKey('operations.Meeting', on_delete=models.CASCADE, related_name='checkins')
    profile = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='meeting_checkins')
    joined_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('meeting', 'profile')
        ordering = ['joined_at']


class MeetingFile(models.Model):
    """Meeting documents (private; served only through the login-protected download view)."""
    meeting = models.ForeignKey('operations.Meeting', on_delete=models.CASCADE, related_name='files')
    name = models.CharField(max_length=200)
    file = models.FileField(upload_to=_private_path)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(default=timezone.now)



class TranscriptSegment(models.Model):
    """One finished utterance with its translations (written by the translation worker)."""
    meeting = models.ForeignKey('operations.Meeting', on_delete=models.CASCADE, related_name='transcript')
    speaker = models.CharField(max_length=120)
    speaker_profile = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    lang = models.CharField(max_length=5)
    text = models.TextField()
    translations = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['created_at']


class TranslationUsage(models.Model):
    """What interpretation cost for a meeting, so the Azure bill is visible."""
    meeting = models.OneToOneField('operations.Meeting', on_delete=models.CASCADE, related_name='translation_usage')
    audio_seconds = models.PositiveIntegerField(default=0)       # speech recognised
    translated_chars = models.PositiveIntegerField(default=0)    # Translator characters (x target languages)
    spoken_chars = models.PositiveIntegerField(default=0)        # neural TTS characters


class GuestSession(models.Model):
    """Someone without a WDOS account who joined through the guest link (waiting room -> admitted)."""
    STATUS = [('waiting', 'Waiting'), ('admitted', 'Admitted'), ('removed', 'Removed')]
    meeting = models.ForeignKey('operations.Meeting', on_delete=models.CASCADE, related_name='guests')
    name = models.CharField(max_length=60)
    lang = models.CharField(max_length=5, default='en')
    status = models.CharField(max_length=10, choices=STATUS, default='waiting')
    created_at = models.DateTimeField(default=timezone.now)
    admitted_at = models.DateTimeField(null=True, blank=True)

    @property
    def identity(self):
        return f'guest-{self.pk}'
