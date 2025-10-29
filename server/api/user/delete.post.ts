import { defineEventHandler } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { deleteAll } from '../../utils/storage';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  deleteAll(String(user.id));
  return { ok: true };
});
