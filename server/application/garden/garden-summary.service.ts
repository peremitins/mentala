import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  type CheckpointStructuredData,
  assessmentAttempts,
  dailyThoughts,
  moodCheckins,
  programs,
  sessionSummariesUser,
  userPlants,
  userProgramCheckpointSummaries,
  userProgramStepAttempts,
  userPrograms,
  users,
} from '@/server/infrastructure/db/schema';
import { chatWithFallback } from '@/server/application/llm.service';
import { applyGender } from '@/server/application/programs/gendered-text';
import { parseEncryptedJson } from '@/server/utils/securePayload';
import {
  collectProgramMetricsLightweight,
  type ProgramMetricsLightweight,
} from '@/server/application/garden/garden-metrics.service';

/**
 * Клинический разбор завершённой программы.
 *
 * См. retention/implementation_plan.md, сессия 25 — после
 * завершения последнего шага программа должна выдавать профессиональный
 * (а не preset-«грустный») отчёт уровня клинического психотерапевта,
 * собирающий ВСЕ данные пути пользователя:
 *   - mood-чекины за период (timeline + распределение),
 *   - journal_entry / thought_dump outputs из attempts,
 *   - reflection chip-паттерны,
 *   - сохранённые мысли (daily_thoughts),
 *   - AI-chat session summaries (расшифровываем для feed-в LLM),
 *   - метрики путешествия (длительность, # шагов, # ai-сессий и т.д.).
 *
 * Это входит в developer prompt LLM. LLM (chatWithFallback: openai → deepseek → yandex)
 * пишет markdown-отчёт на 8 секций (~4000-6000 символов) в роли клинического
 * психотерапевта с 15+ лет практики, опирающегося на CBT/ACT/MBSR/CFT/Self-Compassion/IFS.
 *
 * Кэш: результат записывается в `user_plants.user_summary` — повторные вызовы
 * сразу отдают кеш. `force=true` обходит кэш (нужен при первой генерации,
 * когда completion-flow выставил `user_summary=null` для сигнала "ещё нет").
 */

// Чувствительные секционные заголовки используются и в fallback'е, и
// в требовании к LLM — чтобы UI рендерил единый набор разделов.
// Если меняешь — обнови `KNOWN_SECTION_HEADINGS` ниже и PRESET_FALLBACKS.
const REPORT_HEADINGS = {
  metrics: '## Путь в цифрах',
  story: '## Что произошло',
  voices: '## Что прозвучало в разговорах',
  patterns: '## Паттерны',
  dynamics: '## Динамика состояния',
  anchors: '## Что осталось со мной',
  growth: '## Куда расти дальше',
  plan: '## Карта действий на ближайшие 4-6 недель',
  anchorPhrase: '## Якорь на будущее',
} as const;

// Preset-fallback'и: используют ту же 9-секционную структуру что LLM, чтобы
// UI рендерил их единообразно. Содержательно опираются на методику программы.
const PRESET_FALLBACKS: Record<string, string> = {
  calm_anxiety_30: `${REPORT_HEADINGS.metrics}

Ты {прошёл|прошла} 30-шаговый CBT-курс работы с тревогой. За это время ты {освоил|освоила} несколько ключевых техник, наблюдал за телом и мыслями, и зафиксировал собственные триггеры. Этот путь теперь у тебя есть как карта.

${REPORT_HEADINGS.story}

Программа провела тебя от наблюдения за дыханием и телом в первой главе — к разбору мыслительных искажений и репетиции реакций на триггеры в финальных шагах. Это последовательность, которую разрабатывали Beck и его коллеги для работы с тревожными расстройствами: сначала стабилизация тела, потом — работа с когнициями.

${REPORT_HEADINGS.voices}

Разговоры внутри программы помогли проговорить конкретные ситуации тревоги, а не общие тревожные мысли. Это важно: техники работают на конкретике, а не на обобщениях.

${REPORT_HEADINGS.patterns}

Если ты {замечал|замечала} у себя паттерн «катастрофизация → телесная реакция → избегание» — теперь у тебя есть набор инструментов, чтобы разорвать эту цепочку на каждом из трёх звеньев.

${REPORT_HEADINGS.dynamics}

Тревога редко уходит линейно. Скорее всего, ты {заметил|заметила}, что какие-то дни были легче, какие-то — труднее. Это нормально и предсказуемо — нервная система обучается реагировать иначе через повторение, а не через волю.

${REPORT_HEADINGS.anchors}

Из методики у тебя в руках: техника **СТОП** (для автоматических реакций), **дыхание 4-7-8** (для физиологического успокоения), **заземление 5-4-3-2-1** (для острых приступов), **когнитивная переоценка** (для разбора катастрофических мыслей), **выгрузка мыслей** (для освобождения когнитивной нагрузки).

${REPORT_HEADINGS.growth}

Тревога — это сигнал, а не приговор. Точка роста — научиться слышать сигнал без слияния с ним. Это вопрос практики, не одноразовой работы.

${REPORT_HEADINGS.plan}

- **Дыхание 4-7-8** — 1 цикл утром перед задачей, требующей собранности, и 1 цикл вечером перед сном.
- **Техника СТОП** — каждый раз, когда замечаешь автоматическую тревожную реакцию (мысль → тело → действие).
- **Заземление 5-4-3-2-1** — при остром приступе тревоги в общественном месте или в момент, когда не можешь дышать.
- **Выгрузка мыслей** — раз в неделю, чтобы освободить голову от навязчивых паттернов. 10 минут — лист — выписал — закрыл.
- **Когнитивная переоценка** — когда ловишь катастрофическую мысль («всё пойдёт не так»), задай себе три вопроса: что доказательства за? что против? как бы я смотрел на это через год?

${REPORT_HEADINGS.anchorPhrase}

Тревога — это сигнал, а не приговор. У тебя есть инструменты, чтобы услышать сигнал и не утонуть в нём.`,
  self_kindness_21: `${REPORT_HEADINGS.metrics}

Ты {прошёл|прошла} 21-шаговую программу самосострадания, опирающуюся на работу Кристин Нефф, Стивена Хайеса (ACT) и Пола Гилберта (CFT). Каждый шаг был коротким, но за ними — десятилетия исследований.

${REPORT_HEADINGS.story}

Программа провела тебя через три понимания: 1) внутренний критик — не «правда», а часть тебя, которая пытается защитить через жёсткость; 2) самосострадание — не слабость и не индульгенция, а самый стабильный ресурс для движения вперёд (Neff, 2003); 3) общее человеческое (common humanity) — твоя боль не делает тебя исключением, она делает тебя человеком.

${REPORT_HEADINGS.voices}

Разговоры внутри программы помогли отделить «у меня есть мысль, что я недостаточен» от «я недостаточен». Это техника когнитивной дефузии из ACT, и она лежит в основе всей программы.

${REPORT_HEADINGS.patterns}

Если ты {замечал|замечала} у себя паттерн «ошибка → жёсткая самокритика → изоляция» — теперь у тебя есть способ остановиться на втором звене и заменить критику на тёплый разговор с собой.

${REPORT_HEADINGS.dynamics}

Самосострадание — это не настроение, а навык. Скорее всего, ты {заметил|заметила}, что бывают дни, когда оно течёт легко, и дни, когда даже формула «у меня есть мысль» кажется натянутой. Это норма практики.

${REPORT_HEADINGS.anchors}

Из методики у тебя в руках: **LKM-фраза** «Пусть я буду в безопасности» (Salzberg), **тёплое прикосновение к груди** (self-soothing touch, Gilbert), **ACT-формула** «У меня есть мысль, что…» (Hayes), **письмо себе как другу**, **common humanity напоминание**.

${REPORT_HEADINGS.growth}

Самокритика не исчезнет — её можно слышать без отождествления. Точка роста — научиться делать это в реальных ситуациях, а не только на коврике медитации.

${REPORT_HEADINGS.plan}

- **Ладонь на грудь** — 10 секунд в любой момент стресса, даже на встрече или в дороге.
- **Формула ACT-дефузии** «У меня есть мысль, что…» — каждый раз, когда ловишь жёсткую самокритику.
- **LKM-фраза перед сном** — «Пусть я буду в безопасности» как ритуал перехода в покой.
- **Письмо себе как другу** — раз в неделю, когда замечаешь, что критикуешь.
- **Common humanity напоминание** — «я не {один|одна} в этом» в моменте изоляции.

${REPORT_HEADINGS.anchorPhrase}

К себе можно так же бережно, как ты {был|была} бы к близкому другу — это не слабость, это самый стабильный способ продолжать движение.`,
};

function buildFallbackSummary(
  programSlug: string,
  programTitle: string,
  userGender: 'male' | 'female'
): string {
  const preset = PRESET_FALLBACKS[programSlug];
  if (preset) return applyGender(preset, userGender);
  const generic = `${REPORT_HEADINGS.metrics}\n\nТы {завершил|завершила} программу «${programTitle}». Это путь, который теперь часть твоей коллекции.\n\n${REPORT_HEADINGS.anchors}\n\nКаждая техника, которую ты {освоил|освоила}, осталась с тобой как инструмент.\n\n${REPORT_HEADINGS.plan}\n\n- Возвращайся к практикам, которые откликнулись, раз в неделю.\n- Замечай, какие техники включаются автоматически — это знак интеграции.\n\n${REPORT_HEADINGS.anchorPhrase}\n\nТы {прошёл|прошла} больше, чем кажется в моменте.`;
  return applyGender(generic, userGender);
}

async function fetchSavedThoughts(
  userId: number,
  thoughtIds: number[]
): Promise<string[]> {
  if (!thoughtIds.length) return [];
  const rows = await db
    .select({ text: dailyThoughts.text })
    .from(dailyThoughts)
    .where(
      and(
        eq(dailyThoughts.userId, userId),
        inArray(dailyThoughts.id, thoughtIds)
      )
    )
    .limit(thoughtIds.length);
  return rows.map((r) => r.text);
}

/**
 * Подтягиваем AI-chat session summaries за период программы. Они — самый
 * ценный клинический сигнал: LLM на каждом ai_chat-шаге уже выдал короткое
 * саммари «о чём говорили, что важно». Эти саммари расшифровываем и
 * скармливаем главному LLM как контекст.
 *
 * Возвращаем массив компактных строк "{shortSummary} | ключевые точки: ..."
 * (≤6 элементов, обрезанных до 360 символов каждый).
 */
async function fetchAiChatInsights(params: {
  userId: number;
  programStartedAt: Date;
  programCompletedAt: Date | null;
}): Promise<string[]> {
  // Верхняя граница — не раньше «сейчас»: при пересборке отчёта после повторного
  // прохождения (replay) нужно учитывать и данные, созданные уже после исходного
  // завершения сада, иначе replay-дни выпали бы из выборки.
  const endDate = new Date(
    Math.max(params.programCompletedAt?.getTime() ?? 0, Date.now())
  );
  const rows = await db
    .select({
      summaryIv: sessionSummariesUser.summaryIv,
      summaryCt: sessionSummariesUser.summaryCt,
      sessionStartedAt: sessionSummariesUser.sessionStartedAt,
    })
    .from(sessionSummariesUser)
    .where(
      and(
        eq(sessionSummariesUser.userId, params.userId),
        eq(sessionSummariesUser.status, 'completed'),
        gte(sessionSummariesUser.createdAt, params.programStartedAt),
        lte(sessionSummariesUser.createdAt, endDate)
      )
    )
    .orderBy(asc(sessionSummariesUser.createdAt))
    .limit(20);

  const insights: string[] = [];
  for (const row of rows) {
    if (!row.summaryIv || !row.summaryCt) continue;
    try {
      const parsed = parseEncryptedJson<{
        shortSummary?: string;
        keyPoints?: string[];
        nextSteps?: string[];
      }>(row.summaryIv, row.summaryCt);
      const parts: string[] = [];
      if (parsed.shortSummary && parsed.shortSummary.trim().length > 0) {
        parts.push(parsed.shortSummary.trim());
      }
      if (parsed.keyPoints && parsed.keyPoints.length > 0) {
        const kp = parsed.keyPoints
          .filter((p) => typeof p === 'string' && p.trim().length > 0)
          .slice(0, 3)
          .map((p) => `• ${p.trim()}`)
          .join(' ');
        if (kp) parts.push(kp);
      }
      const combined = parts.join(' | ').slice(0, 360);
      if (combined.length >= 20) insights.push(combined);
    } catch (error) {
      // Расшифровка может упасть на rotation ключа или corrupt'е — это не критично,
      // просто пропускаем эту сессию (есть остальные).
      console.error('[garden-summary] decrypt insight failed:', error);
    }
  }

  return insights.slice(0, 6);
}

/**
 * Метрики путешествия по программе — alias к lightweight-сервису.
 * Используются и в developer prompt'е LLM, и в UI отчёта (фронт получает их
 * через `/api/garden/plants/:id/summary-status`).
 */
export type ProgramJourneyMetrics = ProgramMetricsLightweight;

// Ключевые formKind structured_form, чьи ответы выводим в отчёте.
// Эти формы содержат живые слова пользователя — карточка тревожной мысли,
// эксперимент, прогноз vs факт, план на трудный день или выбранные техники.
const QUOTED_FORM_KINDS: Record<string, string[]> = {
  thought_card: ['thought', 'evidence_for', 'evidence_against', 'balanced'],
  prediction_vs_fact: ['prediction', 'fact', 'learning'],
  experiment: ['experiment', 'result', 'learning'],
  hard_day_plan: ['early_signs', 'first_5_minutes', 'support'],
  task_plan: ['task', 'first_step', 'when'],
  calm_toolkit: [
    'helped_techniques',
    // Legacy-поля старой версии шага 28. В UI их больше нет, но отчёты не
    // должны терять уже сохранённые ответы started/completed attempts.
    'body_tool',
    'attention_tool',
    'thought_tool',
  ],
  personal_set: ['top_technique', 'when_useful', 'reminder'],
  ladder: ['steps', 'first_step'],
};

type StructuredFormFieldForReport = {
  id: string;
  options?: Array<{ id: string; label: string }>;
};

function optionLabelForReport(
  field: StructuredFormFieldForReport | undefined,
  optionId: string
): string {
  const option = field?.options?.find((item) => item.id === optionId);
  return option?.label ?? optionId;
}

function isChoiceFieldForReport(
  field: StructuredFormFieldForReport | undefined
): boolean {
  return Boolean(field?.options?.length);
}

export function formatStructuredFormFieldValueForReport(
  raw: unknown,
  field?: StructuredFormFieldForReport
): string {
  if (typeof raw === 'string') {
    return optionLabelForReport(field, raw).trim();
  }

  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) => optionLabelForReport(field, item).trim())
      .filter(Boolean)
      .join(', ');
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }

  return '';
}

function isStructuredFormValueMeaningfulForReport(
  value: string,
  field: StructuredFormFieldForReport | undefined
): boolean {
  if (isChoiceFieldForReport(field)) {
    return value.trim().length >= 4;
  }

  return value.length >= 8 && isMeaningfulText(value);
}

/**
 * Эвристика валидности пользовательского текста. Юзеры иногда вводят
 * случайные символы, чтобы пройти required-поле. Такие тексты вредно
 * скармливать LLM (он начнёт «интерпретировать» бессмыслицу как инсайт).
 * Возвращаем true только для осмысленных строк.
 *
 * Критерии:
 *   - длина >= 12 символов;
 *   - минимум 8 буквенных символов;
 *   - минимум 6 уникальных буквенных символов (отсекает "ааааа", "qwerty");
 *   - не более 5 одинаковых подряд (отсекает "ппппппп").
 *
 * Намеренно НЕ требуем 3 слов: бывают короткие, но осмысленные ответы из
 * одного-двух слов («тревожусь утром», «не контролирую»).
 */
function isMeaningfulText(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 12) return false;

  const lettersOnly = text.toLowerCase().replace(/[^a-zа-яё]/gi, '');
  if (lettersOnly.length < 8) return false;

  const uniqueLetters = new Set(lettersOnly).size;
  if (uniqueLetters < 6) return false;

  // Проверка на длинные повторения одного символа: "ппппппп", "ааааа".
  if (/(.)\1{5,}/i.test(text)) return false;

  return true;
}

/**
 * Стандартизированные сигналы пути пользователя в одной программе.
 * Используется и финальным отчётом, и промежуточными чекпоинт-отчётами.
 * Опциональный `periodFromStep` сужает временное окно до данных,
 * накопленных с указанного шага и позднее (для чекпоинтов 7/14/21/30).
 */
export type CollectedUserSignals = {
  journalSnippets: string[];
  reflectionChipsTop3: string[];
  moodChange: { before: string | null; after: string | null };
  moodDistribution: Record<string, number>;
  moodCheckinsCount: number;
  // Анкета-серия для динамики тревоги (rating_scale outputs из attempts).
  // Каждая отметка — это либо scaleBefore, либо scaleAfter в конкретном шаге.
  anxietyTimeline: Array<{
    stepNumber: number;
    label: string | null;
    value: number;
    min: number;
    max: number;
    createdAt: string;
  }>;
  // Mood-чекины с timestamp + score (-2..+2) для графика mood.
  moodTimeline: Array<{ date: string; mood: string; score: number }>;
  // Ответы пользователя на weekly_check (3 вопроса). Ключи — checkpointStep.
  weeklyCheckAnswers: Array<{
    stepNumber: number;
    anxiety: number | null;
    // mainChange — для обратной совместимости (старые клиенты),
    // mainChangeIds — multi-select массив, новый канон.
    mainChange: string | null;
    mainChangeIds: string[] | null;
    supportNeed: string | null;
  }>;
  // Цитаты из structured_form (карточка мысли, эксперимент и т.п.).
  structuredFormHighlights: Array<{
    stepNumber: number;
    formKind: string;
    fieldId: string;
    quote: string;
  }>;
  // Какие практики (guided_steps) пройдены целиком — для finals.
  guidedStepsCompleted: Array<{ stepNumber: number; formKind: string | null }>;
  // Стартовые/финальные оценки, связанные с текущим садом.
  assessmentResults: Array<{
    slug: string;
    source: 'practice_page' | 'program_baseline' | 'program_final';
    score: number;
    bandId: string;
    title: string;
    shortText: string;
    scoreDirection: 'higher_is_worse' | 'higher_is_better' | 'custom';
    completedAt: string;
  }>;
  // Финальный выбор маршрута (next_route_choice).
  nextRouteChoice: string | null;
  // Метрики периода — для KPI-карточек чекпоинт-отчёта.
  metrics: {
    stepsCompleted: number;
    journalEntries: number;
    aiChatSessions: number;
    practicesCompleted: number;
  };
};

/**
 * Собирает дополнительные сигналы из БД для богатого AI-summary.
 *
 * Тянет из `userProgramStepAttempts.actions[]` все типы action-outputs:
 * journal_entry/thought_dump, ai_reflection chips, rating_scale (anxiety
 * timeline), structured_form (цитаты), weekly_check (ответы), guided_steps,
 * next_route_choice. Mood-чекины собираются отдельно из mood_checkins.
 *
 * Параметр `periodFromStep` сужает выборку до attempts с step >= N (для
 * промежуточных чекпоинт-отчётов на 7/14/21/30). По умолчанию — вся программа.
 */
export async function collectUserSignalsForProgram(params: {
  userId: number;
  userProgramId: number | null;
  programStartedAt: Date | null;
  programCompletedAt: Date | null;
  programSlug?: string | null;
  periodFromStep?: number;
}): Promise<CollectedUserSignals> {
  const empty: CollectedUserSignals = {
    journalSnippets: [],
    reflectionChipsTop3: [],
    moodChange: { before: null, after: null },
    moodDistribution: {},
    moodCheckinsCount: 0,
    anxietyTimeline: [],
    moodTimeline: [],
    weeklyCheckAnswers: [],
    structuredFormHighlights: [],
    guidedStepsCompleted: [],
    assessmentResults: [],
    nextRouteChoice: null,
    metrics: {
      stepsCompleted: 0,
      journalEntries: 0,
      aiChatSessions: 0,
      practicesCompleted: 0,
    },
  };
  if (!params.userProgramId || !params.programStartedAt) return empty;

  // Верхняя граница — не раньше «сейчас»: при пересборке отчёта после replay
  // нужно захватить mood/оценки, созданные после исходного завершения сада.
  const endDate = new Date(
    Math.max(params.programCompletedAt?.getTime() ?? 0, Date.now())
  );

  // 1. Attempts и mood-чекины запрашиваем параллельно. Mood-чекины берём от
  // programStartedAt (а не periodStartDate), чтобы не ждать результата attempts.
  // В памяти после обработки attempts фильтруем до нужного periodStartDate.
  const [attempts, allMoodRows, assessmentRows] = await Promise.all([
    db
      .select({
        step: userProgramStepAttempts.step,
        actions: userProgramStepAttempts.actions,
        createdAt: userProgramStepAttempts.createdAt,
      })
      .from(userProgramStepAttempts)
      .where(
        and(
          eq(userProgramStepAttempts.userId, params.userId),
          eq(userProgramStepAttempts.userProgramId, params.userProgramId),
          eq(userProgramStepAttempts.status, 'completed')
        )
      )
      .orderBy(asc(userProgramStepAttempts.step)),
    db
      .select({
        mood: moodCheckins.mood,
        createdAt: moodCheckins.createdAt,
        entryDate: moodCheckins.entryDate,
      })
      .from(moodCheckins)
      .where(
        and(
          eq(moodCheckins.userId, params.userId),
          gte(moodCheckins.createdAt, params.programStartedAt),
          lte(moodCheckins.createdAt, endDate)
        )
      )
      .orderBy(asc(moodCheckins.createdAt)),
    params.programSlug
      ? db
          .select({
            assessmentSlug: assessmentAttempts.assessmentSlug,
            source: assessmentAttempts.source,
            totalScore: assessmentAttempts.totalScore,
            bandId: assessmentAttempts.bandId,
            resultSnapshot: assessmentAttempts.resultSnapshot,
            completedAt: assessmentAttempts.completedAt,
          })
          .from(assessmentAttempts)
          .where(
            and(
              eq(assessmentAttempts.userId, params.userId),
              eq(assessmentAttempts.linkedProgramSlug, params.programSlug),
              gte(assessmentAttempts.completedAt, params.programStartedAt),
              lte(assessmentAttempts.completedAt, endDate)
            )
          )
          .orderBy(asc(assessmentAttempts.completedAt))
      : Promise.resolve([]),
  ]);

  const journalSnippets: string[] = [];
  const chipCounts = new Map<string, number>();
  const anxietyTimeline: CollectedUserSignals['anxietyTimeline'] = [];
  const weeklyCheckAnswers: CollectedUserSignals['weeklyCheckAnswers'] = [];
  const structuredFormHighlights: CollectedUserSignals['structuredFormHighlights'] =
    [];
  const guidedStepsCompleted: CollectedUserSignals['guidedStepsCompleted'] = [];
  let nextRouteChoice: string | null = null;
  let aiChatSessions = 0;
  let journalEntries = 0;
  let practicesCompleted = 0;

  const periodFromStep = params.periodFromStep ?? 0;

  // На повторном прохождении (replay) шага создаётся новая завершённая попытка с
  // тем же step. Для отчёта берём только ПОСЛЕДНЮЮ завершённую попытку каждого
  // шага (max createdAt): свежие данные перезаписывают старые, а не суммируются
  // с ними (иначе дневник/оценки/формы задвоятся). Остальные шаги остаются как
  // были — их последняя попытка единственная.
  const toMs = (value: Date | string) =>
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  const latestAttemptByStep = new Map<number, (typeof attempts)[number]>();
  for (const row of attempts) {
    const prev = latestAttemptByStep.get(row.step);
    if (!prev || toMs(row.createdAt) >= toMs(prev.createdAt)) {
      latestAttemptByStep.set(row.step, row);
    }
  }
  const dedupedAttempts = Array.from(latestAttemptByStep.values()).sort(
    (a, b) => a.step - b.step
  );

  for (const row of dedupedAttempts) {
    if (row.step < periodFromStep) continue;
    const actions = Array.isArray(row.actions)
      ? (row.actions as Array<{
          id?: string;
          type?: string;
          output?: unknown;
          status?: string;
          formKind?: string;
          prompt?: string;
          fields?: StructuredFormFieldForReport[];
          scaleBeforeLabel?: string;
          scaleAfterLabel?: string;
        }>)
      : [];
    const createdAtIso =
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt);

    for (const action of actions) {
      if (action?.status !== 'completed') continue;

      // journal_entry + thought_dump — текстовые цитаты.
      // Counter всегда инкрементим (юзер действительно записал), но в
      // journalSnippets кладём только осмысленные тексты — иначе LLM начнёт
      // выдавать "ааааа" за глубокий инсайт.
      if (action.type === 'journal_entry' || action.type === 'thought_dump') {
        const text =
          typeof action.output === 'string'
            ? action.output
            : (action.output as { text?: string } | null)?.text;
        if (text && isMeaningfulText(text)) {
          journalSnippets.push(text.trim().slice(0, 280));
        }
        if (action.type === 'journal_entry') journalEntries += 1;
      }

      // ai_reflection + micro_reflection — chips для top-N.
      if (
        action.type === 'ai_reflection' ||
        action.type === 'micro_reflection'
      ) {
        const chips = ((
          action.output as { chips?: string[]; selectedChips?: string[] } | null
        )?.chips ??
          (
            action.output as {
              chips?: string[];
              selectedChips?: string[];
            } | null
          )?.selectedChips ??
          []) as string[];
        for (const chip of chips) {
          if (typeof chip === 'string' && chip.trim().length > 0) {
            chipCounts.set(chip, (chipCounts.get(chip) ?? 0) + 1);
          }
        }
      }

      // rating_scale — динамика тревоги по шагам (самый ценный кол. сигнал).
      if (action.type === 'rating_scale') {
        const out = action.output as {
          value?: number;
          scaleMin?: number;
          scaleMax?: number;
          label?: string | null;
        } | null;
        if (out && typeof out.value === 'number') {
          anxietyTimeline.push({
            stepNumber: row.step,
            label:
              out.label ??
              action.scaleBeforeLabel ??
              action.scaleAfterLabel ??
              action.prompt ??
              null,
            value: out.value,
            min: out.scaleMin ?? 0,
            max: out.scaleMax ?? 10,
            createdAt: createdAtIso,
          });
        }
      }

      // weekly_check — ответы на 3 вопроса (anxiety + main_change + support_need).
      if (action.type === 'weekly_check') {
        const out = action.output as {
          answers?: Record<string, unknown>;
        } | null;
        const answers = (out?.answers ?? {}) as Record<string, unknown>;
        const anxietyAns = answers['anxiety_level_last_days'] as
          | { value?: number }
          | number
          | undefined;
        const anxietyValue =
          typeof anxietyAns === 'number'
            ? anxietyAns
            : typeof anxietyAns?.value === 'number'
              ? anxietyAns.value
              : null;
        // main_change теперь multi-select: значение может быть string[] (новые
        // клиенты), либо string (старые клиенты до изменения). Нормализуем
        // обе формы в массив, а для обратной совместимости отдаём первое
        // значение в старом поле `mainChange`.
        const rawMain = answers['main_change'];
        let mainChangeIds: string[] | null = null;
        if (Array.isArray(rawMain)) {
          mainChangeIds = rawMain.filter(
            (v): v is string => typeof v === 'string'
          );
          if (mainChangeIds.length === 0) mainChangeIds = null;
        } else if (typeof rawMain === 'string' && rawMain.length > 0) {
          mainChangeIds = [rawMain];
        }
        weeklyCheckAnswers.push({
          stepNumber: row.step,
          anxiety: anxietyValue,
          mainChange: mainChangeIds?.[0] ?? null,
          mainChangeIds,
          supportNeed:
            typeof answers['support_need'] === 'string'
              ? (answers['support_need'] as string)
              : null,
        });
      }

      // structured_form — цитаты из ключевых форм (карточка мысли и т.п.).
      // Применяем тот же фильтр осмысленности, что и для journal.
      if (action.type === 'structured_form') {
        const out = action.output as {
          formKind?: string;
          fields?: Record<string, unknown>;
        } | null;
        const formKind = out?.formKind ?? action.formKind ?? '';
        const wantedFields = QUOTED_FORM_KINDS[formKind];
        if (wantedFields && out?.fields) {
          for (const fieldId of wantedFields) {
            const raw = out.fields[fieldId];
            const fieldDefinition = action.fields?.find(
              (field) => field.id === fieldId
            );
            const quote = formatStructuredFormFieldValueForReport(
              raw,
              fieldDefinition
            );
            if (
              isStructuredFormValueMeaningfulForReport(quote, fieldDefinition)
            ) {
              structuredFormHighlights.push({
                stepNumber: row.step,
                formKind,
                fieldId,
                quote: quote.slice(0, 240),
              });
            }
          }
        }
      }

      // guided_steps — какие практики пройдены целиком.
      if (action.type === 'guided_steps') {
        const out = action.output as {
          completedStepIds?: unknown[];
        } | null;
        if (
          Array.isArray(out?.completedStepIds) &&
          out.completedStepIds.length > 0
        ) {
          guidedStepsCompleted.push({
            stepNumber: row.step,
            formKind: action.formKind ?? null,
          });
          practicesCompleted += 1;
        }
      }

      // next_route_choice — последний выигрывает (на 30-м шаге).
      if (action.type === 'next_route_choice') {
        const out = action.output as { choice?: string } | null;
        if (typeof out?.choice === 'string' && out.choice.trim().length > 0) {
          nextRouteChoice = out.choice;
        }
      }

      // ai_chat_session count.
      if (action.type === 'ai_chat_session') {
        const out = action.output as { skippedChatBySafeExit?: boolean } | null;
        if (!out?.skippedChatBySafeExit) aiChatSessions += 1;
      }

      // breathing/meditation/quick_help — практики.
      if (
        action.type === 'breathing' ||
        action.type === 'meditation' ||
        action.type === 'quick_help_breathing' ||
        action.type === 'quick_help_grounding' ||
        action.type === 'quick_help_tension'
      ) {
        practicesCompleted += 1;
      }
    }
  }

  const reflectionChipsTop3 = Array.from(chipCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([chip]) => chip);

  // 2. Mood-чекины за период — с timeline для графика.
  // mood→score маппинг: very_bad=-2, sad=-1, neutral=0, good=1, great=2.
  const moodScoreMap: Record<string, number> = {
    very_bad: -2,
    sad: -1,
    neutral: 0,
    good: 1,
    great: 2,
  };

  // Для фильтра по периоду: если periodFromStep задан, используем начало шага
  // (через первый attempt с step >= periodFromStep), иначе programStartedAt.
  const periodStartDate =
    periodFromStep > 0 && attempts.length > 0
      ? (attempts.find((a) => a.step >= periodFromStep)?.createdAt ??
        params.programStartedAt)
      : params.programStartedAt;

  // allMoodRows взяты от programStartedAt — фильтруем в памяти до periodStartDate.
  const moodRows =
    periodFromStep > 0
      ? allMoodRows.filter((r) => r.createdAt >= periodStartDate)
      : allMoodRows;

  const moodDistribution: Record<string, number> = {};
  // На графике динамики настроения держим одну точку за календарный день
  // пользователя: если за день несколько отметок, истинной считаем последнюю.
  // moodRows отсортированы по createdAt asc, поэтому при группировке по entryDate
  // последняя запись дня перезаписывает предыдущие. Распределение (moodDistribution)
  // при этом считаем по всем отметкам — оно отражает общий фон, а не график.
  const moodTimelineByDay = new Map<
    string,
    CollectedUserSignals['moodTimeline'][number]
  >();
  for (const row of moodRows) {
    const m = row.mood;
    moodDistribution[m] = (moodDistribution[m] ?? 0) + 1;
    const dayKey =
      row.entryDate ||
      (row.createdAt instanceof Date
        ? row.createdAt.toISOString().slice(0, 10)
        : String(row.createdAt).slice(0, 10));
    moodTimelineByDay.set(dayKey, {
      date:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      mood: m,
      score: moodScoreMap[m] ?? 0,
    });
  }
  const moodTimeline: CollectedUserSignals['moodTimeline'] = Array.from(
    moodTimelineByDay.values()
  );

  // metrics.stepsCompleted: уникальные step'ы attempts.
  const uniqueSteps = new Set<number>();
  for (const a of attempts) {
    if (a.step >= periodFromStep) uniqueSteps.add(a.step);
  }

  // На replay финального шага мог появиться второй program_final attempt. Для
  // отчёта берём последнюю попытку по каждой паре (оценка + источник):
  // assessmentRows отсортированы по completedAt asc, значит последняя побеждает.
  const latestAssessmentByKey = new Map<
    string,
    (typeof assessmentRows)[number]
  >();
  for (const row of assessmentRows) {
    latestAssessmentByKey.set(`${row.assessmentSlug}:${row.source}`, row);
  }
  const dedupedAssessmentRows = Array.from(latestAssessmentByKey.values());

  return {
    journalSnippets: journalSnippets.slice(0, 8),
    reflectionChipsTop3,
    moodChange: {
      before: moodRows[0]?.mood ?? null,
      after: moodRows[moodRows.length - 1]?.mood ?? null,
    },
    moodDistribution,
    moodCheckinsCount: moodRows.length,
    anxietyTimeline,
    moodTimeline,
    weeklyCheckAnswers,
    structuredFormHighlights: structuredFormHighlights.slice(0, 12),
    guidedStepsCompleted,
    assessmentResults: dedupedAssessmentRows.map((row) => ({
      slug: row.assessmentSlug,
      source: row.source,
      score: row.totalScore,
      bandId: row.bandId,
      title: row.resultSnapshot.title,
      shortText: row.resultSnapshot.shortText,
      scoreDirection: row.resultSnapshot.scoreDirection,
      completedAt:
        row.completedAt instanceof Date
          ? row.completedAt.toISOString()
          : String(row.completedAt),
    })),
    nextRouteChoice,
    metrics: {
      stepsCompleted: uniqueSteps.size,
      journalEntries,
      aiChatSessions,
      practicesCompleted,
    },
  };
}

const PROGRAM_METHODOLOGY: Record<string, string> = {
  calm_anxiety_30:
    'CBT (Beck, 1979), techniques: дыхание 4-7-8 / 5-4-3-2-1 заземление / СТОП-пауза / когнитивная переоценка / две AI-сессии (разбор тревоги, итоговая)',
  self_kindness_21:
    'Self-Compassion (Neff, 2003), ACT-дефузия (Hayes, 2006), Loving-Kindness Meditation (Salzberg, 2002), Compassion Focused Therapy (Gilbert, 2009) — внутренний критик как защитная часть',
};

function moodDistributionToText(dist: Record<string, number>): string {
  const order: Array<{ key: string; label: string }> = [
    { key: 'very_bad', label: 'очень плохо' },
    { key: 'sad', label: 'грустно' },
    { key: 'neutral', label: 'нейтрально' },
    { key: 'good', label: 'хорошо' },
    { key: 'great', label: 'отлично' },
  ];
  const parts = order
    .filter((o) => (dist[o.key] ?? 0) > 0)
    .map((o) => `${o.label}: ${dist[o.key]}`);
  return parts.length > 0 ? parts.join(', ') : 'данных нет';
}

// Маппинги для русификации id-шных значений в weekly_check answers (для промпта).
const MAIN_CHANGE_LABELS: Record<string, string> = {
  less_body_tension: 'меньше напряжения в теле',
  notice_thoughts: 'лучше замечает мысли',
  more_pause: 'чаще получается делать паузу',
  less_avoidance: 'меньше избегает',
  no_change_yet: 'пока без заметных изменений',
  worse: 'стало тяжелее',
};
const SUPPORT_NEED_LABELS: Record<string, string> = {
  better: 'лучше, чем раньше',
  usual: 'похоже на обычное состояние',
  harder: 'тяжелее, чем хотелось бы',
};

/**
 * Преобразует main_change-id (или массив id) в человекочитаемое описание для
 * отчёта. После перехода на multi-select может прийти и одиночное значение
 * (старые клиенты), и массив (новые). Возвращает строку-перечисление через
 * запятую; неизвестные id отдаются как есть.
 */
export function formatWeeklyMainChangeForReport(
  value: string | string[] | null | undefined
): string {
  if (value == null) return '';
  const ids = Array.isArray(value) ? value : [value];
  return ids
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => MAIN_CHANGE_LABELS[id] ?? id)
    .join(', ');
}

function formatWeeklyCheckAnswersForPrompt(
  answers: CollectedUserSignals['weeklyCheckAnswers']
): string {
  if (answers.length === 0) return '';
  return answers
    .map((a) => {
      const anxStr = a.anxiety !== null ? `${a.anxiety}/10` : '—';
      // Multi-select: формируем перечисление через запятую. Fallback на
      // одиночное значение из старого поля mainChange, если массива нет.
      const ids = a.mainChangeIds ?? (a.mainChange ? [a.mainChange] : []);
      const change =
        ids.length > 0
          ? ids.map((id) => MAIN_CHANGE_LABELS[id] ?? id).join(', ')
          : '—';
      const support = a.supportNeed
        ? (SUPPORT_NEED_LABELS[a.supportNeed] ?? a.supportNeed)
        : '—';
      return `шаг ${a.stepNumber}: тревога ${anxStr}, главные изменения: ${change}; состояние «${support}»`;
    })
    .join('\n');
}

function formatAnxietyTimelineForPrompt(
  timeline: CollectedUserSignals['anxietyTimeline']
): string {
  if (timeline.length === 0) return '';
  return timeline
    .map(
      (t) =>
        `шаг ${t.stepNumber}: ${t.value}/${t.max}${t.label ? ` (${t.label})` : ''}`
    )
    .join('\n');
}

export function formatAssessmentResultsForPrompt(
  results: CollectedUserSignals['assessmentResults']
): string {
  if (results.length === 0) return '';
  const sourceLabels: Record<
    CollectedUserSignals['assessmentResults'][number]['source'],
    string
  > = {
    practice_page: 'самостоятельно из раздела оценки',
    program_baseline: 'стартовый замер сада',
    program_final: 'финальный замер сада',
  };

  return results
    .map((result) => {
      const direction =
        result.scoreDirection === 'higher_is_better'
          ? 'выше = навык доступнее'
          : result.scoreDirection === 'higher_is_worse'
            ? 'ниже = состояние легче'
            : 'смотри интерпретацию результата';
      return `${sourceLabels[result.source]} (${result.slug}, ${result.completedAt}): ${result.score} баллов, зона «${result.title}» (${direction}). ${result.shortText}`;
    })
    .join('\n');
}

function formatStructuredFormHighlightsForPrompt(
  highlights: CollectedUserSignals['structuredFormHighlights']
): string {
  if (highlights.length === 0) return '';
  return highlights
    .map(
      (h) =>
        `шаг ${h.stepNumber} (${h.formKind}, поле ${h.fieldId}): «${h.quote}»`
    )
    .join('\n');
}

/**
 * Жёсткий блок правил стиля для всех LLM-промптов в этом домене (финальный
 * и чекпоинт-отчёты). Опирается на тон introText/miniArticle программы и
 * требования humanizer skill (без длинных тире, без AI-лозунгов).
 */
export const STYLE_RULES_PROMPT_BLOCK = `
**СТИЛЬ ТЕКСТА — критично, без исключений:**

Тон:
- Тёплый, профессиональный, обучающий без назидания. Как опытный психотерапевт в письме клиенту.
- Обращение на «ты», но без фамильярности и без «дружбы».
- Структура каждого раздела: наблюдение → объяснение → нормализация → практический переход. Этот стиль используется в introText/miniArticle программы.

Запрещено:
- Длинные тире (—) и em-dash. В тексте используй запятые, двоеточия или короткие тире (-) только для маркированных списков.
- Эмоджи, восклицательные знаки в конце предложений, приветствия («привет», «здравствуй»), прощания.
- Лозунги: «ты молодец», «гордись собой», «ты герой», «ты справился отлично».
- Англицизмы без необходимости: триггер → толчок/повод; паттерн → повторяющаяся цепочка; фокус → главное; чекин → отметка.
- Клинический жаргон без расшифровки: «когнитивная переоценка» можно, но добавь «(пересмотр мысли через факты)» при первом упоминании.
- Шаблонные фразы: «дальше будет ещё лучше», «продолжай в том же духе», «ты на правильном пути».
- Императив «должен», «обязан», «нужно». Используй «можешь попробовать», «мы научимся», «полезно».
- Привязка к календарю: «за неделю», «недельный итог», «за месяц», «через 7 дней». У разных пользователей путь идёт с разной скоростью. Используй «на этом отрезке», «между шагами X и Y», «с прошлой контрольной точки».
- Цитирование бессмысленных или случайных текстов. Если запись юзера выглядит как «аа», «фывфыв», «test» или одно слово — НЕ выдавай это за инсайт. Пропусти такую цитату и работай с тем, что наблюдаемо (метрики, mood, прохождение шагов).

Обязательно:
- Короткие абзацы по 2-4 предложения, разделённые пустой строкой.
- Цитируй пользователя короткими фрагментами в кавычках «...» только когда они осмысленные (минимум 4 слова, связная фраза). Это показывает, что ты читал его слова, не выдумывая инсайт из шума.
- Конкретика вместо обобщений: не «настроение улучшилось», а «в первой половине программы преобладали отметки neutral, ко второй стало больше good».
- Используй markdown: ## для заголовков (точно по списку), **bold** для названий техник.
`.trim();

async function generateLlmSummary(params: {
  programTitle: string;
  programSlug: string;
  savedThoughts: string[];
  signals: CollectedUserSignals;
  aiChatInsights: string[];
  metrics: ProgramJourneyMetrics;
  userGender: 'male' | 'female';
}): Promise<string | null> {
  // Пол пользователя для корректных родовых форм в обращении.
  // Тот же паттерн, что в server/application/notifications/ai-generation.service.ts.
  const genderLabel = params.userGender === 'female' ? 'женский' : 'мужской';
  const methodologyLine =
    PROGRAM_METHODOLOGY[params.programSlug] ||
    'CBT-обоснованная программа ментального здоровья';

  const sections: string[] = [];
  sections.push(
    `### Метрики путешествия\nДлительность: ${params.metrics.durationDays} дней. Завершено шагов: ${params.metrics.completedSteps}. Записей в дневнике: ${params.metrics.journalEntriesCount}. AI-чат сессий: ${params.metrics.aiChatSessionsCount}. Рефлексий с chip-выбором: ${params.metrics.reflectionsCount}.`
  );

  const anxietyBlock = formatAnxietyTimelineForPrompt(
    params.signals.anxietyTimeline
  );
  if (anxietyBlock) {
    sections.push(
      `### Динамика тревоги по шкале (rating_scale, хронологически)\n${anxietyBlock}`
    );
  }

  const weeklyBlock = formatWeeklyCheckAnswersForPrompt(
    params.signals.weeklyCheckAnswers
  );
  if (weeklyBlock) {
    sections.push(
      `### Промежуточные отметки на контрольных точках\n${weeklyBlock}`
    );
  }

  const assessmentBlock = formatAssessmentResultsForPrompt(
    params.signals.assessmentResults
  );
  if (assessmentBlock) {
    sections.push(
      `### Оценки состояния, связанные с садом\n${assessmentBlock}`
    );
  }

  if (params.aiChatInsights.length > 0) {
    sections.push(
      `### Саммари AI-разговоров пользователя (порядок хронологический)\n${params.aiChatInsights.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    );
  }

  const formsBlock = formatStructuredFormHighlightsForPrompt(
    params.signals.structuredFormHighlights
  );
  if (formsBlock) {
    sections.push(
      `### Цитаты из структурированных форм (карточка мысли, эксперимент, план и т.п.)\n${formsBlock}`
    );
  }

  if (params.savedThoughts.length) {
    sections.push(
      `### Сохранённые мысли пользователя за период\n${params.savedThoughts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    );
  }
  if (params.signals.journalSnippets.length) {
    sections.push(
      `### Записи в дневнике (фрагменты)\n${params.signals.journalSnippets.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    );
  }
  if (params.signals.reflectionChipsTop3.length) {
    sections.push(
      `### Часто выбираемые формулировки в рефлексиях\n${params.signals.reflectionChipsTop3.join(' · ')}`
    );
  }
  if (params.signals.moodCheckinsCount > 0) {
    sections.push(
      `### Mood-трек\nВсего отметок настроения: ${params.signals.moodCheckinsCount}. Распределение: ${moodDistributionToText(params.signals.moodDistribution)}. Первая отметка: ${params.signals.moodChange.before ?? 'не отмечено'}. Последняя: ${params.signals.moodChange.after ?? 'не отмечено'}.`
    );
  }
  if (params.signals.guidedStepsCompleted.length > 0) {
    const list = params.signals.guidedStepsCompleted
      .map((g) => `шаг ${g.stepNumber}${g.formKind ? ` (${g.formKind})` : ''}`)
      .join(', ');
    sections.push(`### Практики, пройденные целиком\n${list}`);
  }
  if (params.signals.nextRouteChoice) {
    sections.push(
      `### Финальный выбор пользователя на завершении программы\n«${params.signals.nextRouteChoice}»`
    );
  }

  const dataBlock =
    sections.length > 0
      ? sections.join('\n\n')
      : 'Дополнительных сигналов нет — ориентируйся только на название сада и методику.';

  const userPrompt = `Тебе нужно написать **развёрнутый клинический разбор** завершённого сада «${params.programTitle}». Это не короткая цитата, а полноценный итог пути пользователя на 4000-6000 символов. Когда упоминаешь сад в тексте — называй его «${params.programTitle}» (НЕ slug, НЕ техническое имя).

**Методика программы:** ${methodologyLine}.

**Данные пользователя за период программы:**

${dataBlock}

**Обязательная структура (ровно эти 9 заголовков, в этом порядке, ровно с этими формулировками):**

${REPORT_HEADINGS.metrics}
Один абзац (3-5 предложений): сжатый обзор пути в цифрах и в смысле. Не «12 сообщений», а «12 содержательных реплик в AI-разговорах за ${params.metrics.durationDays} дней — это говорит о…». Дай интерпретацию метрик, а не пересказ.

${REPORT_HEADINGS.story}
Два-три абзаца (6-9 предложений): аналитический нарратив пути пользователя. Назови КОНКРЕТНЫЕ моменты прогресса, паттерны или сдвиги, которые видны в данных. НЕ обобщения «ты справился», а наблюдения уровня «в начале программы преобладали мысли о X, к шагам Y они сменились на Z». Цитируй короткие фрагменты из journal/thoughts там, где это уместно.

${REPORT_HEADINGS.voices}
Один-два абзаца: выжимка ключевых тем из AI-разговоров пользователя ПЛЮС обязательное цитирование из structured_form ответов (карточка тревожной мысли, прогноз vs факт, план на трудный день и т.п.) — это самые конкретные слова пользователя. Цитируй короткие фрагменты в кавычках «...» с привязкой к шагу: «в шаге 12 ты записал мысль "..."». Если AI-разговоров не было — напиши одну фразу про это и сосредоточься на цитатах из форм. Минимум 2 цитаты на эту секцию.

${REPORT_HEADINGS.patterns}
Один абзац (3-4 предложения): паттерны из journal_entry и reflection chips. Если есть chip-паттерны, отражающие конкретную технику — упоминай. Если в журнале повторяются темы — называй их. Если в weekly_check одна и та же графа «главное изменение» повторялась — это тоже паттерн (укажи).

${REPORT_HEADINGS.dynamics}
Один-два абзаца (4-6 предложений). ОБЯЗАТЕЛЬНО используй данные из разделов «Динамика тревоги по шкале», «Промежуточные отметки на контрольных точках» и «Оценки состояния, связанные с садом», если они есть. Конкретные числа: «на старте 8/10, на первой контрольной точке 6, на финале 4 — снижение почти вдвое». Не «настроение улучшилось», а «mood-распределение показывает, что эпизоды very_bad концентрировались в первой половине». Если этих данных нет (< 3 точек) — отметь это как зону роста («регулярный mood-трек помог бы видеть динамику»). Категорически без обобщений «всё стало лучше» без чисел. НЕ привязывайся к календарю («за неделю», «через месяц»): говори о шагах и контрольных точках.

${REPORT_HEADINGS.anchors}
Один абзац (3-5 предложений): какие техники из методики, судя по сигналам, нашли отклик. Называй ИХ ПО ИМЕНИ: «техника СТОП», «дыхание 4-7-8», «заземление 5-4-3-2-1», «формула ACT-дефузии», «loving-kindness фраза», «self-soothing touch» и т.д. Используй **bold** для названий техник.

${REPORT_HEADINGS.growth}
Один абзац (3-4 предложения): зона роста, которая видна в данных. Без назидания и без шаблонного «дальше будет ещё лучше». Конкретная точка — например, «телесные ощущения остались наиболее размытой зоной» или «mood-трек показывает, что вечера остаются труднее, чем утра».

${REPORT_HEADINGS.plan}
Маркированный список из 5-7 КОНКРЕТНЫХ рекомендаций. Каждая:
- начинается с действия (глагол) или техники в **bold**;
- привязана к методике программы;
- содержит конкретное «когда/где» (например, «утром при пробуждении», «когда заметишь критика», «после рабочего звонка»);
- БЕЗ обтекаемых формулировок «постарайся быть добрее к себе» — только конкретика;
- одна рекомендация должна предлагать практику возврата к программе (например, «перечитай шаги X-Y, если поймаешь...»).

${REPORT_HEADINGS.anchorPhrase}
Одна короткая фраза-якорь (10-25 слов), которую пользователь может вспомнить в трудный момент. Не лозунг, не цитата из соцсетей — личная формулировка, отражающая ключевой инсайт его конкретного пути (можно черпать из его собственных слов в данных).

**Правила тона:**
- Пол пользователя: ${genderLabel}. Все родовые формы в обращении к пользователю («ты записал/записала», «ты справился/справилась», «ты сделал/сделала») должны соответствовать этому полу. Запрещены формы с альтернативами в скобках (например, «сделал(а)»).
- Пиши как клинический психотерапевт с 15+ лет практики, опирающийся на доказательные подходы (CBT/ACT/MBSR/CFT/Self-Compassion/IFS). Уровень — частной практики, не приложения.
- НЕ давай советов «как друг» — формулируй наблюдения и обоснованные рекомендации.
- Общая длина: 4000-6000 символов с разметкой.
- Верни ТОЛЬКО сам отчёт в markdown, без префиксов, без вступления «Вот разбор:», без кавычек вокруг.

${STYLE_RULES_PROMPT_BLOCK}`;

  try {
    const result = await chatWithFallback({
      // Итоговый отчёт — 4000-6000 символов (~2500-3500 токенов на русском).
      // Дефолт провайдера (800) обрывал текст на середине последней секции.
      // Отчёт генерится один раз на завершение сада, поэтому больший лимит не
      // бьёт по экономике. Запас до 3200 на маркдаун и заголовки.
      maxOutputTokens: 3200,
      messages: [
        {
          role: 'system',
          content:
            `Пол пользователя — ${genderLabel}. Все родовые формы в обращении («ты сделал/сделала», «ты прошёл/прошла», «ты записал/записала») обязаны соответствовать этому полу; формы с альтернативами в скобках («сделал(а)») запрещены. ` +
            'Ты — клинический психотерапевт с 15+ лет частной практики. Специализация — доказательная психотерапия: CBT (Beck), ACT (Hayes), MBSR (Kabat-Zinn), Self-Compassion (Neff), CFT (Gilbert), IFS (Schwartz). Ты пишешь профессиональные клинические разборы завершённых программ ментального здоровья для своих клиентов. Стиль — структурированный markdown-отчёт на 4000-6000 символов с конкретными наблюдениями, цитатами из данных пользователя, и развёрнутым планом действий на 4-6 недель. Тон тёплый, но профессиональный — как реальный психолог в письме клиенту, не как мотивационный коуч. ВАЖНО: пиши только простым русским языком. Не используй в тексте для пользователя англоязычные термины, аббревиатуры и профжаргон (например «Loving-Kindness Meditation», «mindfulness», «CBT», «grounding»): называй практику и понятие по-русски своими словами, при необходимости коротко поясняй смысл. Пользователь — обычный человек без психологической подготовки.',
        },
        { role: 'user', content: userPrompt },
      ],
    });
    const text = (result.content || '').trim().replace(/^["«]|["»]$/g, '');
    if (!text || text.length < 800) return null;
    // Sanity-check: должен быть хотя бы один из обязательных заголовков.
    if (!text.includes('## ')) return null;
    return text.slice(0, 8000);
  } catch (error) {
    console.error('[garden-summary] llm failed:', error);
    return null;
  }
}

// In-memory mutex для защиты от параллельных вызовов LLM-генерации одного
// и того же plant'а. Ключ — `${userId}:${plantId}` (force-вызовы получают
// отдельный ключ, чтобы не возвращать кэш предыдущего параллельного
// non-force запроса). Когда промис resolve'ится или reject'ится, ключ
// удаляется. Защищает все три клиентских точки входа (GardenPlantLoreCard,
// GardenTransplantHandoff, GardenPlantReportSheet) на одном Nitro-процессе.
//
// Ограничение: при горизонтальном масштабировании на несколько Nitro
// инстансов нужен Redis-based lock. Для P1.5 одного процесса достаточно.
const inflightPlantSummaryRequests = new Map<
  string,
  Promise<{
    summaryText: string;
    generated: boolean;
    metrics: ProgramJourneyMetrics | null;
  }>
>();

/**
 * Возвращает summary text + метрики для отчёта завершённого сада. Кэширует
 * результат в `user_plants.user_summary`. На повторных запросах сразу
 * отдаёт кеш без вызова LLM.
 *
 * `force=true` — пересоздать summary. Используется и при первой генерации
 * после завершения последнего шага (completion-flow выставляет
 * `user_summary=null` чтобы получить чистый старт), и при админ-перегенерации
 * через `POST /api/garden/plants/:id/refresh-summary?force=1`.
 *
 * Защищено от параллельных вызовов через in-memory mutex: одновременные
 * запросы с одним `(userId, plantId)` получают один и тот же promise,
 * избегая двойной LLM-генерации.
 */
export async function getOrGeneratePlantSummary(params: {
  userId: number;
  plantId: number;
  force?: boolean;
}): Promise<{
  summaryText: string;
  generated: boolean;
  metrics: ProgramJourneyMetrics | null;
}> {
  // Mutex по `(userId, plantId)`. force-вызовы получают отдельный ключ —
  // иначе администратор, нажавший «принудительно перегенерировать», может
  // получить кэшированный результат от параллельного обычного вызова.
  const mutexKey = `${params.userId}:${params.plantId}${params.force ? ':force' : ''}`;
  const existing = inflightPlantSummaryRequests.get(mutexKey);
  if (existing) {
    return existing;
  }
  const promise = runGetOrGeneratePlantSummary(params).finally(() => {
    inflightPlantSummaryRequests.delete(mutexKey);
  });
  inflightPlantSummaryRequests.set(mutexKey, promise);
  return promise;
}

/**
 * Пол пользователя для родовых форм в AI-отчёте. Дефолт — мужской
 * (легаси-записи до обязательного онбординга). Локальная копия, чтобы не
 * импортировать из retention-program.service (был бы цикл).
 */
export async function getUserGender(
  userId: number
): Promise<'male' | 'female'> {
  const [row] = await db
    .select({ gender: users.gender })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.gender === 'female' ? 'female' : 'male';
}

async function runGetOrGeneratePlantSummary(params: {
  userId: number;
  plantId: number;
  force?: boolean;
}): Promise<{
  summaryText: string;
  generated: boolean;
  metrics: ProgramJourneyMetrics | null;
}> {
  const [plant] = await db
    .select()
    .from(userPlants)
    .where(
      and(
        eq(userPlants.id, params.plantId),
        eq(userPlants.userId, params.userId)
      )
    )
    .limit(1);

  if (!plant) {
    const err = new Error('Plant not found');
    (err as Error & { code?: string }).code = 'E_NOT_FOUND';
    throw err;
  }

  // Ранняя кэш-проверка: если summaryText уже есть и force=false — нам нужны только
  // userProgramRow (для metrics) и programRow (для title). Загружаем параллельно.
  // Если кэша нет — всё равно нужен тот же набор + gender + thoughts/signals/insights.
  const [userProgramRow, programRow, userGender] = await Promise.all([
    db
      .select({
        id: userPrograms.id,
        startedAt: userPrograms.startedAt,
        completedAt: userPrograms.completedAt,
      })
      .from(userPrograms)
      .where(
        and(
          eq(userPrograms.userId, params.userId),
          eq(userPrograms.programId, plant.programId)
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    // Реальное название сада — чтобы LLM использовал «Спокойствие», а не «calm_anxiety_30».
    db
      .select({ title: programs.title })
      .from(programs)
      .where(eq(programs.slug, plant.programSlug))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getUserGender(params.userId),
  ]);

  const programTitle = programRow?.title || plant.programSlug;

  const metrics =
    userProgramRow?.startedAt && userProgramRow?.id
      ? await collectProgramMetricsLightweight({
          userId: params.userId,
          userProgramId: userProgramRow.id,
          programStartedAt: userProgramRow.startedAt,
          programCompletedAt: userProgramRow.completedAt,
        })
      : null;

  // Кэш: вернём существующий, если он есть и force=false.
  if (
    !params.force &&
    plant.userSummary &&
    plant.userSummary.trim().length > 0
  ) {
    return { summaryText: plant.userSummary, generated: false, metrics };
  }

  const thoughtIds = ((plant.savedThoughts as { ids?: number[] })?.ids ??
    []) as number[];

  // thoughts, signals, aiChatInsights не зависят друг от друга — запрашиваем параллельно.
  const [thoughts, signals, aiChatInsights] = await Promise.all([
    fetchSavedThoughts(params.userId, thoughtIds),
    collectUserSignalsForProgram({
      userId: params.userId,
      userProgramId: userProgramRow?.id ?? null,
      programStartedAt: userProgramRow?.startedAt ?? null,
      programCompletedAt: userProgramRow?.completedAt ?? null,
      programSlug: plant.programSlug,
    }),
    userProgramRow?.startedAt
      ? fetchAiChatInsights({
          userId: params.userId,
          programStartedAt: userProgramRow.startedAt,
          programCompletedAt: userProgramRow.completedAt,
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchAiChatInsights>>),
  ]);

  const metricsForPrompt = metrics ?? {
    durationDays: 0,
    completedSteps: 0,
    journalEntriesCount: 0,
    aiChatSessionsCount: 0,
    reflectionsCount: 0,
  };

  const llmText = await generateLlmSummary({
    programTitle,
    programSlug: plant.programSlug,
    savedThoughts: thoughts,
    signals,
    aiChatInsights,
    metrics: metricsForPrompt,
    userGender,
  });
  const summaryText =
    llmText ||
    buildFallbackSummary(plant.programSlug, programTitle, userGender);

  await db
    .update(userPlants)
    .set({ userSummary: summaryText, updatedAt: new Date() })
    .where(eq(userPlants.id, plant.id));

  // Дублируем финальный отчёт в новую таблицу `user_program_checkpoint_summaries`
  // (checkpointStep=30, kind='final') — чтобы /api/garden/plants/:id/timeline
  // мог отдать его в одном списке с промежуточными. user_plants.user_summary
  // остаётся для обратной совместимости старых клиентов.
  let mirroredReportId = 0;
  if (userProgramRow?.id && userProgramRow.startedAt) {
    const structuredData: CheckpointStructuredData = {
      anxietyTimeline: signals.anxietyTimeline,
      moodTimeline: signals.moodTimeline,
      weeklyCheckAnswer: null, // финал — не один weekly_check, а итог программы
      topChips: signals.reflectionChipsTop3.map((label) => ({
        label,
        count: 0,
      })),
      structuredFormHighlights: signals.structuredFormHighlights,
      metrics: signals.metrics,
      periodStart: userProgramRow.startedAt.toISOString(),
      periodEnd: (userProgramRow.completedAt ?? new Date()).toISOString(),
    };
    try {
      const mirrored = await db
        .insert(userProgramCheckpointSummaries)
        .values({
          userId: params.userId,
          userProgramId: userProgramRow.id,
          programSlug: plant.programSlug,
          checkpointStep: 30,
          kind: 'final',
          summaryText,
          structuredData,
          modelUsed: null,
          generationStatus: llmText ? 'ready' : 'failed',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            userProgramCheckpointSummaries.userProgramId,
            userProgramCheckpointSummaries.checkpointStep,
          ],
          set: {
            summaryText,
            structuredData,
            generationStatus: llmText ? 'ready' : 'failed',
            updatedAt: new Date(),
          },
        })
        .returning({ id: userProgramCheckpointSummaries.id });
      mirroredReportId = mirrored[0]?.id ?? 0;
    } catch (error) {
      // Не критично — главный отчёт уже в user_plants.user_summary.
      console.error(
        '[garden-summary] failed to mirror final summary to checkpoints table:',
        error
      );
    }
  }

  // Отложенный push о готовом финальном отчёте — только при успешной
  // генерации LLM (fallback-текст не достоин push'а) и наличии mirrored
  // записи. Уходит через ~90 сек и только если юзер не просмотрел отчёт
  // в приложении (защита от дубля при синхронном показе; idempotency
  // через pushSentAt/viewedAt внутри dispatch).
  if (llmText && mirroredReportId > 0) {
    const { scheduleReportReadyPush } = await import(
      '@/server/application/garden/queues/gardenReportPush.queue'
    );
    void scheduleReportReadyPush({
      userId: params.userId,
      reportId: mirroredReportId,
      programTitle,
      programSlug: plant.programSlug,
      checkpointStep: 30,
      kind: 'final',
    });
  }

  return { summaryText, generated: true, metrics };
}

/**
 * Сбрасывает закешированный ИТОГОВЫЙ отчёт сада (`user_plants.user_summary`).
 *
 * Зачем: пол читается из `users.gender` только в момент генерации и запекается
 * в текст (родовые формы обращения). После смены пола в настройках старый отчёт
 * остаётся с прежним родом — у легаси-аккаунтов (gender был null → дефолт
 * «мужской») это выглядит как баг «отчёт обращается ко мне в мужском роде».
 *
 * Обнуление безопасно: `summary-status`-эндпоинт пересоздаёт отчёт через
 * `getOrGeneratePlantSummary(force:true)` при пустом `user_summary`. Промежуточные
 * чекпоинт-сводки УДАЛЯТЬ нельзя (их некому лениво пересоздать — таймлайны
 * read-only), поэтому их перегенерация живёт в garden-checkpoint-summary.service.
 */
export async function resetPlantSummariesForUser(
  userId: number
): Promise<void> {
  await db
    .update(userPlants)
    .set({ userSummary: null, updatedAt: new Date() })
    .where(eq(userPlants.userId, userId));
}
