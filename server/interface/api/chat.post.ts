import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import {
  chatStreamViaProvider,
  chatViaProvider,
  estimateCostUSD,
} from '../../application/llm.service';
import { config } from '../../config';
import { ChatRequestDto, ChatResponseDto, type SuggestedChip } from '@/shared/dto';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { therapySessions } from '@/server/infrastructure/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getAiUsageGate } from '@/server/application/subscriptions/ai-usage.service';
import { CHAT_IDLE_TIMEOUT_MS } from '@/server/config/subscription';
import { endTherapySession } from '@/server/application/subscriptions/session-time.service';
import { generateSuggestedChips } from '@/server/application/suggested-chips.service';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const parsed = ChatRequestDto.parse(body);
    // Force OpenAI for now regardless of body.provider
    const sessionResult = await getSessionUserWithRole(event);
    if (!sessionResult?.id) {
      setResponseStatus(event, 401);
      return { error: true, message: 'Unauthorized' } as const;
    }

    const uid = Number(sessionResult.id);
    const userName =
      (sessionResult as any)?.name || parsed.user_name || undefined;
    const userGender = (sessionResult as any)?.gender || undefined;

    // Требуем валидный therapySessionId, чтобы нельзя было обойти биллинг прямыми вызовами /api/chat
    const therapySessionId =
      typeof parsed.therapySessionId === 'number'
        ? parsed.therapySessionId
        : null;

    if (!therapySessionId) {
      setResponseStatus(event, 400);
      return { error: true, message: 'therapySessionId is required' } as const;
    }

    const now = new Date();

    // Проверяем, что сессия принадлежит пользователю и активна
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
    if (!session || session.userId !== uid) {
      setResponseStatus(event, 404);
      return { error: true, message: 'Therapy session not found' } as const;
    }

    if (session.endedAt) {
      setResponseStatus(event, 400);
      return {
        error: true,
        message: 'Therapy session already ended',
      } as const;
    }

    const last = session.lastActivityAt || session.startedAt;
    if (now.getTime() - last.getTime() > CHAT_IDLE_TIMEOUT_MS) {
      await endTherapySession(session.id);
      setResponseStatus(event, 400);
      return {
        error: true,
        message: 'Therapy session expired, start a new one',
      } as const;
    }

    // Обновляем last_activity_at (серверная "истина" для биллинга)
    await db
      .update(therapySessions)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(
        and(
          eq(therapySessions.id, therapySessionId),
          eq(therapySessions.userId, uid),
          isNull(therapySessions.endedAt)
        )
      );

    // Серверная проверка доступа к AI и лимита минут
    const gate = await getAiUsageGate(uid, sessionResult.role);
    if (gate.status === 'no_ai_access') {
      setResponseStatus(event, 403);
      return {
        error: true,
        message: 'AI access is not available for your plan',
      } as const;
    }

    if (gate.status === 'weekly_limit_reached') {
      setResponseStatus(event, 402);
      return {
        error: true,
        message: 'Weekly minutes limit exceeded',
        weeklyLimit: gate.weeklyLimit,
        usedMinutes: gate.usedMinutes,
      } as const;
    }
    const commonOptions = {
      sessionId: parsed.sessionId,
      lang: parsed.lang,
      user_locale: parsed.user_locale,
      user_name: userName,
      user_gender: userGender,
      userId: uid, // серверный стабильный uid
      isFirstSession: undefined, // рассчитывается в других местах при стриминге
      userPrompt: parsed.userPrompt,
      entryContext: parsed.entryContext ?? undefined, // Преобразуем null в undefined
      mode: parsed.mode,
    };

    let result: { content: string; model?: string };

    if (parsed.messages.length === 0) {
      if (!parsed.mode) {
        setResponseStatus(event, 400);
        return { error: true, message: 'mode is required' } as const;
      }

      const stream = chatStreamViaProvider({
        provider: 'openai',
        model: parsed.model,
        messages: parsed.messages,
        options: commonOptions,
      });

      let content = '';
      for await (const delta of stream) {
        content += delta;
      }

      result = {
        content,
        model: parsed.model || config.llm.openai.defaultModel,
      };
    } else {
      result = await chatViaProvider({
        provider: 'openai',
        model: parsed.model,
        messages: parsed.messages,
        options: commonOptions,
      });
    }
    // simple guard: roughly estimate tokens by characters (very rough ~4 chars per token)
    const tokensIn = Math.ceil(
      parsed.messages.reduce((s, m) => s + m.content.length, 0) / 4
    );
    const tokensOut = Math.ceil((result.content || '').length / 4);
    const estimated = estimateCostUSD({
      provider: 'openai',
      model: result.model || config.llm.openai.defaultModel,
      tokensIn,
      tokensOut,
    });
    if (estimated > config.llm.limits.maxRequestUSD) {
      setResponseStatus(event, 402);
      return {
        error: true,
        message: 'Estimated cost too high for single request',
        estimated,
      };
    }
    const chips = await (async () => {
      try {
        return await generateSuggestedChips({
          messages: parsed.messages,
          assistantAnswer: result.content,
          sessionId: parsed.sessionId,
          userId: uid,
          therapySessionId,
          entryContext: parsed.entryContext,
        });
      } catch (chipsError) {
        // Не ломаем основной ответ, если чипы не сгенерировались.
        console.error('[Chat API] Failed to generate chips:', chipsError);
        return [] as SuggestedChip[];
      }
    })();

    const response = ChatResponseDto.parse({
      message: { role: 'assistant', content: result.content },
      provider: 'openai',
      model: result.model,
      chips,
    });
    return response;
  } catch (e: any) {
    const status = e?.status || e?.response?.status || 500;
    setResponseStatus(event, status);
    return {
      error: true,
      message: e?.message || 'Request failed',
      status,
    };
  }
});
