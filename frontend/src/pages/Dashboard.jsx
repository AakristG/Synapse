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

  const startRecording = useCallback(() => {
    setError('')
    setResult(null)
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
    api.extractAudio(blob)
      .then((data) => setResult(data))
      .catch((e) => setError(e.message || 'Extraction failed.'))
      .finally(() => setProcessing(false))
  }, [recording])

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
        <h2>Record clinical audio</h2>
        <p className="section-hint">Record a message (e.g. dictation or patient encounter). Gemini will extract vitals, symptoms, and diagnosis.</p>
        <div className="record-controls">
          {!recording ? (
            <button type="button" onClick={startRecording} disabled={processing} className="btn-record">
              Start recording
            </button>
          ) : (
            <button type="button" onClick={stopRecording} className="btn-stop">
              Stop & extract
            </button>
          )}
        </div>
        {(processing || result) && (
          <div className="record-status">
            {processing && <p className="status-text">Processing with Gemini…</p>}
            {error && <div className="result-error">{error}</div>}
            {result && !processing && (
              <div className="extraction-result">
                <h3>Extraction result</h3>
                {result.transcript && (
                  <div className="result-block">
                    <h4>Transcript</h4>
                    <p className="transcript-text">{result.transcript}</p>
                  </div>
                )}
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
                {result.error && <p className="result-warning">{result.error}</p>}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
