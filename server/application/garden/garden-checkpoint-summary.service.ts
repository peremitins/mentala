import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  programs,
  userProgramCheckpointSummaries,
  userPrograms,
  type CheckpointStructuredData,
} from '@/server/infrastructure/db/schema';
import { chatWithFallback } from '@/server/application/llm.service';
import {
  collectUserSignalsForProgram,
  getUserGender,
  STYLE_RULES_PROMPT_BLOCK,
  type CollectedUserSignals,
} from '@/server/application/garden/garden-summary.service';
import { dispatchReportReadyPush } from '@/server/application/garden/garden-report-push.service';

/**
 * Промежуточные чекпоинт-отчёты по программе (Сад).
 *
 * Генерируются после weekly_check action на шагах 7, 14, 21 (kind='weekly')
 * и 30 (kind='final', но создаётся параллельно с финальным отчётом из
 * garden-summary.service.ts для timeline-вью в Оранжерее).
 *
 * Накопленный анализ: на чекпоинте 14 промпт получает данные с шага 1, но
 * инструкции LLM требуют делать акцент на динамике с предыдущего чекпоинта
 * (8-14 относительно 1-7). На 21 — три недели. На финале — целая программа.
 *
 * Промпт лёгче финального (1500-2500 знаков, 5 секций). Кэширование — в
 * `user_program_checkpoint_summaries` с unique constraint на
 * (userProgramId, checkpointStep), повторный вызов с force=false возвращает
 * существующий отчёт мгновенно.
 */

const CHECKPOINT_HEADINGS = {
  whatHappened: '## Что произошло на этом отрезке',
  dynamics: '## Динамика состояния',
  voices: '## Что я слышу в твоих словах',
  accent: '## Один акцент',
  next: '## Что попробуем дальше',
} as const;

// Человеческая метка контрольной точки. Намеренно избегаем «неделя 1/2/3» —
// у юзера может пройти 3 дня или месяц, привязка ко времени некорректна.
const CHECKPOINT_LABELS: Record<number, string> = {
  7: 'первая контрольная точка',
  14: 'вторая контрольная точка',
  21: 'третья контрольная точка',
  30: 'финал программы',
};

const PROGRAM_METHODOLOGY: Record<string, string> = {
  calm_anxiety_30:
    'CBT (Beck, 1979): дыхание 4-7-8 / 5-4-3-2-1 заземление / СТОП-пауза / когнитивная переоценка',
  self_kindness_21:
    'Self-Compassion (Neff, 2003), ACT-дефузия (Hayes, 2006), Loving-Kindness Meditation (Salzberg, 2002), CFT (Gilbert, 2009)',
};

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
 * Превращает CollectedUserSignals в CheckpointStructuredData — формат,
 * который сохраняется в БД и отдаётся фронту для рендера ApexCharts
 * (anxietyTimeline, moodTimeline) и KPI-карточек (metrics).
 */
function buildStructuredData(params: {
  signals: CollectedUserSignals;
  weeklyAnswerForCheckpoint:
    | CollectedUserSignals['weeklyCheckAnswers'][number]
    | null;
  periodStart: Date;
  periodEnd: Date;
}): CheckpointStructuredData {
  return {
    anxietyTimeline: params.signals.anxietyTimeline,
    moodTimeline: params.signals.moodTimeline,
    weeklyCheckAnswer: params.weeklyAnswerForCheckpoint
      ? {
          anxiety: params.weeklyAnswerForCheckpoint.anxiety,
          mainChange: params.weeklyAnswerForCheckpoint.mainChange,
          mainChangeIds: params.weeklyAnswerForCheckpoint.mainChangeIds,
          supportNeed: params.weeklyAnswerForCheckpoint.supportNeed,
        }
      : null,
    topChips: params.signals.reflectionChipsTop3.map((label) => ({
      label,
      count: 0, // Count теряется в slice — для отображения в UI нам важен порядок.
    })),
    structuredFormHighlights: params.signals.structuredFormHighlights,
    metrics: params.signals.metrics,
    periodStart: params.periodStart.toISOString(),
    periodEnd: params.periodEnd.toISOString(),
  };
}

function formatAnxietyLine(
  timeline: CollectedUserSignals['anxietyTimeline']
): string {
  if (timeline.length === 0) return '';
  return timeline
    .map((t) => `шаг ${t.stepNumber}: ${t.value}/${t.max}`)
    .join(', ');
}

function formatWeeklyAnswers(
  answers: CollectedUserSignals['weeklyCheckAnswers']
): string {
  if (answers.length === 0) return '';
  return answers
    .map((a) => {
      const anxStr = a.anxiety !== null ? `${a.anxiety}/10` : '—';
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

function formatQuotesForPrompt(
  highlights: CollectedUserSignals['structuredFormHighlights']
): string {
  if (highlights.length === 0) return '';
  return highlights
    .slice(0, 8)
    .map(
      (h) => `шаг ${h.stepNumber} (${h.formKind}/${h.fieldId}): «${h.quote}»`
    )
    .join('\n');
}

/**
 * Промпт для LLM. Короче финального (5 секций, 1500-2500 знаков).
 * Накопленный анализ — LLM ОБЯЗАН сравнить текущий период с предыдущим,
 * если есть weeklyCheckAnswers от ранних чекпоинтов.
 */
function buildCheckpointPrompt(params: {
  programTitle: string;
  programSlug: string;
  checkpointStep: number;
  weekNumber: number;
  isFinal: boolean;
  signals: CollectedUserSignals;
  userGender: 'male' | 'female';
}): { systemPrompt: string; userPrompt: string } {
  const genderLabel = params.userGender === 'female' ? 'женский' : 'мужской';
  const methodologyLine =
    PROGRAM_METHODOLOGY[params.programSlug] ||
    'CBT-обоснованная программа ментального здоровья';

  const sections: string[] = [];
  sections.push(
    `### Метрики периода\nЗавершено шагов: ${params.signals.metrics.stepsCompleted}. Записей в дневнике: ${params.signals.metrics.journalEntries}. AI-разговоров: ${params.signals.metrics.aiChatSessions}. Практик завершено: ${params.signals.metrics.practicesCompleted}.`
  );

  const anxLine = formatAnxietyLine(params.signals.anxietyTimeline);
  if (anxLine) {
    sections.push(`### Динамика тревоги (rating_scale)\n${anxLine}`);
  }

  const weeklyBlock = formatWeeklyAnswers(params.signals.weeklyCheckAnswers);
  if (weeklyBlock) {
    sections.push(
      `### Промежуточные отметки на контрольных точках (накопленно, для сравнения)\n${weeklyBlock}`
    );
  }

  if (params.signals.moodCheckinsCount > 0) {
    const last = params.signals.moodChange.after;
    const first = params.signals.moodChange.before;
    sections.push(
      `### Mood-трек\nОтметок настроения: ${params.signals.moodCheckinsCount}. Первая: ${first ?? '—'}, последняя: ${last ?? '—'}.`
    );
  }

  if (params.signals.journalSnippets.length > 0) {
    sections.push(
      `### Записи в дневнике (фрагменты)\n${params.signals.journalSnippets
        .slice(0, 4)
        .map((t, i) => `${i + 1}. ${t}`)
        .join('\n')}`
    );
  }

  const quotesBlock = formatQuotesForPrompt(
    params.signals.structuredFormHighlights
  );
  if (quotesBlock) {
    sections.push(`### Цитаты из практических форм\n${quotesBlock}`);
  }

  if (params.signals.reflectionChipsTop3.length > 0) {
    sections.push(
      `### Часто выбираемые формулировки в рефлексиях\n${params.signals.reflectionChipsTop3.join(' · ')}`
    );
  }

  const dataBlock =
    sections.length > 0
      ? sections.join('\n\n')
      : 'Дополнительных сигналов нет — ориентируйся на номер контрольной точки и методику.';

  const checkpointLabel =
    CHECKPOINT_LABELS[params.checkpointStep] ?? 'промежуточная точка';

  const accumulatedHint =
    params.weekNumber > 1
      ? `\n\n**Накопленный анализ.** Это уже ${params.weekNumber}-я промежуточная точка пути. Контекст включает данные с самого начала программы, но твоя задача — сделать акцент на динамике именно за последний отрезок (с шага ${params.checkpointStep - 6} по ${params.checkpointStep}) по сравнению с предыдущими отметками. Если в «Промежуточные отметки» есть данные ранних точек, ОБЯЗАТЕЛЬНО сравни числа («на первой точке тревога была 8/10, сейчас — 6/10, разница...»). НЕ привязывайся ко времени («за неделю», «за месяц»): у разных пользователей путь идёт с разной скоростью.`
      : '';

  const userPrompt = `Тебе нужно написать **короткую промежуточную сводку** по пройденному отрезку программы «${params.programTitle}» (slug: ${params.programSlug}). Это контрольная точка после шага ${params.checkpointStep} (${checkpointLabel}), не финальный отчёт. Объём 1500-2500 символов.

**Методика программы:** ${methodologyLine}.${accumulatedHint}

**ВАЖНО — про время:** НЕ пиши «за неделю», «недельный разбор», «на этой неделе». У разных пользователей этот отрезок может занять и три дня, и месяц. Используй нейтральные формулировки: «на этом отрезке», «с прошлой контрольной точки», «за пройденные шаги», «между шагами X и Y».

**ВАЖНО — про пол:** Пол пользователя — ${genderLabel}. Все родовые формы в обращении («ты прошёл/прошла», «ты сделал/сделала», «ты записал/записала») должны соответствовать этому полу. Запрещены формы с альтернативами в скобках (например, «сделал(а)»).

**ВАЖНО — про цитаты пользователя:** Среди записей в дневнике и структурированных формах могут быть очень короткие, бессмысленные или случайные тексты (юзер мог пропустить или ввести случайные символы). Цитируй только осмысленные фрагменты: минимум 4 слова, связная фраза, не повторяющиеся буквы. Если все цитаты выглядят случайными — пропусти их и сосредоточься на наблюдаемом поведении (что юзер прошёл, какие практики, mood-отметки), не пытаясь выдать бессмыслицу за инсайт.

**Данные пользователя:**

${dataBlock}

**Обязательная структура (ровно эти 5 заголовков, в этом порядке, ровно с этими формулировками):**

${CHECKPOINT_HEADINGS.whatHappened}
Один-два абзаца (3-5 предложений). Что пользователь делал и что замечал на пройденном отрезке. Не сухой пересказ метрик — назови 1-2 живых момента из journal/structured_form цитат, если они осмысленные. Если осмысленных цитат нет — опиши, какой материал этого отрезка был и что обычно за ним стоит.

${CHECKPOINT_HEADINGS.dynamics}
Один абзац (3-4 предложения). ОБЯЗАТЕЛЬНО используй числа из «Динамика тревоги» и «Промежуточные отметки», если они есть. Конкретно: «на первой отметке тревога была 7/10, на этой — 5/10». Если данных мало — отметь это спокойно, без давления. Если это не первая точка — сравни числа с предыдущим чекпоинтом, без слова «неделя».

${CHECKPOINT_HEADINGS.voices}
Один-два абзаца. Цитаты только если они осмысленные (см. правила выше). Если есть — приводи в кавычках «...» с привязкой к шагу. Если нет — пиши, что записей на бумаге было мало, и это тоже сигнал (бывает, когда ресурс на минимуме).

${CHECKPOINT_HEADINGS.accent}
Один абзац (2-3 предложения). ОДНА конкретная вещь, на которую стоит обратить внимание дальше. Не «попробуй разное», а «попробуй технику X в момент Y». Опирайся на методику программы.

${CHECKPOINT_HEADINGS.next}
Маркированный список из 2-3 пунктов. Что попробовать на следующих шагах программы. Каждый пункт — конкретное действие с привязкой к моменту дня или ситуации («утром перед задачей», «когда заметишь напряжение в плечах»).

**Правила тона:**
- Это короткая промежуточная сводка, не итог программы. Тон тёплый и сдержанный.
- Длина 1500-2500 символов с разметкой.
- Верни ТОЛЬКО markdown, без префиксов вроде «Вот разбор:» или кавычек вокруг.

${STYLE_RULES_PROMPT_BLOCK}`;

  const systemPrompt = `Ты — клинический психотерапевт с 15+ лет практики. Специализация — доказательная психотерапия (CBT, ACT, MBSR, CFT, Self-Compassion, IFS). Ты пишешь короткие промежуточные разборы пройденных отрезков программы ментального здоровья для своих клиентов. Стиль — структурированный markdown на 1500-2500 символов, конкретный, с цитатами из данных пользователя (только осмысленных), без коучингового пафоса и без привязки ко времени («неделя», «месяц»). Тон тёплый, но профессиональный. ВАЖНО: пиши только простым русским языком. Не используй в тексте для пользователя англоязычные термины, аббревиатуры и профжаргон (например «Loving-Kindness Meditation», «mindfulness», «CBT», «grounding»): называй практику и понятие по-русски своими словами, при необходимости коротко поясняй смысл. Пользователь — обычный человек без психологической подготовки.`;

  return { systemPrompt, userPrompt };
}

async function generateCheckpointLlmText(params: {
  programTitle: string;
  programSlug: string;
  checkpointStep: number;
  weekNumber: number;
  isFinal: boolean;
  signals: CollectedUserSignals;
  userGender: 'male' | 'female';
}): Promise<{ text: string | null; modelUsed: string | null }> {
  const { systemPrompt, userPrompt } = buildCheckpointPrompt(params);
  try {
    const result = await chatWithFallback({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const text = (result.content || '').trim().replace(/^["«]|["»]$/g, '');
    if (!text || text.length < 400) {
      return { text: null, modelUsed: null };
    }
    if (!text.includes('## ')) return { text: null, modelUsed: null };
    return {
      text: text.slice(0, 4000),
      modelUsed: (result as { modelUsed?: string }).modelUsed ?? null,
    };
  } catch (error) {
    console.error('[garden-checkpoint-summary] llm failed:', error);
    return { text: null, modelUsed: null };
  }
}

/**
 * Fallback-текст когда LLM упал. Сохраняет 5-секционную структуру.
 * Цитат и числовых сравнений нет, но юзер увидит осмысленный текст,
 * а не «попробуйте позже».
 */
function buildCheckpointFallback(params: {
  weekNumber: number;
  signals: CollectedUserSignals;
  userGender: 'male' | 'female';
}): string {
  const didMasc = params.userGender === 'female' ? 'сделала' : 'сделал';
  const reachedMasc = params.userGender === 'female' ? 'дошла' : 'дошёл';
  const stepsLine =
    params.signals.metrics.stepsCompleted > 0
      ? `За пройденный отрезок ты ${didMasc} ${params.signals.metrics.stepsCompleted} шагов`
      : `Ты ${reachedMasc} до контрольной точки программы`;
  return `${CHECKPOINT_HEADINGS.whatHappened}

${stepsLine}. Каждый шаг — это маленькая практика и заметка для себя. Этого достаточно, чтобы система навыков начала складываться.

${CHECKPOINT_HEADINGS.dynamics}

Динамика чувств обычно не идёт по прямой. Какие-то дни проще, какие-то труднее, и это часть процесса, а не ошибка. Полезно отмечать тревогу регулярно, чтобы видеть тренд, а не одну точку.

${CHECKPOINT_HEADINGS.voices}

Запись своих мыслей в дневнике или коротких рефлексиях — это уже работа. Даже одна-две фразы помогают мозгу обработать опыт.

${CHECKPOINT_HEADINGS.accent}

Главное дальше — продолжать в спокойном темпе и замечать маленькие сдвиги, не дожидаясь больших.

${CHECKPOINT_HEADINGS.next}

- Делай один короткий приём из пройденных шагов каждый день, даже минуту.
- Перед сном отмечай одно наблюдение про себя за день.
- Если в моменте трудно, возвращайся к технике, которая больше всего откликнулась с прошлой контрольной точки.`;
}

/**
 * Главная точка входа: генерирует или возвращает существующий чекпоинт-отчёт.
 *
 * Идемпотентность: при `force=false` (по умолчанию) и наличии готовой записи
 * со статусом `ready` — возвращает её. С `force=true` пересоздаёт.
 *
 * Используется и хендлером POST /api/programs/:slug/checkpoint-summary
 * (с фронта после weekly_check), и при первом запросе GET .../timeline,
 * если запись ещё не создана (lazy generation).
 */
export async function generateCheckpointSummary(params: {
  userId: number;
  userProgramId: number;
  checkpointStep: number;
  force?: boolean;
}): Promise<{
  id: number;
  summaryText: string;
  structuredData: CheckpointStructuredData;
  generated: boolean;
  status: 'ready' | 'failed';
}> {
  const allowedSteps = [7, 14, 21, 30];
  if (!allowedSteps.includes(params.checkpointStep)) {
    const err = new Error(
      `Invalid checkpoint step: ${params.checkpointStep}. Allowed: 7, 14, 21, 30`
    );
    (err as Error & { code?: string }).code = 'E_VALIDATION';
    throw err;
  }

  const [userProgramRow] = await db
    .select({
      id: userPrograms.id,
      userId: userPrograms.userId,
      programId: userPrograms.programId,
      startedAt: userPrograms.startedAt,
      completedAt: userPrograms.completedAt,
    })
    .from(userPrograms)
    .where(
      and(
        eq(userPrograms.id, params.userProgramId),
        eq(userPrograms.userId, params.userId)
      )
    )
    .limit(1);

  if (!userProgramRow) {
    const err = new Error('UserProgram not found');
    (err as Error & { code?: string }).code = 'E_NOT_FOUND';
    throw err;
  }

  // programRow, кэш-проверка, signals и gender не зависят друг от друга
  // (все зависят только от userProgramRow) — запрашиваем параллельно.
  const [programRow, existingRows, signals, userGender] = await Promise.all([
    db
      .select({ slug: programs.slug, title: programs.title })
      .from(programs)
      .where(eq(programs.id, userProgramRow.programId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    params.force
      ? Promise.resolve([] as typeof userProgramCheckpointSummaries.$inferSelect[])
      : db
          .select()
          .from(userProgramCheckpointSummaries)
          .where(
            and(
              eq(
                userProgramCheckpointSummaries.userProgramId,
                userProgramRow.id
              ),
              eq(
                userProgramCheckpointSummaries.checkpointStep,
                params.checkpointStep
              )
            )
          )
          .limit(1),
    // Собираем сигналы за всю программу — контекст для накопленного анализа.
    collectUserSignalsForProgram({
      userId: params.userId,
      userProgramId: userProgramRow.id,
      programStartedAt: userProgramRow.startedAt,
      programCompletedAt: userProgramRow.completedAt,
      periodFromStep: 1,
    }),
    getUserGender(params.userId),
  ]);

  if (!programRow) {
    const err = new Error('Program not found');
    (err as Error & { code?: string }).code = 'E_NOT_FOUND';
    throw err;
  }

  // Кэш: вернём существующую готовую запись (existingRows загружены параллельно).
  const existing = Array.isArray(existingRows) ? existingRows[0] : undefined;
  if (!params.force && existing && existing.generationStatus === 'ready') {
    return {
      summaryText: existing.summaryText,
      structuredData: existing.structuredData,
      generated: false,
      status: 'ready',
    };
  }

  const isFinal = params.checkpointStep === 30;
  const weekNumber = Math.ceil(params.checkpointStep / 7); // 1, 2, 3, 4

  // weeklyCheckAnswer этого конкретного чекпоинта — для UI (KPI-карточки).
  const weeklyAnswerForCheckpoint =
    signals.weeklyCheckAnswers.find(
      (a) => a.stepNumber === params.checkpointStep
    ) ?? null;

  const llm = await generateCheckpointLlmText({
    programTitle: programRow.title,
    programSlug: programRow.slug,
    checkpointStep: params.checkpointStep,
    weekNumber,
    isFinal,
    signals,
    userGender,
  });

  const summaryText =
    llm.text ?? buildCheckpointFallback({ weekNumber, signals, userGender });

  const structuredData = buildStructuredData({
    signals,
    weeklyAnswerForCheckpoint,
    periodStart: userProgramRow.startedAt,
    periodEnd: userProgramRow.completedAt ?? new Date(),
  });

  const status: 'ready' | 'failed' = llm.text ? 'ready' : 'failed';

  // Upsert: уникальный constraint на (userProgramId, checkpointStep).
  // RETURNING id для дальнейшего mark-viewed/push.
  const inserted = await db
    .insert(userProgramCheckpointSummaries)
    .values({
      userId: params.userId,
      userProgramId: userProgramRow.id,
      programSlug: programRow.slug,
      checkpointStep: params.checkpointStep,
      kind: isFinal ? 'final' : 'weekly',
      summaryText,
      structuredData,
      modelUsed: llm.modelUsed,
      generationStatus: status,
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
        modelUsed: llm.modelUsed,
        generationStatus: status,
        updatedAt: new Date(),
      },
    })
    .returning({ id: userProgramCheckpointSummaries.id });

  const reportId = inserted[0]?.id ?? 0;

  // Fire-and-forget push: только для успешно сгенерированных и только если
  // ещё не отправляли. Внутри dispatch стоит идемпотентная защита.
  if (status === 'ready' && reportId > 0) {
    void dispatchReportReadyPush({
      userId: params.userId,
      reportId,
      programTitle: programRow.title,
      programSlug: programRow.slug,
      checkpointStep: params.checkpointStep,
      kind: isFinal ? 'final' : 'weekly',
    });
  }

  return {
    id: reportId,
    summaryText,
    structuredData,
    generated: true,
    status,
  };
}

/**
 * Получение одного чекпоинт-отчёта (для polling после weekly_check).
 * Возвращает null если ещё не создан.
 */
export async function getCheckpointSummary(params: {
  userId: number;
  userProgramId: number;
  checkpointStep: number;
}): Promise<{
  summaryText: string;
  structuredData: CheckpointStructuredData;
  status: 'pending' | 'ready' | 'failed';
} | null> {
  const [row] = await db
    .select()
    .from(userProgramCheckpointSummaries)
    .where(
      and(
        eq(userProgramCheckpointSummaries.userProgramId, params.userProgramId),
        eq(userProgramCheckpointSummaries.checkpointStep, params.checkpointStep)
      )
    )
    .limit(1);
  if (!row) return null;
  // Дополнительная проверка userId (защита от смены сессии).
  if (row.userId !== params.userId) return null;
  return {
    summaryText: row.summaryText,
    structuredData: row.structuredData,
    status: row.generationStatus,
  };
}

/**
 * Все чекпоинт-отчёты программы — для timeline-UI в Оранжерее.
 * Сортировка по checkpointStep ASC (Week 1 → Week 2 → Week 3 → Финал).
 */
export async function getCheckpointSummaries(params: {
  userId: number;
  userProgramId: number;
}): Promise<
  Array<{
    id: number;
    checkpointStep: number;
    kind: 'weekly' | 'final';
    summaryText: string;
    structuredData: CheckpointStructuredData;
    status: 'pending' | 'ready' | 'failed';
    generatedAt: string;
    viewedAt: string | null;
  }>
> {
  const rows = await db
    .select()
    .from(userProgramCheckpointSummaries)
    .where(
      and(
        eq(userProgramCheckpointSummaries.userProgramId, params.userProgramId),
        eq(userProgramCheckpointSummaries.userId, params.userId)
      )
    )
    .orderBy(asc(userProgramCheckpointSummaries.checkpointStep));
  return rows.map((r) => ({
    id: r.id,
    checkpointStep: r.checkpointStep,
    kind: r.kind,
    summaryText: r.summaryText,
    structuredData: r.structuredData,
    status: r.generationStatus,
    generatedAt: r.generatedAt.toISOString(),
    viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null,
  }));
}
