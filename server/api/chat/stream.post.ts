import { defineEventHandler, readBody, setHeader } from 'h3';
import { chatStreamViaProvider } from '@@/server/application/llm.service';
import { getSessionUser } from '@@/server/application/auth/session';
import { summaryStore } from '@@/server/utils/summaryStore';
import { responseIdStore } from '@/server/utils/responseIdStore';
import { readChatSettings } from '@/server/utils/storage';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  console.log(
    '[Stream API] openaiApiKey present:',
    !!config.openaiApiKey,
    'len=',
    config.openaiApiKey?.length ?? 0
  );
  const body = await readBody<{
    model?: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    sessionId?: string;
    temperature?: number;
    lang?: string;
    user_locale?: string;
    user_name?: string;
    userId?: number | string;
    isFirstSession?: boolean;
    userPrompt?: string;
    mode?: 'therapy' | 'habits' | 'talk'; // Режим для старта с welcome-экрана
  }>(event);

  // Отдаём как SSE
  setHeader(event, 'Content-Type', 'text/event-stream');
  setHeader(event, 'Cache-Control', 'no-cache');
  setHeader(event, 'Connection', 'keep-alive');

  const res = event.node.res;

  try {
    // Добавляем память только для авторизованных пользователей
    const sessUser = await getSessionUser(event);
    const uid = sessUser?.id ? String(sessUser.id) : undefined;

    // Определяем isFirstSession: это первая сессия только если НЕТ ни summary, ни previous_response_id
    let serverIsFirst = true;

    if (uid) {
      // Проверяем настройки пользователя
      const chatSettings = await readChatSettings(String(uid));
      const enablePreviousResponseId =
        chatSettings?.enablePreviousResponseId ?? true;
      const enableSummary = chatSettings?.enableSummary ?? true;

      // Проверяем summary
      if (enableSummary) {
        const count = await summaryStore.countByUser(uid);
        if (count > 0) {
          serverIsFirst = false;
          console.log(
            '[Stream API] Found summary for user:',
            uid,
            'count:',
            count
          );
        }
      }

      // Проверяем previous_response_id (важно для памяти OpenAI)
      if (enablePreviousResponseId && serverIsFirst) {
        try {
          const lastResponse = await responseIdStore.getLastValid(uid);
          if (
            lastResponse &&
            responseIdStore.isResponseValid(lastResponse.expiresAt)
          ) {
            serverIsFirst = false;
            console.log(
              '[Stream API] Found valid previous_response_id for user:',
              uid,
              'responseId:',
              lastResponse.responseId
            );
          }
        } catch (err) {
          console.error(
            '[Stream API] Failed to check previous_response_id:',
            err
          );
        }
      }
    }

    console.log('[Stream API] User:', uid, 'isFirstSession:', serverIsFirst);

    // 🔍 Логируем входящие данные
    console.log('[Stream API] Incoming payload:', {
      model: body?.model,
      messagesCount: body?.messages?.length ?? 0,
      mode: body?.mode,
      sessionId: body?.sessionId,
      lang: body?.lang,
    });

    try {
      console.log('[Stream API] Calling chatStreamViaProvider (OpenAI)...');

      const stream = chatStreamViaProvider({
        provider: 'openai',
        model: body?.model,
        messages: body?.messages || [],
        options: {
          sessionId: body?.sessionId,
          temperature: body?.temperature,
          lang: body?.lang,
          user_locale: body?.user_locale,
          user_name: body?.user_name,
          userId: uid,
          isFirstSession: serverIsFirst,
          userPrompt: body?.userPrompt,
          mode: body?.mode, // Режим для старта с welcome-экрана
        },
      });

      console.log(
        '[Stream API] chatStreamViaProvider returned stream, starting for-await loop'
      );

      for await (const delta of stream) {
        res.write(`data: ${JSON.stringify({ output_text_delta: delta })}\n\n`);
      }

      console.log('[Stream API] Stream finished normally');
    } catch (e: any) {
      console.error('[Stream API] OpenAI / chatStreamViaProvider error:', e);
      try {
        res.write(
          `data: ${JSON.stringify({
            error: true,
            message: e?.message || 'Stream failed',
          })}\n\n`
        );
      } catch {}
    }
  } catch (e: any) {
    try {
      res.write(
        `data: ${JSON.stringify({ error: true, message: e?.message || 'Stream failed' })}\n\n`
      );
    } catch {}
  } finally {
    try {
      res.write('data: [DONE]\n\n');
    } catch {}
    res.end();
  }
});
