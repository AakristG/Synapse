import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import './ConversationDetail.css'

export default function ConversationDetail() {
  const { id } = useParams()
  const [conv, setConv] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [transcriptText, setTranscriptText] = useState('')
  const [transcriptRole, setTranscriptRole] = useState('clinician')
  const [busy, setBusy] = useState(null)
  const [emrExport, setEmrExport] = useState(null)

  const load = () => {
    setError(null)
    api.getConversation(id)
      .then(setConv)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [id])

  const addTranscript = () => {
    if (!transcriptText.trim()) return
    setBusy('add')
    api.addTranscript(id, { role: transcriptRole, text: transcriptText.trim() })
      .then(() => { setTranscriptText(''); load() })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(null))
  }

  const transcribe = () => {
    setBusy('transcribe')
    api.transcribe(id, { text: transcriptText.trim() || 'Patient reports headache and fatigue. No fever. BP 128/82.', role: transcriptRole })
      .then(() => { setTranscriptText(''); load() })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(null))
  }

  const summarize = () => {
    setBusy('summarize')
    api.summarize(id)
      .then(load)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(null))
  }

  const exportEmr = () => {
    setBusy('emr')
    api.exportEmr(id, { external_system: 'demo_emr' })
      .then((data) => { setEmrExport(data); load() })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(null))
  }

  if (loading && !conv) return <div className="page-loading">Loading…</div>

  const note = conv?.clinical_note
  const summary = conv?.patient_summary
  const hasTranscripts = conv?.transcripts?.length > 0

  return (
    <div className="conversation-detail">
      <div className="detail-header">
        <Link to="/" className="back">← Conversations</Link>
        <h1>Session: {conv?.session_id || id}</h1>
        <span className="badge">{conv?.source}</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <section className="section transcript-section">
        <h2>Conversation / Dictation</h2>
        <p className="hint">Add dialogue or paste clinician dictation. Use “Transcribe” to run speech-to-text (demo: paste text as input).</p>
        <div className="input-row">
          <select value={transcriptRole} onChange={(e) => setTranscriptRole(e.target.value)}>
            <option value="clinician">Clinician</option>
            <option value="patient">Patient</option>
          </select>
          <textarea
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Paste or type transcript / dictation…"
            rows={3}
          />
          <div className="button-row">
            <button onClick={addTranscript} disabled={busy || !transcriptText.trim()}>
              {busy === 'add' ? 'Adding…' : 'Add transcript'}
            </button>
            <button onClick={transcribe} disabled={busy} className="secondary">
              {busy === 'transcribe' ? 'Transcribing…' : 'Transcribe (STT)'}
            </button>
          </div>
        </div>
        {hasTranscripts && (
          <ul className="transcript-list">
            {conv.transcripts.map((t) => (
              <li key={t.id} className={`role-${t.role}`}>
                <span className="role">{t.role}</span>
                <span className="text">{t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section actions-section">
        <h2>AI summarization &amp; coding</h2>
        <button
          onClick={summarize}
          disabled={busy || !hasTranscripts}
          className="primary"
        >
          {busy === 'summarize' ? 'Processing…' : 'Extract vitals, diagnosis, ICD codes & patient summary'}
        </button>
      </section>

      {note && (
        <section className="section clinical-section">
          <h2>Clinical note (EMR-ready)</h2>
          <div className="note-grid">
            {Object.keys(note.vitals || {}).length > 0 && (
              <div className="note-block">
                <h3>Vitals</h3>
                <pre>{JSON.stringify(note.vitals, null, 2)}</pre>
              </div>
            )}
            {(note.symptoms || []).length > 0 && (
              <div className="note-block">
                <h3>Symptoms</h3>
                <ul>{note.symptoms.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            {(note.icd_codes || []).length > 0 && (
              <div className="note-block">
                <h3>ICD codes</h3>
                <ul>
                  {note.icd_codes.map((icd, i) => (
                    <li key={i}><strong>{icd.code}</strong> {icd.description}</li>
                  ))}
                </ul>
              </div>
            )}
            {(note.suggested_treatments || []).length > 0 && (
              <div className="note-block">
                <h3>Suggested treatments</h3>
                <ul>
                  {note.suggested_treatments.map((t, i) => (
                    <li key={i}>{t.name} {t.notes && `– ${t.notes}`}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {note.full_note_text && (
            <div className="note-block full-note">
              <h3>Full note</h3>
              <p className="full-note-text">{note.full_note_text}</p>
            </div>
          )}
        </section>
      )}

      {summary && (
        <section className="section patient-section">
          <h2>Patient-friendly summary</h2>
          <div className="patient-summary-card">
            <p><strong>Summary</strong><br />{summary.summary_text}</p>
            <p><strong>Recovery plan</strong><br />{summary.recovery_plan}</p>
            {(summary.medications_plain || []).length > 0 && (
              <p><strong>Medications</strong><br />{summary.medications_plain.join('; ')}</p>
            )}
            {summary.follow_up_instructions && (
              <p><strong>Follow-up</strong><br />{summary.follow_up_instructions}</p>
            )}
          </div>
        </section>
      )}

      <section className="section emr-section">
        <h2>EMR integration</h2>
        <button onClick={exportEmr} disabled={busy} className="secondary">
          {busy === 'emr' ? 'Exporting…' : 'Export to EMR (audit payload)'}
        </button>
        {emrExport && (
          <div className="emr-result">
            <p>Exported. Status: <strong>{emrExport.status}</strong></p>
            <details>
              <summary>Payload</summary>
              <pre>{JSON.stringify(emrExport.payload, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>
    </div>
  )
}
