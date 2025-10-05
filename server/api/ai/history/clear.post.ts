import { defineEventHandler } from 'h3'
import { getOrSetAnonUserId } from '../../../utils/user'
import { clearHistory } from '../../../utils/storage'

export default defineEventHandler((event) => {
  const uid = getOrSetAnonUserId(event)
  clearHistory(uid)
  return { ok: true }
})
