import { db } from '@/server/infrastructure/db/client';
import { idempotencyKeys } from '@/server/infrastructure/db/schema';
import { and, eq, gt, lt } from 'drizzle-orm';
import crypto from 'node:crypto';

export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

export type IdempotencyStartResult<T> =
  | { kind: 'hit'; response: T }
  | { kind: 'locked'; recordId: number }
  | { kind: 'conflict' }
  | { kind: 'in_progress' };

function hashResponseJson(payload: unknown): string {
  const json = JSON.stringify(payload);
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Пытается:
 * 1) вернуть сохранённый ответ (hit),
 * 2) или "забронировать" ключ (locked),
 * 3) или сказать, что запрос с таким ключом уже выполняется (in_progress).
 *
 * Важно: перед бронированием удаляем просроченную запись с тем же (userId+route+key),
 * иначе уникальный индекс будет блокировать повторное использование ключа после TTL.
 */
export async function startIdempotentRequest<T>(params: {
  userId: number;
  route: string;
  key: string;
  requestHash?: string;
  ttlMs?: number;
}): Promise<IdempotencyStartResult<T>> {
  const now = new Date();
  const ttlMs = params.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttlMs);

  // Чистим просроченную запись по этому же ключу (если есть)
  await db
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, params.userId),
        eq(idempotencyKeys.route, params.route),
        eq(idempotencyKeys.key, params.key),
        lt(idempotencyKeys.expiresAt, now)
      )
    );

  // Если есть актуальная запись — возвращаем её
  const existing = await db
    .select({
      id: idempotencyKeys.id,
      requestHash: idempotencyKeys.requestHash,
      responseJson: idempotencyKeys.responseJson,
    })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, params.userId),
        eq(idempotencyKeys.route, params.route),
        eq(idempotencyKeys.key, params.key),
        gt(idempotencyKeys.expiresAt, now)
      )
    )
    .limit(1);

  if (existing.length) {
    const row = existing[0];
    if (!row) {
      return { kind: 'in_progress' };
    }

    if (
      params.requestHash &&
      row.requestHash &&
      row.requestHash !== params.requestHash
    ) {
      return { kind: 'conflict' };
    }
    if (row.responseJson) {
      return { kind: 'hit', response: row.responseJson as T };
    }
    return { kind: 'in_progress' };
  }

  // Пробуем забронировать ключ (создаём запись без responseJson)
  const inserted = await db
    .insert(idempotencyKeys)
    .values({
      userId: params.userId,
      route: params.route,
      key: params.key,
      expiresAt,
      requestHash: params.requestHash ?? '',
      responseHash: null,
      responseJson: null,
    })
    .onConflictDoNothing({
      target: [
        idempotencyKeys.userId,
        idempotencyKeys.route,
        idempotencyKeys.key,
      ],
    })
    .returning({ id: idempotencyKeys.id });

  if (inserted.length) {
    const insertedRow = inserted[0];
    if (insertedRow) {
      return { kind: 'locked', recordId: insertedRow.id };
    }
  }

  // Кто-то успел вставить параллельно — читаем и возвращаем
  const raced = await db
    .select({
      requestHash: idempotencyKeys.requestHash,
      responseJson: idempotencyKeys.responseJson,
    })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, params.userId),
        eq(idempotencyKeys.route, params.route),
        eq(idempotencyKeys.key, params.key),
        gt(idempotencyKeys.expiresAt, now)
      )
    )
    .limit(1);

  const racedRow = raced[0];
  if (racedRow) {
    if (
      params.requestHash &&
      racedRow.requestHash &&
      racedRow.requestHash !== params.requestHash
    ) {
      return { kind: 'conflict' };
    }

    if (racedRow.responseJson) {
      return { kind: 'hit', response: racedRow.responseJson as T };
    }
  }

  return { kind: 'in_progress' };
}

export async function finishIdempotentRequest(params: {
  recordId: number;
  response: unknown;
  tx?: any;
}): Promise<void> {
  const responseHash = hashResponseJson(params.response);
  const client = params.tx ?? db;
  await client
    .update(idempotencyKeys)
    .set({
      responseHash,
      responseJson: params.response as any,
    })
    .where(eq(idempotencyKeys.id, params.recordId));
}

export async function abortIdempotentRequest(params: {
  recordId: number;
  tx?: any;
}): Promise<void> {
  const client = params.tx ?? db;
  await client
    .delete(idempotencyKeys)
    .where(eq(idempotencyKeys.id, params.recordId));
}
