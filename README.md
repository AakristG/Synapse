# Diagnostic Assistant — Axxess 2026

A **Diagnostic Assistant** that captures patient–clinician conversations and turns them into structured EMR data, diagnoses, and insights.

## Features

- **Login**: EMT, Nurse, or Physician sign in to a role-based dashboard (JWT auth).
- **Dashboard & audio**: Record clinical audio (dictation or encounter); **Gemini API** extracts vitals, symptoms, and diagnosis from the recording.
- **Speech-to-Text**: Convert clinician dictation or patient interview text into structured transcript entries (production: plug in Whisper, Azure Speech, etc.).
- **AI summarization**: Extract vitals, symptoms, and diagnosis from conversation text.
- **ICD code mapping & suggested treatments**: Auto-tag conditions and recommend medications (stub; replace with terminology APIs).
- **Patient-friendly summaries**: Plain-language recovery plans and follow-up instructions.
- **EMR integration**: Lightweight API and audit-ready payload for plug-in or external EMR systems.

## Real world applications

- Faster documentation during consultations  
- Telehealth transcription and diagnosis support  
- Emergency room triage documentation  
- Multilingual support (backend supports `language`; add translation in services)  
- Compliance and audit-ready record generation  

## Frameworks

- **Backend**: Django 6, Django REST Framework, SQLite
- **Frontend**: React 19, Vite 7, React Router

## Quick start

### 1. Backend (Django)

```bash
# From project root
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

API runs at **http://127.0.0.1:8000**. Endpoints:

- `GET/POST /api/conversations/` — list or create conversations
- `GET /api/conversations/<id>/` — conversation detail with clinical note and patient summary
- `POST /api/conversations/<id>/transcripts/` — add transcript (role + text)
- `POST /api/conversations/<id>/transcribe/` — speech-to-text (body: `text` or `audio_url`; stub uses text)
- `POST /api/conversations/<id>/summarize/` — extract vitals, symptoms, ICD codes, treatments, patient summary
- `POST /api/conversations/<id>/export-emr/` — generate EMR export payload (audit record)
- `POST /api/auth/login/` — login (body: `username`, `password`) → `{ access, refresh, user: { id, username, role } }`
- `GET /api/auth/me/` — current user (requires `Authorization: Bearer <access>`)
- `POST /api/audio/extract/` — **authenticated**; multipart `audio` file → Gemini extracts vitals, symptoms, diagnosis, transcript

**Demo users** (create with `python manage.py create_demo_users`):

- physician / physician123  
- nurse / nurse123  
- emt / emt123  

**Gemini audio extraction**: set `GEMINI_API_KEY` in the environment (or in Django settings) so the `/api/audio/extract/` endpoint can call the Gemini API.

### 2. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173** and proxies `/api` to the Django backend.

### 3. Try it

1. **Login**: Open http://localhost:5173/login and sign in (e.g. physician / physician123 after running `create_demo_users`).
2. **Dashboard**: Go to **Dashboard**. Use **Start recording** to record a short clinical message, then **Stop & extract**. Gemini will return vitals, symptoms, and diagnosis (requires `GEMINI_API_KEY` set).
3. **Conversations**: From the nav, open **Conversations** → **New conversation** (Consultation / Telehealth / Triage).
4. Add or paste transcript text, then **Add transcript** or **Transcribe (STT)**.
5. Click **Extract vitals, diagnosis, ICD codes & patient summary**.
6. View **Clinical note** and **Patient-friendly summary**; **Export to EMR** for an audit payload.

## Replacing stubs for production

- **Speech-to-Text**: In `diagnostic/services.py`, replace `transcribe_audio_stub()` with a call to your STT provider (e.g. OpenAI Whisper, Azure Speech, Google).
- **Summarization & extraction**: Replace `summarize_and_extract_stub()` with an LLM or NLP pipeline (e.g. OpenAI, Azure Health, or internal model).
- **ICD mapping**: Replace `map_icd_and_treatments_stub()` with a terminology service (e.g. CMS ICD-10 API, SNOMED, RxNorm).
- **Patient summaries**: Replace `patient_friendly_summary_stub()` with an LLM for readability and multilingual output.
- **EMR**: The `export-emr` endpoint returns a JSON payload; integrate with your EMR via REST or a lightweight plug-in that POSTs to this API or polls for exports.
