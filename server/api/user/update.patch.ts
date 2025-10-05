import { defineEventHandler, readBody } from 'h3'
import { getOrSetAnonUserId } from '../../utils/user'
import { writePrivacy } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const uid = getOrSetAnonUserId(event)
  const body = await readBody<{ saveHistory?: boolean; retentionDays?: number }>(event)
  const next = writePrivacy(uid, {
    saveHistory: body.saveHistory ?? undefined,
    retentionDays: body.retentionDays ?? undefined,
  })
  return next
})
