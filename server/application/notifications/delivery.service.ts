/**
 * Сервис отправки push-уведомлений через FCM
 *
 * Использует Firebase Admin SDK для отправки push-уведомлений
 * Требует переменную окружения NUXT_FIREBASE_SERVICE_ACCOUNT_JSON
 *
 * См. FIREBASE_SETUP.md для инструкций по настройке
 */

import { eq, and, gte, lte, lt, asc } from 'drizzle-orm';
import {
  db,
  isDbConnectionError,
  resetDbPool,
} from '@/server/infrastructure/db/client';
import {
  notificationSlots,
  userDevices,
  users,
} from '@/server/infrastructure/db/schema';
import type { NotificationPayload } from '@/shared/dto/notifications';
import { enqueueAiTextPoolRefillForAllActivePreferences } from '@/server/application/notifications/schedulers/aiTextPool.scheduler';
import { startNotificationSlotsSchedulerLoop } from '@/server/application/notifications/schedulers/notificationSlots.scheduler';
import { notificationDeliveryQueue } from '@/server/application/notifications/queues/notificationDelivery.queue';
import { getUserTimezone, toLocalTime } from './timezone.utils';
import { resolveEntityKeyForSlots } from './entity-key.service';
import { getCustomNotificationSourceAccessByKind } from './notification-source-access.service';
import { validateNotificationImageUrl } from './notification-image-validation';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

// ==========================================
// Firebase Admin SDK
// ==========================================

let firebaseApp: admin.app.App | null = null;

function resolveServerAppEnv(): 'dev' | 'prod' {
  const raw = process.env.MENTALA_DB_ENV || process.env.NODE_ENV || '';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'prod' || normalized === 'production') return 'prod';
  return 'dev';
}

const DEFAULT_MAX_SLOT_AGE_HOURS_BEFORE_SKIP = 24;
const DEFAULT_DUE_LOOKAHEAD_BUFFER_MS = 15_000;
let mockDeliveryDisabledWarningPrinted = false;

export type NotificationSendResult = 'sent' | 'mock' | 'failed';

export type SendToUserResult = {
  deviceCount: number;
  sentCount: number;
  mockCount: number;
  failedCount: number;
  hasRealDelivery: boolean;
};

type ProcessDueSlotsOptions = {
  lookAheadMs?: number;
};

/**
 * Возвращает максимальный возраст due-слота для принудительного skip.
 * - `0` отключает skip по возрасту полностью;
 * - положительное значение — лимит в минутах;
 * - невалидное значение откатывается на дефолт.
 */
function getMaxSlotAgeMinutesBeforeSkip(): number | null {
  const rawValue = process.env.NOTIFICATION_MAX_SLOT_AGE_HOURS_BEFORE_SKIP;

  if (!rawValue || rawValue.trim() === '') {
    return DEFAULT_MAX_SLOT_AGE_HOURS_BEFORE_SKIP * 60;
  }

  const parsedHours = Number(rawValue);
  if (!Number.isFinite(parsedHours) || parsedHours < 0) {
    console.warn(
      `[DeliveryWorker] ⚠️ Invalid NOTIFICATION_MAX_SLOT_AGE_HOURS_BEFORE_SKIP="${rawValue}", using default ${DEFAULT_MAX_SLOT_AGE_HOURS_BEFORE_SKIP}h`
    );
    return DEFAULT_MAX_SLOT_AGE_HOURS_BEFORE_SKIP * 60;
  }

  if (parsedHours === 0) {
    return null;
  }

  return Math.round(parsedHours * 60);
}

/**
 * Флаг mock-отправки в dev.
 * По умолчанию выключен, чтобы статус sent оставался достоверным.
 */
function isMockDeliveryEnabled(): boolean {
  const rawValue = process.env.NOTIFICATION_ALLOW_MOCK_DELIVERY;
  if (!rawValue || rawValue.trim() === '') {
    return false;
  }

  const normalized = rawValue.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

/**
 * Возвращает окно lookahead для processDueSlots.
 * Значение задается в секундах через env, иначе берется check interval + safety buffer.
 */
function getDueLookAheadMs(checkIntervalMs: number): number {
  const fallbackMs = Math.max(
    0,
    Math.round(checkIntervalMs + DEFAULT_DUE_LOOKAHEAD_BUFFER_MS)
  );
  const rawValue = process.env.NOTIFICATION_DUE_LOOKAHEAD_SECONDS;

  if (!rawValue || rawValue.trim() === '') {
    return fallbackMs;
  }

  const parsedSeconds = Number(rawValue);
  if (!Number.isFinite(parsedSeconds) || parsedSeconds < 0) {
    console.warn(
      `[DeliveryWorker] ⚠️ Invalid NOTIFICATION_DUE_LOOKAHEAD_SECONDS="${rawValue}", using fallback ${Math.round(fallbackMs / 1000)}s`
    );
    return fallbackMs;
  }

  return Math.round(parsedSeconds * 1000);
}

/**
 * Инициализация Firebase Admin SDK
 *
 * ВАЖНО: В production режиме Firebase должен быть обязательно настроен.
 * Mock mode используется только в development для удобства разработки.
 */
export function initializeFirebase(): void {
  try {
    if (!firebaseApp) {
      const serviceAccount = process.env.NUXT_FIREBASE_SERVICE_ACCOUNT_JSON;
      const isProduction = process.env.NODE_ENV === 'production';

      // Debug: показываем статус переменной (в production не показываем содержимое)
      if (isProduction) {
        console.log(
          '[FCM] DEBUG: NUXT_FIREBASE_SERVICE_ACCOUNT_JSON env var:',
          serviceAccount ? 'Set' : 'NOT SET'
        );
      } else {
        console.log(
          '[FCM] DEBUG: NUXT_FIREBASE_SERVICE_ACCOUNT_JSON env var:',
          serviceAccount
            ? `Set (${serviceAccount.substring(0, 50)}...)`
            : 'NOT SET'
        );
      }

      if (!serviceAccount) {
        if (isProduction) {
          // В production отсутствие Firebase - критическая ошибка
          console.error(
            '[FCM] ❌ CRITICAL: NUXT_FIREBASE_SERVICE_ACCOUNT_JSON not set in production!'
          );
          console.error(
            '[FCM] Push notifications will NOT work. Set NUXT_FIREBASE_SERVICE_ACCOUNT_JSON environment variable.'
          );
          console.error('[FCM] See FIREBASE_SETUP.md for setup instructions');
          // Не инициализируем firebaseApp, чтобы sendFCMNotification могла вернуть false
          return;
        } else {
          // В development разрешаем mock mode
          console.warn(
            '[FCM] NUXT_FIREBASE_SERVICE_ACCOUNT_JSON not set - using mock mode (development only)'
          );
          console.warn('[FCM] See FIREBASE_SETUP.md for setup instructions');
          return;
        }
      }

      let credentials: any;

      // Проверяем: это JSON строка или путь до файла?
      if (serviceAccount.startsWith('{')) {
        // Это JSON строка
        credentials = JSON.parse(serviceAccount);
        console.log('[FCM] Loading credentials from JSON string');
      } else {
        // Это путь до файла
        console.log(`[FCM] Loading credentials from file: ${serviceAccount}`);

        // Поддерживаем относительные и абсолютные пути
        const filePath = isAbsolute(serviceAccount)
          ? serviceAccount
          : resolve(process.cwd(), serviceAccount);

        console.log(`[FCM] Resolved file path: ${filePath}`);

        if (!existsSync(filePath)) {
          throw new Error(`Service account file not found: ${filePath}`);
        }

        const fileContent = readFileSync(filePath, 'utf8');
        credentials = JSON.parse(fileContent);
      }

      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(credentials),
      });
      console.log('[FCM] ✅ Firebase Admin SDK initialized successfully');
    }
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production';
    console.error('[FCM] ❌ Failed to initialize Firebase:', error);

    if (isProduction) {
      console.error(
        '[FCM] ❌ CRITICAL: Firebase initialization failed in production!'
      );
      console.error(
        '[FCM] Push notifications will NOT work until Firebase is properly configured.'
      );
    } else {
      console.error(
        '[FCM] Push notifications will use mock mode (development only)'
      );
    }
    console.error('[FCM] See FIREBASE_SETUP.md for setup instructions');
  }
}

// ==========================================
// Отправка уведомлений
// ==========================================

/**
 * Генерирует collapse key для дедупликации одного и того же слота.
 * Важно: разные слоты НЕ должны схлопываться между собой.
 * @param payload - данные уведомления
 * @returns collapse key для FCM/APNs или null
 */
function generateCollapseKey(payload: NotificationPayload): string | null {
  const rawSlotId = payload.data?.slotId;
  const slotId = String(rawSlotId ?? '').trim();

  if (!slotId) return null;

  // По спецификации APNs collapse-id ограничен 64 символами.
  // nanoid короче, но всё равно ограничиваем длину на всякий случай.
  return `slot_${slotId}`.slice(0, 64);
}

function resolveFirebaseProjectId(): string | null {
  return (
    firebaseApp?.options.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    null
  );
}

/**
 * Отправить FCM уведомление на устройство
 * @param token - FCM токен устройства
 * @param payload - данные уведомления
 * @returns sent|mock|failed
 */
export async function sendFCMNotification(
  token: string,
  payload: NotificationPayload,
  platform?: string | null
): Promise<NotificationSendResult> {
  // Если Firebase не инициализирован
  if (!firebaseApp) {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      // В production это критическая ошибка - уведомления не отправляются
      console.error(
        '[FCM] ❌ Cannot send notification: Firebase not initialized in production!'
      );
      console.error(
        '[FCM] Notification was NOT sent. Set NUXT_FIREBASE_SERVICE_ACCOUNT_JSON environment variable.'
      );
      return 'failed';
    } else {
      // В development mock разрешаем только явным флагом.
      if (isMockDeliveryEnabled()) {
        console.log('[FCM] (MOCK) Sending notification:', {
          token: token.substring(0, 20) + '...',
          title: payload.title,
          body: payload.body,
        });
        return 'mock';
      }

      if (!mockDeliveryDisabledWarningPrinted) {
        mockDeliveryDisabledWarningPrinted = true;
        console.warn(
          '[FCM] ⚠️ Firebase is not initialized and mock delivery is disabled (set NOTIFICATION_ALLOW_MOCK_DELIVERY=true to enable mock mode in development)'
        );
      }
      return 'failed';
    }
  }

  try {
    const normalizedPlatform = String(platform || '').toLowerCase();
    const isAndroid = normalizedPlatform === 'android';
    const imageValidation =
      payload.image && payload.image.trim()
        ? validateNotificationImageUrl(payload.image)
        : null;
    const validatedImageUrl = imageValidation?.valid
      ? imageValidation.normalizedUrl
      : null;
    const imageSkipReason =
      imageValidation && !imageValidation.valid
        ? imageValidation.reason
        : 'image_not_provided';

    if (payload.image && !validatedImageUrl) {
      console.warn('[FCM] ⚠️ Rich image skipped after validation:', {
        slotId: payload.data?.slotId ?? null,
        platform: normalizedPlatform || null,
        reason: imageSkipReason,
        imageUrl: payload.image,
      });
    }

    // Подготовка data - все значения должны быть строками
    const dataPayload: Record<string, string> = {
      action: payload.action || '',
      deepLink: payload.deepLink || '',
    };

    // Для Android используем data-only и строим уведомление нативно.
    // Поэтому прокидываем текст в data только для Android.
    if (isAndroid) {
      dataPayload.title = payload.title || '';
      dataPayload.body = payload.body || '';
    }

    if (payload.navigation) {
      // Навигация хранится как JSON-строка + дублируется в плоские поля для диагностики.
      dataPayload.navigation = JSON.stringify(payload.navigation);
      dataPayload.navType = payload.navigation.type;
      if ('trackId' in payload.navigation) {
        dataPayload.navId = payload.navigation.trackId;
      } else if ('slug' in payload.navigation) {
        dataPayload.navId = payload.navigation.slug;
      }
    }

    // Добавляем дополнительные данные из payload.data
    // Фильтруем undefined значения, чтобы не отправлять ключи с "undefined"
    if (payload.data) {
      Object.entries(payload.data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          dataPayload[key] = String(value);
        }
      });
    }

    // Принудительно контролируем image-поля после merge payload.data,
    // чтобы в пуш не просочились невалидные/тяжёлые URL.
    delete dataPayload.image;
    delete dataPayload.imageUrl;
    if (validatedImageUrl) {
      dataPayload.image = validatedImageUrl;
      dataPayload.imageUrl = validatedImageUrl;
    }

    // Collapse ключ строго на уровне slotId, чтобы разные слоты не схлопывались.
    const collapseKey = generateCollapseKey(payload);

    // Подготовка notification объекта с опциональным изображением
    const notificationPayload: admin.messaging.Notification = {
      title: payload.title,
      body: payload.body,
    };

    // Добавляем изображение, если оно указано
    if (validatedImageUrl) {
      notificationPayload.imageUrl = validatedImageUrl;
    }

    // Подготовка Android notification
    const androidNotification: admin.messaging.AndroidNotification = {
      sound: 'default',
      channelId: 'mentai_high',
      // Не задаём clickAction, чтобы Android использовал дефолтное поведение
      // и открывал приложение по тапу на уведомление.
      // Уникальный tag предотвращает замену уведомлений внутри группы Android
      ...(payload.data?.slotId
        ? { tag: `slot-${String(payload.data.slotId)}` }
        : {}),
    };

    // Добавляем изображение для Android (Android 7+)
    if (validatedImageUrl) {
      androidNotification.imageUrl = validatedImageUrl;
    }

    const message: admin.messaging.Message = {
      token,
      data: dataPayload,
      android: {
        priority: 'high',
        ttl: 60 * 60 * 1000, // 1 час (3600 секунд)
        ...(collapseKey ? { collapseKey } : {}),
        ...(isAndroid ? {} : { notification: androidNotification }),
      },
      ...(isAndroid ? {} : { notification: notificationPayload }),
      ...(isAndroid
        ? {}
        : {
            apns: {
              headers: {
                'apns-priority': '10',
                'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600), // 1 час
                ...(collapseKey ? { 'apns-collapse-id': collapseKey } : {}),
              },
              payload: {
                aps: {
                  alert: {
                    title: payload.title,
                    body: payload.body,
                  },
                  sound: 'default',
                  category: 'MENTAI_CATEGORY',
                  ...(validatedImageUrl ? { mutableContent: true } : {}),
                },
              },
              ...(validatedImageUrl
                ? {
                    fcmOptions: {
                      imageUrl: validatedImageUrl,
                    },
                  }
                : {}),
            },
          }),
    };

    console.log('[FCM] Send payload meta:', {
      platform: normalizedPlatform || null,
      slotId: payload.data?.slotId ?? null,
      imageUrl: validatedImageUrl,
      hasMutableContent: Boolean(validatedImageUrl && !isAndroid),
      hasApnsImageField: Boolean(validatedImageUrl && !isAndroid),
      firebaseProjectId: resolveFirebaseProjectId(),
    });

    const response = await admin.messaging().send(message);
    console.log('[FCM] ✅ Message sent successfully:', response);
    return 'sent';
  } catch (error: any) {
    console.error('[FCM] ❌ Failed to send message:', error);

    const errorCode = error?.code;
    const errorInfoCode = error?.errorInfo?.code;
    const errorMessage = String(
      error?.message || error?.errorInfo?.message || ''
    ).toLowerCase();
    const isSenderMismatch =
      errorCode === 'messaging/mismatched-credential' ||
      errorInfoCode === 'messaging/mismatched-credential' ||
      errorMessage.includes('senderid mismatch');
    const isInvalidToken =
      errorCode === 'messaging/invalid-registration-token' ||
      errorCode === 'messaging/registration-token-not-registered' ||
      errorInfoCode === 'messaging/invalid-registration-token' ||
      errorInfoCode === 'messaging/registration-token-not-registered';
    const isAuthCredentialError =
      errorCode === 'messaging/authentication-error' ||
      errorCode === 'messaging/third-party-auth-error' ||
      errorInfoCode === 'messaging/authentication-error' ||
      errorInfoCode === 'messaging/third-party-auth-error' ||
      errorMessage.includes('missing required authentication credential');

    console.error('[FCM] send error details:', {
      tokenPrefix: token.substring(0, 20),
      errorCode,
      errorInfoCode,
      errorMessage: (error?.message || error?.errorInfo?.message || '').slice(
        0,
        300
      ),
    });

    // Удаляем токены, которые точно невалидны для текущего Firebase проекта.
    if (isInvalidToken || isSenderMismatch) {
      console.log('[FCM] Removing invalid/mismatched token from database:', {
        tokenPrefix: token.substring(0, 20),
        reason: isSenderMismatch ? 'sender_mismatch' : 'invalid_token',
      });
      await db.delete(userDevices).where(eq(userDevices.token, token));
    }

    // Для iOS обычно означает проблему APNs-кредитов в Firebase проекте
    // (APNs key/cert отсутствует, невалиден или не соответствует Team ID/App ID).
    if (isAuthCredentialError) {
      console.error(
        '[FCM] Authentication credential error. Check APNs credentials in Firebase Cloud Messaging (Key ID/Team ID/key status) and iOS App ID alignment for this environment.'
      );
    }

    return 'failed';
  }
}

/**
 * Отправить уведомление всем устройствам пользователя
 * @param userId - ID пользователя
 * @param payload - данные уведомления
 * @returns агрегированный результат отправки по устройствам
 */
export async function sendToUser(
  userId: number,
  payload: NotificationPayload
): Promise<SendToUserResult> {
  const [userRow] = await db
    .select({ pushNotificationsEnabled: users.pushNotificationsEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRow?.pushNotificationsEnabled === false) {
    console.log(`[FCM] Push disabled for user ${userId}, skipping delivery`);
    return {
      deviceCount: 0,
      sentCount: 0,
      mockCount: 0,
      failedCount: 0,
      hasRealDelivery: false,
    };
  }

  const appEnv = resolveServerAppEnv();
  console.log(`[FCM] Looking for devices for user ${userId} (env=${appEnv})`);
  const devices = await db
    .select()
    .from(userDevices)
    .where(and(eq(userDevices.userId, userId), eq(userDevices.appEnv, appEnv)));

  console.log(
    `[FCM] Found ${devices.length} device(s) for user ${userId} (env=${appEnv})`
  );

  if (devices.length === 0) {
    console.warn(`[FCM] No devices found for user ${userId}`);
    return {
      deviceCount: 0,
      sentCount: 0,
      mockCount: 0,
      failedCount: 0,
      hasRealDelivery: false,
    };
  }

  let sentCount = 0;
  let mockCount = 0;
  let failedCount = 0;

  for (const device of devices) {
    console.log(
      `[FCM] Sending to device: ${device.platform} (token: ${device.token.substring(0, 20)}...)`
    );
    const result = await sendFCMNotification(
      device.token,
      payload,
      device.platform
    );

    if (result === 'sent') {
      sentCount++;
    } else if (result === 'mock') {
      mockCount++;
    } else {
      failedCount++;
    }
  }

  console.log(
    `[FCM] Delivery summary for user ${userId}: sent=${sentCount}, mock=${mockCount}, failed=${failedCount}, total=${devices.length}`
  );

  return {
    deviceCount: devices.length,
    sentCount,
    mockCount,
    failedCount,
    hasRealDelivery: sentCount > 0,
  };
}

// ==========================================
// Воркер обработки due-слотов
// ==========================================

/**
 * Обрабатывает planned-слоты в окне [now - lookahead, now + lookahead] и ставит задачи в очередь.
 * За счет delayed jobs BullMQ слот отправляется ближе к scheduledAt, а не к тикеру polling.
 */
export async function processDueSlots(
  options: ProcessDueSlotsOptions = {}
): Promise<void> {
  const nowUTC = new Date();
  const lookAheadMs = Math.max(0, Math.round(options.lookAheadMs ?? 0));
  const processWindowStartUTC = new Date(nowUTC.getTime() - lookAheadMs);
  const processWindowEndUTC = new Date(nowUTC.getTime() + lookAheadMs);
  const maxSlotAgeMinutesBeforeSkip = getMaxSlotAgeMinutesBeforeSkip();
  const dueWindowStartUTC =
    maxSlotAgeMinutesBeforeSkip === null
      ? new Date(0)
      : new Date(
          nowUTC.getTime() - Math.round(maxSlotAgeMinutesBeforeSkip * 60_000)
        );

  console.log(
    `[DeliveryWorker] Checking slots window: start=${processWindowStartUTC.toISOString()}, now=${nowUTC.toISOString()}, lookAheadMs=${lookAheadMs}, windowEnd=${processWindowEndUTC.toISOString()}, dueWindowStart=${dueWindowStartUTC.toISOString()}`
  );

  try {
    // Критично: не скипаем "просто просроченные на lookahead" слоты.
    // Иначе при кратковременном лаге/рестарте слоты внезапно теряются и пользователь видит random skipped.
    // Принудительно скипаем только действительно протухшие слоты старше max-slot-age.
    if (maxSlotAgeMinutesBeforeSkip !== null) {
      const staleBeforeUTC = dueWindowStartUTC;
      const staleUpdate = await db
        .update(notificationSlots)
        .set({ status: 'skipped' })
        .where(
          and(
            eq(notificationSlots.status, 'planned'),
            lt(notificationSlots.scheduledAt, staleBeforeUTC)
          )
        );

      const staleSkippedCount = staleUpdate.rowCount || 0;
      if (staleSkippedCount > 0) {
        console.warn(
          `[DeliveryWorker] ⏭️ Skipped stale planned slots: ${staleSkippedCount} (before ${staleBeforeUTC.toISOString()})`
        );
      }
    }

    // Берем planned-слоты в диапазоне [dueWindowStart, now + lookahead].
    // Это позволяет обрабатывать overdue-слоты (в пределах max age), а не терять их.
    // Future-слоты внутри окна пойдут в BullMQ с delay до scheduledAt.
    const dueSlots = await db
      .select()
      .from(notificationSlots)
      .where(
        and(
          eq(notificationSlots.status, 'planned'), // Только planned слоты
          gte(notificationSlots.scheduledAt, dueWindowStartUTC),
          lte(notificationSlots.scheduledAt, processWindowEndUTC)
        )
      )
      .orderBy(asc(notificationSlots.scheduledAt))
      .limit(100); // Батч из 100 слотов

    console.log(
      `[DeliveryWorker] Found ${dueSlots.length} slot(s) in processing window`
    );

    // Группируем слоты по пользователям для получения timezone (избегаем N+1 запросов)
    const userIds = [...new Set(dueSlots.map((s) => s.userId))];
    const timezoneMap = new Map<number, string>();
    const customSourceAccessMap = new Map<
      number,
      { habits: boolean; therapy: boolean }
    >();
    const customEntityCache = new Map<string, boolean>();

    for (const userId of userIds) {
      try {
        const timezone = await getUserTimezone(userId);
        timezoneMap.set(userId, timezone);
      } catch (error) {
        console.error(
          `[DeliveryWorker] Failed to get timezone for user ${userId}:`,
          error
        );
        timezoneMap.set(userId, 'Europe/Moscow'); // Fallback для российского приложения
      }

      try {
        const sourceAccess = await getCustomNotificationSourceAccessByKind({
          userId,
        });
        customSourceAccessMap.set(userId, sourceAccess);
      } catch (error) {
        console.error(
          `[DeliveryWorker] Failed to get custom source access for user ${userId}:`,
          error
        );
        customSourceAccessMap.set(userId, { habits: true, therapy: true });
      }
    }

    let enqueuedCount = 0;
    let delayedCount = 0;
    let immediateCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const slot of dueSlots) {
      // Логируем в локальном времени для отладки
      const userTimezone = timezoneMap.get(slot.userId) || 'Europe/Moscow';
      const slotLocal = toLocalTime(slot.scheduledAt, userTimezone);
      const nowLocal = toLocalTime(nowUTC, userTimezone);
      const lateMinutes =
        (nowUTC.getTime() - slot.scheduledAt.getTime()) / (60 * 1000);
      const delayMs = Math.max(
        0,
        slot.scheduledAt.getTime() - nowUTC.getTime()
      );

      if (enqueuedCount < 5) {
        // Логируем первые 5 слотов для отладки
        console.log(
          `[DeliveryWorker] Slot candidate: UTC=${slot.scheduledAt.toISOString()}, Local=${slotLocal.toISOString()} (${userTimezone}), now Local=${nowLocal.toISOString()}, delayMs=${delayMs}`
        );
      }

      try {
        if (
          slot.entityKey &&
          (slot.kind === 'habits' || slot.kind === 'therapy')
        ) {
          const cacheKey = `${slot.userId}:${slot.kind}:${slot.entityKey}`;
          let isCustomEntity = customEntityCache.get(cacheKey);

          if (isCustomEntity === undefined) {
            const resolvedEntity = await resolveEntityKeyForSlots(
              slot.userId,
              slot.kind as 'habits' | 'therapy',
              slot.entityKey
            );
            isCustomEntity = resolvedEntity.isCustom;
            customEntityCache.set(cacheKey, isCustomEntity);
          }

          if (isCustomEntity) {
            const sourceAccess = customSourceAccessMap.get(slot.userId) || {
              habits: true,
              therapy: true,
            };
            const hasCustomAccess =
              slot.kind === 'habits'
                ? sourceAccess.habits
                : sourceAccess.therapy;

            if (!hasCustomAccess) {
              const updateResult = await db
                .update(notificationSlots)
                .set({ status: 'skipped' })
                .where(
                  and(
                    eq(notificationSlots.id, slot.id),
                    eq(notificationSlots.status, 'planned')
                  )
                );

              const rowsAffected = updateResult.rowCount || 0;
              if (rowsAffected > 0) {
                skippedCount++;
                console.warn(
                  `[DeliveryWorker] ⏭️ Slot ${slot.id} skipped: custom source locked by plan (user=${slot.userId}, source=${slot.kind}:${slot.entityKey})`
                );
              }
              continue;
            }
          }
        }

        if (
          maxSlotAgeMinutesBeforeSkip !== null &&
          lateMinutes > maxSlotAgeMinutesBeforeSkip
        ) {
          const updateResult = await db
            .update(notificationSlots)
            .set({ status: 'skipped' })
            .where(
              and(
                eq(notificationSlots.id, slot.id),
                eq(notificationSlots.status, 'planned')
              )
            );
          const rowsAffected = updateResult.rowCount || 0;
          if (rowsAffected > 0) {
            skippedCount++;
            console.warn(
              `[DeliveryWorker] ⏭️ Slot ${slot.id} is stale by ${lateMinutes.toFixed(1)} min (limit=${maxSlotAgeMinutesBeforeSkip} min, local=${slotLocal.toISOString()}), marking as skipped`
            );
          }
          continue;
        }

        // КРИТИЧНО: Конкурентно-безопасный переход planned -> queued.
        // Side-effect (enqueue) выполняем только если UPDATE вернул строку.
        const transitionedRows = await db
          .update(notificationSlots)
          .set({ status: 'queued' })
          .where(
            and(
              eq(notificationSlots.id, slot.id),
              eq(notificationSlots.status, 'planned') // Только если еще planned
            )
          )
          .returning({ id: notificationSlots.id });

        if (transitionedRows.length === 0) {
          skippedCount++;
          console.log(
            `[DeliveryWorker] ⏭️ Slot ${slot.id} already processed, skipping`
          );
          continue;
        }

        // Ставим задачу в очередь
        await notificationDeliveryQueue.add(
          'send',
          {
            slotId: slot.id,
            userId: slot.userId,
            payload: slot.payload as NotificationPayload,
          },
          {
            // Точный тайминг: job активируется ближе к scheduledAt, а не к ближайшему polling-тику.
            delay: delayMs,
            jobId: `delivery-${slot.id}`, // Уникальный ID для предотвращения дубликатов
            removeOnComplete: {
              age: 3600, // Хранить завершённые задачи 1 час для отладки
              count: 1000, // Или максимум 1000 задач
            },
            removeOnFail: {
              age: 7 * 24 * 3600, // Хранить проваленные задачи 7 дней
              count: 5000, // Или максимум 5000 задач
            },
          }
        );

        enqueuedCount++;
        if (delayMs > 0) {
          delayedCount++;
        } else {
          immediateCount++;
        }
      } catch (error: any) {
        errorCount++;
        const errorMessage = error?.message || String(error);

        // КРИТИЧНО: Разная логика для разных типов ошибок
        if (errorMessage.includes('already exists')) {
          // Задача уже существует в очереди - это нормально
          // НЕ делаем rollback в planned, оставляем статус queued
          // Иначе слот будет повторно обработан после завершения джобы → дубликат уведомления
          skippedCount++;
          console.log(
            `[DeliveryWorker] ⏭️ Job for slot ${slot.id} already exists in queue, keeping status 'queued'`
          );
        } else {
          // ВАЖНО: queued -> planned запрещён в state machine.
          // При реальной ошибке постановки в очередь фиксируем queued -> failed.
          try {
            await db
              .update(notificationSlots)
              .set({ status: 'failed' })
              .where(
                and(
                  eq(notificationSlots.id, slot.id),
                  eq(notificationSlots.status, 'queued')
                )
              );
          } catch (rollbackError) {
            console.error(
              `[DeliveryWorker] ❌ Failed to mark slot ${slot.id} as failed after enqueue error:`,
              rollbackError
            );
          }

          console.error(
            `[DeliveryWorker] ❌ Error enqueueing slot ${slot.id}:`,
            errorMessage
          );
        }
      }
    }

    if (dueSlots.length === 100) {
      console.warn(
        '[DeliveryWorker] ⚠️ Hit batch limit (100 slots), some slots may be processed in next cycle'
      );
    }

    console.log(
      `[DeliveryWorker] ✅ Enqueued ${enqueuedCount} slot(s): immediate=${immediateCount}, delayed=${delayedCount}, skipped=${skippedCount}, errors=${errorCount} (total in window: ${dueSlots.length})`
    );
  } catch (error: any) {
    // Улучшенная обработка ошибок подключения к БД
    const rootError = error?.cause ?? error;
    const errorMessage = rootError?.message || error?.message || String(error);
    const errorCode = rootError?.code || error?.code;

    if (isDbConnectionError(error)) {
      console.error(
        '[DeliveryWorker] ❌ Database connection error:',
        errorMessage,
        errorCode ? `(code: ${errorCode})` : ''
      );
      await resetDbPool('DeliveryWorker: connection error');
      return;
    }
    if (errorMessage.includes('NUXT_PRIVATE_DB_URL')) {
      console.error(
        '[DeliveryWorker] ❌ Database URL not configured. Set NUXT_PRIVATE_DB_URL in .env.development'
      );
    } else {
      console.error(
        '[DeliveryWorker] ❌ Database query error:',
        errorMessage,
        '\n  Full error:',
        error
      );
    }

    // Не пробрасываем ошибку дальше, чтобы worker продолжал работать
    // и мог повторить попытку при следующем запуске
  }
}

/**
 * Запускает планировщик для постановки задач в очереди BullMQ
 * Периодически проверяет состояние системы и ставит задачи в соответствующие очереди:
 * - processDueSlots() - ставит задачи отправки уведомлений в очередь notification-delivery
 * - enqueueAiTextPoolRefillForAllActivePreferences() - ставит задачи догенерации AI-текстов в очередь ai-text-pool-refill
 * - startNotificationSlotsSchedulerLoop() - запускает адаптивный sharded scheduler слотов
 *
 * Воркеры BullMQ обрабатывают задачи из этих очередей (см. server/plugins/bullmq-workers.ts)
 *
 * ВАЖНО: Эта функция должна вызываться только один раз при старте сервера.
 * Многократный вызов приведет к дублированию планировщиков и таймеров.
 *
 * Регенерация слотов:
 * - Event-driven: при логине, смене настроек, timezone
 * - Периодическая: каждые 2 часа ставим задачи для всех пользователей с активными настройками.
 *   Воркер вызывает needsSlotRegeneration и генерирует только если planned < 80% ожидаемого.
 *   Без периода слоты не пополняются после того, как все отправлены (горизонт 2 дня).
 */
let workerStarted = false;

export function startDeliveryWorker(): void {
  // Защита от многократного запуска
  if (workerStarted) {
    console.warn(
      '[DeliveryWorker] ⚠️ Worker already started, skipping duplicate initialization'
    );
    return;
  }
  workerStarted = true;

  console.log('[DeliveryWorker] Starting delivery worker');

  // Инициализируем Firebase
  initializeFirebase();

  // В development проверяем чаще для удобства тестирования
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const INTERVAL_MS = isDevelopment ? 30 * 1000 : 5 * 60 * 1000; // 30 сек в dev, 5 минут в prod
  const INITIAL_DELAY_MS = isDevelopment ? 10 * 1000 : 60 * 1000; // 10 сек в dev, 1 минута в prod
  const DUE_LOOKAHEAD_MS = getDueLookAheadMs(INTERVAL_MS);

  // Интервал для проверки и догенерации текстов (раз в час, с небольшим смещением)
  const TEXT_POOL_REFILL_INTERVAL_MS = 60 * 60 * 1000; // 1 час
  const TEXT_POOL_REFILL_INITIAL_DELAY_MS = 10 * 60 * 1000; // 10 минут после старта

  console.log(
    `[DeliveryWorker] Mode: ${isDevelopment ? 'development' : 'production'}`
  );
  console.log(`[DeliveryWorker] Check interval: ${INTERVAL_MS / 1000} seconds`);
  console.log(
    `[DeliveryWorker] Due lookahead: ${Math.round(DUE_LOOKAHEAD_MS / 1000)} seconds`
  );

  // Первый запуск обработки due-слотов
  setTimeout(() => {
    processDueSlots({ lookAheadMs: DUE_LOOKAHEAD_MS }).catch((error) => {
      console.error('[DeliveryWorker] Error in worker:', error);
    });

    // Последующие запуски обработки due-слотов
    setInterval(() => {
      processDueSlots({ lookAheadMs: DUE_LOOKAHEAD_MS }).catch((error) => {
        console.error('[DeliveryWorker] Error in worker:', error);
      });
    }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  // Первый запуск постановки задач догенерации текстов в очередь BullMQ
  setTimeout(() => {
    enqueueAiTextPoolRefillForAllActivePreferences().catch((error) => {
      console.error(
        '[DeliveryWorker] Error enqueueing text pool refill:',
        error
      );
    });

    // Последующие запуски постановки задач в очередь BullMQ
    setInterval(() => {
      enqueueAiTextPoolRefillForAllActivePreferences().catch((error) => {
        console.error(
          '[DeliveryWorker] Error enqueueing text pool refill:',
          error
        );
      });
    }, TEXT_POOL_REFILL_INTERVAL_MS);
  }, TEXT_POOL_REFILL_INITIAL_DELAY_MS);

  // Запускаем отдельный адаптивный loop шардированного scheduler слотов.
  startNotificationSlotsSchedulerLoop();

  console.log(
    `[DeliveryWorker] Worker scheduled (first check in ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 1000}s)`
  );
  console.log(
    `[DeliveryWorker] Text pool refill scheduled (first check in ${TEXT_POOL_REFILL_INITIAL_DELAY_MS / 1000 / 60} minutes, then every ${TEXT_POOL_REFILL_INTERVAL_MS / 1000 / 60} minutes)`
  );
  console.log('[DeliveryWorker] Slot generation scheduler loop started');
}
