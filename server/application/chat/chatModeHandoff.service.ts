import { and, eq } from 'drizzle-orm';
import { createError } from 'h3';
import { config } from '@/server/config';
import { db } from '@/server/infrastructure/db/client';
import {
  realtimeVoiceSessions,
  therapySessions,
} from '@/server/infrastructure/db/schema';
import type {
  ChatModeHandoffRequest,
  ChatModeHandoffResponse,
} from '@/shared/dto';
import {
  buildAndPersistHandoffSummaryForTherapySession,
  cleanupTransientTherapySessionMemory,
  isChatMemoryEnabledForUser,
} from './chatMemory.service';
import { endTherapySessionWithOptions } from '../subscriptions/session-time.service';
import { endRealtimeVoiceSession } from '../realtime/realtime-voice-session.service';

async function handoffFromText(params: {
  userId: number;
  request: ChatModeHandoffRequest;
}): Promise<ChatModeHandoffResponse> {
  const therapySessionId = params.request.sourceTherapySessionId;
  if (typeof therapySessionId !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'sourceTherapySessionId is required for text handoff',
    });
  }

  const [session] = await db
    .select()
    .from(therapySessions)
    .where(
      and(
        eq(therapySessions.id, therapySessionId),
        eq(therapySessions.userId, params.userId)
      )
    )
    .limit(1);

  if (!session) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Therapy session not found',
    });
  }

  if (!session.endedAt) {
    await endTherapySessionWithOptions(therapySessionId, undefined, {
      skipPostEndMemoryLifecycle: true,
    });
  }

  const enableMemory = await isChatMemoryEnabledForUser(params.userId);
  const summaryResult = enableMemory
    ? await buildAndPersistHandoffSummaryForTherapySession({
        therapySessionId,
        userId: params.userId,
        model: config.llm.openai.defaultModel,
        saveFallbackEmptySummary: true,
        cleanupTransientMemory: true,
      })
    : null;

  if (!enableMemory) {
    await cleanupTransientTherapySessionMemory(therapySessionId, params.userId);
  }

  return {
    ok: true,
    sourceMode: params.request.sourceMode,
    targetMode: params.request.targetMode,
    sourceClosed: true,
    summaryCreated: summaryResult?.summaryCreated === true,
    sourceTherapySessionId: therapySessionId,
  };
}

async function handoffFromRealtimeVoice(params: {
  userId: number;
  request: ChatModeHandoffRequest;
}): Promise<ChatModeHandoffResponse> {
  const sourceRealtimeSessionId = String(
    params.request.sourceRealtimeSessionId || ''
  ).trim();
  if (!sourceRealtimeSessionId) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'sourceRealtimeSessionId is required for realtime voice handoff',
    });
  }

  const [session] = await db
    .select()
    .from(realtimeVoiceSessions)
    .where(
      and(
        eq(realtimeVoiceSessions.id, sourceRealtimeSessionId),
        eq(realtimeVoiceSessions.userId, params.userId)
      )
    )
    .limit(1);

  if (!session) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Realtime voice session not found',
    });
  }

  if (!session.endedAt) {
    await endRealtimeVoiceSession({
      userId: params.userId,
      sessionId: sourceRealtimeSessionId,
      reason: params.request.sourceRealtimeEndReason || 'user_stop',
      skipPostEndMemoryLifecycle: true,
    });
  }

  const enableMemory = await isChatMemoryEnabledForUser(params.userId);
  const summaryResult = enableMemory
    ? await buildAndPersistHandoffSummaryForTherapySession({
        therapySessionId: session.therapySessionId,
        userId: params.userId,
        model: config.llm.openai.defaultModel,
        saveFallbackEmptySummary: true,
        cleanupTransientMemory: true,
      })
    : null;

  if (!enableMemory) {
    await cleanupTransientTherapySessionMemory(session.therapySessionId, params.userId);
  }

  return {
    ok: true,
    sourceMode: params.request.sourceMode,
    targetMode: params.request.targetMode,
    sourceClosed: true,
    summaryCreated: summaryResult?.summaryCreated === true,
    sourceTherapySessionId: session.therapySessionId,
  };
}

export async function performChatModeHandoff(params: {
  userId: number;
  request: ChatModeHandoffRequest;
}): Promise<ChatModeHandoffResponse> {
  if (params.request.sourceMode === 'text') {
    return await handoffFromText(params);
  }

  return await handoffFromRealtimeVoice(params);
}
