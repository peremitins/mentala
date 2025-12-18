/**
 * Обработчик необработанных отклонений промисов
 * Предотвращает падение приложения при ошибках подключения к Nuxt dev socket
 * и других необработанных промисах
 */
export default defineNitroPlugin(() => {
  // Обрабатываем необработанные отклонения промисов
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    // Игнорируем ошибки подключения к Nuxt dev socket (это нормально при перезапуске сервера)
    if (
      reason?.code === 'ECONNREFUSED' &&
      (reason?.message?.includes('nuxt-dev') ||
        reason?.message?.includes('.sock') ||
        reason?.syscall === 'connect')
    ) {
      // Это не критичная ошибка - просто игнорируем
      return;
    }

    // Для остальных ошибок логируем, но не падаем
    console.error('[UnhandledRejection] Unhandled promise rejection:', {
      reason: reason?.message || reason,
      code: reason?.code,
      syscall: reason?.syscall,
      stack: reason?.stack,
    });
  });

  // Обрабатываем необработанные исключения
  process.on('uncaughtException', (error: Error) => {
    // Игнорируем ошибки подключения к Nuxt dev socket
    if (
      error?.message?.includes('ECONNREFUSED') &&
      (error?.message?.includes('nuxt-dev') ||
        error?.message?.includes('.sock'))
    ) {
      return;
    }

    // Для остальных ошибок логируем
    console.error('[UncaughtException] Uncaught exception:', error);
  });
});
