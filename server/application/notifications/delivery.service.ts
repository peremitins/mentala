/**
 * Сервис отправки push-уведомлений через FCM
 *
 * Использует Firebase Admin SDK для отправки push-уведомлений
 * Требует переменную окружения NUXT_FIREBASE_SERVICE_ACCOUNT_JSON
 *
 * См. FIREBASE_SETUP.md для инструкций по настройке
 */

import { eq, and, lte, asc } from 'drizzle-orm';
import {
  db,
  isDbConnectionError,
  resetDbPool,
} from '@/server/infrastructure/db/client';
import {
  notificationSlots,
  userDevices,
} from '@/server/infrastructure/db/schema';
import type { NotificationPayload } from '@/shared/dto/notifications';
import { enqueueAiTextPoolRefillForAllActivePreferences } from '@/server/application/notifications/schedulers/aiTextPool.scheduler';
import { notificationDeliveryQueue } from '@/server/application/notifications/queues/notificationDelivery.queue';
import { getUserTimezone, toLocalTime } from './timezone.utils';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

// ==========================================
// Firebase Admin SDK
// ==========================================

let firebaseApp: admin.app.App | null = null;

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
  payload: NotificationPayload,
  platform?: string | null
): Promise<boolean> {
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
      return false; // Возвращаем false, чтобы система знала, что отправка не удалась
    } else {
      // В development разрешаем mock mode для удобства разработки
      console.log('[FCM] (MOCK) Sending notification:', {
        token: token.substring(0, 20) + '...',
        title: payload.title,
        body: payload.body,
      });
      return true;
    }
  }

  try {
    const normalizedPlatform = String(platform || '').toLowerCase();
    const isAndroid = normalizedPlatform === 'android';

    // Подготовка data - все значения должны быть строками
    const dataPayload: Record<string, string> = {
      action: payload.action || '',
      deepLink: payload.deepLink || '',
    };

    // Для Android используем data-only и строим уведомление нативно.
    // Поэтому прокидываем текст и изображение в data.
    if (isAndroid) {
      dataPayload.title = payload.title || '';
      dataPayload.body = payload.body || '';
      if (payload.image) {
        dataPayload.image = payload.image;
      }
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

    // Формируем collapse key для группировки уведомлений
    // Для habits: habits_{entityKey}, для therapy: therapy_{entityKey} или therapy
    const collapseKey = generateCollapseKey(payload);

    // Подготовка notification объекта с опциональным изображением
    const notificationPayload: admin.messaging.Notification = {
      title: payload.title,
      body: payload.body,
    };

    // Добавляем изображение, если оно указано
    if (payload.image) {
      notificationPayload.imageUrl = payload.image;
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
    if (payload.image) {
      androidNotification.imageUrl = payload.image;
    }

    const message: admin.messaging.Message = {
      token,
      data: dataPayload,
      android: {
        priority: 'high',
        ttl: 60 * 60 * 1000, // 1 час (3600 секунд)
        collapseKey,
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
                // Добавляем изображение для iOS (через fcm_options)
                ...(payload.image && {
                  fcm_options: {
                    image: payload.image,
                  },
                }),
              },
            },
          }),
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
    const success = await sendFCMNotification(
      device.token,
      payload,
      device.platform
    );
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
  const nowUTC = new Date();
  const LATE_DELIVERY_GRACE_MINUTES = 10;

  // Логируем UTC время (основной критерий due остаётся в UTC)
  // Детальное логирование в локальном времени будет для каждого слота отдельно
  console.log(
    `[DeliveryWorker] Checking for due slots at UTC=${nowUTC.toISOString()}`
  );

  try {
    // Получаем все слоты, которые пора отправить
    // Выбираем только 'planned' слоты - 'queued' слоты уже обрабатываются воркером BullMQ
    // Основной критерий due остаётся в UTC (если слоты генерируются с учётом timezone, это корректно)
    const dueSlots = await db
      .select()
      .from(notificationSlots)
      .where(
        and(
          eq(notificationSlots.status, 'planned'), // Только planned слоты
          lte(notificationSlots.scheduledAt, nowUTC)
        )
      )
      .orderBy(asc(notificationSlots.scheduledAt)) // Сортируем по времени - старые слоты обрабатываем первыми
      .limit(100); // Батч из 100 слотов

    console.log(
      `[DeliveryWorker] Found ${dueSlots.length} due slots to process`
    );

    // Группируем слоты по пользователям для получения timezone (избегаем N+1 запросов)
    const userIds = [...new Set(dueSlots.map((s) => s.userId))];
    const timezoneMap = new Map<number, string>();

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
    }

    let enqueuedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const slot of dueSlots) {
      // Логируем в локальном времени для отладки
      const userTimezone = timezoneMap.get(slot.userId) || 'Europe/Moscow';
      const slotLocal = toLocalTime(slot.scheduledAt, userTimezone);
      const nowLocal = toLocalTime(nowUTC, userTimezone);
      const lateMinutes =
        (nowUTC.getTime() - slot.scheduledAt.getTime()) / (60 * 1000);

      if (enqueuedCount < 5) {
        // Логируем первые 5 слотов для отладки
        console.log(
          `[DeliveryWorker] Due slot: UTC=${slot.scheduledAt.toISOString()}, Local=${slotLocal.toISOString()} (${userTimezone}), now Local=${nowLocal.toISOString()}`
        );
      }

      try {
        if (lateMinutes > LATE_DELIVERY_GRACE_MINUTES) {
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
              `[DeliveryWorker] ⏭️ Slot ${slot.id} is late by ${lateMinutes.toFixed(1)} min (local=${slotLocal.toISOString()}), marking as skipped`
            );
          }
          continue;
        }

        // КРИТИЧНО: Атомарно обновляем статус перед постановкой в очередь
        // Это предотвращает race condition - если слот уже обрабатывается, обновление не пройдет
        // Используем результат update напрямую для проверки количества обновленных строк
        const updateResult = await db
          .update(notificationSlots)
          .set({ status: 'queued' })
          .where(
            and(
              eq(notificationSlots.id, slot.id),
              eq(notificationSlots.status, 'planned') // Только если еще planned
            )
          );

        // Проверяем количество обновленных строк через rowCount
        // Если 0 - значит слот уже обрабатывается другим процессом или был удален
        const rowsAffected = updateResult.rowCount || 0;
        if (rowsAffected === 0) {
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
          // Реальная ошибка при постановке в очередь - делаем rollback в planned
          // чтобы слот мог быть обработан при следующем вызове
          try {
            await db
              .update(notificationSlots)
              .set({ status: 'planned' })
              .where(eq(notificationSlots.id, slot.id));
          } catch (rollbackError) {
            console.error(
              `[DeliveryWorker] ❌ Failed to rollback status for slot ${slot.id}:`,
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
      `[DeliveryWorker] ✅ Enqueued ${enqueuedCount} slots, skipped ${skippedCount}, errors ${errorCount} (total due: ${dueSlots.length})`
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
 *
 * Воркеры BullMQ обрабатывают задачи из этих очередей (см. server/plugins/bullmq-workers.ts)
 *
 * ВАЖНО: Эта функция должна вызываться только один раз при старте сервера.
 * Многократный вызов приведет к дублированию планировщиков и таймеров.
 *
 * ПРИМЕЧАНИЕ: Регенерация слотов происходит event-driven образом:
 * - При изменении настроек уведомлений
 * - При изменении timezone
 * - При первом включении уведомлений
 * Периодическая регенерация для всех пользователей отключена как избыточная.
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

  // Интервал для проверки и догенерации текстов (раз в час, с небольшим смещением)
  const TEXT_POOL_REFILL_INTERVAL_MS = 60 * 60 * 1000; // 1 час
  const TEXT_POOL_REFILL_INITIAL_DELAY_MS = 10 * 60 * 1000; // 10 минут после старта

  console.log(
    `[DeliveryWorker] Mode: ${isDevelopment ? 'development' : 'production'}`
  );
  console.log(`[DeliveryWorker] Check interval: ${INTERVAL_MS / 1000} seconds`);

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

  console.log(
    `[DeliveryWorker] Worker scheduled (first check in ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 1000}s)`
  );
  console.log(
    `[DeliveryWorker] Text pool refill scheduled (first check in ${TEXT_POOL_REFILL_INITIAL_DELAY_MS / 1000 / 60} minutes, then every ${TEXT_POOL_REFILL_INTERVAL_MS / 1000 / 60} minutes)`
  );
}
