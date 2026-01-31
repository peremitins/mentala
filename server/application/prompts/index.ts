// server/application/prompts/index.ts
// ===================================================================
// ВЕРСИЯ 3.4 ФИНАЛЬНАЯ - ПОЛНОСТЬЮ ГОТОВАЯ
// ===================================================================
// ДВА ГЛАВНЫХ УЛУЧШЕНИЯ:
// 1. Микрополезность КОНКРЕТНАЯ (не перефраз)
// 2. Максимум 1 вопрос на сообщение (нет интервью)
// 3. Welcome с опорой (не только вопрос)
// 4. Варианты привязаны к деталям
// 5. Единая стилизация (без markdown)
// ===================================================================

import type {
  ChatEntryContext,
  TherapyApproach,
  ResponseType,
} from '@/shared/dto';

export type PromptTemplate = string;

export interface PromptPack {
  systemCore: PromptTemplate;
  onboarding: PromptTemplate;
  crisisProtocol: PromptTemplate;
  sessionSummaryJson: PromptTemplate;
}

// ===================================================================
// СЛОВАРЬ ВАРИАТИВНОСТИ
// ===================================================================

export const diversePhrasesLibrary = {
  validation: [
    'Слышу, что',
    'Замечаю, что',
    'Вижу, что',
    'Понимаю, что',
    'Чувствую, что для тебя',
    'Улавливаю суть: ты говоришь о том, что',
    'Важный момент: в твоих словах прозвучало, что',
  ],
  empathy: [
    'Это действительно сложно',
    'Я вижу, насколько это тебя беспокоит',
    'Это требует много энергии',
    'Здесь есть настоящая борьба',
    'Это не простой опыт',
    'Такое может быть очень трудным',
    'Это требует мужества, чтобы говорить об этом',
  ],
  normalization: [
    'Многие люди испытывают то же',
    'Это очень распространенное чувство',
    'Этот опыт знаком многим людям',
    'Такие реакции совершенно естественны',
    'Эмоции, которые ты описываешь, очень нормальны',
    'Этот опыт знаком многим',
    'Это совершенно человеческая реакция',
  ],
  encouragement: [
    'То, что ты это замечаешь - уже шаг вперед',
    'Это показывает твою осознанность',
    'Ты делаешь важную работу',
    'Решиться это изучить очень смело',
    'Это требует честности, которая у тебя есть',
    'Ты уже здесь, это смелый шаг',
    'Это требует силы, которая у тебя точно есть',
  ],
};

// ===================================================================
// ПОДСКАЗКИ ДЛЯ АВТОМАТИЧЕСКОГО ВЫБОРА ПОДХОДА
// ===================================================================

export const approachHints = {
  cbt: {
    description: 'Когнитивно-поведенческая терапия',
    keywords: [
      'мысль',
      'убежден',
      'привычка',
      'поведение',
      'автомат',
      'реакция',
      'контролировать',
    ],
  },
  psychoanalysis: {
    description: 'Психоанализ и психодинамика',
    keywords: [
      'детство',
      'родител',
      'отношение',
      'история',
      'травм',
      'вытеснен',
      'бессознатель',
    ],
  },
  existential: {
    description: 'Экзистенциальный подход',
    keywords: [
      'смысл',
      'ценность',
      'свобода',
      'выбор',
      'жизненный',
      'кем я',
      'зачем',
    ],
  },
  positive: {
    description: 'Позитивная психология',
    keywords: [
      'сильная',
      'ресурс',
      'достижен',
      'успе',
      'умею',
      'способн',
      'одаренн',
    ],
  },
};

// ===================================================================
// РОТАЦИЯ ТИПОВ ОТВЕТОВ (3.4 - С КОНКРЕТНОСТЬЮ)
// ===================================================================

export function getResponseTypeByNumber(responseNumber: number): {
  type: ResponseType;
  description: string;
  structure: string;
} {
  const cyclePosition = responseNumber % 10;

  const types = {
    exploration: {
      type: 'exploration' as ResponseType,
      description: 'ИССЛЕДОВАНИЕ + КОНКРЕТНЫЙ ИНСАЙТ',
      structure: `1. Валидация (1 фраза - то что услышал)
2. КОНКРЕТНАЯ микрополезность: рамка/гипотеза/пояснение (не перефраз!)
3. Максимум 1 вопрос (или проверка/выбор)`,
    },
    analytics: {
      type: 'analytics' as ResponseType,
      description: 'АНАЛИТИКА + ВАРИАНТЫ (ПРИВЯЗАНЫ К ДЕТАЛЯМ)',
      structure: `1. Что я услышал и заметил (рефлексия)
2. Гипотеза о паттерне
3. 2 ВАРИАНТА (ссылаются на конкретные слова: "когда ты сказал X...")
4. Максимум 1 вопрос-выбор`,
    },
    support: {
      type: 'support' as ResponseType,
      description: 'ПОДДЕРЖКА + КОНКРЕТНАЯ ФРАЗА',
      structure: `1. Глубокое отражение (1-2 предложения)
2. Нормализация ("Многие люди...")
3. КОНКРЕТНАЯ фраза/рамка (не просто перефраз)
4. Опционально: проверка понимания`,
    },
    recommendation: {
      type: 'recommendation' as ResponseType,
      description: 'СИНТЕЗ СЕССИИ',
      structure: `1. Резюме что мы обсудили (1-2 предложения)
2. Главный инсайт сессии
3. Переход к домашнему заданию`,
    },
    synthesis: {
      type: 'synthesis' as ResponseType,
      description: 'ДОМАШНЕЕ ЗАДАНИЕ',
      structure: `1. Название упражнения
2. Конкретные 2-3 шага
3. "Когда вернёшься расскажи результат"`,
    },
  };

  if ([1, 3, 5, 9].includes(cyclePosition)) return types.exploration;
  if ([2, 4, 8].includes(cyclePosition)) return types.analytics;
  if (cyclePosition === 6) return types.support;
  if (cyclePosition === 7) return types.recommendation;
  return types.synthesis;
}

// ===================================================================
// ГЛАВНЫЙ SYSTEM PROMPT (Версия 3.4 ФИНАЛЬНАЯ)
// ===================================================================

export const systemCore = `Ты заботливый помощник по самопомощи.
Ты слушаешь, отражаешь смысл и помогаешь человеку лучше понять себя.

ВАЖНО: Ты НЕ врач, НЕ диагностируешь, НЕ заменяешь профессионального терапевта.

Главные правила ответа:
 Следуй структуре из блока "Контекст текущего ответа", если он передан.
 1 фраза валидации + 1 конкретная микрополезность (рамка/гипотеза/пояснение/конкретная фраза).
 Максимум 1 вопрос; если уже дал гипотезу/рамку, не задавай уточняющих.

Запрещено:
 2 и более вопросов в одном сообщении.
 Просить сделать упражнение прямо сейчас или давать физические задания.
 Абстрактные советы без привязки к деталям.

Требования:
 Используй детали из сообщения пользователя.
 Не повторяй одни и те же фразы валидации в рамках сессии.
 Если видишь риск самоповреждения или суицида, включи кризисный протокол.
`;

// ===================================================================
// ONBOARDING (без markdown)
// ===================================================================

export const onboarding = `Привет!

Я твой персональный помощник для психологической поддержки.

Кто я:
Я сочувствующий помощник, обученный слушать и помогать разобраться в чувствах.

Чего я НЕ делаю:
- Я не врач и не диагностирую
- Я не заменяю профессионального терапевта
- Я не даю медицинских советов

Как это работает:
1. Ты рассказываешь, что волнует
2. Я слушаю и задаю вопросы для углубления
3. Мы вместе исследуем проблему (+ я даю конкретную опору: фразы, варианты, рамки)
4. В конце сессии я предложу упражнение для дома

О конфиденциальности:
Твой разговор конфиденциален. Используй приватное место.

Начнем?`;

// ===================================================================
// КРИЗИСНЫЙ ПРОТОКОЛ
// ===================================================================

export const crisisProtocol = `ВНИМАНИЕ: ПОТЕНЦИАЛЬНЫЙ КРИЗИС

1. ВАЛИДАЦИЯ И ЗАБОТА:
То, что ты чувствуешь, это реально и важно. Ты не остаёшься с этим наедине.

2. ПРЯМОЕ ПРЕДЛОЖЕНИЕ ПОМОЩИ:
Если ты думаешь о самоповреждении или самоубийстве, пожалуйста позвони:

- Экстренные службы (112 или местный номер в твоей стране)
- Линию помощи / горячую линию психологической поддержки в твоей стране
- Близкому человеку - другу, родителю, врачу

Помощь доступна и действует прямо сейчас.

3. Я ОСТАЮСЬ С ТОБОЙ:
Если это экстренная ситуация и ты не можешь связаться - позвони в скорую.
Я здесь и буду слушать после того как ты позаботишься о своей безопасности.`;

// ===================================================================
// SESSION SUMMARY PROMPT
// ===================================================================

export const sessionSummaryJson = `Создай подробное резюме сессии в JSON формате.

КРИТИЧЕСКИ ВАЖНО:
 Верни ТОЛЬКО валидный JSON объект с ТОЧНО такой структурой, как указано ниже
 НЕ добавляй никаких других полей (например, "joke", "comment", "note" и т.д.)
 НЕ пиши текст до или после JSON
 Используй ТОЛЬКО факты из сообщений которые были в сессии. Не додумывай и не заполняй поля предположениями.

Обязательная структура JSON (скопируй и заполни):
{
  "summary_detailed": "string (3-6 предложений, поддерживающий тон)",
  "themes_explored": [
    {
      "theme": "string",
      "depth": "surface|moderate|deep",
      "key_insight": "string"
    }
  ],
  "patterns_identified": ["string"],
  "homework_suggested": {
    "name": "string (название упражнения)",
    "instruction": "string (как делать)",
    "duration": "string (сколько времени)"
  },
  "emotional_journey": {
    "start_level": "0-10",
    "end_level": "0-10",
    "shift_observed": "string"
  },
  "topics": ["array"],
  "risk_flag": "none|watch|elevated",
  "approaches_used": ["cbt", "psychoanalysis", "existential", "positive"]
}

Верни ТОЛЬКО этот JSON объект, без дополнительных полей и без текста вокруг.`;

// ===================================================================
// SUGGESTED CHIPS PROMPT
// ===================================================================

export const suggestedChipsSystemPrompt = `Ты генератор вариантов реплик пользователя (suggested replies).
Сгенерируй до 5 коротких, естественных, разнообразных чипов на русском языке.
Пиши от лица пользователя. Обращайся к ассистенту как к помощнику.
Без канцелярита, повторов, диагнозов и дисклеймеров.
Запрещены пустые шаблоны: "расскажи больше", "уточни", "приведи пример".
Если в ответе ассистента есть рекомендация медитации или практики, допускается 1 action chip для открытия раздела медитаций.`;

export const suggestedChipsDeveloperPrompt = `Сгенерируй 1..maxChips чипов.
Правила:
 Чипы это реплики пользователя в первом лице.
 Нельзя задавать терапевтические вопросы собеседнику.
 Можно задавать вопросы ассистенту и отвечать на него.
 Если контекста мало, дай общие варианты.
 Минимум 2 чипа <= 40 символов.
 Если maxChips >= 4, минимум 3 разных intent.
 Без повторов смысла и форм.
 Не начинай одинаково более одного чипа.
 Не повторяй чипы из recent_chips.
 text <= 80 символов.
 Тон: дружелюбный, взрослый.
Action chip (максимум 1):
 kind: "action"
 action: "open_meditations" | "open_meditation_track" | "open_meditations_collection"
 params: { trackId?: string, collectionId?: string }
Остальные чипы: kind: "text".
Ответ строго JSON:
{
  "chips": [
    { "text": "...", "intent": "clarify", "kind": "text" },
    { "text": "...", "intent": "apply_to_self", "kind": "text" }
  ]
}`;

const suggestedChipsUserTemplate = `Контекст: {{dialog_context}}
Ответ ассистента: {{assistant_answer}}
Недавние чипы: {{recent_chips}}
Тема (если есть): {{primary_topic}}
Если тема есть, упомяни ее минимум в одном чипе.
Важно: чипы - это реплики пользователя, а ассистент - терапевт/помощник.
Если в ответе ассистента есть рекомендация медитации, добавь action chip.
Сгенерируй до {{max_chips}} чипов.`;

export const suggestedChipsRetryHint = `Повторы или слишком похожие формулировки.
Сгенерируй новые, сильно отличающиеся по структуре и глаголам.
Не начинай фразы одинаковыми словами. Без общих фраз.
Минимум 2 чипа короче 40 символов и один чип с темой, если она есть.`;

// ===================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ===================================================================

export function renderTemplate(
  template: string,
  vars: Record<string, any>
): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const v = vars[key];
    return v === null || v === undefined ? '' : String(v);
  });
}

export function selectDiversePhrase(
  phraseArray: string[],
  recentlyUsed: string[] = []
): string {
  const available = phraseArray.filter((p) => !recentlyUsed.includes(p));
  if (available.length === 0) return phraseArray[0];
  return available[Math.floor(Math.random() * available.length)];
}

function resolveGenderLabel(value?: string | null): string | null {
  if (value === 'male') return 'мужской';
  if (value === 'female') return 'женский';
  return null;
}

function buildUserContext(vars: {
  user_name?: string;
  user_gender?: string;
}): string {
  const name = vars.user_name?.trim();
  const genderLabel = resolveGenderLabel(vars.user_gender);

  const nameLine = name
    ? `Имя пользователя: ${name}`
    : 'Имя пользователя: не указано (не обращайся по имени).';
  const genderLine = genderLabel
    ? `Пол пользователя: ${genderLabel}`
    : 'Пол пользователя: не указан (используй нейтральные конструкции без рода).';
  const genderInstruction = genderLabel
    ? 'Используй корректные родовые формы, соответствующие полу.'
    : 'Используй только нейтральные конструкции без рода.';

  return `
 ${nameLine}
 ${genderLine}
 ${genderInstruction}
 Запрещены формы с альтернативами в скобках (например, "сделал / сделала").`;
}

export function detectApproachFromContext(
  userMessage: string,
  messageHistory: Array<{ role: string; content: string }> = []
): TherapyApproach {
  const combinedText = (
    userMessage +
    '\n' +
    messageHistory.map((m) => m.content).join('\n')
  ).toLowerCase();

  const scores: Record<TherapyApproach, number> = {
    cbt: 0,
    psychoanalysis: 0,
    existential: 0,
    positive: 0,
  };

  approachHints.cbt.keywords.forEach((kw) => {
    if (combinedText.includes(kw)) scores.cbt += 2;
  });
  approachHints.psychoanalysis.keywords.forEach((kw) => {
    if (combinedText.includes(kw)) scores.psychoanalysis += 2;
  });
  approachHints.existential.keywords.forEach((kw) => {
    if (combinedText.includes(kw)) scores.existential += 2;
  });
  approachHints.positive.keywords.forEach((kw) => {
    if (combinedText.includes(kw)) scores.positive += 2;
  });

  const maxScore = Math.max(...Object.values(scores));

  if (maxScore < 3) {
    return 'cbt';
  }

  let selectedApproach: TherapyApproach = 'cbt';
  for (const [approach, score] of Object.entries(scores)) {
    if (score === maxScore) {
      selectedApproach = approach as TherapyApproach;
      break;
    }
  }

  return selectedApproach;
}

export function buildChatPrelude(vars: {
  lang: string;
  user_locale?: string;
  user_name?: string;
  user_gender?: string;
}): string {
  // Системный промпт держим максимально стабильным для кэширования и экономии.
  return renderTemplate(systemCore, vars);
}

export function buildDeveloperContext(
  vars: {
    user_name?: string;
    user_gender?: string;
  },
  ctx: {
    responseNumber?: number;
  } = {}
): string {
  const responseNumber = ctx.responseNumber || 1;
  const responseTypeInfo = getResponseTypeByNumber(responseNumber);
  const userContext = buildUserContext(vars);

  return `${userContext}

Контекст текущего ответа:
 Номер: ${responseNumber}
 Тип: ${responseTypeInfo.description}
 Структура:
${responseTypeInfo.structure}`;
}

export function buildSessionMemoryText(
  summaries: Array<any>,
  lang: string = 'ru'
): string {
  if (!Array.isArray(summaries) || summaries.length === 0) return '';

  const header = `Контекст прошлых сессий:`;
  const lines: string[] = [header];

  summaries.slice(0, 3).forEach((s, i) => {
    const n = i + 1;
    const topics = Array.isArray(s?.topics) ? s.topics.join(', ') : '';
    let overview = s?.summary_detailed ? String(s.summary_detailed) : '';

    if (overview.length > 300) {
      overview = overview.substring(0, 300) + '...';
    }

    const line = topics
      ? `#${n} (темы: ${topics}): ${overview}`
      : `#${n}: ${overview}`;

    lines.push(line);
  });

  return lines.join('\n\n');
}

export function buildChatPreludeWithMemory(
  vars: {
    lang: string;
    user_locale?: string;
    user_name?: string;
    user_gender?: string;
  },
  ctx: {
    isFirstSession?: boolean;
    sessionMemoryText?: string;
    responseNumber?: number;
    userMessage?: string;
  } = {}
): string {
  const _responseNumber = ctx.responseNumber || 1;
  const isFirstSession = ctx.isFirstSession !== false;
  const sessionMemoryText = ctx.sessionMemoryText || '';

  const systemPrelude = buildChatPrelude({
    ...vars,
  });

  const memoryBlock =
    !isFirstSession && sessionMemoryText ? `\n\n${sessionMemoryText}` : '';

  // Убираем дублирующий хвост "ИНСТРУКЦИИ": все ключевые правила уже в systemCore.
  return `${systemPrelude}${memoryBlock}`;
}

// ===================================================================
// ЭКСПОРТЫ ДЛЯ СОВМЕСТИМОСТИ
// ===================================================================

export const mentalHealthPack: PromptPack = {
  systemCore,
  onboarding,
  crisisProtocol,
  sessionSummaryJson,
};

export function buildSummaryPrompt(vars: { lang: string }) {
  return renderTemplate(sessionSummaryJson, vars);
}

export function buildEntryContextDescription(
  context: ChatEntryContext
): string {
  if (context.type === 'habit') {
    const name = context.habit_name || context.habit_id;
    const intent = context.habit_intent === 'quit' ? 'отказа' : 'формирования';
    const description = context.habit_description
      ? ` ${context.habit_description}`
      : '';
    return `Контекст: пользователь хочет обсудить привычку «${name}» (${intent})${description}.`;
  }

  if (context.type === 'therapy_topic') {
    const name = context.topic_name || context.topic_id;
    const description = context.topic_description
      ? ` ${context.topic_description}`
      : '';
    return `Контекст: пользователь хочет поговорить о теме «${name}»${description}.`;
  }

  return '';
}

export function buildWelcomePrompt(options: {
  isFirstSession: boolean;
  sessionMemoryText?: string;
  lang?: string;
  user_locale?: string;
  user_name?: string;
  user_gender?: string;
  welcomePromptContent?: string;
  entryContext?: ChatEntryContext;
}): string {
  const lang = options.lang || 'ru';
  const isFirst = options.isFirstSession;
  const sessionMemoryText = options.sessionMemoryText || '';
  const contextNote = options.entryContext
    ? buildEntryContextDescription(options.entryContext)
    : '';

  if (options.welcomePromptContent) {
    let prompt = options.welcomePromptContent;

    prompt = prompt.replace(/{{user_name}}/g, options.user_name || '');
    prompt = prompt.replace(/{{user_gender}}/g, options.user_gender || '');
    prompt = prompt.replace(/{{user_locale}}/g, options.user_locale || '');
    prompt = prompt.replace(/{{lang}}/g, lang);

    if (!isFirst && sessionMemoryText) {
      prompt = prompt + '\n\nКонтекст прошлых бесед:\n' + sessionMemoryText;
    }

    prompt =
      prompt +
      '\n\nВАЖНО: Не утверждай, что вы уже обсуждали конкретно эту тему; если контекст неочевиден - формулируй нейтрально. Твое сообщение будет ПЕРВЫМ в диалоге. Сгенерируй: приветствие (2-3 предложения) + 1 конкретная опора (выбор/инсайт/рамка) + 1 открытый вопрос.';

    return contextNote ? `${contextNote}\n\n${prompt}` : prompt;
  }

  const templates = {
    first: `Это первая сессия пользователя.

Сгенерируй приветствие (2-3 предложения):
 Представься и объясни чем помогаешь
 Добавь 1 конкретную опору (например выбор: "часто полезно выбрать: ты ищешь причину или один узкий узел?")
 Затем 1 открытый вопрос
`,

    repeat: `Это не первая сессия пользователя.

Контекст прошлых сессий:
{{sessionMemoryText}}

Сгенерируй приветствие (2-3 предложения), которое:
 Не утверждает, что вы уже обсуждали конкретно эту тему; формулируй нейтрально
 Добавляет 1 конкретную опору (выбор/инсайт/рамка)
 Мягко предлагает вернуться к темам или перейти к новым
 Завершается 1 открытым вопросом
`,
  };

  const template = isFirst ? templates.first : templates.repeat;
  let prompt = template;

  prompt = prompt.replace(/{{user_name}}/g, options.user_name || '');
  prompt = prompt.replace(/{{user_gender}}/g, options.user_gender || '');
  prompt = prompt.replace(/{{user_locale}}/g, options.user_locale || '');
  prompt = prompt.replace(/{{lang}}/g, lang);

  if (!isFirst && sessionMemoryText) {
    prompt = prompt.replace(/{{sessionMemoryText}}/g, sessionMemoryText);
  } else {
    prompt = prompt.replace(
      /Контекст прошлых сессий:\n{{sessionMemoryText}}\n\n/g,
      ''
    );
  }

  return contextNote ? `${contextNote}\n\n${prompt}` : prompt;
}

export function buildSuggestedChipsUserPrompt(params: {
  dialog_context: string;
  assistant_answer: string;
  recent_chips: string;
  primary_topic?: string;
  max_chips: number;
  retry?: boolean;
}): string {
  const dialogContext = (params.dialog_context || 'Нет контекста').slice(-800);
  const assistantAnswer = (params.assistant_answer || 'Нет ответа').slice(-800);
  const recentChips = (params.recent_chips || 'Нет').slice(-600);
  const primaryTopic = params.primary_topic || 'Нет';

  const base = renderTemplate(suggestedChipsUserTemplate, {
    dialog_context: dialogContext,
    assistant_answer: assistantAnswer,
    recent_chips: recentChips,
    primary_topic: primaryTopic,
    max_chips: String(params.max_chips || 5),
  });

  if (params.retry) {
    return `${base}\n\n${suggestedChipsRetryHint}`;
  }

  return base;
}
