// Simple in-memory storage per user (dev). Replace with Postgres/Redis later.
type Privacy = { saveHistory: boolean; retentionDays: number }
const privacyByUser = new Map<string, Privacy>()
const historyByUser = new Map<
  string,
  Array<{ role: 'user' | 'assistant'; content: string; ts: number }>
>()

export function readPrivacy(uid: string): Privacy {
  return privacyByUser.get(uid) || { saveHistory: false, retentionDays: 0 }
}
export function writePrivacy(uid: string, patch: Partial<Privacy>) {
  const prev = readPrivacy(uid)
  const next = { ...prev, ...patch }
  privacyByUser.set(uid, next)
  return next
}

export function appendHistory(uid: string, role: 'user' | 'assistant', content: string) {
  const arr = historyByUser.get(uid) || []
  arr.push({ role, content, ts: Date.now() })
  historyByUser.set(uid, arr)
}
export function clearHistory(uid: string) {
  historyByUser.delete(uid)
}
export function exportHistory(uid: string) {
  return historyByUser.get(uid) || []
}
export function deleteAll(uid: string) {
  privacyByUser.delete(uid)
  historyByUser.delete(uid)
}
