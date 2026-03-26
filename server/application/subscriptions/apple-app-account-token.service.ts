import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';

function normalizeUuid(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!text) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text
  )
    ? text
    : null;
}

export async function getOrCreateAppleAppAccountToken(
  userId: number
): Promise<string> {
  const existingRows = await db
    .select({
      appleAppAccountToken: users.appleAppAccountToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!existingRows.length) {
    throw new Error(`User ${userId} not found`);
  }

  const existingToken = normalizeUuid(existingRows[0]?.appleAppAccountToken);
  if (existingToken) {
    return existingToken;
  }

  const nextToken = crypto.randomUUID().toLowerCase();
  const now = new Date();
  const updatedRows = await db
    .update(users)
    .set({
      appleAppAccountToken: nextToken,
      updatedAt: now,
    })
    .where(and(eq(users.id, userId), isNull(users.appleAppAccountToken)))
    .returning({
      appleAppAccountToken: users.appleAppAccountToken,
    });

  const updatedToken = normalizeUuid(updatedRows[0]?.appleAppAccountToken);
  if (updatedToken) {
    return updatedToken;
  }

  const racedRows = await db
    .select({
      appleAppAccountToken: users.appleAppAccountToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const racedToken = normalizeUuid(racedRows[0]?.appleAppAccountToken);
  if (racedToken) {
    return racedToken;
  }

  throw new Error(
    `Failed to issue stable appleAppAccountToken for user ${userId}`
  );
}
