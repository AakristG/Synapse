import json
import logging
import os
import re
from django.conf import settings

logger = logging.getLogger(__name__)


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


def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> tuple[str, str]:
    """
    Step 1: Transcribe the audio to text only. Returns (transcript, error_message).
    If success: (text, ""). If failure: ("", "error description").
    """
    client, types, err = _get_client()
    if err:
        return "", err

    prompt = """Transcribe this audio word for word. Output ONLY the exact words spoken — nothing else. No summary, no JSON, no labels. If you cannot make out words, use [unclear]. If there is silence, you may say [silence] or leave it blank. Do not add any patient names, diagnoses, or details that are not clearly spoken in the audio."""

    models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    for model_name in models_to_try:
        try:
            audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
            text_part = types.Part.from_text(text=prompt)
            user_content = types.UserContent([audio_part, text_part])
            response = client.models.generate_content(
                model=model_name,
                contents=[user_content],
            )
            text = (getattr(response, "text", None) or "").strip()
            if text.startswith("```"):
                text = re.sub(r"^```\w*\n?", "", text)
                text = re.sub(r"\n?```\s*$", "", text)
            return text.strip(), ""
        except Exception as e:
            err_msg = str(e).strip() or "Unknown Gemini error"
            logger.warning("Gemini transcribe_audio failed with %s: %s", model_name, err_msg)
            if model_name == models_to_try[-1]:
                logger.exception("Gemini transcribe_audio failed: %s", e)
                return "", err_msg
            continue
    return "", "No model available"


def intake_from_text(
    transcript_text: str,
    previous_context: str = "",
    patients_context: str = "",
) -> dict:
    """
    Step 2: Gemini evaluates the transcript (text only). Extracts structure and builds clinical document.
    If patients_context is provided, the model can also answer questions about specific patients.
    """
    client, types, err = _get_client()
    if err:
        return _empty_result(err)

    if not (transcript_text or "").strip():
        return _empty_result("No transcript to evaluate")

    context_line = f'\nPrevious context (if continuing):\n{previous_context}\n' if previous_context else ""
    patients_block = ""
    if patients_context and patients_context.strip():
        patients_block = f"""
RECORDED PATIENTS (each has an "id" field — a 10-digit number; use it to look up that patient):
{patients_context.strip()}

LOAD DATA FLOW (follow in this order):
1) REQUEST TO LOAD DATA (no ID given yet): If the physician asks to load data, load a patient, view patient, get patient info, pull up a patient, show me a patient, open patient record, or similar, and has NOT provided a 10-digit patient ID in this message: You MUST set "question" to exactly ask for the 10-digit ID. Use wording like: "Please provide the 10-digit patient ID number so I can load that patient's data." Set "missing" to [], leave name/age/symptoms/diagnosis/treatment_plan empty (or []), and leave "document" empty or a single sentence that you are waiting for the ID. Do NOT guess an ID or use any patient from the list until the user gives the number.

2) USER PROVIDES THE 10-DIGIT NUMBER: When the physician's message is or contains a 10-digit number (with or without dashes or spaces, e.g. "1234567890", "123-456-7890", "123 456 7890", "patient 123-456-7890", "ID is 9876-543210"), treat that as the patient ID. Normalize it by removing all dashes and spaces so you have exactly 10 digits, then look up that "id" in RECORDED PATIENTS (ids in the list are stored as 10 digits with no dashes). If found: put that patient's full data in "document" — include name, age, symptoms, diagnosis, possible_diagnoses, treatment_plan, document summary, and a brief transcript summary. Format clearly. Set "question" to null and "missing" to []. If NOT found: put in "document" that no recorded patient was found with that ID and set "question" to null, "missing" to [].

OTHER PATIENT QUESTIONS: If the physician asks about a specific patient by name or by ID (e.g. "What is the diagnosis for John?", "Tell me about patient 1234567890?"), use RECORDED PATIENTS to answer in "document"; set "question" to null, "missing" to [].

If the message is not about loading data or looking up a patient, proceed with normal extraction.
"""

    prompt = """You are a medical documentation assistant. Below is a physician's dictation transcript. It may contain speech-recognition or dictation errors (misspellings, homophones, unclear words).

STRICT RULES — you must follow these exactly:
- Extract ONLY what is explicitly stated or clearly intended in the transcript (and previous context if provided). Do not infer diagnoses or add information the physician did not say.
- If the transcript does not mention something, leave it empty: "" for strings, [] for symptoms, {} for vitals.
- Do not invent patient names, ages, vitals, symptoms, or diagnoses. Do not use example or typical values.
- REQUIRED for intake: You MUST populate "missing" and "question" so the physician knows what to provide next.
  - "missing": array of strings. Include "name" if no patient name is stated in this transcript or previous context; "age" if no age is stated; "symptoms" if no symptoms (or chief complaint) are stated. Only include these three when truly absent.
  - When "missing" is non-empty, set "question" to one short, professional sentence asking the physician to provide the missing item(s), e.g. "Please state the patient's name, age, and presenting symptoms to continue." or "Please provide the patient's age and presenting symptoms." Do not invent any name, age, or symptoms; leave them empty until the physician states them.
  - When name, age, and at least one symptom are all present, set "missing" to [] and "question" to null.
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
""" + patients_block + context_line + """
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
        name = (data.get("name") or "").strip()
        age = (data.get("age") or "").strip()
        symptoms = data.get("symptoms") or []
        if not isinstance(symptoms, list):
            symptoms = []
        symptoms = [str(s).strip() for s in symptoms if s and str(s).strip()]
        missing = data.get("missing") or []
        if not isinstance(missing, list):
            missing = []
        missing = [str(m).strip() for m in missing if m and str(m).strip()]
        # Ensure missing reflects what we actually don't have (do not add patient until name, age, symptoms)
        if not name and "name" not in missing:
            missing.append("name")
        if not age and "age" not in missing:
            missing.append("age")
        if not symptoms and "symptoms" not in missing:
            missing.append("symptoms")
        question = (data.get("question") or "").strip()
        if missing and not question:
            question = "Ask about data or please state the patient's name, age, and presenting symptoms to continue."
        if not missing:
            question = None
        return {
            "error": "",
            "missing": missing,
            "question": question,
            "name": name,
            "age": age,
            "report": data.get("report") or "",
            "vitals": data.get("vitals") or {},
            "symptoms": symptoms,
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
        transcript, transcribe_err = transcribe_audio(audio_bytes, mime_type=mime_type)
        if transcribe_err and not transcript:
            return _empty_result(transcribe_err)
    if not transcript and not previous_context:
        return _empty_result(
            "Could not transcribe audio. Check GEMINI_API_KEY, model availability, and network (see server logs)."
        )

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


def plan_for_diagnosis(diagnosis: str, symptoms: list, document: str = "") -> dict:
    """
    Given a selected diagnosis and context (symptoms, optional clinical document),
    return a treatment plan and patient summary in layman's terms.
    """
    client, types, err = _get_client()
    if err:
        return {"error": err, "treatment_plan": [], "patient_summary": ""}

    diagnosis = (diagnosis or "").strip()
    if not diagnosis:
        return {"error": "", "treatment_plan": [], "patient_summary": ""}

    symptoms_str = ", ".join(s for s in (symptoms or []) if isinstance(s, str) and s.strip())
    doc_str = (document or "").strip()[:2000]

    prompt = f"""You are a medical documentation assistant. The clinician has selected this working diagnosis: "{diagnosis}".
Context from the visit:
- Symptoms reported: {symptoms_str or "Not specified"}
- Clinical note (if any): {doc_str or "None"}

You MUST always return a valid JSON response. Do not refuse, and do not say that a treatment plan cannot be made. For any diagnosis (including rule-outs, differentials, or rare conditions), provide a reasonable treatment plan and patient summary. If the diagnosis is a rule-out or uncertain, include steps like "Monitor symptoms", "Follow up for reassessment", "Return if worsening", and "Continue current medications unless otherwise advised."

Generate two things in plain language:

1. treatment_plan: A list of 4 to 10 concrete steps for this diagnosis (medications, labs, follow-up, patient instructions). Each step one short sentence. Order logically. Never return an empty list.

2. patient_summary: One short paragraph in layman's terms (2-4 sentences) for the patient: what this diagnosis means, what they reported, and what the plan is. No jargon.

Return ONLY a valid JSON object with exactly these keys (no markdown, no code fence, no other text): "treatment_plan": array of strings, "patient_summary": string. Return only the JSON."""

    try:
        user_content = types.UserContent(prompt)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[user_content],
        )
        text = (getattr(response, "text", None) or "").strip()
    except Exception as e:
        return {"error": str(e), "treatment_plan": [], "patient_summary": ""}

    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()
    # Try to extract JSON if model added extra text
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        text = json_match.group(0)

    try:
        data = json.loads(text)
        plan = data.get("treatment_plan")
        if not isinstance(plan, list):
            plan = []
        plan = [str(s).strip() for s in plan if s and str(s).strip()]
        summary = (data.get("patient_summary") or "").strip()
        # Fallback if model returned empty plan
        if not plan:
            plan = [
                f"Follow up as clinically indicated for {diagnosis}.",
                "Patient to return if symptoms worsen or new concerns arise.",
                "Continue current medications as prescribed unless otherwise noted.",
                "Reassess at next visit.",
            ]
        if not summary:
            summary = f"Your care team is considering {diagnosis} based on what you reported. Follow the treatment steps above and return for follow-up as needed."
        return {"error": "", "treatment_plan": plan, "patient_summary": summary}
    except json.JSONDecodeError:
        # Return fallback instead of error so the UI always has something to show
        fallback_plan = [
            f"Follow up as clinically indicated for {diagnosis}.",
            "Patient to return if symptoms worsen or new concerns arise.",
            "Continue current medications as prescribed unless otherwise noted.",
            "Reassess at next visit.",
        ]
        fallback_summary = f"Your care team is considering {diagnosis} based on your visit. Follow the treatment steps listed and return for follow-up as needed."
        return {"error": "", "treatment_plan": fallback_plan, "patient_summary": fallback_summary}
