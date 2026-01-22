import { getSessionUser } from '@@/server/application/auth/session';
import { readChatSettings } from '@/server/utils/storage';
import { summaryStore } from '@/server/utils/summaryStore';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  const uid = Number(sessionResult.user.id);
  const settings = await readChatSettings(String(uid));
  const count = await summaryStore.countByUser(uid);

  return {
    settings: {
      ...settings,
      isFirstSession: count === 0,
    },
  };
});
