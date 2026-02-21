import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export default function Login() {
  const { login, user, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Diagnostic Assistant</h1>
        {isAuthenticated ? (
          <>
            <p className="login-subtitle">You're already signed in as <strong>{user?.username}</strong>.</p>
            <div className="login-already-actions">
              <Link to="/dashboard" className="login-already-btn">Go to Dashboard</Link>
              <Link to="/consultation" className="login-already-btn login-already-btn--primary">Record a visit</Link>
            </div>
          </>
        ) : (
          <>
            <p className="login-subtitle">Sign in as EMT, Nurse, or Physician</p>
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
          </>
        )}
      </div>
    </div>
  )
}
