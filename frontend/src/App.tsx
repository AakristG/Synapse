import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './context/AuthContext.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import './App.css'

const Login = lazy(() => import('./pages/Login.tsx'))
const PatientPortal = lazy(() => import('./pages/PatientPortal.tsx'))
const Consultation = lazy(() => import('./pages/Consultation.tsx'))
const Triage = lazy(() => import('./pages/Triage.tsx'))
const PatientDetail = lazy(() => import('./pages/PatientDetail.tsx'))
const AllPatients = lazy(() => import('./pages/AllPatients.tsx'))

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-neutral-600">Loading...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/patient-portal" element={<ProtectedRoute><PatientPortal /></ProtectedRoute>} />
            <Route path="/consultation" element={<ProtectedRoute><Consultation /></ProtectedRoute>} />
            <Route path="/triage" element={<ProtectedRoute><Triage /></ProtectedRoute>} />
            <Route path="/patients" element={<ProtectedRoute><AllPatients /></ProtectedRoute>} />
            <Route path="/patient/:id" element={<ProtectedRoute><PatientDetail /></ProtectedRoute>} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
