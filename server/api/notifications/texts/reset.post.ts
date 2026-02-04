import { eq, and } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationTexts,
  notificationTextPresets,
  habits,
  therapyTopicsCustom,
} from '@/server/infrastructure/db/schema';
import { getSessionUser } from '@/server/application/auth/session';
import type {
  ResetTextsRequest,
  ResetTextsResponse,
} from '@/shared/dto/notifications';
import { generateAllSlotsForUser } from '@/server/application/notifications/scheduler.service';
import { nanoid } from 'nanoid';

/**
 * POST /api/notifications/texts/reset
 * Восстановить дефолтные тексты
 *
 * Полностью перезаписывает все default-тексты значениями из presets
 * (любые правки пользователя в default-текстах теряются)
 *
 * Тексты существуют независимо от notificationPreferences.
 * Пользователь может сбросить тексты даже если уведомления выключены.
 */
export default defineEventHandler(
  async (event): Promise<ResetTextsResponse> => {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionResult.user.id;

    const body = (await readBody(event)) as ResetTextsRequest;

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

    const result = await db.transaction(async (tx) => {
      // 1. Проверяем наличие presets ДО удаления текстов
      // Если пресетов нет - операция reset недоступна
      const presets = await tx
        .select()
        .from(notificationTextPresets)
        .where(
          and(
            eq(notificationTextPresets.kind, body.kind),
            eq(notificationTextPresets.entityKey, normalizedEntityKey)
          )
        );

      if (presets.length === 0) {
        throw createError({
          statusCode: 404,
          message: 'No presets found for this entity. Reset is not available.',
        });
      }

      // 2. Удаляем default-тексты пользователя (не глобальные!)
      await tx
        .update(notificationTexts)
        .set({
          isDeleted: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notificationTexts.kind, body.kind),
            eq(notificationTexts.entityKey, normalizedEntityKey),
            eq(notificationTexts.userId, userId), // ТОЛЬКО тексты пользователя
            eq(notificationTexts.source, 'default') // Только default
          )
        );

      // 3. Копируем из presets в тексты пользователя (с userId = userId, не null!)
      // Bulk insert для производительности
      // Используем onConflictDoNothing для защиты от дублей при гонках
      const now = new Date();
      let restoredCount = 0;

      if (presets.length > 0) {
        await tx
          .insert(notificationTexts)
          .values(
            presets.map((preset) => ({
              id: nanoid(),
              kind: preset.kind,
              entityKey: preset.entityKey,
              userId: userId, // НЕ null! Персональная копия пользователя
              source: 'default' as const,
              intent: preset.intent,
              subtype: preset.subtype,
              imageTag: preset.imageTag ?? null,
              directness: preset.directness,
              addressing: preset.addressing,
              locale: preset.locale,
              text: preset.text,
              sortOrder: preset.sortOrder,
              isDeleted: false,
              createdAt: now,
              updatedAt: now,
            }))
          )
          .onConflictDoNothing();
        restoredCount = presets.length;
      }

      // 4. Если keepUserTexts = false, удаляем пользовательские тексты
      if (!body.keepUserTexts) {
        await tx
          .update(notificationTexts)
          .set({
            isDeleted: true,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(notificationTexts.kind, body.kind),
              eq(notificationTexts.entityKey, normalizedEntityKey),
              eq(notificationTexts.userId, userId),
              eq(notificationTexts.source, 'user')
            )
          );
      }

      return {
        restoredDefaults: restoredCount,
        userTextsKept: body.keepUserTexts,
      };
    });

    // ВАЖНО: После восстановления дефолтных текстов регенерируем слоты для этого источника
    // Это гарантирует, что старые тексты не останутся в расписании
    // Регенерируем асинхронно, не блокируя ответ
    (async () => {
      try {
        // ВАЖНО: Используем глобальную оркестрацию для правильного чередования тем
        await generateAllSlotsForUser(userId);
        console.log(
          `[NotificationTexts] ✅ Slots regenerated after reset: user ${userId}, kind: ${body.kind}, entityKey: ${normalizedEntityKey}`
        );
      } catch (error) {
        console.error(
          `[NotificationTexts] ❌ Failed to regenerate slots after reset:`,
          error
        );
      }
    })();

    return result;
  }
);
