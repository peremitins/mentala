/**
 * Общий клиент Redis и хелперы для BullMQ
 * Единая точка подключения для всех очередей и воркеров
 *
 * @version BullMQ 5.x (QueueScheduler удалён, встроен в Worker)
 */

import type { Job, Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import { Queue as BullQueue, Worker as BullWorker } from 'bullmq';
import IORedis from 'ioredis';
import { redisConfig } from '@/server/config/redis';

const {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
} = redisConfig;
const isStaticBuild = redisConfig.isStaticBuild;
const isNotificationsWorkerEnabled =
  process.env.ENABLE_NOTIFICATIONS_WORKER !== 'false';
const isBullMqDisabled = isStaticBuild || !isNotificationsWorkerEnabled;

// Логирование конфигурации Redis для диагностики
console.log('[Redis] Configuration:', {
  host: redisHost,
  port: redisPort,
  password: redisPassword ? '***' : undefined,
  env: {
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    BULLMQ_ENABLE_WORKERS: process.env.BULLMQ_ENABLE_WORKERS,
    ENABLE_NOTIFICATIONS_WORKER: process.env.ENABLE_NOTIFICATIONS_WORKER,
  },
});

if (isBullMqDisabled) {
  console.log('[Redis] BullMQ disabled for current process', {
    isStaticBuild,
    isNotificationsWorkerEnabled,
  });
}

let redisConnectionInstance: IORedis | null = null;
if (!isBullMqDisabled) {
  // Единое подключение к Redis для всех очередей
  // maxRetriesPerRequest: null - критично для BullMQ
  // enableReadyCheck: false - критично для BullMQ
  redisConnectionInstance = new IORedis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    maxRetriesPerRequest: null, // Критично для BullMQ
    enableReadyCheck: false, // Критично для BullMQ
    enableOfflineQueue: true, // Позволяет ставить задачи в очередь до подключения к Redis
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true; // Переподключаемся при READONLY ошибке
      }
      return false;
    },
  });
}

export const redisConnection = redisConnectionInstance as unknown as IORedis;

function createNoopQueue<T>(name: string): Queue<T> {
  const queue = {
    name,
    add: async (jobName: string, data: unknown) =>
      ({
        id: `noop-${Date.now()}`,
        name: jobName,
        data,
      }) as any,
    close: async () => undefined,
  } as any;
  return queue as Queue<T>;
}

function createNoopWorker<TData = any, TResult = any>(
  name: string
): Worker<TData, TResult> {
  const worker = {
    name,
    on: () => worker,
    close: async () => undefined,
  } as any;
  return worker as Worker<TData, TResult>;
}

// Обработка ошибок подключения
let connectionErrorLogged = false;
redisConnectionInstance?.on('error', (err) => {
  // Во время static generate Redis может быть не нужен — не спамим лог.
  if (isStaticBuild) return;

  // Логируем ошибку только один раз, чтобы не спамить
  if (!connectionErrorLogged) {
    if (err.message.includes('ECONNREFUSED')) {
      console.error(
        '[Redis] ❌ Не удалось подключиться к Redis. Убедись, что Redis запущен:'
      );
      console.error('   - Docker: pnpm dev:redis:up');
      console.error('   - Локально (macOS): brew services start redis');
      console.error('   - Проверка: pnpm dev:redis:check');
    } else {
      console.error('[Redis] Connection error:', err.message);
    }
    connectionErrorLogged = true;
  }
});

redisConnectionInstance?.on('connect', () => {
  if (isStaticBuild) return;
  connectionErrorLogged = false; // Сбрасываем флаг при успешном подключении
  console.log('[Redis] ✅ Connected successfully');
});

redisConnectionInstance?.on('ready', () => {
  if (isStaticBuild) return;
  console.log('[Redis] ✅ Ready to accept commands');
});

/**
 * Создаёт очередь BullMQ с настройками по умолчанию
 * @param name - имя очереди
 * @param options - дополнительные опции очереди
 */
export function createQueue<T = any>(
  name: string,
  options: Omit<QueueOptions, 'connection'> & {
    limiter?: { max: number; duration: number };
  } = {}
): Queue<T> {
  if (isBullMqDisabled || !redisConnectionInstance) {
    return createNoopQueue<T>(name);
  }

  return new BullQueue<T>(name, {
    connection: redisConnectionInstance,
    defaultJobOptions: {
      attempts: 3, // 3 попытки (первая + 2 повтора)
      backoff: {
        type: 'exponential',
        delay: 10_000, // 10 секунд между ретраями
      },
      removeOnComplete: {
        age: 24 * 3600, // Хранить завершённые задачи 24 часа
        count: 1000, // Или максимум 1000 задач
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Хранить проваленные задачи 7 дней
        count: 5000, // Или максимум 5000 задач
      },
    },
    ...options,
  });
}

/**
 * Создаёт воркер для обработки задач очереди
 *
 * Примечание: removeOnComplete/removeOnFail настраиваются через createQueue → defaultJobOptions,
 * а не через воркер. Воркер управляет только обработкой задач.
 *
 * @param name - имя очереди
 * @param processor - функция обработки задачи (получает BullMQ Job объект)
 * @param options - дополнительные опции воркера
 */
export function createWorker<TData = any, TResult = any>(
  name: string,
  processor: (job: Job<TData, TResult>, token?: string) => Promise<TResult>,
  options: Omit<WorkerOptions, 'connection'> = {}
): Worker<TData, TResult> {
  if (isBullMqDisabled || !redisConnectionInstance) {
    return createNoopWorker<TData, TResult>(name);
  }

  const worker = new BullWorker<TData, TResult>(name, processor, {
    connection: redisConnectionInstance,
    concurrency: 5, // По умолчанию 5 параллельных задач
    // Защита от застрявших задач
    stalledInterval: 30000, // Проверка каждые 30 секунд
    maxStalledCount: 3, // Максимум 3 попытки
    ...options,
  });

  // Event handlers для отладки и мониторинга
  worker.on('completed', (job) => {
    const duration = job.finishedOn ? job.finishedOn - job.processedOn! : 0;
    console.log(`[Worker:${name}] ✅ Job ${job.id} completed in ${duration}ms`);
  });

  worker.on('failed', (job, err) => {
    const attemptsMade = Number(job?.attemptsMade || 0);
    const maxAttempts = Number(job?.opts.attempts || 1);
    const hasRetriesLeft = attemptsMade < maxAttempts;
    const logMessage = `[Worker:${name}] ${hasRetriesLeft ? '⚠️' : '❌'} Job ${job?.id} failed (attempt ${attemptsMade}/${maxAttempts})${hasRetriesLeft ? ', will retry' : ''}:`;

    if (hasRetriesLeft) {
      console.warn(logMessage, err.message);
      return;
    }

    console.error(logMessage, err.message);
  });

  worker.on('stalled', (jobId) => {
    console.warn(
      `[Worker:${name}] ⚠️ Job ${jobId} stalled and will be retried`
    );
  });

  worker.on('error', (err) => {
    console.error(`[Worker:${name}] ❌ Worker error:`, err);
  });

  return worker;
}

// Массив для отслеживания всех воркеров (для graceful shutdown)
const workers: Worker[] = [];

/**
 * Регистрирует воркер для graceful shutdown
 */
export function registerWorker(worker: Worker): void {
  workers.push(worker);
}

/**
 * Graceful shutdown всех воркеров
 */
export async function shutdownWorkers(): Promise<void> {
  console.log('[BullMQ] Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  if (redisConnectionInstance) {
    await redisConnectionInstance.quit();
  }
  console.log('[BullMQ] All workers shut down');
}

// Обработка сигналов завершения процесса
process.on('SIGTERM', async () => {
  console.log('[BullMQ] Received SIGTERM signal');
  await shutdownWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[BullMQ] Received SIGINT signal');
  await shutdownWorkers();
  process.exit(0);
});
