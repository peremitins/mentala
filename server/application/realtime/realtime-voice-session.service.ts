import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  realtimeVoiceSessionEvents,
  realtimeVoiceSessions,
  therapySessions,
} from '@/server/infrastructure/db/schema';
import type {
  ChatEntryContext,
  RealtimeVoiceSessionEndReason,
  RealtimeVoiceSessionEventRequest,
  RealtimeVoiceRuntimeCompactionReason,
  RealtimeVoiceSessionStartRequest,
} from '@/shared/dto';
import {
  CHAT_MEMORY_MAX_INPUT_TOKENS,
  CHAT_MEMORY_SOFT_INPUT_TOKENS,
} from '@/server/config/chatMemory';
import {
  REALTIME_VOICE_HARD_CEILING_SECONDS,
  REALTIME_VOICE_IDLE_TIMEOUT_SECONDS,
  REALTIME_VOICE_OPENAI_MODEL,
  REALTIME_VOICE_OPENAI_VOICE,
  REALTIME_VOICE_STALE_GRACE_SECONDS,
  REALTIME_VOICE_WEBRTC_URL,
} from '@/server/config/realtime';
import { getUserAssistantPersona } from '@/server/application/chat/assistant-persona.service';
import {
  endTherapySessionWithOptions,
  startTherapySession,
} from '@/server/application/subscriptions/session-time.service';
import { buildRealtimeVoiceInstructions } from './realtime-voice-instructions.service';
import { buildOpenAiRealtimeSessionConfig } from '@/server/infrastructure/llm/openai-realtime';
import { assertRealtimeVoiceAccess } from './realtime-voice-access.service';
import {
  getRealtimeVoiceQuotaSnapshot,
  resolveRealtimeVoiceMaxDurationSeconds,
} from './realtime-voice-quota.service';
import { isRealtimeVoiceSessionStale } from './realtime-voice-period.utils';
import { getAiUsageGate } from '@/server/application/subscriptions/ai-usage.service';
import {
  appendTranscriptMessages,
  handleTherapySessionEnded,
  isChatMemoryEnabledForUser,
  performRuntimeCompaction,
} from '@/server/application/chat/chatMemory.service';
import { hasMeaningfulRuntimeCompactState } from '@/server/application/chat/chatSummary.service';
import { chatSessionMemoryStore } from '@/server/utils/chatSessionMemoryStore';
import {
  deleteRealtimeVoiceSessionConfig,
  getRealtimeVoiceSessionConfig,
  saveRealtimeVoiceSessionConfig,
} from './realtime-voice-session-config.store';
import {
  resolveRealtimeVoiceRuntimeCompactionModel,
  resolveRealtimeVoiceRuntimeCompactionReason,
} from './realtime-voice-runtime-compaction';
import { upsertRealtimeVoiceRuntimeCompactInstructions } from './realtime-voice-instructions';

type RealtimeVoiceSessionRecord = typeof realtimeVoiceSessions.$inferSelect;

function buildSessionId(): string {
  return `rtv_${randomUUID()}`;
}

function sanitizeChatSessionId(value?: string | null): string | null {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeUsageNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function resolveSessionStatusByReason(reason: RealtimeVoiceSessionEndReason) {
  if (reason === 'network_error' || reason === 'provider_error') {
    return 'failed' as const;
  }

  return 'completed' as const;
}

function resolveRealtimeVoiceEndTime(params: {
  session: Pick<RealtimeVoiceSessionRecord, 'startedAt' | 'lastActivityAt'>;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const hardDeadline = new Date(
    params.session.startedAt.getTime() +
      REALTIME_VOICE_HARD_CEILING_SECONDS * 1000
  );
  const lastActivityAt =
    params.session.lastActivityAt ?? params.session.startedAt;
  const idleDeadline = new Date(
    lastActivityAt.getTime() + REALTIME_VOICE_IDLE_TIMEOUT_SECONDS * 1000
  );
  const endedAt = new Date(
    Math.min(now.getTime(), hardDeadline.getTime(), idleDeadline.getTime())
  );

  if (endedAt.getTime() < params.session.startedAt.getTime()) {
    return params.session.startedAt;
  }

  return endedAt;
}

function calculateDurationSeconds(startedAt: Date, endedAt: Date): number {
  return Math.max(
    0,
    Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)
  );
}

function resolveRemainingHardCeilingSeconds(
  startedAt: Date,
  now: Date
): number {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - startedAt.getTime()) / 1000)
  );

  return Math.max(0, REALTIME_VOICE_HARD_CEILING_SECONDS - elapsedSeconds);
}

function resolveTranscriptTurnIndex(
  session: Pick<
    RealtimeVoiceSessionRecord,
    'userTurnsCount' | 'assistantTurnsCount'
  >
): number {
  return Math.max(1, session.userTurnsCount + session.assistantTurnsCount + 1);
}

async function recordRealtimeVoiceSuccessfulTurn(params: {
  therapySessionId: number;
  userId: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}) {
  const pendingSoftCompaction =
    typeof params.inputTokens === 'number' &&
    params.inputTokens >= CHAT_MEMORY_SOFT_INPUT_TOKENS &&
    params.inputTokens < CHAT_MEMORY_MAX_INPUT_TOKENS;

  await chatSessionMemoryStore.recordSuccessfulTurn({
    therapySessionId: params.therapySessionId,
    userId: params.userId,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    totalTokens: params.totalTokens,
    // Для realtime voice сам факт прохождения turn после soft-threshold
    // уже является безопасной точкой compaction, поэтому ниже reason
    // вычисляется отдельно. Здесь храним флаг для единообразия метрик.
    pendingSoftCompaction,
  });

  return await chatSessionMemoryStore.get(params.therapySessionId);
}

async function maybeBuildRealtimeVoiceRuntimeCompaction(params: {
  realtimeSessionId: string;
  userId: number;
  therapySessionId: number;
  model?: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}): Promise<{
  reason: RealtimeVoiceRuntimeCompactionReason;
  instructions: string;
} | null> {
  const state = await recordRealtimeVoiceSuccessfulTurn({
    therapySessionId: params.therapySessionId,
    userId: params.userId,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    totalTokens: params.totalTokens,
  });
  const reason = resolveRealtimeVoiceRuntimeCompactionReason({
    inputTokens: state?.lastObservedInputTokens ?? params.inputTokens,
    chainTurnCount: state?.chainTurnCount ?? 0,
  });

  if (!reason) {
    return null;
  }

  const runtimeCompactState = await performRuntimeCompaction({
    therapySessionId: params.therapySessionId,
    userId: params.userId,
    model: resolveRealtimeVoiceRuntimeCompactionModel(params.model),
    reason,
  });

  if (!hasMeaningfulRuntimeCompactState(runtimeCompactState)) {
    console.warn(
      '[RealtimeVoice] Runtime compaction produced empty compact-state, skip live reset',
      {
        therapySessionId: params.therapySessionId,
        userId: params.userId,
        reason,
      }
    );
    return null;
  }

  const storedRealtimeSessionConfig = await getRealtimeVoiceSessionConfig(
    params.realtimeSessionId
  );
  const fallbackInstructions = await buildRealtimeVoiceInstructions({
    userId: params.userId,
    runtimeCompactState,
  });
  const nextInstructions = upsertRealtimeVoiceRuntimeCompactInstructions({
    instructions:
      storedRealtimeSessionConfig?.sessionConfig.instructions ||
      fallbackInstructions,
    runtimeCompactState,
  });

  if (storedRealtimeSessionConfig?.sessionConfig) {
    await saveRealtimeVoiceSessionConfig({
      sessionId: params.realtimeSessionId,
      sessionConfig: {
        ...storedRealtimeSessionConfig.sessionConfig,
        instructions: nextInstructions,
      },
    });
  }

  console.info('[RealtimeVoice] Runtime compaction prepared', {
    realtimeSessionId: params.realtimeSessionId,
    therapySessionId: params.therapySessionId,
    userId: params.userId,
    reason,
    chainTurnCountBeforeReset: state?.chainTurnCount ?? 0,
    inputTokens: params.inputTokens,
  });

  return {
    reason,
    instructions: nextInstructions,
  };
}

async function closeRealtimeVoiceSessionInternal(params: {
  tx: any;
  session: RealtimeVoiceSessionRecord;
  reason: RealtimeVoiceSessionEndReason;
  now?: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const endedAt = resolveRealtimeVoiceEndTime({
    session: params.session,
    now: params.now,
  });
  const durationSeconds = calculateDurationSeconds(
    params.session.startedAt,
    endedAt
  );
  const status = resolveSessionStatusByReason(params.reason);

  await params.tx
    .update(realtimeVoiceSessions)
    .set({
      status,
      endReason: params.reason,
      endedAt,
      durationSeconds,
      errorCode: params.errorCode ?? params.session.errorCode ?? null,
      errorMessage: params.errorMessage ?? params.session.errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(realtimeVoiceSessions.id, params.session.id));

  await endTherapySessionWithOptions(
    params.session.therapySessionId,
    params.tx,
    {
      endedAt,
    }
  );

  return {
    ...params.session,
    status,
    endReason: params.reason,
    endedAt,
    durationSeconds,
  };
}

async function findActiveRealtimeVoiceSessions(userId: number, tx?: any) {
  const client = tx ?? db;

  return await client
    .select()
    .from(realtimeVoiceSessions)
    .where(
      and(
        eq(realtimeVoiceSessions.userId, userId),
        isNull(realtimeVoiceSessions.endedAt)
      )
    )
    .orderBy(desc(realtimeVoiceSessions.startedAt));
}

async function touchTherapySessionActivity(
  therapySessionId: number,
  at: Date,
  tx?: any
) {
  const client = tx ?? db;

  await client
    .update(therapySessions)
    .set({
      lastActivityAt: at,
      updatedAt: at,
    })
    .where(eq(therapySessions.id, therapySessionId));
}

function buildQuotaPayload(
  quota: Awaited<ReturnType<typeof getRealtimeVoiceQuotaSnapshot>>
) {
  return {
    limitSeconds: quota.limitSeconds,
    usedSeconds: quota.usedSeconds,
    remainingSeconds: quota.remainingSeconds,
    resetsAt: quota.resetsAt.toISOString(),
  };
}

function buildWeeklyQuotaPayload(
  weeklyAi:
    | Awaited<ReturnType<typeof assertRealtimeVoiceAccess>>['weeklyAi']
    | Awaited<ReturnType<typeof getAiUsageGate>>
) {
  return {
    weeklyLimitMinutes: weeklyAi.weeklyLimit,
    usedMinutes: weeklyAi.usedMinutes,
    availableMinutes: weeklyAi.availableMinutes,
    nextResetAt: weeklyAi.nextResetAt,
  };
}

async function createOrReuseRealtimeVoiceSession(params: {
  userId: number;
  userRole?: string;
  body: RealtimeVoiceSessionStartRequest;
  clientPlatform: 'web' | 'ios' | 'android';
}) {
  const access = await assertRealtimeVoiceAccess({
    userId: params.userId,
    userRole: params.userRole,
  });
  const now = new Date();
  const requestedChatSessionId = sanitizeChatSessionId(
    params.body.chatSessionId
  );

  const sessionResult = await db.transaction(async (tx) => {
    const activeSessions = await findActiveRealtimeVoiceSessions(
      params.userId,
      tx
    );
    const [primarySession, ...staleSessions] = activeSessions;
    const closedTherapySessionIds: number[] = [];

    for (const staleSession of staleSessions) {
      await closeRealtimeVoiceSessionInternal({
        tx,
        session: staleSession,
        reason: 'replaced_by_new_session',
        now,
      });
      closedTherapySessionIds.push(staleSession.therapySessionId);
    }

    if (primarySession) {
      const isStale = isRealtimeVoiceSessionStale({
        startedAt: primarySession.startedAt,
        lastActivityAt: primarySession.lastActivityAt,
        now,
        idleTimeoutSeconds: REALTIME_VOICE_IDLE_TIMEOUT_SECONDS,
        hardCeilingSeconds: REALTIME_VOICE_HARD_CEILING_SECONDS,
        staleGraceSeconds: REALTIME_VOICE_STALE_GRACE_SECONDS,
      });

      const sameChatSession =
        requestedChatSessionId !== null &&
        primarySession.chatSessionId === requestedChatSessionId;

      if (sameChatSession && !isStale) {
        await tx
          .update(realtimeVoiceSessions)
          .set({
            status: 'active',
            lastActivityAt: now,
            clientPlatform: params.clientPlatform,
            updatedAt: now,
          })
          .where(eq(realtimeVoiceSessions.id, primarySession.id));
        await touchTherapySessionActivity(
          primarySession.therapySessionId,
          now,
          tx
        );

        return {
          createdNew: false,
          closedTherapySessionIds,
          session: {
            ...primarySession,
            status: 'active',
            lastActivityAt: now,
            clientPlatform: params.clientPlatform,
          } satisfies RealtimeVoiceSessionRecord,
        };
      }

      await closeRealtimeVoiceSessionInternal({
        tx,
        session: primarySession,
        reason: 'replaced_by_new_session',
        now,
      });
      closedTherapySessionIds.push(primarySession.therapySessionId);
    }

    const therapySession = await startTherapySession(params.userId, tx, {
      clientSessionId: requestedChatSessionId,
    });
    const [session] = await tx
      .insert(realtimeVoiceSessions)
      .values({
        id: buildSessionId(),
        userId: params.userId,
        therapySessionId: therapySession.id,
        chatSessionId: requestedChatSessionId,
        status: 'created',
        provider: 'openai',
        providerModel: '',
        providerVoice: '',
        startedAt: now,
        lastActivityAt: now,
        durationSeconds: 0,
        quotaPeriodKey: access.quota.periodKey,
        clientPlatform: params.clientPlatform,
      })
      .returning();

    return {
      createdNew: true,
      closedTherapySessionIds,
      session,
    };
  });

  return {
    access,
    now,
    ...sessionResult,
  };
}

export async function startRealtimeVoiceSession(params: {
  userId: number;
  userRole?: string;
  body: RealtimeVoiceSessionStartRequest;
  clientPlatform: 'web' | 'ios' | 'android';
}) {
  const prepared = await createOrReuseRealtimeVoiceSession(params);

  for (const closedTherapySessionId of prepared.closedTherapySessionIds || []) {
    try {
      await handleTherapySessionEnded({
        therapySessionId: closedTherapySessionId,
        userId: params.userId,
      });
    } catch (error) {
      console.error(
        '[RealtimeVoice] Failed to trigger handoff for replaced session:',
        {
          therapySessionId: closedTherapySessionId,
          userId: params.userId,
          error,
        }
      );
    }
  }

  try {
    const assistantPersona = await getUserAssistantPersona(params.userId);
    const instructions = await buildRealtimeVoiceInstructions({
      userId: params.userId,
      entryContext:
        (params.body.entryContext as ChatEntryContext | null) || null,
    });
    const provider = {
      clientSecret: null,
      expiresAt: new Date(
        prepared.now.getTime() + REALTIME_VOICE_HARD_CEILING_SECONDS * 1000
      ),
      webrtcUrl: REALTIME_VOICE_WEBRTC_URL,
      model: REALTIME_VOICE_OPENAI_MODEL,
      voice: assistantPersona.voice || REALTIME_VOICE_OPENAI_VOICE,
    };

    const persistedSession = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(realtimeVoiceSessions)
        .set({
          status: 'active',
          providerModel: provider.model,
          providerVoice: provider.voice,
          lastActivityAt: prepared.now,
          updatedAt: prepared.now,
        })
        .where(eq(realtimeVoiceSessions.id, prepared.session.id))
        .returning();

      if (!updated) {
        throw new Error('Realtime voice session was not persisted');
      }

      await touchTherapySessionActivity(
        updated.therapySessionId,
        prepared.now,
        tx
      );

      return updated;
    });

    const refreshedQuota = await getRealtimeVoiceQuotaSnapshot({
      userId: params.userId,
      now: prepared.now,
    });
    const remainingByQuota = resolveRealtimeVoiceMaxDurationSeconds({
      remainingMonthlySeconds: refreshedQuota.remainingSeconds,
      remainingWeeklyMinutes: prepared.access.weeklyAi.availableMinutes,
    });
    const remainingBySession = resolveRemainingHardCeilingSeconds(
      persistedSession.startedAt,
      prepared.now
    );
    const maxDurationSeconds = Math.max(
      0,
      Math.min(remainingByQuota, remainingBySession)
    );

    await saveRealtimeVoiceSessionConfig({
      sessionId: persistedSession.id,
      sessionConfig: buildOpenAiRealtimeSessionConfig({
        instructions,
        voice: provider.voice,
      }),
      maxDurationSeconds,
    });

    return {
      session: {
        id: persistedSession.id,
        therapySessionId: persistedSession.therapySessionId,
        status: persistedSession.status as
          | 'created'
          | 'active'
          | 'completed'
          | 'failed',
        model: provider.model,
        voice: provider.voice,
        maxDurationSeconds,
        idleTimeoutSeconds: REALTIME_VOICE_IDLE_TIMEOUT_SECONDS,
        clientPlatform: persistedSession.clientPlatform as
          | 'web'
          | 'ios'
          | 'android',
      },
      openai: {
        clientSecret: provider.clientSecret,
        expiresAt: provider.expiresAt.toISOString(),
        webrtcUrl: provider.webrtcUrl,
      },
      quota: buildQuotaPayload(refreshedQuota),
      weeklyAi: buildWeeklyQuotaPayload(prepared.access.weeklyAi),
    };
  } catch (error: any) {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(realtimeVoiceSessions)
        .where(eq(realtimeVoiceSessions.id, prepared.session.id))
        .limit(1);
      const current = rows[0];
      if (!current || current.endedAt) {
        return;
      }

      await closeRealtimeVoiceSessionInternal({
        tx,
        session: current,
        reason: 'provider_error',
        now: prepared.now,
        errorCode: error?.data?.code || 'realtime_provider_init_failed',
        errorMessage:
          error?.statusMessage || error?.message || 'Provider init failed',
      });
    });

    throw error;
  }
}

export async function assertRealtimeVoiceSessionCanHandshake(params: {
  userId: number;
  sessionId: string;
}) {
  const sessionId = String(params.sessionId || '').trim();
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Realtime voice session id is required',
    });
  }

  const [session] = await db
    .select()
    .from(realtimeVoiceSessions)
    .where(eq(realtimeVoiceSessions.id, sessionId))
    .limit(1);

  if (!session || session.userId !== params.userId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Realtime voice session not found',
    });
  }

  if (session.endedAt) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Realtime voice session is already closed',
    });
  }

  return session;
}

export async function recordRealtimeVoiceSessionEvent(params: {
  userId: number;
  body: RealtimeVoiceSessionEventRequest;
}) {
  const occurredAt = new Date(params.body.at);
  const shouldPersistTranscript =
    params.body.type === 'user_turn_completed' ||
    params.body.type === 'response_completed';
  const enableMemory = shouldPersistTranscript
    ? await isChatMemoryEnabledForUser(params.userId)
    : false;
  const persistedEvent = await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(realtimeVoiceSessions)
      .where(eq(realtimeVoiceSessions.id, params.body.sessionId))
      .limit(1);

    if (!session || session.userId !== params.userId) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Realtime voice session not found',
      });
    }

    const [existingEvent] = await tx
      .select({
        id: realtimeVoiceSessionEvents.id,
      })
      .from(realtimeVoiceSessionEvents)
      .where(
        and(
          eq(realtimeVoiceSessionEvents.sessionId, params.body.sessionId),
          eq(realtimeVoiceSessionEvents.eventId, params.body.eventId)
        )
      )
      .limit(1);

    if (existingEvent) {
      return {
        ok: true as const,
        deduplicated: true,
        runtimeCompactionCandidate: null,
      };
    }

    await tx.insert(realtimeVoiceSessionEvents).values({
      sessionId: params.body.sessionId,
      eventId: params.body.eventId,
      type: params.body.type,
      occurredAt,
      payloadJson: {
        metrics: params.body.metrics || null,
        error: params.body.error || null,
        meta: params.body.meta || null,
      },
    });

    const metrics = params.body.metrics || {};
    const assistantTurnsDelta =
      params.body.type === 'response_completed' ? 1 : 0;
    const userTurnsDelta = params.body.type === 'user_turn_completed' ? 1 : 0;
    const interruptDelta = params.body.type === 'interrupted' ? 1 : 0;
    const nextStatus =
      params.body.type === 'started' || params.body.type === 'response_started'
        ? 'active'
        : session.status;
    const transcriptTurnIndex = resolveTranscriptTurnIndex(session);

    await tx
      .update(realtimeVoiceSessions)
      .set({
        status: nextStatus,
        lastActivityAt: occurredAt,
        assistantTurnsCount: sql`${realtimeVoiceSessions.assistantTurnsCount} + ${assistantTurnsDelta}`,
        userTurnsCount: sql`${realtimeVoiceSessions.userTurnsCount} + ${userTurnsDelta}`,
        interruptCount: sql`${realtimeVoiceSessions.interruptCount} + ${interruptDelta}`,
        inputAudioSeconds: sql`${realtimeVoiceSessions.inputAudioSeconds} + ${metrics.inputAudioSecondsDelta || 0}`,
        outputAudioSeconds: sql`${realtimeVoiceSessions.outputAudioSeconds} + ${metrics.outputAudioSecondsDelta || 0}`,
        inputAudioTokens: sql`${realtimeVoiceSessions.inputAudioTokens} + ${metrics.inputAudioTokensDelta || 0}`,
        outputAudioTokens: sql`${realtimeVoiceSessions.outputAudioTokens} + ${metrics.outputAudioTokensDelta || 0}`,
        errorCode:
          params.body.type === 'failed'
            ? (params.body.error?.code ?? session.errorCode ?? null)
            : session.errorCode,
        errorMessage:
          params.body.type === 'failed'
            ? (params.body.error?.message ?? session.errorMessage ?? null)
            : session.errorMessage,
        updatedAt: occurredAt,
      })
      .where(eq(realtimeVoiceSessions.id, params.body.sessionId));

    await touchTherapySessionActivity(session.therapySessionId, occurredAt, tx);

    const meta = isRecord(params.body.meta) ? params.body.meta : {};
    const usage = isRecord(meta.usage) ? meta.usage : {};
    const inputTokens = normalizeUsageNumber(usage.inputTokens);
    const outputTokens = normalizeUsageNumber(usage.outputTokens);
    const totalTokens = normalizeUsageNumber(usage.totalTokens);

    if (params.body.type === 'response_completed') {
      console.info('[RealtimeVoice usage]', {
        userId: params.userId,
        sessionId: params.body.sessionId,
        responseId: typeof meta.responseId === 'string' ? meta.responseId : '',
        status: typeof meta.status === 'string' ? meta.status : 'completed',
        inputTokens,
        outputTokens,
        totalTokens,
        cachedTokens: normalizeUsageNumber(usage.cachedTokens) ?? 0,
        reasoningTokens: normalizeUsageNumber(usage.reasoningTokens) ?? 0,
        inputAudioTokensDelta: metrics.inputAudioTokensDelta || 0,
        outputAudioTokensDelta: metrics.outputAudioTokensDelta || 0,
        inputAudioSecondsDelta: metrics.inputAudioSecondsDelta || 0,
        outputAudioSecondsDelta: metrics.outputAudioSecondsDelta || 0,
      });
    }

    if (enableMemory) {
      const transcriptMessages: Array<{
        role: 'user' | 'assistant';
        content: string;
      }> = [];

      if (params.body.type === 'user_turn_completed') {
        const transcript =
          typeof meta.transcript === 'string' ? meta.transcript.trim() : '';
        if (transcript) {
          transcriptMessages.push({
            role: 'user',
            content: transcript,
          });
        }
      }

      if (params.body.type === 'response_completed') {
        const assistantText =
          typeof meta.assistantText === 'string'
            ? meta.assistantText.trim()
            : '';
        if (assistantText) {
          transcriptMessages.push({
            role: 'assistant',
            content: assistantText,
          });
        }
      }

      if (transcriptMessages.length > 0) {
        await appendTranscriptMessages(
          {
            therapySessionId: session.therapySessionId,
            userId: params.userId,
            turnIndex: transcriptTurnIndex,
            messages: transcriptMessages,
          },
          tx
        );
      }
    }

    return {
      ok: true as const,
      deduplicated: false,
      runtimeCompactionCandidate:
        enableMemory && params.body.type === 'response_completed'
          ? {
              therapySessionId: session.therapySessionId,
              model: session.providerModel || REALTIME_VOICE_OPENAI_MODEL,
              inputTokens,
              outputTokens,
              totalTokens,
            }
          : null,
    };
  });

  if (
    persistedEvent.deduplicated ||
    !persistedEvent.runtimeCompactionCandidate
  ) {
    return {
      ok: true as const,
      deduplicated: persistedEvent.deduplicated,
    };
  }

  const runtimeCompaction = await maybeBuildRealtimeVoiceRuntimeCompaction({
    realtimeSessionId: params.body.sessionId,
    userId: params.userId,
    ...persistedEvent.runtimeCompactionCandidate,
  });

  return {
    ok: true as const,
    deduplicated: false,
    ...(runtimeCompaction ? { runtimeCompaction } : {}),
  };
}

export async function endRealtimeVoiceSession(params: {
  userId: number;
  sessionId: string;
  reason: RealtimeVoiceSessionEndReason;
  skipPostEndMemoryLifecycle?: boolean;
}) {
  const now = new Date();

  const endedSession = await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(realtimeVoiceSessions)
      .where(eq(realtimeVoiceSessions.id, params.sessionId))
      .limit(1);

    if (!session || session.userId !== params.userId) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Realtime voice session not found',
      });
    }

    if (session.endedAt) {
      return session;
    }

    return await closeRealtimeVoiceSessionInternal({
      tx,
      session,
      reason: params.reason,
      now,
    });
  });

  await deleteRealtimeVoiceSessionConfig(endedSession.id);

  console.info('[RealtimeVoice session summary]', {
    userId: params.userId,
    sessionId: endedSession.id,
    model: endedSession.providerModel,
    voice: endedSession.providerVoice,
    status: endedSession.status || 'completed',
    reason: params.reason,
    durationSeconds: endedSession.durationSeconds,
    userTurnsCount: endedSession.userTurnsCount,
    assistantTurnsCount: endedSession.assistantTurnsCount,
    interruptCount: endedSession.interruptCount,
    inputAudioSeconds: endedSession.inputAudioSeconds,
    outputAudioSeconds: endedSession.outputAudioSeconds,
    inputAudioTokens: endedSession.inputAudioTokens,
    outputAudioTokens: endedSession.outputAudioTokens,
  });

  const quota = await getRealtimeVoiceQuotaSnapshot({
    userId: params.userId,
    now,
  });
  const weeklyAi = await getAiUsageGate(params.userId);

  if (params.skipPostEndMemoryLifecycle !== true) {
    try {
      await handleTherapySessionEnded({
        therapySessionId: endedSession.therapySessionId,
        userId: params.userId,
      });
    } catch (error) {
      console.error(
        '[RealtimeVoice] Failed to trigger post-end session memory pipeline:',
        error
      );
    }
  }

  return {
    session: {
      id: endedSession.id,
      status: (endedSession.status || 'completed') as
        | 'created'
        | 'active'
        | 'completed'
        | 'failed',
      durationSeconds: endedSession.durationSeconds,
      interruptCount: endedSession.interruptCount,
      inputAudioSeconds: endedSession.inputAudioSeconds,
      outputAudioSeconds: endedSession.outputAudioSeconds,
    },
    quota: buildQuotaPayload(quota),
    weeklyAi: buildWeeklyQuotaPayload(weeklyAi),
  };
}
