import { createError } from 'h3';

// POST /api/heygen/start
// body: { sessionId: string }
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody<{ sessionId: string }>(event);

  if (!body?.sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sessionId' });
  }

  const url = `${config.heygenBaseUrl}/v1/streaming.start`;

  try {
    const res = await $fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': String(config.heygenApiKey || ''),
        'Content-Type': 'application/json',
      },
      body: {
        session_id: body.sessionId,
      },
    });
    return res;
  } catch (err: any) {
    const status = err?.response?.status || err?.data?.code || 500;
    const payload = err?.response?._data ||
      err?.data || { message: err?.message };
    event.context.logger?.error(
      { status, payload },
      'heygen.streaming.start error'
    );
    throw createError({
      statusCode: status,
      statusMessage: payload?.message || 'HeyGen streaming.start failed',
      data: payload,
    });
  }
});
