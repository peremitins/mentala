import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../infrastructure/db/client';
import { sessionSummaries } from '../infrastructure/db/schema';
import { parseEncryptedJson, serializeEncryptedJson } from './securePayload';

export const HANDOFF_SUMMARY_SCHEMA_VERSION = 1;

type SaveHandoffSummaryParams = {
  userId: number | string;
  therapySessionId: number;
  model: string;
  summary: unknown;
  schemaVersion?: number;
};

type StoredSummaryRow = typeof sessionSummaries.$inferSelect;

function decodeSummaryRow<T>(row: StoredSummaryRow): T | null {
  try {
    if (!row.summaryCt) {
      return null;
    }

    return parseEncryptedJson<T>(row.summaryIv, row.summaryCt);
  } catch (error) {
    console.error('[summaryStore] Failed to decode summary row:', error);
    return null;
  }
}

export const summaryStore = {
  async saveHandoffSummary(params: SaveHandoffSummaryParams) {
    const schemaVersion =
      params.schemaVersion ?? HANDOFF_SUMMARY_SCHEMA_VERSION;
    const encrypted = serializeEncryptedJson(params.summary);
    const now = new Date();

    await db
      .insert(sessionSummaries)
      .values({
        userId: String(params.userId),
        sessionId: String(params.therapySessionId),
        therapySessionId: params.therapySessionId,
        model: params.model,
        summaryKind: 'handoff',
        schemaVersion,
        summaryIv: encrypted.iv,
        summaryCt: encrypted.ct,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sessionSummaries.therapySessionId,
        set: {
          userId: String(params.userId),
          sessionId: String(params.therapySessionId),
          model: params.model,
          summaryKind: 'handoff',
          schemaVersion,
          summaryIv: encrypted.iv,
          summaryCt: encrypted.ct,
          updatedAt: now,
        },
      });
  },

  async getLatestHandoffSummary<T>(userId: number | string): Promise<{
    summary: T;
    therapySessionId: number;
    schemaVersion: number;
  } | null> {
    const rows = await db
      .select()
      .from(sessionSummaries)
      .where(
        and(
          eq(sessionSummaries.userId, String(userId)),
          eq(sessionSummaries.summaryKind, 'handoff'),
          isNotNull(sessionSummaries.therapySessionId)
        )
      )
      .orderBy(desc(sessionSummaries.createdAt))
      .limit(1);

    const row = rows[0];
    if (!row || typeof row.therapySessionId !== 'number') {
      return null;
    }

    const summary = decodeSummaryRow<T>(row);
    if (!summary) {
      return null;
    }

    return {
      summary,
      therapySessionId: row.therapySessionId,
      schemaVersion: row.schemaVersion,
    };
  },

  async getHandoffSummaryByTherapySessionId<T>(
    therapySessionId: number,
    userId?: number | string
  ): Promise<{
    summary: T;
    therapySessionId: number;
    schemaVersion: number;
  } | null> {
    const rows = await db
      .select()
      .from(sessionSummaries)
      .where(
        userId !== undefined
          ? and(
              eq(sessionSummaries.therapySessionId, therapySessionId),
              eq(sessionSummaries.summaryKind, 'handoff'),
              eq(sessionSummaries.userId, String(userId))
            )
          : and(
              eq(sessionSummaries.therapySessionId, therapySessionId),
              eq(sessionSummaries.summaryKind, 'handoff')
            )
      )
      .limit(1);

    const row = rows[0];
    if (!row || typeof row.therapySessionId !== 'number') {
      return null;
    }

    const summary = decodeSummaryRow<T>(row);
    if (!summary) {
      return null;
    }

    return {
      summary,
      therapySessionId: row.therapySessionId,
      schemaVersion: row.schemaVersion,
    };
  },

  async hasHandoffSummary(userId: number | string): Promise<boolean> {
    const rows = await db
      .select({ id: sessionSummaries.id })
      .from(sessionSummaries)
      .where(
        and(
          eq(sessionSummaries.userId, String(userId)),
          eq(sessionSummaries.summaryKind, 'handoff'),
          isNotNull(sessionSummaries.therapySessionId)
        )
      )
      .limit(1);

    return rows.length > 0;
  },

  async deleteByTherapySessionId(therapySessionId: number, userId?: number | string): Promise<void> {
    await db
      .delete(sessionSummaries)
      .where(
        userId !== undefined
          ? and(
              eq(sessionSummaries.therapySessionId, therapySessionId),
              eq(sessionSummaries.userId, String(userId))
            )
          : eq(sessionSummaries.therapySessionId, therapySessionId)
      );
  },

  async deleteByUserId(userId: number | string): Promise<void> {
    await db
      .delete(sessionSummaries)
      .where(eq(sessionSummaries.userId, String(userId)));
  },
};
