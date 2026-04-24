import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../infrastructure/db/client';
import { therapySessionMessages } from '../infrastructure/db/schema';
import { decryptPayload, encryptPayload } from './securePayload';

export type TherapySessionTranscriptMessage = {
  id: number;
  therapySessionId: number;
  userId: number;
  turnIndex: number;
  role: 'user' | 'assistant';
  content: string;
  tokenCount: number | null;
  createdAt: Date;
};

function decodeMessage(
  row: typeof therapySessionMessages.$inferSelect
): TherapySessionTranscriptMessage | null {
  try {
    return {
      id: row.id,
      therapySessionId: row.therapySessionId,
      userId: row.userId,
      turnIndex: row.turnIndex,
      role: row.role as 'user' | 'assistant',
      content: decryptPayload(row.contentIv, row.contentCt),
      tokenCount: row.tokenCount ?? null,
      createdAt: row.createdAt,
    };
  } catch (error) {
    console.error(
      '[therapySessionTranscriptStore] Failed to decode transcript message:',
      error
    );
    return null;
  }
}

export const therapySessionTranscriptStore = {
  async appendMessage(
    params: {
      therapySessionId: number;
      userId: number;
      turnIndex: number;
      role: 'user' | 'assistant';
      content: string;
      tokenCount?: number | null;
    },
    tx?: any
  ): Promise<number> {
    const encrypted = encryptPayload(params.content);
    const client = tx ?? db;
    const [row] = await client
      .insert(therapySessionMessages)
      .values({
        therapySessionId: params.therapySessionId,
        userId: params.userId,
        turnIndex: params.turnIndex,
        role: params.role,
        contentIv: encrypted.iv,
        contentCt: encrypted.ct,
        tokenCount: params.tokenCount ?? null,
      })
      .returning({ id: therapySessionMessages.id });

    return row?.id ?? 0;
  },

  async getMessages(
    therapySessionId: number,
    userId?: number
  ): Promise<TherapySessionTranscriptMessage[]> {
    const rows = await db
      .select()
      .from(therapySessionMessages)
      .where(
        userId !== undefined
          ? and(
              eq(therapySessionMessages.therapySessionId, therapySessionId),
              eq(therapySessionMessages.userId, userId)
            )
          : eq(therapySessionMessages.therapySessionId, therapySessionId)
      )
      .orderBy(
        asc(therapySessionMessages.turnIndex),
        asc(therapySessionMessages.id)
      );

    return rows
      .map((row) => decodeMessage(row))
      .filter(
        (message): message is TherapySessionTranscriptMessage =>
          message !== null
      );
  },

  async getMessagesAfter(params: {
    therapySessionId: number;
    afterMessageId: number;
    userId?: number;
  }): Promise<TherapySessionTranscriptMessage[]> {
    const rows = await db
      .select()
      .from(therapySessionMessages)
      .where(
        params.userId !== undefined
          ? and(
              eq(
                therapySessionMessages.therapySessionId,
                params.therapySessionId
              ),
              gt(therapySessionMessages.id, params.afterMessageId),
              eq(therapySessionMessages.userId, params.userId)
            )
          : and(
              eq(
                therapySessionMessages.therapySessionId,
                params.therapySessionId
              ),
              gt(therapySessionMessages.id, params.afterMessageId)
            )
      )
      .orderBy(
        asc(therapySessionMessages.turnIndex),
        asc(therapySessionMessages.id)
      );

    return rows
      .map((row) => decodeMessage(row))
      .filter(
        (message): message is TherapySessionTranscriptMessage =>
          message !== null
      );
  },

  async replaceMessages(
    params: {
      therapySessionId: number;
      userId: number;
      messages: Array<{
        turnIndex: number;
        role: 'user' | 'assistant';
        content: string;
        tokenCount?: number | null;
      }>;
    },
    tx?: any
  ): Promise<void> {
    const client = tx ?? db;
    const normalizedMessages = params.messages
      .map((message) => ({
        ...message,
        content: String(message.content || '').trim(),
      }))
      .filter((message) => message.content.length > 0);

    await client
      .delete(therapySessionMessages)
      .where(
        and(
          eq(therapySessionMessages.therapySessionId, params.therapySessionId),
          eq(therapySessionMessages.userId, params.userId)
        )
      );

    if (!normalizedMessages.length) {
      return;
    }

    await client.insert(therapySessionMessages).values(
      normalizedMessages.map((message) => {
        const encrypted = encryptPayload(message.content);

        return {
          therapySessionId: params.therapySessionId,
          userId: params.userId,
          turnIndex: message.turnIndex,
          role: message.role,
          contentIv: encrypted.iv,
          contentCt: encrypted.ct,
          tokenCount: message.tokenCount ?? null,
        };
      })
    );
  },

  async getLastMessageId(therapySessionId: number): Promise<number | null> {
    const rows = await db
      .select({ id: therapySessionMessages.id })
      .from(therapySessionMessages)
      .where(eq(therapySessionMessages.therapySessionId, therapySessionId))
      .orderBy(asc(therapySessionMessages.id));

    if (!rows.length) {
      return null;
    }

    return rows[rows.length - 1]?.id ?? null;
  },

  async countUserMessages(
    therapySessionId: number,
    userId?: number
  ): Promise<number> {
    const rows = await db
      .select({ id: therapySessionMessages.id })
      .from(therapySessionMessages)
      .where(
        userId !== undefined
          ? and(
              eq(therapySessionMessages.therapySessionId, therapySessionId),
              eq(therapySessionMessages.role, 'user'),
              eq(therapySessionMessages.userId, userId)
            )
          : and(
              eq(therapySessionMessages.therapySessionId, therapySessionId),
              eq(therapySessionMessages.role, 'user')
            )
      );

    return rows.length;
  },

  async deleteByTherapySessionId(
    therapySessionId: number,
    userId?: number
  ): Promise<void> {
    await db
      .delete(therapySessionMessages)
      .where(
        userId !== undefined
          ? and(
              eq(therapySessionMessages.therapySessionId, therapySessionId),
              eq(therapySessionMessages.userId, userId)
            )
          : eq(therapySessionMessages.therapySessionId, therapySessionId)
      );
  },

  async deleteByTherapySessionIds(
    therapySessionIds: number[],
    userId?: number
  ): Promise<void> {
    const normalizedIds = Array.from(
      new Set(
        therapySessionIds.filter(
          (sessionId) => Number.isInteger(sessionId) && sessionId > 0
        )
      )
    );

    if (!normalizedIds.length) {
      return;
    }

    await db
      .delete(therapySessionMessages)
      .where(
        userId !== undefined
          ? and(
              inArray(therapySessionMessages.therapySessionId, normalizedIds),
              eq(therapySessionMessages.userId, userId)
            )
          : inArray(therapySessionMessages.therapySessionId, normalizedIds)
      );
  },

  async deleteByUserId(userId: number): Promise<void> {
    await db
      .delete(therapySessionMessages)
      .where(eq(therapySessionMessages.userId, userId));
  },
};
