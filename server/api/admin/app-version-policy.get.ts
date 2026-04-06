import { defineEventHandler } from 'h3';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { appVersionPolicy } from '@/server/infrastructure/db/schema';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  const rows = await db.select().from(appVersionPolicy);

  return { policies: rows };
});
