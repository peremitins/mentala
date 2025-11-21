import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import {
  therapyTopicsCustom,
  notificationPreferences,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  TherapyTopicDto,
  CreateTherapyTopicDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';
import { generateSlug } from '@/server/utils/slug';

/**
 * POST /api/therapy/custom
 * Создать пользовательскую тему терапии
 */
export default defineEventHandler(async (event): Promise<TherapyTopicDto> => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = user.id;

  const body = await readBody<CreateTherapyTopicDto>(event);
  if (!body.name || body.name.trim().length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Название обязательно',
    });
  }

  // Генерируем slug из названия
  const existingTopics = await db
    .select({ slug: therapyTopicsCustom.slug })
    .from(therapyTopicsCustom)
    .where(eq(therapyTopicsCustom.userId, userId));
  const existingSlugs = existingTopics
    .map((t) => t.slug)
    .filter((s): s is string => s !== null);
  const slug = generateSlug(body.name.trim(), existingSlugs);

  const [created] = await db
    .insert(therapyTopicsCustom)
    .values({
      id: nanoid(),
      userId,
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || null,
      emoji: body.emoji?.trim() || null,
    })
    .returning();

  // Автоматически создаем настройки уведомлений с включенными уведомлениями
  try {
    // Получаем timezone пользователя (по умолчанию Europe/Moscow)
    const timezone = 'Europe/Moscow'; // Можно получить из userPreferences в будущем

    await db.insert(notificationPreferences).values({
      id: nanoid(),
      userId,
      kind: 'therapy',
      entityKey: slug, // Используем slug для кастомных тем
      enabled: true, // Уведомления включены по умолчанию
      timesPerDay: 3, // Значение по умолчанию
      directness: 'moderate',
      timezone,
      subtype: null,
      activeDays: [0, 1, 2, 3, 4, 5, 6], // Все дни недели
      customSlotTimes: null,
      timeRangeStart: 540, // 09:00
      timeRangeEnd: 1350, // 22:30
      meta: {
        textSource: 'templates', // По умолчанию templates (ручные тексты для кастомных)
        customTexts: [],
      },
    });
    console.log(
      `[Therapy] ✅ Auto-created notification preferences for topic: ${slug} (enabled: true)`
    );
  } catch (error) {
    // Не критично, если не удалось создать настройки
    console.error(
      `[Therapy] ⚠️ Failed to auto-create notification preferences for topic ${slug}:`,
      error
    );
  }

  return {
    id: created.id,
    name: created.name,
    slug: created.slug ?? null,
    description: created.description ?? null,
    emoji: created.emoji ?? null,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
});
