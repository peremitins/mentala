import type {
  AssessmentDefinition,
  AssessmentListItem,
} from '@/shared/dto/assessments';
import { AssessmentDefinitionDto } from '@/shared/dto/assessments';
export { ASSESSMENTS_FEATURE_KEY } from '@/shared/constants/assessments';

const sharedAnxietyComparisonCopy = {
  comparisonImprovedText:
    'Ниже, чем в прошлый раз. Ответы выглядят спокойнее: тревога меньше забирала внимание и силы.',
  comparisonWorseText:
    'Выше, чем в прошлый раз. Это не провал: тревога часто усиливается на фоне нагрузки, усталости или важных событий.',
  comparisonStableText:
    'Почти без изменений. Это тоже важное наблюдение: сейчас тревога держится примерно на том же уровне.',
};

const anxietyCheckV1 = AssessmentDefinitionDto.parse({
  slug: 'anxiety_check_v1',
  version: 1,
  status: 'active',
  title: 'Оценка тревоги',
  shortTitle: 'Тревога',
  description:
    'Короткий опросник для самонаблюдения: помогает заметить, насколько тревога была выражена в последнее время. Это не диагноз и не оценка личности.',
  category: 'anxiety',
  linkedProgramSlug: 'calm_anxiety_30',
  linkedProgramTitle: 'Спокойствие',
  estimatedMinutes: 2,
  timeframeLabel: 'за последние 2 недели',
  // Вопросы и варианты ответов — валидированная шкала GAD-7 (Spitzer et al., 2006).
  // Формулировки и подсчёт сохранены в исходном клиническом виде. В UI результат
  // подаётся как самонаблюдение, без слов «диагноз»/«расстройство».
  isValidatedScale: true,
  sourceName: 'GAD-7',
  licenseNote:
    'GAD-7 (Spitzer R.L., Kroenke K., Williams J.B.W. et al., 2006). Опросник свободен для воспроизведения, перевода и распространения без разрешения и платы.',
  scoreDirection: 'higher_is_worse',
  scoring: {
    method: 'sum',
    minScore: 0,
    maxScore: 21,
  },
  // Стандартная шкала ответов GAD-7: каждый вариант = 0..3 балла.
  options: [
    { id: 'not_at_all', label: 'Совсем нет', value: 0 },
    { id: 'several_days', label: 'Несколько дней', value: 1 },
    { id: 'more_than_half_days', label: 'Более половины дней', value: 2 },
    { id: 'nearly_every_day', label: 'Почти каждый день', value: 3 },
  ],
  // 7 пунктов GAD-7 в валидированной русской формулировке. Порядок и смысл
  // соответствуют оригиналу; подсчёт — простая сумма 0..21.
  questions: [
    {
      id: 'gad7_nervous',
      text: 'Чувство нервозности, тревоги или взвинченности',
      required: true,
    },
    {
      id: 'gad7_uncontrollable_worry',
      text: 'Неспособность остановить беспокойство или контролировать его',
      required: true,
    },
    {
      id: 'gad7_excessive_worry',
      text: 'Чрезмерное беспокойство по разным поводам',
      required: true,
    },
    {
      id: 'gad7_trouble_relaxing',
      text: 'Трудности с расслаблением',
      required: true,
    },
    {
      id: 'gad7_restless',
      text: 'Такое сильное беспокойство, что трудно усидеть на месте',
      required: true,
    },
    {
      id: 'gad7_irritable',
      text: 'Раздражительность или вспыльчивость',
      required: true,
    },
    {
      id: 'gad7_afraid',
      text: 'Чувство страха, как будто может произойти что-то ужасное',
      required: true,
    },
  ],
  resultBands: [
    {
      id: 'low',
      minScore: 0,
      maxScore: 4,
      title: 'Сейчас тревоги совсем немного',
      shortText:
        'Ответы показывают, что тревога сейчас почти не мешает обычным делам.',
      description:
        'Это хороший спокойный результат. Он не означает, что тревоги нет совсем, но сейчас она выглядит управляемой и не занимает много места.',
      recommendationText:
        'Можно продолжить в программе «Спокойствие»: собрать короткие практики на дни, когда напряжения станет больше.',
      programReportText:
        'По результатам опросника, тревога почти не мешала. Программа помогает заранее собрать практики, которые пригодятся в напряжённые дни.',
      ...sharedAnxietyComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'calm_anxiety_30',
        label: 'Перейти к саду «Спокойствие»',
      },
    },
    {
      id: 'mild',
      minScore: 5,
      maxScore: 9,
      title: 'Тревога иногда даёт о себе знать',
      shortText:
        'Ответы показывают, что тревога появляется и может иногда мешать расслабиться, сосредоточиться или спокойно действовать.',
      description:
        'Это не диагноз. Такой результат говорит, что тревога появляется, но с ней уже можно работать маленькими шагами: через дыхание, заземление, проверку тревожных мыслей и возвращение к обычным действиям.',
      recommendationText:
        'В программе «Спокойствие» есть короткие практики без давления и без требования делать всё идеально.',
      programReportText:
        'По результатам опросника, тревога иногда давала о себе знать. Программа помогает замечать её раньше и возвращаться к себе спокойнее.',
      ...sharedAnxietyComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'calm_anxiety_30',
        label: 'Перейти к саду «Спокойствие»',
      },
    },
    {
      id: 'moderate',
      minScore: 10,
      maxScore: 14,
      title: 'Тревога сейчас заметно мешает',
      shortText:
        'Ответы показывают, что тревога может занимать много внимания и мешать обычным делам.',
      description:
        'Это не диагноз. Такой результат говорит, что сейчас важно снизить давление на себя и чаще возвращаться к простым действиям, которые помогают телу и вниманию успокоиться.',
      recommendationText:
        'Программа «Спокойствие» хорошо подходит для такого состояния. Начни с короткой практики, которая помогает немного выдохнуть и вернуть опору.',
      programReportText:
        'По результатам опросника, тревога занимала заметное место. Программа помогает сначала стабилизироваться, а потом постепенно возвращаться к обычным делам.',
      ...sharedAnxietyComparisonCopy,
      safetyLevel: 'watch',
      nextAction: {
        type: 'program',
        slug: 'calm_anxiety_30',
        label: 'Перейти к саду «Спокойствие»',
      },
    },
    {
      id: 'high',
      minScore: 15,
      maxScore: 21,
      title: 'Сейчас тревоги очень много',
      shortText:
        'Ответы показывают, что тревога сейчас может сильно утомлять и мешать повседневной жизни.',
      description:
        'Смотри на этот результат как на сигнал о высокой нагрузке, а не как на характеристику себя. Сейчас важнее не разбирать всё сразу, а сначала вернуть немного устойчивости: дыхание, тело, сон, еда, контакт с поддержкой.',
      recommendationText:
        'Начни с самой короткой практики стабилизации. Если тревога мешает спать, работать, общаться или тебе небезопасно, обратись за живой поддержкой в своём регионе.',
      programReportText:
        'По результатам опросника, тревога была сильно выражена. Программа начинается с простых способов стабилизации, без требования справиться со всем сразу.',
      ...sharedAnxietyComparisonCopy,
      safetyLevel: 'support',
      nextAction: {
        type: 'program',
        slug: 'calm_anxiety_30',
        label: 'Перейти к саду «Спокойствие»',
      },
    },
  ],
  lockedCopy: {
    title: 'Доступно в PRO',
    description: 'Прохождение и результат доступны при активной подписке.',
    ctaText: 'Открыть в PRO',
  },
});

const sharedSelfCompassionComparisonCopy = {
  comparisonImprovedText:
    'Лучше, чем в прошлый раз. В ответах стало больше тепла, терпения и поддержки к себе.',
  comparisonWorseText:
    'Ниже, чем в прошлый раз. Это не провал: когда много усталости или напряжения, к себе часто становишься строже.',
  comparisonStableText:
    'Почти без изменений. Это тоже важное наблюдение: сейчас отношение к себе держится примерно на том же уровне.',
};

// Валидированная шкала самосострадания: Self-Compassion Scale–Short Form
// (Raes, Pommier, Neff & Van Gucht, 2011). 12 пунктов, 6 субшкал (по 2 пункта),
// шкала ответов 1..5, негативные субшкалы (Self-Judgment, Isolation,
// Over-Identification) считаются в обратную сторону. Свободна для любого
// использования при указании авторства (Neff, 2003). Основной тест сада
// «Доброта к себе» — заменил продуктовый self_kindness_v1.
const selfCompassionScsSfV1 = AssessmentDefinitionDto.parse({
  slug: 'self_compassion_scs_sf_v1',
  version: 1,
  status: 'active',
  title: 'Оценка доброты к себе',
  shortTitle: 'Доброта к себе',
  description:
    'Короткий опросник о том, как ты обычно относишься к себе в трудные моменты: после ошибки, усталости или неудачи. Помогает заметить, насколько сейчас доступны тепло и поддержка к себе. Это не диагноз и не оценка личности.',
  category: 'self_kindness',
  linkedProgramSlug: 'self_kindness_21',
  linkedProgramTitle: 'Доброта к себе',
  estimatedMinutes: 3,
  timeframeLabel: 'в трудные моменты',
  // Формулировки и подсчёт — в исходном валидированном виде SCS-SF.
  isValidatedScale: true,
  sourceName: 'SCS-SF',
  licenseNote:
    'Self-Compassion Scale–Short Form (Raes F., Pommier E., Neff K.D., Van Gucht D., 2011). Свободно для любого использования при указании авторства (Neff, 2003).',
  scoreDirection: 'higher_is_better',
  scoring: {
    method: 'sum_with_reverse',
    minScore: 12,
    maxScore: 60,
  },
  // Стандартная шкала ответов SCS: 1 (почти никогда) .. 5 (почти всегда).
  options: [
    { id: 'almost_never', label: 'Почти никогда', value: 1 },
    { id: 'rarely', label: 'Редко', value: 2 },
    { id: 'sometimes', label: 'Иногда', value: 3 },
    { id: 'often', label: 'Часто', value: 4 },
    { id: 'almost_always', label: 'Почти всегда', value: 5 },
  ],
  // 12 пунктов SCS-SF в русской формулировке. reverseScored — негативные
  // субшкалы (самоосуждение, изоляция, чрезмерное отождествление).
  questions: [
    {
      id: 'scs_overidentified_inadequacy',
      text: 'Когда что-то важное не получается, меня охватывает чувство собственной несостоятельности',
      required: true,
      reverseScored: true,
    },
    {
      id: 'scs_kindness_understanding',
      text: 'Я стараюсь относиться с пониманием и терпением к тем чертам своего характера, которые мне не нравятся',
      required: true,
    },
    {
      id: 'scs_mindful_balanced_view',
      text: 'Когда случается что-то болезненное, я стараюсь смотреть на ситуацию уравновешенно',
      required: true,
    },
    {
      id: 'scs_isolation_others_happier',
      text: 'Когда мне тяжело, мне обычно кажется, что большинству других людей живётся легче, чем мне',
      required: true,
      reverseScored: true,
    },
    {
      id: 'scs_humanity_part_of_life',
      text: 'Я стараюсь воспринимать свои недостатки как часть общечеловеческого опыта',
      required: true,
    },
    {
      id: 'scs_kindness_caring_tenderness',
      text: 'В очень трудные периоды я отношусь к себе с заботой и теплотой, в которых нуждаюсь',
      required: true,
    },
    {
      id: 'scs_mindful_keep_balance',
      text: 'Когда что-то меня расстраивает, я стараюсь сохранять равновесие в своих чувствах',
      required: true,
    },
    {
      id: 'scs_isolation_alone_in_failure',
      text: 'Когда я терплю неудачу в важном для меня деле, я обычно чувствую себя {одиноким|одинокой} в своей неудаче',
      required: true,
      reverseScored: true,
    },
    {
      id: 'scs_overidentified_fixate',
      text: 'Когда мне плохо, я {склонен|склонна} зацикливаться на всём, что идёт не так',
      required: true,
      reverseScored: true,
    },
    {
      id: 'scs_humanity_shared_feelings',
      text: 'Когда я чувствую себя в чём-то {несостоятельным|несостоятельной}, я стараюсь напоминать себе, что такое чувство знакомо большинству людей',
      required: true,
    },
    {
      id: 'scs_judgment_disapproving',
      text: 'Я осуждаю себя и критично отношусь к собственным слабостям и недостаткам',
      required: true,
      reverseScored: true,
    },
    {
      id: 'scs_judgment_intolerant',
      text: 'Я {нетерпим|нетерпима} и {нетерпелив|нетерпелива} к тем чертам своего характера, которые мне не нравятся',
      required: true,
      reverseScored: true,
    },
  ],
  // Диапазоны по клинической интерпретации Нефф: средний балл 1.0–2.5 — низкое
  // самосострадание, 2.5–3.5 — среднее, 3.5–5.0 — высокое. В сумме по 12 пунктам
  // это 12–29 / 30–41 / 42–60.
  resultBands: [
    {
      id: 'low',
      minScore: 12,
      maxScore: 29,
      title: 'Сейчас больше строгости к себе',
      shortText:
        'Ответы показывают, что в трудные моменты внутренней критики больше, чем тепла и поддержки.',
      description:
        'Это не диагноз и не оценка личности. Часто так бывает, когда долго живёшь в напряжении или привык требовать от себя слишком много. Более тёплое отношение к себе можно постепенно развивать.',
      recommendationText:
        'В программе «Доброта к себе» начни с самого маленького: заметить внутреннего критика, сделать паузу и найти одну фразу, которая звучит хотя бы чуть мягче.',
      programReportText:
        'На старте ответы показывали больше строгости к себе. Программа помогает сначала замечать внутреннего критика, а потом постепенно добавлять больше тепла и поддержки.',
      ...sharedSelfCompassionComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'self_kindness_21',
        label: 'Начать сад «Доброта к себе»',
      },
    },
    {
      id: 'moderate',
      minScore: 30,
      maxScore: 41,
      title: 'Иногда получается быть к себе мягче',
      shortText:
        'Ответы показывают, что иногда ты относишься к себе спокойнее и теплее, но в сложные моменты критика всё ещё может перевешивать.',
      description:
        'Это хорошая точка для роста. Тёплое отношение к себе обычно складывается из маленьких моментов: остановиться, заметить свой тон и ответить себе чуть мягче.',
      recommendationText:
        'Программа «Доброта к себе» поможет сделать поддержку к себе понятнее и устойчивее в обычной жизни.',
      programReportText:
        'По результатам опросника, в трудные моменты тепло к себе появлялось не всегда. Программа помогает мягче реагировать на ошибки, усталость и напряжение.',
      ...sharedSelfCompassionComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'self_kindness_21',
        label: 'Перейти к саду «Доброта к себе»',
      },
    },
    {
      id: 'high',
      minScore: 42,
      maxScore: 60,
      title: 'Ты уже умеешь быть к себе теплее',
      shortText:
        'Ответы показывают, что в трудные моменты тебе часто удаётся отнестись к себе тепло и без лишней строгости.',
      description:
        'Это сильный результат. Он не означает, что трудных дней не бывает, но показывает: у тебя уже есть способы не превращать ошибку, усталость или неудачу в атаку на себя.',
      recommendationText:
        'Программа «Доброта к себе» поможет закрепить этот результат и собрать личные способы поддержки для дней, когда напряжения больше.',
      programReportText:
        'По результатам опросника, тёплое отношение к себе уже хорошо выражено. Программа помогает сохранить это в дни, когда больше усталости, давления или тревоги.',
      ...sharedSelfCompassionComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'self_kindness_21',
        label: 'Закрепить результат в саде',
      },
    },
  ],
  lockedCopy: {
    title: 'Доступно в PRO',
    description: 'Прохождение и результат доступны при активной подписке.',
    ctaText: 'Открыть в PRO',
  },
});

function futureAssessment(params: {
  slug: string;
  title: string;
  shortTitle: string;
  category: AssessmentDefinition['category'];
  linkedProgramSlug: string;
  linkedProgramTitle: string;
  description: string;
}): AssessmentDefinition {
  return AssessmentDefinitionDto.parse({
    ...params,
    version: 1,
    status: 'coming_soon',
    estimatedMinutes: 2,
    timeframeLabel: 'будущий сад',
    isValidatedScale: false,
    sourceName: null,
    licenseNote: null,
    scoreDirection: 'custom',
    questions: [],
    options: [],
    scoring: {
      method: 'sum',
      minScore: 0,
      maxScore: 0,
    },
    resultBands: [],
    lockedCopy: {
      title: 'Откроется позже',
      description: 'Откроется вместе с будущим садом.',
      ctaText: 'Откроется позже',
    },
  });
}

export const ASSESSMENT_CATALOG: AssessmentDefinition[] = [
  anxietyCheckV1,
  selfCompassionScsSfV1,
  futureAssessment({
    slug: 'relationships_boundaries_v1',
    title: 'Оценка границ и общения',
    shortTitle: 'Границы',
    category: 'relationships',
    linkedProgramSlug: 'relationships_21',
    linkedProgramTitle: 'Отношения',
    description:
      'Будущий опросник будет связан с тем, как ты замечаешь свои границы и говоришь о важном.',
  }),
  futureAssessment({
    slug: 'stress_recovery_v1',
    title: 'Оценка стресса и восстановления',
    shortTitle: 'Восстановление',
    category: 'stress',
    linkedProgramSlug: 'burnout_recovery_21',
    linkedProgramTitle: 'Восстановление после перегрузки',
    description:
      'Будущий опросник поможет мягко отслеживать нагрузку, восстановление и запас сил.',
  }),
  futureAssessment({
    slug: 'sleep_check_v1',
    title: 'Оценка сна',
    shortTitle: 'Сон',
    category: 'sleep',
    linkedProgramSlug: 'gentle_sleep_21',
    linkedProgramTitle: 'Мягкий сон',
    description:
      'Будущий опросник будет связан с вечерним состоянием, отдыхом и качеством восстановления.',
  }),
];

export function getAssessmentDefinition(
  slug: string
): AssessmentDefinition | null {
  return ASSESSMENT_CATALOG.find((item) => item.slug === slug) ?? null;
}

export function toAssessmentListItem(
  assessment: AssessmentDefinition
): AssessmentListItem {
  return {
    slug: assessment.slug,
    version: assessment.version,
    status: assessment.status,
    title: assessment.title,
    shortTitle: assessment.shortTitle,
    description: assessment.description,
    category: assessment.category,
    linkedProgramSlug: assessment.linkedProgramSlug,
    linkedProgramTitle: assessment.linkedProgramTitle,
    estimatedMinutes: assessment.estimatedMinutes,
    timeframeLabel: assessment.timeframeLabel,
    scoreDirection: assessment.scoreDirection,
    lockedCopy: assessment.lockedCopy,
    questionsCount: assessment.questions.length,
  };
}

export function getAssessmentListItems(): AssessmentListItem[] {
  return ASSESSMENT_CATALOG.map(toAssessmentListItem);
}
