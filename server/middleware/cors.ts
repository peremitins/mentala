import { defineEventHandler } from 'h3'

export default defineEventHandler((event) => {
  const req = event.node.req
  const res = event.node.res
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
  }
})
