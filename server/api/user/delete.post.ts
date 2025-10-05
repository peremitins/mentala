import { defineEventHandler, deleteCookie } from 'h3'
import { getOrSetAnonUserId } from '../../utils/user'
import { deleteAll } from '../../utils/storage'

export default defineEventHandler((event) => {
  const uid = getOrSetAnonUserId(event)
  deleteAll(uid)
  deleteCookie(event, 'anon_uid', { path: '/' })
  return { ok: true }
})
