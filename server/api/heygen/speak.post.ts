import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody<{
    sessionId: string;
    text: string;
    taskType?: 'repeat' | 'chat';
    taskMode?: 'sync' | 'async';
  }>(event);

  if (!body?.sessionId || !body?.text) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing sessionId or text',
    });
  }

  // Streaming API: Send Task
  const url = `${config.heygenBaseUrl}/v1/streaming.task`;

  try {
    const res = await $fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': String(config.heygenApiKey || ''),
        'Content-Type': 'application/json',
      },
      body: {
        session_id: body.sessionId,
        text: body.text,
        task_mode: body.taskMode || 'sync',
        task_type: body.taskType || 'repeat',
      },
    });

    return res;
  } catch (err: any) {
    const status = err?.response?.status || err?.data?.code || 500;
    const payload = err?.response?._data ||
      err?.data || { message: err?.message };
    // лог в pino (см. server/plugins/logger.ts)
    event.context.logger?.error(
      { status, payload },
      'heygen.streaming.task error'
    );
    throw createError({
      statusCode: status,
      statusMessage: payload?.message || 'HeyGen streaming.task failed',
      data: payload,
    });
  }
});
