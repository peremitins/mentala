import { validateSmtpConfig } from '@/server/application/auth/email-sender';

export default defineNitroPlugin(() => {
  const result = validateSmtpConfig();
  if (!result.valid) {
    // Предупреждаем о проблемах, но не блокируем запуск
    console.warn('[SMTP] Неполная конфигурация SMTP:', {
      errors: result.errors,
    });
  }
});
