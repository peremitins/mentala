import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { telegramAlertDeliveries } from '@/server/infrastructure/db/schema';
import type {
  TelegramAlertChannel,
  TelegramAlertEnvelope,
} from '@/server/application/telegram/telegram-alert.types';

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
