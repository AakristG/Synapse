import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axxessLogo from '../assets/axxess-logo.png'
import './Login.css'

export default function Login() {
  const { login, isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (isAuthenticated && user) {
    const to = user.role === 'patient' ? '/patient-portal' : '/consultation'
    return <Navigate to={to} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await login(username.trim(), password)
      const isPatient = user.role === 'patient'
      navigate(isPatient ? '/patient-portal' : '/consultation', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page phase-in">
      <div className="phase-in-stagger login-page-inner">
      <div className="login-left">
        <h1 className="text-2xl font-bold text-red-700">Synapse</h1>
        <p className="login-mission">
          Empowering physicians with AI-powered documentation and support
        </p>
      </div>
      <div className="login-card">
        <h1>Diagnostic Assistant</h1>
        <p className="login-subtitle">Sign in as Patient or Physician</p>
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
      </div>
    </div>
  )
}
