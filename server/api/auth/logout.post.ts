import { defineEventHandler } from 'h3';
import { revokeSession } from '@/server/application/auth/session';

export default defineEventHandler(async (event) => {
  await revokeSession(event);
  return { ok: true };
});
