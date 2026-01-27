/**
 * Обработчик необработанных отклонений промисов
 * Предотвращает падение приложения при ошибках подключения к Nuxt dev socket
 * и других необработанных промисах
 */
export default defineNitroPlugin(() => {
  // Обрабатываем необработанные отклонения промисов
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    // Преобразуем reason в строку для проверки (может быть объектом или строкой)
    const reasonStr = String(reason?.message || reason || '');
    const reasonCode = reason?.code;
    const reasonSyscall = reason?.syscall;

    // Игнорируем ошибки подключения к Nuxt dev socket (это нормально при перезапуске сервера)
    if (
      (reasonCode === 'ECONNREFUSED' || reasonStr.includes('ECONNREFUSED')) &&
      (reasonStr.includes('nuxt-dev') ||
        reasonStr.includes('.sock') ||
        reasonSyscall === 'connect')
    ) {
      // Это не критичная ошибка - просто игнорируем
      return;
    }

    // Для остальных ошибок логируем, но не падаем
    console.error('[UnhandledRejection] Unhandled promise rejection:', {
      reason: reasonStr,
      code: reasonCode,
      syscall: reasonSyscall,
      stack: reason?.stack,
    });
  });

  // Обрабатываем необработанные исключения
  process.on('uncaughtException', (error: Error) => {
    const errorMessage = String(error?.message || error || '');

    // Игнорируем ошибки подключения к Nuxt dev socket
    if (
      errorMessage.includes('ECONNREFUSED') &&
      (errorMessage.includes('nuxt-dev') || errorMessage.includes('.sock'))
    ) {
      return;
    }

    // Для остальных ошибок логируем
    console.error('[UncaughtException] Uncaught exception:', error);
  });
});
