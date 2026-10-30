import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { Mic, Square, Send } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'
import AppHeader from '../components/AppHeader'

type TranscriptLine = { speaker: string; text: string }

const INITIAL_MESSAGE =
  'You can ask me to view your document or care information. Type your request below or use the microphone.'

type SpeechRecognitionInstance = InstanceType<NonNullable<typeof window.SpeechRecognition>> extends infer T
  ? T
  : { start(): void; stop(): void }

export default function PatientPortal() {
  const { user, logout } = useAuth()
  const [transcript, setTranscript] = useState<TranscriptLine[]>([
    { speaker: 'Synapse', text: INITIAL_MESSAGE },
  ])
  const [typedMessage, setTypedMessage] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const speechTranscriptRef = useRef('')
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => scrollToBottom(), [transcript])

  const appendReply = useCallback((userText: string, synapseText: string) => {
    const lines: TranscriptLine[] = []
    if (userText.trim()) lines.push({ speaker: 'You', text: userText.trim() })
    if (synapseText.trim()) lines.push({ speaker: 'Synapse', text: synapseText.trim() })
    if (lines.length) setTranscript((prev) => [...prev, ...lines])
  }, [])

  const startRecording = useCallback(() => {
    chunksRef.current = []
    speechTranscriptRef.current = ''
    const SpeechRecognitionAPI =
      window.SpeechRecognition ?? (window as Window & { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition
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
        mr.start(250)
        setIsRecording(true)
        toast.info('Recording started. Speak your request, then stop.')
      })
      .catch(() => toast.error('Microphone access denied or unavailable.'))
  }, [])

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) return
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch {}
      speechRecognitionRef.current = null
    }
    setIsRecording(false)
    const liveTranscript = (speechTranscriptRef.current || '').trim()
    const previousContext = transcript.map((l) => `${l.speaker}: ${l.text}`).join('\n\n').trim()
    const mr = mediaRecorderRef.current
    const cleanup = mr.onstop
    // Recorded data arrives asynchronously: build the blob only after the recorder has fully stopped.
    mr.onstop = (ev) => {
      cleanup?.call(mr, ev)
      const blob = new Blob(chunksRef.current, { type: (mr.mimeType || 'audio/webm').split(';')[0] })
      if (blob.size < 1000) {
        toast.error('No audio was captured. Check your microphone and try again.')
        return
      }
      setIsProcessing(true)
      toast.info(liveTranscript ? 'Sending your request...' : 'Processing recording...')
      api
        .extractAudio(blob, previousContext, liveTranscript)
        .then((data: Record<string, unknown>) => {
          const userLine = (data.transcript as string) || liveTranscript || 'Recording'
          const reply = (data.document as string) || (data.question as string) || 'Request received.'
          appendReply(userLine, reply)
          toast.success('Synapse replied.')
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'Request failed.'))
        .finally(() => setIsProcessing(false))
    }
    mr.stop()
  }, [isRecording, transcript, appendReply])

  const sendTypedMessage = useCallback(() => {
    const text = typedMessage.trim()
    if (!text || isProcessing || isRecording) return
    const previousContext = transcript.map((l) => `${l.speaker}: ${l.text}`).join('\n\n').trim()
    setTypedMessage('')
    setIsProcessing(true)
    api
      .sendTextToSynapse(text, previousContext, '')
      .then((data: Record<string, unknown>) => {
        const reply = (data.document as string) || (data.question as string) || 'Request received.'
        appendReply(text, reply)
        toast.success('Synapse replied.')
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not send message.'))
      .finally(() => setIsProcessing(false))
  }, [typedMessage, transcript, isProcessing, isRecording, appendReply])

  return (
    <div className="flex flex-col h-screen overflow-hidden text-slate-900">
      <AppHeader username={user?.username} onLogout={logout} />

      <main className="flex-1 flex flex-col overflow-hidden p-4 lg:p-5">
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-3xl border border-slate-200/80 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.45)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Ask Synapse</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Request your document or care information. You can type or speak in any language.
            </p>
          </div>
          <div className="flex-1 min-h-0 flex flex-col bg-neutral-50/80">
            <div className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-4">
              {transcript.map((line, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${line.speaker === 'You' ? 'items-end' : 'items-start'}`}
                >
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                    {line.speaker}
                  </p>
                  <div
                    className={`max-w-[85%] p-3 rounded-xl text-sm ${
                      line.speaker === 'You'
                        ? 'bg-rose-50 border border-rose-100 text-rose-900'
                        : 'bg-white border border-neutral-100 text-neutral-800 shadow-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{line.text}</p>
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} className="h-4" />
            </div>
            <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 rounded-b-3xl">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  sendTypedMessage()
                }}
              >
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={isProcessing}
                    className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-200 disabled:opacity-50 transition-all"
                    title="Use microphone"
                  >
                    <Mic size={20} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-rose-800 text-white animate-pulse"
                    title="Stop and send"
                  >
                    <Square size={18} fill="currentColor" />
                  </button>
                )}
                <input
                  type="text"
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  placeholder="Type or speak in any language to ask Synapse..."
                  disabled={isProcessing || isRecording}
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!typedMessage.trim() || isProcessing || isRecording}
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-rose-800 text-white rounded-xl text-sm font-bold hover:bg-rose-900 disabled:opacity-50 transition-all"
                >
                  <Send size={18} />
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
