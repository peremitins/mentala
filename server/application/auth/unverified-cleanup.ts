import { and, inArray, isNull, lt } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import {
  deleteRedisKey,
  getEmailPasswordKey,
  getEmailVerificationKey,
} from '@/server/application/auth/verification';
import { cleanupAuthArtifactsForUsers } from '@/server/application/auth/user-cleanup';

export async function cleanupUnverifiedUsers(
  olderThanHours: number = 24
): Promise<{ removed: number }> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  const candidates = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        isNull(users.emailVerifiedAt),
        isNull(users.passwordHash),
        lt(users.createdAt, cutoff)
      )
    );

  if (!candidates.length) return { removed: 0 };

  const ids = candidates.map((u) => u.id);
  await cleanupAuthArtifactsForUsers(ids);
  await db.delete(users).where(inArray(users.id, ids));

  await Promise.all(
    candidates
      .filter((u) => !!u.email)
      .flatMap((u) => [
        deleteRedisKey(getEmailVerificationKey(String(u.email))),
        deleteRedisKey(getEmailPasswordKey(String(u.email))),
      ])
  );

  return { removed: ids.length };
}
