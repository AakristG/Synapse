from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Conversation, Transcript, ClinicalNote, PatientSummary, EMRExport
from .gemini_service import intake_from_audio, plan_for_diagnosis
from .serializers import (
    ConversationSerializer,
    TranscriptSerializer,
    ClinicalNoteSerializer,
    PatientSummarySerializer,
)
from .services import (
    generate_session_id,
    transcribe_audio_stub,
    summarize_and_extract_stub,
    map_icd_and_treatments_stub,
    patient_friendly_summary_stub,
    build_emr_payload,
)


@api_view(['GET', 'POST'])
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
def add_transcript(request, pk):
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    data = request.data or {}
    role = data.get('role', 'clinician')
    text = data.get('text', '').strip()
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
def _generate_patient_id():
    import random
    return str(random.randint(1000000000, 9999999999))
def recorded_patients_create(request):
    """Create a recorded patient (from Synapse web or API)."""
    data = request.data or {}
    external_id = data.get('id') or _generate_patient_id()
    name = (data.get('name') or '').strip() or 'Unknown'
    age = (data.get('age') or '').strip()
    payload = {k: v for k, v in data.items() if k not in ('id', 'name', 'age')}
    if not payload.get('createdAt'):
        from django.utils import timezone
        payload['createdAt'] = timezone.now().isoformat()
    patient = RecordedPatient.objects.create(
        external_id=external_id,
        name=name,
        age=age,
        source='synapse',
        payload=payload,
    )
    return Response({
        'id': patient.external_id,
        'name': patient.name,
        'age': patient.age,
        'createdAt': patient.created_at.isoformat(),
        **patient.payload,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recorded_patients_list(request):
    """List recorded patients (Synapse + Twilio). Same shape as frontend expects."""
    patients = RecordedPatient.objects.all()[:100]
    out = []
    for p in patients:
        out.append({
            'id': p.external_id,
            'name': p.name or 'Unknown',
            'age': p.age or '',
            'createdAt': p.created_at.isoformat() if p.created_at else '',
            **p.payload,
        })
    return Response(out)


    }, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def recorded_patient_delete(request, external_id):
    """Delete a recorded patient by external_id."""
    try:
        patient = RecordedPatient.objects.get(external_id=external_id)
    except RecordedPatient.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    patient.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


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
        mime = audio_file.content_type or 'audio/webm'
        if mime not in ('audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'):
            mime = 'audio/webm'
        previous_context = request.data.get('previous_context') or request.POST.get('previous_context') or ''
        # If client sent a transcript (e.g. from browser speech recognition), use it so "Clinician" = exactly what they said
        client_transcript = (request.data.get('transcript') or request.POST.get('transcript') or '').strip()
        result = intake_from_audio(
            audio_bytes, mime_type=mime, previous_context=previous_context, client_transcript=client_transcript
        )
        if result.get('error') and not result.get('transcript') and not result.get('document'):
            return Response(
                {'detail': result['error'], **{k: result.get(k) for k in ['missing', 'question', 'name', 'age', 'report', 'vitals', 'symptoms', 'diagnosis', 'possible_diagnoses', 'treatment_plan', 'document', 'transcript']}},
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
    result = plan_for_diagnosis(diagnosis, symptoms, document)
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
