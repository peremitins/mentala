import { nanoid } from 'nanoid';
import { eq, sql } from 'drizzle-orm';
import {
  userPreferences,
  notificationPreferences,
  notificationSlots,
  userDevices,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';
import { loadTextsForPreference } from '@/server/application/notifications/notification-texts.service';
import { formatNotificationTextWithName } from '@/shared/utils/notificationText';
import type { NotificationPayload } from '@/shared/dto/notifications';
import {
  getUserTimezone,
  toLocalTime,
} from '@/server/application/notifications/timezone.utils';

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
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionResult.user.id;

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

    console.log('[test-quick] Settings:', {
      userId,
      kind: body.kind,
      addressing,
      tone,
      directness,
    });

    // Генерируем текст уведомления из БД
    // Пытаемся загрузить тексты для любого entityKey (используем первый доступный)
    let text = 'Время сделать паузу и восстановить дыхание.'; // Fallback текст

    try {
      // Пробуем загрузить тексты для первого доступного entityKey
      // Для тестового эндпоинта используем общий подход
      const loadedTexts = await loadTextsForPreference({
        userId,
        kind: body.kind,
        entityKey: body.kind === 'therapy' ? 'anxiety' : 'water', // Используем дефолтные entityKey
        directness,
        addressing,
        intent: null,
        subtype: null,
      });

      if (loadedTexts.texts.length > 0) {
        // Берем первый доступный текст
        const firstText = loadedTexts.texts[0];
        text = formatNotificationTextWithName(
          firstText.text,
          sessionResult.user?.name ?? undefined
        );
      }
    } catch (error) {
      console.warn(
        '[test-quick] Failed to load texts from DB, using fallback:',
        error
      );
    }

    console.log(`[TEST-QUICK NOTIFICATION] notificationText: ${text}`);

    // Для payload используем дефолтный templateId
    const templateId = `${body.kind}_${directness}`;

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

    // Получаем часовой пояс пользователя для сохранения локального времени
    const userTimezone = await getUserTimezone(userId);

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
      // Используем SQL функцию для преобразования UTC времени в локальное время пользователя
      await db.insert(notificationSlots).values({
        id: slotId,
        userId,
        kind: body.kind,
        entityKey: null,
        scheduledAt,
        scheduledAtLocal: sql`timezone(${sql.raw(`'${userTimezone}'`)}, ${scheduledAt})`,
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
