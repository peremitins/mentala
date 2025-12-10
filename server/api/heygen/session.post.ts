import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  console.log(
    '[AI] openaiApiKey present:',
    !!config.openaiApiKey,
    'len=',
    config.openaiApiKey?.length ?? 0
  );
  const body = await readBody<{
    avatarId?: string;
    voiceId?: string;
    quality?: 'high' | 'medium' | 'low';
    video_encoding?: 'H264' | 'VP8';
    knowledge_base?: string;
    version?: 'v2' | string;
    stt_settings?: { provider?: string; confidence?: number };
    disable_idle_timeout?: boolean;
    activity_idle_timeout?: number;
  }>(event);

  const url = `${config.heygenBaseUrl}/v1/streaming.new`;

  try {
    const res = await $fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': String(config.heygenApiKey || ''),
        'Content-Type': 'application/json',
      },
      body: {
        avatar_id: body.avatarId || config.heygenAvatarId || undefined,
        quality: body.quality ?? 'low', // high, medium, low
        video_encoding: body.video_encoding ?? 'VP8',
        // knowledge_base: body.knowledge_base || undefined,
        version: body.version ?? 'v2',
        // stt_settings: body.stt_settings ?? {
        //   provider: 'deepgram',
        //   confidence: 0.55,
        // },
        disable_idle_timeout: body.disable_idle_timeout ?? false,
        activity_idle_timeout: body.activity_idle_timeout ?? 20,
        // voice: body.voiceId ? { voice_id: body.voiceId } : undefined,
      },
    });

    // Логируем ответ от HeyGen API для отладки
    event.context.logger?.info({ response: res }, 'HeyGen session response');

    if (!res) {
      throw new Error('Empty response from HeyGen API');
    }

    const responseData = (res as any)?.data;

    if (!responseData) {
      event.context.logger?.error(
        { response: res },
        'HeyGen response missing data field'
      );
      throw new Error('HeyGen response missing data field');
    }

    if (!responseData.access_token) {
      event.context.logger?.error(
        { response: res },
        'HeyGen response missing access_token'
      );
      throw new Error('HeyGen response missing access_token');
    }

    if (!responseData.url) {
      event.context.logger?.error(
        { response: res },
        'HeyGen response missing url'
      );
      throw new Error('HeyGen response missing url');
    }

    // session_id может отсутствовать в некоторых случаях, но проверим
    if (!responseData.session_id) {
      event.context.logger?.warn(
        { response: res },
        'HeyGen response missing session_id'
      );
    }

    return res;
  } catch (err: any) {
    event.context.logger?.error(
      {
        error: err?.message,
        stack: err?.stack,
        response: err?.response?._data || err?.data,
      },
      'HeyGen session creation failed'
    );

    // Для ошибок внешнего API возвращаем 502 (Bad Gateway), а не 401
    // чтобы не путать с ошибкой авторизации пользователя
    const externalApiStatus = err?.response?.status || err?.statusCode;
    const statusCode =
      externalApiStatus && externalApiStatus >= 400 && externalApiStatus < 500
        ? 502 // Bad Gateway - проблема с внешним API
        : externalApiStatus || 502;

    throw createError({
      statusCode,
      statusMessage: err?.message || 'HeyGen new session failed',
      data: {
        ...(err?.response?._data || err?.data || {}),
        originalStatus: externalApiStatus,
      },
    });
  }
});
