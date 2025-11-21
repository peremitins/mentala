import { eq, and, isNull, or, gt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  notificationPreferences,
  habits,
  therapyTopicsCustom,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  HabitSubtype,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
  NotificationPreferenceMeta,
} from '@/shared/dto/notifications';
import {
  MAX_CUSTOM_NOTIFICATION_TEXTS,
  MAX_NOTIFICATION_TEXT_LENGTH,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';
import { regenerateSlotsForSource } from '@/server/application/notifications/scheduler.service';
import type { NotificationKind } from '@/app/lib/notificationTemplates';
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
const HABIT_SUBTYPES: HabitSubtype[] = [
  'reminder',
  'informational',
  'motivational',
  'mixed',
];

function sanitizeCustomTextsInput(
  input: string[] | null | undefined
): string[] | null {
  if (input === undefined || input === null) {
    return null;
  }

  if (!Array.isArray(input)) {
    throw createError({
      statusCode: 400,
      message: 'customTexts must be an array of strings or null',
    });
  }

  const cleaned: string[] = [];

  for (const raw of input) {
    if (typeof raw !== 'string') {
      throw createError({
        statusCode: 400,
        message: 'customTexts must contain only strings',
      });
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.length > MAX_NOTIFICATION_TEXT_LENGTH) {
      throw createError({
        statusCode: 400,
        message: `Текст уведомления не должен превышать ${MAX_NOTIFICATION_TEXT_LENGTH} символов`,
      });
    }

    cleaned.push(trimmed);

    if (cleaned.length > MAX_CUSTOM_NOTIFICATION_TEXTS) {
      throw createError({
        statusCode: 400,
        message: `Можно сохранить не более ${MAX_CUSTOM_NOTIFICATION_TEXTS} текстов`,
      });
    }
  }

  return cleaned.length ? cleaned : null;
}

function hasCustomTextsUpdate(meta?: NotificationPreferenceMeta | null) {
  if (!meta) return false;
  return Object.prototype.hasOwnProperty.call(meta, 'customTexts');
}

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
      if (kind !== 'habits' && body.subtype !== null) {
        throw createError({
          statusCode: 400,
          message: 'subtype is only supported for habits',
        });
      }

      if (
        body.subtype !== null &&
        !HABIT_SUBTYPES.includes(body.subtype as HabitSubtype)
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
    // ВАЖНО: entityKey в body может быть как slug, так и ID
    // В БД может храниться как slug, так и ID (для обратной совместимости)
    // Поэтому ищем по обоим вариантам
    const conditions = [
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.kind, kind),
    ];

    if (entityKey) {
      // Ищем настройки, где entityKey совпадает с переданным значением (slug или ID)
      // Также проверяем, может ли переданное значение быть slug для кастомной сущности
      // или ID, который нужно сопоставить со slug в БД
      if (kind === 'habits') {
        const [habit] = await db
          .select({ id: habits.id, slug: habits.slug, intent: habits.intent })
          .from(habits)
          .where(
            and(
              or(eq(habits.id, entityKey), eq(habits.slug, entityKey)),
              eq(habits.userId, userId)
            )
          )
          .limit(1);

        if (habit) {
          // Нашли привычку - используем и ID, и slug для поиска настроек
          // (в БД может храниться любой из них)
          const habitSlug = habit.slug;
          if (habitSlug && typeof habitSlug === 'string') {
            const entityKeyOr = or(
              eq(notificationPreferences.entityKey, habit.id),
              eq(notificationPreferences.entityKey, habitSlug)
            );
            if (entityKeyOr) {
              conditions.push(entityKeyOr);
            } else {
              conditions.push(eq(notificationPreferences.entityKey, habit.id));
            }
          } else {
            conditions.push(eq(notificationPreferences.entityKey, habit.id));
          }
        } else {
          // Привычка не найдена - возможно, это готовый шаблон
          // Ищем напрямую по переданному значению
          conditions.push(eq(notificationPreferences.entityKey, entityKey));
        }
      } else if (kind === 'therapy') {
        // Аналогично для терапии
        const [topic] = await db
          .select({
            id: therapyTopicsCustom.id,
            slug: therapyTopicsCustom.slug,
          })
          .from(therapyTopicsCustom)
          .where(
            and(
              or(
                eq(therapyTopicsCustom.id, entityKey),
                eq(therapyTopicsCustom.slug, entityKey)
              ),
              eq(therapyTopicsCustom.userId, userId)
            )
          )
          .limit(1);

        if (topic) {
          // Нашли тему - используем и ID, и slug для поиска настроек
          const topicSlug = topic.slug;
          if (topicSlug && typeof topicSlug === 'string') {
            const entityKeyOr = or(
              eq(notificationPreferences.entityKey, topic.id),
              eq(notificationPreferences.entityKey, topicSlug)
            );
            if (entityKeyOr) {
              conditions.push(entityKeyOr);
            } else {
              conditions.push(eq(notificationPreferences.entityKey, topic.id));
            }
          } else {
            conditions.push(eq(notificationPreferences.entityKey, topic.id));
          }
        } else {
          // Тема не найдена - возможно, это готовый шаблон
          // Ищем напрямую по переданному значению
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
      // ВАЖНО: Для кастомных привычек subtype всегда null
      // Определяем isCustomHabitForUpdate ДО вычисления nextSubtype
      let isCustomHabitForSubtype = false;
      if (kind === 'habits' && entityKey) {
        const [habitForSubtype] = await db
          .select({ intent: habits.intent })
          .from(habits)
          .where(
            and(
              or(eq(habits.id, entityKey), eq(habits.slug, entityKey)),
              eq(habits.userId, userId)
            )
          )
          .limit(1);
        isCustomHabitForSubtype = habitForSubtype?.intent === 'custom';
      }

      const nextSubtype =
        kind === 'habits' && !isCustomHabitForSubtype
          ? body.subtype !== undefined
            ? body.subtype
            : (existing.subtype as HabitSubtype | null)
          : null;
      const existingMeta =
        (existing.meta as NotificationPreferenceMeta | null) ?? null;
      const shouldUpdateMeta =
        (kind === 'habits' || kind === 'therapy') &&
        hasCustomTextsUpdate(body.meta ?? null);
      let nextMeta: NotificationPreferenceMeta | null | undefined = undefined;

      if (shouldUpdateMeta) {
        const sanitizedCustomTexts = sanitizeCustomTextsInput(
          body.meta?.customTexts ?? null
        );
        // Если customTexts - пустой массив, это означает режим AI, сохраняем как пустой массив
        // Если customTexts - null или undefined, не обновляем
        if (body.meta?.customTexts !== undefined) {
          nextMeta = sanitizedCustomTexts
            ? { customTexts: sanitizedCustomTexts }
            : { customTexts: [] }; // Пустой массив для режима AI
        } else {
          nextMeta = undefined; // Не обновляем customTexts
        }
      }

      // Объединяем существующие meta с новыми (textSource)
      const finalMeta: NotificationPreferenceMeta = {
        ...(existingMeta || {}),
        ...(body.meta || {}),
        ...(nextMeta !== undefined
          ? { customTexts: nextMeta?.customTexts }
          : {}),
      };

      // Убеждаемся, что meta не пустой объект (если есть хотя бы одно поле)
      const hasMetaFields =
        finalMeta.textSource !== undefined ||
        finalMeta.customTexts !== undefined;

      const metaToSave = hasMetaFields ? finalMeta : null;

      // Определяем, кастомная ли это привычка, чтобы правильно обработать subtype
      // Также нормализуем entityKey для читаемости (используем slug для кастомных сущностей)
      let isCustomHabitForUpdate = false;
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
        const [habit] = await db
          .select({
            intent: habits.intent,
            slug: habits.slug,
            id: habits.id,
            name: habits.name,
            description: habits.description,
          })
          .from(habits)
          .where(
            and(
              or(eq(habits.id, entityKey), eq(habits.slug, entityKey)),
              eq(habits.userId, userId)
            )
          )
          .limit(1);
        isCustomHabitForUpdate = habit?.intent === 'custom';

        // Сохраняем старые значения ДО обновления
        if (habit) {
          oldEntityNameBeforeUpdate = habit.name;
          oldEntityDescriptionBeforeUpdate = habit.description;
        }

        // Обновляем название и описание, если они переданы
        // ВАЖНО: Slug не меняется при изменении названия, чтобы избежать проблем с routing
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

          if (body.name !== undefined && body.name.trim() !== habit.name) {
            updateData.name = body.name.trim();
            nameChanged = true;

            console.log(
              `[NotificationPrefs] Updating habit name: "${habit.name}" -> "${updateData.name}" (slug remains unchanged: "${habit.slug || 'none'}")`
            );
          }

          if (body.description !== undefined) {
            const newDescription = body.description?.trim() || null;
            if (newDescription !== habit.description) {
              updateData.description = newDescription;
              descriptionChanged = true;
              console.log(
                `[NotificationPrefs] Updating habit description: "${habit.description || 'null'}" -> "${newDescription || 'null'}"`
              );
            }
          }

          if (nameChanged || descriptionChanged) {
            const [updatedHabit] = await db
              .update(habits)
              .set(updateData)
              .where(eq(habits.id, habit.id))
              .returning();

            if (updatedHabit) {
              updatedEntityId = updatedHabit.id;
              // Используем существующий slug (не меняем его)
              if (updatedHabit.slug) {
                normalizedEntityKey = updatedHabit.slug;
              }
            }
          }
        }

        // Для кастомных привычек используем slug вместо id для читаемости
        if (habit && habit.intent === 'custom') {
          if (normalizedEntityKey === entityKey) {
            // Если normalizedEntityKey не обновился выше, используем существующий slug
            if (habit.slug) {
              normalizedEntityKey = habit.slug;
            } else {
              // Если slug отсутствует, генерируем его сразу
              console.warn(
                `[NotificationPrefs] Custom habit ${entityKey} has no slug, generating one...`
              );
              const { generateSlug } = await import('@/server/utils/slug');
              const existingHabits = await db
                .select({ slug: habits.slug })
                .from(habits)
                .where(eq(habits.userId, userId));
              const existingSlugs = existingHabits
                .map((h) => h.slug)
                .filter((s): s is string => s !== null);
              const newSlug = generateSlug(
                habit.name || 'habit',
                existingSlugs
              );
              // Обновляем slug в БД
              await db
                .update(habits)
                .set({ slug: newSlug })
                .where(eq(habits.id, habit.id));
              normalizedEntityKey = newSlug;
              console.log(
                `[NotificationPrefs] Generated and saved slug for custom habit: ${newSlug}`
              );
            }
          }
        }
      } else if (kind === 'therapy' && entityKey) {
        // Для терапии entityKey уже должен быть читаемым (slug), но проверим
        const [topic] = await db
          .select({
            slug: therapyTopicsCustom.slug,
            id: therapyTopicsCustom.id,
            name: therapyTopicsCustom.name,
            description: therapyTopicsCustom.description,
          })
          .from(therapyTopicsCustom)
          .where(
            and(
              or(
                eq(therapyTopicsCustom.id, entityKey),
                eq(therapyTopicsCustom.slug, entityKey)
              ),
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
        // ВАЖНО: Slug не меняется при изменении названия, чтобы избежать проблем с routing
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

          if (body.name !== undefined && body.name.trim() !== topic.name) {
            updateData.name = body.name.trim();
            nameChanged = true;

            console.log(
              `[NotificationPrefs] Updating therapy topic name: "${topic.name}" -> "${updateData.name}" (slug remains unchanged: "${topic.slug || 'none'}")`
            );
          }

          if (body.description !== undefined) {
            const newDescription = body.description?.trim() || null;
            if (newDescription !== topic.description) {
              updateData.description = newDescription;
              descriptionChanged = true;
              console.log(
                `[NotificationPrefs] Updating therapy topic description: "${topic.description || 'null'}" -> "${newDescription || 'null'}"`
              );
            }
          }

          if (nameChanged || descriptionChanged) {
            const [updatedTopic] = await db
              .update(therapyTopicsCustom)
              .set(updateData)
              .where(eq(therapyTopicsCustom.id, topic.id))
              .returning();

            if (updatedTopic) {
              updatedEntityId = updatedTopic.id;
              // Используем существующий slug (не меняем его)
              if (updatedTopic.slug) {
                normalizedEntityKey = updatedTopic.slug;
              }
            }
          }
        }

        if (topic && topic.slug) {
          normalizedEntityKey = topic.slug;
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
          // Для кастомных привычек subtype всегда null в БД
          subtype: isCustomHabitForUpdate ? null : nextSubtype,
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
        // ВАЖНО: Используем нормализованное (читаемое) значение для entityKey
        // normalizedEntityKey уже вычислено выше и содержит slug для кастомных сущностей
        let finalEntityKey = normalizedEntityKey || '';

        console.log(
          `[NotificationPrefs] Preparing AI generation: kind=${kind}, original entityKey=${entityKey || 'none'}, normalizedEntityKey=${normalizedEntityKey || 'none'}, finalEntityKey=${finalEntityKey}`
        );

        // Если это кастомная привычка, используем slug вместо id
        if (kind === 'habits' && entityKey) {
          const [habit] = await db
            .select({
              slug: habits.slug,
              id: habits.id,
              intent: habits.intent,
              name: habits.name,
            })
            .from(habits)
            .where(
              and(
                or(eq(habits.id, entityKey), eq(habits.slug, entityKey)),
                eq(habits.userId, userId)
              )
            )
            .limit(1);
          if (habit) {
            if (habit.intent === 'custom' && habit.slug) {
              // Используем slug для кастомных привычек (читаемый ключ)
              finalEntityKey = habit.slug;
              console.log(
                `[NotificationPrefs] Using slug for custom habit: ${habit.slug} (original entityKey: ${entityKey})`
              );
            } else if (habit.intent === 'custom' && !habit.slug) {
              // Если slug не существует, генерируем его
              console.warn(
                `[NotificationPrefs] Custom habit ${entityKey} has no slug, generating one...`
              );
              const { generateSlug } = await import('@/server/utils/slug');
              const existingHabits = await db
                .select({ slug: habits.slug })
                .from(habits)
                .where(eq(habits.userId, userId));
              const existingSlugs = existingHabits
                .map((h) => h.slug)
                .filter((s): s is string => s !== null);
              const newSlug = await generateSlug(
                habit.name || 'habit',
                existingSlugs
              );
              // Обновляем slug в БД
              await db
                .update(habits)
                .set({ slug: newSlug })
                .where(eq(habits.id, habit.id));
              finalEntityKey = newSlug;
              console.log(
                `[NotificationPrefs] Generated and saved slug for custom habit: ${newSlug}`
              );
            }
          }
        }

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
        // Используем normalizedEntityKey/normalizedEntityKey для поиска (они уже обновлены если изменился slug)
        if (kind === 'habits' && normalizedEntityKey) {
          const [habit] = await db
            .select()
            .from(habits)
            .where(
              and(
                or(
                  eq(habits.id, normalizedEntityKey),
                  eq(habits.slug, normalizedEntityKey)
                ),
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
            // Используем сохраненные старые значения для вычисления старого хеша
            oldEntityName = oldEntityNameBeforeUpdate || habit.name;
            oldEntityDescription =
              oldEntityDescriptionBeforeUpdate !== null
                ? oldEntityDescriptionBeforeUpdate
                : habit.description;
            console.log(
              `[NotificationPrefs] 🔍 Found custom habit in DB: id=${habit.id}, slug=${habit.slug}, name="${habit.name}", intent=${habit.intent}, isCustomEntity=${isCustomEntity}, nameChanged=${nameChanged}, descriptionChanged=${descriptionChanged}`
            );
          } else {
            // Готовый шаблон привычки (water, meditation, training и т.д.)
            isCustomEntity = false;
            entityName = normalizedEntityKey;
            entityDescription = null;
            oldEntityName = normalizedEntityKey;
            oldEntityDescription = null;
            console.log(
              `[NotificationPrefs] 🔍 Habit not found in DB, treating as template: entityKey=${normalizedEntityKey}, isCustomEntity=${isCustomEntity}`
            );
          }
        } else if (kind === 'therapy' && normalizedEntityKey) {
          // Для терапии проверяем, кастомная ли это тема
          const [topic] = await db
            .select()
            .from(therapyTopicsCustom)
            .where(
              and(
                or(
                  eq(therapyTopicsCustom.id, normalizedEntityKey),
                  eq(therapyTopicsCustom.slug, normalizedEntityKey)
                ),
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
          });
        }

        // Генерируем только если хеш изменился или текстов еще нет
        // ВАЖНО: Если изменилось название или описание, обязательно пересоздаем AI-тексты
        const hashChanged = oldConfigHash !== newConfigHash;
        const needsAiGeneration =
          hashChanged || !oldConfigHash || nameChanged || descriptionChanged;

        // ВАЖНО: Если AI-тексты генерируются и textSource === 'ai' или 'hybrid', НЕ регенерируем слоты сейчас
        // Слоты будут регенерированы после завершения AI-генерации
        const shouldRegenerateSlotsAfterAi =
          needsAiGeneration && (textSource === 'ai' || textSource === 'hybrid');

        if (needsAiGeneration) {
          console.log(
            `[NotificationPrefs] Config hash changed or missing, generating AI texts: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey} (READABLE), oldHash: ${oldConfigHash?.substring(0, 8) || 'none'}..., newHash: ${newConfigHash.substring(0, 8)}...`
          );

          // Запускаем генерацию асинхронно (не блокируя ответ)
          // ВАЖНО: finalEntityKey должен быть читаемым (slug для кастомных привычек)
          console.log(
            `[NotificationPrefs] Calling generateNotificationTexts with entityKey: ${finalEntityKey} (should be readable slug for custom habits)`
          );
          generateNotificationTexts({
            userId,
            preferenceId: existing.id,
            kind: kind as 'habits' | 'therapy',
            entityKey: finalEntityKey, // Должен быть читаемым (slug для кастомных привычек)
            directness: nextDirectness as 'soft' | 'moderate' | 'hard',
            subtype: nextSubtypeForHash as
              | 'reminder'
              | 'informational'
              | 'motivational'
              | 'mixed'
              | null,
            textSource,
          })
            .then(async (result) => {
              console.log(
                `[NotificationPrefs] ✅ AI texts generated: ${result.texts.length} texts, provider: ${result.provider}, model: ${result.model}`
              );
              // Небольшая задержка, чтобы убедиться, что тексты сохранились в БД
              await new Promise((resolve) => setTimeout(resolve, 500));
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
            .catch((error) => {
              console.error(
                `[NotificationPrefs] ❌ Failed to generate AI texts or regenerate slots:`,
                error
              );
            });
        } else {
          console.log(
            `[NotificationPrefs] Config hash unchanged, skipping AI generation: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey}, hash: ${newConfigHash.substring(0, 8)}...`
          );
        }
      }

      // ВАЖНО: Если AI-тексты генерируются и textSource === 'ai' или 'hybrid', НЕ регенерируем слоты сейчас
      // Слоты будут регенерированы после завершения AI-генерации
      // Объявляем переменную вне блока, чтобы она была доступна ниже
      let shouldRegenerateSlotsAfterAi = false;

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
        (kind === 'habits' && body.subtype !== undefined) ||
        shouldUpdateMeta ||
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

      // ВАЖНО: Для кастомных привычек subtype всегда null в ответе
      const responseSubtype = isCustomHabitForUpdate
        ? null
        : (updated.subtype as HabitSubtype | null);

      const response = {
        id: updated.id,
        userId: updated.userId,
        kind: updated.kind as 'therapy' | 'habits',
        entityKey: updated.entityKey ?? null,
        enabled: updated.enabled,
        timesPerDay: updated.timesPerDay,
        directness: updated.directness as 'soft' | 'moderate' | 'hard',
        timezone: updated.timezone,
        subtype: responseSubtype, // Всегда null для кастомных привычек
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
      const timezone = body.timezone ?? 'Europe/Moscow';
      const initialTimesPerDay = body.timesPerDay ?? 3;
      const initialCustomSlotTimes = normalizeCustomSlotTimes(
        body.customSlotTimes ?? null,
        initialTimesPerDay
      );
      // Определяем, кастомная ли это привычка, чтобы правильно обработать subtype
      // Также нормализуем entityKey для читаемости (используем slug для кастомных сущностей)
      let isCustomHabitForCreate = false;
      let normalizedEntityKey = entityKey;

      if (kind === 'habits' && entityKey) {
        const [habit] = await db
          .select({ intent: habits.intent, slug: habits.slug })
          .from(habits)
          .where(
            and(
              or(eq(habits.id, entityKey), eq(habits.slug, entityKey)),
              eq(habits.userId, userId)
            )
          )
          .limit(1);
        isCustomHabitForCreate = habit?.intent === 'custom';
        // Для кастомных привычек используем slug вместо id для читаемости
        if (habit && habit.intent === 'custom' && habit.slug) {
          normalizedEntityKey = habit.slug;
        }
      } else if (kind === 'therapy' && entityKey) {
        // Для терапии entityKey уже должен быть читаемым (slug), но проверим
        const [topic] = await db
          .select({ slug: therapyTopicsCustom.slug })
          .from(therapyTopicsCustom)
          .where(
            and(
              or(
                eq(therapyTopicsCustom.id, entityKey),
                eq(therapyTopicsCustom.slug, entityKey)
              ),
              eq(therapyTopicsCustom.userId, userId)
            )
          )
          .limit(1);
        if (topic && topic.slug) {
          normalizedEntityKey = topic.slug;
        }
      }

      // Для кастомных привычек subtype всегда null в БД
      const initialSubtype =
        kind === 'habits' && !isCustomHabitForCreate
          ? (body.subtype ?? 'mixed')
          : null;

      // Формируем initialMeta: объединяем customTexts и textSource из body.meta
      const initialMeta =
        kind === 'habits' || kind === 'therapy'
          ? (() => {
              const sanitized = sanitizeCustomTextsInput(
                body.meta?.customTexts ?? null
              );
              const meta: NotificationPreferenceMeta = {};

              if (sanitized) {
                meta.customTexts = sanitized;
              }

              // Сохраняем textSource из body.meta
              if (body.meta?.textSource !== undefined) {
                meta.textSource = body.meta.textSource;
              }

              // Возвращаем meta только если есть хотя бы одно поле
              const hasFields =
                meta.customTexts !== undefined || meta.textSource !== undefined;

              return hasFields ? meta : null;
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
        // ВАЖНО: Используем нормализованное (читаемое) значение для entityKey
        // normalizedEntityKey уже вычислено выше и содержит slug для кастомных сущностей
        let finalEntityKey = normalizedEntityKey || '';

        // Дополнительная проверка: если это кастомная привычка без slug, генерируем его
        if (kind === 'habits' && entityKey && isCustomHabitForCreate) {
          const [habit] = await db
            .select({ slug: habits.slug, id: habits.id, name: habits.name })
            .from(habits)
            .where(
              and(
                or(eq(habits.id, entityKey), eq(habits.slug, entityKey)),
                eq(habits.userId, userId)
              )
            )
            .limit(1);
          if (habit && !habit.slug) {
            // Если slug отсутствует, генерируем его
            console.warn(
              `[NotificationPrefs] Custom habit ${entityKey} has no slug, generating one...`
            );
            const { generateSlug } = await import('@/server/utils/slug');
            const existingHabits = await db
              .select({ slug: habits.slug })
              .from(habits)
              .where(eq(habits.userId, userId));
            const existingSlugs = existingHabits
              .map((h) => h.slug)
              .filter((s): s is string => s !== null);
            const newSlug = generateSlug(habit.name || 'habit', existingSlugs);
            // Обновляем slug в БД
            await db
              .update(habits)
              .set({ slug: newSlug })
              .where(eq(habits.id, habit.id));
            finalEntityKey = newSlug;
            normalizedEntityKey = newSlug;
            console.log(
              `[NotificationPrefs] Generated and saved slug for custom habit: ${newSlug}`
            );
          } else if (habit && habit.slug) {
            finalEntityKey = habit.slug;
            normalizedEntityKey = habit.slug;
          }
        }

        console.log(
          `[NotificationPrefs] Preparing AI generation for NEW preference: kind=${kind}, original entityKey=${entityKey || 'none'}, normalizedEntityKey=${normalizedEntityKey || 'none'}, finalEntityKey=${finalEntityKey} (MUST BE READABLE)`
        );

        // Если это кастомная привычка, используем slug вместо id
        if (kind === 'habits' && entityKey) {
          const [habit] = await db
            .select({
              slug: habits.slug,
              id: habits.id,
              intent: habits.intent,
              name: habits.name,
            })
            .from(habits)
            .where(
              and(
                or(eq(habits.id, entityKey), eq(habits.slug, entityKey)),
                eq(habits.userId, userId)
              )
            )
            .limit(1);
          if (habit) {
            if (habit.intent === 'custom' && habit.slug) {
              // Используем slug для кастомных привычек (читаемый ключ)
              finalEntityKey = habit.slug;
              console.log(
                `[NotificationPrefs] Using slug for custom habit: ${habit.slug} (original entityKey: ${entityKey})`
              );
            } else if (habit.intent === 'custom' && !habit.slug) {
              // Если slug не существует, генерируем его
              console.warn(
                `[NotificationPrefs] Custom habit ${entityKey} has no slug, generating one...`
              );
              const { generateSlug } = await import('@/server/utils/slug');
              const existingHabits = await db
                .select({ slug: habits.slug })
                .from(habits)
                .where(eq(habits.userId, userId));
              const existingSlugs = existingHabits
                .map((h) => h.slug)
                .filter((s): s is string => s !== null);
              const newSlug = await generateSlug(
                habit.name || 'habit',
                existingSlugs
              );
              // Обновляем slug в БД
              await db
                .update(habits)
                .set({ slug: newSlug })
                .where(eq(habits.id, habit.id));
              finalEntityKey = newSlug;
              console.log(
                `[NotificationPrefs] Generated and saved slug for custom habit: ${newSlug}`
              );
            }
          }
        }

        const initialDirectness = body.directness ?? 'moderate';

        // Загружаем глобальные настройки пользователя
        const [userPrefs] = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        // Определяем textSource
        let isCustomEntity = false;

        if (kind === 'habits' && entityKey) {
          const [habit] = await db
            .select()
            .from(habits)
            .where(
              and(
                or(eq(habits.id, entityKey), eq(habits.slug, entityKey)),
                eq(habits.userId, userId)
              )
            )
            .limit(1);
          // ВАЖНО: Кастомная привычка - это любая привычка, найденная в БД (не шаблон)
          // Не проверяем intent === 'custom', так как у кастомных привычек может быть intent='build' или 'quit'
          isCustomEntity = !!habit;
          console.log(
            `[NotificationPrefs] 🔍 NEW preference - Found custom habit in DB: entityKey=${entityKey}, found=${!!habit}, intent=${habit?.intent}, isCustomEntity=${isCustomEntity}`
          );
        } else if (kind === 'therapy' && entityKey) {
          // Для терапии проверяем, кастомная ли это тема
          const [topic] = await db
            .select()
            .from(therapyTopicsCustom)
            .where(
              and(
                or(
                  eq(therapyTopicsCustom.id, entityKey),
                  eq(therapyTopicsCustom.slug, entityKey)
                ),
                eq(therapyTopicsCustom.userId, userId)
              )
            )
            .limit(1);
          isCustomEntity = !!topic;
        }

        const textSource: 'ai' | 'hybrid' =
          initialMeta.textSource === 'ai'
            ? 'ai'
            : initialMeta.textSource === 'hybrid'
              ? 'hybrid'
              : 'ai';

        console.log(
          `[NotificationPrefs] 🔍 Determined textSource for NEW preference: ${textSource}, isCustomEntity: ${isCustomEntity}, initialMeta: ${JSON.stringify(initialMeta)}`
        );

        // Для вычисления хеша используем subtype
        // Для кастомных привычек subtype всегда null
        // Для готовых шаблонов может быть 'mixed', 'reminder', 'informational', 'motivational'
        const initialSubtypeForHash = isCustomEntity ? null : initialSubtype;

        // Запускаем генерацию асинхронно
        // ВАЖНО: finalEntityKey должен быть читаемым (slug для кастомных привычек)
        console.log(
          `[NotificationPrefs] Starting AI text generation for NEW preference: user ${userId}, kind: ${kind}, entityKey: ${finalEntityKey} (should be readable slug for custom habits), textSource: ${textSource}`
        );
        generateNotificationTexts({
          userId,
          preferenceId: created.id,
          kind: kind as 'habits' | 'therapy',
          entityKey: finalEntityKey, // Должен быть читаемым (slug для кастомных привычек)
          directness: initialDirectness as 'soft' | 'moderate' | 'hard',
          subtype: initialSubtypeForHash as
            | 'reminder'
            | 'informational'
            | 'motivational'
            | 'mixed'
            | null,
          textSource,
        })
          .then(async (result) => {
            console.log(
              `[NotificationPrefs] ✅ AI texts generated for new preference: ${result.texts.length} texts, provider: ${result.provider}, model: ${result.model}`
            );
            // Небольшая задержка, чтобы убедиться, что тексты сохранились в БД
            await new Promise((resolve) => setTimeout(resolve, 500));
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
              `[NotificationPrefs] ✅ Slots regenerated after AI generation for new preference: user ${userId}, kind: ${kind}, entityKey: ${entityKey || 'none'}`
            );
          })
          .catch((error) => {
            console.error(
              `[NotificationPrefs] ❌ Failed to generate AI texts or regenerate slots for new preference:`,
              error
            );
          });
      }

      // Генерируем слоты для нового источника
      // Используем нормализованные (читаемые) значения для поиска настроек
      try {
        await regenerateSlotsForSource(userId, kind as 'therapy' | 'habits', {
          entityKey: normalizedEntityKey || undefined,
        });
        console.log(
          `[NotificationPrefs] Slots generated for new source: user ${userId}, kind: ${kind}`,
          entityKey ? `, entityKey: ${entityKey}` : ''
        );
      } catch (error) {
        console.error(`[NotificationPrefs] Failed to generate slots:`, error);
      }

      // ВАЖНО: Для кастомных привычек subtype всегда null в ответе
      const responseSubtype = isCustomHabitForCreate
        ? null
        : (created.subtype as HabitSubtype | null);

      const response = {
        id: created.id,
        userId: created.userId,
        kind: created.kind as 'therapy' | 'habits',
        entityKey: created.entityKey ?? null,
        enabled: created.enabled,
        timesPerDay: created.timesPerDay,
        directness: created.directness as 'soft' | 'moderate' | 'hard',
        timezone: created.timezone,
        subtype: responseSubtype, // Всегда null для кастомных привычек
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
