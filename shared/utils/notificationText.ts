import type { NotificationPreferenceMeta } from '../dto/notifications';
import type { Gender } from '../dto/onboarding';

const GENDER_SUFFIXES = new Set(['а', 'ая', 'ой', 'ей', 'на', 'ла', 'ась', 'лась', 'кой']);

function applyGenderedVariants(text: string, gender?: Gender | null): string {
  if (!text) {
    return text;
  }

  return text.replace(
    /([A-Za-zА-Яа-яЁё-]+)\(([^)]+)\)/g,
    (match, base: string, alt: string) => {
      if (gender !== 'female' && gender !== 'male') {
        return base;
      }

      if (gender === 'male') {
        return base;
      }

      const altLower = alt.toLowerCase();
      const isSuffix = GENDER_SUFFIXES.has(altLower) || altLower.length <= 3;
      return isSuffix ? `${base}${alt}` : alt;
    }
  );
}

/**
 * Подставляет имя пользователя в текст уведомления.
 * Если имя отсутствует, плейсхолдеры удаляются, чтобы не оставлять запятые/пробелы.
 */
export function formatNotificationTextWithName(
  text: string,
  userName?: string | null,
  userGender?: Gender | null
): string {
  if (!text) {
    return '';
  }

  if (userName && userName.trim()) {
    return applyGenderedVariants(
      text.replace(/{name}/gi, userName.trim()),
      userGender
    );
  }

  const cleaned = text
    .replace(/{name}/gi, '')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  return applyGenderedVariants(cleaned, userGender);
}
