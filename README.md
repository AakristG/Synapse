# Synapse - Connecting information at the speed of thought

A **Diagnostic Assistant** that captures patient–clinician conversations and turns them into structured EMR data, diagnoses, and insights.

## Features

- **Login**: EMT, Nurse, or Physician sign in to their respective dashboard.
- **Dashboard & audio**: Record clinical audio or get text input where Synapse uses **Gemini API** to extract vitals, symptoms, and diagnosis from the recording.
- **Speech-to-Text**: Convert clinician or patient interview text from a select audio or text in another language into structured transcript entries
- **AI summarization**: Extract vitals, symptoms, and diagnosis from audio, text, or file input.
- **ICD code mapping & suggested treatments**: Auto-tag conditions and recommend medications with physicist's final approval
- **Patient-friendly summaries**: Plain-language recovery plans and follow-up instructions.
- **EMR integration**: Audit ready payload for external EMR systems.

## Real world applications

- Faster documentation during consultations with the help of AI tool
- Telehealth transcription with diagnosis and recovery plans support  
- Emergency room triage documentation  
- Multilingual support for documentation support
- Compliance and audit record generation 

## Frameworks and Languages

- **Backend**: Django, Django REST Framework, SQLite, Python
- **Frontend**: React, Vite, TypeScript, CSS
- **AI**: Gemini API (Gemini 2.5 Flash)

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

**Demo users** (create with `python manage.py create_demo_users`):

- physician / physician123  
- nurse / nurse123  
- emt / emt123  

**Gemini audio extraction**: set `GEMINI_API_KEY` in the environment (or in Django settings) so the `/api/audio/extract/` endpoint can call the Gemini API.

For more information about endpoints, check demos.md.

### 2. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173** and proxies `/api` to the Django backend.

