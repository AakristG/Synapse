import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import './ConversationList.css'

interface Conversation {
  id: number
  session_id: string
  source: string
  created_at: string
  transcripts?: { id: number }[]
}

export default function ConversationList() {
  const [list, setList] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [source, setSource] = useState('consultation')

  useEffect(() => {
    api.listConversations()
      .then((data) => setList(Array.isArray(data) ? (data as Conversation[]) : []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  const createNew = () => {
    setCreating(true)
    setError(null)
    api.createConversation({ source })
      .then((conv) => { window.location.assign(`/conversations/${(conv as Conversation).id}`) })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Failed'); setCreating(false) })
  }

  if (loading) return <div className="page-loading">Loading conversations…</div>
  return (
    <div className="conversation-list">
      <div className="list-header">
        <h1>Conversations</h1>
        <div className="create-row">
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="consultation">Consultation</option>
            <option value="telehealth">Telehealth</option>
            <option value="triage">Emergency Triage</option>
            <option value="other">Other</option>
          </select>
          <button onClick={createNew} disabled={creating}>
            {creating ? 'Creating…' : 'New conversation'}
          </button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {list.length === 0 && !error && (
        <p className="empty">No conversations yet. Start one with "New conversation".</p>
      )}
      <ul className="conversation-cards">
        {list.map((c) => (
          <li key={c.id}>
            <Link to={`/conversations/${c.id}`} className="card">
              <span className="card-source">{c.source}</span>
              <span className="card-id">{c.session_id}</span>
              <span className="card-date">{new Date(c.created_at).toLocaleString()}</span>
              {c.transcripts?.length > 0 && (
                <span className="card-meta">{c.transcripts.length} transcript(s)</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
