import { defineEventHandler, readBody } from 'h3';
import { requireRole } from '@/server/utils/require-role';
import { requeueStuckTelegramDeliveries } from '@/server/application/telegram/telegram-alerts.service';

/**
 * Переотправляет «застрявшие» Telegram-доставки (failed | uncertain),
 * которые не дошли из-за таймаутов. Только для админа.
 *
 * Body (опционально):
 *   { "limit": 100, "includeBilling": false }
 *
 * По умолчанию биллинговые алерты не трогаются (дубль по деньгам опаснее).
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  const body = await readBody(event).catch(() => ({}));
  const limitRaw = Number((body as { limit?: unknown })?.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100;
  const includeBilling = Boolean((body as { includeBilling?: unknown })?.includeBilling);

  const result = await requeueStuckTelegramDeliveries({ limit, includeBilling });

  return { ok: true, ...result };
});
