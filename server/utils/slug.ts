/**
 * Утилита для генерации URL-friendly slug из названий
 * Использует библиотеку slugify для транслитерации
 * ВАЖНО: Этот файл должен использоваться только на сервере (в server/ директории)
 */

import slugify from 'slugify';

// Fallback функция для генерации slug (используется если slugify недоступен)
function fallbackSlug(
  input: string,
  options?: { lang?: string; separator?: string; maxLength?: number }
): string {
  let result = input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, options?.separator || '-')
    .replace(/-+/g, options?.separator || '-');

  if (options?.maxLength && result.length > options.maxLength) {
    result = result.substring(0, options.maxLength);
  }

  return result;
}

export interface GenerateSlugOptions {
  /**
   * Язык для транслитерации (по умолчанию 'ru')
   */
  lang?: string;
  /**
   * Разделитель между словами (по умолчанию '-')
   */
  separator?: string;
  /**
   * Максимальная длина slug (по умолчанию 50)
   */
  maxLength?: number;
}

/**
 * Генерирует slug из названия с обработкой дубликатов
 *
 * @param name - Название для преобразования
 * @param existingSlugs - Массив существующих slug для проверки дубликатов
 * @param options - Опции генерации
 * @returns Уникальный slug
 *
 * @example
 * generateSlug('Гимнастика', []) // 'gimnastika'
 * generateSlug('Пить воду', ['pit-vodu']) // 'pit-vodu-1'
 */
export function generateSlug(
  name: string,
  existingSlugs: string[] = [],
  options: GenerateSlugOptions = {}
): string {
  const { lang = 'ru', separator = '-', maxLength = 50 } = options;

  let baseSlug: string;

  try {
    // Используем slugify для генерации slug с транслитерацией
    // locale: 'ru' включает русскую транслитерацию
    baseSlug = slugify(name, {
      lower: true,
      strict: true, // Удаляет специальные символы
      locale: lang === 'ru' ? 'ru' : 'en',
      replacement: separator,
    });

    // Обрезаем до максимальной длины
    if (maxLength && baseSlug.length > maxLength) {
      baseSlug = baseSlug.substring(0, maxLength);
      // Убираем возможный разделитель в конце после обрезки
      baseSlug = baseSlug.replace(new RegExp(`${separator}+$`), '');
    }
  } catch (error) {
    // Если slugify недоступен (например, на клиенте) - используем fallback
    console.warn('[slug] slugify not available, using fallback:', error);
    baseSlug = fallbackSlug(name, options);
  }

  // Если slug пустой (например, только спецсимволы), создаем fallback
  if (!baseSlug || baseSlug.trim().length === 0) {
    baseSlug = 'item';
  }

  // Обработка дубликатов
  let slug = baseSlug;
  let counter = 1;
  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}${separator}${counter}`;
    counter++;
  }

  return slug;
}
