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

    prompt = """You are a medical documentation assistant. Below is a physician's dictation transcript — the exact words they said.

STRICT RULES — you must follow these exactly:
- Extract ONLY what is explicitly stated in the transcript. Do not infer, assume, or add anything.
- If the transcript does not mention something, leave it empty: "" for strings, [] for symptoms, {} for vitals.
- Do not invent patient names, ages, vitals, symptoms, or diagnoses. Do not use example or typical values.
- For the "document" field: list only facts that appear in the transcript. For any section the physician did not mention, write "Not stated." Do not fill in with plausible or common clinical text.

- The physician will always start by saying the patient's name, age, and description. 

Extract only when clearly stated in the transcript:
- name: "" unless a patient name is explicitly said
- age: "" unless age is explicitly said
- report: "" unless chief complaint/reason for visit is explicitly said
- vitals: {} unless specific vitals (e.g. BP, HR, temp) are explicitly said — then use only those
- symptoms: [] unless specific symptoms are explicitly said — then only those
- diagnosis: "" unless assessment/diagnosis is explicitly said

Document: one short paragraph that includes ONLY information from the transcript. Use "Not stated" for any category not mentioned. Do not generate a single fact that is not in the transcript.
""" + context_line + """
Transcript to evaluate:
"""
    full_prompt = prompt + "\n" + (transcript_text or "").strip() + "\n\nReturn ONLY a valid JSON object with exactly these keys (no markdown, no code fence): \"missing\": [], \"question\": null, \"name\": string, \"age\": string, \"report\": string, \"vitals\": object, \"symptoms\": array of strings, \"diagnosis\": string, \"document\": string. Return only the JSON."

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
        "transcript": result.get("transcript", ""),
    }
