import json
import os
import re
from django.conf import settings


def _get_client():
    api_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None, None, "GEMINI_API_KEY not set"
    try:
        from google import genai
        from google.genai import types
        return (genai.Client(api_key=api_key), types, None)
    except ImportError:
        return None, None, "gemini not installed"


def _empty_result(error_msg=""):
    return {
        "error": error_msg,
        "missing": [],
        "question": None,
        "name": "",
        "age": "",
        "report": "",
        "vitals": {},
        "symptoms": [],
        "diagnosis": "",
        "possible_diagnoses": [],
        "treatment_plan": [],
        "document": "",
        "transcript": "",
    }


def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
    """
    Step 1: Transcribe the audio to text only. Returns verbatim transcript (exactly what was said).
    No extraction, no JSON — plain text only.
    """
    client, types, err = _get_client()
    if err:
        return ""

    prompt = """Transcribe this audio word for word. Output ONLY the exact words spoken — nothing else. No summary, no JSON, no labels. If you cannot make out words, use [unclear]. If there is silence, you may say [silence] or leave it blank. Do not add any patient names, diagnoses, or details that are not clearly spoken in the audio."""

    try:
        audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
        text_part = types.Part.from_text(text=prompt)
        user_content = types.UserContent([audio_part, text_part])
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[user_content],
        )
        text = (getattr(response, "text", None) or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```\s*$", "", text)
        return text.strip()
    except Exception:
        return ""


def intake_from_text(transcript_text: str, previous_context: str = "") -> dict:
    """
    Step 2: Gemini evaluates the transcript (text only). Extracts structure and builds clinical document.
    The transcript is exactly what was said; this call only interprets it.
    """
    client, types, err = _get_client()
    if err:
        return _empty_result(err)

    if not (transcript_text or "").strip():
        return _empty_result("No transcript to evaluate")

    context_line = f'\nPrevious context (if continuing):\n{previous_context}\n' if previous_context else ""

    prompt = """You are a medical documentation assistant. Below is a physician's dictation transcript. It may contain speech-recognition or dictation errors (misspellings, homophones, unclear words).

STRICT RULES — you must follow these exactly:
- Extract ONLY what is explicitly stated or clearly intended in the transcript. Do not infer diagnoses or add information the physician did not say.
- If the transcript does not mention something, leave it empty: "" for strings, [] for symptoms, {} for vitals.
- Do not invent patient names, ages, vitals, symptoms, or diagnoses. Do not use example or typical values.
- SPELLING: In all output (name, age, report, vitals, symptoms, diagnosis, document), use properly spelled words. Correct obvious dictation/ASR errors to standard medical terminology: correct drug names (e.g. "lisinopril" not "lisinapril"), condition names (e.g. "hypertension" not "hipertension"), anatomy, and common clinical terms. Preserve the physician’s intent; only normalize spelling and standardize medical terms.
- For the "document" field: write a short clinical paragraph using ONLY information from the transcript, with proper spelling and standard medical wording. For any section the physician did not mention, write "Not stated."

Extract only when clearly stated or clearly intended in the transcript:
- name: "" unless a patient name is explicitly said (spell names correctly if obvious)
- age: "" unless age is explicitly said
- report: "" unless chief complaint/reason for visit is explicitly said (use proper spelling)
- vitals: {} unless specific vitals (e.g. BP, HR, temp) are explicitly said — use standard labels and units
- symptoms: [] unless specific symptoms are explicitly said — use correctly spelled medical terms
- diagnosis: "" unless assessment/diagnosis is explicitly said — use correct spelling (e.g. ICD-style or standard terms)
- possible_diagnoses: array of 3 to 7 differential diagnoses the clinician should consider, based on the transcript and the clinical picture. Use standard medical/ICD-style terms. Include the primary diagnosis if stated, plus other likely alternatives (rule-outs, differentials). Order by likelihood or importance. Do not invent; base only on what the transcript and context support.
- treatment_plan: REQUIRED. You MUST always return a non-empty array of 4 to 12 concrete steps. Never return an empty array. Base steps on the clinical document (Synapse-style summary) and the primary diagnosis. Each step is one short, actionable sentence (e.g. "Start lisinopril 10 mg PO daily for BP", "Order HbA1c and BMP", "Follow up in 2 weeks", "Patient to monitor blood pressure at home"). Order logically: immediate interventions and medications first, then labs/imaging, then follow-up and patient instructions. If the transcript is minimal, still provide at least 4 reasonable steps (e.g. "Follow up in 2 weeks", "Return if symptoms worsen", "Continue current medications as prescribed", "Patient to monitor symptoms"). Use standard medical terminology and correct spelling.

Document: one short paragraph with ONLY information from the transcript, properly spelled and in clear clinical language. Use "Not stated" for any category not mentioned.
""" + context_line + """
Transcript to evaluate:
"""
    full_prompt = prompt + "\n" + (transcript_text or "").strip() + "\n\nReturn ONLY a valid JSON object with exactly these keys (no markdown, no code fence): \"missing\": [], \"question\": null, \"name\": string, \"age\": string, \"report\": string, \"vitals\": object, \"symptoms\": array of strings, \"diagnosis\": string, \"possible_diagnoses\": array of strings, \"treatment_plan\": array of strings (REQUIRED: must have at least 4 items), \"document\": string. Return only the JSON."

    try:
        user_content = types.UserContent(full_prompt)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[user_content],
        )
        text = (getattr(response, "text", None) or "").strip()
    except Exception as e:
        return _empty_result(str(e))

    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()

    try:
        data = json.loads(text)
        possible = data.get("possible_diagnoses")
        if not isinstance(possible, list):
            possible = []
        possible = [str(p).strip() for p in possible if p and str(p).strip()]
        treatment = data.get("treatment_plan")
        if not isinstance(treatment, list):
            treatment = []
        treatment = [str(t).strip() for t in treatment if t and str(t).strip()]
        # REQUIRED: ensure treatment_plan is never empty so the UI always shows steps
        if not treatment:
            treatment = [
                "Follow up as clinically indicated.",
                "Patient to return if symptoms worsen or new concerns arise.",
                "Continue current medications as prescribed unless otherwise noted.",
                "Reassess at next visit.",
            ]
        return {
            "error": "",
            "missing": data.get("missing") or [],
            "question": data.get("question"),
            "name": data.get("name") or "",
            "age": data.get("age") or "",
            "report": data.get("report") or "",
            "vitals": data.get("vitals") or {},
            "symptoms": data.get("symptoms") or [],
            "diagnosis": data.get("diagnosis") or "",
            "possible_diagnoses": possible,
            "treatment_plan": treatment,
            "document": data.get("document") or "",
        }
    except json.JSONDecodeError:
        return _empty_result("Gemini response was not valid JSON")


def intake_from_audio(
    audio_bytes: bytes,
    mime_type: str = "audio/webm",
    previous_context: str = "",
    client_transcript: str = "",
) -> dict:
    """
    Two-step flow: (1) Transcript = client_transcript if provided, else Gemini transcribes audio.
    (2) Gemini evaluates that transcript only. So "Clinician" = exactly what the user said.
    """
    # Step 1: Use client-provided transcript (e.g. from browser speech recognition) or transcribe audio
    if client_transcript and client_transcript.strip():
        transcript = client_transcript.strip()
    else:
        transcript = transcribe_audio(audio_bytes, mime_type=mime_type)
    if not transcript and not previous_context:
        return _empty_result("Could not transcribe audio")

    # Step 2: Gemini evaluates the transcript (text only) and returns structured output
    evaluated = intake_from_text(transcript, previous_context=previous_context)
    if evaluated.get("error"):
        return {**evaluated, "transcript": transcript}

    return {
        "error": "",
        "missing": evaluated.get("missing") or [],
        "question": evaluated.get("question"),
        "name": evaluated.get("name") or "",
        "age": evaluated.get("age") or "",
        "report": evaluated.get("report") or "",
        "vitals": evaluated.get("vitals") or {},
        "symptoms": evaluated.get("symptoms") or [],
        "diagnosis": evaluated.get("diagnosis") or "",
        "possible_diagnoses": evaluated.get("possible_diagnoses") or [],
        "treatment_plan": evaluated.get("treatment_plan") or [],
        "document": evaluated.get("document") or "",
        "transcript": transcript,
    }


def extract_from_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
    """
    Legacy: simple extraction only. Prefer intake_from_audio for intake flow.
    """
    result = intake_from_audio(audio_bytes, mime_type)
    return {
        "error": result.get("error", ""),
        "vitals": result.get("vitals", {}),
        "symptoms": result.get("symptoms", []),
        "diagnosis": result.get("diagnosis", ""),
        "possible_diagnoses": result.get("possible_diagnoses", []),
        "treatment_plan": result.get("treatment_plan", []),
        "transcript": result.get("transcript", ""),
    }
