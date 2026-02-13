/**
 * Константы для системы подписок
 */

// PRO лимит ИИ-чата в минутах на неделю.
export const PRO_WEEKLY_MINUTES_LIMIT =
  Number(process.env.PRO_WEEKLY_MINUTES_LIMIT) || 100;

// Fair-use guard для Premium: после достижения порога новые ответы блокируются
// до следующего окна сброса.
export const PREMIUM_FAIR_USE_GUARD_MINUTES_PER_WEEK =
  Number(process.env.PREMIUM_FAIR_USE_GUARD_MINUTES_PER_WEEK) || 900;

// Еженедельный overdraft (допустимый перерасход минут сверх лимита)
export const WEEKLY_OVERDRAFT_MINUTES =
  Number(process.env.WEEKLY_OVERDRAFT_MINUTES) || 10;

// Дефолтный лимит минут для планов (если не указан в БД)
export const DEFAULT_WEEKLY_MINUTES_LIMIT = PRO_WEEKLY_MINUTES_LIMIT;

// Таймаут бездействия для чата (в миллисекундах)
// Используется для автоматического завершения сессий при отсутствии активности
// 2 минуты = 120000 мс
export const CHAT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
