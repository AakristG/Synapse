## For debugging and endpoints help

API runs at **http://127.0.0.1:8000**. Endpoints:

- `GET/POST /api/conversations/` — list or create conversations
- `GET /api/conversations/<id>/` — conversation detail with clinical note and patient summary
- `POST /api/conversations/<id>/transcripts/` — add transcript (role + text)
- `POST /api/conversations/<id>/transcribe/` — speech-to-text (body: `text` or `audio_url`; stub uses text)
- `POST /api/conversations/<id>/summarize/` — extract vitals, symptoms, ICD codes, treatments, patient summary
- `POST /api/conversations/<id>/export-emr/` — generate EMR export payload (audit record)
- `GET /api/recorded-patients/` — **authenticated**; list recorded patients (Synapse)
- `POST /api/recorded-patients/create/` — **authenticated**; create recorded patient (from Synapse or API)
- `GET /api/recorded-patients/<id>/` — **authenticated**; get one patient
- `DELETE /api/recorded-patients/<id>/` — **authenticated**; delete patient
- `POST /api/auth/login/` — login (body: `username`, `password`) → `{ access, refresh, user: { id, username, role } }`
- `GET /api/auth/me/` — current user (requires `Authorization: Bearer <access>`)
- `POST /api/audio/extract/` — **authenticated**; multipart `audio` file → Gemini extracts vitals, symptoms, diagnosis, transcript

## Demos

1. **Login**: Open http://localhost:5173/login and sign in (e.g. physician / physician123 after running `create_demo_users`).
2. **Dashboard**: Go to **Dashboard**. Use **Start recording** to record a short clinical message, then **Stop & extract**. Gemini will return vitals, symptoms, and diagnosis (requires `GEMINI_API_KEY` set).
3. **Conversations**: From the nav, open **Conversations** → **New conversation** (Consultation / Telehealth / Triage).
4. Add or paste transcript text, then **Add transcript** or **Transcribe (STT)**.
5. Click **Extract vitals, diagnosis, ICD codes & patient summary**.
6. View **Clinical note** and **Patient-friendly summary**; **Export to EMR** for an audit payload.

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