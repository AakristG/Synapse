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
  Send,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { api, formatPatientsContext } from '../api'
import type { StoredPatient } from './PatientDetail'
import axxessLogo from '../assets/axxess-logo.png'

const PATIENTS_STORAGE_KEY = 'synapse_patients'
const CONSULTATION_SESSION_KEY = 'synapse_consultation_session'

const PATIENT_SUMMARY_LANGUAGES = [
  { value: 'English', label: 'English' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'French', label: 'French' },
  { value: 'Hindi', label: 'Hindi' },
  { value: 'Arabic', label: 'Arabic' },
  { value: 'Chinese', label: 'Chinese' },
  { value: 'Portuguese', label: 'Portuguese' },
  { value: 'German', label: 'German' },
] as const

/** Browser SpeechRecognition instance (Web Speech API; not in all TS DOM libs) */
type SpeechRecognitionInstance = InstanceType<NonNullable<typeof window.SpeechRecognition>> extends infer T ? T : { start(): void; stop(): void }

interface TranscriptLine {
  speaker: string
  text: string
}

interface ExtractionResult {
  transcript?: string
  document?: string
  question?: string | null
  missing?: string[]
  name?: string
  age?: string
  symptoms?: string[]
  diagnosis?: string
  possible_diagnoses?: string[]
  treatment_plan?: string[]
  [key: string]: unknown
}

const INITIAL_AI_MESSAGE =
  'Ask about data or please state the patient\'s name, age, and presenting symptoms to begin documentation.'

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

interface ConsultationSession {
  transcript: TranscriptLine[]
  symptoms: string[]
  diagnosis: string[]
  selectedDiagnosis: string | null
  treatmentPlanForSelection: string[] | null
  patientSummaryForSelection: string | null
  meds: string[]
}

function loadConsultationSession(): ConsultationSession | null {
  try {
    const raw = localStorage.getItem(CONSULTATION_SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as ConsultationSession
    if (!s || typeof s !== 'object') return null
    const hasContent =
      (Array.isArray(s.transcript) && s.transcript.length > 1) ||
      (Array.isArray(s.symptoms) && s.symptoms.length > 0) ||
      (Array.isArray(s.diagnosis) && s.diagnosis.length > 0) ||
      (Array.isArray(s.meds) && s.meds.length > 0)
    if (!hasContent) return null
    return {
      transcript: Array.isArray(s.transcript) ? s.transcript : [],
      symptoms: Array.isArray(s.symptoms) ? s.symptoms : [],
      diagnosis: Array.isArray(s.diagnosis) ? s.diagnosis : [],
      selectedDiagnosis: s.selectedDiagnosis != null ? s.selectedDiagnosis : null,
      treatmentPlanForSelection: Array.isArray(s.treatmentPlanForSelection) ? s.treatmentPlanForSelection : null,
      patientSummaryForSelection: s.patientSummaryForSelection != null ? s.patientSummaryForSelection : null,
      meds: Array.isArray(s.meds) ? s.meds : [],
    }
  } catch {
    return null
  }
}

function saveConsultationSession(session: ConsultationSession): void {
  try {
    localStorage.setItem(CONSULTATION_SESSION_KEY, JSON.stringify(session))
  } catch {
    // ignore
  }
}

export default function Consultation() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptLine[]>(() => {
    const s = loadConsultationSession()
    return s?.transcript?.length ? s.transcript : [{ speaker: 'Synapse', text: INITIAL_AI_MESSAGE }]
  })
  const [now, setNow] = useState(() => new Date())
  const [symptoms, setSymptoms] = useState<string[]>(() => loadConsultationSession()?.symptoms ?? [])
  const [diagnosis, setDiagnosis] = useState<string[]>(() => loadConsultationSession()?.diagnosis ?? [])
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(() => loadConsultationSession()?.selectedDiagnosis ?? null)
  const [planForDiagnosisLoading, setPlanForDiagnosisLoading] = useState(false)
  const [treatmentPlanForSelection, setTreatmentPlanForSelection] = useState<string[] | null>(() => loadConsultationSession()?.treatmentPlanForSelection ?? null)
  const [patientSummaryForSelection, setPatientSummaryForSelection] = useState<string | null>(() => loadConsultationSession()?.patientSummaryForSelection ?? null)
  const [meds, setMeds] = useState<string[]>(() => loadConsultationSession()?.meds ?? [])
  const [patients, setPatients] = useState<StoredPatient[]>(() => loadPatients())
  const [typedMessage, setTypedMessage] = useState('')
  const [isSendingText, setIsSendingText] = useState(false)
  const [responseLanguage, setResponseLanguage] = useState('')
  const [summaryLanguage, setSummaryLanguage] = useState<string>('English')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const speechTranscriptRef = useRef('')

  const applyExtractionResult = useCallback(
    (result: ExtractionResult, options?: { append?: boolean; currentTranscript?: TranscriptLine[] }) => {
      const append = options?.append ?? false
      const currentTranscript = options?.currentTranscript ?? []
      const newLines: TranscriptLine[] = []
      if (result.transcript && result.transcript.trim()) {
        newLines.push({ speaker: 'Clinician', text: result.transcript.trim() })
      }
      const synapseText =
        (result.question && result.question.trim()) ||
        (result.document && result.document.trim()) ||
        ''
      if (synapseText) {
        newLines.push({ speaker: 'Synapse', text: synapseText.trim() })
      }
      const fullTranscriptLines = newLines.length > 0
        ? append
          ? [...currentTranscript, ...newLines]
          : newLines
        : currentTranscript
      if (newLines.length > 0) {
        setTranscript((prev) => (append ? [...prev, ...newLines] : newLines))
      }
      if (Array.isArray(result.symptoms) && result.symptoms.length > 0) {
        setSymptoms(result.symptoms.map((s) => (typeof s === 'string' ? s : String(s))))
      }
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
      const plan = Array.isArray(result.treatment_plan)
        ? result.treatment_plan.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        : []
      if (plan.length > 0) setMeds(plan.map((s) => s.trim()))
      const name = (result.name || '').trim()
      const age = (result.age || '').trim()
      const symptomsList = Array.isArray(result.symptoms) ? result.symptoms : []
      const hasRequired = name && age && symptomsList.length > 0
      if (hasRequired) {
        const normalizedName = name.toLowerCase()
        const normalizedAge = age
        const planArr = plan.length > 0 ? plan : (Array.isArray(result.treatment_plan) ? result.treatment_plan : [])
        const possibleArr = possible.length > 0 ? possible : (Array.isArray(result.possible_diagnoses) ? result.possible_diagnoses : [])
        const existing = patients.find(
          (p) =>
            (p.name ?? '').trim().toLowerCase() === normalizedName &&
            (p.age ?? '').trim() === normalizedAge,
        )
        const newId = existing ? undefined : generatePatientId()
        setPatients((prev) => {
          const match = prev.find(
            (p) =>
              (p.name ?? '').trim().toLowerCase() === normalizedName &&
              (p.age ?? '').trim() === normalizedAge,
          )
          if (match) {
            const updated: StoredPatient = {
              ...match,
              name,
              age,
              createdAt: match.createdAt,
              transcriptRecording: fullTranscriptLines,
              symptoms: symptomsList,
              diagnosis: (result.diagnosis ?? match.diagnosis ?? '').trim(),
              possible_diagnoses: possibleArr,
              treatment_plan: planArr,
              document: (result.document ?? match.document ?? '').trim(),
              transcript: (result.transcript ?? '').trim(),
            }
            const next = [updated, ...prev.filter((p) => p.id !== match.id)]
            try {
              localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(next))
            } catch {}
            return next
          }
          const patient: StoredPatient = {
            ...result,
            id: newId!,
            name,
            age,
            createdAt: new Date().toISOString(),
            transcriptRecording: fullTranscriptLines,
            symptoms: symptomsList,
            diagnosis: result.diagnosis ?? '',
            possible_diagnoses: possibleArr,
            treatment_plan: planArr,
            document: (result.document ?? '').trim(),
            transcript: (result.transcript ?? '').trim(),
          }
          const next = [patient, ...prev].slice(0, 50)
          try {
            localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(next))
          } catch {}
          return next
        })
        toast.success(existing ? `Patient updated — ID ${existing.id}` : `Patient recorded — ID ${newId}`)
      }
    },
    [patients],
  )

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    saveConsultationSession({
      transcript,
      symptoms,
      diagnosis,
      selectedDiagnosis,
      treatmentPlanForSelection,
      patientSummaryForSelection,
      meds,
    })
  }, [transcript, symptoms, diagnosis, selectedDiagnosis, treatmentPlanForSelection, patientSummaryForSelection, meds])

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
      .planForDiagnosis(selectedDiagnosis, symptoms, documentFromTranscript, summaryLanguage)
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
  }, [selectedDiagnosis, symptoms, documentFromTranscript, summaryLanguage])

  const startSession = useCallback(() => {
    chunksRef.current = []
    speechTranscriptRef.current = ''
    const SpeechRecognitionAPI = window.SpeechRecognition ?? (window as Window & { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition
    if (SpeechRecognitionAPI) {
      try {
        const recognition = new SpeechRecognitionAPI()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'
        recognition.onresult = (e: SpeechRecognitionEvent) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const result = e.results[i]
            if (result?.isFinal) {
              const t = result?.[0]?.transcript
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
    const previousContext = transcript
      .map((l) => `${l.speaker}: ${l.text}`)
      .join('\n\n')
      .trim()
    const append = previousContext.length > 0
    setIsProcessing(true)
    toast.info(liveTranscript ? 'Sending your words to Synapse...' : 'Creating transcript from your recording...')
    const patientsContext = formatPatientsContext(patients)
    const send = () => {
      api.extractAudio(blob, previousContext, liveTranscript, patientsContext, responseLanguage)
        .then((data) => {
          applyExtractionResult(data as ExtractionResult, { append, currentTranscript: transcript })
          toast.success(append ? 'Response added. Continue when ready.' : 'Recording transcribed and analyzed.')
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'Transcription failed.'))
        .finally(() => setIsProcessing(false))
    }
    if (liveTranscript) setTimeout(send, 300)
    else send()
  }, [isRecording, transcript, patients, responseLanguage, applyExtractionResult])

  const handleFileUpload = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setIsUploading(true)
      const previousContext = transcript
        .map((l) => `${l.speaker}: ${l.text}`)
        .join('\n\n')
        .trim()
      const append = previousContext.length > 0
      toast.info(`Processing ${file.name}...`)
      const reader = new FileReader()
      reader.onload = () => {
        const blob = new Blob([reader.result as ArrayBuffer], { type: file.type || 'audio/webm' })
        const patientsContext = formatPatientsContext(patients)
        api.extractAudio(blob, previousContext, '', patientsContext, responseLanguage)
          .then((data) => {
            applyExtractionResult(data as ExtractionResult, { append, currentTranscript: transcript })
            toast.success(append ? 'Audio added to conversation.' : 'Audio transcribed and analyzed.')
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : 'Transcription failed.'))
          .finally(() => setIsUploading(false))
      }
      reader.readAsArrayBuffer(file)
    },
    [transcript, patients, responseLanguage, applyExtractionResult],
  )

  const sendTypedMessage = useCallback(() => {
    const text = typedMessage.trim()
    if (!text || isProcessing || isRecording || isUploading) return
    const previousContext = transcript
      .map((l) => `${l.speaker}: ${l.text}`)
      .join('\n\n')
      .trim()
    setTypedMessage('')
    setIsSendingText(true)
    setIsProcessing(true)
    const patientsContext = formatPatientsContext(patients)
    api
      .sendTextToSynapse(text, previousContext, patientsContext, responseLanguage)
      .then((data) => {
        applyExtractionResult(data as ExtractionResult, {
          append: true,
          currentTranscript: transcript,
        })
        toast.success('Synapse replied.')
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not send message.'))
      .finally(() => { setIsSendingText(false); setIsProcessing(false) })
  }, [typedMessage, transcript, patients, responseLanguage, isProcessing, isRecording, isUploading, applyExtractionResult])

  const resetSession = () => {
    try {
      localStorage.removeItem(CONSULTATION_SESSION_KEY)
    } catch {
      // ignore
    }
    setTranscript([{ speaker: 'Synapse', text: INITIAL_AI_MESSAGE }])
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
    setPatients((prev) => {
      const next = prev.filter((p) => p.id !== patientId)
      localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(next))
      return next
    })
    toast.success('Patient removed.')
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
    <div className="flex flex-col h-screen bg-neutral-50 overflow-hidden font-sans text-neutral-900 phase-in">
      <header className="h-16 shrink-0 border-b border-neutral-200 bg-white px-8 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <img src={axxessLogo} alt="Axxess" className="h-8 w-auto object-contain" />
          <span className="text-black font-medium">
            Welcome, {user?.username ?? 'User'}
          </span>
        </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-neutral-500 font-bold text-xs uppercase tracking-widest">
                <Clock size={14} />
                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <a
                href="#medical-summary"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('medical-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="text-sm font-bold text-neutral-700 hover:text-red-600  transition-colors"
              >
                Medical Summary
              </a>
              <a
                href="#patient-information"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('patient-information')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="text-sm font-bold text-neutral-700 hover:text-red-600 transition-colors"
              >
                Patient Information
              </a>
            </div>
            {/* ER Triage — commented out
            <Link
              to="/triage"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-neutral-700 hover:bg-neutral-100 border border-neutral-200 transition-all"
            >
              <Activity size={18} />
              ER Triage
            </Link>
            */}
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

      <main className="flex-1 flex flex-col overflow-auto p-6 gap-30 min-h-0 phase-in-stagger">
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
                type="button"
                onClick={resetSession}
                disabled={isRecording || isUploading}
                className="flex items-center gap-2 px-3 py-2.5 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-500 hover:bg-neutral-100 transition-all disabled:opacity-50"
                title="Start a new patient consultation"
              >
                <Plus size={16} />
                New consultation
              </button>
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

          <div className="flex-1 min-h-0 flex flex-col bg-neutral-50/80 rounded-b-3xl">
            <div className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-4">
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
                      {isSendingText ? 'Sending to Synapse...' : isProcessing ? 'Creating transcript from recording...' : 'Processing audio...'}
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
                          line.speaker === 'Clinician' /* TODO: change Clinician to username */
                            ? 'bg-red-600 text-white rounded-tr-none shadow-xl shadow-red-100/50'
                            : line.speaker === 'Synapse AI'
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
            <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 rounded-b-3xl space-y-2">
              <div className="flex items-center gap-2">
                <label htmlFor="response-language" className="text-xs font-medium text-neutral-500 whitespace-nowrap">
                  Response language:
                </label>
                <select
                  id="response-language"
                  value={responseLanguage}
                  onChange={(e) => setResponseLanguage(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-200 text-sm text-neutral-700 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                >
                  <option value="">Auto (same as input)</option>
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Arabic">Arabic</option>
                  <option value="Chinese">Chinese</option>
                  <option value="Portuguese">Portuguese</option>
                  <option value="German">German</option>
                </select>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); sendTypedMessage() }}
              >
                <input
                  type="text"
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  placeholder="Type to Synapse AI (any language)..."
                  disabled={isProcessing || isRecording || isUploading}
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!typedMessage.trim() || isProcessing || isRecording || isUploading}
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-all"
                >
                  <Send size={18} />
                  Send
                </button>
              </form>
            </div>
          </div>
        </section>
        </div>

        <div id="medical-summary" className="w-full shrink-0 flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 shrink-0">
            <h3 className="text-sm font-bold text-neutral-800">Medical Summary</h3>
          </div>
          <div className="overflow-auto px-6 py-4">
            <div className="flex flex-wrap gap-x-8 gap-y-6">
              <div className="min-w-[200px] flex-1 flex flex-col gap-6">
                <section>
                  <div className="flex items-center gap-2 mb-4 text-neutral-800">
                    <Activity size={16} className="text-red-600" strokeWidth={3} />
                    <h4 className="text-sm font-bold tracking-tight">Identified Symptoms</h4>
                  </div>
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
                  </div>
                </section>
                <section>
                  <div className="flex items-center gap-2 mb-4 pt-10 text-neutral-800">
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
              </div>
              <section className="min-w-[200px] flex-1 flex flex-col items-center">
                <div className="flex items-center gap-2 mb-4 text-neutral-800">
                  <Pill size={16} className="text-red-600" strokeWidth={3} />
                  <h4 className="text-sm font-bold tracking-tight">Treatment & Plan</h4>
                </div>
                    <div className="space-y-3 w-full max-w-md flex flex-col items-center">
                      {planForDiagnosisLoading ? (
                        <p className="text-xs text-neutral-500 italic font-medium flex items-center justify-center gap-2">
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
                        <p className="text-xs text-neutral-400 italic font-medium text-center">No treatments identified yet...</p>
                      )}
                </div>
              </section>
            </div>
          </div>
        </div>

        <div id="patient-information" className="w-full shrink-0 flex flex-wrap gap-6">
          {patients.length > 0 && (
            <div className="flex-1 min-w-[280px] flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-100 shrink-0">
                <h3 className="text-sm font-bold text-neutral-800">Recently Recorded Patients</h3>
              </div>
              <div className="px-6 py-5">
                <div className="flex flex-col gap-5">
                  {patients.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-4 bg-white border border-neutral-200 rounded-xl hover:border-red-300 hover:bg-red-50/50 transition-all group"
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
                  className="mt-3 inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-bold text-[12px] transition-all"
                >
                  View All Patients
                </Link>
              </div>
            </div>
          )}
          <div className="flex-1 min-w-[280px] flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100 shrink-0 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-bold text-neutral-800">Summary for Patient</h3>
              <select
                value={summaryLanguage}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSummaryLanguage(e.target.value)}
                className="text-xs font-bold text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                aria-label="Summary language"
              >
                {PATIENT_SUMMARY_LANGUAGES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="px-6 py-4 flex flex-col items-center justify-center">
              <div className="p-5 bg-neutral-900 rounded-2xl text-white shadow-lg relative overflow-hidden group w-full max-w-2xl text-center">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <ClipboardList size={80} />
                </div>
                {planForDiagnosisLoading ? (
                  <p className="text-[13px] leading-relaxed opacity-90 font-medium relative flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin shrink-0" />
                    Updating summary for selected diagnosis...
                  </p>
                ) : patientSummaryForSelection ? (
                  <p className="text-[13px] leading-relaxed opacity-90 font-medium relative whitespace-pre-wrap">{patientSummaryForSelection}</p>
                ) : (
                  <p className="text-[13px] leading-relaxed opacity-90 font-medium relative whitespace-pre-wrap">{summaryForPatient}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="h-10 shrink-0 bg-white border-t border-neutral-200 z-20" />
    </div>
  )
}
