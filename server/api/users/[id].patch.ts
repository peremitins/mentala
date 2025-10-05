import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { db } from '../../infrastructure/db/client'
import { users } from '../../infrastructure/db/schema'
import { eq } from 'drizzle-orm'
import argon2 from 'argon2'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  const body = await readBody<{ email?: string; name?: string; password?: string }>(event)
  const patch: any = {}
  if (body?.email) patch.email = body.email
  if (body?.name !== undefined) patch.name = body.name
  if (body?.password && body.password.length >= 6) {
    patch.passwordHash = await argon2.hash(body.password, { type: argon2.argon2id })
  }
  if (!Object.keys(patch).length)
    throw createError({ statusCode: 400, statusMessage: 'nothing to update' })
  const updated = await db.update(users).set(patch).where(eq(users.id, id)).returning()
  if (!updated.length) throw createError({ statusCode: 404, statusMessage: 'not found' })
  return { item: updated[0] }
})
