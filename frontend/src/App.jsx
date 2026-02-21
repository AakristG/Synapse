import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import Consultation from './pages/Consultation'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
      <Routes>
        <Route path="/" element={<Consultation />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
