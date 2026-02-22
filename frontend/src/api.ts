const API_BASE = '/api'
const TOKEN_KEY = 'token'

/** Minimal patient shape for building context sent to Synapse (id, name, and all recorded clinical data). */
export interface PatientContextItem {
  id: string
  name?: string
  age?: string
  createdAt?: string
  symptoms?: string[]
  diagnosis?: string
  possible_diagnoses?: string[]
  treatment_plan?: string[]
  document?: string
  transcriptRecording?: Array<{ speaker: string; text: string }>
  [key: string]: unknown
}

/** Build a string summary of recorded patients for the AI to answer questions about them. */
export function formatPatientsContext(patients: PatientContextItem[]): string {
  if (!patients?.length) return ''
  const summary = patients.map((p) => {
    const transcript =
      Array.isArray(p.transcriptRecording) && p.transcriptRecording.length > 0
        ? p.transcriptRecording.map((l) => `${l.speaker}: ${l.text}`).join('\n')
        : ''
    return {
      id: p.id,
      name: p.name ?? '',
      age: p.age ?? '',
      createdAt: p.createdAt ?? '',
      symptoms: p.symptoms ?? [],
      diagnosis: p.diagnosis ?? '',
      possible_diagnoses: p.possible_diagnoses ?? [],
      treatment_plan: p.treatment_plan ?? [],
      document: p.document ?? '',
      transcript: transcript || '(none)',
    }
  })
  return JSON.stringify(summary, null, 2)
}
const REFRESH_KEY = 'refreshToken'

function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

/** Refresh access token using refresh token; returns new access token or null. */
async function refreshAccessToken(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh) return null
  const res = await fetch(`${API_BASE}/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
    credentials: 'include',
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const access = data.access
  if (!res.ok || typeof access !== 'string') return null
  localStorage.setItem(TOKEN_KEY, access)
  return access
}

async function request(path: string, options: RequestInit = {}, retried = false): Promise<Record<string, unknown>> {
  const url = `${API_BASE}${path}`
  let token = getStoredToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, { ...options, headers, credentials: 'include' })
  const data = await res.json().catch(() => ({})) as Record<string, unknown>

  if (res.status === 401 && !retried) {
    const newToken = await refreshAccessToken()
    if (newToken) return request(path, options, true)
  }

  if (!res.ok) throw new Error((data.detail as string) || (data.message as string) || res.statusText)
  return data
}

export const api = {
  login: (username: string, password: string) =>
    request('/auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/auth/me/'),
  extractAudio: (audioBlob: Blob, previousContext = '', transcript = '') => {
    const form = new FormData()
    form.append('audio', audioBlob, 'recording.webm')
    if (previousContext) form.append('previous_context', previousContext)
    if (transcript && transcript.trim()) form.append('transcript', transcript.trim())
    return request('/audio/extract/', { method: 'POST', body: form })
  },
  sendTextToSynapse: (transcript: string, previousContext = '', patientsContext = '') =>
    request('/intake-from-text/', {
      method: 'POST',
      body: JSON.stringify({
        transcript: transcript.trim(),
        previous_context: previousContext,
        ...(patientsContext.trim() ? { patients_context: patientsContext.trim() } : {}),
      }),
    }),
  listConversations: () => request('/conversations/'),
  getConversation: (id: string) => request(`/conversations/${id}/`),
  createConversation: (body?: Record<string, unknown>) =>
    request('/conversations/', { method: 'POST', body: JSON.stringify(body || {}) }),
  addTranscript: (id: string, body: Record<string, unknown>) =>
    request(`/conversations/${id}/transcripts/`, { method: 'POST', body: JSON.stringify(body) }),
  transcribe: (id: string, body: Record<string, unknown>) =>
    request(`/conversations/${id}/transcribe/`, { method: 'POST', body: JSON.stringify(body) }),
  summarize: (id: string) => request(`/conversations/${id}/summarize/`, { method: 'POST' }),
  exportEmr: (id: string, body: Record<string, unknown> = {}) =>
    request(`/conversations/${id}/export-emr/`, { method: 'POST', body: JSON.stringify(body) }),
  planForDiagnosis: (diagnosis: string, symptoms: string[] = [], document = '') =>
    request('/clinical/plan-for-diagnosis/', {
      method: 'POST',
      body: JSON.stringify({ diagnosis, symptoms, document }),
    }),
  // ER Triage — commented out
  // listTriageEncounters: () => request('/triage/encounters/'),
  // createTriageEncounter: (body: Record<string, unknown>) =>
  //   request('/triage/encounters/', { method: 'POST', body: JSON.stringify(body) }),
  // getTriageEncounter: (id: string) => request(`/triage/encounters/${id}/`),
  // updateTriageEncounter: (id: string, body: Record<string, unknown>) =>
  //   request(`/triage/encounters/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
  // scoreTriageEncounter: (id: string) =>
  //   request(`/triage/encounters/${id}/score/`, { method: 'POST' }),
  // finalizeTriageEncounter: (id: string) =>
  //   request(`/triage/encounters/${id}/finalize/`, { method: 'POST' }),
  // triageDocument: (id: string) =>
  //   request(`/triage/encounters/${id}/document/`),
}
