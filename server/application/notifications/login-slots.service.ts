import { findEnabledPreferencesByUser } from './repositories/notification-preferences.repository';
import { countActiveSlotsFromDate } from './repositories/notification-slots.repository';
import { needsSlotRegenerationInternal } from './needs-regeneration.service';
import { generateAllSlotsForUser } from './scheduler.service';

/**
 * Планирует проверку и регенерацию слотов после логина, не блокируя ответ API
 */
export function scheduleNotificationSlotsAfterLogin(userId: number): void {
  setImmediate(async () => {
    try {
      await ensureNotificationSlotsAfterLogin(userId);
    } catch (error) {
      console.error(
        `[Auth] Failed to ensure notification slots for user ${userId}:`,
        error
      );
    }
  });
}

/**
 * Проверяет наличие активных слотов и регенерирует при необходимости
 * - если слоты уже нужно регенерировать по правилам -> пересоздаём
 * - если активные настройки есть, но слотов нет -> пересоздаём
 */
async function ensureNotificationSlotsAfterLogin(
  userId: number
): Promise<void> {
  const activePrefs = await findEnabledPreferencesByUser(userId);
  if (activePrefs.length === 0) return;

  const decision = await needsSlotRegenerationInternal(userId);
  if (decision.shouldRegenerate) {
    await generateAllSlotsForUser(userId, {
      forceTodaySlots: true,
      reason: 'login',
    });
    return;
  }

  const activeSlotsCount = await countActiveSlotsFromDate(userId, new Date());
  if (activeSlotsCount === 0) {
    await generateAllSlotsForUser(userId, {
      forceTodaySlots: true,
      reason: 'login',
    });
  }
}
