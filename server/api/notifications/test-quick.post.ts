import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import {
  userPreferences,
  notificationPreferences,
  notificationSlots,
  userDevices,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';
import { getNotificationText } from '@/app/lib/notificationTemplates';
import type {
  NotificationPayload,
  NotificationPreferenceMeta,
} from '@/shared/dto/notifications';
import { pickCustomTextFromMeta } from '@/shared/utils/notificationText';

/**
 * POST /api/notifications/test-quick
 * Создать тестовый слот уведомления через 1 минуту
 * Полезно для быстрого тестирования push-уведомлений
 */
export default defineEventHandler(
  async (
    event
  ): Promise<{
    success: boolean;
    slotId: string;
    scheduledAt: string;
    message: string;
  }> => {
    const user = await getSessionUser(event);
    if (!user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = user.id;

    const body = await readBody<{ kind: 'therapy' | 'habits' }>(event);

    // Валидация
    if (!body.kind || !['therapy', 'habits'].includes(body.kind)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid kind',
      });
    }

    // Получаем глобальные настройки
    let globalPrefs = null;
    try {
      [globalPrefs] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);
    } catch (error) {
      console.log('[test-quick] Failed to fetch global prefs:', error);
    }

    const addressing =
      (globalPrefs?.addressing as 'informal' | 'formal') ?? 'informal';
    const tone =
      (globalPrefs?.tone as
        | 'delicate'
        | 'neutral'
        | 'uplifting'
        | 'resolute'
        | 'demanding') ?? 'neutral';

    // Получаем локальные настройки
    let localPrefs = null;
    try {
      [localPrefs] = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);
    } catch (error) {
      console.log('[test-quick] Failed to fetch local prefs:', error);
    }

    const directness =
      (localPrefs?.directness as 'soft' | 'moderate' | 'hard') ?? 'moderate';
    const preferenceMeta =
      (localPrefs?.meta as NotificationPreferenceMeta | null) ?? null;

    console.log('[test-quick] Settings:', {
      userId,
      kind: body.kind,
      addressing,
      tone,
      directness,
    });

    const customText =
      body.kind === 'habits' || body.kind === 'therapy'
        ? pickCustomTextFromMeta(preferenceMeta, user?.name, 0)
        : null;

    // Генерируем текст уведомления с fallback логикой
    // tone больше не используется в фильтрации шаблонов
    const text =
      customText ||
      getNotificationText(
        body.kind,
        addressing,
        directness,
        user?.name ?? undefined
      );

    console.log(`[TEST-QUICK NOTIFICATION] notificationText: ${text}`);

    // Для payload нам всё равно нужен templateId, используем дефолтный
    // tone больше не используется, убираем из templateId
    const templateId = customText
      ? 'custom_user_text'
      : `${body.kind}_${directness}`;

    // Проверяем наличие устройств у пользователя
    const devices = await db
      .select()
      .from(userDevices)
      .where(eq(userDevices.userId, userId))
      .limit(1);

    if (devices.length === 0) {
      throw createError({
        statusCode: 400,
        message:
          'У вас нет зарегистрированных устройств. Пожалуйста, разрешите уведомления в настройках приложения.',
      });
    }

    // Создаём слот через 1 минуту
    const scheduledAt = new Date(Date.now() + 60 * 1000);

    const slotId = nanoid();
    const payload: NotificationPayload = {
      title: 'Mentai: тестовое уведомление',
      body: text,
      templateId: templateId,
      action: 'open',
      deepLink: body.kind === 'therapy' ? '/therapy' : '/habits',
      data: {
        kind: body.kind,
        slotId,
      },
    };

    try {
      await db.insert(notificationSlots).values({
        id: slotId,
        userId,
        kind: body.kind,
        habitId: null,
        scheduledAt,
        payload,
        templateId: templateId,
        status: 'planned',
      });

      console.log('[test-quick] Slot created:', {
        slotId,
        scheduledAt: scheduledAt.toISOString(),
      });

      const isDevelopment = process.env.NODE_ENV !== 'production';
      const checkInterval = isDevelopment ? '30 секунд' : '5 минут';

      return {
        success: true,
        slotId,
        scheduledAt: scheduledAt.toISOString(),
        message: `Тестовое уведомление запланировано на ${scheduledAt.toLocaleTimeString('ru-RU')}. Воркер проверит слоты через ${checkInterval}.`,
      };
    } catch (dbError) {
      console.error('[test-quick] Failed to insert slot:', dbError);
      throw createError({
        statusCode: 500,
        message: 'Failed to create notification slot',
      });
    }
  }
);
