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
import { hasAnyMeaningfulChatMemoryForUser } from '@/server/application/chat/chatMemory.service';

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

  if (enablePreviousResponseId) {
    try {
      if (await hasAnyMeaningfulChatMemoryForUser(uid)) {
        isFirstSession = false;
      }
    } catch (err) {
      console.error('[Chat Settings] Failed to check chat memory:', err);
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
