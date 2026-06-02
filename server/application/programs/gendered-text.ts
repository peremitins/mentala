/**
 * Гендеризация статических текстов программ (Roadmap / сады).
 *
 * Разметка в тексте: `{мужская_форма|женская_форма}`.
 * Пример: `Ты {прошёл|прошла} первую программу.`
 *
 * Резолв происходит на чтении (при сборке DTO), а не при синке блюпринтов в БД —
 * иначе в базу лёг бы один род. В БД хранится сырая разметка `{м|ж}`, а конкретная
 * форма выбирается per-request по `users.gender`.
 *
 * Пол пользователя гарантированно выбран в онбординге (male | female). Нейтральной
 * формы намеренно нет. Если из БД всё же прилетит null (легаси-записи до онбординга),
 * резолвер дефолтит на мужской род — пользователь никогда не увидит сырую разметку.
 */

export type UserGender = 'male' | 'female';

/**
 * Разметка гендерных форм: `{мужское|женское}`.
 * Внутри форм не должно быть `{`, `}` или `|`.
 */
const GENDERED_PATTERN = /\{([^{}|]*)\|([^{}|]*)\}/g;

function normalizeGender(
  gender: UserGender | string | null | undefined
): UserGender {
  return gender === 'female' ? 'female' : 'male';
}

/**
 * Заменяет все вхождения `{м|ж}` в строке на форму нужного рода.
 * Если разметки нет — возвращает строку без изменений (дешёвый no-op).
 */
export function applyGender(
  text: string,
  gender: UserGender | string | null | undefined
): string {
  if (!text.includes('{')) return text;
  const isFemale = normalizeGender(gender) === 'female';
  return text.replace(GENDERED_PATTERN, (_match, male, female) =>
    isFemale ? female : male
  );
}

/**
 * Рекурсивно прогоняет все строки внутри значения (объект/массив/строка) через
 * applyGender. Не-строковые примитивы возвращаются как есть. Используется как
 * единая точка резолва на выходе DTO наружу.
 */
export function applyGenderDeep<T>(
  value: T,
  gender: UserGender | string | null | undefined
): T {
  if (typeof value === 'string') {
    return applyGender(value, gender) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyGenderDeep(item, gender)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      result[key] = applyGenderDeep(item, gender);
    }
    return result as T;
  }
  return value;
}
