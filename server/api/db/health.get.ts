import { defineEventHandler } from 'h3'
import { db } from '../../infrastructure/db/client'
import { sql } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const res = await db.execute(sql`select now() as now`)
  return { ok: true, now: (res as any)?.rows?.[0]?.now ?? null }
})
