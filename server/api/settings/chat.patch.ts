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
import { responseIdStore } from '@/server/utils/responseIdStore';
import { FEATURE_TTS_ENABLED } from '@/server/config/features';

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
