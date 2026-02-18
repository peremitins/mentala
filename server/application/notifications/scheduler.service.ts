/**
 * Сервис планировщика уведомлений
 * Генерирует слоты на 2 дня вперёд (сегодня + завтра) с глобальной оркестрацией
 *
 * Использует BullMQ для постановки задач генерации слотов в очередь
 */

import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import type { NotificationKind } from '@/shared/dto/notifications';
import { needsSlotRegenerationInternal } from './needs-regeneration.service';
import {
  orchestrateAllSlotsForUser,
  type OrchestrateSlotsResult,
} from './global-orchestration.service';

// ==========================================
// Защита от параллельных регенераций
// ==========================================

// Защита от одновременных вызовов generateAllSlotsForUser для одного пользователя
// Ключ: userId (number)
// Значение: Promise<OrchestrateSlotsResult> - промис выполняющейся операции
const activeRegenerations = new Map<number, Promise<OrchestrateSlotsResult>>();

function resolveSchedulerCaller(): string | null {
  const stack = new Error().stack;
  if (!stack) return null;

  const lines = stack.split('\n').slice(1);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Пропускаем внутренние фреймы текущего файла и node internals.
    if (
      line.includes('generateAllSlotsForUser') ||
      line.includes('scheduler.service.ts') ||
      line.includes('node:internal')
    ) {
      continue;
    }

    return line.replace(/^at\s+/, '');
  }

  return null;
}

// ==========================================
// УДАЛЕНО: Функция inferHabitKey была костылем
// Теперь используем только универсальные шаблоны для habits
// ==========================================

// ==========================================
// Глобальная оркестрация слотов
// ==========================================

/**
 * Генерирует ВСЕ слоты для пользователя с глобальной оркестрацией
 * Распределяет уведомления равномерно по дню с чередованием тем
 *
 * ВАЖНО: Защищена от параллельных вызовов - если для одного пользователя
 * уже выполняется регенерация, последующие вызовы будут ждать завершения
 *
 * @param userId - ID пользователя
 */
export async function generateAllSlotsForUser(
  userId: number,
  options?: {
    forceTodaySlots?: boolean;
    reason?: string;
    traceId?: string;
    jobId?: string;
  }
): Promise<OrchestrateSlotsResult> {
  const reason = options?.reason ?? 'manual';
  const forceTodaySlots = options?.forceTodaySlots ?? false;
  const caller = resolveSchedulerCaller();

  // Централизованный structured-log: фиксируем любой вход в глобальную оркестрацию.
  // Это нужно для расследования "самопроизвольных" перегенераций.
  console.log(
    JSON.stringify({
      event: 'notification_slots_generation_trigger',
      user_id: userId,
      reason,
      force_today_slots: forceTodaySlots,
      trace_id: options?.traceId ?? null,
      job_id: options?.jobId ?? null,
      caller,
    })
  );

  // Проверяем, не выполняется ли уже регенерация для этого пользователя
  const existingRegeneration = activeRegenerations.get(userId);
  if (existingRegeneration) {
    console.log(
      `[Scheduler] ⏳ Regeneration already in progress for user ${userId}. Waiting for completion...`
    );
    // Ждем завершения существующей операции
    try {
      const result = await existingRegeneration;
      console.log(
        `[Scheduler] ✅ Previous regeneration completed, skipping duplicate call for user ${userId}`
      );
      return result;
    } catch (error) {
      // Если предыдущая операция завершилась с ошибкой, продолжаем
      console.warn(
        `[Scheduler] ⚠️ Previous regeneration failed, starting new one for user ${userId}:`,
        error
      );
    }
  }

  console.log(`[Scheduler] Starting global orchestration for user ${userId}`);

  // Создаем новую операцию регенерации
  const regenerationPromise = (async () => {
    // Используем новый сервис глобальной оркестрации
    // Он обеспечивает:
    // - Равномерное распределение по дням
    // - Чередование тем (не более 2 подряд)
    // - Weighted round-robin по группам
    // - Частичное распределение при позднем включении
    // - Поддержку фиксированных времен
    // - Поддержку AI-текстов
    return await orchestrateAllSlotsForUser(userId, options);
  })();

  // ✅ КОРРЕКТНАЯ РЕАЛИЗАЦИЯ: Сохраняем промис в Map ПЕРЕД await
  // Это гарантирует, что последующие вызовы для того же пользователя будут ждать завершения текущей операции
  activeRegenerations.set(userId, regenerationPromise);

  try {
    // Ждем завершения операции
    const result = await regenerationPromise;
    console.log(
      `[Scheduler] ✅ Completed global orchestration for user ${userId}`
    );
    return result;
  } finally {
    // ✅ КОРРЕКТНАЯ РЕАЛИЗАЦИЯ: Удаляем промис из Map после завершения операции (всегда, даже при ошибке)
    // Это гарантирует, что Map не будет расти бесконечно и последующие вызовы смогут создать новую операцию
    activeRegenerations.delete(userId);
    console.log(
      `[Scheduler] 🧹 Cleaned up regeneration promise for user ${userId}`
    );
  }
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
  const decision = await needsSlotRegenerationInternal(userId);
  return decision.shouldRegenerate;
}

/**
 * Пересоздать слоты для всех пользователей с активными настройками
 * Может использоваться для ручного запуска регенерации (админские задачи, миграции)
 *
 * ПРИМЕЧАНИЕ: Периодическая регенерация отключена. Регенерация происходит event-driven образом:
 * - При изменении настроек уведомлений
 * - При изменении timezone
 * - При первом включении уведомлений
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
      await generateAllSlotsForUser(userId, { reason: 'manual' });
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
 * Регенерирует слоты для конкретного источника уведомлений
 * ВАЖНО: Теперь использует глобальную оркестрацию через generateAllSlotsForUser
 * для правильного чередования тем и weighted round-robin
 *
 * ВНИМАНИЕ: Параметры kind и entityKey игнорируются - регенерируются ВСЕ источники пользователя.
 * Это необходимо для правильного чередования тем и weighted round-robin.
 *
 * @param userId - ID пользователя
 * @param kind - тип уведомлений ('therapy' | 'habits') - игнорируется, регенерируются все источники
 * @param options - параметры источника (entityKey) - игнорируется, регенерируются все источники
 * @deprecated Используйте generateAllSlotsForUser напрямую для явности. Эта функция оставлена только для обратной совместимости.
 */
export async function regenerateSlotsForSource(
  userId: number,
  kind: NotificationKind,
  options?: {
    entityKey?: string;
  }
): Promise<void> {
  // ВАЖНО: Используем глобальную оркестрацию для всех источников
  // Это обеспечивает правильное чередование тем и weighted round-robin
  // Параметры kind и options игнорируются - регенерируются все источники пользователя
  console.log(
    `[Scheduler] regenerateSlotsForSource called for user ${userId}, kind: ${kind}, entityKey: ${options?.entityKey || 'none'}. Using global orchestration instead (all sources will be regenerated).`
  );
  await generateAllSlotsForUser(userId, { reason: 'prefs_changed' });
}

/**
 * Триггер для пересоздания слотов при изменении настроек
 * Вызывается из API endpoints при PUT /api/notifications/prefs/:kind
 * ВАЖНО: Всегда использует глобальную оркестрацию для правильного чередования тем
 */
export async function triggerSlotRegeneration(
  userId: number,
  kind?: NotificationKind,
  options?: {
    entityKey?: string;
    forceTodaySlots?: boolean;
  }
): Promise<void> {
  // Всегда используем глобальную оркестрацию для всех источников
  // Это обеспечивает правильное чередование тем и weighted round-robin
  // При изменении настроек одного источника пересоздаём все слоты с новой логикой
  await generateAllSlotsForUser(userId, {
    forceTodaySlots: options?.forceTodaySlots ?? false,
    reason: 'prefs_changed',
  });
}
