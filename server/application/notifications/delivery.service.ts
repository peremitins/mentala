/**
 * Сервис отправки push-уведомлений через FCM
 *
 * Использует Firebase Admin SDK для отправки push-уведомлений
 * Требует переменную окружения NUXT_FIREBASE_SERVICE_ACCOUNT_JSON
 *
 * См. FIREBASE_SETUP.md для инструкций по настройке
 */

import { eq, and, lte } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationSlots,
  userDevices,
} from '@/server/infrastructure/db/schema';
import type { NotificationPayload } from '@/shared/dto/notifications';
import { checkAndRegenerateSlotsIfNeeded } from '@/server/application/notifications/scheduler.service';
import { refillAllTextPoolsIfNeeded } from '@/server/application/notifications/ai-generation.service';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

// ==========================================
// Firebase Admin SDK
// ==========================================

let firebaseApp: admin.app.App | null = null;

/**
 * Инициализация Firebase Admin SDK
 */
export function initializeFirebase(): void {
  try {
    if (!firebaseApp) {
      const serviceAccount = process.env.NUXT_FIREBASE_SERVICE_ACCOUNT_JSON;

      // Debug: показываем что именно получили
      console.log(
        '[FCM] DEBUG: NUXT_FIREBASE_SERVICE_ACCOUNT_JSON env var:',
        serviceAccount
          ? `Set (${serviceAccount.substring(0, 50)}...)`
          : 'NOT SET'
      );

      if (!serviceAccount) {
        console.warn(
          '[FCM] NUXT_FIREBASE_SERVICE_ACCOUNT_JSON not set - using mock mode'
        );
        console.warn('[FCM] See FIREBASE_SETUP.md for setup instructions');
        return;
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
    console.error('[FCM] ❌ Failed to initialize Firebase:', error);
    console.error('[FCM] Push notifications will use mock mode');
    console.error('[FCM] See FIREBASE_SETUP.md for setup instructions');
  }
}

// ==========================================
// Отправка уведомлений
// ==========================================

/**
 * Генерирует collapse key для группировки уведомлений
 * @param payload - данные уведомления
 * @returns collapse key для FCM/APNs
 */
function generateCollapseKey(payload: NotificationPayload): string {
  const kind = payload.data?.kind;
  const entityKey = payload.data?.entityKey;

  if (kind && entityKey) {
    return `${kind}_${entityKey}`;
  }

  // Fallback: по типу или общий
  return kind || 'mentai';
}

/**
 * Отправить FCM уведомление на устройство
 * @param token - FCM токен устройства
 * @param payload - данные уведомления
 * @returns true если успешно отправлено
 */
export async function sendFCMNotification(
  token: string,
  payload: NotificationPayload
): Promise<boolean> {
  // Если Firebase не инициализирован - используем mock
  if (!firebaseApp) {
    console.log('[FCM] (MOCK) Sending notification:', {
      token: token.substring(0, 20) + '...',
      title: payload.title,
      body: payload.body,
    });
    return true;
  }

  try {
    // Подготовка data - все значения должны быть строками
    const dataPayload: Record<string, string> = {
      action: payload.action || '',
      deepLink: payload.deepLink || '',
    };

    // Добавляем дополнительные данные из payload.data
    if (payload.data) {
      Object.entries(payload.data).forEach(([key, value]) => {
        dataPayload[key] = String(value);
      });
    }

    // Формируем collapse key для группировки уведомлений
    // Для habits: habits_{entityKey}, для therapy: therapy_{entityKey} или therapy
    const collapseKey = generateCollapseKey(payload);

    const message: admin.messaging.Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: dataPayload,
      android: {
        priority: 'high',
        ttl: 60 * 60 * 1000, // 1 час (3600 секунд)
        collapseKey,
        notification: {
          sound: 'default',
          channelId: 'mentai_high',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600), // 1 час
          'apns-collapse-id': collapseKey,
        },
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            sound: 'default',
            category: 'MENTAI_CATEGORY',
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log('[FCM] ✅ Message sent successfully:', response);
    return true;
  } catch (error: any) {
    console.error('[FCM] ❌ Failed to send message:', error);

    // Обработка ошибок невалидного токена
    const errorCode = error?.code;
    if (
      errorCode === 'messaging/invalid-registration-token' ||
      errorCode === 'messaging/registration-token-not-registered'
    ) {
      console.log('[FCM] Invalid token, removing from database:', token);
      await db.delete(userDevices).where(eq(userDevices.token, token));
    }

    return false;
  }
}

/**
 * Отправить уведомление всем устройствам пользователя
 * @param userId - ID пользователя
 * @param payload - данные уведомления
 * @returns количество успешных отправок
 */
export async function sendToUser(
  userId: number,
  payload: NotificationPayload
): Promise<number> {
  console.log(`[FCM] Looking for devices for user ${userId}`);
  const devices = await db
    .select()
    .from(userDevices)
    .where(eq(userDevices.userId, userId));

  console.log(`[FCM] Found ${devices.length} device(s) for user ${userId}`);

  if (devices.length === 0) {
    console.warn(`[FCM] No devices found for user ${userId}`);
    return 0;
  }

  let successCount = 0;
  for (const device of devices) {
    console.log(
      `[FCM] Sending to device: ${device.platform} (token: ${device.token.substring(0, 20)}...)`
    );
    const success = await sendFCMNotification(device.token, payload);
    if (success) {
      successCount++;
    }
  }

  console.log(
    `[FCM] Sent to ${successCount}/${devices.length} device(s) for user ${userId}`
  );
  return successCount;
}

// ==========================================
// Воркер обработки due-слотов
// ==========================================

/**
 * Обработать все due-слоты (те, которые пора отправить)
 * Вызывается периодически (например, каждые 5 минут)
 */
export async function processDueSlots(): Promise<void> {
  const now = new Date();
  console.log(
    `[DeliveryWorker] Checking for due slots at ${now.toISOString()}`
  );

  // Получаем все слоты, которые пора отправить
  const dueSlots = await db
    .select()
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.status, 'planned'),
        lte(notificationSlots.scheduledAt, now)
      )
    )
    .limit(100); // Батч из 100 слотов

  console.log(`[DeliveryWorker] Found ${dueSlots.length} due slots to process`);

  for (const slot of dueSlots) {
    try {
      // Отправляем уведомление
      const successCount = await sendToUser(
        slot.userId,
        slot.payload as NotificationPayload
      );

      if (successCount > 0) {
        // Помечаем как отправленное
        await db
          .update(notificationSlots)
          .set({ status: 'sent' })
          .where(eq(notificationSlots.id, slot.id));

        console.log(
          `[DeliveryWorker] Slot ${slot.id} sent to ${successCount} device(s)`
        );
      } else {
        // Помечаем как failed
        await db
          .update(notificationSlots)
          .set({ status: 'failed' })
          .where(eq(notificationSlots.id, slot.id));

        console.warn(`[DeliveryWorker] Slot ${slot.id} failed (no devices)`);
      }
    } catch (error) {
      console.error(
        `[DeliveryWorker] Error processing slot ${slot.id}:`,
        error
      );
      // Помечаем как failed
      await db
        .update(notificationSlots)
        .set({ status: 'failed' })
        .where(eq(notificationSlots.id, slot.id));
    }
  }
}

/**
 * Запустить воркер (бесконечный цикл с интервалом)
 * В продакшене использовать BullMQ для надёжности
 */
export function startDeliveryWorker(): void {
  console.log('[DeliveryWorker] Starting delivery worker');

  // Инициализируем Firebase
  initializeFirebase();

  // В development проверяем чаще для удобства тестирования
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const INTERVAL_MS = isDevelopment ? 30 * 1000 : 5 * 60 * 1000; // 30 сек в dev, 5 минут в prod
  const INITIAL_DELAY_MS = isDevelopment ? 10 * 1000 : 60 * 1000; // 10 сек в dev, 1 минута в prod

  // Интервал для проверки и регенерации слотов (раз в час)
  const SCHEDULER_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 час
  const SCHEDULER_INITIAL_DELAY_MS = 5 * 60 * 1000; // 5 минут после старта

  // Интервал для проверки и догенерации текстов (раз в час, с небольшим смещением)
  const TEXT_POOL_REFILL_INTERVAL_MS = 60 * 60 * 1000; // 1 час
  const TEXT_POOL_REFILL_INITIAL_DELAY_MS = 10 * 60 * 1000; // 10 минут после старта

  console.log(
    `[DeliveryWorker] Mode: ${isDevelopment ? 'development' : 'production'}`
  );
  console.log(`[DeliveryWorker] Check interval: ${INTERVAL_MS / 1000} seconds`);
  console.log(
    `[DeliveryWorker] Scheduler check interval: ${SCHEDULER_CHECK_INTERVAL_MS / 1000 / 60} minutes`
  );

  // Первый запуск обработки due-слотов
  setTimeout(() => {
    processDueSlots().catch((error) => {
      console.error('[DeliveryWorker] Error in worker:', error);
    });

    // Последующие запуски обработки due-слотов
    setInterval(() => {
      processDueSlots().catch((error) => {
        console.error('[DeliveryWorker] Error in worker:', error);
      });
    }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  // Первый запуск проверки и регенерации слотов
  setTimeout(() => {
    checkAndRegenerateSlotsIfNeeded().catch((error) => {
      console.error('[DeliveryWorker] Error in scheduler check:', error);
    });

    // Последующие запуски проверки и регенерации слотов
    setInterval(() => {
      checkAndRegenerateSlotsIfNeeded().catch((error) => {
        console.error('[DeliveryWorker] Error in scheduler check:', error);
      });
    }, SCHEDULER_CHECK_INTERVAL_MS);
  }, SCHEDULER_INITIAL_DELAY_MS);

  // Первый запуск проверки и догенерации текстов
  setTimeout(() => {
    refillAllTextPoolsIfNeeded().catch((error) => {
      console.error('[DeliveryWorker] Error in text pool refill:', error);
    });

    // Последующие запуски проверки и догенерации текстов
    setInterval(() => {
      refillAllTextPoolsIfNeeded().catch((error) => {
        console.error('[DeliveryWorker] Error in text pool refill:', error);
      });
    }, TEXT_POOL_REFILL_INTERVAL_MS);
  }, TEXT_POOL_REFILL_INITIAL_DELAY_MS);

  console.log(
    `[DeliveryWorker] Worker scheduled (first check in ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 1000}s)`
  );
  console.log(
    `[DeliveryWorker] Scheduler check scheduled (first check in ${SCHEDULER_INITIAL_DELAY_MS / 1000 / 60} minutes, then every ${SCHEDULER_CHECK_INTERVAL_MS / 1000 / 60} minutes)`
  );
  console.log(
    `[DeliveryWorker] Text pool refill scheduled (first check in ${TEXT_POOL_REFILL_INITIAL_DELAY_MS / 1000 / 60} minutes, then every ${TEXT_POOL_REFILL_INTERVAL_MS / 1000 / 60} minutes)`
  );
}
