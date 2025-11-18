import type { NotificationPreferenceMeta } from '../dto/notifications';

/**
 * Подставляет имя пользователя в текст уведомления.
 * Если имя отсутствует, плейсхолдеры удаляются, чтобы не оставлять запятые/пробелы.
 */
export function formatNotificationTextWithName(
  text: string,
  userName?: string | null
): string {
  if (!text) {
    return '';
  }

  if (userName && userName.trim()) {
    return text.replace(/{name}/gi, userName.trim());
  }

  return text
    .replace(/{name}/gi, '')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pickCustomTextFromMeta(
  meta: NotificationPreferenceMeta | null | undefined,
  userName?: string | null,
  sequenceIndex?: number
): string | null {
  if (!meta?.customTexts?.length) {
    return null;
  }

  const pool = meta.customTexts;
  const index =
    sequenceIndex !== undefined
      ? sequenceIndex % pool.length
      : Math.floor(Math.random() * pool.length);
  const selected = pool[index];

  return formatNotificationTextWithName(selected, userName);
}
