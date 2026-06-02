import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest конфиг — синхронизируем path alias `@/` с Nuxt'ом, чтобы серверный
 * код (server/application/programs/retention-program.service.ts) корректно
 * импортировался в тестах. Без этого `@/server/infrastructure/db/client` и
 * подобные импорты падают с «Failed to load url».
 *
 * env stub: ставим минимально необходимые переменные перед загрузкой модулей.
 * `NUXT_PRIVATE_DB_URL` тестам не нужен функционально (мы не делаем реальных
 * запросов), но import db/client.ts падает без него. Подставляем заглушку.
 */
process.env.NUXT_PRIVATE_DB_URL =
  process.env.NUXT_PRIVATE_DB_URL || 'postgresql://USER:PASSWORD@HOST:5432/DATABASE';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
