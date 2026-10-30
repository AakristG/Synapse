import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { ArrowRight, Loader2, Stethoscope } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/BrandMark'

const DEMOS = [
  { role: 'Physician', username: 'physician', password: 'physician123' },
  { role: 'Nurse', username: 'nurse', password: 'nurse123' },
  { role: 'EMT', username: 'emt', password: 'emt123' },
] as const

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
      const signedIn = await login(username.trim(), password)
      navigate(signedIn.role === 'patient' ? '/patient-portal' : '/consultation', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <section className="relative hidden lg:flex min-w-0 flex-col justify-between overflow-hidden bg-slate-950 text-white px-10 xl:px-12 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.28),transparent_42%),radial-gradient(circle_at_80%_80%,rgba(20,184,166,0.18),transparent_40%)]" />
        <div className="relative flex items-center gap-3">
          <BrandMark className="h-11 w-11" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">Axxess</p>
            <p className="text-lg font-semibold">Synapse</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Clinical notes, ready while the visit is still happening.
          </h1>
          <p className="mt-4 text-slate-300 text-base leading-relaxed">
            Capture the conversation, extract symptoms and a working diagnosis, and hand the clinician a plan they can approve.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-200">
            {['Live or uploaded audio', 'Multilingual transcripts', 'ICD-style differentials and a patient summary'].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Diagnostic assistant for clinicians</p>
      </section>

      <section className="flex min-w-0 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <BrandMark />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-800">Synapse</p>
              <p className="text-sm text-slate-600">Diagnostic assistant</p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/90 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] p-7 sm:p-8">
            <div className="mb-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-800">
                <Stethoscope size={18} />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
              <p className="mt-1 text-sm text-slate-500">Physician, nurse, or EMT workspace</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 border border-rose-100">
                  {error}
                </div>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-800 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-900/15 transition hover:bg-rose-900 disabled:opacity-70"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Demo accounts</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {DEMOS.map((demo) => (
                  <button
                    key={demo.username}
                    type="button"
                    onClick={() => {
                      setUsername(demo.username)
                      setPassword(demo.password)
                      setError('')
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-900"
                  >
                    {demo.role}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
