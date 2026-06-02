/**
 * Консервативное извлечение имени пользователя для обращений (приветствие в
 * ИИ-чате, на главном экране, в realtime-голосе).
 *
 * Чистая, изоморфная логика без обращений к БД/сети — поэтому живёт в shared и
 * переиспользуется и на клиенте, и на сервере. Серверный
 * `name-greeting.service.ts` импортирует `extractGreetingName` отсюда (а не
 * держит копию), чтобы правила отбора имени были едиными.
 *
 * Возвращает «безопасное» имя (первое подходящее слово, не похожее на фамилию)
 * либо `null`, если имя использовать нельзя: пустое, никнейм/логин со
 * спецсимволами, стоп-слово (user/test/админ/…), без гласных и т.п. В этом
 * случае вызывающий код обращается без имени.
 */

const STOP_WORDS = new Set([
  'user',
  'test',
  'admin',
  'guest',
  'anon',
  'anonymous',
  'bot',
  'none',
  'null',
  'undefined',
  'пользователь',
  'тест',
  'админ',
  'гость',
  'анон',
  'аноним',
  'бот',
]);

const CYRILLIC_SURNAME_SUFFIXES = [
  'ов',
  'ев',
  'ин',
  'ын',
  'ова',
  'ева',
  // 'ина' намеренно исключён: совпадает с популярными женскими именами (Марина, Ирина, Арина, Полина и др.)
  'ына',
  'ский',
  'ская',
  'цкий',
  'цкая',
  'ой',
  'ый',
  'ая',
  'енко',
  'ук',
  'юк',
  'ко',
  'ич',
  'вич',
  'ович',
  'евич',
];

const LATIN_SURNAME_SUFFIXES = ['ov', 'ev', 'in', 'sky', 'ski', 'son', 'sen'];

const NAME_VOWELS = /[AEIOUYАЕЁИОУЫЭЮЯ]/i;
const INVALID_NAME_CHARS = /[^A-Za-zА-Яа-яЁё-\s]/;

function looksLikeSurname(token: string): boolean {
  const lower = token.toLowerCase();
  return (
    CYRILLIC_SURNAME_SUFFIXES.some((suffix) => lower.endsWith(suffix)) ||
    LATIN_SURNAME_SUFFIXES.some((suffix) => lower.endsWith(suffix))
  );
}

function formatNameCase(name: string): string {
  const parts = name.split('-');
  const formatted = parts.map((part) => {
    if (!part) return part;
    const isUpper = part === part.toUpperCase();
    const isLower = part === part.toLowerCase();
    if (isUpper || isLower) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
    return part.charAt(0).toUpperCase() + part.slice(1);
  });
  return formatted.join('-');
}

/**
 * Консервативно извлекает имя для приветствия.
 * Если есть сомнения — возвращает null.
 */
export function extractGreetingName(rawName?: string | null): string | null {
  if (!rawName || typeof rawName !== 'string') {
    return null;
  }

  const normalized = rawName.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  // Разрешаем только буквы, пробелы и дефис — всё остальное считаем никнеймом.
  if (INVALID_NAME_CHARS.test(normalized)) {
    return null;
  }

  const tokens = normalized
    .split(' ')
    .map((token) => token.replace(/^-+|-+$/g, ''))
    .filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  // Ищем первый токен, который проходит базовую валидацию и не похож на фамилию.
  // Это позволяет корректно обрабатывать любой порядок: «Имя Фамилия»,
  // «Фамилия Имя», «Фамилия Имя Отчество», и т.д.
  for (const token of tokens) {
    const lettersOnly = token.replace(/-/g, '');
    if (lettersOnly.length < 2 || lettersOnly.length > 32) continue;
    if (!NAME_VOWELS.test(token)) continue;
    if (STOP_WORDS.has(token.toLowerCase())) continue;
    if (looksLikeSurname(token)) continue;
    return formatNameCase(token);
  }

  // Все токены похожи на фамилии или не прошли валидацию — не обращаемся по имени.
  return null;
}
