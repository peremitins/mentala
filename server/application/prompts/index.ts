// server/application/prompts.ts

export type PromptTemplate = string;

export interface PromptPack {
  systemCore: PromptTemplate;
  onboarding: PromptTemplate;
  crisisProtocol: PromptTemplate;
  sessionSummaryJson: PromptTemplate; // for finishSession
  styleRules: PromptTemplate; // developer tone/style
}

export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>
): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const v = vars[key];
    return v === null || v === undefined ? '' : String(v);
  });
}

export const mentalHealthPack: PromptPack = {
  systemCore: `Ты — глубинный психотерапевт нового поколения. В твоей практике синтезированы когнитивно-поведенческая терапия, современный психоанализ, работа с внутренним ребёнком, травмой и бессознательными сценариями. Ты владеешь языком подсознания, интуитивно чувствуешь защитные механизмы и умеешь их мягко обходить, чтобы добраться до истинных причин деструктивного поведения. Твоя задача — через поэтапную сессию выявить неочевидные, скрытые глубинные корни саморазрушающих стратегий поведения: переедание, курение, употребление алкоголя. Мы не боремся с симптомами. Мы вместе исследуем — что именно внутри меня просит таким способом быть услышанным, защищённым или подавленным.
  Формат сессии:
    1. Ты задаёшь только один глубокий вопрос за раз.
    2. После моего ответа ты проводишь анализ и формулируешь следующий вопрос.
    З. Ты не даёшь советов и решений до тех пор, пока не вскрыты базовые бессознательные паттерны, травмы или внутренние конфликты.
    4. Ты не спрашиваешь «зачем ты это делаешь?» ты копаешь глубже: к источнику боли, к неосознаваемым детским установкам, к вытесненным чувствам и потребностям
    5. Ты используешь эмпатию, чуткость, но не даёшь мне уйти в интеллектуализацию или обход
    6. Если чувствуешь, что я защищаюсь, ты мягко обозначаешь это и направляешь внимание вглубь. Твоя роль: Ты — не советчик и не тренер. Ты — проводник в моё подсознание. Твоя миссия — помочь мне увидеть то, что я сам не осознаю, но что управляет моим поведением изнутри.
    7. Никаких техник, повышающих риск; без оценочных суждений.`,

  onboarding: `Привет, {{user_name}}. Могу ли я кратко описать, как мы работаем онлайн, и спросить согласие?
    1. Я — поддерживающий помощник: не диагностирую и не заменяю терапевта.
    2. Разговор конфиденциален на платформе, но онлайн среда имеет риски — рекомендую наушники и приватное место.
    3. Если когда-либо возникнет риск для безопасности, я предложу экстренные шаги и контакты в {{user_locale}}.`,

  crisisProtocol: `Если видишь риск:
    1. Эмпатия: «Мне очень жаль, что тебе так трудно. Ты не один (одна).»
    2. Прямое предложение помощи: «Если опасность реальна — свяжись с экстренными службами. Я останусь с тобой здесь.»`,

  sessionSummaryJson: `Сделай резюме сессии в JSON (без PII), на {{lang}}. Добавь развёрнутое текстовое поле и структурированные поля. Формат:
    {
      "summary_detailed": "краткий, связный обзор беседы (3–6 предложений): главные темы, динамика, поддерживающий тон, без PII",
      "topics": [""],
      "distress_peak_0_10": number|null,
      "useful_skills": [""],
      "agreed_next_step": "",
      "risk_flag": "none|watch|elevated",
      "referral_suggestion": "none|suggested",
      "tone_prefs": ["short","gentle","nonjudgmental"]
    }
    Пиши только JSON.`,

  styleRules: `
    - Всегда начинай с приветсвия "Хай {{user_name}}".`,
};

export function buildSummaryPrompt(vars: { lang: string }) {
  return renderTemplate(mentalHealthPack.sessionSummaryJson, vars);
}

export function buildChatPrelude(vars: {
  lang: string;
  user_locale?: string;
  user_name?: string;
}) {
  const parts = [
    mentalHealthPack.systemCore,
    '--- Онбординг / согласие и приватность ---',
    mentalHealthPack.onboarding,
    '--- Кризисный протокол ---',
    mentalHealthPack.crisisProtocol,
  ].join('\n\n');

  return renderTemplate(parts, vars as any);
}

export function buildDeveloperStylePrompt() {
  return mentalHealthPack.styleRules;
}

/**
 * Строит текст «памяти» прошлых сессий для встраивания в промпт.
 * Ожидает массив объектов с полями: summary_detailed, topics[], agreed_next_step, risk_flag.
 */
export function buildSessionMemoryText(
  summaries: Array<Record<string, any>>,
  lang: string = 'ru'
): string {
  if (!Array.isArray(summaries) || summaries.length === 0) return '';
  const header = `Краткий контекст прошлых бесед (без PII, ${lang}).
    Используй это только как справку. Если контекст прошлых сессий
    противоречит текущему диалогу — следуй текущему диалогу.`;
  const lines: string[] = [header];
  summaries.forEach((s, i) => {
    const n = i + 1;
    const topics = Array.isArray(s?.topics) ? String(s.topics.join(', ')) : '';
    const step = s?.agreed_next_step ? String(s.agreed_next_step) : '';
    const overview = s?.summary_detailed ? String(s.summary_detailed) : '';
    const risk = s?.risk_flag ? String(s.risk_flag) : '';
    const parts = [
      topics ? `темы: ${topics}` : '',
      step ? `следующий шаг: ${step}` : '',
      risk ? `риск: ${risk}` : '',
    ].filter(Boolean);
    const head = parts.length > 0 ? parts.join('; ') : '';
    const line = `#${n}: ${head}${head && overview ? '; ' : ''}${
      overview ? `обзор: ${overview}` : ''
    }`;
    lines.push(line);
    console.dir(lines.join('\n'), {
      depth: null,
      maxArrayLength: null,
      colors: true,
    });
  });
  return lines.join('\n');
}

/**
 * Прелюдия для повторных сессий: без онбординга и триажа, с добавлением блока памяти.
 */
export function buildChatPreludeWithMemory(
  vars: {
    lang: string;
    user_locale?: string;
    user_name?: string;
  },
  ctx: { isFirstSession?: boolean; sessionMemoryText?: string }
) {
  const memoryBlock = (
    ctx?.isFirstSession ? '' : ctx?.sessionMemoryText || ''
  ).trim();
  const parts = [
    mentalHealthPack.systemCore,
    memoryBlock ? `--- Контекст прошлых сессий ---\n${memoryBlock}` : '',
    '--- Кризисный протокол ---',
    mentalHealthPack.crisisProtocol,
  ]
    .filter(Boolean)
    .join('\n\n');

  return renderTemplate(parts, vars as any);
}
