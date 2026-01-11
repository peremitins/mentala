import { defineEventHandler, readBody, setHeader } from 'h3';
import { chatStreamViaProvider } from '@@/server/application/llm.service';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { summaryStore } from '@@/server/utils/summaryStore';
import { responseIdStore } from '@/server/utils/responseIdStore';
import { readChatSettings } from '@/server/utils/storage';
import { db } from '@/server/infrastructure/db/client';
import { therapySessions } from '@/server/infrastructure/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getAiUsageGate } from '@/server/application/subscriptions/ai-usage.service';
import { CHAT_IDLE_TIMEOUT_MS } from '@/server/config/subscription';
import { endTherapySession } from '@/server/application/subscriptions/session-time.service';
import type { ChatEntryContext } from '@/shared/dto';
import { generateSuggestedChips } from '@/server/application/suggested-chips.service';

export default defineEventHandler(async (event) => {
  // Не логируем ключи API (чувствительные данные)
  // console.log убран для безопасности
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
    therapySessionId?: number; // для серверного обновления last_activity_at и биллинга
    entryContext?: ChatEntryContext;
  }>(event);

  // Отдаём как SSE
  setHeader(event, 'Content-Type', 'text/event-stream');
  setHeader(event, 'Cache-Control', 'no-cache');
  setHeader(event, 'Connection', 'keep-alive');

  const res = event.node.res;
  const writeSseError = (
    code: string,
    message: string,
    data?: Record<string, any>
  ) => {
    // Отправляем ошибку в стандартизированном виде.
    res.write(
      `data: ${JSON.stringify({
        error: { code, message, ...(data ? { data } : {}) },
      })}\n\n`
    );
  };

  try {
    // Добавляем память только для авторизованных пользователей
    const sessionResult = await getSessionUserWithRole(event);
    const uid = sessionResult?.id ? String(sessionResult.id) : undefined;
    if (!uid) {
      writeSseError('E_AUTH', 'Unauthorized');
      return;
    }

    const userName =
      (sessionResult as any)?.name ||
      (typeof body?.user_name === 'string' ? body.user_name : undefined);
    const userGender = (sessionResult as any)?.gender || undefined;

    // Требуем валидный therapySessionId, чтобы нельзя было обойти биллинг прямыми вызовами /api/chat/stream
    const therapySessionId =
      typeof body?.therapySessionId === 'number' ? body.therapySessionId : null;

    if (!therapySessionId) {
      writeSseError('E_VALIDATION', 'therapySessionId is required');
      return;
    }

    const now = new Date();

    // Проверяем, что сессия принадлежит пользователю и активна.
    const sessionRows = await db
      .select({
        id: therapySessions.id,
        userId: therapySessions.userId,
        startedAt: therapySessions.startedAt,
        lastActivityAt: therapySessions.lastActivityAt,
        endedAt: therapySessions.endedAt,
      })
      .from(therapySessions)
      .where(eq(therapySessions.id, therapySessionId))
      .limit(1);

    const session = sessionRows[0];
    if (!session || session.userId !== Number(uid)) {
      writeSseError('E_NOT_FOUND', 'Therapy session not found');
      return;
    }

    if (session.endedAt) {
      writeSseError('E_CONFLICT', 'Therapy session already ended');
      return;
    }

    const last = session.lastActivityAt || session.startedAt;
    if (now.getTime() - last.getTime() > CHAT_IDLE_TIMEOUT_MS) {
      await endTherapySession(session.id);
      writeSseError('E_CONFLICT', 'Therapy session expired, start a new one');
      return;
    }

    // Обновляем last_activity_at (серверная "истина" для биллинга)
    await db
      .update(therapySessions)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(
        and(
          eq(therapySessions.id, therapySessionId),
          eq(therapySessions.userId, Number(uid)),
          isNull(therapySessions.endedAt)
        )
      );

    // Серверная проверка доступа к AI и лимита минут
    const gate = await getAiUsageGate(Number(uid), sessionResult.role);
    if (gate.status === 'no_ai_access') {
      writeSseError('E_FORBIDDEN', 'AI access is not available for your plan');
      return;
    }
    if (gate.status === 'weekly_limit_reached') {
      writeSseError('E_RATE', 'Weekly minutes limit exceeded', {
        weeklyLimit: gate.weeklyLimit,
        usedMinutes: gate.usedMinutes,
        overdraftUsed: gate.overdraftUsed,
      });
      return;
    }

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
          // console.log('[Stream API] Found summary for user:', uid, 'count:', count);
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
            // Не логируем responseId (чувствительные данные)
            // console.log('[Stream API] Found valid previous_response_id for user:', uid);
          }
        } catch (err) {
          console.error(
            '[Stream API] Failed to check previous_response_id:',
            err
          );
        }
      }
    }

    // Логируем только метаданные (без чувствительных данных)
    // console.log('[Stream API] User:', uid, 'isFirstSession:', serverIsFirst);

    try {
      // console.log('[Stream API] Calling chatStreamViaProvider (OpenAI)...');

      const stream = chatStreamViaProvider({
        provider: 'openai',
        model: body?.model,
        messages: body?.messages || [],
        options: {
          sessionId: body?.sessionId,
          temperature: body?.temperature,
          lang: body?.lang,
          user_locale: body?.user_locale,
          user_name: userName,
          user_gender: userGender,
          userId: uid,
          isFirstSession: serverIsFirst,
          userPrompt: body?.userPrompt,
          mode: body?.mode, // Режим для старта с welcome-экрана
          entryContext: body?.entryContext,
        },
      });

      // console.log('[Stream API] chatStreamViaProvider returned stream, starting for-await loop');

      let assistantText = '';
      for await (const delta of stream) {
        assistantText += delta;
        res.write(`data: ${JSON.stringify({ output_text_delta: delta })}\n\n`);
      }

      const contextMessages = (body?.messages || []).filter(
        (m) => String(m?.content || '').trim().length > 0
      );

      if (assistantText.trim()) {
        try {
      const chips = await generateSuggestedChips({
        messages: contextMessages,
        assistantAnswer: assistantText,
        sessionId: body?.sessionId,
        userId: uid,
        therapySessionId,
        entryContext: body?.entryContext,
      });

          if (chips.length) {
            res.write(`data: ${JSON.stringify({ chips })}\n\n`);
          }
        } catch (chipsError) {
          // Не ломаем поток, если чипы не сгенерировались.
          console.error('[Stream API] Failed to generate chips:', chipsError);
        }
      }

      // console.log('[Stream API] Stream finished normally');
    } catch (e: any) {
      console.error('[Stream API] OpenAI / chatStreamViaProvider error:', e);
      try {
        writeSseError('E_UPSTREAM', e?.message || 'Stream failed');
      } catch (writeErr) {
        console.error(
          '[Stream API] Failed to write SSE error chunk:',
          writeErr
        );
      }
    }
  } catch (e: any) {
    try {
      writeSseError('E_UNKNOWN', e?.message || 'Stream failed');
    } catch (writeErr) {
      console.error('[Stream API] Failed to write SSE error chunk:', writeErr);
    }
  } finally {
    try {
      res.write('data: [DONE]\n\n');
    } catch (writeErr) {
      console.error('[Stream API] Failed to write SSE [DONE] chunk:', writeErr);
    }
    res.end();
  }
});
