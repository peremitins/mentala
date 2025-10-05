import { defineEventHandler, readBody, createError } from 'h3'
import { db } from '../../infrastructure/db/client'
import { users } from '../../infrastructure/db/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string }>(event)
  if (!body?.email) throw createError({ statusCode: 400, statusMessage: 'email is required' })
  await db.insert(users).values({ email: body.email })
  return { ok: true }
})
