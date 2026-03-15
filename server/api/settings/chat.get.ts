import { getSessionUser } from '@@/server/application/auth/session';
import {
  getPublicChatSettings,
  readChatSettings,
} from '@/server/utils/storage';
import { responseIdStore } from '@/server/utils/responseIdStore';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  const uid = Number(sessionResult.user.id);
  const settings = await readChatSettings(String(uid));
  const enablePreviousResponseId = settings?.enablePreviousResponseId ?? true;
  let isFirstSession = true;

  // Summary отключена: определяем "первую сессию" только по previous_response_id.
  if (enablePreviousResponseId) {
    try {
      const lastResponse = await responseIdStore.getLastValid(String(uid));
      if (
        lastResponse &&
        responseIdStore.isResponseValid(lastResponse.expiresAt)
      ) {
        isFirstSession = false;
      }
    } catch (err) {
      console.error(
        '[Chat Settings] Failed to check previous_response_id:',
        err
      );
    }
  }

  return {
    settings: {
      ...getPublicChatSettings(settings),
      isFirstSession,
    },
  };
});
