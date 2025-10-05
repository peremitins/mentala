import { defineEventHandler, getRequestHeader, setResponseStatus } from 'h3'
import { config } from '../config'

const buckets = new Map<string, { count: number; ts: number }>()

export default defineEventHandler((event) => {
  const key =
    getRequestHeader(event, 'x-forwarded-for') || event.node.req.socket.remoteAddress || 'local'
  const now = Date.now()
  const bucket = buckets.get(key) || { count: 0, ts: now }
  if (now - bucket.ts > config.rateLimit.windowMs) {
    bucket.count = 0
    bucket.ts = now
  }
  bucket.count += 1
  buckets.set(key, bucket)
  if (bucket.count > config.rateLimit.max) {
    setResponseStatus(event, 429, 'Too Many Requests')
    event.node.res.setHeader('Retry-After', Math.ceil(config.rateLimit.windowMs / 1000).toString())
    event.node.res.end('Rate limit exceeded')
  }
})
