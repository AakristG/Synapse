const API_BASE = '/api'

function getStoredToken(): string {
  return localStorage.getItem('token') || ''
}

async function request(path: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
  const url = `${API_BASE}${path}`
  const token = getStoredToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, { ...options, headers, credentials: 'include' })
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
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
}
