import { defineEventHandler } from 'h3'
import { db } from '../../infrastructure/db/client'
import { users } from '../../infrastructure/db/schema'
import { requireAdmin } from '@/server/application/auth/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  // НИКОГДА не возвращаем passwordHash
  const rows = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    locale: users.locale,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users)

  return { items: rows }
})
