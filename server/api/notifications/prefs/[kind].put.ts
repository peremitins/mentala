import { eq, and, isNull } from 'drizzle-orm';
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
import { regenerateSlotsForSource } from '@/server/application/notifications/scheduler.service';
import { generateNotificationTexts } from '@/server/application/notifications/ai-generation.service';
import { computeGenerationConfigHash } from '@/server/utils/notification-ai-config-hash';
import { userPreferences } from '@/server/infrastructure/db/schema';

function normalizeCustomSlotTimes(
  input: (number | null)[] | null | undefined,
  limit: number
): (number | null)[] | null {
  if (!input || limit <= 0) {
    return null;
  }

  const normalized = input
    .slice(0, limit)
    .map((value) =>
      value === null || value === undefined ? null : Math.round(value)
    );

  // Удаляем хвостовые null, чтобы не хранить лишние значения
  while (normalized.length && normalized[normalized.length - 1] === null) {
    normalized.pop();
  }

  return normalized.length ? normalized : null;
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
    const user = await getSessionUser(event);
    if (!user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = user.id;

    const kind = getRouterParam(event, 'kind');
    if (!kind || !['therapy', 'habits'].includes(kind)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid kind parameter',
      });
    }

    const body = await readBody<UpdateNotificationPreferencesDto>(event);

    // Валидация
    if (body.timesPerDay !== undefined) {
      if (body.timesPerDay < 1 || body.timesPerDay > 8) {
        throw createError({
          statusCode: 400,
          message: 'timesPerDay must be between 1 and 8',
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
        if (body.customSlotTimes.length > 8) {
          throw createError({
            statusCode: 400,
            message: 'customSlotTimes length must not exceed 8 entries',
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

    // ВАЖНО: Если AI-тексты генерируются и textSource === 'ai' или 'hybrid', НЕ регенерируем слоты сейчас
    // Слоты будут регенерированы после завершения AI-генерации
    // Объявляем переменную ДО блока if (existing), чтобы она была доступна ниже
    let shouldRegenerateSlotsAfterAi = false;

    if (existing) {
      const nextTimesPerDay = body.timesPerDay ?? existing.timesPerDay;
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
        ...(body.meta?.textSource !== undefined
          ? { textSource: body.meta.textSource }
          : {}),
      };

      // Убеждаемся, что meta не пустой объект (если есть хотя бы одно поле)
      const hasMetaFields = finalMeta.textSource !== undefined;

      const metaToSave = hasMetaFields ? finalMeta : null;

      let normalizedEntityKey = entityKey;

      // ВАЖНО: Обновляем название и описание ДО обновления настроек уведомлений
      // Это нужно для правильного вычисления хеша и пересоздания AI-текстов
      let nameChanged = false;
      let descriptionChanged = false;
      let updatedEntityId: string | null = null; // ID обновленной сущности (для обновления normalizedEntityKey)
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
              updatedEntityId = updatedHabit.id;
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
              updatedEntityId = updatedTopic.id;
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

      // Обновляем существующие
      const [updated] = await db
        .update(notificationPreferences)
        .set({
          enabled: body.enabled ?? existing.enabled,
          timesPerDay: body.timesPerDay ?? existing.timesPerDay,
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
        (metaForCheck.textSource === 'ai' ||
          metaForCheck.textSource === 'hybrid');

      console.log(
        `[NotificationPrefs] Checking AI regeneration: shouldRegenerateAi=${shouldRegenerateAi}, kind=${kind}, entityKey=${entityKey || 'none'}, textSource=${metaForCheck?.textSource}, metaToSave=${JSON.stringify(metaToSave)}`
      );

      if (shouldRegenerateAi) {
        // Проверяем, изменились ли параметры, влияющие на генерацию
        // Используем нормализованное значение для entityKey
        let finalEntityKey = normalizedEntityKey || '';

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

        const tone = (userPrefs?.tone as any) || 'neutral';
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
            // Готовый шаблон привычки (water, meditation, training и т.д.)
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

        const textSource: 'ai' | 'hybrid' =
          metaForCheck?.textSource === 'ai'
            ? 'ai'
            : metaForCheck?.textSource === 'hybrid'
              ? 'hybrid'
              : 'ai';

        console.log(
          `[NotificationPrefs] 🔍 Determined textSource: ${textSource}, isCustomEntity: ${isCustomEntity}, metaForCheck: ${JSON.stringify(metaForCheck)}`
        );

        // Для вычисления хеша используем subtype
        // Для кастомных привычек subtype всегда null
        // Для готовых шаблонов может быть 'mixed', 'reminder', 'informational', 'motivational'
        const nextSubtypeForHash = isCustomEntity ? null : nextSubtype;

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
        });

        console.log(
          `[NotificationPrefs] Computed new config hash: ${newConfigHash.substring(0, 8)}..., entityName: ${entityName}, entityDescription: ${entityDescription || 'null'}, directness: ${nextDirectness}, subtype: ${nextSubtypeForHash}, textSource: ${textSource}, kind: ${kind}`
        );

        // Вычисляем старый хеш из существующих настроек
        const oldMeta =
          (existing.meta as NotificationPreferenceMeta | null) || {};
        const oldDirectness = existing.directness;
        const oldSubtype = existing.subtype;
        const oldTextSource: 'ai' | 'hybrid' | undefined =
          oldMeta.textSource === 'ai'
            ? 'ai'
            : oldMeta.textSource === 'hybrid'
              ? 'hybrid'
              : undefined;

        // Если старый режим не был AI, то хеш не нужен (тексты не генерировались)
        let oldConfigHash: string | null = null;
        if (oldTextSource === 'ai' || oldTextSource === 'hybrid') {
          // Для кастомных привычек subtype всегда null в хеше
          const oldSubtypeForHash = isCustomEntity ? null : oldSubtype;
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
          });
        }

        // Генерируем только если хеш изменился или текстов еще нет
        // ВАЖНО: Если изменилось название или описание, обязательно пересоздаем AI-тексты
        const hashChanged = oldConfigHash !== newConfigHash;
        const needsAiGeneration =
          hashChanged || !oldConfigHash || nameChanged || descriptionChanged;

        // ВАЖНО: Если AI-тексты генерируются и textSource === 'ai' или 'hybrid', НЕ регенерируем слоты сейчас
        // Слоты будут регенерированы после завершения AI-генерации
        // Присваиваем значение переменной, объявленной выше
        shouldRegenerateSlotsAfterAi =
          needsAiGeneration && (textSource === 'ai' || textSource === 'hybrid');

        if (needsAiGeneration) {
          console.log(
            `[NotificationPrefs] Config hash changed or missing, generating AI texts: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey} (READABLE), oldHash: ${oldConfigHash?.substring(0, 8) || 'none'}..., newHash: ${newConfigHash.substring(0, 8)}...`
          );

          // Запускаем генерацию асинхронно (не блокируя ответ)
          console.log(
            `[NotificationPrefs] Calling generateNotificationTexts with entityKey: ${finalEntityKey}`
          );
          generateNotificationTexts({
            userId,
            preferenceId: existing.id,
            kind: kind as 'habits' | 'therapy',
            entityKey: finalEntityKey, // ID для кастомных, ключ шаблона для шаблонных
            directness: nextDirectness as 'soft' | 'moderate' | 'hard',
            subtype: nextSubtypeForHash as
              | 'reminder'
              | 'informational'
              | 'motivational'
              | 'mixed'
              | null,
            textSource,
            count: 50, // ВАЖНО: Всегда 50 текстов при перегенерации
            habitIntent: kind === 'habits' ? habitIntent : undefined, // Передаем intent для привычек
          })
            .then(async (result) => {
              console.log(
                `[NotificationPrefs] ✅ AI texts generated: ${result.texts.length} texts, provider: ${result.provider}, model: ${result.model}`
              );
              // Небольшая задержка, чтобы убедиться, что тексты сохранились в БД
              await new Promise((resolve) => setTimeout(resolve, 1000));
              // После генерации AI-текстов регенерируем слоты
              // Используем нормализованные (читаемые) значения для поиска настроек
              return regenerateSlotsForSource(
                userId,
                kind as 'therapy' | 'habits',
                {
                  entityKey: normalizedEntityKey || undefined,
                }
              );
            })
            .then(() => {
              console.log(
                `[NotificationPrefs] ✅ Slots regenerated after AI generation: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
              );
            })
            .catch(async (error) => {
              console.error(
                `[NotificationPrefs] ❌ Failed to generate AI texts:`,
                error
              );
              // ВАЖНО: Даже если генерация AI-текстов завершилась с ошибкой,
              // нужно перегенерировать слоты, чтобы использовать доступные тексты (шаблоны для hybrid)
              console.log(
                `[NotificationPrefs] Regenerating slots anyway (may use templates only): user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
              );
              try {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await regenerateSlotsForSource(
                  userId,
                  kind as 'therapy' | 'habits',
                  {
                    entityKey: normalizedEntityKey || undefined,
                  }
                );
                console.log(
                  `[NotificationPrefs] ✅ Slots regenerated after AI generation error: user ${userId}, kind: ${kind}`
                );
              } catch (slotError) {
                console.error(
                  `[NotificationPrefs] ❌ Failed to regenerate slots after AI error:`,
                  slotError
                );
              }
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
        body.meta?.textSource !== undefined;

      if (settingsChanged && !shouldRegenerateSlotsAfterAi) {
        try {
          await regenerateSlotsForSource(userId, kind as 'therapy' | 'habits', {
            entityKey: normalizedEntityKey || undefined,
          });
          console.log(
            `[NotificationPrefs] Slots regenerated for source: user ${userId}, kind: ${kind}`,
            entityKey ? `, entityKey: ${entityKey}` : ''
          );
        } catch (error) {
          console.error(
            `[NotificationPrefs] Failed to regenerate slots:`,
            error
          );
        }
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
      const initialTimesPerDay = body.timesPerDay ?? 3;
      const initialCustomSlotTimes = normalizeCustomSlotTimes(
        body.customSlotTimes ?? null,
        initialTimesPerDay
      );
      let normalizedEntityKey = entityKey;

      if (kind === 'habits' && entityKey) {
        // Для кастомных сущностей entityKey должен быть ID
        const [habit] = await db
          .select({ id: habits.id, intent: habits.intent })
          .from(habits)
          .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
          .limit(1);
        // Для кастомных привычек используем ID
        if (habit) {
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

      // Формируем initialMeta: только textSource из body.meta
      const initialMeta =
        kind === 'habits' || kind === 'therapy'
          ? (() => {
              const meta: NotificationPreferenceMeta = {};

              // Сохраняем textSource из body.meta
              if (body.meta?.textSource !== undefined) {
                meta.textSource = body.meta.textSource;
              }

              // Возвращаем meta только если есть хотя бы одно поле
              return meta.textSource !== undefined ? meta : null;
            })()
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
        })
        .returning();

      // Проверяем, нужно ли генерировать AI-тексты для новых настроек
      const shouldGenerateAi =
        (kind === 'habits' || kind === 'therapy') &&
        entityKey && // Только для конкретных сущностей
        initialMeta &&
        (initialMeta.textSource === 'ai' ||
          initialMeta.textSource === 'hybrid');

      if (shouldGenerateAi) {
        // ВАЖНО: Для кастомных сущностей entityKey = ID, для шаблонных = ключ шаблона
        // normalizedEntityKey уже вычислено выше (ID для кастомных, ключ для шаблонных)
        const finalEntityKey = normalizedEntityKey || entityKey || '';

        // Определяем textSource
        const textSource: 'ai' | 'hybrid' =
          initialMeta.textSource === 'ai'
            ? 'ai'
            : initialMeta.textSource === 'hybrid'
              ? 'hybrid'
              : 'ai';

        // Определяем isCustomEntity для вычисления subtype и habitIntent
        let isCustomEntity = false;
        let habitIntent: 'quit' | 'build' | null = null;
        if (kind === 'habits' && entityKey) {
          // Для кастомных сущностей entityKey = ID
          const [habit] = await db
            .select()
            .from(habits)
            .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
            .limit(1);
          isCustomEntity = !!habit;
          if (habit) {
            habitIntent = habit.intent as 'quit' | 'build' | null;
          } else {
            // Готовый шаблон - берем intent из каталога
            const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
            const catalogHabit = findHabitByKey(entityKey);
            habitIntent = catalogHabit ? catalogHabit.intent : null;
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
          isCustomEntity = !!topic;
        }

        // Для вычисления хеша используем subtype
        // Для кастомных привычек subtype всегда null
        const initialSubtypeForHash = isCustomEntity ? null : initialSubtype;

        const initialDirectness = body.directness ?? 'moderate';

        console.log(
          `[NotificationPrefs] Preparing AI generation for NEW preference: kind=${kind}, original entityKey=${entityKey || 'none'}, normalizedEntityKey=${normalizedEntityKey || 'none'}, finalEntityKey=${finalEntityKey} (ID for custom, key for template)`
        );

        // Запускаем генерацию асинхронно
        // ВАЖНО: finalEntityKey для кастомных сущностей = ID, для шаблонных = ключ шаблона
        console.log(
          `[NotificationPrefs] Starting AI text generation for NEW preference: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey} (ID for custom, key for template), textSource: ${textSource}`
        );
        generateNotificationTexts({
          userId,
          preferenceId: created.id,
          kind: kind as 'habits' | 'therapy',
          entityKey: finalEntityKey, // ID для кастомных, ключ шаблона для шаблонных
          directness: initialDirectness as 'soft' | 'moderate' | 'hard',
          subtype: initialSubtypeForHash as
            | 'reminder'
            | 'informational'
            | 'motivational'
            | 'mixed'
            | null,
          textSource,
          count: 50, // ВАЖНО: Всегда 50 текстов при создании нового preference
          habitIntent: kind === 'habits' ? habitIntent : undefined, // Передаем intent для привычек
        })
          .then(async (result) => {
            console.log(
              `[NotificationPrefs] ✅ AI texts generated for new preference: ${result.texts.length} texts, provider: ${result.provider}, model: ${result.model}`
            );
            // Небольшая задержка, чтобы убедиться, что тексты сохранились в БД
            await new Promise((resolve) => setTimeout(resolve, 1000));
            // После генерации AI-текстов регенерируем слоты
            // Используем нормализованные значения для поиска настроек
            return regenerateSlotsForSource(
              userId,
              kind as 'therapy' | 'habits',
              {
                entityKey: normalizedEntityKey || undefined,
              }
            );
          })
          .then(() => {
            console.log(
              `[NotificationPrefs] ✅ Slots regenerated after AI generation for new preference: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
            );
          })
          .catch(async (error) => {
            console.error(
              `[NotificationPrefs] ❌ Failed to generate AI texts for new preference:`,
              error
            );
            // ВАЖНО: Даже если генерация AI-текстов завершилась с ошибкой,
            // нужно перегенерировать слоты, чтобы использовать доступные тексты (шаблоны для hybrid)
            console.log(
              `[NotificationPrefs] Regenerating slots anyway (may use templates only): user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
            );
            try {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              await regenerateSlotsForSource(
                userId,
                kind as 'therapy' | 'habits',
                {
                  entityKey: normalizedEntityKey || undefined,
                }
              );
              console.log(
                `[NotificationPrefs] ✅ Slots regenerated after AI generation error: user ${userId}, kind: ${kind}`
              );
            } catch (slotError) {
              console.error(
                `[NotificationPrefs] ❌ Failed to regenerate slots after AI error:`,
                slotError
              );
            }
          });
      } else {
        // Если AI-тексты не нужны (textSource !== 'ai' && textSource !== 'hybrid'),
        // генерируем слоты сразу
        try {
          await regenerateSlotsForSource(userId, kind as 'therapy' | 'habits', {
            entityKey: normalizedEntityKey || undefined,
          });
          console.log(
            `[NotificationPrefs] Slots generated for new source (no AI): user ${userId}, kind: ${kind}`,
            entityKey ? `, entityKey: ${entityKey}` : ''
          );
        } catch (error) {
          console.error(`[NotificationPrefs] Failed to generate slots:`, error);
        }
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
        meta: (created.meta as NotificationPreferenceMeta | null) ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };

      return response;
    }
  }
);
