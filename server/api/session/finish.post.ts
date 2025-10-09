import { createError } from 'h3';
import { openaiProvider } from '../../infrastructure/llm/openai';
import { getOrSetAnonUserId } from '../../utils/user';

// POST /api/session/finish
// body: { sessionId: string; messages?: Array<{ role: 'system'|'user'|'assistant'; content: string }>; model?: string }
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    sessionId: string;
    messages?: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
    model?: string;
  }>(event);

  if (!body?.sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sessionId' });
  }

  const userId = getOrSetAnonUserId(event);

  await openaiProvider.finishSession?.({
    sessionId: body.sessionId,
    allMessages: body.messages || [],
    userId,
    model: body.model,
  });

  return { ok: true };
});
