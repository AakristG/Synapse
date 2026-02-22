import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { getPatientById } from '../utils/patients'

export default function PatientDetail() {
  const { id } = useParams()
  const patient = id ? getPatientById(id) : null

  const jsonString = patient
    ? JSON.stringify(
        { id: patient.id, name: patient.name, age: patient.age, createdAt: patient.createdAt, ...patient.data },
        null,
        2
      )
    : ''

  const handleDownloadPDF = () => {
    if (!patient) return
    const prevTitle = document.title
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      document.title = prevTitle
      return
    }
    try {
    const title = `Patient ${patient.id} - ${patient.name}`
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
            pre { background: #1a1a1a; color: #e5e5e5; padding: 16px; border-radius: 8px; overflow: auto; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>${patient.name}</h1>
          <p class="meta">Age: ${patient.age} · ID: ${patient.id} · ${new Date(patient.createdAt).toLocaleString()}</p>
          <pre>${jsonString.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.onload = () => {
      printWindow.print()
      printWindow.onafterprint = () => printWindow.close()
    }
    } finally {
      document.title = prevTitle
    }
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-8">
        <p className="text-neutral-600 font-medium">Patient not found.</p>
        <Link to="/consultation" className="mt-4 text-blue-600 font-bold flex items-center gap-2">
          <ArrowLeft size={18} /> Back to Consultation
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/consultation"
          className="inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900 font-bold text-sm mb-6"
        >
          <ArrowLeft size={18} /> Back to Consultation
        </Link>

        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h1 className="font-bold text-xl text-neutral-800">{patient.name}</h1>
              <p className="text-sm text-neutral-500">Age: {patient.age} · ID: {patient.id}</p>
            </div>
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700"
            >
              <Download size={18} /> Download PDF
            </button>
          </div>

          <div className="p-6">
            <h2 className="text-sm font-bold text-neutral-600 uppercase tracking-wider mb-3">Patient information (JSON)</h2>
            <div
              id="patient-print-content"
              className="bg-neutral-900 text-neutral-100 rounded-xl p-6 font-mono text-sm overflow-auto max-h-[70vh] whitespace-pre-wrap break-words"
            >
              <p className="text-neutral-400 text-xs mb-2">Patient ID: {patient.id} · Name: {patient.name} · Age: {patient.age}</p>
              {jsonString}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
