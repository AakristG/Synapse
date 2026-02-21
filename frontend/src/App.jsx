import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ConversationList from './pages/ConversationList'
import ConversationDetail from './pages/ConversationDetail'
import './App.css'

function AppLayout() {
  const { isAuthenticated } = useAuth()
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="logo">Diagnostic Assistant</Link>
        <nav>
          {isAuthenticated && <Link to="/dashboard">Dashboard</Link>}
          <Link to="/">Conversations</Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/" element={<ConversationList />} />
          <Route path="/conversations/:id" element={<ConversationDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
