import { Link } from 'react-router-dom'
import { ClipboardList, LayoutDashboard } from 'lucide-react'
import './Home.css'

const EXAMPLE_PATIENT = {
  id: 'P-1001',
  name: 'Maria Santos',
  dateOfBirth: '1985-03-12',
  mrn: 'MRN-88492',
  lastVisit: '2025-02-18',
  status: 'Active',
}

export default function Home() {
  return (
    <div className="home-layout">
      <aside className="home-sidebar">
        <div className="home-sidebar-header">
          <h2 className="home-sidebar-title">Care Portal</h2>
        </div>
        <nav className="home-sidebar-nav">
          <Link to="/" className="home-nav-item home-nav-item--active">
            <LayoutDashboard size={20} aria-hidden />
            <span>Patient Database</span>
          </Link>
          <Link to="/login" className="home-nav-item">
            <ClipboardList size={20} aria-hidden />
            <span>Record Visit</span>
          </Link>
        </nav>
      </aside>
      <main className="home-main">
        <header className="home-header">
          <h1>Patient Database</h1>
          <p className="home-subtitle">Healthcare patient records</p>
        </header>
        <section className="home-content">
          <div className="home-table-wrap">
            <table className="home-table">
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Name</th>
                  <th>Date of birth</th>
                  <th>MRN</th>
                  <th>Last visit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{EXAMPLE_PATIENT.id}</td>
                  <td><strong>{EXAMPLE_PATIENT.name}</strong></td>
                  <td>{EXAMPLE_PATIENT.dateOfBirth}</td>
                  <td><code className="home-mrn">{EXAMPLE_PATIENT.mrn}</code></td>
                  <td>{EXAMPLE_PATIENT.lastVisit}</td>
                  <td>
                    <span className="home-badge home-badge--active">{EXAMPLE_PATIENT.status}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="home-table-caption">One example patient shown. Use “Record Visit” to sign in and log a new visit.</p>
        </section>
      </main>
    </div>
  )
}
