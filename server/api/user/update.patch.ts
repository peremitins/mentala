import { defineEventHandler, readBody } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { writePrivacy } from '../../utils/storage';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  const body = await readBody<{
    saveHistory?: boolean;
    retentionDays?: number;
  }>(event);
  const next = writePrivacy(String(user.id), {
    saveHistory: body.saveHistory ?? undefined,
    retentionDays: body.retentionDays ?? undefined,
  });
  return next;
});
