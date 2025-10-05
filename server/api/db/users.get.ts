import { defineEventHandler } from 'h3'
import { db } from '../../infrastructure/db/client'
import { users } from '../../infrastructure/db/schema'

export default defineEventHandler(async () => {
  const rows = await db.select().from(users)
  return { items: rows }
})
