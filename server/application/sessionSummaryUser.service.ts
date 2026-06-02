// server/application/sessionSummaryUser.service.ts
// ===================================================================
// Сервис пользовательских саммари сессии (ТЗ редизайн главной, п.5-11).
//
// Отвечает за:
//  - проверку eligibility (≥5 user-сообщений, >4 мин, ≥3 содержательных ≥80
//    символов без пробелов — такая же, как на клиенте);
//  - генерацию LLM-ответа по промпту sessionSummaryUser;
//  - шифрование AES-GCM и запись в session_summaries_user;
//  - чтение списка/детали/unseen с расшифровкой;
//  - mark viewed.
//
// Не ломает существующий sessionSummaries (handoff) — это отдельная сущность.
// ===================================================================

import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { config } from '@/server/config';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationSlots,
  sessionSummariesUser,
  therapySessions,
  userPreferences,
  users,
} from '@/server/infrastructure/db/schema';
import {
  encryptPayload,
  decryptPayload,
  serializeEncryptedJson,
  parseEncryptedJson,
} from '@/server/utils/securePayload';
import { therapySessionTranscriptStore } from '@/server/utils/therapySessionTranscriptStore';
import {
  extractResponsesText,
  parseStrictJsonResponse,
  sendOpenAiResponsesRequest,
} from '@/server/infrastructure/llm/openaiResponsesClient';
import { isRelayEnabled } from '@/server/infrastructure/llm/relayClient';
import { buildSessionSummaryUserPrompt } from '@/server/application/prompts/sessionSummaryUser';
import { handleTherapySessionEnded } from '@/server/application/chat/chatMemory.service';
import {
  cleanupUnsummarizedTextBacklogForUser,
  loadUnsummarizedTextBacklogForUser,
} from '@/server/application/chat/restorableTextSession.service';
import {
  SessionSummaryUserContentDto,
  type SessionSummaryUserContentDtoType,
  type SessionSummaryUserItemDtoType,
  type SessionSummaryUserStatus,
  type SessionSummaryUserTrigger,
} from '@/shared/dto/sessionSummaryUser';
import { endTherapySession } from '@/server/application/subscriptions/session-time.service';
import {
  computeEligibilityMessageCounts,
  computeEligibilityFromTranscript,
  isEligibleForRoadmapSummary,
  isEligibleForSummary,
  ROADMAP_SUMMARY_USER_QUALIFYING_MIN_CHARS,
  type EligibilityMetrics,
} from '@/server/application/sessionSummaryUser/sessionSummaryEligibility';

async function skipPendingSummaryReadyPushes(params: {
  userId: number;
  id: number;
}): Promise<void> {
  await db
    .update(notificationSlots)
    .set({ status: 'skipped' })
    .where(
      and(
        eq(notificationSlots.userId, params.userId),
        eq(notificationSlots.kind, 'system'),
        eq(notificationSlots.entityKey, `summary:${params.id}`),
        sql`${notificationSlots.status} IN ('planned', 'queued')`
      )
    );
}

function computeMessagesCount(params: {
  dbMessagesCount: number;
  clientMessagesCount: number;
  userMessagesCount: number;
}): number {
  return Math.max(
    params.dbMessagesCount,
    params.clientMessagesCount,
    params.userMessagesCount
  );
}

function resolveSummarySessionStartedAt(params: {
  dbMessages: Array<{ createdAt?: Date | null }>;
  backlog: Awaited<ReturnType<typeof loadUnsummarizedTextBacklogForUser>>;
  clientSessionStartedAt?: Date | null;
  fallbackSessionStartedAt?: Date | null;
}) {
  const firstMessageCreatedAt = params.dbMessages.find(
    (message) => message.createdAt instanceof Date
  )?.createdAt;

  return (
    firstMessageCreatedAt ??
    params.backlog?.sessions[0]?.startedAt ??
    params.clientSessionStartedAt ??
    params.fallbackSessionStartedAt ??
    null
  );
}

function getOpenAiTransportConfig() {
  const useRelay = isRelayEnabled();
  const apiKey = useRelay ? undefined : process.env.NUXT_OPENAI_API_KEY;
  return {
    apiKey,
    org: process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID,
    project:
      process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID,
  };
}

async function callLlmForSummary(params: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
}): Promise<SessionSummaryUserContentDtoType> {
  const { apiKey, org, project } = getOpenAiTransportConfig();
  const usedModel = params.model || config.llm.openai.defaultModel;

  const response = await sendOpenAiResponsesRequest({
    body: {
      model: usedModel,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: params.systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: params.userPrompt }],
        },
      ],
      store: false,
      temperature: 0.2,
      max_output_tokens: 900,
    },
    purpose: 'finish_session',
    timeoutMs: 30_000,
    apiKey,
    org,
    project,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
  });

  const rawText = extractResponsesText(response);
  const parsedJson = parseStrictJsonResponse(rawText);
  // Валидируем и нормализуем через Zod — выбрасываем мусорные поля.
  return SessionSummaryUserContentDto.parse(parsedJson);
}

// Достаём сессию пользователя по therapySessionId или clientSessionId.
async function resolveTherapySession(params: {
  userId: number;
  therapySessionId?: number;
  clientSessionId?: string;
}) {
  if (params.therapySessionId) {
    const rows = await db
      .select()
      .from(therapySessions)
      .where(
        and(
          eq(therapySessions.id, params.therapySessionId),
          eq(therapySessions.userId, params.userId)
        )
      )
      .limit(1);
    return rows[0] ?? null;
  }

  if (params.clientSessionId) {
    const rows = await db
      .select()
      .from(therapySessions)
      .where(
        and(
          eq(therapySessions.userId, params.userId),
          eq(therapySessions.clientSessionId, params.clientSessionId)
        )
      )
      .orderBy(desc(therapySessions.startedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  return null;
}

export type CreateSessionSummaryUserResult =
  | {
      ok: true;
      eligible: true;
      id: number;
      status: SessionSummaryUserStatus;
    }
  | {
      ok: true;
      eligible: false;
      id: null;
      status: 'pending';
      reason: string;
    };

export async function createSessionSummaryUser(params: {
  userId: number;
  therapySessionId?: number;
  clientSessionId?: string;
  trigger: SessionSummaryUserTrigger;
  model?: string;
  /**
   * Метрики с клиента — fallback когда transcript в БД пустой.
   * Актуально для realtime voice (transcript пишется только при enableMemory=true)
   * и для гонок записи (запрос summary пришёл раньше, чем event user_turn_completed).
   * Доверяем клиенту: therapySessionId принадлежит userId, злоупотребление минимально.
   */
  clientMetrics?: {
    userMessagesCount: number;
    qualifyingUserMessagesCount: number;
    durationSeconds: number;
  };
  clientSessionStartedAt?: Date | null;
  /**
   * Сообщения из клиентского стора — fallback для LLM когда transcript в БД пустой.
   * Используется при realtime voice (transient messages) или memory-off кейсе.
   */
  clientMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<CreateSessionSummaryUserResult> {
  const userId = Number(params.userId);
  const session = await resolveTherapySession({
    userId,
    therapySessionId: params.therapySessionId,
    clientSessionId: params.clientSessionId,
  });

  if (!session) {
    return {
      ok: true,
      eligible: false,
      id: null,
      status: 'pending',
      reason: 'therapy_session_not_found',
    };
  }

  const backlog = await loadUnsummarizedTextBacklogForUser(userId, {
    upToSession: {
      id: session.id,
      startedAt: session.startedAt,
    },
  });

  // Дедуп — итог привязываем к therapySessionId из запроса.
  // Это защищает от гонки: старая summary не должна завершать или чистить
  // более новую сессию, которая уже стартовала у пользователя параллельно.
  const existing = await db
    .select()
    .from(sessionSummariesUser)
    .where(eq(sessionSummariesUser.therapySessionId, session.id))
    .limit(1);

  const existingRow = existing[0] ?? null;
  if (
    existingRow &&
    (existingRow.status === 'completed' || existingRow.status === 'pending')
  ) {
    return {
      ok: true,
      eligible: true,
      id: existingRow.id,
      status: existingRow.status as SessionSummaryUserStatus,
    };
  }

  const dbMessages =
    backlog?.messages && backlog.messages.length > 0 ? backlog.messages : [];
  const endedAt = session.endedAt ?? new Date();
  const summarySessionStartedAt = resolveSummarySessionStartedAt({
    dbMessages,
    backlog,
    clientSessionStartedAt: params.clientSessionStartedAt,
    fallbackSessionStartedAt: session.startedAt,
  });
  const isRoadmapSummary = params.trigger === 'roadmap_next';
  const serverMetrics = computeEligibilityFromTranscript(
    dbMessages,
    summarySessionStartedAt,
    endedAt,
    isRoadmapSummary
      ? { qualifyingMinChars: ROADMAP_SUMMARY_USER_QUALIFYING_MIN_CHARS }
      : undefined
  );

  // Для Roadmap считаем "содержательность" по тем же мягким правилам,
  // что и embedded ChatRoom. Это не влияет на обычный /chat.
  const clientMessageCounts =
    params.clientMessages && params.clientMessages.length > 0
      ? computeEligibilityMessageCounts(
          params.clientMessages,
          isRoadmapSummary
            ? { qualifyingMinChars: ROADMAP_SUMMARY_USER_QUALIFYING_MIN_CHARS }
            : undefined
        )
      : null;
  const clientMetrics = params.clientMetrics
    ? {
        userMessagesCount: Math.max(
          params.clientMetrics.userMessagesCount,
          clientMessageCounts?.userMessagesCount ?? 0
        ),
        qualifyingUserMessagesCount: Math.max(
          params.clientMetrics.qualifyingUserMessagesCount,
          clientMessageCounts?.qualifyingUserMessagesCount ?? 0
        ),
        durationSeconds: params.clientMetrics.durationSeconds,
      }
    : clientMessageCounts
      ? {
          userMessagesCount: clientMessageCounts.userMessagesCount,
          qualifyingUserMessagesCount:
            clientMessageCounts.qualifyingUserMessagesCount,
          durationSeconds: 0,
        }
      : undefined;

  // Всегда берём максимум из серверных и клиентских метрик.
  // Клиентские могут быть выше из-за гонки: transcript в БД мог ещё не
  // сохранить все сообщения (voice events, запись в полёте и т.п.),
  // поэтому доверяем клиенту для eligibility, при этом не занижая сервер.
  const metrics: EligibilityMetrics = clientMetrics
    ? {
        userMessagesCount: Math.max(
          serverMetrics.userMessagesCount,
          clientMetrics.userMessagesCount
        ),
        qualifyingUserMessagesCount: Math.max(
          serverMetrics.qualifyingUserMessagesCount,
          clientMetrics.qualifyingUserMessagesCount
        ),
        durationSeconds: Math.max(
          serverMetrics.durationSeconds,
          clientMetrics.durationSeconds
        ),
      }
    : serverMetrics;

  // Выбираем источник сообщений для LLM:
  // 1. Transcript из БД — приоритет (полный сохранённый диалог)
  // 2. Client messages — fallback когда БД пустая (realtime voice, memory off)
  const messagesForLlm: Array<{ role: 'user' | 'assistant'; content: string }> =
    dbMessages.length > 0
      ? dbMessages.map((m) => ({ role: m.role, content: m.content }))
      : (params.clientMessages ?? []);

  console.info('[sessionSummaryUser] Resolving messages for LLM', {
    therapySessionId: session.id,
    userId,
    dbMessagesCount: dbMessages.length,
    clientMessagesCount: params.clientMessages?.length ?? 0,
    usingSource: dbMessages.length > 0 ? 'db_transcript' : 'client_fallback',
    metricsSource: clientMetrics ? 'max(server,client)' : 'server',
    eligibilityMode: isRoadmapSummary ? 'roadmap_next' : 'standard',
    serverMetrics,
    metrics,
  });

  const messagesCount = computeMessagesCount({
    dbMessagesCount: dbMessages.length,
    clientMessagesCount: params.clientMessages?.length ?? 0,
    userMessagesCount: metrics.userMessagesCount,
  });

  const eligibleForSummary = isRoadmapSummary
    ? isEligibleForRoadmapSummary({
        ...metrics,
        messagesCount,
      })
    : isEligibleForSummary(metrics);

  if (!eligibleForSummary) {
    return {
      ok: true,
      eligible: false,
      id: null,
      status: 'pending',
      reason: 'not_eligible',
    };
  }

  // Создаём pending-запись до запроса к LLM — фиксируем намерение,
  // чтобы повторные вызовы на ту же therapy session попадали в дедуп выше.
  let rowId: number;
  if (existingRow?.status === 'failed') {
    const [updatedRow] = await db
      .update(sessionSummariesUser)
      .set({
        clientSessionId: session.clientSessionId ?? null,
        therapySessionId: session.id,
        model: params.model ?? config.llm.openai.defaultModel ?? null,
        sessionStartedAt: summarySessionStartedAt,
        sessionEndedAt: endedAt,
        durationSeconds: metrics.durationSeconds,
        messagesCount,
        userMessagesCount: metrics.userMessagesCount,
        qualifyingUserMessagesCount: metrics.qualifyingUserMessagesCount,
        summaryIv: null,
        summaryCt: null,
        status: 'pending',
        errorMessage: null,
        trigger: params.trigger,
        updatedAt: new Date(),
      })
      .where(eq(sessionSummariesUser.id, existingRow.id))
      .returning({ id: sessionSummariesUser.id });

    rowId = updatedRow!.id;
  } else {
    const [pendingRow] = await db
      .insert(sessionSummariesUser)
      .values({
        userId,
        clientSessionId: session.clientSessionId ?? null,
        therapySessionId: session.id,
        model: params.model ?? config.llm.openai.defaultModel ?? null,
        sessionStartedAt: summarySessionStartedAt,
        sessionEndedAt: endedAt,
        durationSeconds: metrics.durationSeconds,
        messagesCount,
        userMessagesCount: metrics.userMessagesCount,
        qualifyingUserMessagesCount: metrics.qualifyingUserMessagesCount,
        status: 'pending',
        trigger: params.trigger,
      })
      .returning({ id: sessionSummariesUser.id });

    rowId = pendingRow!.id;
  }

  // Получаем стиль обращения, локаль и пол пользователя из БД для персонализации промпта.
  // Запросы параллельные — не блокируем друг друга.
  const [userPrefs, userRow] = await Promise.all([
    db
      .select({ addressing: userPreferences.addressing })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ locale: users.locale, gender: users.gender })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const userGender =
    userRow?.gender === 'female' || userRow?.gender === 'male'
      ? userRow.gender
      : null;

  try {
    const { system, user } = buildSessionSummaryUserPrompt({
      durationSeconds: metrics.durationSeconds,
      userMessagesCount: metrics.userMessagesCount,
      messages: messagesForLlm,
      addressing: userPrefs?.addressing ?? null,
      locale: userRow?.locale ?? null,
      gender: userGender,
    });

    const summaryContent = await callLlmForSummary({
      systemPrompt: system,
      userPrompt: user,
      model: params.model,
    });

    const { iv, ct } = serializeEncryptedJson(summaryContent);

    await db
      .update(sessionSummariesUser)
      .set({
        summaryIv: iv,
        summaryCt: ct,
        status: 'completed',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(sessionSummariesUser.id, rowId));

    // Подстраховка: если therapy session до сих пор не закрыта — закрываем (полный lifecycle).
    // Если уже закрыта (таймер остановлен через /api/therapy/session/end с
    // skipPostEndMemoryLifecycle:true) — запускаем lifecycle AI-памяти вручную:
    // он построит handoff-саммари и подготовит очистку транскрипта.
    if (!session.endedAt) {
      try {
        await endTherapySession(session.id);
      } catch (error) {
        console.error(
          '[sessionSummaryUser] Failed to end therapy session after summary:',
          error
        );
      }
    } else {
      try {
        await handleTherapySessionEnded({
          therapySessionId: session.id,
          userId,
        });
      } catch (error) {
        console.error(
          '[sessionSummaryUser] Failed to run memory lifecycle for already-ended session:',
          error
        );
      }
    }

    // После успешной summary очищаем только тот backlog, который реально вошёл
    // в текущий итог. Более новая сессия, стартовавшая параллельно, должна
    // остаться нетронутой.
    const cleanedSessionsCount = await cleanupUnsummarizedTextBacklogForUser(
      userId,
      {
        upToSession: {
          id: session.id,
          startedAt: session.startedAt,
        },
      }
    );

    if (cleanedSessionsCount === 0) {
      await therapySessionTranscriptStore.deleteByTherapySessionId(
        session.id,
        userId
      );
    }

    return { ok: true, eligible: true, id: rowId, status: 'completed' };
  } catch (error) {
    console.error('[sessionSummaryUser] LLM generation failed:', error);
    const errorMessage =
      error instanceof Error ? error.message.slice(0, 500) : 'unknown error';

    await db
      .update(sessionSummariesUser)
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(sessionSummariesUser.id, rowId));

    return { ok: true, eligible: true, id: rowId, status: 'failed' };
  }
}

// --- Чтение ---

function decodeRowToDto(
  row: typeof sessionSummariesUser.$inferSelect
): SessionSummaryUserItemDtoType | null {
  // Раскрываем summaryIv/summaryCt: может быть null (pending/failed).
  let summary: SessionSummaryUserContentDtoType = {
    shortSummary: '',
    keyPoints: [],
    nextSteps: [],
  };

  if (row.summaryIv !== null && row.summaryCt !== null) {
    try {
      summary = SessionSummaryUserContentDto.parse(
        parseEncryptedJson<SessionSummaryUserContentDtoType>(
          row.summaryIv,
          row.summaryCt
        )
      );
    } catch (error) {
      console.error(
        '[sessionSummaryUser] Failed to decrypt summary row:',
        row.id,
        error
      );
      return null;
    }
  }

  return {
    id: row.id,
    status: row.status as SessionSummaryUserStatus,
    sessionStartedAt: row.sessionStartedAt?.toISOString() ?? null,
    sessionEndedAt: row.sessionEndedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    messagesCount: row.messagesCount,
    qualifyingUserMessagesCount: row.qualifyingUserMessagesCount,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    trigger: (row.trigger as SessionSummaryUserTrigger | null) ?? null,
    summary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSessionSummariesUser(params: {
  userId: number;
  page: number;
  pageSize: number;
}) {
  const offset = (params.page - 1) * params.pageSize;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(sessionSummariesUser)
      .where(
        and(
          eq(sessionSummariesUser.userId, params.userId),
          // В списке не показываем pending/failed без summary.
          eq(sessionSummariesUser.status, 'completed')
        )
      )
      .orderBy(desc(sessionSummariesUser.createdAt))
      .limit(params.pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionSummariesUser)
      .where(
        and(
          eq(sessionSummariesUser.userId, params.userId),
          eq(sessionSummariesUser.status, 'completed')
        )
      ),
  ]);

  const items = rows
    .map((row) => decodeRowToDto(row))
    .filter((item): item is SessionSummaryUserItemDtoType => item !== null);

  return {
    items,
    total: totalRow[0]?.count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getSessionSummaryUser(params: {
  userId: number;
  id: number;
}): Promise<SessionSummaryUserItemDtoType | null> {
  const rows = await db
    .select()
    .from(sessionSummariesUser)
    .where(
      and(
        eq(sessionSummariesUser.id, params.id),
        eq(sessionSummariesUser.userId, params.userId)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return decodeRowToDto(row);
}

export async function getUnseenSessionSummaryUser(params: {
  userId: number;
}): Promise<SessionSummaryUserItemDtoType | null> {
  const rows = await db
    .select()
    .from(sessionSummariesUser)
    .where(
      and(
        eq(sessionSummariesUser.userId, params.userId),
        eq(sessionSummariesUser.status, 'completed'),
        isNull(sessionSummariesUser.viewedAt)
      )
    )
    .orderBy(desc(sessionSummariesUser.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return decodeRowToDto(row);
}

export async function markSessionSummaryUserViewed(params: {
  userId: number;
  id: number;
}): Promise<Date | null> {
  const now = new Date();
  const rows = await db
    .update(sessionSummariesUser)
    .set({
      viewedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(sessionSummariesUser.id, params.id),
        eq(sessionSummariesUser.userId, params.userId),
        // Не трогаем уже просмотренные — возвращаем их прежнее viewedAt.
        isNull(sessionSummariesUser.viewedAt)
      )
    )
    .returning({ viewedAt: sessionSummariesUser.viewedAt });

  if (rows[0]?.viewedAt) {
    await skipPendingSummaryReadyPushes(params);
    return rows[0].viewedAt;
  }

  // Если строка уже была просмотрена — достаём существующее значение.
  const existing = await db
    .select({ viewedAt: sessionSummariesUser.viewedAt })
    .from(sessionSummariesUser)
    .where(
      and(
        eq(sessionSummariesUser.id, params.id),
        eq(sessionSummariesUser.userId, params.userId)
      )
    )
    .limit(1);

  const viewedAt = existing[0]?.viewedAt ?? null;
  if (viewedAt) {
    await skipPendingSummaryReadyPushes(params);
  }

  return viewedAt;
}

// Placeholder-шифрование для тестов/линтеров, чтобы tree-shake не выкинул импорт.
void encryptPayload;
void decryptPayload;
