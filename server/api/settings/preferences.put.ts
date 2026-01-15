import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { userPreferences } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  UserPreferencesDto,
  UpdateUserPreferencesDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * PUT /api/settings/preferences
 * Обновить глобальные настройки пользователя (addressing, tone)
 */
export default defineEventHandler(
  async (event): Promise<UserPreferencesDto> => {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionResult.user.id;

    const body = await readBody<UpdateUserPreferencesDto>(event);

    // Валидация
    if (body.addressing && !['informal', 'formal'].includes(body.addressing)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid addressing value',
      });
    }

    if (
      body.tone &&
      ![
        'delicate',
        'neutral',
        'uplifting',
        'resolute',
        'demanding',
        'unknown',
      ].includes(body.tone)
    ) {
      throw createError({
        statusCode: 400,
        message: 'Invalid tone value',
      });
    }

    if (body.meditationTimerMinutes !== undefined) {
      const timer = body.meditationTimerMinutes;
      const allowedTimers = [10, 20, 30];
      if (timer !== null && !allowedTimers.includes(timer)) {
        throw createError({
          statusCode: 400,
          message: 'Invalid meditation timer value',
        });
      }
    }

    // Пытаемся найти существующие настройки
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (existing) {
      const nextMeditationTimer =
        body.meditationTimerMinutes !== undefined
          ? body.meditationTimerMinutes
          : existing.meditationTimerMinutes ?? null;
      // Обновляем существующие
      const [updated] = await db
        .update(userPreferences)
        .set({
          addressing: body.addressing ?? existing.addressing,
          tone: body.tone ?? existing.tone,
          meditationTimerMinutes: nextMeditationTimer,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();

      return {
        addressing: updated.addressing as 'informal' | 'formal',
        tone: updated.tone as
          | 'delicate'
          | 'neutral'
          | 'uplifting'
          | 'resolute'
          | 'demanding'
          | 'unknown',
        meditationTimerMinutes: updated.meditationTimerMinutes ?? null,
      };
    } else {
      // Создаём новые
      const [created] = await db
        .insert(userPreferences)
        .values({
          id: nanoid(),
          userId,
          addressing: body.addressing ?? 'informal',
          tone: body.tone ?? 'neutral',
          meditationTimerMinutes: body.meditationTimerMinutes ?? null,
        })
        .returning();

      return {
        addressing: created.addressing as 'informal' | 'formal',
        tone: created.tone as
          | 'delicate'
          | 'neutral'
          | 'uplifting'
          | 'resolute'
          | 'demanding'
          | 'unknown',
        meditationTimerMinutes: created.meditationTimerMinutes ?? null,
      };
    }
  }
);
