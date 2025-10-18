import { getSessionUser } from '@/server/application/auth/session';
import { getOrSetAnonUserId } from '@/server/utils/user';
import { readPrivacy } from '@/server/utils/storage';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const uid = getOrSetAnonUserId(event);
  const privacy = readPrivacy(uid);
  return {
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale,
          saveHistory: privacy.saveHistory,
          retentionDays: privacy.retentionDays,
        }
      : {
          id: uid,
          email: null,
          name: null,
          locale: null,
          saveHistory: privacy.saveHistory,
          retentionDays: privacy.retentionDays,
        },
  };
});
