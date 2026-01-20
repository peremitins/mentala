import { readBody } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { writeChatSettings } from '@/server/utils/storage';
import { summaryStore } from '@/server/utils/summaryStore';
type Payload = Partial<{
  theme: 'dark' | 'light';
  voice: boolean;
  avatar: boolean;
  enablePreviousResponseId: boolean;
  enableSummary: boolean;
}>;

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  const uid = Number(sessionResult.user.id);
  const body = await readBody<Payload>(event);
  const next = await writeChatSettings(String(uid), body || {});

  // Загружаем дополнительные данные как в GET endpoint
  const count = await summaryStore.countByUser(uid);

  return {
    settings: {
      ...next,
      isFirstSession: count === 0,
    },
  };
});
