import { eq, and, asc } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationTexts,
  userPreferences,
  habits,
  therapyTopicsCustom,
} from '@/server/infrastructure/db/schema';
import { getSessionUser } from '@/server/application/auth/session';
import type {
  BatchTextsRequest,
  NotificationTextIntent,
  NotificationSubtype,
} from '@/shared/dto/notifications';
import { MAX_NOTIFICATION_TEXT_LENGTH } from '@/shared/dto/notifications';
import { nanoid } from 'nanoid';
import { generateAllSlotsForUser } from '@/server/application/notifications/scheduler.service';
import { ensureUserTextsInitialized } from '@/server/application/notifications/initialize-texts.service';

const IMAGE_TAGS = new Set([
  'harm_organs',
  'harm_appearance',
  'harm_mental',
  'activity',
  'nature',
  'meditation',
  'daily_life',
  'neutral_abstract',
]);

function normalizeImageTag(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');
  if (!normalized) return null;
  const resolved = normalized === 'neutral' ? 'neutral_abstract' : normalized;
  return IMAGE_TAGS.has(resolved) ? resolved : null;
}

/**
 * PUT /api/notifications/texts/batch
 * Batch-сохранение изменений (основной эндпоинт)
 *
 * Все изменения (создание, обновление, удаление) накапливаются локально
 * и отправляются одним запросом при нажатии общей кнопки «Сохранить»
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionResult.user.id;

  const body = (await readBody(event)) as BatchTextsRequest;

  // Валидация
  if (!body.kind || !['habits', 'therapy'].includes(body.kind)) {
    throw createError({
      statusCode: 400,
      message: 'kind must be "habits" or "therapy"',
    });
  }

  if (!body.entityKey || body.entityKey.trim() === '') {
    throw createError({
      statusCode: 400,
      message: 'entityKey is required',
    });
  }

  // Политика доступа: тексты полностью независимы от notificationPreferences
  // Проверяем только принадлежность кастомных сущностей пользователю
  // Для готовых шаблонов (templates) проверка не требуется - они доступны всем
  let normalizedEntityKey = body.entityKey;

  if (body.kind === 'habits') {
    // Проверяем, является ли entityKey кастомной привычкой пользователя
    const [habit] = await db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.id, body.entityKey), eq(habits.userId, userId)))
      .limit(1);

    if (habit) {
      normalizedEntityKey = habit.id;
    }
    // Если не найдена - считаем template entityKey, используем как есть
  } else if (body.kind === 'therapy') {
    // Проверяем, является ли entityKey кастомной темой пользователя
    const [topic] = await db
      .select({ id: therapyTopicsCustom.id })
      .from(therapyTopicsCustom)
      .where(
        and(
          eq(therapyTopicsCustom.id, body.entityKey),
          eq(therapyTopicsCustom.userId, userId)
        )
      )
      .limit(1);

    if (topic) {
      normalizedEntityKey = topic.id;
    }
    // Если не найдена - считаем template entityKey, используем как есть
  }

  // Получаем addressing из глобальных настроек пользователя
  const userPrefs = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const addressing =
    (userPrefs[0]?.addressing as 'informal' | 'formal') || 'informal';

  // Выполняем все операции в транзакции
  const result = await db.transaction(async (tx) => {
    // Инициализируем тексты, если их еще нет (lazy init)
    // Тексты существуют независимо от notificationPreferences
    //
    // ВАЖНО: Freeze-модель пресетов
    // После первой инициализации текстов для сущности, ensureUserTextsInitialized
    // больше не будет добавлять новые пресеты из notificationTextPresets.
    // Это означает, что:
    // - Новые пресеты, добавленные в БД после инициализации, НЕ попадут к существующим пользователям
    // - Для обновления текстов существующих пользователей нужно использовать:
    //   * reset-эндпоинт (восстановление из пресетов)
    //   * Специальные миграции (массовое обновление)
    // - Новые пользователи получат все актуальные пресеты при первой инициализации
    await ensureUserTextsInitialized(
      userId,
      body.kind as 'habits' | 'therapy',
      normalizedEntityKey
    );
    // 1. Обработка updated
    if (body.changes.updated && body.changes.updated.length > 0) {
      for (const update of body.changes.updated) {
        // Проверяем существование и права доступа с полной проверкой
        // Защита от доступа к текстам другой сущности и "реанимации" удаленных
        const existing = await tx
          .select()
          .from(notificationTexts)
          .where(
            and(
              eq(notificationTexts.id, update.id),
              eq(notificationTexts.userId, userId),
              eq(notificationTexts.kind, body.kind),
              eq(notificationTexts.entityKey, normalizedEntityKey),
              eq(notificationTexts.isDeleted, false) // Защита от "реанимации" удаленных
            )
          )
          .limit(1);

        if (existing.length === 0) {
          throw createError({
            statusCode: 404,
            message: `Text with id ${update.id} not found or access denied`,
          });
        }

        const text = existing[0];
        // Проверка isUserText больше не нужна - мы уже проверили userId в where

        // Валидация текста
        if (update.text !== undefined) {
          if (update.text.length === 0) {
            throw createError({
              statusCode: 400,
              message: `Text cannot be empty for id ${update.id}`,
            });
          }
          if (update.text.length > MAX_NOTIFICATION_TEXT_LENGTH) {
            throw createError({
              statusCode: 400,
              message: `Text exceeds maximum length (${MAX_NOTIFICATION_TEXT_LENGTH}) for id ${update.id}`,
            });
          }
        }

        const nextImageTag =
          update.imageTag !== undefined
            ? normalizeImageTag(update.imageTag)
            : text.imageTag ?? null;

        // Обновляем
        await tx
          .update(notificationTexts)
          .set({
            text: update.text !== undefined ? update.text : text.text,
            imageTag: nextImageTag,
            updatedAt: new Date(),
          })
          .where(eq(notificationTexts.id, update.id));
      }
    }

    // 2. Обработка created
    if (body.changes.created && body.changes.created.length > 0) {
      for (const create of body.changes.created) {
        // Валидация
        if (!create.text || create.text.trim().length === 0) {
          throw createError({
            statusCode: 400,
            message: 'Text cannot be empty for new entry',
          });
        }

        if (create.text.length > MAX_NOTIFICATION_TEXT_LENGTH) {
          throw createError({
            statusCode: 400,
            message: `Text exceeds maximum length (${MAX_NOTIFICATION_TEXT_LENGTH})`,
          });
        }

        if (
          !['soft', 'moderate', 'hard', 'universal'].includes(create.directness)
        ) {
          throw createError({
            statusCode: 400,
            message: 'Invalid directness value',
          });
        }

        if (create.locale !== 'ru') {
          throw createError({
            statusCode: 400,
            message: 'Only "ru" locale is supported',
          });
        }

        if (body.kind === 'habits') {
          if (create.intent && !['build', 'quit'].includes(create.intent)) {
            throw createError({
              statusCode: 400,
              message: 'Invalid intent value for habits',
            });
          }
        }

        if (
          create.subtype &&
          !['reminder', 'informational', 'motivational', 'mixed'].includes(
            create.subtype
          )
        ) {
          throw createError({
            statusCode: 400,
            message: 'Invalid subtype value',
          });
        }

        // Вставляем новую запись
        const newId = nanoid();
        await tx.insert(notificationTexts).values({
          id: newId,
          kind: body.kind,
          entityKey: normalizedEntityKey,
          userId: userId,
          source: 'user',
          intent: create.intent || null,
          subtype: create.subtype || null,
          imageTag: normalizeImageTag(create.imageTag),
          directness: create.directness,
          addressing: addressing, // Берем из глобальных настроек пользователя
          locale: create.locale,
          text: create.text,
          sortOrder: 0, // Не используется для сортировки, оставляем для совместимости
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // 3. Обработка deleted
    if (body.changes.deleted && body.changes.deleted.length > 0) {
      for (const del of body.changes.deleted) {
        // Проверяем существование и права доступа с полной проверкой
        // Защита от доступа к текстам другой сущности
        const existing = await tx
          .select()
          .from(notificationTexts)
          .where(
            and(
              eq(notificationTexts.id, del.id),
              eq(notificationTexts.userId, userId),
              eq(notificationTexts.kind, body.kind),
              eq(notificationTexts.entityKey, normalizedEntityKey),
              eq(notificationTexts.isDeleted, false) // Можно удалять только активные
            )
          )
          .limit(1);

        if (existing.length === 0) {
          continue; // Уже удалено или не найдено, пропускаем
        }

        // Логическое удаление
        await tx
          .update(notificationTexts)
          .set({
            isDeleted: true,
            updatedAt: new Date(),
          })
          .where(eq(notificationTexts.id, del.id));
      }
    }

    // 4. Возвращаем актуальный список текстов (только тексты пользователя)
    const texts = await tx
      .select()
      .from(notificationTexts)
      .where(
        and(
          eq(notificationTexts.kind, body.kind),
          eq(notificationTexts.entityKey, normalizedEntityKey),
          eq(notificationTexts.userId, userId), // ТОЛЬКО тексты пользователя
          eq(notificationTexts.locale, 'ru'), // Пока только русская локаль
          eq(notificationTexts.isDeleted, false)
        )
      )
      .orderBy(
        // Сначала default (source='default'), потом custom (source='user')
        // Внутри каждой группы: по sortOrder, потом по дате создания
        asc(notificationTexts.source),
        asc(notificationTexts.sortOrder),
        asc(notificationTexts.createdAt)
      );

    const items = texts.map((text) => ({
      id: text.id,
      kind: text.kind as 'habits' | 'therapy',
      entityKey: text.entityKey,
      userId: text.userId,
      source: text.source as 'default' | 'user',
      intent: text.intent as NotificationTextIntent | null,
      subtype: text.subtype as NotificationSubtype | null,
      imageTag: text.imageTag ?? null,
      directness: text.directness as 'soft' | 'moderate' | 'hard' | 'universal',
      addressing: text.addressing as 'informal' | 'formal' | 'universal',
      locale: text.locale,
      text: text.text,
      sortOrder: text.sortOrder,
      isDeleted: text.isDeleted,
      createdAt: text.createdAt.toISOString(),
      updatedAt: text.updatedAt.toISOString(),
    }));

    return { items };
  });

  // ВАЖНО: После изменения текстов регенерируем слоты для этого источника
  // Это гарантирует, что старые тексты не останутся в расписании
  const hasChanges =
    (body.changes.created && body.changes.created.length > 0) ||
    (body.changes.updated && body.changes.updated.length > 0) ||
    (body.changes.deleted && body.changes.deleted.length > 0);

  if (hasChanges) {
    // Регенерируем слоты асинхронно, не блокируя ответ
    (async () => {
      try {
        // ВАЖНО: Используем глобальную оркестрацию для правильного чередования тем
        await generateAllSlotsForUser(userId);
        console.log(
          `[NotificationTexts] ✅ Slots regenerated after text changes: user ${userId}, kind: ${body.kind}, entityKey: ${normalizedEntityKey}`
        );
      } catch (error) {
        console.error(
          `[NotificationTexts] ❌ Failed to regenerate slots after text changes:`,
          error
        );
      }
    })();
  }

  return result;
});
