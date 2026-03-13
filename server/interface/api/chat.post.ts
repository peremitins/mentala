import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import {
  chatStreamViaProvider,
  chatViaProvider,
  estimateCostUSD,
} from '../../application/llm.service';
import { config } from '../../config';
import {
  ChatRequestDto,
  ChatResponseDto,
  type SuggestedChip,
} from '@/shared/dto';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import {
  therapySessions,
  userPreferences,
} from '@/server/infrastructure/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import {
  getAiUsageGate,
  toUnifiedAiLimitPayload,
} from '@/server/application/subscriptions/ai-usage.service';
import { CHAT_IDLE_TIMEOUT_MS } from '@/server/config/subscription';
import { endTherapySession } from '@/server/application/subscriptions/session-time.service';
import { generateSuggestedChips } from '@/server/application/suggested-chips.service';
import {
  estimateChatRequestUpperBoundUSD,
  isChatRequestOverBudget,
  resolveAllowedChatModel,
} from '@/server/application/chat/chat-guard.service';
import {
  buildCrisisGuidance,
  mergeDeveloperPrompts,
} from '@/server/application/chat/crisis-protocol.service';
import {
  buildPhobiasDeveloperPrompt,
  isPhobiasEntryContext,
  resolveLastTherapyFocusUpdate,
  resolvePhobiasConversationState,
  type PhobiasConversationState,
} from '@/server/application/chat/phobias-entry.service';
import { trackPhobiasEvent } from '@/server/application/chat/phobias-analytics.service';
import { readChatSettings, writeChatSettings } from '@/server/utils/storage';
import { getAssistantToneMeta } from '@/shared/constants/assistantTone';

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
    const userTimezone =
      typeof (sessionResult as any)?.timezone === 'string'
        ? String((sessionResult as any).timezone)
        : undefined;
    const [prefs] = await db
      .select({ tone: userPreferences.tone })
      .from(userPreferences)
      .where(eq(userPreferences.userId, uid))
      .limit(1);
    const toneMeta = getAssistantToneMeta(prefs?.tone);

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
        code: 'no_ai_access',
        message: 'AI access is not available for your plan',
      } as const;
    }

    if (gate.status === 'weekly_limit_reached') {
      const payload = toUnifiedAiLimitPayload(gate);
      setResponseStatus(event, 402);
      return {
        error: true,
        code: payload.code,
        message: payload.message,
        nextResetAt: payload.nextResetAt,
        weeklyLimit: payload.weeklyLimit,
        usedMinutes: payload.usedMinutes,
        overdraftUsed: payload.overdraftUsed,
        aiChatMode: payload.aiChatMode,
      } as const;
    }

    // Жёсткий allowlist модели: клиент не может выбрать произвольную/дорогую модель.
    const effectiveModel = resolveAllowedChatModel(parsed.model);

    // Budget guard для чата (pre-check до обращения к провайдеру).
    const preEstimated = estimateChatRequestUpperBoundUSD({
      messages: parsed.messages,
      model: effectiveModel,
    });

    if (isChatRequestOverBudget(preEstimated)) {
      setResponseStatus(event, 402);
      return {
        error: true,
        code: 'budget_guard_exceeded',
        message:
          'Запрос временно отклонён по лимиту стоимости. Попробуйте переформулировать сообщение.',
        estimated: preEstimated,
      } as const;
    }

    const crisisGuidance = buildCrisisGuidance({
      messages: parsed.messages,
      userLocale: parsed.user_locale,
    });
    let phobiasState: PhobiasConversationState | null = null;
    if (isPhobiasEntryContext(parsed.entryContext)) {
      const settings = await readChatSettings(String(uid));
      phobiasState = resolvePhobiasConversationState({
        entryContext: parsed.entryContext,
        messages: parsed.messages,
        lastTherapyFocus: settings.lastTherapyFocus,
      });
    }

    const phobiasPrompt = buildPhobiasDeveloperPrompt(phobiasState);
    const promptWithPhobias = mergeDeveloperPrompts(
      parsed.userPrompt,
      phobiasPrompt
    );
    const effectiveUserPrompt = mergeDeveloperPrompts(
      promptWithPhobias,
      crisisGuidance.guidance
    );

    if (crisisGuidance.level !== 'none') {
      console.warn('[Chat API] Crisis guidance injected', {
        userId: uid,
        level: crisisGuidance.level,
        countryCode: crisisGuidance.countryCode || 'unknown',
      });
    }

    if (
      phobiasState?.mode === 'welcome_selector' ||
      phobiasState?.mode === 'welcome_resume_selector'
    ) {
      trackPhobiasEvent('phobias_selector_shown', {
        mode: phobiasState.mode,
        hasLastFocus: Boolean(phobiasState.validLastTherapyFocus),
      });
    }

    const commonOptions = {
      sessionId: parsed.sessionId,
      lang: parsed.lang,
      user_locale: parsed.user_locale,
      user_name: userName,
      user_gender: userGender,
      user_timezone: userTimezone,
      toneKey: toneMeta.value,
      toneLabel: toneMeta.label,
      toneDescription: toneMeta.description,
      userId: uid, // серверный стабильный uid
      isFirstSession: undefined, // рассчитывается в других местах при стриминге
      userPrompt: effectiveUserPrompt,
      entryContext: parsed.entryContext ?? undefined, // Преобразуем null в undefined
    };

    let result: { content: string; model?: string };

    if (parsed.messages.length === 0) {
      const stream = chatStreamViaProvider({
        provider: 'openai',
        model: effectiveModel,
        messages: parsed.messages,
        options: commonOptions,
      });

      let content = '';
      for await (const delta of stream) {
        content += delta;
      }

      result = {
        content,
        model: effectiveModel || config.llm.openai.defaultModel,
      };
    } else {
      result = await chatViaProvider({
        provider: 'openai',
        model: effectiveModel,
        messages: parsed.messages,
        options: commonOptions,
      });
    }
    // Оценка токенов: история в OpenAI не передается, считаем только последнее сообщение пользователя.
    // Это снижает риск ложного отказа по бюджету при длинной локальной истории.
    const lastUserMessage =
      parsed.messages.filter((m) => m.role === 'user').slice(-1)[0]?.content ||
      '';
    const tokensIn = Math.ceil(lastUserMessage.length / 4);
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
        code: 'budget_guard_exceeded',
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

    const phobiasFocusUpdate = resolveLastTherapyFocusUpdate({
      state: phobiasState,
    });
    if (phobiasFocusUpdate) {
      try {
        await writeChatSettings(String(uid), {
          lastTherapyFocus: phobiasFocusUpdate.nextFocus,
        });

        if (phobiasFocusUpdate.action === 'resumed') {
          trackPhobiasEvent('phobias_focus_resumed', {
            subtopicKey: phobiasFocusUpdate.nextFocus.subtopicKey,
            subtopicLabel: phobiasFocusUpdate.nextFocus.subtopicLabel,
          });
        } else {
          trackPhobiasEvent('phobias_focus_selected', {
            subtopicKey: phobiasFocusUpdate.nextFocus.subtopicKey,
            subtopicLabel: phobiasFocusUpdate.nextFocus.subtopicLabel,
          });

          if (phobiasFocusUpdate.changed) {
            trackPhobiasEvent('phobias_focus_changed', {
              subtopicKey: phobiasFocusUpdate.nextFocus.subtopicKey,
              subtopicLabel: phobiasFocusUpdate.nextFocus.subtopicLabel,
            });
          }
        }

        trackPhobiasEvent('phobias_session_started', {
          subtopicKey: phobiasFocusUpdate.nextFocus.subtopicKey,
          subtopicLabel: phobiasFocusUpdate.nextFocus.subtopicLabel,
          action: phobiasFocusUpdate.action,
        });
      } catch (error) {
        console.error('[Chat API] Failed to persist phobias focus:', error);
      }
    }

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
