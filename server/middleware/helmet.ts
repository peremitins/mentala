import { defineEventHandler } from 'h3'

export default defineEventHandler((event) => {
  const res = event.node.res
  res.setHeader('X-DNS-Prefetch-Control', 'off')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Download-Options', 'noopen')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-XSS-Protection', '0')
})
