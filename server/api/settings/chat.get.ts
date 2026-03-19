import { createError } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import {
  getPublicChatSettings,
  readChatSettings,
} from '@/server/utils/storage';
import {
  getAssistantVoicePresentation,
  resolveAssistantVoiceCatalogItem,
} from '@/shared/constants/assistantVoiceCatalog';
import { ChatSettingsResponseDto } from '@/shared/dto';
import { responseIdStore } from '@/server/utils/responseIdStore';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
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

  const assistantVoiceMeta = resolveAssistantVoiceCatalogItem(
    settings.assistantVoice
  );
  const assistantVoicePresentation = getAssistantVoicePresentation(
    assistantVoiceMeta,
    sessionResult.user.locale
  );

  return ChatSettingsResponseDto.parse({
    settings: {
      ...getPublicChatSettings(settings),
      isFirstSession,
    },
    assistantVoiceMeta: {
      label: assistantVoicePresentation.label,
      gender: assistantVoiceMeta.gender,
    },
  });
});
