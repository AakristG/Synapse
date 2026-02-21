"""
Gemini API: send audio and extract vitals, symptoms, diagnosis.
Requires GEMINI_API_KEY in environment.
"""
import json
import os
import re
from django.conf import settings


def extract_from_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
    """
    Send audio to Gemini and get structured extraction.
    Returns dict with keys: vitals (dict), symptoms (list), diagnosis (str), transcript (str).
    """
    api_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {
            "error": "GEMINI_API_KEY not set",
            "vitals": {},
            "symptoms": [],
            "diagnosis": "",
            "transcript": "",
        }

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return {
            "error": "google-genai not installed",
            "vitals": {},
            "symptoms": [],
            "diagnosis": "",
            "transcript": "",
        }

    client = genai.Client(api_key=api_key)
    prompt = """You are a medical documentation assistant. Listen to this clinical audio (clinician dictation or patient encounter).
Extract and return ONLY a valid JSON object with exactly these keys (no markdown, no extra text):
- "vitals": object with any mentioned vital signs, e.g. {"blood_pressure": "120/80", "heart_rate": "72", "temperature": "98.6"}
- "symptoms": array of strings, e.g. ["headache", "fatigue"]
- "diagnosis": string, brief clinical diagnosis or impression
- "transcript": string, full verbatim or summary of what was said

If something is not mentioned, use empty object/array or empty string. Return only the JSON."""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                prompt,
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
            ],
        )
    except Exception as e:
        return {
            "error": str(e),
            "vitals": {},
            "symptoms": [],
            "diagnosis": "",
            "transcript": "",
        }

    text = (response.text or "").strip()
    # Strip markdown code block if present
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()

    try:
        data = json.loads(text)
        return {
            "error": "",
            "vitals": data.get("vitals") or {},
            "symptoms": data.get("symptoms") or [],
            "diagnosis": data.get("diagnosis") or "",
            "transcript": data.get("transcript") or "",
        }
    except json.JSONDecodeError:
        return {
            "error": "Gemini response was not valid JSON",
            "vitals": {},
            "symptoms": [],
            "diagnosis": "",
            "transcript": text[:2000] if text else "",
        }
