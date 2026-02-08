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
 * Очищает плейсхолдеры имени в уведомлениях и нормализует пунктуацию.
 * Важно для пользовательских текстов, где могли остаться {name}.
 */
export function formatNotificationText(
  text: string,
  userGender?: Gender | null
): string {
  if (!text) {
    return '';
  }

  const hadNamePlaceholder = /{name}/i.test(text);

  let cleaned = text
    .replace(/{name}/gi, '')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  if (hadNamePlaceholder) {
    cleaned = cleaned.replace(/^[,–—-]\s*/g, '').trim();
    cleaned = cleaned.replace(
      /^([^A-Za-zА-Яа-яЁё]*)([A-Za-zА-Яа-яЁё])/,
      (_match, prefix: string, firstLetter: string) =>
        `${prefix}${firstLetter.toUpperCase()}`
    );
  }

  return applyGenderedVariants(cleaned, userGender);
}
