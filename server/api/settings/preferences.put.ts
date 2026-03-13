import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { userPreferences } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  UserPreferencesDto,
  UpdateUserPreferencesDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';
import { enqueueAiRegenerationForUser } from '@/server/application/notifications/ai-text-regeneration.service';
import {
  DEFAULT_ASSISTANT_TONE,
  isAssistantToneWithUnknown,
} from '@/shared/constants/assistantTone';

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

    if (body.tone && !isAssistantToneWithUnknown(body.tone)) {
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
      const currentTone = isAssistantToneWithUnknown(existing.tone)
        ? existing.tone
        : DEFAULT_ASSISTANT_TONE;
      const nextMeditationTimer =
        body.meditationTimerMinutes !== undefined
          ? body.meditationTimerMinutes
          : (existing.meditationTimerMinutes ?? null);
      // Обновляем существующие
      const nextAddressing = body.addressing ?? existing.addressing;
      const nextTone = body.tone ?? currentTone;
      const addressingChanged =
        body.addressing !== undefined &&
        body.addressing !== existing.addressing;
      const toneChanged =
        body.tone !== undefined
          ? body.tone !== existing.tone
          : currentTone !== existing.tone;

      const [updated] = await db
        .update(userPreferences)
        .set({
          addressing: nextAddressing,
          tone: nextTone,
          meditationTimerMinutes: nextMeditationTimer,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();

      if (addressingChanged || toneChanged) {
        // Запускаем асинхронно, чтобы не блокировать ответ
        void enqueueAiRegenerationForUser({
          userId,
          reason: 'settings_preferences_update',
          onlyEnabled: true,
        }).catch((error) => {
          console.error(
            `[SettingsPreferences] ❌ Не удалось поставить регенерацию AI-текстов:`,
            error
          );
        });
      }

      return {
        addressing: updated.addressing as 'informal' | 'formal',
        tone: isAssistantToneWithUnknown(updated.tone)
          ? updated.tone
          : DEFAULT_ASSISTANT_TONE,
        meditationTimerMinutes: updated.meditationTimerMinutes ?? null,
      };
    } else {
      // Создаём новые
      const createdAddressing = body.addressing ?? 'informal';
      const createdTone = body.tone ?? DEFAULT_ASSISTANT_TONE;
      const shouldRegenerateAiOnCreate =
        body.addressing !== undefined || body.tone !== undefined;

      const [created] = await db
        .insert(userPreferences)
        .values({
          id: nanoid(),
          userId,
          addressing: createdAddressing,
          tone: createdTone,
          meditationTimerMinutes: body.meditationTimerMinutes ?? null,
        })
        .returning();

      if (shouldRegenerateAiOnCreate) {
        // Запускаем асинхронно, чтобы не блокировать ответ
        void enqueueAiRegenerationForUser({
          userId,
          reason: 'settings_preferences_create',
          onlyEnabled: true,
        }).catch((error) => {
          console.error(
            `[SettingsPreferences] ❌ Не удалось поставить регенерацию AI-текстов при создании настроек:`,
            error
          );
        });
      }

      return {
        addressing: created.addressing as 'informal' | 'formal',
        tone: isAssistantToneWithUnknown(created.tone)
          ? created.tone
          : DEFAULT_ASSISTANT_TONE,
        meditationTimerMinutes: created.meditationTimerMinutes ?? null,
      };
    }
  }
);
