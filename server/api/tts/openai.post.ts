import { defineEventHandler, readBody, setHeader, createError } from 'h3';
import { $fetch } from 'ofetch';
import { getUserAssistantPersona } from '@/server/application/chat/assistant-persona.service';
import { getSessionUser } from '@/server/application/auth/session';
import { FEATURE_TTS_ENABLED } from '@/server/config/features';
import {
  isAssistantVoiceSelectable,
  resolveAssistantVoiceId,
} from '@/shared/constants/assistantVoiceCatalog';

export default defineEventHandler(async (event) => {
  if (!FEATURE_TTS_ENABLED) {
    throw createError({
      statusCode: 503,
      message: 'Chat TTS is temporarily disabled',
    });
  }

  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  const apiKey = process.env.NUXT_OPENAI_API_KEY;
  if (!apiKey)
    throw createError({
      statusCode: 500,
      message: 'NUXT_OPENAI_API_KEY is not set',
    });

  const body = await readBody<{
    text: string;
    voice?: string;
    format?: 'mp3' | 'wav' | 'opus';
    model?: string;
  }>(event);

  const text = (body?.text || '').toString();
  if (!text)
    throw createError({ statusCode: 400, message: 'Text is required' });

  const model = body?.model || 'tts-1-hd';
  const assistantPersona = await getUserAssistantPersona(sessionResult.user.id);
  const requestedVoice = String(body?.voice || '').trim();
  if (requestedVoice && !isAssistantVoiceSelectable(requestedVoice)) {
    throw createError({
      statusCode: 400,
      message: 'Unsupported assistant voice',
    });
  }

  const voice = requestedVoice
    ? resolveAssistantVoiceId(requestedVoice)
    : assistantPersona.voice;
  const format = body?.format || 'mp3';

  try {
    const resp = await $fetch.raw('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      // важно: литерал 'arrayBuffer' как const — тогда тип сойдётся
      responseType: 'arrayBuffer' as const,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: { model, voice, input: text, format },
    });
    const arrayBuffer = resp._data as ArrayBuffer;

    const mime =
      format === 'mp3'
        ? 'audio/mpeg'
        : format === 'wav'
          ? 'audio/wav'
          : 'audio/ogg';
    setHeader(event, 'Content-Type', mime);
    return new Uint8Array(arrayBuffer as any);
  } catch (e: any) {
    throw createError({
      statusCode: e?.status || e?.response?.status || 500,
      message: e?.data?.error?.message || e?.message || 'TTS failed',
    });
  }
});
