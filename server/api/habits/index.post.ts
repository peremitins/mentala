import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import {
  habits,
  notificationPreferences,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { HabitDto, CreateHabitDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * POST /api/habits
 * Создать новую привычку
 */
export default defineEventHandler(async (event): Promise<HabitDto> => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = user.id;

  const body = await readBody<CreateHabitDto>(event);

  // Валидация
  if (!body.name || body.name.trim().length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Habit name is required',
    });
  }

  if (!body.intent || !['build', 'quit', 'custom'].includes(body.intent)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid intent',
    });
  }

  const description = body.description?.trim() || null;

  const [created] = await db
    .insert(habits)
    .values({
      id: nanoid(),
      userId,
      name: body.name.trim(),
      intent: body.intent,
      habitKey: body.habitKey ?? null,
      emoji: body.emoji ?? null,
      description,
    })
    .returning();

  // Автоматически создаем настройки уведомлений с включенными уведомлениями
  // Только для кастомных привычек (intent === 'custom' или привычка найдена в БД)
  if (body.intent === 'custom' || !body.habitKey) {
    try {
      // Получаем timezone пользователя (по умолчанию Europe/Moscow)
      const timezone = 'Europe/Moscow'; // Можно получить из userPreferences в будущем

      await db.insert(notificationPreferences).values({
        id: nanoid(),
        userId,
        kind: 'habits',
        entityKey: created.id, // Используем ID для кастомных сущностей (стабильность)
        enabled: true, // Уведомления включены по умолчанию
        timesPerDay: 3, // Значение по умолчанию
        directness: 'moderate',
        timezone,
        subtype: null, // Для кастомных привычек subtype всегда null
        activeDays: [0, 1, 2, 3, 4, 5, 6], // Все дни недели
        customSlotTimes: null,
        timeRangeStart: 540, // 09:00
        timeRangeEnd: 1350, // 22:30
        meta: {
          textSource: 'templates', // По умолчанию templates (ручные тексты для кастомных)
        },
      });
      console.log(
        `[Habits] ✅ Auto-created notification preferences for habit: ${created.id} (enabled: true)`
      );
    } catch (error) {
      // Не критично, если не удалось создать настройки
      console.error(
        `[Habits] ⚠️ Failed to auto-create notification preferences for habit ${created.id}:`,
        error
      );
    }
  }

  return {
    id: created.id,
    name: created.name,
    intent: created.intent as 'build' | 'quit' | 'custom',
    habitKey: created.habitKey ?? null,
    emoji: created.emoji ?? null,
    description: created.description ?? null,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
});
