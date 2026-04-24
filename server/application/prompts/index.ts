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
} from '../../../shared/dto';
import type { AssistantVoiceGender } from '../../../shared/constants/assistantVoiceCatalog';
import type { Addressing } from '../../../shared/dto/notifications';
import {
  normalizeOnboardingReasons,
  type OnboardingReason,
  type OnboardingReasons,
} from '../../../shared/dto/onboarding';
import { buildAssistantPersonaInstruction } from '../chat/assistant-persona';
import {
  pickAddressingText,
  resolveAddressing,
} from '../../../shared/utils/addressing';

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
// РОТАЦИЯ ТИПОВ ОТВЕТОВ (3.5 - БЕЗ ПРИНУДИТЕЛЬНОГО ЗАВЕРШЕНИЯ)
// ===================================================================
//
// Убраны типы recommendation (СИНТЕЗ СЕССИИ) и synthesis (ДОМАШНЕЕ ЗАДАНИЕ):
// они срабатывали механически по счётчику и прерывали живой диалог в середине
// разговора. Синтез сессии теперь происходит только явно — через кнопку
// «Завершить сессию» (endSessionAndSummarize).
//
// Цикл из 6 позиций (% 6):
//   0, 2, 4 → exploration  (базовый режим: исследование + инсайт)
//   1, 5    → analytics    (аналитика + варианты, каждый 3-й ответ)
//   3       → support      (поддержка, каждый 6-й ответ)
//
// Exploration доминирует — это рабочий режим.
// Analytics добавляет структуру и варианты раз в несколько обменов.
// Support появляется реже, на "эмоциональном" месте цикла.

export function getResponseTypeByNumber(responseNumber: number): {
  type: ResponseType;
  description: string;
  structure: string;
} {
  const cyclePosition = responseNumber % 6;

  const types = {
    exploration: {
      type: 'exploration' as ResponseType,
      description: 'ИССЛЕДОВАНИЕ + КОНКРЕТНЫЙ ИНСАЙТ',
      structure: `1. Валидация (1 короткая фраза по сути сообщения)
2. КОНКРЕТНАЯ микрополезность: рамка/гипотеза/пояснение (не перефраз!)
3. Максимум 1 вопрос (или проверка/выбор)`,
    },
    analytics: {
      type: 'analytics' as ResponseType,
      description: 'АНАЛИТИКА + ВАРИАНТЫ (ПРИВЯЗАНЫ К ДЕТАЛЯМ)',
      structure: `1. Короткая рефлексия по сути и эмоции (1 фраза)
2. Гипотеза о паттерне
3. 2 ВАРИАНТА (ссылаются на конкретные слова пользователя)
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
  };

  if (cyclePosition === 1 || cyclePosition === 5) return types.analytics;
  if (cyclePosition === 3) return types.support;
  return types.exploration;
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


Запрещено 2 и более вопросов в одном сообщении.
Запрещено просить сделать упражнение прямо сейчас или давать физические задания.
Запрещены абстрактные советы без привязки к деталям.
Запрещено заканчивать ответ фразой вроде «когда вернёшься, расскажи» — всегда дай возможность продолжить диалог сейчас (вопрос или приглашение ответить).

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

export const suggestedChipsSystemPrompt = `Ты генерируешь короткие реплики пользователя для чипов.
Пиши по-русски, естественно, от первого лица.
Только text-чипы.
Без повторов, канцелярита, диагнозов и пустых фраз вроде "расскажи больше".
Не генерируй вопросы, на которые только сам пользователь знает ответ (например "что меня триггерит?", пользователь не может спросить это у терапевта). Чипы это то, что пользователь мог бы сказать или спросить у терапевта.`;

export const suggestedChipsDeveloperPrompt = `Сгенерируй 1..maxChips чипов.
Правила:
 - только text и intent
 - реплики пользователя в первом лице
 - можно спросить помощника или ответить ему
 - при слабом контексте дай общие, но полезные варианты
 - минимум 2 чипа <= 40 символов
 - если maxChips >= 3, используй минимум 2 intent
 - без повторов смысла и одинаковых начал
 - text <= 60 символов
Ответ строго JSON:
{
  "chips": [
    { "text": "...", "intent": "clarify" },
    { "text": "...", "intent": "apply_to_self" }
  ]
}`;

const suggestedChipsUserTemplate = `Диалог: {{dialog_context}}
Ответ ассистента: {{assistant_answer}}
До {{max_chips}} чипов.`;

export const suggestedChipsRetryHint = `Повторы или слишком похожие формулировки.
Сделай новые: другие начала, глаголы и смысл.
Без общих фраз. Минимум 2 чипа короче 40 символов.`;

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
  if (!phraseArray.length) return '';
  const available = phraseArray.filter((p) => !recentlyUsed.includes(p));
  if (available.length === 0) return phraseArray[0] ?? '';
  return available[Math.floor(Math.random() * available.length)] ?? '';
}

function resolveGenderLabel(value?: string | null): string | null {
  if (value === 'male') return 'мужской';
  if (value === 'female') return 'женский';
  return null;
}

function buildToneContext(vars: {
  toneKey?: string;
  toneLabel?: string;
  toneDescription?: string;
}): string {
  if (!vars.toneKey || !vars.toneLabel || !vars.toneDescription) {
    return '';
  }

  return `Предпочитаемый стиль поддержки пользователя:
 Ключ tone: ${vars.toneKey}
 Название tone: ${vars.toneLabel}
 Описание tone: ${vars.toneDescription}
 Следуй этому стилю во всех формулировках, сохраняя правила безопасности и кризисные ограничения.`;
}

function buildAddressingContext(addressing?: Addressing): string {
  const resolvedAddressing = resolveAddressing(addressing);
  const addressingLabel = resolvedAddressing === 'formal' ? 'на вы' : 'на ты';
  const addressingInstruction = pickAddressingText(resolvedAddressing, {
    informal:
      'Обращайся к пользователю только на «ты»: используй формы «ты/тебе/тебя» и не переходи на «вы/вам/вас».',
    formal:
      'Обращайся к пользователю только на «вы»: используй формы «вы/вам/вас» и не переходи на «ты/тебе/тебя».',
  });

  return `Обращение к пользователю: ${addressingLabel}.
 ${addressingInstruction}`;
}

const ONBOARDING_REASON_META: Record<
  OnboardingReason,
  { label: string; focusHint: string }
> = {
  stress: {
    label: 'справиться со стрессом',
    focusHint:
      'чаще помогай с перегрузкой, напряжением и восстановлением опоры',
  },
  anxiety: {
    label: 'снизить тревожность',
    focusHint:
      'чаще помогай с тревожными сценариями, неопределенностью и заземлением',
  },
  thoughts: {
    label: 'разобраться в мыслях',
    focusHint:
      'чаще помогай распутывать внутренний диалог, противоречия и навязчивые циклы',
  },
  mood: {
    label: 'улучшить настроение',
    focusHint:
      'чаще поддерживай в теме эмоционального фона, истощения и маленьких сдвигов',
  },
  habits: {
    label: 'работать с привычками',
    focusHint:
      'чаще переводи разговор в понятные паттерны, триггеры и маленькие действия',
  },
  support: {
    label: 'получить поддержку',
    focusHint:
      'чаще давай теплую опору, ощущение контакта и ясные следующие шаги',
  },
  other: {
    label: 'другой личный запрос',
    focusHint:
      'сохраняй широкую персонализацию и мягко уточняй, что сейчас важнее всего',
  },
};

// Онбординг задает мягкий вектор персонализации, но не должен спорить с живым запросом пользователя.
function buildOnboardingPersonalizationContext(vars: {
  onboardingReasons?: OnboardingReasons;
}): string {
  const reasonMetaList = normalizeOnboardingReasons(vars.onboardingReasons)
    .slice(0, 3)
    .map((reason) => ONBOARDING_REASON_META[reason]);

  if (!reasonMetaList.length) {
    return '';
  }

  const lines = ['Контекст персонализации из онбординга:'];
  const labels = reasonMetaList.map((reasonMeta) => reasonMeta.label);

  lines.push(` Что привело пользователя: ${labels.join('; ')}.`);

  lines.push(
    ' Используй это как мягкий фоновый вектор персонализации для примеров, формулировок и микро-рекомендаций.'
  );

  if (reasonMetaList.length === 1) {
    lines.push(` Фокус по причине: ${reasonMetaList[0].focusHint}.`);
  } else {
    lines.push(' Приоритетные фокусы:');
    for (const reasonMeta of reasonMetaList) {
      lines.push(` - ${reasonMeta.focusHint}.`);
    }
  }

  lines.push(
    ' Не навязывай эти темы, если текущий запрос пользователя уже ушел в другую сторону.'
  );

  return lines.join('\n');
}

function buildOnboardingSuggestedChipsContext(vars: {
  onboardingReasons?: OnboardingReasons;
}): string {
  const reasonMetaList = normalizeOnboardingReasons(vars.onboardingReasons)
    .slice(0, 3)
    .map((reason) => ONBOARDING_REASON_META[reason]);

  if (!reasonMetaList.length) {
    return '';
  }

  const labels = reasonMetaList.map((reasonMeta) => reasonMeta.label);

  return [
    `Онбординг: ${labels.join('; ')}.`,
    'Если уместно, свяжи с этим один чип. Не навязывай.',
  ].join('\n');
}

function buildUserContext(vars: {
  user_name?: string;
  user_gender?: string;
  addressing?: Addressing;
  toneKey?: string;
  toneLabel?: string;
  toneDescription?: string;
  onboardingReasons?: OnboardingReasons;
}): string {
  const name = vars.user_name?.trim();
  const genderLabel = resolveGenderLabel(vars.user_gender);
  const addressingContext = buildAddressingContext(vars.addressing);
  const toneContext = buildToneContext(vars);
  const onboardingContext = buildOnboardingPersonalizationContext(vars);

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
 ${addressingContext}
 ${toneContext}
 ${onboardingContext}
 Запрещены формы с альтернативами в скобках (например, "сделал / сделала").`;
}

function buildAssistantPersonaContext(vars: {
  assistant_gender?: AssistantVoiceGender;
  assistant_display_name?: string;
}): string {
  return buildAssistantPersonaInstruction({
    assistantGender: vars.assistant_gender,
    assistantDisplayName: vars.assistant_display_name,
  });
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
    assistant_gender?: AssistantVoiceGender;
    assistant_display_name?: string;
    addressing?: Addressing;
    toneKey?: string;
    toneLabel?: string;
    toneDescription?: string;
    onboardingReasons?: OnboardingReasons;
  },
  ctx: {
    responseNumber?: number;
  } = {}
): string {
  const responseNumber = ctx.responseNumber || 1;
  const responseTypeInfo = getResponseTypeByNumber(responseNumber);
  const userContext = buildUserContext(vars);
  const assistantPersonaContext = buildAssistantPersonaContext(vars);

  return `${assistantPersonaContext}

${userContext}

Контекст текущего ответа:
 Номер: ${responseNumber}
 Тип: ${responseTypeInfo.description}
 Структура:
${responseTypeInfo.structure}`;
}

export function buildSessionBootstrapDeveloperContext(vars: {
  user_name?: string;
  user_gender?: string;
  assistant_gender?: AssistantVoiceGender;
  assistant_display_name?: string;
  addressing?: Addressing;
  toneKey?: string;
  toneLabel?: string;
  toneDescription?: string;
  onboardingReasons?: OnboardingReasons;
}): string {
  const userContext = buildUserContext(vars);
  const assistantPersonaContext = buildAssistantPersonaContext(vars);

  return `${assistantPersonaContext}

${userContext}`;
}

export function buildTurnDeveloperContext(
  ctx: {
    responseNumber?: number;
  } = {}
): string {
  const responseNumber = ctx.responseNumber || 1;
  const responseTypeInfo = getResponseTypeByNumber(responseNumber);

  return `Контекст текущего ответа:
 Номер: ${responseNumber}
 Тип: ${responseTypeInfo.description}
 Структура:
${responseTypeInfo.structure}`;
}

export function buildSessionMemoryText(
  summaries: Array<any>,
  _lang: string = 'ru'
): string {
  // Язык пока не влияет на формат summary-блока, но сохраняем параметр для совместимости вызовов.
  void _lang;

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
  const normalizeSnippet = (rawValue: string, maxLength = 1400): string => {
    const normalized = String(rawValue || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) {
      return '';
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}…`;
  };

  if (context.type === 'habit') {
    const name = context.habit_name || context.habit_id;
    const intent = context.habit_intent === 'quit' ? 'отказа' : 'формирования';
    const description = context.habit_description
      ? ` ${context.habit_description}`
      : '';

    // СПЕЦИАЛЬНОЕ ПРАВИЛО ДЛЯ КОФЕИНА/КОФЕ
    const habitIdLower = String(context.habit_id || '').toLowerCase();
    const nameLower = name.toLowerCase();
    if (
      habitIdLower === 'caffeine' ||
      nameLower.includes('кофеин') ||
      nameLower.includes('кофе')
    ) {
      return `Контекст: пользователь хочет обсудить привычку «${name}» (баланс кофеина)${description}.
ВАЖНО: Кофе полезен! НЕ говори о вреде кофе. Проблема в избытке и времени (после 14:00 мешает сну). Фокус на балансе.`;
    }

    return `Контекст: пользователь хочет обсудить привычку «${name}» (${intent})${description}.`;
  }

  if (context.type === 'therapy_topic') {
    const name = context.topic_name || context.topic_id;
    const description = context.topic_description
      ? ` ${context.topic_description}`
      : '';
    return `Контекст: пользователь хочет поговорить о теме «${name}»${description}.`;
  }

  if (context.type === 'sos') {
    const entryMap: Record<typeof context.sos_entry, string> = {
      panic: 'тревога и паника',
      tension: 'сильное напряжение',
      vent: 'хочу выговориться',
    };
    const label = entryMap[context.sos_entry] || 'sos';
    const afterPractice = context.after_practice
      ? ' Пользователь уже завершил SOS-практику.'
      : '';
    return `Контекст: пользователь пришёл из SOS («${label}»).${afterPractice}`;
  }

  if (context.type === 'thought_dump') {
    const sourceLabel =
      context.source === 'quick_help_thought_dump'
        ? '«Выгрузка мыслей»'
        : 'режима выгрузки';
    const dumpSnippet = normalizeSnippet(context.dump_text);
    const dumpBlock = dumpSnippet
      ? `Текст выгрузки (контекст, не цитируй дословно без необходимости): «${dumpSnippet}».`
      : 'Текст выгрузки отсутствует, мягко уточни с чего пользователю проще начать.';

    return `Контекст: пользователь перешёл из раздела ${sourceLabel} и хочет обсудить свою выгрузку мыслей.
${dumpBlock}
Задача: подхвати разговор по содержанию выгрузки, отрази ключевую эмоцию или узел и помоги бережно продолжить диалог.
Не начинай с общих шаблонных фраз вроде «Чем могу помочь прямо сейчас?».`;
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
  assistant_gender?: AssistantVoiceGender;
  assistant_display_name?: string;
  addressing?: Addressing;
  greetingName?: string | null;
  includeNameValidationPrompt?: boolean;
  openingMode?: 'greeting' | 'alternative';
  openingLine?: string;
  useGreeting?: boolean;
  welcomePromptContent?: string;
  entryContext?: ChatEntryContext;
  disableOpeningTemplates?: boolean;
  toneKey?: string;
  toneLabel?: string;
  toneDescription?: string;
  onboardingReasons?: OnboardingReasons;
}): string {
  const lang = options.lang || 'ru';
  const isFirst = options.isFirstSession;
  const sessionMemoryText = options.sessionMemoryText || '';
  const contextNote = options.entryContext
    ? buildEntryContextDescription(options.entryContext)
    : '';
  const useGreeting = Boolean(options.useGreeting);
  const isPhobiasEntry =
    options.entryContext?.type === 'therapy_topic' &&
    options.entryContext.topic_id === 'phobias';
  const disableOpeningTemplates =
    Boolean(options.disableOpeningTemplates) ||
    options.entryContext?.type === 'thought_dump' ||
    isPhobiasEntry;
  const addressingContext = buildAddressingContext(options.addressing);
  const assistantPersonaContext = buildAssistantPersonaContext({
    assistant_gender: options.assistant_gender,
    assistant_display_name: options.assistant_display_name,
  });
  const toneContext = buildToneContext({
    toneKey: options.toneKey,
    toneLabel: options.toneLabel,
    toneDescription: options.toneDescription,
  });
  const onboardingContext = buildOnboardingPersonalizationContext({
    onboardingReasons: options.onboardingReasons,
  });

  const nameInstruction =
    options.includeNameValidationPrompt && options.greetingName
      ? `\n\nВАЖНО: В первом предложении приветствия используй обращение по имени «${options.greetingName}». Используй только это имя, без фамилии и без выдумок.`
      : '';
  const openingInstruction =
    !disableOpeningTemplates &&
    options.openingMode === 'alternative' &&
    options.openingLine
      ? `\n\nВАЖНО: Сегодня приветствие не нужно. Начни сообщение с фразы: «${options.openingLine}». Не используй слова приветствия (привет, здравствуй, доброе утро/день/вечер).`
      : '';
  const noTemplateStartInstruction =
    options.entryContext?.type === 'thought_dump'
      ? '\n\nВАЖНО: Не используй приветствие и шаблонные вводные фразы. Начни сразу с поддерживающего отклика по содержанию выгрузки.'
      : isPhobiasEntry
        ? useGreeting
          ? '\n\nВАЖНО: Это первое приветствие дня. Допустимо одно короткое приветствие в начале сообщения, затем сразу перейди к структурированному старту по теме страхов.'
          : '\n\nВАЖНО: Сегодня приветствие уже использовано. Не используй приветствие и шаблонные вводные фразы. Начни сразу со структурированного старта по теме страхов.'
        : '';

  if (options.welcomePromptContent) {
    let prompt = options.welcomePromptContent;

    prompt = prompt.replace(/{{user_name}}/g, options.user_name || '');
    prompt = prompt.replace(/{{user_gender}}/g, options.user_gender || '');
    prompt = prompt.replace(/{{user_locale}}/g, options.user_locale || '');
    prompt = prompt.replace(/{{greeting_name}}/g, options.greetingName || '');
    prompt = prompt.replace(/{{lang}}/g, lang);

    if (!isFirst && sessionMemoryText) {
      prompt = prompt + '\n\nКонтекст прошлых бесед:\n' + sessionMemoryText;
    }

    const generatedStartInstruction = disableOpeningTemplates
      ? options.entryContext?.type === 'thought_dump'
        ? 'Твое сообщение будет ПЕРВЫМ в диалоге. Сгенерируй: короткое отражение содержания выгрузки (1-2 предложения) + 1 конкретная опора (выбор/инсайт/рамка) + 1 открытый вопрос.'
        : isPhobiasEntry
          ? useGreeting
            ? 'Твое сообщение будет ПЕРВЫМ в диалоге. Сгенерируй: одно короткое приветствие + структурированный старт по теме страхов. Держи всё сообщение в пределах 2-4 предложений.'
            : 'Твое сообщение будет ПЕРВЫМ в диалоге. Сгенерируй: короткий структурированный старт по теме страхов (2-4 предложения) без приветствия и без шаблонной вводной.'
          : 'Твое сообщение будет ПЕРВЫМ в диалоге. Сгенерируй: стартовое сообщение без приветствия (2-3 предложения) + 1 конкретная опора (выбор/инсайт/рамка) + 1 открытый вопрос.'
      : 'Твое сообщение будет ПЕРВЫМ в диалоге. Сгенерируй: приветствие (2-3 предложения) + 1 конкретная опора (выбор/инсайт/рамка) + 1 открытый вопрос.';

    prompt =
      prompt +
      `\n\nВАЖНО: Не утверждай, что тема уже обсуждалась конкретно раньше; если контекст неочевиден - формулируй нейтрально. ${generatedStartInstruction}`;

    const fullPrompt = `${assistantPersonaContext ? `${assistantPersonaContext}\n\n` : ''}${addressingContext ? `${addressingContext}\n\n` : ''}${toneContext ? `${toneContext}\n\n` : ''}${onboardingContext ? `${onboardingContext}\n\n` : ''}${prompt}${nameInstruction}${openingInstruction}${noTemplateStartInstruction}`;
    return contextNote ? `${contextNote}\n\n${fullPrompt}` : fullPrompt;
  }

  const templates = {
    first: `Это первая сессия пользователя.

Сгенерируй приветствие (2-3 предложения):
 Представься и объясни чем помогаешь
 Добавь 1 конкретную опору (например выбор: "часто полезно выбрать: сейчас важнее причина или один узкий узел?")
 Затем 1 открытый вопрос
`,

    repeat: `Это не первая сессия пользователя.

Контекст прошлых сессий:
{{sessionMemoryText}}

Сгенерируй приветствие (2-3 предложения), которое:
 Не утверждает, что тема уже обсуждалась конкретно раньше; формулируй нейтрально
 Добавляет 1 конкретную опору (выбор/инсайт/рамка)
 Мягко предлагает вернуться к темам или перейти к новым
 Завершается 1 открытым вопросом
`,
  };

  const template = isFirst ? templates.first : templates.repeat;
  let prompt = template;

  const shouldForceGreetinglessStart =
    options.openingMode === 'alternative' ||
    (disableOpeningTemplates && !(isPhobiasEntry && useGreeting));

  if (shouldForceGreetinglessStart) {
    prompt = prompt.replace(
      'Сгенерируй приветствие (2-3 предложения):',
      'Сгенерируй стартовое сообщение без приветствия (2-3 предложения):'
    );
    prompt = prompt.replace(
      'Сгенерируй приветствие (2-3 предложения), которое:',
      'Сгенерируй стартовое сообщение без приветствия (2-3 предложения), которое:'
    );
  }
  if (disableOpeningTemplates) {
    if (options.entryContext?.type === 'thought_dump') {
      prompt = prompt.replace(
        ' Представься и объясни чем помогаешь',
        ' Сразу отрази суть выгрузки пользователя'
      );
      prompt = prompt.replace(
        ' Мягко предлагает вернуться к темам или перейти к новым',
        ' Опирается на содержание выгрузки, без общих вводных формулировок'
      );
    } else if (isPhobiasEntry) {
      prompt = prompt.replace(
        ' Представься и объясни чем помогаешь',
        useGreeting
          ? ' Начни с одного короткого приветствия, затем сразу перейди к структурированному старту по теме страхов'
          : ' Сразу перейди к короткому структурированному старту по теме страхов'
      );
      prompt = prompt.replace(
        ' Мягко предлагает вернуться к темам или перейти к новым',
        useGreeting
          ? ' Сначала коротко приветствует, затем помогает выбрать прошлую или новую подтему страха'
          : ' Сначала помогает выбрать прошлую или новую подтему страха без общего приветствия'
      );
    }
  }

  prompt = prompt.replace(/{{user_name}}/g, options.user_name || '');
  prompt = prompt.replace(/{{user_gender}}/g, options.user_gender || '');
  prompt = prompt.replace(/{{user_locale}}/g, options.user_locale || '');
  prompt = prompt.replace(/{{greeting_name}}/g, options.greetingName || '');
  prompt = prompt.replace(/{{lang}}/g, lang);

  if (!isFirst && sessionMemoryText) {
    prompt = prompt.replace(/{{sessionMemoryText}}/g, sessionMemoryText);
  } else {
    prompt = prompt.replace(
      /Контекст прошлых сессий:\n{{sessionMemoryText}}\n\n/g,
      ''
    );
  }

  const fullPrompt = `${assistantPersonaContext ? `${assistantPersonaContext}\n\n` : ''}${addressingContext ? `${addressingContext}\n\n` : ''}${toneContext ? `${toneContext}\n\n` : ''}${onboardingContext ? `${onboardingContext}\n\n` : ''}${prompt}${nameInstruction}${openingInstruction}${noTemplateStartInstruction}`;
  return contextNote ? `${contextNote}\n\n${fullPrompt}` : fullPrompt;
}

export function buildSuggestedChipsUserPrompt(params: {
  dialog_context: string;
  assistant_answer: string;
  max_chips: number;
  retry?: boolean;
  onboardingReasons?: OnboardingReasons;
}): string {
  const dialogContext = (params.dialog_context || 'Нет контекста').slice(-320);
  const assistantAnswer = (params.assistant_answer || 'Нет ответа').slice(-260);
  const onboardingContext = buildOnboardingSuggestedChipsContext({
    onboardingReasons: params.onboardingReasons,
  });

  const base = renderTemplate(suggestedChipsUserTemplate, {
    dialog_context: dialogContext,
    assistant_answer: assistantAnswer,
    max_chips: String(params.max_chips || 3),
  });

  if (params.retry) {
    return `${base}${onboardingContext ? `\n\n${onboardingContext}` : ''}\n\n${suggestedChipsRetryHint}`;
  }

  return onboardingContext ? `${base}\n\n${onboardingContext}` : base;
}
