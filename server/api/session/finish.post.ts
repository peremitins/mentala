import { createError } from 'h3';
import { openaiProvider } from '../../infrastructure/llm/openai';
import { getSessionUser } from '@/server/application/auth/session';

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

  // Сохраняем summary только для авторизованных пользователей (числовой id)
  const sessUser = await getSessionUser(event);

  // Запускаем finishSession в фоне, не блокируем ответ
  if (sessUser?.id) {
    // Не ждем завершения - запускаем асинхронно в фоне
    void (async () => {
      try {
        await openaiProvider.finishSession?.({
          sessionId: body.sessionId,
          allMessages: body.messages || [],
          userId: String(sessUser.id),
          model: body.model,
        });
      } catch (error) {
        console.error(
          '[Session Finish API] Error in finishSession (background):',
          error
        );
      }
    })();
  }

  // Возвращаем ответ сразу, не дожидаясь завершения summary
  return { ok: true };
});
