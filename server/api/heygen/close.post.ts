import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody<{ sessionId: string }>(event);

  if (!body?.sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sessionId' });
  }

  const url = `${config.heygenBaseUrl}/v1/streaming.close`;
  try {
    const res = await $fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': String(config.heygenApiKey || ''),
        'Content-Type': 'application/json',
      },
      body: { session_id: body.sessionId },
    });
    return res;
  } catch (err: any) {
    const externalApiStatus = err?.response?.status || err?.data?.code;
    const payload = err?.response?._data ||
      err?.data || { message: err?.message };
    event.context.logger?.error(
      { status: externalApiStatus, payload },
      'heygen.streaming.close error'
    );

    // Для ошибок внешнего API возвращаем 502 (Bad Gateway), а не 401
    const statusCode =
      externalApiStatus && externalApiStatus >= 400 && externalApiStatus < 500
        ? 502 // Bad Gateway - проблема с внешним API
        : externalApiStatus || 502;

    throw createError({
      statusCode,
      statusMessage: payload?.message || 'HeyGen streaming.close failed',
      data: {
        ...payload,
        originalStatus: externalApiStatus,
      },
    });
  }
});
