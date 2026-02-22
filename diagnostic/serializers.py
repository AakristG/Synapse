from rest_framework import serializers
from .models import (
    Conversation,
    Transcript,
    ClinicalNote,
    PatientSummary,
    EMRExport,
    TriageEncounter,
    TriageEvent,
)


class TranscriptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transcript
        fields = ['id', 'role', 'text', 'raw_audio_duration_seconds', 'created_at', 'extra']


class ConversationSerializer(serializers.ModelSerializer):
    transcripts = TranscriptSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = [
            'id', 'session_id', 'source', 'language', 'created_at', 'updated_at',
            'metadata', 'transcripts',
        ]


class ClinicalNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicalNote
        fields = [
            'id', 'conversation_id', 'vitals', 'symptoms', 'assessment',
            'diagnosis_summary', 'icd_codes', 'suggested_treatments',
            'full_note_text', 'created_at', 'updated_at',
        ]
        read_only_fields = ['conversation_id']


class PatientSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientSummary
        fields = [
            'id', 'conversation_id', 'summary_text', 'recovery_plan',
            'medications_plain', 'follow_up_instructions', 'created_at',
        ]
        read_only_fields = ['conversation_id']


class EMRExportSerializer(serializers.ModelSerializer):
    class Meta:
        model = EMRExport
        fields = ['id', 'conversation_id', 'external_system', 'status', 'created_at']


class TriageEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TriageEvent
        fields = ['id', 'event_type', 'note', 'created_by', 'created_at']


class TriageEncounterSerializer(serializers.ModelSerializer):
    events = TriageEventSerializer(many=True, read_only=True)
    conversation_id = serializers.IntegerField(source='conversation.id', read_only=True)

    class Meta:
        model = TriageEncounter
        fields = [
            'id',
            'conversation_id',
            'patient_name',
            'patient_age',
            'chief_complaint',
            'onset_time',
            'arrival_mode',
            'pain_score',
            'gcs',
            'vitals',
            'symptoms',
            'allergies',
            'medications',
            'past_history',
            'pregnancy_status',
            'red_flags',
            'triage_level',
            'disposition',
            'reassessment_due_at',
            'finalized_at',
            'finalized_by',
            'audit_log',
            'created_at',
            'updated_at',
            'events',
        ]
        read_only_fields = ['audit_log', 'finalized_at', 'finalized_by', 'created_at', 'updated_at']
