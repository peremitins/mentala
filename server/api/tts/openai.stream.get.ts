import {
  defineEventHandler,
  getQuery,
  setHeader,
  createError,
  sendStream,
} from 'h3';
import { $fetch } from 'ofetch';
import { getSessionUser } from '@/server/application/auth/session';
import { FEATURE_TTS_ENABLED } from '@/server/config/features';

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

  const q = getQuery(event) as {
    text?: string;
    voice?: string;
    format?: 'mp3' | 'wav' | 'opus';
    model?: string;
  };

  const text = (q?.text || '').toString();
  if (!text)
    throw createError({ statusCode: 400, message: 'Text is required' });
  const model = (q?.model || 'tts-1-hd') as string;
  const voice = (q?.voice || 'sage') as string;
  const format = (q?.format || 'mp3') as 'mp3' | 'wav' | 'opus';

  const mime =
    format === 'mp3'
      ? 'audio/mpeg'
      : format === 'wav'
        ? 'audio/wav'
        : 'audio/ogg';
  setHeader(event, 'Content-Type', mime);
  setHeader(event, 'Cache-Control', 'no-store');

  try {
    const resp = await $fetch.raw('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      responseType: 'stream' as const,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: { model, voice, input: text, format },
    });

    const stream = resp._data as any; // Node.js Readable
    return sendStream(event, stream);
  } catch (e: any) {
    throw createError({
      statusCode: e?.status || e?.response?.status || 500,
      message: e?.data?.error?.message || e?.message || 'TTS stream failed',
    });
  }
});
