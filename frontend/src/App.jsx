import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import ConversationList from './pages/ConversationList'
import ConversationDetail from './pages/ConversationDetail'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <Link to="/" className="logo">Diagnostic Assistant</Link>
          <nav>
            <Link to="/">Conversations</Link>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<ConversationList />} />
            <Route path="/conversations/:id" element={<ConversationDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
