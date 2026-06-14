import { and, eq, inArray, notLike } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { telegramAlertDeliveries } from '@/server/infrastructure/db/schema';
import type {
  TelegramAlertChannel,
  TelegramAlertEnvelope,
  TelegramAlertType,
  TelegramDeliveryStatus,
} from '@/server/application/telegram/telegram-alert.types';

export type RequeueableTelegramDelivery = {
  eventType: TelegramAlertType;
  dedupKey: string;
  source: string | null;
  payload: unknown;
  environment: string;
  eventCreatedAt: Date | null;
};

export async function createQueuedTelegramDelivery(params: {
  event: TelegramAlertEnvelope;
  targetChannel: TelegramAlertChannel;
}): Promise<boolean> {
  const inserted = await db
    .insert(telegramAlertDeliveries)
    .values({
      eventType: params.event.type,
      dedupKey: params.event.dedupKey,
      targetChannel: params.targetChannel,
      environment: params.event.environment,
      status: 'queued',
      source: params.event.source,
      payload: params.event.payload as any,
      eventCreatedAt: new Date(params.event.createdAt),
      attempt: 0,
    })
    .onConflictDoNothing({
      target: telegramAlertDeliveries.dedupKey,
    })
    .returning({ id: telegramAlertDeliveries.id });

  return inserted.length > 0;
}

/**
 * Находит «застрявшие» доставки, которые так и не дошли до Telegram
 * (status = failed | uncertain), чтобы переотправить их вручную.
 * Биллинговые алерты по умолчанию исключаем: для них дубль опасен.
 */
export async function findRequeueableTelegramDeliveries(params: {
  limit: number;
  statuses?: TelegramDeliveryStatus[];
  includeBilling?: boolean;
}): Promise<RequeueableTelegramDelivery[]> {
  const statuses = params.statuses ?? ['failed', 'uncertain'];

  const conditions = [inArray(telegramAlertDeliveries.status, statuses)];
  if (!params.includeBilling) {
    // Отсекаем billing.* — дубликат платёжного уведомления вводит в заблуждение.
    conditions.push(notLike(telegramAlertDeliveries.eventType, 'billing.%'));
  }

  const rows = await db
    .select({
      eventType: telegramAlertDeliveries.eventType,
      dedupKey: telegramAlertDeliveries.dedupKey,
      source: telegramAlertDeliveries.source,
      payload: telegramAlertDeliveries.payload,
      environment: telegramAlertDeliveries.environment,
      eventCreatedAt: telegramAlertDeliveries.eventCreatedAt,
    })
    .from(telegramAlertDeliveries)
    .where(and(...conditions))
    .orderBy(telegramAlertDeliveries.createdAt)
    .limit(Math.max(1, Math.min(params.limit, 500)));

  return rows.map((row) => ({
    eventType: row.eventType as TelegramAlertType,
    dedupKey: row.dedupKey,
    source: row.source,
    payload: row.payload,
    environment: row.environment,
    eventCreatedAt: row.eventCreatedAt,
  }));
}

/**
 * Сбрасывает доставку обратно в очередь (status = queued) для повторной отправки.
 * Reclaim делаем только из терминальных «недоставленных» статусов, чтобы не
 * затоптать запись, которую прямо сейчас обрабатывает воркер.
 */
export async function resetTelegramDeliveryToQueued(
  dedupKey: string
): Promise<void> {
  await db
    .update(telegramAlertDeliveries)
    .set({
      status: 'queued',
      attempt: 0,
      errorMessage: null,
      providerResponseCode: null,
      providerRetryAfterSeconds: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(telegramAlertDeliveries.dedupKey, dedupKey),
        inArray(telegramAlertDeliveries.status, ['failed', 'uncertain'])
      )
    );
}

export async function markTelegramDeliveryQueueFailure(params: {
  dedupKey: string;
  errorMessage: string;
}): Promise<void> {
  await db
    .update(telegramAlertDeliveries)
    .set({
      status: 'failed',
      errorMessage: params.errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(telegramAlertDeliveries.dedupKey, params.dedupKey));
}

export async function markTelegramDeliveryProcessing(params: {
  dedupKey: string;
  attempt: number;
}): Promise<void> {
  await db
    .update(telegramAlertDeliveries)
    .set({
      status: 'processing',
      attempt: params.attempt,
      errorMessage: null,
      providerResponseCode: null,
      providerRetryAfterSeconds: null,
      updatedAt: new Date(),
    })
    .where(eq(telegramAlertDeliveries.dedupKey, params.dedupKey));
}

export async function markTelegramDeliverySent(params: {
  dedupKey: string;
  attempt: number;
  providerResponseCode: number | null;
  telegramMessageId: string | null;
}): Promise<void> {
  await db
    .update(telegramAlertDeliveries)
    .set({
      status: 'sent',
      attempt: params.attempt,
      providerResponseCode: params.providerResponseCode,
      telegramMessageId: params.telegramMessageId,
      errorMessage: null,
      providerRetryAfterSeconds: null,
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(telegramAlertDeliveries.dedupKey, params.dedupKey));
}

export async function markTelegramDeliveryFailed(params: {
  dedupKey: string;
  attempt: number;
  errorMessage: string;
  providerResponseCode?: number | null;
  providerRetryAfterSeconds?: number | null;
}): Promise<void> {
  await db
    .update(telegramAlertDeliveries)
    .set({
      status: 'failed',
      attempt: params.attempt,
      errorMessage: params.errorMessage,
      providerResponseCode: params.providerResponseCode ?? null,
      providerRetryAfterSeconds: params.providerRetryAfterSeconds ?? null,
      updatedAt: new Date(),
    })
    .where(eq(telegramAlertDeliveries.dedupKey, params.dedupKey));
}

export async function markTelegramDeliveryUncertain(params: {
  dedupKey: string;
  attempt: number;
  errorMessage: string;
}): Promise<void> {
  await db
    .update(telegramAlertDeliveries)
    .set({
      status: 'uncertain',
      attempt: params.attempt,
      errorMessage: params.errorMessage,
      providerResponseCode: null,
      providerRetryAfterSeconds: null,
      updatedAt: new Date(),
    })
    .where(eq(telegramAlertDeliveries.dedupKey, params.dedupKey));
}
