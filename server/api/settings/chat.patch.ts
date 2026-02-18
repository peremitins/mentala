import { readBody } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { writeChatSettings } from '@/server/utils/storage';
import { responseIdStore } from '@/server/utils/responseIdStore';
import { FEATURE_TTS_ENABLED } from '@/server/config/features';
type Payload = Partial<{
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
  // Принудительно выключаем voice, если TTS kill-switch неактивен.
  if (!FEATURE_TTS_ENABLED && body && body.voice !== undefined) {
    body.voice = false;
  }
  const next = await writeChatSettings(String(uid), body || {});

  const enablePreviousResponseId = next?.enablePreviousResponseId ?? true;
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
      ...next,
      isFirstSession,
    },
  };
});
