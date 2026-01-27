import { db } from '@/server/infrastructure/db/client';
import {
  oauthAccounts,
  sessions,
  telegramAccounts,
} from '@/server/infrastructure/db/schema';
import { inArray } from 'drizzle-orm';

export async function cleanupAuthArtifactsForUsers(
  userIds: number[]
): Promise<void> {
  if (!userIds.length) return;

  await Promise.all([
    db.delete(sessions).where(inArray(sessions.userId, userIds)),
    db.delete(oauthAccounts).where(inArray(oauthAccounts.userId, userIds)),
    db.delete(telegramAccounts).where(inArray(telegramAccounts.userId, userIds)),
  ]);
}
