/**
 * Сервис планировщика уведомлений
 * Генерирует слоты на 1 день вперёд с глобальной оркестрацией
 *
 * Использует BullMQ для постановки задач генерации слотов в очередь
 * (см. server/application/notifications/schedulers/notificationSlots.scheduler.ts)
 */

import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import type { NotificationKind } from '@/shared/dto/notifications';
import { preventSimultaneousNotifications } from '@/server/application/notifications/prevent-overlap.service';
import { regenerateSlotsForSourceInternal } from './regenerate-slots.service';
import { needsSlotRegenerationInternal } from './needs-regeneration.service';
import { findEnabledPreferencesByUser } from './repositories/notification-preferences.repository';

// ==========================================
// Конфигурация планировщика
// ==========================================

// Флаг для детального логирования (можно включить через DEBUG_NOTIFICATIONS=true)
const DEBUG_NOTIFICATIONS = process.env.DEBUG_NOTIFICATIONS === 'true';

// Защита от одновременных вызовов regenerateSlotsForSource для одного источника
// Ключ: `${userId}:${kind}:${entityKey || 'null'}`
// Значение: Promise<void> - промис выполняющейся операции
const activeRegenerations = new Map<string, Promise<void>>();

/**
 * Получает ключ для отслеживания активных регенераций
 */
function getRegenerationKey(
  userId: number,
  kind: NotificationKind,
  entityKey?: string
): string {
  return `${userId}:${kind}:${entityKey || 'null'}`;
}

const SCHEDULE_CONFIG = {
  horizonDays: 1, // Генерируем слоты на 1 день вперёд
  awakeWindowStart: '09:00', // Начало окна бодрствования (локальное время)
  awakeWindowEnd: '22:30', // Конец окна бодрствования (локальное время)
  jitterMinutes: 15, // Джиттер ±15 минут
  maxDailyCap: 100, // Максимальный лимит уведомлений в день (защита)
  minGapMinutes: 25, // Минимальный шаг между уведомлениями
};

// ==========================================
// УДАЛЕНО: Функция inferHabitKey была костылем
// Теперь используем только универсальные шаблоны для habits
// ==========================================

// ==========================================
// Глобальная оркестрация слотов
// ==========================================

/**
 * Генерирует ВСЕ слоты для пользователя с глобальной оркестрацией
 * Распределяет уведомления равномерно по дню независимо от источника
 * @param userId - ID пользователя
 */
export async function generateAllSlotsForUser(userId: number): Promise<void> {
  console.log(`[Scheduler] Starting global orchestration for user ${userId}`);

  // 1. Получаем ВСЕ активные preferences пользователя через репозиторий
  const allPrefs = await findEnabledPreferencesByUser(userId);

  if (allPrefs.length === 0) {
    console.log(`[Scheduler] No active preferences for user ${userId}`);
    return;
  }

  // 2. Считаем общее количество уведомлений в день
  const totalPerDay = allPrefs.reduce((sum, p) => sum + p.timesPerDay, 0);

  console.log(
    `[Scheduler] User ${userId}: ${allPrefs.length} sources, ${totalPerDay} notifications/day`
  );

  // 3. Проверяем лимит
  if (totalPerDay > SCHEDULE_CONFIG.maxDailyCap) {
    throw new Error(
      `Too many notifications: ${totalPerDay} exceeds limit of ${SCHEDULE_CONFIG.maxDailyCap}`
    );
  }

  if (totalPerDay === 0) {
    console.log(`[Scheduler] User ${userId} has 0 notifications/day`);
    return;
  }

  // ВАЖНО: Вместо старой логики используем regenerateSlotsForSource для каждого источника
  // Это обеспечивает правильную поддержку AI-текстов и textSource
  // regenerateSlotsForSource сама удалит старые слоты и создаст новые с правильной логикой
  console.log(
    `[Scheduler] Using regenerateSlotsForSource for each source to support AI texts`
  );

  // Группируем preferences по источникам (kind + entityKey)
  const sourceMap = new Map<string, (typeof allPrefs)[0]>();
  for (const pref of allPrefs) {
    const sourceKey = `${pref.kind}:${pref.entityKey || 'null'}`;
    if (!sourceMap.has(sourceKey)) {
      sourceMap.set(sourceKey, pref);
    }
  }

  // Регенерируем слоты для каждого источника отдельно
  for (const pref of sourceMap.values()) {
    try {
      await regenerateSlotsForSource(userId, pref.kind as NotificationKind, {
        entityKey: pref.entityKey ?? undefined,
      });
    } catch (error) {
      console.error(
        `[Scheduler] Failed to regenerate slots for source: user ${userId}, kind: ${pref.kind}, entityKey: ${pref.entityKey || 'none'}`,
        error
      );
    }
  }

  // ВАЖНО: После генерации всех слотов проверяем и исправляем пересечения
  // Это предотвращает ситуацию, когда в одно время прилетает 2+ уведомлений
  await preventSimultaneousNotifications(userId, SCHEDULE_CONFIG.minGapMinutes);

  console.log(
    `[Scheduler] ✅ Generated slots for ${sourceMap.size} sources using regenerateSlotsForSource`
  );
}

// ==========================================
// Генерация слотов для конкретного источника (legacy, используется для совместимости)
// ==========================================
// Функция generateSlotsForUser удалена - она была deprecated и не использовалась
// Вся логика теперь в regenerateSlotsForSource

/**
 * Проверяет, нужна ли регенерация слотов для пользователя
 * @param userId - ID пользователя
 * @returns true если нужно регенерировать слоты
 */
export async function needsSlotRegeneration(userId: number): Promise<boolean> {
  return needsSlotRegenerationInternal(userId);
}

/**
 * Пересоздать слоты для всех пользователей с активными настройками
 * Вызывается по cron (например, каждую ночь в 00:30 UTC)
 *
 * Примечание: Для периодической регенерации используется планировщик BullMQ
 * (см. server/application/notifications/schedulers/notificationSlots.scheduler.ts)
 */
export async function regenerateAllSlots(): Promise<void> {
  console.log('[Scheduler] Regenerating slots for all users');

  // Получаем уникальные userId с активными preferences
  // ВАЖНО: Это единственное место, где нужен прямой запрос для получения всех пользователей
  const activeUsers = await db
    .select({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.enabled, true))
    .groupBy(notificationPreferences.userId);

  console.log(
    `[Scheduler] Found ${activeUsers.length} users with active notifications`
  );

  for (const { userId } of activeUsers) {
    try {
      await generateAllSlotsForUser(userId);
    } catch (error) {
      console.error(
        `[Scheduler] Failed to regenerate slots for user ${userId}:`,
        error
      );
    }
  }

  console.log('[Scheduler] Finished regenerating slots');
}

/**
 * Регенерирует слоты только для конкретного источника (entityKey)
 * Удаляет старые слоты для этого источника и пересоздает только их с учетом новых настроек
 * Сохраняет существующие слоты для других источников
 * @param userId - ID пользователя
 * @param kind - фокус уведомлений (therapy | habits)
 * @param options - параметры источника (entityKey для идентификации)
 */
export async function regenerateSlotsForSource(
  userId: number,
  kind: NotificationKind,
  options?: {
    entityKey?: string;
  }
): Promise<void> {
  const { entityKey } = options || {};
  const regenerationKey = getRegenerationKey(userId, kind, entityKey);

  // Проверяем, не выполняется ли уже регенерация для этого источника
  const existingRegeneration = activeRegenerations.get(regenerationKey);
  if (existingRegeneration) {
    console.log(
      `[Scheduler] ⏳ Regeneration already in progress for source: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}. Waiting for completion...`
    );
    // Ждем завершения существующей операции
    try {
      await existingRegeneration;
      console.log(
        `[Scheduler] ✅ Previous regeneration completed, skipping duplicate call: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
      );
      return;
    } catch (error) {
      // Если предыдущая операция завершилась с ошибкой, продолжаем
      console.warn(
        `[Scheduler] ⚠️ Previous regeneration failed, starting new one: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`,
        error
      );
    }
  }

  // Создаем новую операцию регенерации
  const regenerationPromise = regenerateSlotsForSourceInternal(
    userId,
    kind,
    options
  );

  // ✅ КОРРЕКТНАЯ РЕАЛИЗАЦИЯ: Сохраняем промис в Map ПЕРЕД await
  // Это гарантирует, что последующие вызовы для того же источника будут ждать завершения текущей операции
  activeRegenerations.set(regenerationKey, regenerationPromise);

  try {
    // Ждем завершения операции
    await regenerationPromise;
  } finally {
    // ✅ КОРРЕКТНАЯ РЕАЛИЗАЦИЯ: Удаляем промис из Map после завершения операции (всегда, даже при ошибке)
    // Это гарантирует, что Map не будет расти бесконечно и последующие вызовы смогут создать новую операцию
    activeRegenerations.delete(regenerationKey);
    console.log(
      `[Scheduler] 🧹 Cleaned up regeneration promise for: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
    );
  }
}

/**
 * Триггер для пересоздания слотов при изменении настроек
 * Вызывается из API endpoints при PUT /api/notifications/prefs/:kind
 * Теперь использует регенерацию только для конкретного источника
 */
export async function triggerSlotRegeneration(
  userId: number,
  kind?: NotificationKind,
  options?: {
    entityKey?: string;
  }
): Promise<void> {
  if (kind) {
    // Регенерируем только для конкретного источника
    await regenerateSlotsForSource(userId, kind, options);
  } else {
    // Если kind не указан, пересоздаем все слоты (fallback)
    await generateAllSlotsForUser(userId);
  }
}
