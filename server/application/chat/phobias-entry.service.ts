import type { ChatEntryContext, SuggestedChip } from '@/shared/dto';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export const PHOBIAS_TOPIC_ID = 'phobias';
export const PHOBIAS_FOCUS_TTL_DAYS = 30;
const PHOBIAS_FOCUS_TTL_MS = PHOBIAS_FOCUS_TTL_DAYS * 24 * 60 * 60 * 1000;
const MAX_CUSTOM_LABEL_LENGTH = 80;

export const PHOBIAS_PUBLIC_SPEAKING_LABEL = 'Страх публичных выступлений';
export const PHOBIAS_HEIGHTS_LABEL = 'Страх высоты';
export const PHOBIAS_CONFINED_SPACES_LABEL = 'Страх замкнутых пространств';
export const PHOBIAS_SOCIAL_FEAR_LABEL = 'Социальный страх';
export const PHOBIAS_OTHER_TOPIC_LABEL = 'Другая тема';
export const PHOBIAS_RESUME_LABEL = 'Продолжить прошлую тему';

export type PhobiasSubtopicKey =
  | 'public_speaking'
  | 'heights'
  | 'confined_spaces'
  | 'social_fear'
  | 'other_specific';

export interface LastTherapyFocus {
  topicId: typeof PHOBIAS_TOPIC_ID;
  subtopicKey: PhobiasSubtopicKey;
  subtopicLabel: string;
  confirmedByUser: true;
  updatedAt: string;
}

type PhobiasCatalogFocus = {
  key: Exclude<PhobiasSubtopicKey, 'other_specific'>;
  label: string;
  patterns: RegExp[];
};

type PhobiasUserChoice =
  | {
      kind: 'continue_previous';
      focus: LastTherapyFocus;
    }
  | {
      kind: 'choose_other';
    }
  | {
      kind: 'select_focus';
      focus: LastTherapyFocus;
      source: 'chip' | 'text';
    };

export type PhobiasConversationMode =
  | 'welcome_selector'
  | 'welcome_resume_selector'
  | 'return_to_selector'
  | 'selected_focus'
  | 'resume_focus'
  | 'ongoing_focus';

export interface PhobiasConversationState {
  mode: PhobiasConversationMode;
  validLastTherapyFocus: LastTherapyFocus | null;
  lastTherapyFocus: LastTherapyFocus | null;
  userChoice: PhobiasUserChoice | null;
  selectedFocus: LastTherapyFocus | null;
}

export interface PhobiasFocusUpdate {
  nextFocus: LastTherapyFocus;
  action: 'selected' | 'resumed';
  changed: boolean;
}

const PHOBIAS_CATALOG_FOCUSES: readonly PhobiasCatalogFocus[] = [
  {
    key: 'public_speaking',
    label: PHOBIAS_PUBLIC_SPEAKING_LABEL,
    patterns: [
      /\bпублич(?:н|ных|ные|ного)?\b/i,
      /\bвыступ(?:ать|ление|ления|лений|лю)\b/i,
      /\bпрезент(?:аци|овать)\b/i,
      /\bговорить перед\b/i,
      /\bсцена\b/i,
      /\bаудитори/i,
    ],
  },
  {
    key: 'heights',
    label: PHOBIAS_HEIGHTS_LABEL,
    patterns: [
      /\bвысот/i,
      /\bвысок(?:о|ий|ие|их)\b/i,
      /\bэтаж/i,
      /\bобрыв/i,
      /\bбалкон/i,
    ],
  },
  {
    key: 'confined_spaces',
    label: PHOBIAS_CONFINED_SPACES_LABEL,
    patterns: [
      /\bзамкнут/i,
      /\bклаустрофоб/i,
      /\bлиф(?:т|те|том|тов)\b/i,
      /\bметро\b/i,
      /\bтоннел/i,
      /\bтуннел/i,
    ],
  },
  {
    key: 'social_fear',
    label: PHOBIAS_SOCIAL_FEAR_LABEL,
    patterns: [
      /\bсоциальн/i,
      /\bстрах оценки\b/i,
      /\bоценк(?:и|а|ой)\b/i,
      /\bобщени(?:я|е|ем)\b/i,
      /\bзнакомств/i,
      /\bлюдей\b/i,
      /\bосуждени/i,
    ],
  },
] as const;

const PHOBIAS_CATEGORY_LABELS = PHOBIAS_CATALOG_FOCUSES.map(
  (focus) => focus.label
);

const PHOBIAS_SYSTEM_LINES = [
  'SPECIAL CASE: пользователь открыл тему «Страхи».',
  'Сохраняй общую дневную логику приветствия: короткое приветствие допустимо только в первое приветствие дня; в остальные входы начинай без приветствия.',
  'Даже если приветствие допустимо, не используй шаблон «Чем могу помочь?».',
  'Не называй состояние диагнозом, если пользователь сам этого не сделал.',
  'Не предлагай резкую экспозицию, давление или формулировки уровня «просто сделай».',
  'До выбора конкретного страха не уходи в длинную психообразовательную лекцию.',
  'Сообщение должно быть коротким: 2-4 предложения, максимум 1 вопрос.',
];

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"']/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLabel(value: string): string {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[«"\s]+|[»"\s.?!,;:]+$/g, '');

  if (!normalized) {
    return '';
  }

  if (normalized.length <= MAX_CUSTOM_LABEL_LENGTH) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  const shortened = normalized.slice(0, MAX_CUSTOM_LABEL_LENGTH - 1).trimEnd();
  return `${shortened}…`;
}

function getLastMessageByRole(
  messages: ChatMessage[],
  role: ChatMessage['role']
): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === role && String(message.content || '').trim()) {
      return message;
    }
  }

  return null;
}

function assistantLikelyAskedForPhobiaCategory(
  messages: ChatMessage[]
): boolean {
  const lastAssistantMessage = getLastMessageByRole(messages, 'assistant');
  if (!lastAssistantMessage) {
    return false;
  }

  const normalized = normalizeText(lastAssistantMessage.content);
  const matches = PHOBIAS_CATALOG_FOCUSES.filter((focus) =>
    focus.patterns.some((pattern) => pattern.test(normalized))
  ).length;

  return matches >= 2;
}

function createFocusRecord(params: {
  subtopicKey: PhobiasSubtopicKey;
  subtopicLabel: string;
  now?: Date;
}): LastTherapyFocus {
  return {
    topicId: PHOBIAS_TOPIC_ID,
    subtopicKey: params.subtopicKey,
    subtopicLabel: normalizeLabel(params.subtopicLabel),
    confirmedByUser: true,
    updatedAt: (params.now ?? new Date()).toISOString(),
  };
}

function matchCatalogFocus(
  normalizedMessage: string
): PhobiasCatalogFocus | null {
  for (const focus of PHOBIAS_CATALOG_FOCUSES) {
    if (
      normalizeText(focus.label) === normalizedMessage ||
      focus.patterns.some((pattern) => pattern.test(normalizedMessage))
    ) {
      return focus;
    }
  }

  return null;
}

function isExplicitContinueChoice(normalizedMessage: string): boolean {
  return (
    normalizedMessage === normalizeText(PHOBIAS_RESUME_LABEL) ||
    /\b(да|давай|хочу|можно)?\s*(продолж(?:им|ить)|верн(?:ем|ём)ся|продолжаем)\b/i.test(
      normalizedMessage
    )
  );
}

function isExplicitOtherChoice(normalizedMessage: string): boolean {
  return (
    normalizedMessage === normalizeText(PHOBIAS_OTHER_TOPIC_LABEL) ||
    /\b(друг(?:ая|ой|ую)|иной)\s+(?:тема|страх|фобия)\b/i.test(
      normalizedMessage
    ) ||
    /\bо друг(?:ом|ой)\s+(?:страхе|фобии)\b/i.test(normalizedMessage)
  );
}

function hasFearCue(normalizedMessage: string): boolean {
  return /\b(боюсь|страх|фоби|пугает|страшно|тревожно от)\b/i.test(
    normalizedMessage
  );
}

function looksLikeShortCustomSelection(normalizedMessage: string): boolean {
  const tokens = normalizedMessage
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0 || tokens.length > 4) {
    return false;
  }

  return !tokens.some((token) =>
    [
      'другая',
      'другой',
      'продолжить',
      'продолжим',
      'давай',
      'вернемся',
      'вернемся',
      'тема',
    ].includes(token)
  );
}

function isKnownPhobiasSubtopicKey(value: string): value is PhobiasSubtopicKey {
  return [
    'public_speaking',
    'heights',
    'confined_spaces',
    'social_fear',
    'other_specific',
  ].includes(value);
}

function isSameFocus(
  left: LastTherapyFocus | null,
  right: LastTherapyFocus | null
): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.subtopicKey === right.subtopicKey &&
    normalizeText(left.subtopicLabel) === normalizeText(right.subtopicLabel)
  );
}

export function isPhobiasEntryContext(
  entryContext?: ChatEntryContext | null
): entryContext is Extract<ChatEntryContext, { type: 'therapy_topic' }> {
  return (
    entryContext?.type === 'therapy_topic' &&
    entryContext.topic_id === PHOBIAS_TOPIC_ID
  );
}

export function normalizeLastTherapyFocus(
  rawValue: unknown
): LastTherapyFocus | null {
  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  const value = rawValue as Record<string, unknown>;
  const topicId = String(value.topicId || '');
  const subtopicKey = String(value.subtopicKey || '');
  const subtopicLabel = normalizeLabel(String(value.subtopicLabel || ''));
  const updatedAt = String(value.updatedAt || '');

  if (topicId !== PHOBIAS_TOPIC_ID) {
    return null;
  }

  if (!isKnownPhobiasSubtopicKey(subtopicKey) || !subtopicLabel) {
    return null;
  }

  if (value.confirmedByUser !== true) {
    return null;
  }

  const updatedAtDate = new Date(updatedAt);
  if (Number.isNaN(updatedAtDate.getTime())) {
    return null;
  }

  return {
    topicId: PHOBIAS_TOPIC_ID,
    subtopicKey,
    subtopicLabel,
    confirmedByUser: true,
    updatedAt: updatedAtDate.toISOString(),
  };
}

export function getValidLastTherapyFocus(
  lastTherapyFocus: LastTherapyFocus | null | undefined,
  now = new Date()
): LastTherapyFocus | null {
  const normalizedFocus = normalizeLastTherapyFocus(lastTherapyFocus);
  if (!normalizedFocus) {
    return null;
  }

  const updatedAtMs = new Date(normalizedFocus.updatedAt).getTime();
  if (now.getTime() - updatedAtMs > PHOBIAS_FOCUS_TTL_MS) {
    return null;
  }

  return normalizedFocus;
}

export function resolvePhobiasUserChoice(params: {
  messages: ChatMessage[];
  validLastTherapyFocus?: LastTherapyFocus | null;
  now?: Date;
}): PhobiasUserChoice | null {
  const lastUserMessage = getLastMessageByRole(params.messages, 'user');
  if (!lastUserMessage) {
    return null;
  }

  const normalizedMessage = normalizeText(lastUserMessage.content);
  if (!normalizedMessage) {
    return null;
  }

  const nonSystemMessagesCount = params.messages.filter(
    (message) => message.role !== 'system'
  ).length;
  const canTreatAsShortSelection =
    looksLikeShortCustomSelection(normalizedMessage) &&
    (assistantLikelyAskedForPhobiaCategory(params.messages) ||
      nonSystemMessagesCount <= 2);

  if (
    params.validLastTherapyFocus &&
    isExplicitContinueChoice(normalizedMessage)
  ) {
    return {
      kind: 'continue_previous',
      focus: params.validLastTherapyFocus,
    };
  }

  if (isExplicitOtherChoice(normalizedMessage)) {
    return { kind: 'choose_other' };
  }

  const matchedCatalogFocus = matchCatalogFocus(normalizedMessage);
  if (matchedCatalogFocus) {
    return {
      kind: 'select_focus',
      source:
        normalizedMessage === normalizeText(matchedCatalogFocus.label)
          ? 'chip'
          : 'text',
      focus: createFocusRecord({
        subtopicKey: matchedCatalogFocus.key,
        subtopicLabel: matchedCatalogFocus.label,
        now: params.now,
      }),
    };
  }

  if (hasFearCue(normalizedMessage) || canTreatAsShortSelection) {
    return {
      kind: 'select_focus',
      source: 'text',
      focus: createFocusRecord({
        subtopicKey: 'other_specific',
        subtopicLabel: lastUserMessage.content,
        now: params.now,
      }),
    };
  }

  return null;
}

export function resolvePhobiasConversationState(params: {
  entryContext?: ChatEntryContext | null;
  messages: ChatMessage[];
  lastTherapyFocus?: LastTherapyFocus | null;
  now?: Date;
}): PhobiasConversationState | null {
  if (!isPhobiasEntryContext(params.entryContext)) {
    return null;
  }

  const now = params.now ?? new Date();
  const normalizedLastFocus = normalizeLastTherapyFocus(
    params.lastTherapyFocus
  );
  const validLastTherapyFocus = getValidLastTherapyFocus(
    normalizedLastFocus,
    now
  );
  const isWelcomeStart = !params.messages.some(
    (message) => message.role === 'user'
  );
  const userChoice = resolvePhobiasUserChoice({
    messages: params.messages,
    validLastTherapyFocus,
    now,
  });

  if (isWelcomeStart) {
    return {
      mode: validLastTherapyFocus
        ? 'welcome_resume_selector'
        : 'welcome_selector',
      validLastTherapyFocus,
      lastTherapyFocus: normalizedLastFocus,
      userChoice: null,
      selectedFocus: validLastTherapyFocus,
    };
  }

  if (userChoice?.kind === 'choose_other') {
    return {
      mode: 'return_to_selector',
      validLastTherapyFocus,
      lastTherapyFocus: normalizedLastFocus,
      userChoice,
      selectedFocus: null,
    };
  }

  if (userChoice?.kind === 'continue_previous') {
    return {
      mode: 'resume_focus',
      validLastTherapyFocus,
      lastTherapyFocus: normalizedLastFocus,
      userChoice,
      selectedFocus: userChoice.focus,
    };
  }

  if (userChoice?.kind === 'select_focus') {
    return {
      mode: 'selected_focus',
      validLastTherapyFocus,
      lastTherapyFocus: normalizedLastFocus,
      userChoice,
      selectedFocus: userChoice.focus,
    };
  }

  return {
    mode: 'ongoing_focus',
    validLastTherapyFocus,
    lastTherapyFocus: normalizedLastFocus,
    userChoice: null,
    selectedFocus: validLastTherapyFocus,
  };
}

export function buildPhobiasDeveloperPrompt(
  state: PhobiasConversationState | null
): string | null {
  if (!state) {
    return null;
  }

  const lines = [...PHOBIAS_SYSTEM_LINES];
  const categoriesLine = PHOBIAS_CATEGORY_LABELS.join(', ');

  if (state.mode === 'welcome_selector') {
    lines.push(
      'Сейчас welcome-start без пользовательских сообщений и без валидного прошлого фокуса.',
      'Сформируй короткое стартовое сообщение по теме страхов.',
      'Если системный prompt разрешает приветствие на это сообщение, начни с одной короткой приветственной фразы; иначе начни сразу по теме.',
      '1. Одна поддерживающая вводная фраза.',
      '2. Короткая мысль о том, что полезно начать с конкретной ситуации.',
      `3. Перечисли 3-5 популярных категорий страхов: ${categoriesLine}.`,
      '4. Заверши сообщение одним уточняющим вопросом.'
    );
    return lines.join('\n');
  }

  if (state.mode === 'welcome_resume_selector') {
    lines.push(
      `Сейчас welcome-start без пользовательских сообщений и есть валидный прошлый фокус: «${state.validLastTherapyFocus?.subtopicLabel || ''}».`,
      'Если системный prompt разрешает приветствие на это сообщение, можно начать с одного короткого приветствия; иначе начинай сразу с выбора.',
      'Сначала предложи выбор: продолжить прошлую тему или выбрать другую.',
      'Не предполагай, что прошлый страх по-прежнему актуален.',
      'Можно коротко напомнить label прошлой подтемы.',
      'Заверши сообщение одним вопросом.'
    );
    return lines.join('\n');
  }

  if (state.mode === 'return_to_selector') {
    lines.push(
      'Пользователь выбрал другую тему страха.',
      'Вернись к первичному сценарию выбора:',
      '1. Одна короткая вводная фраза.',
      `2. Короткое перечисление категорий: ${categoriesLine}.`,
      '3. Один уточняющий вопрос в конце.',
      'Не перескакивай сразу к советам.'
    );
    return lines.join('\n');
  }

  if (state.mode === 'resume_focus' && state.selectedFocus) {
    lines.push(
      `Пользователь явно выбрал продолжить прошлую тему: «${state.selectedFocus.subtopicLabel}».`,
      'Не перечисляй каталог заново.',
      'Коротко подхвати разговор по этой теме и помоги перейти к конкретной ситуации: триггер, избегание, мысли или телесная реакция.',
      'Один вопрос максимум.'
    );
    return lines.join('\n');
  }

  if (state.mode === 'selected_focus' && state.selectedFocus) {
    lines.push(
      `Пользователь явно выбрал тему: «${state.selectedFocus.subtopicLabel}».`,
      'Не перечисляй каталог заново.',
      'Помоги быстро сузить разговор до конкретного пугающего сценария, триггера, избегания, мыслей или телесной реакции.',
      'Один вопрос максимум.'
    );
    return lines.join('\n');
  }

  if (state.selectedFocus) {
    lines.push(
      `Текущий подтверждённый фокус беседы: «${state.selectedFocus.subtopicLabel}».`,
      'Продолжай держать разговор в этой теме и опирайся на конкретные ситуации пользователя.'
    );
    return lines.join('\n');
  }

  lines.push(
    'Если конкретный страх пока не ясен, мягко сузь разговор до одного пугающего сценария.',
    'Один вопрос максимум.'
  );
  return lines.join('\n');
}

export function buildStaticPhobiasSuggestedChips(
  state: PhobiasConversationState | null
): SuggestedChip[] | null {
  if (!state) {
    return null;
  }

  if (
    state.mode === 'welcome_selector' ||
    state.mode === 'return_to_selector'
  ) {
    return [
      PHOBIAS_PUBLIC_SPEAKING_LABEL,
      PHOBIAS_HEIGHTS_LABEL,
      PHOBIAS_CONFINED_SPACES_LABEL,
      PHOBIAS_SOCIAL_FEAR_LABEL,
      PHOBIAS_OTHER_TOPIC_LABEL,
    ].map((text) => ({
      text,
      intent: 'clarify' as const,
      kind: 'text' as const,
    }));
  }

  if (state.mode === 'welcome_resume_selector') {
    return [PHOBIAS_RESUME_LABEL, PHOBIAS_OTHER_TOPIC_LABEL].map((text) => ({
      text,
      intent: 'clarify' as const,
      kind: 'text' as const,
    }));
  }

  return null;
}

export function resolveLastTherapyFocusUpdate(params: {
  state: PhobiasConversationState | null;
  now?: Date;
}): PhobiasFocusUpdate | null {
  if (!params.state?.userChoice) {
    return null;
  }

  const now = params.now ?? new Date();

  if (
    params.state.userChoice.kind === 'continue_previous' &&
    params.state.validLastTherapyFocus
  ) {
    const nextFocus = createFocusRecord({
      subtopicKey: params.state.validLastTherapyFocus.subtopicKey,
      subtopicLabel: params.state.validLastTherapyFocus.subtopicLabel,
      now,
    });

    return {
      nextFocus,
      action: 'resumed',
      changed: false,
    };
  }

  if (params.state.userChoice.kind === 'select_focus') {
    const nextFocus = createFocusRecord({
      subtopicKey: params.state.userChoice.focus.subtopicKey,
      subtopicLabel: params.state.userChoice.focus.subtopicLabel,
      now,
    });

    return {
      nextFocus,
      action: 'selected',
      changed: !isSameFocus(params.state.lastTherapyFocus, nextFocus),
    };
  }

  return null;
}
