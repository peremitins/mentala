import { defineEventHandler } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { clearHistory } from '../../../utils/storage';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  clearHistory(String(user.id));
  return { ok: true };
});
