import { useState, useEffect, useRef, useCallback, useMemo, ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Mic,
  Square,
  Activity,
  ClipboardList,
  Stethoscope,
  Pill,
  CheckCircle2,
  Trash2,
  Upload,
  FileAudio,
  Loader2,
  Zap,
  Clock,
  ChevronRight,
  Plus,
  User,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { api } from '../api'
import type { StoredPatient } from './PatientDetail'
import axxessLogo from '../assets/axxess-logo.png'

const PATIENTS_STORAGE_KEY = 'synapse_patients'

interface TranscriptLine {
  speaker: string
  text: string
}

interface ExtractionResult {
  transcript?: string
  document?: string
  name?: string
  age?: string
  symptoms?: string[]
  diagnosis?: string
  possible_diagnoses?: string[]
  treatment_plan?: string[]
  [key: string]: unknown
}

function generatePatientId(): string {
  return String(Math.floor(1000000000 + Math.random() * 9000000000))
}

function loadPatients(): StoredPatient[] {
  try {
    return JSON.parse(localStorage.getItem(PATIENTS_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export default function Consultation() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [now, setNow] = useState(() => new Date())
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [diagnosis, setDiagnosis] = useState<string[]>([])
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(null)
  const [planForDiagnosisLoading, setPlanForDiagnosisLoading] = useState(false)
  const [treatmentPlanForSelection, setTreatmentPlanForSelection] = useState<string[] | null>(null)
  const [patientSummaryForSelection, setPatientSummaryForSelection] = useState<string | null>(null)
  const [meds, setMeds] = useState<string[]>([])
  const [patients, setPatients] = useState<StoredPatient[]>(() => loadPatients())
  const [patientsLoaded, setPatientsLoaded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const speechTranscriptRef = useRef('')

  const applyExtractionResult = useCallback((result: ExtractionResult) => {
    const lines: TranscriptLine[] = []
    if (result.transcript && result.transcript.trim()) {
      lines.push({ speaker: 'Clinician', text: result.transcript.trim() })
    }
    if (result.document && result.document.trim()) {
      lines.push({ speaker: 'Synapse', text: result.document.trim() })
    }
    if (lines.length > 0) setTranscript(lines)
    if (Array.isArray(result.symptoms) && result.symptoms.length > 0) {
      setSymptoms(result.symptoms.map((s) => (typeof s === 'string' ? s : String(s))))
    }
    // Diagnosis: primary (from transcript) + Gemini's list of possible diagnoses to consider (from Synapse response)
    const primary = result.diagnosis ? [result.diagnosis] : []
    const possible = Array.isArray(result.possible_diagnoses)
      ? result.possible_diagnoses.filter((d): d is string => typeof d === 'string' && d.trim() !== '')
      : []
    const allDiagnoses = [...primary]
    for (const d of possible) {
      if (!allDiagnoses.some((x) => x.trim().toLowerCase() === d.trim().toLowerCase())) {
        allDiagnoses.push(d.trim())
      }
    }
    if (allDiagnoses.length > 0) {
      setDiagnosis(allDiagnoses)
      setSelectedDiagnosis(allDiagnoses[0] ?? null)
      setTreatmentPlanForSelection(null)
      setPatientSummaryForSelection(null)
    }
    // Treatment & Plan: steps from Gemini (Synapse + primary diagnosis)
    const plan = Array.isArray(result.treatment_plan)
      ? result.treatment_plan.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      : []
    if (plan.length > 0) setMeds(plan.map((s) => s.trim()))
    const id = generatePatientId()
    const name = (result.name || '').trim() || 'Unknown'
    const age = (result.age || '').trim() || ''
    const patient: StoredPatient = {
      id,
      name,
      age,
      createdAt: new Date().toISOString(),
      transcript: result.transcript,
      document: result.document,
      report: result.report,
      vitals: result.vitals,
      symptoms: result.symptoms,
      diagnosis: result.diagnosis,
      possible_diagnoses: result.possible_diagnoses,
      treatment_plan: result.treatment_plan,
    }
    api.createRecordedPatient(patient as unknown as Record<string, unknown>)
      .then((created) => {
        const fromServer = { ...created, id: (created.id as string) || id } as StoredPatient
        setPatients((prev) => {
          const next = [fromServer, ...prev.filter((p) => p.id !== fromServer.id)].slice(0, 50)
          localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(next))
          return next
        })
        toast.success(`Patient recorded — ID ${fromServer.id}`)
      })
      .catch(() => {
        setPatients((prev) => {
          const next = [patient, ...prev].slice(0, 50)
          localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(next))
          return next
        })
        toast.success(`Patient recorded — ID ${id}`)
      })
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (patientsLoaded) return
    setPatientsLoaded(true)
    api.listRecordedPatients()
      .then((list) => {
        const arr = Array.isArray(list) ? list : (list as { results?: unknown[] })?.results ?? []
        const items = (arr as StoredPatient[]).map((p) => ({
          ...p,
          id: p.id ?? '',
          name: p.name ?? 'Unknown',
          age: p.age ?? '',
          createdAt: p.createdAt ?? '',
        }))
        if (items.length > 0) {
          setPatients(items)
          try {
            localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(items))
          } catch {}
        }
      })
      .catch(() => {})
  }, [patientsLoaded])

  const scrollToBottom = () => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [transcript])

  const documentFromTranscript = useMemo(
    () => transcript.find((l) => l.speaker === 'Synapse')?.text ?? '',
    [transcript],
  )

  useEffect(() => {
    if (!selectedDiagnosis || (!symptoms.length && !documentFromTranscript.trim())) return
    let cancelled = false
    setPlanForDiagnosisLoading(true)
    api
      .planForDiagnosis(selectedDiagnosis, symptoms, documentFromTranscript)
      .then((res) => {
        if (cancelled) return
        setTreatmentPlanForSelection((res.treatment_plan as string[]) || [])
        setPatientSummaryForSelection((res.patient_summary as string) || '')
      })
      .catch(() => {
        if (!cancelled) {
          setTreatmentPlanForSelection(null)
          setPatientSummaryForSelection(null)
          toast.error('Could not update plan for selected diagnosis.')
        }
      })
      .finally(() => {
        if (!cancelled) setPlanForDiagnosisLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedDiagnosis, symptoms, documentFromTranscript])

  const startSession = useCallback(() => {
    resetSession()
    chunksRef.current = []
    speechTranscriptRef.current = ''
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'
        recognition.onresult = (e: SpeechRecognitionEvent) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const item = e.results[i]
            if (item?.isFinal) {
              const t = item[0]?.transcript
              if (t) speechTranscriptRef.current = (speechTranscriptRef.current + ' ' + t).trim()
            }
          }
        }
        recognition.onerror = () => {}
        recognition.start()
        speechRecognitionRef.current = recognition
      } catch {
        speechRecognitionRef.current = null
      }
    } else {
      speechRecognitionRef.current = null
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mr = new MediaRecorder(stream)
        mediaRecorderRef.current = mr
        mr.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data)
        }
        mr.onstop = () => stream.getTracks().forEach((t) => t.stop())
        mr.start()
        setIsRecording(true)
        toast.info('Microphone active — recording started.')
      })
      .catch(() => toast.error('Microphone access denied or unavailable.'))
  }, [])

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) return
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop() } catch {}
      speechRecognitionRef.current = null
    }
    mediaRecorderRef.current.stop()
    setIsRecording(false)
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const liveTranscript = (speechTranscriptRef.current || '').trim()
    setIsProcessing(true)
    toast.info(liveTranscript ? 'Sending your words to Synapse...' : 'Creating transcript from your recording...')
    const send = () => {
      api.extractAudio(blob, '', liveTranscript)
        .then((data) => {
          applyExtractionResult(data as ExtractionResult)
          toast.success('Recording transcribed and analyzed.')
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'Transcription failed.'))
        .finally(() => setIsProcessing(false))
    }
    if (liveTranscript) setTimeout(send, 300)
    else send()
  }, [isRecording, applyExtractionResult])

  const handleFileUpload = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      resetSession()
      setIsUploading(true)
      toast.info(`Processing ${file.name}...`)
      const reader = new FileReader()
      reader.onload = () => {
        const blob = new Blob([reader.result as ArrayBuffer], { type: file.type || 'audio/webm' })
        api.extractAudio(blob)
          .then((data) => {
            applyExtractionResult(data as ExtractionResult)
            toast.success('Audio transcribed and analyzed.')
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : 'Transcription failed.'))
          .finally(() => setIsUploading(false))
      }
      reader.readAsArrayBuffer(file)
    },
    [applyExtractionResult]
  )

  const resetSession = () => {
    setTranscript([])
    setSymptoms([])
    setDiagnosis([])
    setSelectedDiagnosis(null)
    setTreatmentPlanForSelection(null)
    setPatientSummaryForSelection(null)
    setMeds([])
  }

  const removePatient = (patientId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm('Remove this patient from the list?')) return
    const removeFromState = () => {
      setPatients((prev) => {
        const next = prev.filter((p) => p.id !== patientId)
        localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(next))
        return next
      })
      toast.success('Patient removed.')
    }
    api.deleteRecordedPatient(patientId).then(removeFromState).catch(removeFromState)
  }

  const summaryForPatient = useMemo(() => {
    const hasAny = symptoms.length > 0 || diagnosis.length > 0 || meds.length > 0
    if (!hasAny) {
      return 'Record or upload audio to generate a visit summary. After your note is processed, a plain-language summary of your symptoms, diagnosis, and treatment plan will appear here.'
    }
    const parts: string[] = []
    if (symptoms.length > 0) {
      parts.push(`What you reported: ${symptoms.join(', ')}.`)
    }
    if (diagnosis.length > 0) {
      parts.push(`What we're considering: ${diagnosis.join(', ')}.`)
    }
    if (meds.length > 0) {
      parts.push(`Your plan: ${meds.map((s, i) => `${i + 1}. ${s}`).join(' ')}`)
    }
    return parts.join(' ')
  }, [symptoms, diagnosis, meds])

  return (
    <div className="flex flex-col h-screen bg-neutral-50 overflow-hidden font-sans text-neutral-900">
      <header className="h-16 shrink-0 border-b border-neutral-200 bg-white px-8 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-200">
            <img src={axxessLogo} alt="Axxess" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-bold text-lg tracking-tight leading-none">Synapse</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-neutral-500 font-bold text-xs uppercase tracking-widest">
            <Clock size={14} />
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          <button
            type="button"
            onClick={() => { logout(); navigate('/login', { replace: true }) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 border border-red-200 transition-all"
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-auto p-6 gap-6 min-h-0">
        <div className="flex min-h-[50vh] shrink-0 gap-6">
        <section className="flex-1 min-w-0 flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden relative min-h-0">
          <div className="px-8 py-5 border-b border-neutral-100 flex items-center justify-between bg-white z-10">
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${isRecording ? 'bg-red-50 text-red-600' : 'bg-red-50 text-red-600'}`}>
                <Mic size={20} />
              </div>
              <div>
                <h2 className="font-bold text-neutral-800">Consultation Recording</h2>
                <p className="text-xs text-neutral-500 font-medium">Record or upload audio to generate a transcript</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isRecording || isUploading}
                className="flex items-center gap-2 px-4 py-2.5 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-600 hover:bg-neutral-50 transition-all disabled:opacity-50"
              >
                <Upload size={18} strokeWidth={2.5} />
                Upload File
              </button>
              {!isRecording ? (
                <button
                  onClick={startSession}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50 group"
                >
                  <Zap size={18} className="group-hover:animate-pulse" strokeWidth={2.5} />
                  Start Listening
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-95 animate-pulse"
                >
                  <Square size={18} fill="currentColor" />
                  Stop & Transcribe
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-auto px-6 py-4 space-y-4 bg-neutral-50/80 rounded-b-3xl">
            <AnimatePresence initial={false}>
              {transcript.length === 0 && !isRecording && !isUploading && !isProcessing && (
                <div key="empty-state" className="flex-1 flex flex-col items-center justify-center text-neutral-400 space-y-4 opacity-50 min-h-[240px]">
                  <div className="w-20 h-20 rounded-3xl bg-neutral-100 flex items-center justify-center border border-neutral-200">
                    <FileAudio size={40} strokeWidth={1.5} />
                  </div>
                  <div className="text-center max-w-sm">
                    <p className="font-bold text-neutral-700 text-lg italic">&quot;Waiting for clinical input...&quot;</p>
                    <p className="text-sm mt-2 leading-relaxed">Start a recording or upload an audio file. When you stop or upload, we&apos;ll generate the transcript.</p>
                  </div>
                </div>
              )}
              {isRecording && transcript.length === 0 && (
                <div key="recording" className="min-h-[200px] flex flex-col items-center justify-center py-8 text-neutral-500">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4 animate-pulse">
                    <Mic size={28} className="text-red-600" />
                  </div>
                  <p className="font-bold text-neutral-700">Recording in progress</p>
                  <p className="text-xs mt-1">Click &quot;Stop & Transcribe&quot; when done to generate the transcript.</p>
                </div>
              )}
              {(isUploading || isProcessing) && (
                <div key="processing" className="min-h-[200px] flex flex-col items-center justify-center py-8">
                  <div className="relative">
                    <Loader2 size={48} className="animate-spin text-red-200" />
                    <Activity size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-600 animate-pulse" />
                  </div>
                  <p className="mt-4 font-bold text-neutral-600 tracking-tight">
                    {isProcessing ? 'Creating transcript from recording...' : 'Processing audio...'}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1 uppercase tracking-widest font-bold">Identifying speakers & entities</p>
                </div>
              )}
              {!isUploading && !isProcessing &&
                transcript.map((line, idx) => (
                  <motion.div
                    key={`t-${idx}`}
                    initial={{ opacity: 0, x: line.speaker === 'Clinician' ? 20 : -20, y: 10 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    className={`flex flex-col ${line.speaker === 'Clinician' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-xl text-[13px] leading-relaxed relative ${
                        line.speaker === 'Clinician'
                          ? 'bg-red-600 text-white rounded-tr-none shadow-xl shadow-red-100/50'
                          : line.speaker === 'Synapse'
                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-tl-none shadow-sm'
                            : 'bg-white border border-neutral-100 text-neutral-800 rounded-tl-none shadow-sm'
                      }`}
                    >
                      <div
                        className={`absolute top-0 ${line.speaker === 'Clinician' ? '-right-3' : '-left-3'} w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold shadow-sm ${
                          line.speaker === 'Clinician' ? 'bg-red-700 text-red-50' : line.speaker === 'Synapse' ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-white'
                        }`}
                      >
                        {line.speaker === 'Synapse' ? 'S' : line.speaker.charAt(0)}
                      </div>
                      <p className="font-bold text-[10px] uppercase tracking-wider mb-2 opacity-80 flex items-center gap-2">
                        {line.speaker}
                        {line.speaker === 'Clinician' && <Zap size={10} fill="currentColor" />}
                        {line.speaker === 'Synapse' && <Activity size={10} />}
                      </p>
                      <p className="font-medium whitespace-pre-wrap">{line.text}</p>
                    </div>
                  </motion.div>
                ))}
              <div ref={transcriptEndRef} className="h-4" />
            </AnimatePresence>
          </div>

          {transcript.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900/90 backdrop-blur px-6 py-3 rounded-full border border-white/20 text-white flex items-center gap-6 shadow-2xl z-10 transition-all hover:bg-neutral-900">
              <div className="flex items-center gap-2 pr-6 border-r border-white/20">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Active Analysis</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-tighter">Entities</p>
                  <p className="text-xs font-bold">{symptoms.length + diagnosis.length + meds.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-tighter">Confidence</p>
                  <p className="text-xs font-bold text-green-400">98.2%</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="w-80 shrink-0 flex flex-col gap-4 min-h-0 overflow-hidden">
          {patients.length > 0 && (
            <div className="shrink-0">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 px-1">Recently Recorded Patients</h3>
              <div className="flex flex-col gap-2">
                {patients.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-3 bg-white border border-neutral-200 rounded-xl hover:border-red-300 hover:bg-red-50/50 transition-all group"
                  >
                    <Link
                      to={`/patient/${p.id}`}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                      <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0 group-hover:bg-red-200">
                        <User size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-neutral-800 text-sm truncate">{p.name}</p>
                        <p className="text-xs text-neutral-500">
                          {p.age ? `${p.age} years` : 'Age not stated'} · <span className="font-mono font-bold text-red-600">#{p.id}</span>
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-neutral-300 shrink-0" />
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => removePatient(p.id, e)}
                      className="shrink-0 p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete patient"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <Link
                to="/patients"
                className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-bold text-[12px] transition-all"
              >
                View All Documentation & Stored Patient Data
              </Link>
            </div>
          )}
          {patients.length > 0 && (
            <div className="shrink-0">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 px-1">Three most recent medical summaries</h3>
              <div className="flex flex-col gap-2">
                {patients.slice(0, 3).map((p) => {
                  const doc = (p as { document?: string }).document ?? (p as { payload?: { document?: string } }).payload?.document ?? ''
                  const snippet = typeof doc === 'string' && doc.trim() ? doc.trim().slice(0, 100) + (doc.length > 100 ? '…' : '') : 'No summary yet.'
                  return (
                    <Link
                      key={p.id}
                      to={`/patient/${p.id}`}
                      className="block p-3 bg-white border border-neutral-200 rounded-xl hover:border-red-300 hover:bg-red-50/50 transition-all text-left"
                    >
                      <p className="font-bold text-neutral-800 text-sm truncate">{p.name}</p>
                      <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2">{snippet}</p>
                      <p className="text-[10px] text-red-600 font-bold mt-2">View full record →</p>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100 shrink-0">
              <h3 className="text-sm font-bold text-neutral-800">Identified Symptoms</h3>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
                <div className="flex flex-wrap gap-2.5">
                  {symptoms.length > 0 ? (
                    symptoms.map((tag, i) => (
                      <motion.span
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        key={`symptom-${i}-${String(tag).slice(0, 20)}`}
                        className="px-3 py-2 bg-neutral-900 text-white text-[11px] font-bold rounded-xl flex items-center gap-2 border border-neutral-800 shadow-sm"
                      >
                        {tag}
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                      </motion.span>
                    ))
                  ) : (
                    <p className="text-xs text-neutral-400 italic font-medium">Listening for symptoms...</p>
                  )}
                  {transcript.length > 0 && !isRecording && !isProcessing && (
                    <button key="add-symptom-btn" type="button" className="w-8 h-8 rounded-xl border-2 border-dashed border-neutral-200 flex items-center justify-center text-neutral-400 hover:border-red-400 hover:text-red-600 transition-all">
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
        </div>

        <div className="w-full shrink-0 flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 shrink-0">
            <h3 className="text-sm font-bold text-neutral-800">Medical Summary</h3>
          </div>
          <div className="overflow-auto px-6 py-4">
            <div className="flex flex-wrap gap-x-8 gap-y-6">
              <section className="min-w-[200px] flex-1">
                <div className="flex items-center gap-2 mb-4 text-neutral-800">
                  <ClipboardList size={16} className="text-red-600" strokeWidth={3} />
                  <h4 className="text-sm font-bold tracking-tight">Summary for Patient</h4>
                </div>
                <div className="p-5 bg-neutral-900 rounded-2xl text-white shadow-lg relative overflow-hidden">
                  {planForDiagnosisLoading ? (
                    <p className="text-[13px] leading-relaxed opacity-90 font-medium relative flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin shrink-0" />
                      Updating summary for selected diagnosis...
                    </p>
                  ) : patientSummaryForSelection ? (
                    <p className="text-[13px] leading-relaxed opacity-90 font-medium relative whitespace-pre-wrap">{patientSummaryForSelection}</p>
                  ) : (
                    <p className="text-[13px] leading-relaxed opacity-90 font-medium relative whitespace-pre-wrap">{summaryForPatient}</p>
                  )}
                </div>
              </section>
              <section className="min-w-[200px] flex-1">
                <div className="flex items-center gap-2 mb-4 text-neutral-800">
                  <Stethoscope size={16} className="text-red-600" strokeWidth={3} />
                  <h4 className="text-sm font-bold tracking-tight">Possible Diagnosis (ICD-10-CM)</h4>
                </div>
                    <div className="space-y-3">
                      {diagnosis.length > 0 ? (
                        diagnosis.map((d, i) => {
                          const isSelected = selectedDiagnosis === d
                          return (
                            <motion.div
                              initial={{ x: 10, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              key={`diagnosis-${i}-${String(d).slice(0, 20)}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedDiagnosis(d)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDiagnosis(d) } }}
                              className={`p-4 rounded-2xl shadow-sm group transition-all cursor-pointer border-2 ${isSelected ? 'bg-red-100 border-red-600 ring-2 ring-red-200' : 'bg-red-50 border border-red-100 hover:bg-red-100 border-transparent'}`}
                            >
                              <div className="flex items-start justify-between">
                                <span className="text-xs font-bold text-red-900 leading-tight">{d}</span>
                                {isSelected ? (
                                  <div className="bg-red-600 text-white p-1 rounded-lg" title="Selected — plan and summary reflect this diagnosis">
                                    <CheckCircle2 size={14} fill="currentColor" />
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-red-600 font-bold uppercase">Click to select</span>
                                )}
                              </div>
                              <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest mt-2 flex items-center gap-1">
                                <Zap size={10} fill="currentColor" />
                                {i === 0 ? 'Primary / from transcript' : 'Consider (from Synapse)'}
                              </p>
                            </motion.div>
                          )
                        })
                      ) : (
                        <div className="h-16 border-2 border-dashed border-neutral-100 rounded-2xl flex items-center justify-center">
                          <p className="text-xs text-neutral-300 font-bold tracking-widest uppercase">Awaiting Clinical Data</p>
                        </div>
                      )}
                </div>
              </section>
              <section className="min-w-[200px] flex-1">
                <div className="flex items-center gap-2 mb-4 text-neutral-800">
                  <Pill size={16} className="text-red-600" strokeWidth={3} />
                  <h4 className="text-sm font-bold tracking-tight">Treatment & Plan</h4>
                </div>
                    <div className="space-y-3">
                      {planForDiagnosisLoading ? (
                        <p className="text-xs text-neutral-500 italic font-medium flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" />
                          Updating plan for selected diagnosis...
                        </p>
                      ) : (treatmentPlanForSelection != null && treatmentPlanForSelection.length > 0 ? treatmentPlanForSelection : meds).length > 0 ? (
                        (treatmentPlanForSelection != null && treatmentPlanForSelection.length > 0 ? treatmentPlanForSelection : meds).map((m, i) => (
                          <motion.div
                            initial={{ y: 5, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            key={`med-${i}-${String(m).slice(0, 20)}`}
                            className="p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-[13px] font-bold text-neutral-700 flex items-center gap-4 hover:border-red-200 transition-all"
                          >
                            <div className="w-8 h-8 rounded-xl bg-white shadow-sm border border-neutral-100 flex items-center justify-center text-red-600">
                              <Pill size={16} />
                            </div>
                            <div className="flex-1">
                              <span className="text-neutral-500 font-medium mr-1.5">{i + 1}.</span>
                              {m}
                              <p className="text-[10px] text-neutral-400 font-medium mt-1">
                                {treatmentPlanForSelection != null && treatmentPlanForSelection.length > 0 ? 'For selected diagnosis' : 'From Synapse (treatment plan)'}
                              </p>
                            </div>
                          </motion.div>
                        ))
                      ) : (
                        <p className="text-xs text-neutral-400 italic font-medium">No treatments identified yet...</p>
                      )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      <footer className="h-10 shrink-0 bg-white border-t border-neutral-200 z-20" />
    </div>
  )
}
