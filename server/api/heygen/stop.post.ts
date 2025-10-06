import { createError } from 'h3';

// POST /api/heygen/stop
// body: { sessionId: string }
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody<{ sessionId: string }>(event);

  if (!body?.sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sessionId' });
  }

  try {
    const res = await $fetch(`${config.heygenBaseUrl}/v1/streaming.stop`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.heygenApiKey}`,
        'Content-Type': 'application/json',
      },
      body: { session_id: body.sessionId },
    });
    return res;
  } catch (err: any) {
    const status = err?.response?.status || 500;
    const payload = err?.response?._data ||
      err?.data || { message: err?.message };
    event.context.logger?.error(
      { status, payload },
      'heygen.streaming.stop error'
    );
    throw createError({
      statusCode: status,
      statusMessage: payload?.message || 'HeyGen streaming.stop failed',
      data: payload,
    });
  }
});
