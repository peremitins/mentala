import { defineEventHandler, getRouterParam, createError } from 'h3'
import { db } from '../../infrastructure/db/client'
import { users } from '../../infrastructure/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  const deleted = await db.delete(users).where(eq(users.id, id)).returning()
  if (!deleted.length) throw createError({ statusCode: 404, statusMessage: 'not found' })
  return { ok: true }
})
