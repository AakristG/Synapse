import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import './Dashboard.css'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const lastResultRef = useRef(null)

  const buildContextForNext = useCallback(() => {
    const r = lastResultRef.current
    if (!r) return ''
    const parts = []
    if (r.name) parts.push(`Patient name: ${r.name}`)
    if (r.age) parts.push(`Age: ${r.age}`)
    if (r.report) parts.push(`Chief complaint: ${r.report}`)
    if (r.transcript) parts.push(`Last said: ${r.transcript}`)
    if (r.document) parts.push(`Current note: ${r.document}`)
    return parts.join('\n')
  }, [])

  const startRecording = useCallback(() => {
    setError('')
    chunksRef.current = []
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        const mr = new MediaRecorder(stream)
        mediaRecorderRef.current = mr
        mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
        mr.onstop = () => {
          stream.getTracks().forEach((t) => t.stop())
        }
        mr.start()
        setRecording(true)
      })
      .catch((e) => setError('Microphone access denied or unavailable.'))
  }, [])

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !recording) return
    mediaRecorderRef.current.stop()
    setRecording(false)
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    setProcessing(true)
    setError('')
    const previousContext = buildContextForNext()
    api.extractAudio(blob, previousContext)
      .then((data) => {
        lastResultRef.current = data
        setResult(data)
      })
      .catch((e) => setError(e.message || 'Extraction failed.'))
      .finally(() => setProcessing(false))
  }, [recording, buildContextForNext])

  const roleLabel = user?.role === 'emt' ? 'EMT' : user?.role === 'nurse' ? 'Nurse' : 'Physician'

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-role">Signed in as <strong>{user?.username}</strong> · {roleLabel}</p>
        </div>
        <div className="dashboard-actions">
          <Link to="/">Conversations</Link>
          <button type="button" onClick={logout} className="btn-logout">Sign out</button>
        </div>
      </div>

      <section className="dashboard-section record-section">
        <h2>Consultation dictation</h2>
        <p className="section-hint">
          Use your <strong>microphone</strong>: press <strong>Start listening</strong>, then dictate your consultation (patient name, age, chief complaint, vitals, symptoms, diagnosis). The AI will evaluate your voice and create a clinical document — no conversation, physician-only documentation.
        </p>
        <div className="record-controls">
          {!recording ? (
            <button type="button" onClick={startRecording} disabled={processing} className="btn-record">
              Start listening
            </button>
          ) : (
            <button type="button" onClick={stopRecording} className="btn-stop">
              Stop & create document
            </button>
          )}
        </div>
        {(processing || result) && (
          <div className="record-status">
            {processing && <p className="status-text">Evaluating your dictation…</p>}
            {error && <div className="result-error">{error}</div>}
            {result && !processing && (
              <div className="extraction-result">
                {result.document && (
                  <div className="result-block document-block document-first">
                    <h3>Clinical document</h3>
                    <pre className="document-text">{result.document}</pre>
                    <div className="document-actions">
                      <button
                        type="button"
                        className="btn-copy"
                        onClick={() => navigator.clipboard.writeText(result.document)}
                      >
                        Copy document
                      </button>
                      <a
                        href={`data:text/plain;charset=utf-8,${encodeURIComponent(result.document)}`}
                        download="consultation-document.txt"
                        className="btn-download"
                      >
                        Download .txt
                      </a>
                    </div>
                  </div>
                )}
                <h3>Extracted from your dictation</h3>
                <div className="intake-fields">
                  {result.name && <div className="field"><strong>Name</strong> {result.name}</div>}
                  {result.age && <div className="field"><strong>Age</strong> {result.age}</div>}
                  {result.report && <div className="field"><strong>Chief complaint</strong> {result.report}</div>}
                </div>
                {(Object.keys(result.vitals || {}).length > 0 || (result.symptoms || []).length > 0 || result.diagnosis) && (
                  <div className="result-grid">
                    {Object.keys(result.vitals || {}).length > 0 && (
                      <div className="result-block">
                        <h4>Vitals</h4>
                        <ul>
                          {Object.entries(result.vitals).map(([k, v]) => (
                            <li key={k}><strong>{k.replace(/_/g, ' ')}</strong>: {String(v)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(result.symptoms || []).length > 0 && (
                      <div className="result-block">
                        <h4>Symptoms</h4>
                        <ul>
                          {result.symptoms.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                    {result.diagnosis && (
                      <div className="result-block">
                        <h4>Diagnosis</h4>
                        <p>{result.diagnosis}</p>
                      </div>
                    )}
                  </div>
                )}
                {result.transcript && (
                  <div className="result-block">
                    <h4>Your dictation (transcript)</h4>
                    <p className="transcript-text">{result.transcript}</p>
                  </div>
                )}
                {result.error && <p className="result-warning">{result.error}</p>}
                <div className="record-more">
                  <button type="button" onClick={startRecording} disabled={processing} className="btn-record-again">
                    Add another segment
                  </button>
                  <span className="record-more-hint">Record more; the AI will merge with the note above.</span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
