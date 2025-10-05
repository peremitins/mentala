import { defineEventHandler, setHeader } from 'h3'
import { getOrSetAnonUserId } from '../../utils/user'
import { exportHistory, readPrivacy } from '../../utils/storage'

export default defineEventHandler((event) => {
  const uid = getOrSetAnonUserId(event)
  const data = { uid, privacy: readPrivacy(uid), history: exportHistory(uid) }
  const json = JSON.stringify(data, null, 2)
  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Content-Disposition', 'attachment; filename="export.json"')
  return json
})
