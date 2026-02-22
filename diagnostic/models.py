from django.db import models
from django.conf import settings


class UserProfile(models.Model):
    """Role for EMT, nurse, or physician."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile'
    )
    role = models.CharField(
        max_length=16,
        choices=[
            ('patient', 'Patient'),
            ('emt', 'EMT'),
            ('nurse', 'Nurse'),
            ('physician', 'Physician'),
        ],
        default='physician',
    )

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"


class Conversation(models.Model):
    """A patient-clinician conversation session (e.g. consultation, telehealth, triage)."""
    session_id = models.CharField(max_length=64, unique=True, db_index=True)
    source = models.CharField(
        max_length=32,
        choices=[
            ('consultation', 'Consultation'),
            ('telehealth', 'Telehealth'),
            ('triage', 'Emergency Triage'),
            ('other', 'Other'),
        ],
        default='consultation',
    )
    language = models.CharField(max_length=10, default='en')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']


class Transcript(models.Model):
    """Raw or processed transcript linked to a conversation."""
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name='transcripts'
    )
    role = models.CharField(
        max_length=16,
        choices=[('patient', 'Patient'), ('clinician', 'Clinician'), ('system', 'System')],
    )
    text = models.TextField()
    raw_audio_duration_seconds = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['created_at']


class ClinicalNote(models.Model):
    """Structured EMR-style note derived from conversation (summarization / extraction)."""
    conversation = models.OneToOneField(
        Conversation, on_delete=models.CASCADE, related_name='clinical_note'
    )
    vitals = models.JSONField(default=dict, blank=True)  # e.g. BP, HR, temp
    symptoms = models.JSONField(default=list, blank=True)  # list of strings
    assessment = models.TextField(blank=True)
    diagnosis_summary = models.TextField(blank=True)
    icd_codes = models.JSONField(default=list, blank=True)  # [{"code": "J06.9", "description": "..."}]
    suggested_treatments = models.JSONField(default=list, blank=True)  # [{"name": "...", "type": "medication"}]
    full_note_text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']


class PatientSummary(models.Model):
    """Patient-friendly summary / recovery plan (plain language)."""
    conversation = models.OneToOneField(
        Conversation, on_delete=models.CASCADE, related_name='patient_summary'
    )
    summary_text = models.TextField(blank=True)
    recovery_plan = models.TextField(blank=True)
    medications_plain = models.JSONField(default=list, blank=True)
    follow_up_instructions = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class EMRExport(models.Model):
    """Audit record for EMR export (compliance / plug-in integration)."""
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name='emr_exports'
    )
    external_system = models.CharField(max_length=128, blank=True)
    payload_snapshot = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=24,
        choices=[
            ('pending', 'Pending'),
            ('sent', 'Sent'),
            ('failed', 'Failed'),
        ],
        default='pending',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class TriageEncounter(models.Model):
    """Emergency triage encounter with structured intake and acuity output."""
    conversation = models.OneToOneField(
        Conversation, on_delete=models.CASCADE, related_name='triage_encounter'
    )
    patient_name = models.CharField(max_length=255, blank=True)
    patient_age = models.CharField(max_length=32, blank=True)
    chief_complaint = models.TextField(blank=True)
    onset_time = models.CharField(max_length=64, blank=True)
    arrival_mode = models.CharField(
        max_length=32,
        choices=[
            ('walk-in', 'Walk-in'),
            ('ambulance', 'Ambulance'),
            ('wheelchair', 'Wheelchair'),
            ('police', 'Police'),
            ('other', 'Other'),
        ],
        default='walk-in',
    )
    pain_score = models.PositiveSmallIntegerField(default=0)  # 0-10
    gcs = models.PositiveSmallIntegerField(default=15)  # 3-15
    vitals = models.JSONField(default=dict, blank=True)
    symptoms = models.JSONField(default=list, blank=True)
    allergies = models.JSONField(default=list, blank=True)
    medications = models.JSONField(default=list, blank=True)
    past_history = models.JSONField(default=list, blank=True)
    pregnancy_status = models.CharField(max_length=64, blank=True)
    red_flags = models.JSONField(default=dict, blank=True)
    triage_level = models.CharField(max_length=16, default='ESI-5')
    disposition = models.CharField(max_length=128, blank=True)
    reassessment_due_at = models.DateTimeField(null=True, blank=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    finalized_by = models.CharField(max_length=150, blank=True)
    audit_log = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']


class TriageEvent(models.Model):
    """Timeline event history for triage changes and finalization."""
    encounter = models.ForeignKey(
        TriageEncounter, on_delete=models.CASCADE, related_name='events'
    )
    event_type = models.CharField(
        max_length=32,
        choices=[
            ('arrival', 'Arrival'),
            ('triage_started', 'Triage Started'),
            ('triage_updated', 'Triage Updated'),
            ('scored', 'Scored'),
            ('reassessment', 'Reassessment'),
            ('handoff', 'Handoff'),
            ('finalized', 'Finalized'),
        ],
        default='triage_updated',
    )
    note = models.TextField(blank=True)
    created_by = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
