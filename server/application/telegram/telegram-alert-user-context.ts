import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '../../infrastructure/db/schema';

function normalizeNullableString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

function normalizeNullableUserId(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
}

export async function resolveTelegramAlertUserEmail(params: {
  userId?: number | null;
  userEmail?: string | null;
}): Promise<string | null> {
  // Для immediate delete email нужно передавать явно, потому что user уже удалён из БД.
  const explicitEmail = normalizeNullableString(params.userEmail);
  if (explicitEmail) {
    return explicitEmail;
  }

  const userId = normalizeNullableUserId(params.userId);
  if (!userId) {
    return null;
  }

  const userRows = await db
    .select({
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return normalizeNullableString(userRows[0]?.email);
}
