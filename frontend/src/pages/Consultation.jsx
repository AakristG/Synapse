import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mic,
  Square,
  Activity,
  ClipboardList,
  Stethoscope,
  Pill,
  Globe,
  CheckCircle2,
  Trash2,
  Upload,
  FileAudio,
  Loader2,
  Send,
  Zap,
  Clock,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import axxessLogo from '../assets/axxess-logo.png'
import { toast } from 'sonner'
import { api } from '../api'

export default function Consultation() {
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [now, setNow] = useState(() => new Date())
  const [symptoms, setSymptoms] = useState([])
  const [diagnosis, setDiagnosis] = useState([])
  const [meds, setMeds] = useState([])
  const [documentText, setDocumentText] = useState('')
  const fileInputRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const applyExtractionResult = useCallback((result) => {
    // Show conversation: (1) what you said — transcript, (2) AI response — structured summary
    const lines = []
    if (result.transcript && result.transcript.trim()) {
      lines.push({ speaker: 'Clinician', text: result.transcript.trim() })
    }
    if (result.document && result.document.trim()) {
      lines.push({ speaker: 'Synapse', text: result.document.trim() })
    }
    if (lines.length > 0) {
      setTranscript(lines)
    }
    if (Array.isArray(result.symptoms) && result.symptoms.length > 0) {
      setSymptoms(result.symptoms.map((s) => (typeof s === 'string' ? s : String(s))))
    }
    if (result.diagnosis) {
      setDiagnosis([result.diagnosis])
    }
    if (result.document) {
      setDocumentText(result.document)
    }
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  const scrollToBottom = () => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [transcript])

  const startSession = useCallback(() => {
    resetSession()
    chunksRef.current = []
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
      .catch(() => {
        toast.error('Microphone access denied or unavailable.')
      })
  }, [])

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) return
    mediaRecorderRef.current.stop()
    setIsRecording(false)
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    setIsProcessing(true)
    toast.info('Creating transcript from your recording...')
    api
      .extractAudio(blob)
      .then((data) => {
        applyExtractionResult(data)
        toast.success('Recording transcribed and analyzed.')
      })
      .catch((err) => {
        toast.error(err.message || 'Transcription failed.')
      })
      .finally(() => setIsProcessing(false))
  }, [isRecording, applyExtractionResult])

  const handleFileUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      resetSession()
      setIsUploading(true)
      toast.info(`Processing ${file.name}...`)
      const reader = new FileReader()
      reader.onload = () => {
        const blob = new Blob([reader.result], { type: file.type || 'audio/webm' })
        api
          .extractAudio(blob)
          .then((data) => {
            applyExtractionResult(data)
            toast.success('Audio transcribed and analyzed.')
          })
          .catch((err) => {
            toast.error(err.message || 'Transcription failed.')
          })
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
    setMeds([])
    setDocumentText('')
  }

  const handleSendSummary = () => {
    toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
      loading: 'Generating clinical summary...',
        success: 'Clinical summary generated.',
        error: 'Failed to generate summary.',
    })
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-50 overflow-hidden font-sans text-neutral-900">
      <header className="h-16 shrink-0 border-b border-neutral-200 bg-white px-8 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <img src="/assets/axxess-logo.png" className="w-full h-full object-contain rounded-xl" />
          </div>
          <h1 className="font-bold text-lg tracking-tight leading-none">Synapse</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-neutral-500 font-bold text-xs uppercase tracking-widest">
            <Clock size={14} />
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-6 gap-6 items-stretch min-h-0">
        <section className="flex-1 min-w-0 flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden relative min-h-0">
          <div className="px-8 py-5 border-b border-neutral-100 flex items-center justify-between bg-white z-10">
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${isRecording ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
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
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 group"
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
                    <Loader2 size={48} className="animate-spin text-blue-200" />
                    <Activity size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-600 animate-pulse" />
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
                          ? 'bg-blue-600 text-white rounded-tr-none shadow-xl shadow-blue-100/50'
                          : line.speaker === 'Synapse'
                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-tl-none shadow-sm'
                            : 'bg-white border border-neutral-100 text-neutral-800 rounded-tl-none shadow-sm'
                      }`}
                    >
                      <div
                        className={`absolute top-0 ${line.speaker === 'Clinician' ? '-right-3' : '-left-3'} w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold shadow-sm ${
                          line.speaker === 'Clinician' ? 'bg-blue-700 text-blue-50' : line.speaker === 'Synapse' ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-white'
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

        <aside className="flex-1 min-w-0 flex gap-4 flex-col min-h-0">
          <div className="shrink-0 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-neutral-800">Maria Santos</h3>
              <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wide">ID: #1001 • 40y Female</p>
            </div>
            <button
              onClick={resetSession}
              className="shrink-0 py-2.5 px-4 border border-neutral-200 text-neutral-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 rounded-xl font-bold text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
            >
              <Trash2 size={14} strokeWidth={2.5} />
              Discard Session Data
            </button>
          </div>
          <div className="flex gap-4 flex-1 min-h-0 min-w-0">
          <div className="flex-1 min-w-0 flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm min-h-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100 shrink-0">
              <h3 className="text-sm font-bold text-neutral-800">Medical Summary</h3>
            </div>
            <div className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-6">
              <section>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-neutral-800">
                        <Activity size={16} className="text-blue-600" strokeWidth={3} />
                        <h4 className="text-sm font-bold tracking-tight">Identified Symptoms</h4>
                      </div>
                      <button className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">Edit</button>
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
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                          </motion.span>
                        ))
                      ) : (
                        <p className="text-xs text-neutral-400 italic font-medium">Listening for symptoms...</p>
                      )}
                      {transcript.length > 0 && !isRecording && !isProcessing && (
                        <button key="add-symptom-btn" type="button" className="w-8 h-8 rounded-xl border-2 border-dashed border-neutral-200 flex items-center justify-center text-neutral-400 hover:border-blue-400 hover:text-blue-600 transition-all">
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
              </section>
              <section>
                <div className="flex items-center gap-2 mb-4 text-neutral-800">
                  <Stethoscope size={16} className="text-blue-600" strokeWidth={3} />
                  <h4 className="text-sm font-bold tracking-tight">Diagnosis (ICD-10-CM)</h4>
                </div>
                    <div className="space-y-3">
                      {diagnosis.length > 0 ? (
                        diagnosis.map((d, i) => (
                          <motion.div
                            initial={{ x: 10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            key={`diagnosis-${i}-${String(d).slice(0, 20)}`}
                            className="p-4 bg-blue-50 border border-blue-100 rounded-2xl shadow-sm group hover:bg-blue-100 transition-all"
                          >
                            <div className="flex items-start justify-between">
                              <span className="text-xs font-bold text-blue-900 leading-tight">{d}</span>
                              <div className="bg-blue-600 text-white p-1 rounded-lg">
                                <CheckCircle2 size={14} fill="currentColor" />
                              </div>
                            </div>
                            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mt-2 flex items-center gap-1">
                              <Zap size={10} fill="currentColor" /> Extracted from Transcript
                            </p>
                          </motion.div>
                        ))
                      ) : (
                        <div className="h-16 border-2 border-dashed border-neutral-100 rounded-2xl flex items-center justify-center">
                          <p className="text-xs text-neutral-300 font-bold tracking-widest uppercase">Awaiting Clinical Data</p>
                        </div>
                      )}
                </div>
              </section>
              <section>
                <div className="flex items-center gap-2 mb-4 text-neutral-800">
                  <Pill size={16} className="text-blue-600" strokeWidth={3} />
                  <h4 className="text-sm font-bold tracking-tight">Treatment & Plan</h4>
                </div>
                    <div className="space-y-3">
                      {meds.length > 0 ? (
                        meds.map((m, i) => (
                          <motion.div
                            initial={{ y: 5, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            key={`med-${i}-${String(m).slice(0, 20)}`}
                            className="p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-[13px] font-bold text-neutral-700 flex items-center gap-4 hover:border-blue-200 transition-all"
                          >
                            <div className="w-8 h-8 rounded-xl bg-white shadow-sm border border-neutral-100 flex items-center justify-center text-blue-600">
                              <Pill size={16} />
                            </div>
                            <div className="flex-1">
                              {m}
                              <p className="text-[10px] text-neutral-400 font-medium">As discussed during visit</p>
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

          <div className="flex-1 min-w-0 flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm min-h-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100 shrink-0">
              <h3 className="text-sm font-bold text-neutral-800">Patient Recs</h3>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-4">
              <div className="p-5 bg-neutral-900 rounded-2xl text-white shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <ClipboardList size={80} />
                    </div>
                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2 relative">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      Patient Recovery Guide
                    </h4>
                    {documentText ? (
                      <p className="text-[13px] leading-relaxed opacity-90 font-medium relative whitespace-pre-wrap">{documentText}</p>
                    ) : (
                      <>
                        <p className="text-[13px] leading-relaxed opacity-90 font-medium relative">
                          Record or upload audio to generate a clinical document from your dictation.
                        </p>
                        <div className="mt-4 pt-4 border-t border-white/10 relative">
                          <p className="text-[10px] uppercase font-bold text-blue-400 tracking-widest mb-2">From your recording</p>
                          <p className="text-xs italic opacity-80">Vitals, symptoms, diagnosis, and recovery plan will appear here.</p>
                        </div>
                      </>
                    )}
              </div>
              <div className="space-y-3">
                <h5 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-1">Follow-up Tasks</h5>
                    <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm hover:border-blue-200 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                        <Stethoscope size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-bold text-neutral-800">Chest X-Ray Imaging</p>
                        <p className="text-[11px] text-neutral-500 font-medium">Tomorrow, Feb 22 at 10:00 AM</p>
                      </div>
                      <ChevronRight size={16} className="text-neutral-300" />
                    </div>
                <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm hover:border-blue-200 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600 border border-green-100">
                    <Globe size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-bold text-neutral-800">Telehealth Follow-up</p>
                    <p className="text-[11px] text-neutral-500 font-medium">Scheduled for next Friday</p>
                  </div>
                  <ChevronRight size={16} className="text-neutral-300" />
                </div>
              </div>
              </div>
              <div className="shrink-0 px-6 py-4 border-t border-neutral-100 bg-white">
                <button
                  onClick={handleSendSummary}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all active:scale-[0.98] group"
                >
                  <Send size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  Generate Clinical Summary
                </button>
              </div>
            </div>
          </div>
          </div>
        </aside>
      </main>

      <footer className="h-10 shrink-0 bg-white border-t border-neutral-200 z-20" />
    </div>
  )
}
