import { createError, readBody } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import {
  getPublicChatSettings,
  writeChatSettings,
} from '@/server/utils/storage';
import {
  getAssistantVoicePresentation,
  resolveAssistantVoiceCatalogItem,
} from '@/shared/constants/assistantVoiceCatalog';
import { ChatSettingsPatchDto, ChatSettingsResponseDto } from '@/shared/dto';
import { FEATURE_TTS_ENABLED } from '@/server/config/features';
import {
  clearAllChatMemoryForUser,
  hasAnyMeaningfulChatMemoryForUser,
} from '@/server/application/chat/chatMemory.service';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }
  const uid = Number(sessionResult.user.id);
  const payload = (await readBody(event)) || {};
  const parsedPayload = ChatSettingsPatchDto.safeParse(payload);
  if (!parsedPayload.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid chat settings payload',
      data: parsedPayload.error.flatten(),
    });
  }

  const body = parsedPayload.data;
  // Принудительно выключаем voice, если TTS kill-switch неактивен.
  if (!FEATURE_TTS_ENABLED && body && body.voice !== undefined) {
    body.voice = false;
  }
  const next = await writeChatSettings(String(uid), body || {});

  if (body.enablePreviousResponseId === false) {
    try {
      await clearAllChatMemoryForUser(uid);
    } catch (error) {
      console.error('[Chat Settings] Failed to clear chat memory:', error);
    }
  }

  const enablePreviousResponseId = next?.enablePreviousResponseId ?? true;
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
    next.assistantVoice
  );
  const assistantVoicePresentation = getAssistantVoicePresentation(
    assistantVoiceMeta,
    sessionResult.user.locale
  );

  return ChatSettingsResponseDto.parse({
    settings: {
      ...getPublicChatSettings(next),
      isFirstSession,
    },
    assistantVoiceMeta: {
      label: assistantVoicePresentation.label,
      gender: assistantVoiceMeta.gender,
    },
  });
});
