import { and, asc, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { telegramAlertDeliveries } from '@/server/infrastructure/db/schema';

const DEFAULT_TELEGRAM_ALERT_DELIVERIES_RETENTION_DAYS = 30;
const DEFAULT_TELEGRAM_ALERT_DELIVERIES_CLEANUP_BATCH_SIZE = 1000;
const TERMINAL_TELEGRAM_DELIVERY_STATUSES = ['sent', 'failed'] as const;

export async function cleanupTelegramAlertDeliveries(params?: {
  retentionDays?: number;
  batchSize?: number;
}) {
  const retentionDays = Math.max(
    1,
    Math.floor(
      params?.retentionDays ?? DEFAULT_TELEGRAM_ALERT_DELIVERIES_RETENTION_DAYS
    )
  );
  const batchSize = Math.max(
    1,
    Math.floor(
      params?.batchSize ?? DEFAULT_TELEGRAM_ALERT_DELIVERIES_CLEANUP_BATCH_SIZE
    )
  );

  // Чистим только terminal-статусы, чтобы не удалить живые queued/processing записи.
  const expiredRows = await db
    .select({ id: telegramAlertDeliveries.id })
    .from(telegramAlertDeliveries)
    .where(
      and(
        inArray(telegramAlertDeliveries.status, [
          ...TERMINAL_TELEGRAM_DELIVERY_STATUSES,
        ]),
        sql`coalesce(${telegramAlertDeliveries.sentAt}, ${telegramAlertDeliveries.updatedAt}, ${telegramAlertDeliveries.createdAt}) < now() - make_interval(days => ${retentionDays})`
      )
    )
    .orderBy(asc(telegramAlertDeliveries.id))
    .limit(batchSize);

  if (expiredRows.length === 0) {
    return {
      cleaned: 0,
      retentionDays,
      batchSize,
    };
  }

  const deletedRows = await db
    .delete(telegramAlertDeliveries)
    .where(
      inArray(
        telegramAlertDeliveries.id,
        expiredRows.map((row) => row.id)
      )
    )
    .returning({ id: telegramAlertDeliveries.id });

  return {
    cleaned: deletedRows.length,
    retentionDays,
    batchSize,
  };
}
