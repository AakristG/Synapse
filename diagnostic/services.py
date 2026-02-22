"""
Diagnostic assistant services.
Stub implementations for Speech-to-Text, summarization, ICD mapping, and patient summaries.
"""
import re
import uuid
from typing import Any

# Mock ICD-10 lookup (extend with real terminology service)
ICD_SAMPLE = {
    'hypertension': {'code': 'I10', 'description': 'Essential (primary) hypertension'},
    'diabetes': {'code': 'E11.9', 'description': 'Type 2 diabetes mellitus without complications'},
    'uti': {'code': 'N39.0', 'description': 'Urinary tract infection, site not specified'},
    'flu': {'code': 'J11.1', 'description': 'Influenza with other respiratory manifestations'},
    'anxiety': {'code': 'F41.9', 'description': 'Anxiety disorder, unspecified'},
    'copd': {'code': 'J44.9', 'description': 'COPD unspecified'},
    'headache': {'code': 'R51', 'description': 'Headache'},
    'back pain': {'code': 'M54.9', 'description': 'Dorsalgia, unspecified'},
}


def generate_session_id() -> str:
    return str(uuid.uuid4())


def transcribe_audio_stub(audio_url_or_text: str) -> dict[str, Any]:
    """
    Stub: In production, call Speech-to-Text (e.g. Whisper, Azure Speech).
    If input looks like text, treat as pre-transcribed.
    """
    text = audio_url_or_text.strip()
    if not text or text.startswith('http'):
        text = 'Patient reports headache and fatigue for three days. No fever. Blood pressure 128 over 82.'
    return {
        'text': text,
        'language': 'en',
        'confidence': 0.95,
        'duration_seconds': None,
    }


def summarize_and_extract_stub(transcript_text: str) -> dict[str, Any]:
    """
    Stub: Extract vitals, symptoms, assessment from transcript.
    Replace with NLP/LLM extraction in production.
    """
    text = transcript_text.lower()
    vitals = {}
    if 'blood pressure' in text or 'bp' in text:
        vitals['blood_pressure'] = '128/82 mmHg'
    if 'heart rate' in text or 'pulse' in text:
        vitals['heart_rate'] = '78 bpm'
    if 'temperature' in text or 'temp' in text or 'fever' in text:
        vitals['temperature'] = '98.6°F'

    symptoms = []
    for phrase in ['headache', 'fatigue', 'fever', 'cough', 'pain', 'nausea', 'dizziness']:
        if phrase in text:
            symptoms.append(phrase)

    assessment = 'Clinical assessment based on patient history and reported symptoms.'
    diagnosis_summary = 'Provisional diagnosis for documentation. Confirm with full workup.'

    return {
        'vitals': vitals,
        'symptoms': symptoms if symptoms else ['general complaint'],
        'assessment': assessment,
        'diagnosis_summary': diagnosis_summary,
        'full_note_text': f"Assessment: {assessment}\nDiagnosis: {diagnosis_summary}\nVitals: {vitals}\nSymptoms: {', '.join(symptoms) if symptoms else 'Not specified'}.",
    }


def map_icd_and_treatments_stub(clinical_note: dict[str, Any]) -> dict[str, Any]:
    """
    Stub: Map conditions to ICD-10 and suggest treatments.
    Replace with terminology API (e.g. CMS ICD-10, drug DB) in production.
    """
    text = (clinical_note.get('diagnosis_summary') or '') + ' ' + (clinical_note.get('full_note_text') or '')
    text = text.lower()
    icd_codes = []
    for term, data in ICD_SAMPLE.items():
        if term in text:
            icd_codes.append({'code': data['code'], 'description': data['description']})
    if not icd_codes:
        icd_codes = [{'code': 'R69', 'description': 'Illness, unspecified'}]

    suggested_treatments = []
    if 'headache' in text:
        suggested_treatments.append({'name': 'Acetaminophen or ibuprofen', 'type': 'medication', 'notes': 'As needed for pain'})
    if 'hypertension' in text or 'blood pressure' in text:
        suggested_treatments.append({'name': 'Lifestyle modification; consider antihypertensive if persistent', 'type': 'recommendation', 'notes': ''})
    if 'uti' in text:
        suggested_treatments.append({'name': 'Antibiotic per sensitivity', 'type': 'medication', 'notes': 'e.g. nitrofurantoin or trimethoprim-sulfa if appropriate'})

    return {'icd_codes': icd_codes, 'suggested_treatments': suggested_treatments}


def patient_friendly_summary_stub(clinical_note: dict[str, Any], treatments: list) -> dict[str, Any]:
    """
    Stub: Turn clinical content into plain-language summary and recovery plan.
    Replace with LLM in production for better readability and multilingual support.
    """
    summary = "Based on today's visit, here's a simple summary of what we discussed and what you can do next."
    recovery = "Rest as needed. Take any prescribed or over-the-counter medicines as directed. Contact us if symptoms worsen or new symptoms appear."
    meds_plain = [f"{t.get('name', '')} – {t.get('notes', '')}" for t in treatments if t.get('type') == 'medication']
    follow_up = "Follow up with your doctor as recommended, or sooner if you have concerns."

    return {
        'summary_text': summary,
        'recovery_plan': recovery,
        'medications_plain': meds_plain,
        'follow_up_instructions': follow_up,
    }


def build_emr_payload(conversation_id: int, clinical_note: dict, patient_summary: dict) -> dict[str, Any]:
    """Build a lightweight payload for EMR plug-in / API export (audit-ready)."""
    return {
        'conversation_id': conversation_id,
        'clinical_note': clinical_note,
        'patient_summary': patient_summary,
        'version': '1.0',
    }
