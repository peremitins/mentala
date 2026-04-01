import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { getHeader } from 'h3';

const DEFAULT_TIMEZONE = 'Europe/Moscow';
const ENTRY_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function formatLocalDateParts(date: Date): string {
  return [
    String(date.getFullYear()),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
}

export function isValidEntryDate(value: string): boolean {
  if (!ENTRY_DATE_REGEX.test(value)) return false;

  const [yearText = '', monthText = '', dayText = ''] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function isValidTimezone(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;

  try {
    formatInTimeZone(new Date(), value, 'yyyy-MM-dd');
    return true;
  } catch {
    return false;
  }
}

export function resolveEntryTimezone(
  event: Parameters<typeof getHeader>[0]
): string {
  const rawHeaderTimezone = getHeader(event, 'x-timezone');
  const headerTimezone = Array.isArray(rawHeaderTimezone)
    ? rawHeaderTimezone[0]
    : rawHeaderTimezone;
  return isValidTimezone(headerTimezone) ? headerTimezone : DEFAULT_TIMEZONE;
}

export function getEntryDateKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

export function getTodayEntryDate(timezone: string): string {
  return getEntryDateKey(new Date(), timezone);
}

export function getYesterdayEntryDate(timezone: string): string {
  const localNow = toZonedTime(new Date(), timezone);
  localNow.setDate(localNow.getDate() - 1);
  return formatLocalDateParts(localNow);
}

export function isFutureEntryDate(
  entryDate: string,
  timezone: string
): boolean {
  return entryDate > getTodayEntryDate(timezone);
}

export function buildEntryCreatedAt(params: {
  entryDate: string;
  timezone: string;
  preserveTimeFrom?: Date;
}): Date {
  const preserveTimeSource = params.preserveTimeFrom ?? new Date();
  const localTime = toZonedTime(preserveTimeSource, params.timezone);
  const [yearText = '', monthText = '', dayText = ''] =
    params.entryDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  // Сохраняем выбранный локальный день и отдельно оставляем локальное время,
  // чтобы карточка записи не меняла часы/минуты без причины.
  const localDateTime = new Date(
    year,
    month - 1,
    day,
    localTime.getHours(),
    localTime.getMinutes(),
    localTime.getSeconds(),
    localTime.getMilliseconds()
  );

  return fromZonedTime(localDateTime, params.timezone);
}
