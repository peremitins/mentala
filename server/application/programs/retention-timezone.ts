/**
 * Чистые timezone-хелперы для retention-логики.
 *
 * Вынесены из `retention-program.service.ts`, чтобы:
 *  - можно было запускать unit-тесты без mock'ов БД-клиента (Drizzle / pg pool
 *    подтягиваются в service по импорту и ломают vitest без полного nuxt-конфига);
 *  - переиспользовать в других сервисах без транзитивной зависимости на БД.
 *
 * Все функции детерминированные, без I/O, без даты `Date.now()` внутри —
 * принимают входные параметры и возвращают результат.
 */

export const DEFAULT_RETENTION_TIMEZONE = 'Europe/Moscow';

/**
 * Возвращает локальную календарную дату в формате `YYYY-MM-DD` для указанного
 * момента и timezone. Используется для группировки энергии/шагов по «местному дню»
 * пользователя (см. `energy_events.event_date`).
 *
 * Принимает null/undefined/'' — fallback на DEFAULT_RETENTION_TIMEZONE.
 */
export function getLocalDateKey(date: Date, timezone?: string | null): string {
  const tz = timezone || DEFAULT_RETENTION_TIMEZONE;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

/**
 * Возвращает `YYYY-MM-DD` смещённую на `deltaDays` от `dateKey`.
 *
 * NB: используем UTC-арифметику, чтобы избежать летнего/зимнего DST-сдвига
 * на стыке локального дня. Для `nextLocalMidnight` это безопасно, потому что
 * после смещения мы всё равно конвертируем обратно через timezone-offset.
 */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year = 1970, month = 1, day = 1] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Возвращает UTC-момент локальной полуночи следующего дня в `timezone`.
 *
 * Используется для расчёта когда пользователю откроется новый слот в daily-limit
 * «2 шага в день» (см. retention/retention_long_term_strategy.md).
 *
 * Реализация:
 *  - получаем YYYY-MM-DD следующего дня (через `shiftDateKey`);
 *  - читаем shortOffset timezone через `Intl.DateTimeFormat` (формат `GMT±H` /
 *    `GMT±HH:MM`) — поддерживает половинные (`+06:30`, `+05:30`) и
 *    четвертьчасовые смещения (`+12:45` в Pacific/Chatham);
 *  - конвертируем локальную полночь в UTC через найденное смещение.
 */
export function nextLocalMidnight(entryDate: string, timezone: string): Date {
  const tz = timezone || DEFAULT_RETENTION_TIMEZONE;
  const nextDayKey = shiftDateKey(entryDate, 1);
  const localMidnightIso = `${nextDayKey}T00:00:00`;

  // shortOffset: 'GMT+3' / 'GMT-05:30' / 'GMT+12:45'.
  // formatToParts на дате `nextDayKey 00:00 UTC` даёт offset для нужной даты
  // (важно для DST: 15 марта и 15 июля у New York разные смещения).
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(new Date(`${nextDayKey}T00:00:00Z`));
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';

  // GMT — без смещения (offsetPart === 'GMT' для UTC).
  const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  let offsetMinutes = 0;
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const hours = parseInt(match[2] || '0', 10);
    const minutes = parseInt(match[3] || '0', 10);
    offsetMinutes = sign * (hours * 60 + minutes);
  }

  const utcMs =
    new Date(`${localMidnightIso}Z`).getTime() - offsetMinutes * 60_000;
  return new Date(utcMs);
}

/**
 * Возвращает UTC-момент ближайшего вхождения `hour:00` локального времени.
 *
 * Если сегодня этот час ещё не наступил (с запасом 5 мин) — возвращает сегодня.
 * Иначе — завтра тот же час. Используется для расчёта времени push-уведомлений
 * (утренние 9:00, вечерние 20:00 и т.д.).
 */
export function nextLocalHourAt(
  hour: number,
  timezone: string,
  now: Date
): Date {
  const tz = timezone || DEFAULT_RETENTION_TIMEZONE;

  function computeForDateKey(dateKey: string): Date {
    const localHourIso = `${dateKey}T${String(hour).padStart(2, '0')}:00:00`;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(new Date(`${dateKey}T00:00:00Z`));
    const offsetPart =
      parts.find((p) => p.type === 'timeZoneName')?.value || '';
    const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    let offsetMinutes = 0;
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      const hrs = parseInt(match[2] || '0', 10);
      const mins = parseInt(match[3] || '0', 10);
      offsetMinutes = sign * (hrs * 60 + mins);
    }
    return new Date(
      new Date(`${localHourIso}Z`).getTime() - offsetMinutes * 60_000
    );
  }

  const todayKey = getLocalDateKey(now, tz);
  const candidateToday = computeForDateKey(todayKey);
  // Запас 5 минут: если до нужного часа меньше 5 мин — берём следующий день.
  if (candidateToday.getTime() > now.getTime() + 5 * 60_000) {
    return candidateToday;
  }
  return computeForDateKey(shiftDateKey(todayKey, 1));
}

/**
 * Длина окна daily-limit в миллисекундах из env.
 *
 * `NUXT_PRIVATE_DAILY_STEP_WINDOW_MS`:
 *  - 0 или не задано (prod-режим): окно = один локальный календарный день
 *    пользователя. `countCompletedProgramSteps...` считает по `eventDate`,
 *    nextResetAt = локальная полночь следующего дня.
 *  - > 0 (dev-override, например 60_000 для 1 минуты): короткий cooldown после
 *    достижения нормы шагов. Сам момент окончания cooldown считает сервис
 *    программ от последнего completion-события; этот helper только читает
 *    длительность окна. В prod env-переменная не задаётся.
 */
let dailyLimitWindowLogged = false;
export function getDailyLimitWindowMs(): number {
  if (typeof process === 'undefined') return 0;
  const raw = Number(process.env.NUXT_PRIVATE_DAILY_STEP_WINDOW_MS);
  const windowMs = Number.isFinite(raw) && raw > 0 ? raw : 0;
  // Однократный диагностический лог при первом запросе: если dev-override
  // активен, видно в server console. Если кажется, что override не работает,
  // первое что проверяем — рестарт `pnpm dev` после правки `.env.development`
  // (Nitro не подхватывает env hot).
  if (!dailyLimitWindowLogged) {
    dailyLimitWindowLogged = true;
    if (windowMs > 0) {
      console.log(
        `[retention] daily-limit dev-override active: cooldown = ${windowMs}ms (${Math.round(windowMs / 1000)}s)`
      );
    } else {
      console.log(
        `[retention] daily-limit prod mode: window = calendar day (NUXT_PRIVATE_DAILY_STEP_WINDOW_MS not set or 0)`
      );
    }
  }
  return windowMs;
}

export type DevDailyLimitCycleState = {
  stepsDoneToday: number;
  nextResetAt: Date | null;
};

/**
 * Dev-only quota-cycle для Roadmap pacing.
 *
 * В отличие от rolling-window, эта модель не теряет completion-события только
 * потому, что timed-практика длилась дольше тестового окна. После каждого N-го
 * завершённого шага включается cooldown от последнего completion-события.
 */
export function getDevDailyLimitCycleState(params: {
  completedCount: number;
  latestCompletedAt: Date | null;
  now: Date;
  dailyStepLimit: number;
  windowMs: number;
}): DevDailyLimitCycleState {
  const completedCount = Math.max(0, Math.floor(params.completedCount));
  const dailyStepLimit = Math.max(1, Math.floor(params.dailyStepLimit));
  const completedInCurrentCycle = completedCount % dailyStepLimit;
  const cooldownEndsAt = params.latestCompletedAt
    ? new Date(params.latestCompletedAt.getTime() + params.windowMs)
    : null;
  const isCooldownActive =
    completedCount > 0 &&
    completedInCurrentCycle === 0 &&
    cooldownEndsAt !== null &&
    cooldownEndsAt.getTime() > params.now.getTime();

  return {
    stepsDoneToday: isCooldownActive ? dailyStepLimit : completedInCurrentCycle,
    nextResetAt: isCooldownActive ? cooldownEndsAt : null,
  };
}

/**
 * Возвращает момент, когда пользователю откроется следующий слот в daily-лимите.
 *
 * В prod-режиме это локальная полночь следующего дня (`nextLocalMidnight`).
 * В dev-режиме (с заданным `NUXT_PRIVATE_DAILY_STEP_WINDOW_MS > 0`) прямой
 * вызов возвращает `now + windowMs`. Для Roadmap daily-limit основной путь —
 * `getProgramDailyLimitState`, потому что ему нужен cooldown от последнего
 * completion-события, а не от текущего момента.
 *
 * Параметр `windowMsOverride` позволяет инжектить значение из тестов,
 * не трогая `process.env`.
 */
export function getNextDailyResetAt(
  now: Date,
  timezone: string,
  windowMsOverride?: number
): Date {
  const windowMs = windowMsOverride ?? getDailyLimitWindowMs();
  if (windowMs > 0) {
    return new Date(now.getTime() + windowMs);
  }
  const entryDate = getLocalDateKey(now, timezone);
  return nextLocalMidnight(entryDate, timezone);
}
