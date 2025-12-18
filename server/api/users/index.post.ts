import { defineEventHandler, readBody, createError } from 'h3'
import { db } from '../../infrastructure/db/client'
import { users } from '../../infrastructure/db/schema'
import argon2 from 'argon2'
import { requireAdmin } from '@/server/application/auth/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ email?: string; name?: string; password?: string }>(event)
  if (!body?.email) throw createError({ statusCode: 400, statusMessage: 'email is required' })
  const values: any = { email: body.email, name: body?.name ?? null }
  if (body?.password && body.password.length >= 6) {
    values.passwordHash = await argon2.hash(body.password, { type: argon2.argon2id })
  }
  const inserted = await db.insert(users).values(values).returning()
  
  // Не возвращаем passwordHash в ответе
  const { passwordHash, ...item } = inserted[0]
  return { item }
})
