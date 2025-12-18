import { defineEventHandler } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { deleteAll } from '../../utils/storage';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  deleteAll(String(sessionResult.user.id));
  return { ok: true };
});
