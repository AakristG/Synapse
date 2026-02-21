const API_BASE = '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || res.statusText);
  return data;
}

export const api = {
  listConversations: () => request('/conversations/'),
  getConversation: (id) => request(`/conversations/${id}/`),
  createConversation: (body) => request('/conversations/', { method: 'POST', body: JSON.stringify(body || {}) }),
  addTranscript: (id, body) => request(`/conversations/${id}/transcripts/`, { method: 'POST', body: JSON.stringify(body) }),
  transcribe: (id, body) => request(`/conversations/${id}/transcribe/`, { method: 'POST', body: JSON.stringify(body) }),
  summarize: (id) => request(`/conversations/${id}/summarize/`, { method: 'POST' }),
  exportEmr: (id, body = {}) => request(`/conversations/${id}/export-emr/`, { method: 'POST', body: JSON.stringify(body) }),
};
