// server/application/prompts/sessionSummaryUser.ts
// ===================================================================
// Промпт для формирования пользовательских итогов сессии
// (ТЗ редизайн главной, п.13).
//
// Отдельный промпт от sessionSummaryJson (handoff для LLM): здесь
// человекочитаемый итог (shortSummary, keyPoints, nextSteps)
// на языке пользователя, с его стилем обращения.
// ===================================================================

import { renderTemplate } from './index';
import {
  resolveAddressing,
  pickAddressingText,
} from '../../../shared/utils/addressing';
import type { Addressing } from '../../../shared/dto/notifications';
import type { Gender } from '../../../shared/dto/onboarding';

// Определяет человекочитаемое название языка для промпта по коду локали.
function resolveLanguageInstruction(locale?: string | null): string {
  const normalized = (locale || 'ru').toLowerCase().split(/[-_]/)[0];
  const map: Record<string, string> = {
    ru: 'русском',
    en: 'английском',
    de: 'немецком',
    fr: 'французском',
    es: 'испанском',
    it: 'итальянском',
    pt: 'португальском',
    tr: 'турецком',
    uk: 'украинском',
    kk: 'казахском',
    uz: 'узбекском',
  };
  return map[normalized] ?? 'русском';
}

function buildGenderRule(gender?: Gender | null): string {
  if (gender === 'female') {
    return 'Если формулировка требует рода, используй только женский род при обращении к человеку: «ты заметила», «тебе было тяжело», «ты смогла». Никогда не переходи на мужской род.';
  }

  if (gender === 'male') {
    return 'Если формулировка требует рода, используй только мужской род при обращении к человеку: «ты заметил», «тебе было тяжело», «ты смог». Никогда не переходи на женский род.';
  }

  return 'Если формулировка требует рода, а пол не указан, используй нейтральные конструкции без предположений о поле.';
}

// Строит блок правил обращения, языка и рода для системного промпта.
function buildAddressingLangAndGenderRules(
  addressing: Addressing,
  locale?: string | null,
  gender?: Gender | null
): string {
  const lang = resolveLanguageInstruction(locale);
  const addressingRule = pickAddressingText(addressing, {
    informal: `Обращайся к человеку на «ты» (тебе, тебя, твой). Никогда не переходи на «вы».`,
    formal: `Обращайся к человеку на «вы» (вам, вас, ваш). Никогда не переходи на «ты».`,
  });
  const genderRule = buildGenderRule(gender);
  const addressingExample = pickAddressingText(addressing, {
    informal:
      gender === 'female'
        ? `shortSummary: 2–3 предложения с обращением на «ты» и женским родом там, где формулировка требует рода.`
        : gender === 'male'
          ? `shortSummary: 2–3 предложения с обращением на «ты» и мужским родом там, где формулировка требует рода.`
          : `shortSummary: 2–3 предложения с обращением на «ты» и без предположений о поле.`,
    formal:
      gender === 'female'
        ? `shortSummary: 2–3 предложения с обращением на «вы» и женским родом там, где формулировка требует рода.`
        : gender === 'male'
          ? `shortSummary: 2–3 предложения с обращением на «вы» и мужским родом там, где формулировка требует рода.`
          : `shortSummary: 2–3 предложения с обращением на «вы» и без предположений о поле.`,
  });

  return `Язык, обращение и род:
1. Пиши только на ${lang} языке.
2. ${addressingRule}
3. ${genderRule}
4. ${addressingExample}`;
}

// Строит блок инструкции для user-промпта.
function buildUserPromptPersonalizationNote(
  addressing: Addressing,
  gender?: Gender | null
): string {
  return pickAddressingText(addressing, {
    informal:
      gender === 'female'
        ? `Верни краткий итог в формате JSON, обращаясь к пользователю на «ты» и используя женский род там, где формулировка требует рода.`
        : gender === 'male'
          ? `Верни краткий итог в формате JSON, обращаясь к пользователю на «ты» и используя мужской род там, где формулировка требует рода.`
          : `Верни краткий итог в формате JSON, обращаясь к пользователю на «ты» и не делая предположений о поле, если можно сказать нейтрально.`,
    formal:
      gender === 'female'
        ? `Верни краткий итог в формате JSON, обращаясь к пользователю на «вы» и используя женский род там, где формулировка требует рода.`
        : gender === 'male'
          ? `Верни краткий итог в формате JSON, обращаясь к пользователю на «вы» и используя мужской род там, где формулировка требует рода.`
          : `Верни краткий итог в формате JSON, обращаясь к пользователю на «вы» и не делая предположений о поле, если можно сказать нейтрально.`,
  });
}

export const sessionSummaryUserUserTemplate = `Ниже передана завершённая сессия.

Опирайся только на фактическое содержание диалога. {{personalization_note}}

Данные сессии:
- Длительность: {{duration}}
- Сообщений от пользователя: {{userMessagesCount}}

Диалог:
{{messages}}`;

// Утилитарное: форматирование длительности "MM:SS" / "HH:MM:SS" для подстановки в промпт.
export function formatDurationForPrompt(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

// Форматирует сообщения сессии в человекочитаемый transcript для промпта.
//
// Лимит 80 000 символов покрывает ~1 час активного диалога (60–80 обменов
// по 300–400 символов ≈ 30 000–40 000 символов), оставляя двукратный запас.
// gpt-4o-mini имеет окно 128k токенов; 80 000 символов ≈ 20 000 токенов.
//
// Стратегия обрезки: если транскрипт всё же превышает лимит, оставляем КОНЕЦ,
// а не начало. Для саммари важнее то, к чему пришли, а не стартовая раскачка.
// Первые 2 сообщения всегда сохраняются для контекста запроса.
export function formatMessagesForPrompt(
  messages: Array<{ role: string; content: string }>,
  options: { maxChars?: number } = {}
): string {
  const maxChars = options.maxChars ?? 80_000;
  if (!Array.isArray(messages) || messages.length === 0)
    return '(нет сообщений)';

  // Форматируем все сообщения в строки.
  const formatted = messages
    .map((m) => {
      const role = m.role === 'user' ? 'Пользователь' : 'Ассистент';
      const raw = typeof m.content === 'string' ? m.content : '';
      const content = raw.replace(/\s+/g, ' ').trim();
      return content ? `[${role}]: ${content}` : null;
    })
    .filter((line): line is string => line !== null);

  if (!formatted.length) return '(нет сообщений)';

  // Быстрая проверка: если всё влезает — возвращаем как есть.
  const fullText = formatted.join('\n');
  if (fullText.length <= maxChars) return fullText;

  // Транскрипт длиннее лимита — нужна обрезка.
  // Стратегия: берём первые 2 сообщения (контекст запроса) + максимум
  // последних сообщений (итог разговора). Начало обрезается, не конец.
  const HEAD_MESSAGES = 2;
  const head = formatted.slice(0, HEAD_MESSAGES);
  const tail = formatted.slice(HEAD_MESSAGES);

  const headText = head.join('\n');
  const tailBudget = maxChars - headText.length - 40; // 40 — запас на разделитель

  // Набираем хвост с конца, пока влезает в бюджет.
  const tailLines: string[] = [];
  let tailLen = 0;
  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i]!;
    if (tailLen + line.length + 1 > tailBudget) break;
    tailLines.unshift(line);
    tailLen += line.length + 1;
  }

  const skipped = tail.length - tailLines.length;
  const separator =
    skipped > 0
      ? `[...${skipped} сообщений пропущено — показан конец разговора...]`
      : null;

  const parts = [headText, separator, ...tailLines].filter(Boolean);
  return parts.join('\n');
}

export function buildSessionSummaryUserPrompt(vars: {
  durationSeconds: number;
  userMessagesCount: number;
  messages: Array<{ role: string; content: string }>;
  /** Стиль обращения из userPreferences.addressing */
  addressing?: string | null;
  /** Локаль из users.locale */
  locale?: string | null;
  /** Пол пользователя из users.gender */
  gender?: Gender | null;
}): { system: string; user: string } {
  const addressing = resolveAddressing(vars.addressing);
  const duration = formatDurationForPrompt(vars.durationSeconds);
  const messagesBlock = formatMessagesForPrompt(vars.messages);
  const addressingLangAndGenderRules = buildAddressingLangAndGenderRules(
    addressing,
    vars.locale,
    vars.gender
  );
  const personalizationNote = buildUserPromptPersonalizationNote(
    addressing,
    vars.gender
  );

  const system = `Ты помогаешь человеку бережно отразить завершённую сессию в приложении эмоциональной поддержки.

Пиши итог не как наблюдение со стороны, а как мягкое отражение разговора для самого человека — так, чтобы он узнал себя в тексте.

${addressingLangAndGenderRules}

Правила голоса и стиля:
- Не используй слова «пользователь», «он», «она», «клиент» — только прямое обращение или безличные конструкции.
- Избегай формулировок «проявил интерес», «выявлено», «необходимо выяснить», «следует», «рекомендуется» — это канцелярит.
- Пиши тепло, кратко и естественно — без лишней сентиментальности и без пафоса.
- Не ставь диагнозы, не навешивай психиатрические ярлыки, не делай глубоких интерпретаций без явной опоры в диалоге.
- Не оценивай осуждающе. Не придумывай факты, которых не было в разговоре.
- Не пересказывай весь диалог — нужна только суть.
- Если данных недостаточно для уверенного вывода, отрази это аккуратно и не выдумывай.

Правила для nextSteps:
- Предлагай только мягкие, реалистичные и безопасные варианты продолжения.
- Опирайся на конкретику из разговора: что именно обсуждалось, что волновало.
- Каждый пункт — это небольшой шаг или мысль, которую можно взять с собой.

Верни результат строго в JSON формате:
{
  "shortSummary": "string",
  "keyPoints": ["string"],
  "nextSteps": ["string"]
}

Требования к содержимому:
- keyPoints: 2–4 пункта — ключевые моменты или темы разговора.
- nextSteps: 2–4 пункта — мягкие предложения и конкретные шаги, вытекающие из диалога.

Возвращай ТОЛЬКО валидный JSON без текста вокруг, без markdown и без комментариев.`;

  const user = renderTemplate(sessionSummaryUserUserTemplate, {
    personalization_note: personalizationNote,
    duration,
    userMessagesCount: String(vars.userMessagesCount ?? 0),
    messages: messagesBlock,
  });

  return { system, user };
}
