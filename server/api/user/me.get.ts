import { defineEventHandler } from 'h3'
import { getOrSetAnonUserId } from '../../utils/user'
import { readPrivacy } from '../../utils/storage'

export default defineEventHandler((event) => {
  const uid = getOrSetAnonUserId(event)
  return { uid, ...readPrivacy(uid) }
})
