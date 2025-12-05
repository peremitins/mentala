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
