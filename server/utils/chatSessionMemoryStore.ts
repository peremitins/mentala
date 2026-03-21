import { eq } from 'drizzle-orm';
import { db } from '../infrastructure/db/client';
import { chatSessionMemories } from '../infrastructure/db/schema';
import { parseEncryptedJson, serializeEncryptedJson } from './securePayload';

const RESPONSE_ID_TTL_MS = 24 * 60 * 60 * 1000;

export type SessionMemoryState<TCompactState = unknown> = {
  therapySessionId: number;
  userId: number;
  previousResponseId: string | null;
  previousResponseExpiresAt: Date | null;
  runtimeCompactState: TCompactState | null;
  runtimeCompactSchemaVersion: number | null;
  runtimeCompactCursorMessageId: number | null;
  chainTurnCount: number;
  pendingSoftCompaction: boolean;
  lastObservedInputTokens: number | null;
  lastObservedOutputTokens: number | null;
  lastObservedTotalTokens: number | null;
  lastObservedAt: Date | null;
  lastCompactedAt: Date | null;
};

function normalizeMemoryRow<TCompactState = unknown>(
  row: typeof chatSessionMemories.$inferSelect | undefined
): SessionMemoryState<TCompactState> | null {
  if (!row) {
    return null;
  }

  let runtimeCompactState: TCompactState | null = null;
  if (row.runtimeCompactIv && row.runtimeCompactCt) {
    try {
      runtimeCompactState = parseEncryptedJson<TCompactState>(
        row.runtimeCompactIv,
        row.runtimeCompactCt
      );
    } catch (error) {
      console.error(
        '[chatSessionMemoryStore] Failed to decode runtime compact state:',
        error
      );
    }
  }

  return {
    therapySessionId: row.therapySessionId,
    userId: row.userId,
    previousResponseId: row.previousResponseId ?? null,
    previousResponseExpiresAt: row.previousResponseExpiresAt ?? null,
    runtimeCompactState,
    runtimeCompactSchemaVersion: row.runtimeCompactSchemaVersion ?? null,
    runtimeCompactCursorMessageId: row.runtimeCompactCursorMessageId ?? null,
    chainTurnCount: row.chainTurnCount,
    pendingSoftCompaction: row.pendingSoftCompaction,
    lastObservedInputTokens: row.lastObservedInputTokens ?? null,
    lastObservedOutputTokens: row.lastObservedOutputTokens ?? null,
    lastObservedTotalTokens: row.lastObservedTotalTokens ?? null,
    lastObservedAt: row.lastObservedAt ?? null,
    lastCompactedAt: row.lastCompactedAt ?? null,
  };
}

export const chatSessionMemoryStore = {
  async get<TCompactState = unknown>(
    therapySessionId: number
  ): Promise<SessionMemoryState<TCompactState> | null> {
    const rows = await db
      .select()
      .from(chatSessionMemories)
      .where(eq(chatSessionMemories.therapySessionId, therapySessionId))
      .limit(1);

    return normalizeMemoryRow<TCompactState>(rows[0]);
  },

  async ensureSession(params: { therapySessionId: number; userId: number }) {
    const now = new Date();
    await db
      .insert(chatSessionMemories)
      .values({
        therapySessionId: params.therapySessionId,
        userId: params.userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  },

  async saveResponseId(params: {
    therapySessionId: number;
    userId: number;
    responseId: string;
    expiresAt?: Date;
  }) {
    const now = new Date();
    const expiresAt =
      params.expiresAt ?? new Date(now.getTime() + RESPONSE_ID_TTL_MS);

    await this.ensureSession(params);

    await db
      .update(chatSessionMemories)
      .set({
        previousResponseId: params.responseId,
        previousResponseExpiresAt: expiresAt,
        updatedAt: now,
      })
      .where(eq(chatSessionMemories.therapySessionId, params.therapySessionId));
  },

  async clearResponseId(therapySessionId: number) {
    await db
      .update(chatSessionMemories)
      .set({
        previousResponseId: null,
        previousResponseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(chatSessionMemories.therapySessionId, therapySessionId));
  },

  async saveRuntimeCompactState(params: {
    therapySessionId: number;
    userId: number;
    compactState: unknown;
    schemaVersion: number;
    cursorMessageId: number | null;
  }) {
    const now = new Date();
    const encrypted = serializeEncryptedJson(params.compactState);

    await this.ensureSession(params);

    await db
      .update(chatSessionMemories)
      .set({
        runtimeCompactSchemaVersion: params.schemaVersion,
        runtimeCompactIv: encrypted.iv,
        runtimeCompactCt: encrypted.ct,
        runtimeCompactCursorMessageId: params.cursorMessageId,
        previousResponseId: null,
        previousResponseExpiresAt: null,
        chainTurnCount: 0,
        pendingSoftCompaction: false,
        lastObservedInputTokens: null,
        lastObservedOutputTokens: null,
        lastObservedTotalTokens: null,
        lastObservedAt: null,
        lastCompactedAt: now,
        updatedAt: now,
      })
      .where(eq(chatSessionMemories.therapySessionId, params.therapySessionId));
  },

  async clearRuntimeCompactState(therapySessionId: number) {
    await db
      .update(chatSessionMemories)
      .set({
        runtimeCompactSchemaVersion: null,
        runtimeCompactIv: null,
        runtimeCompactCt: null,
        runtimeCompactCursorMessageId: null,
        updatedAt: new Date(),
      })
      .where(eq(chatSessionMemories.therapySessionId, therapySessionId));
  },

  async recordSuccessfulTurn(params: {
    therapySessionId: number;
    userId: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    pendingSoftCompaction: boolean;
  }) {
    const now = new Date();
    await this.ensureSession(params);

    const current = await this.get(params.therapySessionId);
    const nextChainTurnCount = (current?.chainTurnCount ?? 0) + 1;

    await db
      .update(chatSessionMemories)
      .set({
        chainTurnCount: nextChainTurnCount,
        pendingSoftCompaction: params.pendingSoftCompaction,
        lastObservedInputTokens: params.inputTokens,
        lastObservedOutputTokens: params.outputTokens,
        lastObservedTotalTokens: params.totalTokens,
        lastObservedAt: now,
        updatedAt: now,
      })
      .where(eq(chatSessionMemories.therapySessionId, params.therapySessionId));
  },

  async markPendingSoftCompaction(
    therapySessionId: number,
    pendingSoftCompaction: boolean
  ) {
    await db
      .update(chatSessionMemories)
      .set({
        pendingSoftCompaction,
        updatedAt: new Date(),
      })
      .where(eq(chatSessionMemories.therapySessionId, therapySessionId));
  },

  async clearSession(therapySessionId: number) {
    await db
      .delete(chatSessionMemories)
      .where(eq(chatSessionMemories.therapySessionId, therapySessionId));
  },

  async clearAllForUser(userId: number) {
    await db
      .delete(chatSessionMemories)
      .where(eq(chatSessionMemories.userId, userId));
  },

  isResponseIdValid(expiresAt: Date | null | undefined): boolean {
    return expiresAt instanceof Date && expiresAt.getTime() > Date.now();
  },

  async resetChainState(therapySessionId: number) {
    await db
      .update(chatSessionMemories)
      .set({
        previousResponseId: null,
        previousResponseExpiresAt: null,
        chainTurnCount: 0,
        pendingSoftCompaction: false,
        lastObservedInputTokens: null,
        lastObservedOutputTokens: null,
        lastObservedTotalTokens: null,
        lastObservedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(chatSessionMemories.therapySessionId, therapySessionId));
  },

  async clearAllByTherapySessionIds(sessionIds: number[]) {
    if (!sessionIds.length) {
      return;
    }

    for (const therapySessionId of sessionIds) {
      await this.clearSession(therapySessionId);
    }
  },

  async getActiveSessionIdsForUser(userId: number): Promise<number[]> {
    const rows = await db
      .select({ therapySessionId: chatSessionMemories.therapySessionId })
      .from(chatSessionMemories)
      .where(eq(chatSessionMemories.userId, userId));

    return rows.map((row) => row.therapySessionId);
  },

  async replaceSessionState(params: {
    therapySessionId: number;
    userId: number;
    previousResponseId: string | null;
    previousResponseExpiresAt?: Date | null;
    runtimeCompactState?: unknown | null;
    runtimeCompactSchemaVersion?: number | null;
    runtimeCompactCursorMessageId?: number | null;
    chainTurnCount?: number;
    pendingSoftCompaction?: boolean;
    lastObservedInputTokens?: number | null;
    lastObservedOutputTokens?: number | null;
    lastObservedTotalTokens?: number | null;
  }) {
    const now = new Date();
    await this.ensureSession(params);

    const encryptedRuntimeState =
      params.runtimeCompactState === undefined
        ? null
        : params.runtimeCompactState === null
          ? { iv: null, ct: null }
          : serializeEncryptedJson(params.runtimeCompactState);

    await db
      .update(chatSessionMemories)
      .set({
        previousResponseId: params.previousResponseId,
        previousResponseExpiresAt: params.previousResponseExpiresAt ?? null,
        runtimeCompactSchemaVersion:
          params.runtimeCompactState === undefined
            ? undefined
            : (params.runtimeCompactSchemaVersion ?? null),
        runtimeCompactIv:
          params.runtimeCompactState === undefined
            ? undefined
            : (encryptedRuntimeState?.iv ?? null),
        runtimeCompactCt:
          params.runtimeCompactState === undefined
            ? undefined
            : (encryptedRuntimeState?.ct ?? null),
        runtimeCompactCursorMessageId:
          params.runtimeCompactState === undefined
            ? undefined
            : (params.runtimeCompactCursorMessageId ?? null),
        chainTurnCount: params.chainTurnCount ?? 0,
        pendingSoftCompaction: params.pendingSoftCompaction ?? false,
        lastObservedInputTokens: params.lastObservedInputTokens ?? null,
        lastObservedOutputTokens: params.lastObservedOutputTokens ?? null,
        lastObservedTotalTokens: params.lastObservedTotalTokens ?? null,
        updatedAt: now,
      })
      .where(eq(chatSessionMemories.therapySessionId, params.therapySessionId));
  },
};
