import { defineEventHandler, getRouterParam, createError } from 'h3'
import { db } from '../../infrastructure/db/client'
import { users } from '../../infrastructure/db/schema'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '@/server/application/auth/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  const rows = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    locale: users.locale,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'not found' })
  return { item: rows[0] }
})
