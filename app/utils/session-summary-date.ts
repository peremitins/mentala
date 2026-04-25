import type { SessionSummaryUserItemDtoType } from '@/shared/dto/sessionSummaryUser';

type SessionSummaryDateSource = Pick<
  SessionSummaryUserItemDtoType,
  'sessionStartedAt' | 'sessionEndedAt' | 'createdAt'
>;

export function resolveSessionSummaryDisplayDateIso(
  item: SessionSummaryDateSource
) {
  return item.sessionStartedAt || item.sessionEndedAt || item.createdAt;
}

export function formatSessionSummaryDisplayDate(
  item: SessionSummaryDateSource
) {
  const iso = resolveSessionSummaryDisplayDateIso(item);

  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
