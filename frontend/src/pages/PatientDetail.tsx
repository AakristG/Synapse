import { useParams, Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { ArrowLeft, Download, FileJson, Stethoscope, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const PATIENTS_STORAGE_KEY = 'synapse_patients'

export interface StoredPatient {
  id: string
  name: string
  age: string
  createdAt: string
  [key: string]: unknown
}

function loadPatients(): StoredPatient[] {
  try {
    return JSON.parse(localStorage.getItem(PATIENTS_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

/** Remove a patient from storage. Call after confirming delete. */
export function deletePatient(id: string): void {
  const next = loadPatients().filter((p) => p.id !== id)
  localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(next))
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const patient = useMemo(() => {
    const list = loadPatients()
    return list.find((p) => p.id === id) || null
  }, [id])

  const handleDownloadJson = () => {
    if (!patient) return
    const blob = new Blob([JSON.stringify(patient, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `patient-${patient.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrintPdf = () => {
    window.print()
  }

  const handleDelete = () => {
    if (!patient || !id) return
    if (!window.confirm(`Delete patient ${patient.name} (ID ${id})? This cannot be undone.`)) return
    deletePatient(id)
    toast.success('Patient removed.')
    navigate('/patients', { replace: true })
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6">
        <p className="text-neutral-600 font-medium">Patient not found.</p>
        <Link to="/patients" className="mt-4 text-red-600 font-bold flex items-center gap-2 hover:underline">
          <ArrowLeft size={18} />
          Back to All Patients
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 h-14 border-b border-neutral-200 bg-white px-6 flex items-center justify-between print:flex">
        <div className="flex items-center gap-4">
          <Link
            to="/patients"
            className="print:hidden flex items-center gap-2 text-neutral-600 hover:text-red-600 font-bold text-sm"
          >
            <ArrowLeft size={20} />
            Back to All Patients
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center text-white">
              <Stethoscope size={18} />
            </div>
            <div>
              <h1 className="font-bold text-neutral-900">{patient.name}</h1>
              <p className="text-xs text-neutral-500">
                {patient.age ? `${patient.age} years` : 'Age not stated'} · ID #{patient.id}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="flex items-center gap-2 px-4 py-2.5 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-700 hover:bg-neutral-50"
          >
            <FileJson size={18} />
            Download JSON
          </button>
          <button
            type="button"
            onClick={handlePrintPdf}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700"
          >
            <Download size={18} />
            Download PDF
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2.5 border border-red-200 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50"
          >
            <Trash2 size={18} />
            Delete patient
          </button>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50">
            <h2 className="text-sm font-bold text-neutral-800">Patient information (JSON)</h2>
          </div>
          <div className="p-6 overflow-auto">
            <pre className="text-[13px] text-neutral-800 font-mono whitespace-pre-wrap break-words bg-neutral-50 p-4 rounded-xl border border-neutral-100">
              {JSON.stringify(patient, null, 2)}
            </pre>
          </div>
        </div>
      </main>
    </div>
  )
}
