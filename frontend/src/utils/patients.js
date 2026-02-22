const PATIENTS_STORAGE_KEY = 'synapse_patients'

export function generatePatientId() {
  return String(Math.floor(1000000000 + Math.random() * 9000000000))
}

export function getStoredPatients() {
  try {
    const raw = localStorage.getItem(PATIENTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function savePatients(patients) {
  try {
    localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(patients))
  } catch {}
}

export function getPatientById(id) {
  return getStoredPatients().find((p) => p.id === id) || null
}
