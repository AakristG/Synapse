import logging
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .gemini_service import (
    intake_from_audio,
    intake_from_text,
    plan_for_diagnosis,
    translate_document,
)
from .models import (
    ClinicalNote,
    Conversation,
    EMRExport,
    PatientSummary,
    Transcript,
    TriageEncounter,
    TriageEvent,
)
from .serializers import (
    ClinicalNoteSerializer,
    ConversationSerializer,
    PatientSummarySerializer,
    TranscriptSerializer,
    TriageEncounterSerializer,
)
from .services import (
    build_emr_payload,
    generate_session_id,
    map_icd_and_treatments_stub,
    patient_friendly_summary_stub,
    summarize_and_extract_stub,
    transcribe_audio_stub,
)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def conversation_list(request):
    if request.method == 'GET':
        conversations = Conversation.objects.all()[:50]
        serializer = ConversationSerializer(conversations, many=True)
        return Response(serializer.data)
    # POST: create new conversation
    data = request.data or {}
    session_id = data.get('session_id') or generate_session_id()
    conv = Conversation.objects.create(
        session_id=session_id,
        source=data.get('source', 'consultation'),
        language=data.get('language', 'en'),
        metadata=data.get('metadata', {}),
    )
    serializer = ConversationSerializer(conv)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def conversation_detail(request, pk):
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    serializer = ConversationSerializer(conv)
    out = serializer.data
    if hasattr(conv, 'clinical_note'):
        out['clinical_note'] = ClinicalNoteSerializer(conv.clinical_note).data
    else:
        out['clinical_note'] = None
    if hasattr(conv, 'patient_summary'):
        out['patient_summary'] = PatientSummarySerializer(conv.patient_summary).data
    else:
        out['patient_summary'] = None
    return Response(out)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_transcript(request, pk):
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    data = request.data or {}
    role = data.get('role', 'clinician')
    if role not in ('patient', 'clinician', 'system'):
        return Response({'detail': 'Invalid "role".'}, status=status.HTTP_400_BAD_REQUEST)
    text = (data.get('text') or '').strip()
    if not text:
        return Response({'detail': 'Missing "text".'}, status=status.HTTP_400_BAD_REQUEST)
    transcript = Transcript.objects.create(
        conversation=conv,
        role=role,
        text=text,
        raw_audio_duration_seconds=data.get('raw_audio_duration_seconds'),
        extra=data.get('extra', {}),
    )
    return Response(TranscriptSerializer(transcript).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def transcribe(request, pk):
    """Speech-to-Text: accept audio URL or raw text, append transcript to conversation."""
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    data = request.data or {}
    audio_url_or_text = data.get('text') or data.get('audio_url') or data.get('audio_text') or ''
    result = transcribe_audio_stub(audio_url_or_text)
    text = result['text']
    Transcript.objects.create(
        conversation=conv,
        role=data.get('role', 'clinician'),
        text=text,
        raw_audio_duration_seconds=result.get('duration_seconds'),
        extra={'confidence': result.get('confidence'), 'language': result.get('language')},
    )
    return Response({
        'transcript': result,
        'message': 'Transcript appended to conversation.',
    }, status=status.HTTP_200_OK)


def _get_conversation_text(conv):
    parts = list(conv.transcripts.order_by('created_at').values_list('text', flat=True))
    return '\n'.join(parts) or 'No transcript yet.'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def summarize(request, pk):
    """AI-powered summarization: extract vitals, symptoms, diagnosis; ICD mapping; patient-friendly summary."""
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    full_text = _get_conversation_text(conv)
    extracted = summarize_and_extract_stub(full_text)
    icd_and_treatments = map_icd_and_treatments_stub(extracted)
    patient_plain = patient_friendly_summary_stub(
        extracted,
        icd_and_treatments.get('suggested_treatments', []),
    )

    # Create or update ClinicalNote
    full_note = extracted.get('full_note_text', '')
    note, _ = ClinicalNote.objects.update_or_create(
        conversation=conv,
        defaults={
            'vitals': extracted.get('vitals', {}),
            'symptoms': extracted.get('symptoms', []),
            'assessment': extracted.get('assessment', ''),
            'diagnosis_summary': extracted.get('diagnosis_summary', ''),
            'icd_codes': icd_and_treatments.get('icd_codes', []),
            'suggested_treatments': icd_and_treatments.get('suggested_treatments', []),
            'full_note_text': full_note,
        },
    )

    # Create or update PatientSummary
    summary_obj, _ = PatientSummary.objects.update_or_create(
        conversation=conv,
        defaults={
            'summary_text': patient_plain.get('summary_text', ''),
            'recovery_plan': patient_plain.get('recovery_plan', ''),
            'medications_plain': patient_plain.get('medications_plain', []),
            'follow_up_instructions': patient_plain.get('follow_up_instructions', ''),
        },
    )

    return Response({
        'clinical_note': ClinicalNoteSerializer(note).data,
        'patient_summary': PatientSummarySerializer(summary_obj).data,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_emr(request, pk):
    """Lightweight EMR export: create audit record and return payload for plug-in/API."""
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    clinical_data = {}
    patient_data = {}
    if hasattr(conv, 'clinical_note'):
        clinical_data = ClinicalNoteSerializer(conv.clinical_note).data
    if hasattr(conv, 'patient_summary'):
        patient_data = PatientSummarySerializer(conv.patient_summary).data

    payload = build_emr_payload(conv.id, clinical_data, patient_data)
    export = EMRExport.objects.create(
        conversation=conv,
        external_system=request.data.get('external_system', ''),
        payload_snapshot=payload,
        status='sent',
    )
    return Response({
        'export_id': export.id,
        'status': export.status,
        'payload': payload,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def audio_extract(request):
    """
    Accept multipart form: 'audio' file, optional 'previous_context' (text from prior turn).
    Gemini runs clinical intake: asks for name/age/report if missing, extracts vitals/symptoms/diagnosis, returns document.
    """
    try:
        audio_file = request.FILES.get('audio')
        if not audio_file:
            return Response(
                {'detail': 'Missing "audio" file.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        audio_bytes = audio_file.read()
        # Strip parameters such as ";codecs=opus" and map common aliases to types Gemini accepts.
        raw_mime = (audio_file.content_type or '').split(';')[0].strip().lower()
        mime_aliases = {
            'audio/x-m4a': 'audio/mp4',
            'audio/m4a': 'audio/mp4',
            'audio/x-wav': 'audio/wav',
            'audio/wave': 'audio/wav',
            'audio/mp3': 'audio/mpeg',
            'video/webm': 'audio/webm',
        }
        mime = mime_aliases.get(raw_mime, raw_mime)
        if mime not in ('audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/flac'):
            mime = 'audio/webm'
        logging.getLogger(__name__).info(
            'audio/extract upload: content_type=%r -> mime=%r, bytes=%d', audio_file.content_type, mime, len(audio_bytes)
        )
        if len(audio_bytes) < 1000:
            return Response(
                {'detail': 'The recording is empty or too short. Hold the mic for a few seconds of speech and try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(audio_bytes) > 19 * 1024 * 1024:
            return Response(
                {'detail': 'The recording is too large to send inline (limit about 20 MB). Use a shorter clip.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        previous_context = request.data.get('previous_context') or request.POST.get('previous_context') or ''
        patients_context = (request.data.get('patients_context') or request.POST.get('patients_context') or '').strip()
        response_language = (request.data.get('response_language') or request.POST.get('response_language') or '').strip()
        # If client sent a transcript (e.g. from browser speech recognition), use it so "Clinician" = exactly what they said
        client_transcript = (request.data.get('transcript') or request.POST.get('transcript') or '').strip()
        result = intake_from_audio(
            audio_bytes,
            mime_type=mime,
            previous_context=previous_context,
            client_transcript=client_transcript,
            patients_context=patients_context,
            response_language=response_language,
        )
        if result.get('error') and not result.get('transcript') and not result.get('document'):
            err_msg = result.get('error', 'Unknown error')
            logging.getLogger(__name__).warning('audio/extract 502: %s', err_msg)
            return Response(
                {'detail': err_msg, **{k: result.get(k) for k in ['missing', 'question', 'name', 'age', 'report', 'vitals', 'symptoms', 'diagnosis', 'possible_diagnoses', 'treatment_plan', 'document', 'transcript']}},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({
            'missing': result.get('missing', []),
            'question': result.get('question'),
            'name': result.get('name', ''),
            'age': result.get('age', ''),
            'report': result.get('report', ''),
            'vitals': result.get('vitals', {}),
            'symptoms': result.get('symptoms', []),
            'diagnosis': result.get('diagnosis', ''),
            'possible_diagnoses': result.get('possible_diagnoses', []),
            'treatment_plan': result.get('treatment_plan', []),
            'document': result.get('document', ''),
            'transcript': result.get('transcript', ''),
            'error': result.get('error', ''),
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logging.getLogger(__name__).exception('Unhandled error in %s', request.path)
        return Response(
            {'detail': str(e), 'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def intake_from_text_api(request):
    """
    POST JSON: { "transcript": "...", "previous_context": "...", "patients_context": "..." (optional) }.
    patients_context: summary of recorded patients (e.g. JSON) so the AI can answer questions about them.
    Same response shape as audio/extract/ so the frontend can append to the conversation.
    """
    try:
        data = request.data or {}
        transcript_text = (data.get('transcript') or '').strip()
        if not transcript_text:
            return Response(
                {'detail': 'Missing or empty "transcript".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        previous_context = (data.get('previous_context') or '').strip()
        patients_context = (data.get('patients_context') or '').strip()
        response_language = (data.get('response_language') or '').strip()
        result = intake_from_text(
            transcript_text,
            previous_context=previous_context,
            patients_context=patients_context,
            response_language=response_language,
        )
        if result.get('error') and not result.get('transcript') and not result.get('document'):
            err_msg = result.get('error', 'Unknown error')
            logging.getLogger(__name__).warning('intake_from_text 502: %s', err_msg)
            return Response(
                {'detail': err_msg, **{k: result.get(k) for k in ['missing', 'question', 'name', 'age', 'report', 'vitals', 'symptoms', 'diagnosis', 'possible_diagnoses', 'treatment_plan', 'document', 'transcript']}},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({
            'missing': result.get('missing', []),
            'question': result.get('question'),
            'name': result.get('name', ''),
            'age': result.get('age', ''),
            'report': result.get('report', ''),
            'vitals': result.get('vitals', {}),
            'symptoms': result.get('symptoms', []),
            'diagnosis': result.get('diagnosis', ''),
            'possible_diagnoses': result.get('possible_diagnoses', []),
            'treatment_plan': result.get('treatment_plan', []),
            'document': result.get('document', ''),
            'transcript': transcript_text,
            'error': result.get('error', ''),
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logging.getLogger(__name__).exception('Unhandled error in %s', request.path)
        return Response(
            {'detail': str(e), 'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clinical_plan_for_diagnosis(request):
    """
    POST { diagnosis, symptoms?, document? } -> { treatment_plan, patient_summary }.
    Gemini returns a treatment plan and layman's summary for the selected diagnosis.
    """
    data = request.data or {}
    diagnosis = (data.get('diagnosis') or '').strip()
    if not diagnosis:
        return Response(
            {'detail': 'Missing or empty "diagnosis".'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    symptoms = data.get('symptoms')
    if not isinstance(symptoms, list):
        symptoms = []
    document = (data.get('document') or '').strip()
    summary_language = (data.get('summary_language') or data.get('language') or '').strip()
    result = plan_for_diagnosis(diagnosis, symptoms, document, summary_language)
    plan = result.get('treatment_plan') or []
    summary = (result.get('patient_summary') or '').strip()
    if result.get('error'):
        if not plan:
            plan = [
                f'Follow up as clinically indicated for {diagnosis}.',
                'Patient to return if symptoms worsen or new concerns arise.',
                'Continue current medications as prescribed unless otherwise noted.',
                'Reassess at next visit.',
            ]
        if not summary:
            summary = f'Your care team is considering {diagnosis} based on your visit. Follow the treatment steps listed and return for follow-up as needed.'
    return Response({
        'treatment_plan': plan,
        'patient_summary': summary,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def translate_document_api(request):
    """
    POST { document: string, target_language: string } -> { translated: string }.
    Uses Gemini to translate the clinical document to the requested language.
    """
    data = request.data or {}
    document_text = (data.get('document') or '').strip()
    target_language = (data.get('target_language') or '').strip()
    if not document_text:
        return Response(
            {'detail': 'Missing or empty "document".'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not target_language:
        return Response(
            {'detail': 'Missing or empty "target_language".'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    result = translate_document(document_text, target_language)
    if result.get('error'):
        return Response(
            {'detail': result.get('error', 'Translation failed'), 'translated': ''},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response({'translated': result.get('translated', '')}, status=status.HTTP_200_OK)


def _as_list(value):
    return value if isinstance(value, list) else []


def _as_dict(value):
    return value if isinstance(value, dict) else {}


def _score_triage(encounter):
    red_flags = _as_dict(encounter.red_flags)
    vitals = _as_dict(encounter.vitals)
    reasons = []

    if red_flags.get('airway_compromise'):
        reasons.append('Airway compromise')
    if red_flags.get('active_chest_pain'):
        reasons.append('Active chest pain')
    if red_flags.get('stroke_signs'):
        reasons.append('Stroke signs')
    if red_flags.get('sepsis_risk'):
        reasons.append('Sepsis risk')

    try:
        hr = vitals.get('heart_rate')
        spo2 = vitals.get('spo2')
        sbp = vitals.get('systolic_bp')
        rr = vitals.get('resp_rate')
        if hr is not None and float(hr) > 130:
            reasons.append('Heart rate > 130')
        if spo2 is not None and float(spo2) < 90:
            reasons.append('SpO2 < 90')
        if sbp is not None and float(sbp) < 90:
            reasons.append('Systolic BP < 90')
        if rr is not None and float(rr) > 30:
            reasons.append('Respiratory rate > 30')
    except (TypeError, ValueError):
        pass

    if reasons:
        level = 'ESI-1'
    elif encounter.pain_score >= 8 or encounter.gcs < 14:
        level = 'ESI-2'
    elif encounter.pain_score >= 5 or len(_as_list(encounter.symptoms)) >= 3:
        level = 'ESI-3'
    elif encounter.chief_complaint.strip():
        level = 'ESI-4'
    else:
        level = 'ESI-5'

    return level, reasons


def _triage_document_text(encounter):
    symptoms = ', '.join(_as_list(encounter.symptoms)) or 'None documented'
    return '\n'.join([
        'Emergency Department Triage Note (Draft)',
        f'Generated: {timezone.now().isoformat()}',
        '',
        'Patient',
        f'Name: {encounter.patient_name or "Unknown"}',
        f'Age: {encounter.patient_age or "Not stated"}',
        f'Arrival mode: {encounter.arrival_mode}',
        '',
        'Subjective',
        f'Chief complaint: {encounter.chief_complaint or "Not documented"}',
        f'Onset: {encounter.onset_time or "Not documented"}',
        f'Symptoms: {symptoms}',
        '',
        'Objective',
        f'Vitals: {_as_dict(encounter.vitals)}',
        f'Pain score: {encounter.pain_score}/10',
        f'GCS: {encounter.gcs}',
        f'Red flags: {_as_dict(encounter.red_flags)}',
        '',
        'Assessment',
        f'Acuity level: {encounter.triage_level}',
        '',
        'Plan',
        f'Disposition: {encounter.disposition or "Pending"}',
        f'Reassessment due: {encounter.reassessment_due_at.isoformat() if encounter.reassessment_due_at else "Not set"}',
        '',
        'Compliance',
        'AI-assisted draft requires clinician review and signature before final chart use.',
    ])


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def triage_encounter_list_create(request):
    if request.method == 'GET':
        encounters = TriageEncounter.objects.select_related('conversation').all()[:100]
        return Response(TriageEncounterSerializer(encounters, many=True).data)

    data = request.data or {}
    reassessment_minutes = data.get('reassessment_minutes', 15)
    try:
        reassessment_minutes = max(5, int(reassessment_minutes))
    except (TypeError, ValueError):
        reassessment_minutes = 15

    conv = Conversation.objects.create(
        session_id=data.get('session_id') or generate_session_id(),
        source='triage',
        language=data.get('language', 'en'),
        metadata={'workflow': 'er-triage', **_as_dict(data.get('metadata'))},
    )
    encounter = TriageEncounter.objects.create(
        conversation=conv,
        patient_name=(data.get('patient_name') or '').strip(),
        patient_age=(data.get('patient_age') or '').strip(),
        chief_complaint=(data.get('chief_complaint') or '').strip(),
        onset_time=(data.get('onset_time') or '').strip(),
        arrival_mode=data.get('arrival_mode') or 'walk-in',
        pain_score=max(0, min(10, int(data.get('pain_score') or 0))),
        gcs=max(3, min(15, int(data.get('gcs') or 15))),
        vitals=_as_dict(data.get('vitals')),
        symptoms=_as_list(data.get('symptoms')),
        allergies=_as_list(data.get('allergies')),
        medications=_as_list(data.get('medications')),
        past_history=_as_list(data.get('past_history')),
        pregnancy_status=(data.get('pregnancy_status') or '').strip(),
        red_flags=_as_dict(data.get('red_flags')),
        reassessment_due_at=timezone.now() + timedelta(minutes=reassessment_minutes),
    )
    TriageEvent.objects.create(
        encounter=encounter,
        event_type='arrival',
        note='Triage encounter created',
        created_by=getattr(request.user, 'username', '') or '',
    )
    return Response(TriageEncounterSerializer(encounter).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def triage_encounter_detail(request, pk):
    try:
        encounter = TriageEncounter.objects.get(pk=pk)
    except TriageEncounter.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(TriageEncounterSerializer(encounter).data)

    if encounter.finalized_at:
        return Response({'detail': 'Encounter is finalized and read-only.'}, status=status.HTTP_400_BAD_REQUEST)

    data = request.data or {}
    changed = []

    for field in ['patient_name', 'patient_age', 'chief_complaint', 'onset_time', 'arrival_mode', 'pregnancy_status', 'disposition']:
        if field in data:
            setattr(encounter, field, str(data.get(field) or '').strip())
            changed.append(field)

    for field in ['symptoms', 'allergies', 'medications', 'past_history']:
        if field in data:
            setattr(encounter, field, _as_list(data.get(field)))
            changed.append(field)

    for field in ['vitals', 'red_flags']:
        if field in data:
            setattr(encounter, field, _as_dict(data.get(field)))
            changed.append(field)

    if 'pain_score' in data:
        try:
            encounter.pain_score = max(0, min(10, int(data.get('pain_score'))))
            changed.append('pain_score')
        except (TypeError, ValueError):
            pass

    if 'gcs' in data:
        try:
            encounter.gcs = max(3, min(15, int(data.get('gcs'))))
            changed.append('gcs')
        except (TypeError, ValueError):
            pass

    if 'reassessment_minutes' in data:
        try:
            minutes = max(5, int(data.get('reassessment_minutes')))
            encounter.reassessment_due_at = timezone.now() + timedelta(minutes=minutes)
            changed.append('reassessment_due_at')
        except (TypeError, ValueError):
            pass

    if changed:
        audit = _as_list(encounter.audit_log)
        audit.append({
            'at': timezone.now().isoformat(),
            'by': getattr(request.user, 'username', '') or '',
            'fields': changed,
        })
        encounter.audit_log = audit[-200:]
        encounter.save()
        TriageEvent.objects.create(
            encounter=encounter,
            event_type='triage_updated',
            note=f"Updated fields: {', '.join(sorted(set(changed)))}",
            created_by=getattr(request.user, 'username', '') or '',
        )

    return Response(TriageEncounterSerializer(encounter).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def triage_score(request, pk):
    try:
        encounter = TriageEncounter.objects.get(pk=pk)
    except TriageEncounter.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    level, reasons = _score_triage(encounter)
    encounter.triage_level = level
    encounter.save(update_fields=['triage_level', 'updated_at'])
    TriageEvent.objects.create(
        encounter=encounter,
        event_type='scored',
        note=f'Scored {level}',
        created_by=getattr(request.user, 'username', '') or '',
    )
    return Response({
        'triage_level': level,
        'reasons': reasons,
        'encounter': TriageEncounterSerializer(encounter).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def triage_finalize(request, pk):
    try:
        encounter = TriageEncounter.objects.get(pk=pk)
    except TriageEncounter.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    missing = []
    if not encounter.patient_name.strip():
        missing.append('patient_name')
    if not encounter.chief_complaint.strip():
        missing.append('chief_complaint')
    if missing:
        return Response({'detail': 'Missing required fields.', 'missing': missing}, status=status.HTTP_400_BAD_REQUEST)

    encounter.finalized_at = timezone.now()
    encounter.finalized_by = getattr(request.user, 'username', '') or ''
    encounter.save(update_fields=['finalized_at', 'finalized_by', 'updated_at'])
    TriageEvent.objects.create(
        encounter=encounter,
        event_type='finalized',
        note='Triage finalized',
        created_by=encounter.finalized_by,
    )
    return Response(TriageEncounterSerializer(encounter).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def triage_document(request, pk):
    try:
        encounter = TriageEncounter.objects.get(pk=pk)
    except TriageEncounter.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    return Response({
        'encounter': TriageEncounterSerializer(encounter).data,
        'document_text': _triage_document_text(encounter),
        'generated_at': timezone.now().isoformat(),
        'compliance_note': 'Draft requires clinician review and signature before final chart use.',
    }, status=status.HTTP_200_OK)
