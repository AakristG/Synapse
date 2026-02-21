import { useState, useEffect, useRef } from 'react'
import {
  Mic,
  Square,
  Activity,
  ClipboardList,
  Stethoscope,
  Pill,
  User,
  Globe,
  CheckCircle2,
  Trash2,
  AlertCircle,
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
import { toast } from 'sonner'

const MOCK_TRANSCRIPT_LINES = [
  { speaker: 'Clinician', text: 'Good morning Emma, how are you feeling today?' },
  { speaker: 'Patient', text: "Hi Dr. Sarah, I've been feeling quite weak lately. I've had a persistent cough for about three days now." },
  { speaker: 'Clinician', text: "I'm sorry to hear that. Any fever or body aches?" },
  { speaker: 'Patient', text: 'Yes, I had a slight fever last night, around 101 degrees, and my chest feels a bit tight when I breathe deeply.' },
  { speaker: 'Clinician', text: "Okay, let's take a look. I'll check your vitals first. Blood pressure is 120 over 80. Heart rate is 88 beats per minute. Temperature is currently 99.4." },
  { speaker: 'Clinician', text: "Your lungs sound a bit congested on the lower left side. I suspect it might be a mild case of bronchitis, but we'll run some tests." },
  { speaker: 'Patient', text: 'What kind of tests?' },
  { speaker: 'Clinician', text: "We'll do a quick chest X-ray and a throat swab. In the meantime, I'll prescribe some Albuterol for the tightness and suggest rest." },
  { speaker: 'Clinician', text: "I'll update your recovery plan. Make sure to drink plenty of fluids and follow up if the cough worsens or you see blood." },
]

export default function Consultation() {
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [activeTab, setActiveTab] = useState('medical')
  const [vitals, setVitals] = useState({ bp: '--/--', hr: '--', temp: '--', oxy: '98' })
  const [symptoms, setSymptoms] = useState([])
  const [diagnosis, setDiagnosis] = useState([])
  const [meds, setMeds] = useState([])
  const fileInputRef = useRef(null)
  const transcriptEndRef = useRef(null)

  const processTranscriptLine = (line) => {
    const text = line.text
    if (text.includes('cough')) setSymptoms((prev) => [...new Set([...prev, 'Persistent cough'])])
    if (text.includes('weak')) setSymptoms((prev) => [...new Set([...prev, 'Generalized weakness'])])
    if (text.includes('fever')) setSymptoms((prev) => [...new Set([...prev, 'Febrile illness'])])
    if (text.includes('tight')) setSymptoms((prev) => [...new Set([...prev, 'Chest tightness'])])
    if (text.includes('Blood pressure is 120 over 80')) setVitals((v) => ({ ...v, bp: '120/80' }))
    if (text.includes('Heart rate is 88')) setVitals((v) => ({ ...v, hr: '88 bpm' }))
    if (text.includes('Temperature is currently 99.4')) setVitals((v) => ({ ...v, temp: '99.4°F' }))
    if (text.includes('bronchitis')) setDiagnosis((prev) => [...new Set([...prev, 'Acute Bronchitis (J20.9)'])])
    if (text.includes('Albuterol')) setMeds((prev) => [...new Set([...prev, 'Albuterol Inhaler (90mcg)'])])
  }

  const scrollToBottom = () => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [transcript])

  useEffect(() => {
    let interval
    if (isRecording && currentLineIndex < MOCK_TRANSCRIPT_LINES.length) {
      interval = setInterval(() => {
        const nextLine = MOCK_TRANSCRIPT_LINES[currentLineIndex]
        processTranscriptLine(nextLine)
        setTranscript((prev) => [...prev, nextLine])
        setCurrentLineIndex((prev) => prev + 1)
        if (currentLineIndex === MOCK_TRANSCRIPT_LINES.length - 1) {
          setIsRecording(false)
          toast.success('Consultation recording complete and analyzed.')
        }
      }, 2500)
    }
    return () => clearInterval(interval)
  }, [isRecording, currentLineIndex])

  const startSession = () => {
    resetSession()
    setIsRecording(true)
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      resetSession()
      setIsUploading(true)
      toast.info(`Uploading ${file.name}...`)
      setTimeout(() => {
        setTranscript(MOCK_TRANSCRIPT_LINES)
        MOCK_TRANSCRIPT_LINES.forEach((line) => processTranscriptLine(line))
        setIsUploading(false)
        toast.success('Audio file processed and analyzed.')
      }, 3000)
    }
  }

  const resetSession = () => {
    setTranscript([])
    setCurrentLineIndex(0)
    setSymptoms([])
    setDiagnosis([])
    setMeds([])
    setVitals({ bp: '--/--', hr: '--', temp: '--', oxy: '98' })
  }

  const handleSendSummary = () => {
    toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
      loading: 'Generating and sending summary...',
      success: 'Summary sent to Emma Watson!',
      error: 'Failed to send summary.',
    })
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-50 overflow-hidden font-sans text-neutral-900">
      <header className="h-16 shrink-0 border-b border-neutral-200 bg-white px-8 flex items-center justify-between z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Stethoscope size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight leading-none">DiagAssist AI</h1>
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mt-0.5">Clinical Workspace</p>
            </div>
          </div>
          <div className="h-8 w-px bg-neutral-200" />
          <div className="flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-full border border-neutral-200 shadow-inner">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">EMR: Epic Connected</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 pr-6 border-r border-neutral-200">
            <div className="text-right">
              <p className="text-sm font-bold leading-tight text-neutral-800">Dr. Sarah Chen</p>
              <p className="text-[10px] text-neutral-500 font-semibold">General Practitioner</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden ring-2 ring-white shadow-sm border border-neutral-200">
              <img src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=100&h=100&fit=crop" alt="Doctor" className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="flex items-center gap-4 text-neutral-400 font-bold text-xs uppercase tracking-widest bg-white">
            <Clock size={14} />
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-6 gap-6">
        <section className="flex-1 flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden relative">
          <div className="px-8 py-5 border-b border-neutral-100 flex items-center justify-between bg-white z-10">
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${isRecording ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                <Mic size={20} />
              </div>
              <div>
                <h2 className="font-bold text-neutral-800">Consultation Recording</h2>
                <p className="text-xs text-neutral-500 font-medium">Capture patient dialogue and clinical dictation in real-time</p>
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
                  onClick={() => setIsRecording(false)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-95 animate-pulse"
                >
                  <Square size={18} fill="currentColor" />
                  Stop Capture
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto px-8 py-6 space-y-6 bg-neutral-50/80">
            <AnimatePresence initial={false}>
              {transcript.length === 0 && !isRecording && !isUploading && (
                <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-4 opacity-50">
                  <div className="w-20 h-20 rounded-3xl bg-neutral-100 flex items-center justify-center border border-neutral-200">
                    <FileAudio size={40} strokeWidth={1.5} />
                  </div>
                  <div className="text-center max-w-sm">
                    <p className="font-bold text-neutral-700 text-lg italic">&quot;Waiting for clinical input...&quot;</p>
                    <p className="text-sm mt-2 leading-relaxed">Initiate a live recording or upload an audio file to begin the diagnostic extraction process.</p>
                  </div>
                </div>
              )}
              {isUploading && (
                <div className="h-full flex flex-col items-center justify-center">
                  <div className="relative">
                    <Loader2 size={64} className="animate-spin text-blue-100" />
                    <Activity size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-600 animate-pulse" />
                  </div>
                  <p className="mt-6 font-bold text-neutral-600 tracking-tight">Processing clinical audio...</p>
                  <p className="text-xs text-neutral-400 mt-1 uppercase tracking-widest font-bold">Identifying speakers & entities</p>
                </div>
              )}
              {!isUploading &&
                transcript.map((line, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: line.speaker === 'Clinician' ? 20 : -20, y: 10 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    className={`flex flex-col ${line.speaker === 'Clinician' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[75%] p-5 rounded-2xl text-[15px] leading-relaxed relative ${
                        line.speaker === 'Clinician'
                          ? 'bg-blue-600 text-white rounded-tr-none shadow-xl shadow-blue-100/50'
                          : 'bg-white border border-neutral-100 text-neutral-800 rounded-tl-none shadow-sm'
                      }`}
                    >
                      <div
                        className={`absolute top-0 ${line.speaker === 'Clinician' ? '-right-3' : '-left-3'} w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold shadow-sm ${
                          line.speaker === 'Clinician' ? 'bg-blue-700 text-blue-50' : 'bg-neutral-800 text-white'
                        }`}
                      >
                        {line.speaker.charAt(0)}
                      </div>
                      <p className="font-bold text-[10px] uppercase tracking-wider mb-2 opacity-80 flex items-center gap-2">
                        {line.speaker}
                        {line.speaker === 'Clinician' && <Zap size={10} fill="currentColor" />}
                      </p>
                      <p className="font-medium">{line.text}</p>
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

        <aside className="w-96 shrink-0 flex flex-col gap-6">
          <div className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4">
              <div className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-blue-100 uppercase">Visit Active</div>
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-neutral-100 flex items-center justify-center text-blue-600 border border-blue-100 shadow-sm relative">
                <User size={28} />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full flex items-center justify-center text-[10px] text-white">
                  <CheckCircle2 size={12} fill="currentColor" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-lg text-neutral-800">Emma Watson</h3>
                <p className="text-xs text-neutral-500 font-bold uppercase tracking-wide">ID: #9902 • 28y Female</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'BP', value: vitals.bp, icon: Activity, color: 'text-rose-500' },
                { label: 'Heart Rate', value: vitals.hr, icon: Activity, color: 'text-blue-500' },
                { label: 'Temp', value: vitals.temp, icon: Stethoscope, color: 'text-amber-500' },
                { label: 'SpO2', value: `${vitals.oxy}%`, icon: Activity, color: 'text-emerald-500' },
              ].map((vital, i) => (
                <div key={i} className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100 hover:bg-white hover:border-blue-100 transition-all group">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-tight">{vital.label}</p>
                    <vital.icon size={12} className={`${vital.color} group-hover:scale-110 transition-transform`} />
                  </div>
                  <p className="text-base font-bold text-neutral-700 tracking-tight">{vital.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 bg-white rounded-3xl border border-neutral-200 shadow-sm flex flex-col overflow-hidden">
            <nav className="flex bg-neutral-50/80 p-1.5 m-2 rounded-2xl border border-neutral-100">
              <button
                onClick={() => setActiveTab('medical')}
                className={`flex-1 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300 ${
                  activeTab === 'medical' ? 'bg-white text-blue-600 shadow-sm border border-neutral-100' : 'text-neutral-400 hover:text-neutral-600'
                }`}
              >
                Medical Summary
              </button>
              <button
                onClick={() => setActiveTab('patient')}
                className={`flex-1 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300 ${
                  activeTab === 'patient' ? 'bg-white text-blue-600 shadow-sm border border-neutral-100' : 'text-neutral-400 hover:text-neutral-600'
                }`}
              >
                Patient Recs
              </button>
            </nav>

            <div className="flex-1 overflow-auto px-6 py-4 space-y-8 scrollbar-hide">
              {activeTab === 'medical' ? (
                <div className="space-y-8">
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
                            key={i}
                            className="px-3 py-2 bg-neutral-900 text-white text-[11px] font-bold rounded-xl flex items-center gap-2 border border-neutral-800 shadow-sm"
                          >
                            {tag}
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                          </motion.span>
                        ))
                      ) : (
                        <p className="text-xs text-neutral-400 italic font-medium">Listening for symptoms...</p>
                      )}
                      {transcript.length > 0 && !isRecording && (
                        <button className="w-8 h-8 rounded-xl border-2 border-dashed border-neutral-200 flex items-center justify-center text-neutral-400 hover:border-blue-400 hover:text-blue-600 transition-all">
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
                            key={i}
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
                            key={i}
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
              ) : (
                <div className="space-y-6">
                  <div className="p-5 bg-neutral-900 rounded-3xl text-white shadow-xl shadow-neutral-200 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <ClipboardList size={80} />
                    </div>
                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2 relative">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      Patient Recovery Guide
                    </h4>
                    <p className="text-[13px] leading-relaxed opacity-90 font-medium relative">
                      Based on today&apos;s visit, your primary diagnosis is Acute Bronchitis. Focus on rest and hydration.
                    </p>
                    <div className="mt-4 pt-4 border-t border-white/10 relative">
                      <p className="text-[10px] uppercase font-bold text-blue-400 tracking-widest mb-2">Key Instruction</p>
                      <p className="text-xs italic">&quot;Use Albuterol inhaler twice daily or as needed for chest tightness.&quot;</p>
                    </div>
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
                  <div className="pt-6 mt-auto">
                    <button
                      onClick={handleSendSummary}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-[13px] flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all active:scale-[0.98] group"
                    >
                      <Send size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      Send Clinical Summary
                    </button>
                    <p className="text-[10px] text-center text-neutral-400 mt-4 font-bold uppercase tracking-tighter">
                      Authenticated HIPAA-Secure Transfer
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={resetSession}
            className="w-full py-3 border border-neutral-200 text-neutral-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 rounded-2xl font-bold text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
          >
            <Trash2 size={16} strokeWidth={2.5} />
            Discard Session Data
          </button>
        </aside>
      </main>

      <footer className="h-10 bg-white border-t border-neutral-200 px-8 flex items-center justify-between text-[10px] font-bold text-neutral-400 uppercase tracking-widest z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Secure Tunnel: Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <span className="text-blue-600">AI Transcription Engine v4.2.0</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle size={12} className="text-neutral-300" />
          <span>AES-256 Bit Encryption • SOC2 Type II Compliant Environment</span>
        </div>
      </footer>
    </div>
  )
}
