/**
 * Гендеризация статических UI-текстов на фронте.
 *
 * Разметка: `{мужская_форма|женская_форма}`.
 * Пример: `Ты {прошёл|прошла} свою норму на сегодня.`
 *
 * Зеркало серверного резолвера (server/application/programs/gendered-text.ts).
 * Пол берётся из профиля пользователя (useAuthStore().user?.gender). Пол
 * гарантированно выбран в онбординге; при отсутствии (легаси) дефолт — мужской.
 */

export type UserGender = 'male' | 'female';

const GENDERED_PATTERN = /\{([^{}|]*)\|([^{}|]*)\}/g;

/**
 * Заменяет все `{м|ж}` в строке на форму нужного рода.
 * Нет разметки — строка возвращается как есть (дешёвый no-op).
 */
export function applyGender(
  text: string,
  gender: UserGender | string | null | undefined
): string {
  if (!text.includes('{')) return text;
  const isFemale = gender === 'female';
  return text.replace(GENDERED_PATTERN, (_match, male, female) =>
    isFemale ? female : male
  );
}
