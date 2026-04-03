/**
 * Константы для системы подписок
 */

/**
 * Читает положительное целое из env. Возвращает fallback, если значение невалидное.
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

/**
 * Читает лимит из env: положительное число — конкретный лимит, -1 — безлимит.
 * Любое другое значение → fallback.
 */
function readLimitFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed === -1) return -1;

  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
}

// PRO лимит ИИ-чата в минутах на неделю. -1 = безлимит (Pro ведёт себя как Premium).
export const PRO_WEEKLY_MINUTES_LIMIT = readLimitFromEnv(
  process.env.PRO_WEEKLY_MINUTES_LIMIT,
  100
);

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

// TTL одноразового external-session токена для возврата из YooKassa во внешний браузер.
// Нужен длиннее обычного browser handoff, потому что пользователь может провести
// в платежной форме несколько минут.
export const PAYMENT_RETURN_EXTERNAL_SESSION_TTL_SECONDS =
  readPositiveIntFromEnv(
    process.env.PAYMENT_RETURN_EXTERNAL_SESSION_TTL_SECONDS,
    2 * 60 * 60
  );
