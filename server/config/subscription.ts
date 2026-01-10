/**
 * Константы для системы подписок
 */

// Еженедельный overdraft (допустимый перерасход минут сверх лимита)
export const WEEKLY_OVERDRAFT_MINUTES =
  Number(process.env.WEEKLY_OVERDRAFT_MINUTES) || 10;

// Дефолтный лимит минут для планов (если не указан в БД)
export const DEFAULT_WEEKLY_MINUTES_LIMIT = 100;

// Таймаут бездействия для чата (в миллисекундах)
// Используется для автоматического завершения сессий при отсутствии активности
// 2 минуты = 120000 мс
export const CHAT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
