import { useParams, Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { ArrowLeft, Download, Stethoscope, Trash2, FileText, Maximize2, X, Pencil, Send, Loader2, Plus, Languages } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatPatientsContext } from '../api'

const PATIENTS_STORAGE_KEY = 'synapse_patients'

export interface TranscriptLine {
  speaker: string
  text: string
}

export interface StoredPatient {
  id: string
  name: string
  age: string
  createdAt: string
  transcriptRecording?: TranscriptLine[]
  symptoms?: string[]
  diagnosis?: string
  possible_diagnoses?: string[]
  treatment_plan?: string[]
  document?: string
  transcript?: string
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

/** Update a patient in storage (merge/replace by id). */
function updatePatient(updated: StoredPatient): void {
  const list = loadPatients()
  const idx = list.findIndex((p) => p.id === updated.id)
  if (idx === -1) return
  const next = [...list]
  next[idx] = updated
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

function getTranscriptLines(patient: StoredPatient): TranscriptLine[] {
  const rec = patient.transcriptRecording
  if (Array.isArray(rec) && rec.length > 0) {
    return rec.filter(
      (item): item is TranscriptLine =>
        typeof item === 'object' && item !== null && 'speaker' in item && 'text' in item,
    )
  }
  const t = pickString(patient.transcript)
  if (t) return [{ speaker: 'Clinician', text: t }]
  return []
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

/** Build the same sectioned lines used for the PDF, so they can be joined as text or passed to buildPdfFromLines. */
function getClinicalNoteLines(patient: StoredPatient): string[] {
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

  return lines
}

function getClinicalNoteAsText(patient: StoredPatient): string {
  return getClinicalNoteLines(patient).join('\n')
}

function createClinicalPdfFromPatient(patient: StoredPatient): Blob {
  return buildPdfFromLines(getClinicalNoteLines(patient))
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [medicalPdfUrl, setMedicalPdfUrl] = useState<string | null>(null)
  const [pdfExpanded, setPdfExpanded] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editMessage, setEditMessage] = useState('')
  const [isSendingEdit, setIsSendingEdit] = useState(false)
  const [newDiagnosis, setNewDiagnosis] = useState('')
  const [newTreatmentStep, setNewTreatmentStep] = useState('')
  const [documentLanguage, setDocumentLanguage] = useState('')
  const [translatedDocument, setTranslatedDocument] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [showTranslateModal, setShowTranslateModal] = useState(false)
  const patient = useMemo(() => {
    const list = loadPatients()
    return list.find((p) => p.id === id) || null
  }, [id, refreshKey])

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

  const transcriptLines = useMemo(() => (patient ? getTranscriptLines(patient) : []), [patient])
  const possibleDiagnoses = asStringArray(patient?.possible_diagnoses ?? [])
  const treatmentPlan = asStringArray(patient?.treatment_plan ?? [])

  const handleDownloadPdf = () => {
    if (!medicalPdfUrl || !patient) return
    const a = document.createElement('a')
    a.href = medicalPdfUrl
    a.download = `patient-${patient.id}-clinical-note.pdf`
    a.click()
  }

  const handleViewPdfNewTab = () => {
    if (!medicalPdfUrl) return
    window.open(medicalPdfUrl, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadTranslated = () => {
    if (!translatedDocument || !patient) return
    const blob = new Blob([translatedDocument], { type: 'text/plain;charset=utf-8' })
    const name = (documentLanguage || 'translated').replace(/\s+/g, '-')
    const filename = `patient-${patient.id}-clinical-note-${name}.txt`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('Download started.')
  }

  const handleViewInLanguage = (targetLanguage: string) => {
    if (!patient || !targetLanguage.trim()) return
    setDocumentLanguage(targetLanguage)
    setTranslatedDocument('')
    setIsTranslating(true)
    setShowTranslateModal(true)
    const noteText = getClinicalNoteAsText(patient)
    api
      .translateDocument(noteText, targetLanguage)
      .then((data: { translated?: string }) => {
        setTranslatedDocument(typeof data.translated === 'string' ? data.translated : '')
      })
      .catch(() => {
        toast.error('Could not translate document.')
        setTranslatedDocument('')
      })
      .finally(() => setIsTranslating(false))
  }

  const handleSendEdit = useCallback(() => {
    if (!patient || !editMessage.trim() || isSendingEdit) return
    const previousContext = transcriptLines
      .map((l) => `${l.speaker}: ${l.text}`)
      .join('\n\n')
      .trim()
    const patientsContext = formatPatientsContext(loadPatients())
    setIsSendingEdit(true)
    api
      .sendTextToSynapse(editMessage.trim(), previousContext, patientsContext)
      .then((data: Record<string, unknown>) => {
        const synapseReply =
          (data.question != null && String(data.question).trim()) ||
          (data.document != null && String(data.document).trim()) ||
          'Updated.'
        const newLines: TranscriptLine[] = [
          { speaker: 'Clinician', text: editMessage.trim() },
          { speaker: 'Synapse', text: String(synapseReply) },
        ]
        const updated: StoredPatient = {
          ...patient,
          name: (data.name != null && String(data.name).trim()) ? String(data.name).trim() : String(patient.name ?? ''),
          age: (data.age != null && String(data.age).trim()) ? String(data.age).trim() : String(patient.age ?? ''),
          symptoms: Array.isArray(data.symptoms) ? (data.symptoms as string[]) : (patient.symptoms ?? []),
          diagnosis: (data.diagnosis != null && String(data.diagnosis).trim()) ? String(data.diagnosis).trim() : (patient.diagnosis ?? ''),
          possible_diagnoses: Array.isArray(data.possible_diagnoses) ? (data.possible_diagnoses as string[]) : (patient.possible_diagnoses ?? []),
          treatment_plan: Array.isArray(data.treatment_plan) ? (data.treatment_plan as string[]) : (patient.treatment_plan ?? []),
          document: (data.document != null && String(data.document).trim()) ? String(data.document).trim() : (patient.document ?? ''),
          transcriptRecording: [...transcriptLines, ...newLines],
        }
        updatePatient(updated)
        setRefreshKey((k) => k + 1)
        setEditMessage('')
        setShowEditModal(false)
        toast.success('Patient data updated by Synapse.')
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not update.'))
      .finally(() => setIsSendingEdit(false))
  }, [patient, editMessage, isSendingEdit, transcriptLines])

  const handleDelete = () => {
    if (!patient || !id) return
    if (!window.confirm(`Delete patient ${patient.name} (ID ${id})? This cannot be undone.`)) return
    deletePatient(id)
    toast.success('Patient removed.')
    navigate('/patients', { replace: true })
  }

  const removeDiagnosis = useCallback(
    (index: number) => {
      if (!patient) return
      const next = possibleDiagnoses.filter((_, i) => i !== index)
      updatePatient({ ...patient, possible_diagnoses: next })
      setRefreshKey((k) => k + 1)
      toast.success('Diagnosis removed.')
    },
    [patient, possibleDiagnoses],
  )

  const addDiagnosis = useCallback(() => {
    if (!patient || !newDiagnosis.trim()) return
    const next = [...possibleDiagnoses, newDiagnosis.trim()]
    updatePatient({ ...patient, possible_diagnoses: next })
    setRefreshKey((k) => k + 1)
    setNewDiagnosis('')
    toast.success('Diagnosis added.')
  }, [patient, possibleDiagnoses, newDiagnosis])

  const removeTreatment = useCallback(
    (index: number) => {
      if (!patient) return
      const next = treatmentPlan.filter((_, i) => i !== index)
      updatePatient({ ...patient, treatment_plan: next })
      setRefreshKey((k) => k + 1)
      toast.success('Treatment step removed.')
    },
    [patient, treatmentPlan],
  )

  const addTreatment = useCallback(() => {
    if (!patient || !newTreatmentStep.trim()) return
    const next = [...treatmentPlan, newTreatmentStep.trim()]
    updatePatient({ ...patient, treatment_plan: next })
    setRefreshKey((k) => k + 1)
    setNewTreatmentStep('')
    toast.success('Treatment step added.')
  }, [patient, treatmentPlan, newTreatmentStep])

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
    <div className="min-h-screen bg-neutral-50 phase-in">
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
            onClick={handleDownloadPdf}
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

      <main className="p-6 max-w-6xl mx-auto space-y-6 phase-in-stagger">
        {/* Row 1: Consultation recording and Clinical document side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden p-6">
            <div className="pb-3 border-b border-neutral-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-800">Latest Recording</h2>
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-bold text-neutral-700 hover:bg-neutral-50 print:hidden"
                title="Ask Synapse AI to update this patient's data"
              >
                <Pencil size={16} />
                Edit
              </button>
            </div>
            <div className="pt-4 max-h-[520px] overflow-auto space-y-3">
              {transcriptLines.length > 0 ? (
                transcriptLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${line.speaker === 'Clinician' ? 'items-end' : 'items-start'}`}
                  >
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{line.speaker}</p>
                    <div
                      className={`max-w-[85%] p-3 rounded-xl text-sm ${
                        line.speaker === 'Clinician'
                          ? 'bg-red-50 border border-red-100 text-red-900'
                          : 'bg-emerald-50 border border-emerald-100 text-emerald-900'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{line.text}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-neutral-500">No consultation recording for this patient.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden p-6">
            <div className="pb-3 border-b border-neutral-100 flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-bold text-neutral-800">Clinical Document (PDF)</h2>
              <div className="flex items-center gap-2 print:hidden flex-wrap">
                <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                  <Languages size={14} />
                  View in:
                </span>
                <select
                  value={documentLanguage}
                  onChange={(e) => {
                    const lang = e.target.value
                    setDocumentLanguage(lang)
                    if (!lang) {
                      setShowTranslateModal(false)
                      return
                    }
                    handleViewInLanguage(lang)
                  }}
                  className="px-3 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-700 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                >
                  <option value="">Original</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Arabic">Arabic</option>
                  <option value="Chinese">Chinese</option>
                  <option value="Portuguese">Portuguese</option>
                  <option value="German">German</option>
                </select>
                <button
                  type="button"
                  onClick={handleViewPdfNewTab}
                  disabled={!medicalPdfUrl}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <FileText size={16} />
                  View PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPdfExpanded(true)}
                  disabled={!medicalPdfUrl}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <Maximize2 size={16} />
                  Expand
                </button>
              </div>
            </div>
            <div className="pt-4 overflow-auto">
              {medicalPdfUrl ? (
                <iframe
                  title="Clinical document PDF preview"
                  src={medicalPdfUrl}
                  className="w-full h-[520px] rounded-xl border border-neutral-100"
                />
              ) : (
                <p className="text-sm text-neutral-500">Generating medical PDF...</p>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Diagnosis and Treatment below */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden p-6">
            <div className="pb-3 border-b border-neutral-100">
              <h2 className="text-sm font-bold text-neutral-800">Diagnosis</h2>
            </div>
            <div className="pt-4 space-y-2">
              {possibleDiagnoses.length > 0 ? (
                <ul className="space-y-2 text-sm text-neutral-700 list-disc list-inside">
                  {possibleDiagnoses.map((d, i) => (
                    <li key={i} className="flex items-center gap-2 group">
                      <span className="flex-1 min-w-0">{d}</span>
                      <button
                        type="button"
                        onClick={() => removeDiagnosis(i)}
                        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 print:hidden"
                        title="Remove this diagnosis"
                        aria-label="Remove diagnosis"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-500">No diagnosis recorded.</p>
              )}
              <div className="flex gap-2 pt-2 print:hidden">
                <input
                  type="text"
                  value={newDiagnosis}
                  onChange={(e) => setNewDiagnosis(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDiagnosis())}
                  placeholder="Add diagnosis..."
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                />
                <button
                  type="button"
                  onClick={addDiagnosis}
                  disabled={!newDiagnosis.trim()}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden p-6">
            <div className="pb-3 border-b border-neutral-100">
              <h2 className="text-sm font-bold text-neutral-800">Treatment & Plan</h2>
            </div>
            <div className="pt-4 space-y-2">
              {treatmentPlan.length > 0 ? (
                <ol className="space-y-2 text-sm text-neutral-700 list-decimal list-inside">
                  {treatmentPlan.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 group">
                      <span className="flex-1 min-w-0">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeTreatment(i)}
                        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 print:hidden mt-0.5"
                        title="Remove this step"
                        aria-label="Remove step"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-neutral-500">No treatment plan recorded.</p>
              )}
              <div className="flex gap-2 pt-2 print:hidden">
                <input
                  type="text"
                  value={newTreatmentStep}
                  onChange={(e) => setNewTreatmentStep(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTreatment())}
                  placeholder="Add treatment step..."
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                />
                <button
                  type="button"
                  onClick={addTreatment}
                  disabled={!newTreatmentStep.trim()}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Edit: Ask Synapse to update data */}
        {showEditModal && patient && (
          <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Ask Synapse to update patient data"
          >
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-neutral-800">Ask Synapse to update data</h3>
                <button
                  type="button"
                  onClick={() => { if (!isSendingEdit) setShowEditModal(false) }}
                  className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-neutral-600 mb-3">
                Describe the change you want (e.g. &quot;Add hypertension to diagnosis&quot;, &quot;Update age to 52&quot;). Synapse will update this patient&apos;s record.
              </p>
              <form
                onSubmit={(e) => { e.preventDefault(); handleSendEdit() }}
                className="flex flex-col gap-3"
              >
                <textarea
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  placeholder="e.g. Add chest pain to symptoms, or update treatment plan..."
                  disabled={isSendingEdit}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 disabled:opacity-50 resize-y"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    disabled={isSendingEdit}
                    className="px-4 py-2 rounded-xl border border-neutral-200 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!editMessage.trim() || isSendingEdit}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                  >
                    {isSendingEdit ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    {isSendingEdit ? 'Updating...' : 'Send to Synapse'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Expanded PDF modal */}
        {pdfExpanded && medicalPdfUrl && (
          <div
            className="fixed inset-0 z-50 bg-black/70 flex flex-col items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Expanded PDF view"
          >
            <div className="flex items-center justify-between w-full max-w-6xl mb-2">
              <span className="text-white font-bold">Clinical note — expand view</span>
              <button
                type="button"
                onClick={() => setPdfExpanded(false)}
                className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </div>
            <iframe
              title="Clinical document PDF (expanded)"
              src={medicalPdfUrl}
              className="w-full max-w-6xl flex-1 rounded-xl border border-white/20 bg-white min-h-[80vh]"
            />
          </div>
        )}

        {/* Translated document modal */}
        {showTranslateModal && (
          <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Clinical document in another language"
          >
            <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 shrink-0">
                <h3 className="text-lg font-bold text-neutral-800 flex items-center gap-2">
                  <Languages size={20} />
                  Clinical document — {documentLanguage || 'Translation'}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadTranslated}
                    disabled={!translatedDocument || isTranslating}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Download size={18} />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTranslateModal(false)}
                    className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
                {isTranslating ? (
                  <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
                    <Loader2 size={40} className="animate-spin text-red-500 mb-4" />
                    <p className="font-medium">Translating with Synapse...</p>
                  </div>
                ) : translatedDocument ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-700 leading-relaxed bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                    {translatedDocument}
                  </pre>
                ) : (
                  <p className="text-sm text-neutral-500">No translation available.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
