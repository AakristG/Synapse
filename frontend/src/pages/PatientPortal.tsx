import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { User, FileText, LogOut } from 'lucide-react'
import './Login.css'

export default function PatientPortal() {
  const { user, logout } = useAuth()

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={28} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Patient Portal</h1>
        </div>
        <p className="login-subtitle">
          Welcome, <strong>{user?.username}</strong>
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.5rem', textAlign: 'center' }}>
          View your care information and visit summaries.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Link
            to="/patient-portal"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              padding: '0.75rem 1rem', background: 'var(--primary)', color: 'white', borderRadius: 8,
              fontWeight: 600, textDecoration: 'none', fontSize: '1rem',
            }}
          >
            <FileText size={20} />
            My information
          </Link>
          <button
            type="button"
            onClick={logout}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              width: '100%', padding: '0.7rem 1rem', background: 'transparent', color: 'var(--muted)',
              border: '1px solid var(--border)', borderRadius: 8, fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
