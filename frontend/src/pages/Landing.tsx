import { Link } from 'react-router-dom'
import { FileText, LogIn } from 'lucide-react'
import './Landing.css'

export default function Landing() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <nav className="landing-nav">
          <Link to="/document" className="landing-nav-link">
            <FileText size={20} />
            Document
          </Link>
          <Link to="/login" className="landing-nav-link">
            <LogIn size={20} />
            Login
          </Link>
        </nav>
      </header>

      <main className="landing-main">
        <div className="landing-logo-wrap">
          <div className="landing-logo">
            <span className="landing-logo-text">S</span>
          </div>
        </div>
        <h1 className="landing-title">Synapse</h1>
        <p className="landing-tagline">Clinical documentation, powered by AI</p>

        <section className="landing-missions">
          <h2 className="landing-missions-heading">Our mission</h2>
          <ul className="landing-missions-list">
            <li>Reduce documentation burden so clinicians can focus on patients.</li>
            <li>Turn voice and conversation into accurate, structured clinical notes.</li>
            <li>Connect every encounter to clear summaries and actionable next steps.</li>
            <li>Support physicians and care teams with AI that understands clinical context.</li>
          </ul>
        </section>

        <div className="landing-actions">
          <Link to="/login" className="landing-btn landing-btn-primary">
            Sign in
          </Link>
          <Link to="/consultation" className="landing-btn landing-btn-secondary">
            Go to Document
          </Link>
        </div>
      </main>
    </div>
  )
}
