from django.db import models


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
