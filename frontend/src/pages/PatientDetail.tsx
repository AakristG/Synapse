import { useParams, Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Stethoscope, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const PATIENTS_STORAGE_KEY = 'synapse_patients'

export interface StoredPatient {
  id: string
  name: string
  age: string
  createdAt: string
  [key: string]: unknown
}

type UnknownObject = Record<string, unknown>

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

function isObject(value: unknown): value is UnknownObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : String(item).trim()))
    .filter((item) => item.length > 0)
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function parseDocumentObject(documentText: string): UnknownObject | null {
  if (!documentText.trim()) return null
  try {
    const parsed = JSON.parse(documentText)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?')
}

function wrapText(text: string, maxChars = 96): string[] {
  const out: string[] = []
  const paragraphs = text.split('\n')
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (next.length <= maxChars) {
        current = next
      } else {
        if (current) out.push(current)
        current = word
      }
    }
    if (current) out.push(current)
  }
  return out
}

function buildPdfFromLines(lines: string[]): Blob {
  const pageHeight = 792
  const marginTop = 746
  const lineHeight = 14
  const linesPerPage = 48
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage))
  }
  if (pages.length === 0) pages.push(['Clinical note not available.'])

  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  const pageRefs: string[] = []
  let nextObject = 4

  for (const pageLines of pages) {
    const pageObjectNumber = nextObject
    const contentObjectNumber = nextObject + 1
    pageRefs.push(`${pageObjectNumber} 0 R`)
    const escapedLines = pageLines.map((line) => sanitizePdfText(line))

    const streamParts: string[] = [
      'BT',
      '/F1 10 Tf',
      `${lineHeight} TL`,
      `46 ${marginTop} Td`,
    ]
    escapedLines.forEach((line, idx) => {
      if (idx > 0) streamParts.push('T*')
      streamParts.push(`(${line}) Tj`)
    })
    streamParts.push('ET')
    const stream = `${streamParts.join('\n')}\n`
    objects[contentObjectNumber] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`
    objects[pageObjectNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    nextObject += 2
  }

  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.join(' ')}] >>`

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let i = 1; i < objects.length; i++) {
    const objectText = objects[i]
    if (!objectText) continue
    offsets[i] = pdf.length
    pdf += `${i} 0 obj\n${objectText}\nendobj\n`
  }

  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < objects.length; i++) {
    const offset = offsets[i] ?? 0
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}

function createClinicalPdfFromPatient(patient: StoredPatient): Blob {
  const documentText = pickString(patient.document, (patient as { payload?: UnknownObject }).payload?.document)
  const parsedDocument = parseDocumentObject(documentText)
  const patientName = pickString(patient.name, parsedDocument?.name, parsedDocument?.patient_name, parsedDocument?.patientName) || 'Unknown'
  const patientAge = pickString(patient.age, parsedDocument?.age, parsedDocument?.patient_age, parsedDocument?.patientAge) || 'Not stated'
  const clinicianTranscript = pickString(patient.transcript, parsedDocument?.transcript)
  const symptoms = asStringArray(patient.symptoms).length > 0 ? asStringArray(patient.symptoms) : asStringArray(parsedDocument?.symptoms)
  const primaryDiagnosis = pickString(patient.diagnosis, parsedDocument?.diagnosis, parsedDocument?.assessment)
  const differentialDiagnosis = asStringArray(patient.possible_diagnoses).length > 0
    ? asStringArray(patient.possible_diagnoses)
    : asStringArray(parsedDocument?.possible_diagnoses)
  const treatmentPlan = asStringArray(patient.treatment_plan).length > 0
    ? asStringArray(patient.treatment_plan)
    : asStringArray(parsedDocument?.treatment_plan)
  const vitals = isObject(patient.vitals) ? patient.vitals : (isObject(parsedDocument?.vitals) ? parsedDocument.vitals : {})

  const lines: string[] = []
  const pushSection = (title: string, body: string[]) => {
    lines.push(title)
    lines.push('-'.repeat(title.length))
    for (const row of body) lines.push(...wrapText(row))
    lines.push('')
  }

  lines.push('Clinical Encounter Note (Draft)')
  lines.push(`Generated: ${new Date().toLocaleString()}`)
  lines.push('AI-assisted draft for clinician review and attestation before medical record use.')
  lines.push('')
  pushSection('Patient Demographics', [`Name: ${patientName}`, `Age: ${patientAge}`, `ID: ${patient.id}`])

  const subjectiveRows = [symptoms.length > 0 ? `Chief concerns: ${symptoms.join(', ')}.` : 'Chief concerns not clearly stated.']
  if (clinicianTranscript) subjectiveRows.push(`Clinician transcript: ${clinicianTranscript}`)
  pushSection('S: Subjective', subjectiveRows)

  const objectiveRows = Object.keys(vitals).length > 0
    ? Object.entries(vitals).map(([key, value]) => `${key}: ${String(value)}`)
    : ['No objective vitals documented.']
  pushSection('O: Objective', objectiveRows)

  const assessmentRows = [
    primaryDiagnosis ? `Primary diagnosis: ${primaryDiagnosis}` : 'Assessment pending clinician confirmation.',
  ]
  if (differentialDiagnosis.length > 0) {
    assessmentRows.push(`Differential considerations: ${differentialDiagnosis.join('; ')}`)
  }
  pushSection('A: Assessment', assessmentRows)

  const planRows = treatmentPlan.length > 0
    ? treatmentPlan.map((item, index) => `${index + 1}. ${item}`)
    : ['Treatment plan not yet documented.']
  pushSection('P: Plan', planRows)

  pushSection('Compliance and Attestation', [
    'This document is generated by decision-support software and must be reviewed, edited, and signed by a licensed clinician.',
    'Do not use as final chart documentation without clinician verification.',
  ])

  return buildPdfFromLines(lines)
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [medicalPdfUrl, setMedicalPdfUrl] = useState<string | null>(null)
  const patient = useMemo(() => {
    const list = loadPatients()
    return list.find((p) => p.id === id) || null
  }, [id])

  useEffect(() => {
    if (!patient) return
    try {
      const blob = createClinicalPdfFromPatient(patient)
      const nextUrl = URL.createObjectURL(blob)
      setMedicalPdfUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return nextUrl
      })
    } catch {
      setMedicalPdfUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return null
      })
      toast.error('Could not generate medical PDF.')
    }
  }, [patient])

  useEffect(() => {
    return () => {
      if (medicalPdfUrl) URL.revokeObjectURL(medicalPdfUrl)
    }
  }, [medicalPdfUrl])

  const handlePrintPdf = () => {
    if (!medicalPdfUrl || !patient) return
    const a = document.createElement('a')
    a.href = medicalPdfUrl
    a.download = `patient-${patient.id}-clinical-note.pdf`
    a.click()
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
            onClick={handlePrintPdf}
            disabled={!medicalPdfUrl}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50"
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
            <h2 className="text-sm font-bold text-neutral-800">Clinical Documentation (PDF)</h2>
          </div>
          <div className="p-6 overflow-auto">
            {medicalPdfUrl ? (
              <iframe
                title="Clinical document PDF preview"
                src={medicalPdfUrl}
                className="w-full h-[900px] rounded-xl border border-neutral-100"
              />
            ) : (
              <p className="text-sm text-neutral-500">Generating medical PDF...</p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
