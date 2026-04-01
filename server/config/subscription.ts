/**
 * Константы для системы подписок
 */

function readPositiveIntFromEnv(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
}

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
// 15 минут = 900000 мс
export const CHAT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

// Длительность trial в часах (дефолт: 7 дней).
export const TRIAL_DURATION_HOURS = readPositiveIntFromEnv(
  process.env.TRIAL_DURATION_HOURS,
  7 * 24
);

// За сколько минут до nextChargeAt запускать первую авто-попытку списания.
export const TRIAL_BILLING_EARLY_CHARGE_MINUTES = readPositiveIntFromEnv(
  process.env.TRIAL_BILLING_EARLY_CHARGE_MINUTES,
  5
);
export const TRIAL_BILLING_EARLY_CHARGE_MS =
  TRIAL_BILLING_EARLY_CHARGE_MINUTES * 60 * 1000;

// Размер батча пользователей для отправки reminder за 24 часа до списания.
export const TRIAL_BILLING_REMINDER_BATCH_SIZE = readPositiveIntFromEnv(
  process.env.TRIAL_BILLING_REMINDER_BATCH_SIZE,
  200
);

// Максимум батчей reminder за один tick воркера.
export const TRIAL_BILLING_REMINDER_MAX_BATCHES_PER_TICK =
  readPositiveIntFromEnv(
    process.env.TRIAL_BILLING_REMINDER_MAX_BATCHES_PER_TICK,
    8
  );

// Параллелизм отправки reminder в рамках одного батча.
export const TRIAL_BILLING_REMINDER_CONCURRENCY = readPositiveIntFromEnv(
  process.env.TRIAL_BILLING_REMINDER_CONCURRENCY,
  20
);

// TTL lock для reminder-claim (в минутах), чтобы избежать дублей между инстансами.
export const TRIAL_BILLING_REMINDER_LOCK_TTL_MINUTES = readPositiveIntFromEnv(
  process.env.TRIAL_BILLING_REMINDER_LOCK_TTL_MINUTES,
  30
);
export const TRIAL_BILLING_REMINDER_LOCK_TTL_MS =
  TRIAL_BILLING_REMINDER_LOCK_TTL_MINUTES * 60 * 1000;

// TTL одноразового external-session токена для возврата из YooKassa во внешний браузер.
// Нужен длиннее обычного browser handoff, потому что пользователь может провести
// в платежной форме несколько минут.
export const PAYMENT_RETURN_EXTERNAL_SESSION_TTL_SECONDS =
  readPositiveIntFromEnv(
    process.env.PAYMENT_RETURN_EXTERNAL_SESSION_TTL_SECONDS,
    2 * 60 * 60
  );
