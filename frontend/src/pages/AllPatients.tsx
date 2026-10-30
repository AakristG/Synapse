import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, User, ChevronRight, Search } from 'lucide-react'
import BrandMark from '../components/BrandMark'
import type { StoredPatient } from './PatientDetail'

const PATIENTS_STORAGE_KEY = 'synapse_patients'

function loadPatients(): StoredPatient[] {
  try {
    return JSON.parse(localStorage.getItem(PATIENTS_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export default function AllPatients() {
  const [patients, setPatients] = useState<StoredPatient[]>(() => loadPatients())
  const [search, setSearch] = useState('')

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) => {
      const name = (p.name ?? '').toLowerCase()
      const age = (p.age ?? '').toLowerCase()
      const id = (p.id ?? '').toLowerCase()
      return name.includes(q) || age.includes(q) || id.includes(q)
    })
  }, [patients, search])

  useEffect(() => {
    const onStorage = () => setPatients(loadPatients())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <header className="shrink-0 h-16 border-b border-slate-200/80 bg-white/85 backdrop-blur-md px-5 sm:px-6 flex items-center justify-between gap-4">
        <Link
          to="/consultation"
          className="flex items-center gap-2 text-slate-600 hover:text-rose-800 font-medium text-sm transition-colors"
        >
          <ArrowLeft size={18} />
          Consultation
        </Link>
        <div className="flex items-center gap-3">
          <BrandMark className="h-8 w-8" />
          <h1 className="font-semibold text-slate-900">Recorded patients</h1>
        </div>
      </header>
      <main className="flex-1 p-5 sm:p-6 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-3">
          {patients.length > 0 && (
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                placeholder="Search by name, age, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all"
                aria-label="Search patients by name, age, or ID"
              />
            </div>
          )}
          {filteredPatients.length === 0 ? (
            <p className="text-neutral-500 text-center py-12">
              {patients.length === 0
                ? 'No recorded patients yet. Record a visit from the Consultation page.'
                : 'No patients match your search. Try name, age, or ID.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredPatients.map((p) => (
                <Link
                  key={p.id}
                  to={`/patient/${p.id}`}
                  className="flex items-center gap-3 p-4 bg-white border border-neutral-200 rounded-xl hover:border-rose-300 hover:bg-rose-50/50 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0 group-hover:bg-rose-200">
                    <User size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-neutral-800 truncate">{p.name}</p>
                    <p className="text-sm text-neutral-500">
                      {p.age ? `${p.age} years` : 'Age not stated'} · <span className="font-mono font-bold text-rose-600">#{p.id}</span>
                    </p>
                  </div>
                  <ChevronRight size={20} className="text-neutral-300 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
