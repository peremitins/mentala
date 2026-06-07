import { eq, and, isNull } from 'drizzle-orm';
import type { H3Event } from 'h3';
import { nanoid } from 'nanoid';
import {
  notificationPreferences,
  habits,
  therapyTopicsCustom,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  NotificationSubtype,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
  NotificationPreferenceMeta,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';
import { generateAllSlotsForUser } from '@/server/application/notifications/scheduler.service';
import { loadAiGeneratedTexts } from '@/server/application/notifications/ai-generation.service';
import { computeGenerationConfigHash } from '@/server/utils/notification-ai-config-hash';
import { userPreferences } from '@/server/infrastructure/db/schema';
import { enqueueAiTextGenerationJob } from '@/server/application/notifications/queues/aiTextGeneration.queue';
import { ensureAiNotificationAccessConsistency } from '@/server/application/notifications/notification-source-access.service';
import {
  clampNotificationTimesPerDay,
  DEFAULT_NOTIFICATION_TIMES_PER_DAY,
  MAX_NOTIFICATION_TIMES_PER_DAY,
  MIN_NOTIFICATION_TIMES_PER_DAY,
  normalizeCustomSlotTimesByLimit,
} from '@/server/application/notifications/preferences-limits.utils';
import { resolveAssistantTone } from '@/shared/constants/assistantTone';
import {
  getDefaultNotificationTextSource,
  normalizeRequestedNotificationTextSource,
} from '@/shared/utils/notificationTextSource';

function normalizeCustomSlotTimes(
  input: (number | null)[] | null | undefined,
  limit: number
): (number | null)[] | null {
  return normalizeCustomSlotTimesByLimit(input, limit);
}

function hasDuplicateCustomSlotTimes(
  input: (number | null)[] | null | undefined
): boolean {
  if (!input || input.length === 0) return false;

  const seen = new Set<number>();
  for (const value of input) {
    if (value === null || value === undefined) continue;

    // Используем округлённые минуты, т.к. именно так значения сохраняются в БД.
    const minute = Math.round(value);
    if (seen.has(minute)) {
      return true;
    }
    seen.add(minute);
  }

  return false;
}

function runSlotsRegenerationInBackground(params: {
  event: H3Event;
  userId: number;
  kind: string;
  entityKey?: string | null;
  reason: 'prefs_changed';
  forceTodaySlots?: boolean;
}): void {
  const runTask = async () => {
    try {
      await generateAllSlotsForUser(params.userId, {
        forceTodaySlots: params.forceTodaySlots ?? true,
        reason: params.reason,
      });
      console.log(
        `[NotificationPrefs] ✅ Background slot regeneration completed: user=${params.userId}, kind=${params.kind}${params.entityKey ? `, entityKey=${params.entityKey}` : ''}`
      );
    } catch (error) {
      console.error(
        `[NotificationPrefs] ❌ Background slot regeneration failed: user=${params.userId}, kind=${params.kind}${params.entityKey ? `, entityKey=${params.entityKey}` : ''}`,
        error
      );
    }
  };

  // В Nitro/Nuxt предпочтительно регистрировать фоновую задачу через waitUntil.
  // Это не блокирует HTTP-ответ и даёт рантайму корректно дождаться async-задачи.
  if (typeof params.event.waitUntil === 'function') {
    params.event.waitUntil(runTask());
    return;
  }

  // Fallback для окружений без waitUntil.
  if (typeof setImmediate === 'function') {
    setImmediate(() => {
      void runTask();
    });
    return;
  }

  setTimeout(() => {
    void runTask();
  }, 0);
}

function normalizeCustomPromptNotification(
  value?: string | null
): string | null {
  const normalized = value ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

/**
 * PUT /api/notifications/prefs/:kind
 * Обновить локальные настройки конкретного типа (therapy | habits)
 */
// Универсальные значения subtype для всех видов уведомлений
const NOTIFICATION_SUBTYPES: NotificationSubtype[] = [
  'reminder',
  'informational',
  'motivational',
  'mixed',
];

export default defineEventHandler(
  async (event): Promise<NotificationPreferencesDto> => {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionResult.user.id;
    const userGender =
      (sessionResult.user as any)?.gender === 'male' ||
      (sessionResult.user as any)?.gender === 'female'
        ? (sessionResult.user as any)?.gender
        : null;

    const kind = getRouterParam(event, 'kind');
    if (!kind || !['therapy', 'habits'].includes(kind)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid kind parameter',
      });
    }

    const body = await readBody<UpdateNotificationPreferencesDto>(event);

    // Проверяем доступ к AI-уведомлениям и при необходимости
    // автоматически переводим старые AI-настройки в шаблоны.
    const { canUseAiNotifications } =
      await ensureAiNotificationAccessConsistency({
        userId,
        userRole: (sessionResult.user as any)?.roleId ?? null,
      });

    // Если доступ к AI-уведомлениям недоступен (например, Trial закончился),
    // принудительно сохраняем templates, даже если клиент прислал ai.
    const requestedTextSource = body.meta?.textSource;
    const normalizedRequestedTextSource =
      normalizeRequestedNotificationTextSource(
        requestedTextSource,
        canUseAiNotifications
      );

    if (requestedTextSource === 'ai' && !canUseAiNotifications) {
      console.warn(
        `[NotificationPrefs] AI textSource rejected by entitlement, forcing templates: user=${userId}, kind=${kind}`
      );
    }

    // Валидация
    if (body.timesPerDay !== undefined) {
      if (
        body.timesPerDay < MIN_NOTIFICATION_TIMES_PER_DAY ||
        body.timesPerDay > MAX_NOTIFICATION_TIMES_PER_DAY
      ) {
        throw createError({
          statusCode: 400,
          message: `timesPerDay must be between ${MIN_NOTIFICATION_TIMES_PER_DAY} and ${MAX_NOTIFICATION_TIMES_PER_DAY}`,
        });
      }
    }

    if (
      body.directness &&
      !['soft', 'moderate', 'hard'].includes(body.directness)
    ) {
      throw createError({
        statusCode: 400,
        message: 'Invalid directness value',
      });
    }

    if (body.subtype !== undefined) {
      if (
        body.subtype !== null &&
        !NOTIFICATION_SUBTYPES.includes(body.subtype as NotificationSubtype)
      ) {
        throw createError({
          statusCode: 400,
          message: 'Invalid subtype value',
        });
      }
    }

    // Валидация activeDays
    if (body.activeDays !== undefined) {
      if (
        !Array.isArray(body.activeDays) ||
        body.activeDays.length < 1 ||
        body.activeDays.length > 7
      ) {
        throw createError({
          statusCode: 400,
          message: 'activeDays must be an array with 1-7 unique days',
        });
      }
      // Проверяем что все значения от 0 до 6
      const validDays = body.activeDays.every((day) => day >= 0 && day <= 6);
      if (!validDays) {
        throw createError({
          statusCode: 400,
          message: 'activeDays must contain only values from 0 to 6',
        });
      }
      // Проверяем что нет дубликатов
      const uniqueDays = new Set(body.activeDays);
      if (uniqueDays.size !== body.activeDays.length) {
        throw createError({
          statusCode: 400,
          message: 'activeDays must not contain duplicates',
        });
      }
    }

    // Валидация timeRangeStart и timeRangeEnd
    if (body.timeRangeStart !== undefined) {
      if (body.timeRangeStart < 0 || body.timeRangeStart > 1439) {
        throw createError({
          statusCode: 400,
          message: 'timeRangeStart must be between 0 and 1439 minutes',
        });
      }
    }
    if (body.timeRangeEnd !== undefined) {
      if (body.timeRangeEnd < 0 || body.timeRangeEnd > 1439) {
        throw createError({
          statusCode: 400,
          message: 'timeRangeEnd must be between 0 and 1439 minutes',
        });
      }
    }
    // Проверяем минимальную ширину окна (60 минут)
    if (body.timeRangeStart !== undefined && body.timeRangeEnd !== undefined) {
      const start = body.timeRangeStart;
      const end = body.timeRangeEnd;
      let duration: number;

      if (start <= end) {
        // Обычный диапазон внутри суток
        duration = end - start;
      } else {
        // Диапазон через полночь
        duration = 1440 - start + end;
      }

      if (duration < 60) {
        throw createError({
          statusCode: 400,
          message: 'Time range must be at least 60 minutes',
        });
      }
    }

    // Валидация customSlotTimes
    if (body.customSlotTimes !== undefined) {
      if (
        body.customSlotTimes !== null &&
        !Array.isArray(body.customSlotTimes)
      ) {
        throw createError({
          statusCode: 400,
          message: 'customSlotTimes must be an array or null',
        });
      }

      if (Array.isArray(body.customSlotTimes)) {
        if (body.customSlotTimes.length > MAX_NOTIFICATION_TIMES_PER_DAY) {
          throw createError({
            statusCode: 400,
            message: `customSlotTimes length must not exceed ${MAX_NOTIFICATION_TIMES_PER_DAY} entries`,
          });
        }

        const isValid = body.customSlotTimes.every(
          (value) =>
            value === null ||
            (typeof value === 'number' &&
              Number.isFinite(value) &&
              value >= 0 &&
              value <= 1439)
        );

        if (!isValid) {
          throw createError({
            statusCode: 400,
            message:
              'customSlotTimes values must be null or numbers between 0 and 1439',
          });
        }

        // Дубли фиксированных минут запрещаем явно:
        // active-slot уникальность в БД не позволит сохранить два planned/queued слота
        // с одинаковым (user, kind, entity, scheduled_at), что приводило к "тихим" пропускам.
        if (hasDuplicateCustomSlotTimes(body.customSlotTimes)) {
          throw createError({
            statusCode: 400,
            message:
              'customSlotTimes must not contain duplicate non-null times',
          });
        }
      }
    }

    let normalizedCustomPromptNotification: string | null | undefined =
      undefined;
    if (body.customPromptNotification !== undefined) {
      if (
        body.customPromptNotification !== null &&
        typeof body.customPromptNotification !== 'string'
      ) {
        throw createError({
          statusCode: 400,
          message: 'customPromptNotification must be a string or null',
        });
      }

      normalizedCustomPromptNotification = normalizeCustomPromptNotification(
        body.customPromptNotification
      );

      if (
        normalizedCustomPromptNotification &&
        normalizedCustomPromptNotification.length > 400
      ) {
        throw createError({
          statusCode: 400,
          message: 'customPromptNotification must be 400 characters or меньше',
        });
      }
    }

    const entityKey = body.entityKey;

    // Пытаемся найти существующие настройки с учётом entityKey
    const conditions = [
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.kind, kind),
    ];

    if (entityKey) {
      // Для кастомных сущностей entityKey = ID, для шаблонных = ключ шаблона
      if (kind === 'habits') {
        // Для кастомных сущностей entityKey должен быть ID
        const [habit] = await db
          .select({ id: habits.id, intent: habits.intent })
          .from(habits)
          .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
          .limit(1);

        if (habit) {
          // Нашли привычку в БД - это кастомная, используем ID
          conditions.push(eq(notificationPreferences.entityKey, habit.id));
        } else {
          // Не нашли в БД - значит это шаблон (water, meditation и т.д.)
          // Используем entityKey как есть (ключ шаблона)
          conditions.push(eq(notificationPreferences.entityKey, entityKey));
        }
      } else if (kind === 'therapy') {
        // Для кастомных сущностей entityKey должен быть ID
        const [topic] = await db
          .select({
            id: therapyTopicsCustom.id,
          })
          .from(therapyTopicsCustom)
          .where(
            and(
              eq(therapyTopicsCustom.id, entityKey),
              eq(therapyTopicsCustom.userId, userId)
            )
          )
          .limit(1);

        if (topic) {
          // Нашли тему в БД - это кастомная, используем ID
          conditions.push(eq(notificationPreferences.entityKey, topic.id));
        } else {
          // Не нашли в БД - значит это шаблон
          // Используем entityKey как есть (ключ шаблона)
          conditions.push(eq(notificationPreferences.entityKey, entityKey));
        }
      } else {
        // Для других типов ищем напрямую по переданному значению
        conditions.push(eq(notificationPreferences.entityKey, entityKey));
      }
    } else {
      // Общие настройки (без entityKey)
      conditions.push(isNull(notificationPreferences.entityKey));
    }

    const [existing] = await db
      .select()
      .from(notificationPreferences)
      .where(and(...conditions))
      .limit(1);

    // ВАЖНО: Если AI-тексты генерируются и textSource === 'ai', НЕ регенерируем слоты сейчас
    // Слоты будут регенерированы после завершения AI-генерации
    // Объявляем переменную ДО блока if (existing), чтобы она была доступна ниже
    let shouldRegenerateSlotsAfterAi = false;

    if (existing) {
      // ВАЖНО: нормализуем значение и для body, и для legacy-данных из БД.
      const nextTimesPerDay = clampNotificationTimesPerDay(
        body.timesPerDay ?? existing.timesPerDay
      );
      const customSlotTimesInput =
        body.customSlotTimes !== undefined
          ? body.customSlotTimes
          : ((existing.customSlotTimes as (number | null)[] | null) ?? null);
      const nextCustomSlotTimes = normalizeCustomSlotTimes(
        customSlotTimesInput,
        nextTimesPerDay
      );
      // Упрощенная логика: subtype сохраняется для всех типов сущностей
      const nextSubtype =
        body.subtype !== undefined
          ? body.subtype
          : (existing.subtype as NotificationSubtype | null);
      const existingMeta =
        (existing.meta as NotificationPreferenceMeta | null) ?? null;

      // Объединяем существующие meta с новыми (только textSource)
      const finalMeta: NotificationPreferenceMeta = {
        ...(existingMeta || {}),
        ...(normalizedRequestedTextSource !== undefined
          ? {
              textSource: normalizedRequestedTextSource,
            }
          : {}),
      };

      // Если юзер явно задаёт textSource — очищаем маркер автодаунгрейда,
      // чтобы автовосстановление при оплате не перезаписало осознанный выбор.
      if (normalizedRequestedTextSource !== undefined) {
        delete (finalMeta as any).textSourceBeforeAutoDowngrade;
      }

      // Убеждаемся, что meta не пустой объект (если есть хотя бы одно поле)
      const hasMetaFields = finalMeta.textSource !== undefined;

      const metaToSave = hasMetaFields ? finalMeta : null;

      let normalizedEntityKey = entityKey;
      let isCustomEntityForPrompt = false;

      // ВАЖНО: Обновляем название и описание ДО обновления настроек уведомлений
      // Это нужно для правильного вычисления хеша и пересоздания AI-текстов
      let nameChanged = false;
      let descriptionChanged = false;
      // Сохраняем старые значения ДО обновления для вычисления старого хеша
      let oldEntityNameBeforeUpdate = '';
      let oldEntityDescriptionBeforeUpdate: string | null = null;

      if (kind === 'habits' && entityKey) {
        // Для кастомных сущностей entityKey должен быть ID
        const [habit] = await db
          .select({
            intent: habits.intent,
            id: habits.id,
            name: habits.name,
            description: habits.description,
          })
          .from(habits)
          .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
          .limit(1);

        console.log(
          `[NotificationPrefs] 🔍 Searching habit: entityKey=${entityKey}, found=${!!habit}, id=${habit?.id}, name="${habit?.name}"`
        );

        // Сохраняем старые значения ДО обновления
        if (habit) {
          isCustomEntityForPrompt = true;
          oldEntityNameBeforeUpdate = habit.name;
          oldEntityDescriptionBeforeUpdate = habit.description;
        }

        // Обновляем название и описание, если они переданы
        if (
          habit &&
          (body.name !== undefined || body.description !== undefined)
        ) {
          const updateData: {
            name?: string;
            description?: string | null;
            updatedAt: Date;
          } = {
            updatedAt: new Date(),
          };

          if (body.name !== undefined) {
            const newName = body.name.trim();
            if (newName !== habit.name) {
              updateData.name = newName;
              nameChanged = true;
              console.log(
                `[NotificationPrefs] ✅ Updating habit name: "${habit.name}" -> "${newName}"`
              );
            } else {
              console.log(
                `[NotificationPrefs] ⏭️ Habit name unchanged: "${habit.name}"`
              );
            }
          }

          if (body.description !== undefined) {
            const newDescription = body.description?.trim() || null;
            if (newDescription !== habit.description) {
              updateData.description = newDescription;
              descriptionChanged = true;
              console.log(
                `[NotificationPrefs] ✅ Updating habit description: "${habit.description || 'null'}" -> "${newDescription || 'null'}"`
              );
            } else {
              console.log(
                `[NotificationPrefs] ⏭️ Habit description unchanged: "${habit.description || 'null'}"`
              );
            }
          }

          if (nameChanged || descriptionChanged) {
            console.log(
              `[NotificationPrefs] 🔄 Saving habit changes: nameChanged=${nameChanged}, descriptionChanged=${descriptionChanged}`
            );
            const [updatedHabit] = await db
              .update(habits)
              .set(updateData)
              .where(eq(habits.id, habit.id))
              .returning();

            if (updatedHabit) {
              // Для кастомных сущностей entityKey = ID
              normalizedEntityKey = updatedHabit.id;
              console.log(
                `[NotificationPrefs] ✅ Habit updated: id=${updatedHabit.id}, name="${updatedHabit.name}", description="${updatedHabit.description || 'null'}"`
              );
            }
          } else {
            console.log(
              `[NotificationPrefs] ⏭️ No changes to save for habit: name=${body.name !== undefined ? 'provided' : 'not provided'}, description=${body.description !== undefined ? 'provided' : 'not provided'}`
            );
          }
        } else if (!habit) {
          console.log(
            `[NotificationPrefs] ⚠️ Habit not found for entityKey=${entityKey}, cannot update name/description`
          );
        }

        // Для кастомных привычек используем ID
        if (habit) {
          normalizedEntityKey = habit.id; // ВСЕГДА ID для кастомных сущностей
          console.log(
            `[NotificationPrefs] Normalized entityKey for habit: original=${entityKey}, normalized=${normalizedEntityKey} (ID)`
          );
        }
      } else if (kind === 'therapy' && entityKey) {
        // Для кастомных сущностей entityKey должен быть ID
        const [topic] = await db
          .select({
            id: therapyTopicsCustom.id,
            name: therapyTopicsCustom.name,
            description: therapyTopicsCustom.description,
          })
          .from(therapyTopicsCustom)
          .where(
            and(
              eq(therapyTopicsCustom.id, entityKey),
              eq(therapyTopicsCustom.userId, userId)
            )
          )
          .limit(1);

        // Сохраняем старые значения ДО обновления
        if (topic) {
          isCustomEntityForPrompt = true;
          oldEntityNameBeforeUpdate = topic.name;
          oldEntityDescriptionBeforeUpdate = topic.description;
        }

        // Обновляем название и описание, если они переданы
        if (
          topic &&
          (body.name !== undefined || body.description !== undefined)
        ) {
          const updateData: {
            name?: string;
            description?: string | null;
            updatedAt: Date;
          } = {
            updatedAt: new Date(),
          };

          if (body.name !== undefined) {
            const newName = body.name.trim();
            if (newName !== topic.name) {
              updateData.name = newName;
              nameChanged = true;
              console.log(
                `[NotificationPrefs] ✅ Updating therapy topic name: "${topic.name}" -> "${newName}"`
              );
            } else {
              console.log(
                `[NotificationPrefs] ⏭️ Therapy topic name unchanged: "${topic.name}"`
              );
            }
          }

          if (body.description !== undefined) {
            const newDescription = body.description?.trim() || null;
            if (newDescription !== topic.description) {
              updateData.description = newDescription;
              descriptionChanged = true;
              console.log(
                `[NotificationPrefs] ✅ Updating therapy topic description: "${topic.description || 'null'}" -> "${newDescription || 'null'}"`
              );
            } else {
              console.log(
                `[NotificationPrefs] ⏭️ Therapy topic description unchanged: "${topic.description || 'null'}"`
              );
            }
          }

          if (nameChanged || descriptionChanged) {
            console.log(
              `[NotificationPrefs] 🔄 Saving therapy topic changes: nameChanged=${nameChanged}, descriptionChanged=${descriptionChanged}`
            );
            const [updatedTopic] = await db
              .update(therapyTopicsCustom)
              .set(updateData)
              .where(eq(therapyTopicsCustom.id, topic.id))
              .returning();

            if (updatedTopic) {
              // Для кастомных сущностей entityKey = ID
              normalizedEntityKey = updatedTopic.id;
              console.log(
                `[NotificationPrefs] ✅ Therapy topic updated: id=${updatedTopic.id}, name="${updatedTopic.name}", description="${updatedTopic.description || 'null'}"`
              );
            }
          } else {
            console.log(
              `[NotificationPrefs] ⏭️ No changes to save for therapy topic: name=${body.name !== undefined ? 'provided' : 'not provided'}, description=${body.description !== undefined ? 'provided' : 'not provided'}`
            );
          }
        } else if (!topic) {
          console.log(
            `[NotificationPrefs] ⚠️ Therapy topic not found for entityKey=${entityKey}, cannot update name/description`
          );
        }

        // Для кастомных тем используем ID
        if (topic) {
          normalizedEntityKey = topic.id; // ВСЕГДА ID для кастомных сущностей
          console.log(
            `[NotificationPrefs] Normalized entityKey for therapy topic: original=${entityKey}, normalized=${normalizedEntityKey} (ID)`
          );
        }
      }

      const allowCustomPrompt = Boolean(entityKey) && !isCustomEntityForPrompt;
      const nextCustomPromptNotification = allowCustomPrompt
        ? normalizedCustomPromptNotification !== undefined
          ? normalizedCustomPromptNotification
          : (existing.customPromptNotification ?? null)
        : null;
      const oldCustomPromptNotification = allowCustomPrompt
        ? (existing.customPromptNotification ?? null)
        : null;

      // Обновляем существующие
      const [updated] = await db
        .update(notificationPreferences)
        .set({
          enabled: body.enabled ?? existing.enabled,
          timesPerDay: nextTimesPerDay,
          directness: body.directness ?? existing.directness,
          timezone: body.timezone ?? existing.timezone,
          subtype: nextSubtype, // Сохраняем subtype для всех типов сущностей
          // Используем нормализованное (читаемое) значение
          entityKey: normalizedEntityKey ?? null,
          activeDays: body.activeDays ?? existing.activeDays,
          timeRangeStart: body.timeRangeStart ?? existing.timeRangeStart,
          timeRangeEnd: body.timeRangeEnd ?? existing.timeRangeEnd,
          customSlotTimes: nextCustomSlotTimes,
          meta: metaToSave,
          customPromptNotification: nextCustomPromptNotification,
          updatedAt: new Date(),
        })
        .where(eq(notificationPreferences.id, existing.id))
        .returning();

      // Проверяем, нужно ли регенерировать AI-тексты
      // Запускаем асинхронно, не блокируя ответ
      // Используем metaToSave вместо finalMeta, так как finalMeta может быть пустым объектом
      const metaForCheck = metaToSave || finalMeta;
      const shouldRegenerateAi =
        (kind === 'habits' || kind === 'therapy') &&
        entityKey && // Только для конкретных сущностей
        metaForCheck &&
        metaForCheck.textSource === 'ai';

      console.log(
        `[NotificationPrefs] Checking AI regeneration: shouldRegenerateAi=${shouldRegenerateAi}, kind=${kind}, entityKey=${entityKey || 'none'}, textSource=${metaForCheck?.textSource}, metaToSave=${JSON.stringify(metaToSave)}`
      );

      if (shouldRegenerateAi) {
        // Проверяем, изменились ли параметры, влияющие на генерацию
        // Используем нормализованное значение для entityKey
        const finalEntityKey = normalizedEntityKey || '';

        console.log(
          `[NotificationPrefs] Preparing AI generation: kind=${kind}, original entityKey=${entityKey || 'none'}, normalizedEntityKey=${normalizedEntityKey || 'none'}, finalEntityKey=${finalEntityKey}`
        );

        // Для кастомных сущностей entityKey уже должен быть ID
        // Для шаблонных - ключ шаблона
        // finalEntityKey остается как normalizedEntityKey (ID для кастомных, ключ для шаблонных)

        const nextDirectness = body.directness ?? existing.directness;

        // Загружаем глобальные настройки пользователя
        const [userPrefs] = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        const tone = resolveAssistantTone(
          userPrefs?.tone as string | null | undefined
        );
        const addressing = (userPrefs?.addressing as any) || 'informal';

        // Определяем textSource (единое поле для всех типов сущностей)
        // Также определяем isCustomEntity для правильной обработки subtype
        let isCustomEntity = false;
        let entityName = '';
        let entityDescription: string | null = null;

        // Старые значения entityName/entityDescription для вычисления старого хеша
        // Загружаем их из БД ДО обновления, чтобы использовать в старом хеше
        let oldEntityName = '';
        let oldEntityDescription: string | null = null;

        // ВАЖНО: Загружаем актуальные значения entityName/entityDescription
        // Если название/описание были обновлены выше, используем обновленные значения
        // Используем normalizedEntityKey для поиска (для кастомных сущностей это ID)
        let habitIntent: 'quit' | 'build' | null = null;
        if (kind === 'habits' && normalizedEntityKey) {
          // Для кастомных сущностей entityKey = ID
          const [habit] = await db
            .select()
            .from(habits)
            .where(
              and(
                eq(habits.id, normalizedEntityKey), // Для кастомных сущностей entityKey = ID
                eq(habits.userId, userId)
              )
            )
            .limit(1);
          // ВАЖНО: Кастомная привычка - это любая привычка, найденная в БД (не шаблон)
          // Не проверяем intent === 'custom', так как у кастомных привычек может быть intent='build' или 'quit'
          isCustomEntity = !!habit;
          if (habit) {
            // Кастомная привычка (найдена в БД)
            // Используем обновленные значения (если они были обновлены выше)
            entityName = habit.name;
            entityDescription = habit.description;
            // Берем intent из БД
            habitIntent = habit.intent as 'quit' | 'build' | null;
            // Используем сохраненные старые значения для вычисления старого хеша
            oldEntityName = oldEntityNameBeforeUpdate || habit.name;
            oldEntityDescription =
              oldEntityDescriptionBeforeUpdate !== null
                ? oldEntityDescriptionBeforeUpdate
                : habit.description;
            console.log(
              `[NotificationPrefs] 🔍 Found custom habit in DB: id=${habit.id}, name="${habit.name}", intent=${habitIntent}, isCustomEntity=${isCustomEntity}, nameChanged=${nameChanged}, descriptionChanged=${descriptionChanged}`
            );
          } else {
            // Готовый шаблон привычки (water, steps, meditation и т.д.)
            isCustomEntity = false;
            // ВАЖНО: Используем читаемое название из каталога, чтобы хеш совпадал с генерацией
            const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
            const catalogHabit = findHabitByKey(normalizedEntityKey);
            if (catalogHabit) {
              entityName = catalogHabit.name;
              entityDescription = catalogHabit.description || null;
              oldEntityName = catalogHabit.name;
              oldEntityDescription = catalogHabit.description || null;
              habitIntent = catalogHabit.intent;
              console.log(
                `[NotificationPrefs] 🔍 Habit not found in DB, treating as template: entityKey=${normalizedEntityKey}, name="${catalogHabit.name}" (from catalog), intent=${habitIntent}, isCustomEntity=${isCustomEntity}`
              );
            } else {
              // Fallback: если не найден в каталоге, используем entityKey
              entityName = normalizedEntityKey;
              entityDescription = null;
              oldEntityName = normalizedEntityKey;
              oldEntityDescription = null;
              habitIntent = null;
              console.log(
                `[NotificationPrefs] 🔍 Habit not found in DB and not in catalog: entityKey=${normalizedEntityKey}, using as entityName, intent=${habitIntent}, isCustomEntity=${isCustomEntity}`
              );
            }
          }
        } else if (kind === 'therapy' && normalizedEntityKey) {
          // Для терапии проверяем, кастомная ли это тема
          const [topic] = await db
            .select()
            .from(therapyTopicsCustom)
            .where(
              and(
                eq(therapyTopicsCustom.id, normalizedEntityKey),
                eq(therapyTopicsCustom.userId, userId)
              )
            )
            .limit(1);
          isCustomEntity = !!topic;
          if (topic) {
            entityName = topic.name;
            entityDescription = topic.description;
            // Используем сохраненные старые значения для вычисления старого хеша
            oldEntityName = oldEntityNameBeforeUpdate || topic.name;
            oldEntityDescription =
              oldEntityDescriptionBeforeUpdate !== null
                ? oldEntityDescriptionBeforeUpdate
                : topic.description;
          } else {
            // Готовый шаблон терапии
            entityName = normalizedEntityKey;
            entityDescription = null;
            oldEntityName = normalizedEntityKey;
            oldEntityDescription = null;
          }
        }

        // ВАЖНО: Если название или описание изменились, нужно принудительно пересоздать AI-тексты
        // entityName/entityDescription входят в хеш, поэтому хеш изменится автоматически

        const textSource = 'ai' as const;

        console.log(
          `[NotificationPrefs] 🔍 Determined textSource: ${textSource}, isCustomEntity: ${isCustomEntity}, metaForCheck: ${JSON.stringify(metaForCheck)}`
        );

        // Для вычисления хеша используем фактический subtype из настроек
        // ВАЖНО: subtype влияет на смысл текста (фокус), поэтому должен менять хеш
        const nextSubtypeForHash = nextSubtype;

        // Вычисляем новый хеш конфигурации
        // КРИТИЧНО: habitIntent должен быть включен в хеш, чтобы при изменении intent генерировался новый пул текстов
        const newConfigHash = computeGenerationConfigHash({
          entityName,
          entityDescription,
          tone,
          addressing,
          directness: nextDirectness as 'soft' | 'moderate' | 'hard',
          subtype: nextSubtypeForHash as
            | 'reminder'
            | 'informational'
            | 'motivational'
            | 'mixed'
            | null,
          textSource,
          kind: kind as 'habits' | 'therapy',
          habitIntent: kind === 'habits' ? habitIntent : null, // Включаем intent только для habits
          userGender,
          customPromptNotification: nextCustomPromptNotification,
        });

        console.log(
          `[NotificationPrefs] Computed new config hash: ${newConfigHash.substring(0, 8)}..., entityName: ${entityName}, entityDescription: ${entityDescription || 'null'}, directness: ${nextDirectness}, subtype: ${nextSubtypeForHash}, textSource: ${textSource}, kind: ${kind}`
        );

        // Вычисляем старый хеш из существующих настроек
        const oldMeta =
          (existing.meta as NotificationPreferenceMeta | null) || {};
        const oldDirectness = existing.directness;
        const oldSubtype = existing.subtype;
        const oldTextSource: 'ai' | undefined =
          oldMeta.textSource === 'ai' ? 'ai' : undefined;

        // Если старый режим не был AI, то хеш не нужен (тексты не генерировались)
        let oldConfigHash: string | null = null;
        if (oldTextSource === 'ai') {
          // Используем фактический subtype из существующих настроек
          const oldSubtypeForHash = oldSubtype;
          // ВАЖНО: Используем старые значения entityName/entityDescription для старого хеша
          // Это нужно для правильного сравнения, если название/описание изменились
          // КРИТИЧНО: habitIntent должен быть включен в хеш, чтобы при изменении intent генерировался новый пул текстов
          // Для старого хеша используем тот же habitIntent (если он не изменился, хеш не должен меняться только из-за intent)
          // Но если intent изменился, это будет обнаружено через изменение хеша при следующем обновлении
          oldConfigHash = computeGenerationConfigHash({
            entityName: oldEntityName || entityName, // Используем старые значения если они есть
            entityDescription:
              oldEntityDescription !== null
                ? oldEntityDescription
                : entityDescription,
            tone,
            addressing,
            directness: oldDirectness as 'soft' | 'moderate' | 'hard',
            subtype: oldSubtypeForHash as
              | 'reminder'
              | 'informational'
              | 'motivational'
              | 'mixed'
              | null,
            textSource: oldTextSource,
            kind: kind as 'habits' | 'therapy',
            habitIntent: kind === 'habits' ? habitIntent : null, // Используем текущий intent (если он изменился, хеш изменится)
            userGender,
            customPromptNotification: oldCustomPromptNotification,
          });
        }

        // Генерируем только если хеш изменился или текстов еще нет
        // ВАЖНО: Если изменилось название или описание, обязательно пересоздаем AI-тексты
        const hashChanged = oldConfigHash !== newConfigHash;
        // Если хеш совпал, но AI-пул пустой/отсутствует, принудительно регенерируем.
        let missingAiTexts = false;

        if (!hashChanged && textSource === 'ai') {
          try {
            const existingAiTexts = await loadAiGeneratedTexts(
              userId,
              existing.id,
              newConfigHash
            );
            missingAiTexts = !existingAiTexts || existingAiTexts.length === 0;
            if (missingAiTexts) {
              console.warn(
                `[NotificationPrefs] ⚠️ AI texts missing for unchanged hash, forcing generation: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey}, hash: ${newConfigHash.substring(0, 8)}...`
              );
            }
          } catch (error) {
            console.warn(
              `[NotificationPrefs] ⚠️ Failed to check existing AI texts, forcing generation:`,
              error
            );
            missingAiTexts = true;
          }
        }

        const needsAiGeneration =
          hashChanged ||
          !oldConfigHash ||
          nameChanged ||
          descriptionChanged ||
          missingAiTexts;

        // ВАЖНО: Не тратим деньги на AI-генерацию для ВЫКЛЮЧЕННЫХ уведомлений —
        // пользователь их всё равно не увидит. Пул будет сгенерирован при включении
        // (enabled → true снова пройдёт эту ветку с missingAiTexts).
        const shouldGenerateAiTexts = needsAiGeneration && updated.enabled;

        // ВАЖНО: Если AI-тексты генерируются и textSource === 'ai', НЕ регенерируем слоты сейчас
        // Слоты будут регенерированы после завершения AI-генерации
        // Присваиваем значение переменной, объявленной выше
        shouldRegenerateSlotsAfterAi =
          shouldGenerateAiTexts && textSource === 'ai';

        if (!updated.enabled && needsAiGeneration) {
          console.log(
            `[NotificationPrefs] ⏭️ Skipping AI generation for disabled preference: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey}`
          );
        }

        if (shouldGenerateAiTexts) {
          console.log(
            `[NotificationPrefs] Config hash changed or missing, generating AI texts: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey} (READABLE), oldHash: ${oldConfigHash?.substring(0, 8) || 'none'}..., newHash: ${newConfigHash.substring(0, 8)}...`
          );

          // Запускаем генерацию асинхронно (не блокируя ответ)
          console.log(
            `[NotificationPrefs] Calling generateNotificationTexts with entityKey: ${finalEntityKey}`
          );
          // Ставим задачу генерации в очередь (без синхронного ожидания).
          // Это защищает от гонок при быстрых изменениях настроек.
          void enqueueAiTextGenerationJob({
            userId,
            preferenceId: existing.id,
            reason: 'prefs_update',
            configHash: newConfigHash,
          });
        } else {
          console.log(
            `[NotificationPrefs] Config hash unchanged, skipping AI generation: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey}, hash: ${newConfigHash.substring(0, 8)}...`
          );
        }
      }

      // Регенерируем слоты только для этого источника
      // Проверяем, изменились ли настройки, влияющие на слоты
      const settingsChanged =
        body.enabled !== undefined ||
        body.timesPerDay !== undefined ||
        body.directness !== undefined ||
        body.timezone !== undefined ||
        body.activeDays !== undefined ||
        body.timeRangeStart !== undefined ||
        body.timeRangeEnd !== undefined ||
        body.customSlotTimes !== undefined ||
        body.subtype !== undefined ||
        normalizedRequestedTextSource !== undefined;

      if (settingsChanged && !shouldRegenerateSlotsAfterAi) {
        runSlotsRegenerationInBackground({
          event,
          userId,
          kind,
          entityKey,
          forceTodaySlots: true,
          reason: 'prefs_changed',
        });
        console.log(
          `[NotificationPrefs] 🕒 Slot regeneration scheduled in background: user ${userId}, kind: ${kind}${entityKey ? `, entityKey: ${entityKey}` : ''}`
        );
      } else if (settingsChanged && shouldRegenerateSlotsAfterAi) {
        console.log(
          `[NotificationPrefs] Skipping immediate slot regeneration (will regenerate after AI generation): user ${userId}, kind: ${kind}`
        );
      } else {
        console.log(
          `[NotificationPrefs] Settings unchanged, skipping slot regeneration: user ${userId}, kind: ${kind}`,
          entityKey ? `, entityKey: ${entityKey}` : ''
        );
      }

      const response = {
        id: updated.id,
        userId: updated.userId,
        kind: updated.kind as 'therapy' | 'habits',
        entityKey: updated.entityKey ?? null,
        enabled: updated.enabled,
        timesPerDay: updated.timesPerDay,
        directness: updated.directness as 'soft' | 'moderate' | 'hard',
        timezone: updated.timezone,
        subtype: updated.subtype as NotificationSubtype | null, // Возвращаем subtype для всех типов
        activeDays: (updated.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
        customSlotTimes:
          (updated.customSlotTimes as (number | null)[] | null) ?? null,
        timeRangeStart: updated.timeRangeStart,
        timeRangeEnd: updated.timeRangeEnd,
        customPromptNotification: updated.customPromptNotification ?? null,
        meta: (updated.meta as NotificationPreferenceMeta | null) ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };

      return response;
    } else {
      // Создаём новые (дефолтные значения)
      // Используем timezone из body, если передан, иначе пытаемся получить из существующих preferences
      let timezone: string;
      if (body.timezone) {
        timezone = body.timezone;
      } else {
        try {
          const { getUserTimezone } = await import(
            '@/server/application/notifications/timezone.utils'
          );
          timezone = await getUserTimezone(userId);
        } catch (error) {
          // Если не удалось получить timezone, используем Europe/Moscow как fallback для российского приложения
          console.warn(
            `[NotificationPrefs] Could not get timezone for user ${userId}, using Europe/Moscow as fallback:`,
            error
          );
          timezone = 'Europe/Moscow';
        }
      }
      const initialTimesPerDay = clampNotificationTimesPerDay(
        body.timesPerDay ?? DEFAULT_NOTIFICATION_TIMES_PER_DAY
      );
      const initialCustomSlotTimes = normalizeCustomSlotTimes(
        body.customSlotTimes ?? null,
        initialTimesPerDay
      );
      let normalizedEntityKey = entityKey;
      let isCustomEntityForPrompt = false;

      if (kind === 'habits' && entityKey) {
        // Для кастомных сущностей entityKey должен быть ID
        const [habit] = await db
          .select({ id: habits.id, intent: habits.intent })
          .from(habits)
          .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
          .limit(1);
        // Для кастомных привычек используем ID
        if (habit) {
          isCustomEntityForPrompt = true;
          normalizedEntityKey = habit.id; // ВСЕГДА ID для кастомных сущностей
          console.log(
            `[NotificationPrefs] Creating preference for habit: entityKey param=${entityKey}, found id=${habit.id}, using normalizedEntityKey=${normalizedEntityKey}`
          );
        } else {
          // Не нашли в БД - значит это шаблон (water, meditation и т.д.)
          normalizedEntityKey = entityKey; // Ключ шаблона
        }
      } else if (kind === 'therapy' && entityKey) {
        // Для кастомных сущностей entityKey должен быть ID
        const [topic] = await db
          .select({
            id: therapyTopicsCustom.id,
          })
          .from(therapyTopicsCustom)
          .where(
            and(
              eq(therapyTopicsCustom.id, entityKey),
              eq(therapyTopicsCustom.userId, userId)
            )
          )
          .limit(1);
        if (topic) {
          isCustomEntityForPrompt = true;
          // Для кастомных тем используем ID
          normalizedEntityKey = topic.id; // ВСЕГДА ID для кастомных сущностей
          console.log(
            `[NotificationPrefs] Creating preference for therapy topic: entityKey param=${entityKey}, found id=${topic.id}, using normalizedEntityKey=${normalizedEntityKey}`
          );
        } else {
          // Не нашли в БД - значит это шаблон
          normalizedEntityKey = entityKey; // Ключ шаблона
        }
      }

      // Упрощенная логика: subtype сохраняется для всех типов сущностей
      const initialSubtype = body.subtype ?? 'mixed';
      const initialTextSource =
        normalizedRequestedTextSource ??
        getDefaultNotificationTextSource(canUseAiNotifications);

      // Формируем initialMeta: для новых preferences всегда фиксируем textSource,
      // чтобы первое состояние не зависело от UI fallback.
      const initialMeta =
        kind === 'habits' || kind === 'therapy'
          ? (() => {
              const meta: NotificationPreferenceMeta = {};

              meta.textSource = initialTextSource;

              // Возвращаем meta только если есть хотя бы одно поле
              return meta.textSource !== undefined ? meta : null;
            })()
          : null;
      const allowCustomPrompt = Boolean(entityKey) && !isCustomEntityForPrompt;
      const initialCustomPromptNotification = allowCustomPrompt
        ? (normalizedCustomPromptNotification ?? null)
        : null;
      const [created] = await db
        .insert(notificationPreferences)
        .values({
          id: nanoid(),
          userId,
          kind,
          // Используем нормализованное (читаемое) значение
          entityKey: normalizedEntityKey ?? null,
          enabled: body.enabled ?? true,
          timesPerDay: initialTimesPerDay,
          directness: body.directness ?? 'moderate',
          timezone,
          subtype: initialSubtype,
          activeDays: body.activeDays ?? [0, 1, 2, 3, 4, 5, 6],
          timeRangeStart: body.timeRangeStart ?? 540, // 09:00
          timeRangeEnd: body.timeRangeEnd ?? 1350, // 22:30
          customSlotTimes: initialCustomSlotTimes,
          meta: initialMeta,
          customPromptNotification: initialCustomPromptNotification,
        })
        .returning();

      // Проверяем, нужно ли генерировать AI-тексты для новых настроек
      const shouldGenerateAi =
        (kind === 'habits' || kind === 'therapy') &&
        entityKey && // Только для конкретных сущностей
        initialMeta &&
        initialMeta.textSource === 'ai';

      if (shouldGenerateAi) {
        // ВАЖНО: Для кастомных сущностей entityKey = ID, для шаблонных = ключ шаблона
        // normalizedEntityKey уже вычислено выше (ID для кастомных, ключ для шаблонных)
        const finalEntityKey = normalizedEntityKey || entityKey || '';

        // Определяем textSource
        const textSource = 'ai' as const;

        // Определяем сущность и intent для вычисления хеша и генерации
        let habitIntent: 'quit' | 'build' | null = null;
        let entityName = '';
        let entityDescription: string | null = null;
        if (kind === 'habits' && entityKey) {
          // Для кастомных сущностей entityKey = ID
          const [habit] = await db
            .select()
            .from(habits)
            .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
            .limit(1);
          if (habit) {
            habitIntent = habit.intent as 'quit' | 'build' | null;
            entityName = habit.name;
            entityDescription = habit.description;
          } else {
            // Готовый шаблон - берем intent из каталога
            const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
            const catalogHabit = findHabitByKey(entityKey);
            habitIntent = catalogHabit ? catalogHabit.intent : null;
            entityName = catalogHabit?.name ?? entityKey;
            entityDescription = catalogHabit?.description || null;
          }
        } else if (kind === 'therapy' && entityKey) {
          // Для кастомных сущностей entityKey = ID
          const [topic] = await db
            .select()
            .from(therapyTopicsCustom)
            .where(
              and(
                eq(therapyTopicsCustom.id, entityKey),
                eq(therapyTopicsCustom.userId, userId)
              )
            )
            .limit(1);
          if (topic) {
            entityName = topic.name;
            entityDescription = topic.description;
          } else {
            entityName = entityKey;
            entityDescription = null;
          }
        }

        // Для вычисления хеша используем фактический subtype
        const initialSubtypeForHash = initialSubtype;

        const initialDirectness = body.directness ?? 'moderate';

        const [userPrefs] = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        const tone = resolveAssistantTone(
          userPrefs?.tone as string | null | undefined
        );
        const addressing = (userPrefs?.addressing as any) || 'informal';

        const newConfigHash = computeGenerationConfigHash({
          entityName: entityName || finalEntityKey,
          entityDescription,
          tone,
          addressing,
          directness: initialDirectness as 'soft' | 'moderate' | 'hard',
          subtype: initialSubtypeForHash as
            | 'reminder'
            | 'informational'
            | 'motivational'
            | 'mixed'
            | null,
          textSource,
          kind: kind as 'habits' | 'therapy',
          habitIntent: kind === 'habits' ? habitIntent : null,
          userGender,
          customPromptNotification: initialCustomPromptNotification,
        });

        console.log(
          `[NotificationPrefs] Preparing AI generation for NEW preference: kind=${kind}, original entityKey=${entityKey || 'none'}, normalizedEntityKey=${normalizedEntityKey || 'none'}, finalEntityKey=${finalEntityKey} (ID for custom, key for template)`
        );

        // Запускаем генерацию асинхронно
        // ВАЖНО: finalEntityKey для кастомных сущностей = ID, для шаблонных = ключ шаблона
        console.log(
          `[NotificationPrefs] Starting AI text generation for NEW preference: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey} (ID for custom, key for template), textSource: ${textSource}`
        );
        // Ставим задачу генерации в очередь (без синхронного ожидания).
        // Это защищает от гонок при быстрых изменениях настроек.
        void enqueueAiTextGenerationJob({
          userId,
          preferenceId: created.id,
          reason: 'prefs_create',
          configHash: newConfigHash,
        });
      } else {
        // Если AI-тексты не нужны (textSource !== 'ai'),
        // генерируем слоты в фоне, чтобы не держать ответ API
        runSlotsRegenerationInBackground({
          event,
          userId,
          kind,
          entityKey,
          forceTodaySlots: true,
          reason: 'prefs_changed',
        });
        console.log(
          `[NotificationPrefs] 🕒 Slot generation scheduled in background for new source (no AI): user ${userId}, kind: ${kind}${entityKey ? `, entityKey: ${entityKey}` : ''}`
        );
      }

      const response = {
        id: created.id,
        userId: created.userId,
        kind: created.kind as 'therapy' | 'habits',
        entityKey: created.entityKey ?? null,
        enabled: created.enabled,
        timesPerDay: created.timesPerDay,
        directness: created.directness as 'soft' | 'moderate' | 'hard',
        timezone: created.timezone,
        subtype: created.subtype as NotificationSubtype | null, // Возвращаем subtype для всех типов
        activeDays: (created.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
        customSlotTimes:
          (created.customSlotTimes as (number | null)[] | null) ?? null,
        timeRangeStart: created.timeRangeStart,
        timeRangeEnd: created.timeRangeEnd,
        customPromptNotification: created.customPromptNotification ?? null,
        meta: (created.meta as NotificationPreferenceMeta | null) ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };

      return response;
    }
  }
);
