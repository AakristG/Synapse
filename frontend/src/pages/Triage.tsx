import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowLeft, Download, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'

type UnknownObject = Record<string, unknown>

type TriageEncounter = {
  id: number
  patient_name: string
  patient_age: string
  chief_complaint: string
  onset_time: string
  arrival_mode: string
  pain_score: number
  gcs: number
  vitals: UnknownObject
  symptoms: string[]
  allergies: string[]
  medications: string[]
  past_history: string[]
  pregnancy_status: string
  red_flags: UnknownObject
  triage_level: string
  disposition: string
  reassessment_due_at: string | null
  finalized_at: string | null
  finalized_by: string
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
  for (const paragraph of text.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (next.length <= maxChars) current = next
      else {
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
  for (let i = 0; i < lines.length; i += linesPerPage) pages.push(lines.slice(i, i + linesPerPage))
  if (pages.length === 0) pages.push(['Triage document not available.'])

  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  const pageRefs: string[] = []
  let nextObject = 4

  for (const pageLines of pages) {
    const pageObjectNumber = nextObject
    const contentObjectNumber = nextObject + 1
    pageRefs.push(`${pageObjectNumber} 0 R`)

    const streamParts: string[] = ['BT', '/F1 10 Tf', `${lineHeight} TL`, `46 ${marginTop} Td`]
    pageLines.map(sanitizePdfText).forEach((line, idx) => {
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

export default function Triage() {
  const [encounter, setEncounter] = useState<TriageEncounter | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [scoreReasons, setScoreReasons] = useState<string[]>([])
  const [documentText, setDocumentText] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const [symptomsText, setSymptomsText] = useState('')
  const [allergiesText, setAllergiesText] = useState('')
  const [medicationsText, setMedicationsText] = useState('')
  const [historyText, setHistoryText] = useState('')
  const [heartRate, setHeartRate] = useState('')
  const [spo2, setSpo2] = useState('')
  const [systolicBp, setSystolicBp] = useState('')
  const [respRate, setRespRate] = useState('')
  const [airwayCompromise, setAirwayCompromise] = useState(false)
  const [activeChestPain, setActiveChestPain] = useState(false)
  const [strokeSigns, setStrokeSigns] = useState(false)
  const [sepsisRisk, setSepsisRisk] = useState(false)

  const toList = (value: string) => value.split(',').map((v) => v.trim()).filter(Boolean)

  const createInitialEncounter = async () => {
    setLoading(true)
    try {
      const created = await api.createTriageEncounter({
        patient_name: '',
        patient_age: '',
        chief_complaint: '',
        arrival_mode: 'walk-in',
        pain_score: 0,
        gcs: 15,
      })
      setEncounter(created as unknown as TriageEncounter)
      toast.success('Triage encounter created.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create triage encounter.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    createInitialEncounter().catch(() => {})
  }, [])

  useEffect(() => {
    if (!encounter) return
    setSymptomsText(encounter.symptoms.join(', '))
    setAllergiesText(encounter.allergies.join(', '))
    setMedicationsText(encounter.medications.join(', '))
    setHistoryText(encounter.past_history.join(', '))
    setHeartRate(String(encounter.vitals?.heart_rate ?? ''))
    setSpo2(String(encounter.vitals?.spo2 ?? ''))
    setSystolicBp(String(encounter.vitals?.systolic_bp ?? ''))
    setRespRate(String(encounter.vitals?.resp_rate ?? ''))
    setAirwayCompromise(Boolean(encounter.red_flags?.airway_compromise))
    setActiveChestPain(Boolean(encounter.red_flags?.active_chest_pain))
    setStrokeSigns(Boolean(encounter.red_flags?.stroke_signs))
    setSepsisRisk(Boolean(encounter.red_flags?.sepsis_risk))
  }, [encounter])

  useEffect(() => {
    if (!documentText.trim()) {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    const url = URL.createObjectURL(buildPdfFromLines(wrapText(documentText)))
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
  }, [documentText])

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  const canEdit = useMemo(() => !encounter?.finalized_at, [encounter?.finalized_at])

  const updateEncounter = (patch: Partial<TriageEncounter>) => {
    setEncounter((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const saveEncounter = async () => {
    if (!encounter) return
    setSaving(true)
    try {
      const updated = await api.updateTriageEncounter(String(encounter.id), {
        patient_name: encounter.patient_name,
        patient_age: encounter.patient_age,
        chief_complaint: encounter.chief_complaint,
        onset_time: encounter.onset_time,
        arrival_mode: encounter.arrival_mode,
        pain_score: encounter.pain_score,
        gcs: encounter.gcs,
        pregnancy_status: encounter.pregnancy_status,
        disposition: encounter.disposition,
        symptoms: toList(symptomsText),
        allergies: toList(allergiesText),
        medications: toList(medicationsText),
        past_history: toList(historyText),
        vitals: {
          heart_rate: heartRate ? Number(heartRate) : null,
          spo2: spo2 ? Number(spo2) : null,
          systolic_bp: systolicBp ? Number(systolicBp) : null,
          resp_rate: respRate ? Number(respRate) : null,
        },
        red_flags: {
          airway_compromise: airwayCompromise,
          active_chest_pain: activeChestPain,
          stroke_signs: strokeSigns,
          sepsis_risk: sepsisRisk,
        },
      })
      setEncounter(updated as unknown as TriageEncounter)
      toast.success('Triage encounter saved.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const scoreEncounter = async () => {
    if (!encounter) return
    setScoring(true)
    try {
      await saveEncounter()
      const res = await api.scoreTriageEncounter(String(encounter.id))
      setScoreReasons(((res.reasons as string[]) || []).map((r) => String(r)))
      setEncounter((res.encounter as unknown as TriageEncounter) || encounter)
      toast.success(`Acuity scored: ${(res.triage_level as string) || 'N/A'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scoring failed.')
    } finally {
      setScoring(false)
    }
  }

  const finalizeEncounter = async () => {
    if (!encounter) return
    setFinalizing(true)
    try {
      await saveEncounter()
      const finalized = await api.finalizeTriageEncounter(String(encounter.id))
      setEncounter(finalized as unknown as TriageEncounter)
      toast.success('Triage encounter finalized.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Finalize failed.')
    } finally {
      setFinalizing(false)
    }
  }

  const refreshDocument = async () => {
    if (!encounter) return
    try {
      const res = await api.triageDocument(String(encounter.id))
      setDocumentText(String(res.document_text || ''))
      toast.success('Triage document refreshed.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Document generation failed.')
    }
  }

  const downloadPdf = () => {
    if (!pdfUrl || !encounter) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = `triage-${encounter.id}.pdf`
    a.click()
  }

  if (loading || !encounter) {
    return <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6 text-neutral-600">Loading triage workflow...</div>
  }

  return (
    <div className="min-h-screen bg-neutral-50 phase-in">
      <header className="h-14 border-b border-neutral-200 bg-white px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/consultation" className="flex items-center gap-2 text-neutral-600 hover:text-red-600 text-sm font-bold">
            <ArrowLeft size={18} />
            Back
          </Link>
          <div>
            <h1 className="font-bold text-neutral-900">ER Triage Documentation</h1>
            <p className="text-xs text-neutral-500">Encounter #{encounter.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={saveEncounter} disabled={!canEdit || saving} className="px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-bold text-neutral-700 disabled:opacity-50 flex items-center gap-2">
            <Save size={16} /> Save
          </button>
          <button type="button" onClick={scoreEncounter} disabled={!canEdit || scoring} className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm font-bold text-red-700 disabled:opacity-50 flex items-center gap-2">
            <AlertTriangle size={16} /> Score
          </button>
          <button type="button" onClick={finalizeEncounter} disabled={!canEdit || finalizing} className="px-3 py-2 rounded-lg bg-neutral-900 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">
            <ShieldCheck size={16} /> Finalize
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <motion.section
          className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <h2 className="text-sm font-bold text-neutral-800">Triage Intake</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={encounter.patient_name} onChange={(e) => updateEncounter({ patient_name: e.target.value })} disabled={!canEdit} placeholder="Patient name" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
            <input value={encounter.patient_age} onChange={(e) => updateEncounter({ patient_age: e.target.value })} disabled={!canEdit} placeholder="Age" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
            <input value={encounter.chief_complaint} onChange={(e) => updateEncounter({ chief_complaint: e.target.value })} disabled={!canEdit} placeholder="Chief complaint" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm md:col-span-2" />
            <input value={encounter.onset_time} onChange={(e) => updateEncounter({ onset_time: e.target.value })} disabled={!canEdit} placeholder="Onset (e.g. 2 hours ago)" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
            <select value={encounter.arrival_mode} onChange={(e) => updateEncounter({ arrival_mode: e.target.value })} disabled={!canEdit} className="px-3 py-2 border border-neutral-200 rounded-lg text-sm">
              <option value="walk-in">Walk-in</option>
              <option value="ambulance">Ambulance</option>
              <option value="wheelchair">Wheelchair</option>
              <option value="police">Police</option>
              <option value="other">Other</option>
            </select>
            <input type="number" min={0} max={10} value={encounter.pain_score} onChange={(e) => updateEncounter({ pain_score: Number(e.target.value || 0) })} disabled={!canEdit} placeholder="Pain (0-10)" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
            <input type="number" min={3} max={15} value={encounter.gcs} onChange={(e) => updateEncounter({ gcs: Number(e.target.value || 15) })} disabled={!canEdit} placeholder="GCS" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input value={heartRate} onChange={(e) => setHeartRate(e.target.value)} disabled={!canEdit} placeholder="HR" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
            <input value={spo2} onChange={(e) => setSpo2(e.target.value)} disabled={!canEdit} placeholder="SpO2" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
            <input value={systolicBp} onChange={(e) => setSystolicBp(e.target.value)} disabled={!canEdit} placeholder="SBP" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
            <input value={respRate} onChange={(e) => setRespRate(e.target.value)} disabled={!canEdit} placeholder="RR" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <textarea value={symptomsText} onChange={(e) => setSymptomsText(e.target.value)} disabled={!canEdit} placeholder="Symptoms (comma-separated)" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm min-h-20" />
            <textarea value={allergiesText} onChange={(e) => setAllergiesText(e.target.value)} disabled={!canEdit} placeholder="Allergies (comma-separated)" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm min-h-20" />
            <textarea value={medicationsText} onChange={(e) => setMedicationsText(e.target.value)} disabled={!canEdit} placeholder="Medications (comma-separated)" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm min-h-20" />
            <textarea value={historyText} onChange={(e) => setHistoryText(e.target.value)} disabled={!canEdit} placeholder="Past history (comma-separated)" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm min-h-20" />
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={airwayCompromise} onChange={(e) => setAirwayCompromise(e.target.checked)} disabled={!canEdit} /> Airway compromise</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={activeChestPain} onChange={(e) => setActiveChestPain(e.target.checked)} disabled={!canEdit} /> Active chest pain</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={strokeSigns} onChange={(e) => setStrokeSigns(e.target.checked)} disabled={!canEdit} /> Stroke signs</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={sepsisRisk} onChange={(e) => setSepsisRisk(e.target.checked)} disabled={!canEdit} /> Sepsis risk</label>
          </div>

          <input value={encounter.disposition} onChange={(e) => updateEncounter({ disposition: e.target.value })} disabled={!canEdit} placeholder="Disposition" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm w-full" />

          <div className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            Current acuity: <strong>{encounter.triage_level}</strong>
            {scoreReasons.length > 0 && <div className="mt-1">Reason(s): {scoreReasons.join(', ')}</div>}
            {encounter.finalized_at && <div className="mt-1 text-green-700">Finalized by {encounter.finalized_by || 'Unknown'} at {encounter.finalized_at}</div>}
          </div>
        </motion.section>

        <motion.section
          className="bg-white border border-neutral-200 rounded-2xl p-5"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-neutral-800">Triage Document</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={refreshDocument} className="px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-bold text-neutral-700">
                Refresh
              </button>
              <button type="button" onClick={downloadPdf} disabled={!pdfUrl} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">
                <Download size={15} /> PDF
              </button>
            </div>
          </div>

          {pdfUrl ? (
            <iframe title="Triage PDF" src={pdfUrl} className="w-full h-[760px] border border-neutral-200 rounded-xl" />
          ) : (
            <p className="text-sm text-neutral-500">Save, then click Refresh to generate triage documentation PDF.</p>
          )}
        </motion.section>
      </main>
    </div>
  )
}
