import { eq } from 'drizzle-orm';
import { db } from '../infrastructure/db/client';
import { userMemoryProfiles } from '../infrastructure/db/schema';
import { serializeEncryptedJson } from './securePayload';
import { decodeStoredDurableUserMemoryPayload } from './durableUserMemoryPayload';

type SaveDurableUserMemoryParams = {
  userId: number;
  memory: unknown;
  schemaVersion?: number;
};

export const durableUserMemoryStore = {
  async save(params: SaveDurableUserMemoryParams) {
    const schemaVersion = params.schemaVersion ?? 1;
    const encrypted = serializeEncryptedJson(params.memory);
    const now = new Date();

    await db
      .insert(userMemoryProfiles)
      .values({
        userId: params.userId,
        schemaVersion,
        memoryIv: encrypted.iv,
        memoryCt: encrypted.ct,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userMemoryProfiles.userId,
        set: {
          schemaVersion,
          memoryIv: encrypted.iv,
          memoryCt: encrypted.ct,
          updatedAt: now,
        },
      });
  },

  async getByUserId<T>(userId: number): Promise<{
    memory: T;
    schemaVersion: number;
  } | null> {
    const rows = await db
      .select()
      .from(userMemoryProfiles)
      .where(eq(userMemoryProfiles.userId, userId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    const memory = decodeStoredDurableUserMemoryPayload<T>(row);
    if (!memory) {
      return null;
    }

    return {
      memory,
      schemaVersion: row.schemaVersion,
    };
  },

  async deleteByUserId(userId: number): Promise<void> {
    await db
      .delete(userMemoryProfiles)
      .where(eq(userMemoryProfiles.userId, userId));
  },
};
