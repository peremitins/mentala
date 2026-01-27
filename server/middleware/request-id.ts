import { randomUUID } from 'node:crypto'

export default defineEventHandler((event) => {
  const id = getHeader(event, 'x-request-id') || randomUUID()
  setHeader(event, 'x-request-id', id)
})
