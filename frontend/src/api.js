const API_BASE = '/api';

function getStoredToken() {
  return localStorage.getItem('token') || '';
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const token = getStoredToken();
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, { ...options, headers, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || res.statusText);
  return data;
}

export const api = {
  login: (username, password) =>
    request('/auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/auth/me/'),
  extractAudio: (audioBlob, previousContext = '', transcript = '') => {
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    if (previousContext) form.append('previous_context', previousContext);
    if (transcript && transcript.trim()) form.append('transcript', transcript.trim());
    return request('/audio/extract/', { method: 'POST', body: form });
  },
  listConversations: () => request('/conversations/'),
  getConversation: (id) => request(`/conversations/${id}/`),
  createConversation: (body) => request('/conversations/', { method: 'POST', body: JSON.stringify(body || {}) }),
  addTranscript: (id, body) => request(`/conversations/${id}/transcripts/`, { method: 'POST', body: JSON.stringify(body) }),
  transcribe: (id, body) => request(`/conversations/${id}/transcribe/`, { method: 'POST', body: JSON.stringify(body) }),
  summarize: (id) => request(`/conversations/${id}/summarize/`, { method: 'POST' }),
  exportEmr: (id, body = {}) => request(`/conversations/${id}/export-emr/`, { method: 'POST', body: JSON.stringify(body) }),
};
