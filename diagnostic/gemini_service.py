"""
Gemini API: clinical intake from audio — collect name, age, report; extract vitals/symptoms/diagnosis; generate document.
Requires GEMINI_API_KEY in environment.
"""
import json
import os
import re
from django.conf import settings


def _get_client():
    api_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None, "GEMINI_API_KEY not set"
    try:
        from google import genai
        from google.genai import types
        return (genai.Client(api_key=api_key), types, None)
    except ImportError:
        return None, "google-genai not installed"


def intake_from_audio(audio_bytes: bytes, mime_type: str = "audio/webm", previous_context: str = "") -> dict:
    """
    Physician dictation only: listen to the physician's voice (consultation documentation).
    Extract name, age, report, vitals, symptoms, diagnosis and generate a clinical document.
    No conversation — no follow-up questions. Use "Not stated" for anything not said.
    """
    client, types, err = _get_client()
    if err:
        return {
            "error": err,
            "missing": [],
            "question": None,
            "name": "",
            "age": "",
            "report": "",
            "vitals": {},
            "symptoms": [],
            "diagnosis": "",
            "document": "",
            "transcript": "",
        }

    context_line = f'\nPrevious dictation context (merge or append if this is a continuation):\n{previous_context}\n' if previous_context else ""

    prompt = """You are a medical documentation assistant. You are listening to a PHYSICIAN'S DICTATION only. This is the physician documenting a consultation — there is NO conversation with a patient, just the physician speaking into the microphone to record the visit.

Your job: Listen to the physician's voice and extract everything they say, then produce a structured clinical document.

1) Extract from the dictation (only what the physician said): patient NAME, patient AGE, chief complaint/REPORT (reason for visit), any VITALS (e.g. blood pressure, heart rate, temperature), SYMPTOMS, and DIAGNOSIS/assessment.
2) Generate a short clinical DOCUMENT (plain text) with: Patient Name, Age, Chief Complaint, Vitals, Symptoms, Assessment/Diagnosis. Use "Not stated" for anything not mentioned.
3) Do NOT ask any follow-up questions. Do NOT simulate a conversation. This is documentation from a single physician dictation only.
""" + context_line + """
Return ONLY a valid JSON object with exactly these keys (no markdown, no code fence):
- "missing": [] (always empty — we do not ask questions)
- "question": null (always null)
- "name": string (from dictation or empty)
- "age": string (e.g. "45" or empty)
- "report": string (chief complaint or empty)
- "vitals": object, e.g. {"blood_pressure": "120/80", "heart_rate": "72"}
- "symptoms": array of strings
- "diagnosis": string
- "document": string — the full clinical note you generated
- "transcript": string — what the physician said (verbatim or summary)

Return only the JSON, no other text."""

    try:
        contents = [prompt, types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)]
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=contents,
        )
    except Exception as e:
        return {
            "error": str(e),
            "missing": [],
            "question": None,
            "name": "",
            "age": "",
            "report": "",
            "vitals": {},
            "symptoms": [],
            "diagnosis": "",
            "document": "",
            "transcript": "",
        }

    text = (response.text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()

    try:
        data = json.loads(text)
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
            "document": data.get("document") or "",
            "transcript": data.get("transcript") or "",
        }
    except json.JSONDecodeError:
        return {
            "error": "Gemini response was not valid JSON",
            "missing": [],
            "question": None,
            "name": "",
            "age": "",
            "report": "",
            "vitals": {},
            "symptoms": [],
            "diagnosis": "",
            "document": "",
            "transcript": text[:2000] if text else "",
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
        "transcript": result.get("transcript", ""),
    }
