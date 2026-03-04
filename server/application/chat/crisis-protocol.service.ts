export type CrisisLevel = 'none' | 'crisis_watch' | 'crisis_high';

type ChatLikeMessage = {
  role?: string;
  content?: string;
};

export type CrisisGuidanceResult = {
  level: CrisisLevel;
  guidance: string | null;
  countryCode: string | null;
  emergencyNumbers: string[] | null;
  emergencyNumbersDisplay: string | null;
};

const CRISIS_HIGH_PATTERNS: RegExp[] = [
  /i\s*(want|wanna|plan|will|am going)\s*to\s*(kill myself|hurt myself|die|end my life)/i,
  /i\s*want\s*to\s*harm\s*myself/i,
  /i\s*want\s*to\s*hurt\s*me/i,
  /i\s*want\s*to\s*die/i,
  /i\s*feel\s*suicidal/i,
  /i\s*(have|am having)\s*(suicidal thoughts|thoughts of suicide)/i,
  /i\s*am\s*thinking\s*about\s*(suicide|killing myself|self[-\s]?harm)/i,
  /\bkill myself\b/i,
  /\bend my life\b/i,
  /\bsuicidal thoughts\b/i,
  /хочу\s*умереть/i,
  /хочу\s*убить\s*себя/i,
  /хочу\s*себе\s*навредить/i,
  /хочу\s*навредить\s*себе/i,
  /хочу\s*причинить\s*себе\s*боль/i,
  /хочу\s*покончить\s*с\s*собой/i,
  /я\s*хочу\s*(умереть|убить\s*себя|себе\s*навредить|причинить\s*себе\s*боль)/i,
  /у\s*меня\s*суицидальные\s*мысли/i,
  /у\s*меня\s*мысли\s*о\s*(суициде|самоубийстве|самоповреждении)/i,
  /я\s*думаю\s*о\s*(суициде|самоубийстве|самоповреждении)/i,
  /покончу\s*с\s*собой/i,
  /не\s*хочу\s*жить/i,
];

const CRISIS_WATCH_PATTERNS: RegExp[] = [
  /suicid/i,
  /self[-\s]?harm/i,
  /суицид/i,
  /самоповрежд/i,
  /селф[-\s]?харм/i,
];

const PERSONAL_CONTEXT_PATTERNS: RegExp[] = [
  /\b(i|i'm|im|me|my|mine)\b/i,
  /(^|\s)(я|мне|меня|мой|моя|моё|мои|у\s*меня|со\s*мной|для\s*меня)(\s|$)/i,
];

const COUNTRY_EMERGENCY_NUMBERS: Record<string, string[]> = {
  US: ['911'],
  CA: ['911'],
  GB: ['999', '112'],
  IE: ['112', '999'],
  AU: ['000'],
  NZ: ['111'],
  RU: ['112'],
  UA: ['112'],
  KZ: ['112'],
  BY: ['112'],
  DE: ['112'],
  FR: ['112'],
  ES: ['112'],
  IT: ['112'],
  NL: ['112'],
  SE: ['112'],
  NO: ['112'],
  FI: ['112'],
  PL: ['112'],
  CH: ['112'],
  AT: ['112'],
  BE: ['112'],
  PT: ['112'],
  CZ: ['112'],
  SK: ['112'],
  HU: ['112'],
  RO: ['112'],
  BG: ['112'],
  GR: ['112'],
  TR: ['112'],
  IL: ['100', '101', '102'],
  IN: ['112'],
  BR: ['190', '192', '193'],
  MX: ['911'],
  JP: ['110', '119'],
  KR: ['112', '119'],
  CN: ['110', '120', '119'],
};

const DEFAULT_EMERGENCY_HINT = 'местный экстренный номер (например, 112/911)';

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getRecentUserTexts(messages: ChatLikeMessage[], limit = 4): string[] {
  const userTexts = (messages || [])
    .filter((message) => message?.role === 'user')
    .map((message) => String(message?.content || '').trim())
    .filter(Boolean);

  if (userTexts.length <= limit) {
    return userTexts;
  }

  return userTexts.slice(-limit);
}

function hasAnyPatternMatch(text: string, patterns: RegExp[]): boolean {
  if (!text) return false;
  return patterns.some((pattern) => pattern.test(text));
}

export function resolveCrisisLevel(messages: ChatLikeMessage[]): CrisisLevel {
  const recentUserTexts = getRecentUserTexts(messages, 4);
  if (!recentUserTexts.length) return 'none';

  const normalizedChunk = normalizeText(recentUserTexts.join('\n'));

  if (hasAnyPatternMatch(normalizedChunk, CRISIS_HIGH_PATTERNS)) {
    return 'crisis_high';
  }

  const hasWatchSignals = hasAnyPatternMatch(
    normalizedChunk,
    CRISIS_WATCH_PATTERNS
  );
  const hasPersonalContext = hasAnyPatternMatch(
    normalizedChunk,
    PERSONAL_CONTEXT_PATTERNS
  );

  if (hasWatchSignals && hasPersonalContext) {
    return 'crisis_watch';
  }

  return 'none';
}

export function resolveCountryCodeFromLocale(
  userLocale?: string | null
): string | null {
  const rawLocale = String(userLocale || '').trim();
  if (!rawLocale) return null;

  const normalized = rawLocale.replace(/_/g, '-');

  try {
    const locale = new Intl.Locale(normalized);
    const region = locale.region?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) {
      return region;
    }
  } catch {
    // Игнорируем ошибки парсинга и пробуем regex-fallback.
  }

  const parts = normalized
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);

  // Если в локали нет региона (например, "fr"), страну не считаем известной.
  if (parts.length < 2) {
    return null;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const current = parts[index];
    if (/^[A-Za-z]{2}$/.test(current)) {
      return current.toUpperCase();
    }
  }

  return null;
}

function resolveEmergencyNumbers(countryCode: string | null): string[] | null {
  if (!countryCode) return null;
  return COUNTRY_EMERGENCY_NUMBERS[countryCode] || null;
}

function formatEmergencyNumbers(numbers: string[] | null): string | null {
  if (!numbers || !numbers.length) return null;

  // Удаляем дубли и сохраняем порядок для стабильного форматирования.
  const unique = Array.from(
    new Set(numbers.map((item) => String(item).trim()))
  );
  const filtered = unique.filter(Boolean);

  if (!filtered.length) return null;
  return filtered.join('/');
}

function buildHighRiskGuidance(params: {
  countryCode: string | null;
  emergencyNumbersDisplay: string | null;
}): string {
  const numbersInstruction =
    params.countryCode && params.emergencyNumbersDisplay
      ? `Если пользователь в ${params.countryCode}, укажи только короткие номера экстренных служб: ${params.emergencyNumbersDisplay}.`
      : `Страна неизвестна, дай общий ориентир на местные экстренные службы.`;

  const fallbackEmergency =
    params.emergencyNumbersDisplay || DEFAULT_EMERGENCY_HINT;

  return `РЕЖИМ БЕЗОПАСНОСТИ: CRISIS_HIGH
Короткий ответ, максимум один вопрос.
1) Эмпатия + серьёзность.
2) Обязательно предложи немедленно обратиться в экстренные службы: ${fallbackEmergency}.
3) Только короткие номера из списка. Не добавляй другие номера, hotline, «телефон доверия», 8-800 и любые длинные номера.
4) Обязательно задай вопрос о стране пребывания (например: «В какой стране ты сейчас находишься?»). Этот вопрос обязателен даже если страна кажется известной.
5) ${numbersInstruction}
6) Не спрашивай адрес/город/геолокацию.
7) Без медсоветов и инструкций по самоповреждению.
8) Отвечай на языке пользователя.`;
}

function buildWatchGuidance(params: {
  countryCode: string | null;
  emergencyNumbersDisplay: string | null;
}): string {
  const countryHint =
    params.countryCode && params.emergencyNumbersDisplay
      ? `Если есть риск «прямо сейчас», используй только короткие номера для ${params.countryCode}: ${params.emergencyNumbersDisplay}.`
      : `Если есть риск «прямо сейчас», спроси только страну (без адреса) и направь в местные экстренные службы.`;

  return `РЕЖИМ БЕЗОПАСНОСТИ: CRISIS_WATCH
Коротко и бережно.
1) Без обесценивания.
2) При риске «прямо сейчас» направь в экстренные службы.
3) ${countryHint}
4) Только короткие номера из списка, без hotline/8-800/длинных номеров.
5) Без медсоветов и инструкций по самоповреждению.
6) Отвечай на языке пользователя.`;
}

export function buildCrisisGuidance(params: {
  messages: ChatLikeMessage[];
  userLocale?: string | null;
}): CrisisGuidanceResult {
  const level = resolveCrisisLevel(params.messages);
  const countryCode = resolveCountryCodeFromLocale(params.userLocale);
  const emergencyNumbers = resolveEmergencyNumbers(countryCode);
  const emergencyNumbersDisplay = formatEmergencyNumbers(emergencyNumbers);

  if (level === 'none') {
    return {
      level,
      guidance: null,
      countryCode,
      emergencyNumbers,
      emergencyNumbersDisplay,
    };
  }

  if (level === 'crisis_high') {
    return {
      level,
      guidance: buildHighRiskGuidance({ countryCode, emergencyNumbersDisplay }),
      countryCode,
      emergencyNumbers,
      emergencyNumbersDisplay,
    };
  }

  return {
    level,
    guidance: buildWatchGuidance({ countryCode, emergencyNumbersDisplay }),
    countryCode,
    emergencyNumbers,
    emergencyNumbersDisplay,
  };
}

export function mergeDeveloperPrompts(
  basePrompt?: string | null,
  safetyPrompt?: string | null
): string | undefined {
  const chunks = [
    String(basePrompt || '').trim(),
    String(safetyPrompt || '').trim(),
  ].filter(Boolean);

  if (!chunks.length) {
    return undefined;
  }

  return chunks.join('\n\n');
}
