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
    'Короткая оценка состояния: помогает заметить, насколько тревога была выражена в последнее время. Это не диагноз и не оценка личности.',
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
        'По результатам оценки тревога почти не мешала. Программа помогает заранее собрать практики, которые пригодятся в напряжённые дни.',
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
        'По результатам оценки тревога иногда давала о себе знать. Программа помогает замечать её раньше и возвращаться к себе спокойнее.',
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
        'По результатам оценки тревога занимала заметное место. Программа помогает сначала стабилизироваться, а потом постепенно возвращаться к обычным делам.',
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
        'По результатам оценки тревога была сильно выражена. Программа начинается с простых способов стабилизации, без требования справиться со всем сразу.',
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
// «Внутренний критик» — заменил продуктовый self_kindness_v1.
const selfCompassionScsSfV1 = AssessmentDefinitionDto.parse({
  slug: 'self_compassion_scs_sf_v1',
  version: 1,
  status: 'active',
  title: 'Оценка внутреннего критика',
  shortTitle: 'Внутренний критик',
  description:
    'Короткая оценка того, как ты обычно относишься к себе в трудные моменты: после ошибки, усталости или неудачи. Помогает заметить, насколько сейчас доступны тепло и поддержка к себе. Это не диагноз и не оценка личности.',
  category: 'self_kindness',
  linkedProgramSlug: 'self_kindness_21',
  linkedProgramTitle: 'Внутренний критик',
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
        'В программе «Внутренний критик» начни с самого маленького: заметить жёсткий внутренний тон, сделать паузу и найти одну фразу, которая звучит хотя бы чуть мягче.',
      programReportText:
        'На старте ответы показывали больше строгости к себе. Программа помогает сначала замечать внутреннего критика, а потом постепенно добавлять больше тепла и поддержки.',
      ...sharedSelfCompassionComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'self_kindness_21',
        label: 'Начать сад «Внутренний критик»',
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
        'Программа «Внутренний критик» поможет сделать поддержку к себе понятнее и устойчивее в обычной жизни.',
      programReportText:
        'По результатам оценки в трудные моменты тепло к себе появлялось не всегда. Программа помогает мягче реагировать на ошибки, усталость и напряжение.',
      ...sharedSelfCompassionComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'self_kindness_21',
        label: 'Перейти к саду «Внутренний критик»',
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
        'Программа «Внутренний критик» поможет закрепить этот результат и собрать личные способы поддержки для дней, когда напряжения больше.',
      programReportText:
        'По результатам оценки тёплое отношение к себе уже хорошо выражено. Программа помогает сохранить это в дни, когда больше усталости, давления или тревоги.',
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

const sharedRelationshipsComparisonCopy = {
  comparisonImprovedText:
    'Выше, чем в прошлый раз. По ответам видно, что ясные просьбы, отказы и забота о своих пределах сейчас даются легче.',
  comparisonWorseText:
    'Ниже, чем в прошлый раз. Это не провал: на ответы могут влиять усталость, конфликт, нагрузка или конкретные события в отношениях.',
  comparisonStableText:
    'Почти без изменений. Это тоже важное наблюдение: навыки границ и общения сейчас держатся примерно на том же уровне.',
};

// Авторская оценка Mentala для сада «Отношения». Это не клиническая шкала:
// тексты намеренно остаются в рамке самонаблюдения, без диагностики и ярлыков.
const relationshipsBoundariesV1 = AssessmentDefinitionDto.parse({
  slug: 'relationships_boundaries_v1',
  version: 1,
  status: 'active',
  title: 'Оценка границ и общения',
  shortTitle: 'Границы и общение',
  description:
    'Короткая оценка помогает заметить, как сейчас получается говорить о своих потребностях, отказывать, просить о важном и сохранять контакт без давления на себя. Это не диагноз и не оценка твоих отношений.',
  category: 'relationships',
  linkedProgramSlug: 'relationships_21',
  linkedProgramTitle: 'Отношения',
  estimatedMinutes: 3,
  timeframeLabel: 'в последнее время',
  isValidatedScale: false,
  sourceName: null,
  licenseNote: null,
  scoreDirection: 'higher_is_better',
  scoring: {
    method: 'sum_with_reverse',
    minScore: 0,
    maxScore: 72,
  },
  options: [
    { id: 'almost_never', label: 'Почти никогда', value: 0 },
    { id: 'rarely', label: 'Редко', value: 1 },
    { id: 'sometimes', label: 'Иногда', value: 2 },
    { id: 'often', label: 'Часто', value: 3 },
    { id: 'almost_always', label: 'Почти всегда', value: 4 },
  ],
  questions: [
    {
      id: 'rb_notice_discomfort',
      text: 'Я замечаю, когда в общении мне становится некомфортно',
      required: true,
    },
    {
      id: 'rb_understand_needs',
      text: 'Мне обычно понятно, чего я хочу или не хочу в отношениях',
      required: true,
    },
    {
      id: 'rb_pause_before_reply',
      text: 'В напряжённом разговоре я могу взять паузу, чтобы понять, что со мной происходит',
      required: true,
    },
    {
      id: 'rb_say_no',
      text: 'Я могу сказать «нет», даже если человек расстроится или будет недоволен',
      required: true,
    },
    {
      id: 'rb_keep_no_without_excuses',
      text: 'После отказа я не ощущаю, что нужно долго оправдываться',
      required: true,
    },
    {
      id: 'rb_decline_when_no_resource',
      text: 'Я могу отказать человеку, если у меня сейчас нет сил, времени или желания',
      required: true,
    },
    {
      id: 'rb_ask_directly',
      text: 'Я могу прямо попросить о том, что для меня важно',
      required: true,
    },
    {
      id: 'rb_speak_need_early',
      text: 'Я могу сказать о важном до того, как накопится обида',
      required: true,
    },
    {
      id: 'rb_hide_needs',
      text: 'Я скрываю свои потребности, чтобы не казаться неудобным человеком',
      required: true,
      reverseScored: true,
    },
    {
      id: 'rb_speak_without_attack',
      text: 'Я могу говорить о том, что меня не устраивает, без нападения и обвинений',
      required: true,
    },
    {
      id: 'rb_explain_limits',
      text: 'Я могу спокойно объяснить, что для меня неприемлемо',
      required: true,
    },
    {
      id: 'rb_start_hard_conversation',
      text: 'Я могу начать важный разговор, даже если он может быть неприятным',
      required: true,
    },
    {
      id: 'rb_pressure_guilt',
      text: 'Когда на меня давят чувством вины, я чаще соглашаюсь, даже если не хочу',
      required: true,
      reverseScored: true,
    },
    {
      id: 'rb_overadapt',
      text: 'Я часто подстраиваюсь под других, даже если внутри не хочу этого',
      required: true,
      reverseScored: true,
    },
    {
      id: 'rb_take_responsibility_for_mood',
      text: 'Я ощущаю ответственность за настроение другого человека',
      required: true,
      reverseScored: true,
    },
    {
      id: 'rb_respect_other_no',
      text: 'Я стараюсь уважать чужой отказ, даже если мне неприятно его слышать',
      required: true,
    },
    {
      id: 'rb_accept_other_limits',
      text: 'Я стараюсь уважать границы другого человека, когда он говорит о них прямо',
      required: true,
    },
    {
      id: 'rb_request_without_pressure',
      text: 'Я могу просить о важном без давления, ультиматумов и попыток вызвать чувство вины',
      required: true,
    },
  ],
  resultBands: [
    {
      id: 'low',
      minScore: 0,
      maxScore: 23,
      title: 'Границы и общение сейчас даются трудно',
      shortText:
        'Ответы показывают, что сейчас может быть непросто говорить о своих потребностях, отказывать, выдерживать давление или начинать важные разговоры.',
      description:
        'Это не диагноз и не оценка твоих отношений. Такой результат означает только одно: тема границ сейчас требует бережного внимания. Часто трудность не в том, что человек слабый, а в том, что раньше приходилось подстраиваться, избегать конфликтов или угадывать чужие ожидания.',
      recommendationText:
        'Начни с маленьких шагов: замечать дискомфорт, называть свои потребности и тренировать короткий спокойный отказ без длинных оправданий.',
      programReportText:
        'Стартовая оценка показала, что границы и ясное общение сейчас даются трудно. В саде важно двигаться мягко: сначала замечать свои реакции, затем постепенно тренировать просьбы, отказы и спокойные разговоры о важном.',
      ...sharedRelationshipsComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'relationships_21',
        label: 'Перейти к саду «Отношения»',
      },
    },
    {
      id: 'moderate',
      minScore: 24,
      maxScore: 48,
      title: 'С границами и общением иногда получается',
      shortText:
        'Ответы показывают, что часть навыков уже доступна, но в напряжённых ситуациях может быть сложно говорить прямо, отказывать или не брать на себя лишнюю ответственность.',
      description:
        'Это не диагноз. Такой результат часто означает, что в спокойных отношениях границы удерживать легче, а при давлении, вине, страхе конфликта или сильной привязанности становится сложнее.',
      recommendationText:
        'Подойдёт сад «Отношения»: можно укреплять уже знакомые навыки и отдельно потренировать те ситуации, где сложнее всего говорить честно и спокойно.',
      programReportText:
        'Стартовая оценка показала, что с границами и общением уже кое-что получается. В саде пользователь укреплял ясность в просьбах, отказах, разговоре о потребностях и реакции на давление.',
      ...sharedRelationshipsComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'relationships_21',
        label: 'Продолжить сад «Отношения»',
      },
    },
    {
      id: 'high',
      minScore: 49,
      maxScore: 72,
      title: 'С границами и общением сейчас многое получается',
      shortText:
        'Ответы показывают, что тебе часто удаётся замечать свои пределы, говорить о важном, уважать чужой отказ и не давить на себя лишний раз.',
      description:
        'Это не оценка идеальности отношений. Даже при хорошем результате могут оставаться отдельные ситуации, где сложно сказать «нет», попросить о помощи или выдержать чужое недовольство.',
      recommendationText:
        'Сад «Отношения» можно пройти как способ закрепить навыки и сделать их устойчивее в более напряжённых разговорах.',
      programReportText:
        'Стартовая оценка показала, что с границами и общением в целом уже многое получается. В саде можно использовать практики для закрепления и более уверенного применения этих навыков в сложных разговорах.',
      ...sharedRelationshipsComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'relationships_21',
        label: 'Перейти к саду «Отношения»',
      },
    },
  ],
  lockedCopy: {
    title: 'Доступно в PRO',
    description: 'Прохождение и результат доступны при активной подписке.',
    ctaText: 'Открыть в PRO',
  },
});

const sharedBurnoutComparisonCopy = {
  comparisonImprovedText:
    'Ниже, чем в прошлый раз. Это не медицинский вывод, но по ответам видно, что истощение сейчас занимает меньше места.',
  comparisonWorseText:
    'Выше, чем в прошлый раз. Это не провал: на истощение могут влиять нагрузка, сон, здоровье, конфликты и события последних дней.',
  comparisonStableText:
    'Почти без изменений. Это тоже важное наблюдение: иногда сначала меняется не общий балл, а способность раньше замечать усталость и делать паузу.',
};

const burnoutCbiV1 = AssessmentDefinitionDto.parse({
  slug: 'burnout_cbi_v1',
  version: 1,
  status: 'coming_soon',
  title: 'Оценка выгорания и перегрузки',
  shortTitle: 'Выгорание',
  description:
    'Оценка помогает заметить, насколько в последнее время были выражены усталость, истощение и перегрузка от работы, учёбы или регулярного взаимодействия с людьми. Это не диагноз и не медицинское заключение.',
  category: 'burnout',
  linkedProgramSlug: 'burnout_21',
  linkedProgramTitle: 'Выгорание',
  estimatedMinutes: 5,
  timeframeLabel: 'в последние недели',
  isValidatedScale: true,
  sourceName: 'Copenhagen Burnout Inventory, CBI',
  sourceUrl: 'https://nfa.dk/media/hl5nbers/cbi-first-edition.pdf',
  licenseNote:
    'Copenhagen Burnout Inventory (Kristensen T.S. et al., 2005). Используется полный CBI на 19 пунктов: Personal Burnout, Work-related Burnout и Client-related Burnout. Перед production-внедрением нужна финальная проверка выбранной русской формы.',
  scoreDirection: 'higher_is_worse',
  scoring: {
    method: 'mean_with_reverse',
    minScore: 0,
    maxScore: 100,
  },
  options: [
    { id: 'never_almost_never', label: 'Никогда или почти никогда', value: 0 },
    { id: 'rarely', label: 'Редко', value: 25 },
    { id: 'sometimes', label: 'Иногда', value: 50 },
    { id: 'often', label: 'Часто', value: 75 },
    { id: 'always', label: 'Всегда или почти всегда', value: 100 },
  ],
  questions: [
    {
      id: 'cbi_personal_tired',
      text: 'Я чувствую себя уставшим',
      subscale: 'personal_burnout',
      required: true,
    },
    {
      id: 'cbi_personal_physically_exhausted',
      text: 'Я чувствую физическое истощение',
      subscale: 'personal_burnout',
      required: true,
    },
    {
      id: 'cbi_personal_emotionally_exhausted',
      text: 'Я чувствую эмоциональное истощение',
      subscale: 'personal_burnout',
      required: true,
    },
    {
      id: 'cbi_personal_cannot_take_more',
      text: 'У меня появляется мысль: «Я больше не могу»',
      subscale: 'personal_burnout',
      required: true,
    },
    {
      id: 'cbi_personal_worn_out',
      text: 'Я чувствую себя вымотанным',
      subscale: 'personal_burnout',
      required: true,
    },
    {
      id: 'cbi_personal_weak_illness',
      text: 'Я чувствую слабость и ощущаю, что организм стал уязвимее',
      subscale: 'personal_burnout',
      required: true,
    },
    {
      id: 'cbi_work_emotionally_exhausting',
      text: 'Работа, учёба или основная нагрузка эмоционально истощают меня',
      subscale: 'work_burnout',
      required: true,
    },
    {
      id: 'cbi_work_burnt_out',
      text: 'Я чувствую себя выгоревшим из-за работы, учёбы или основной нагрузки',
      subscale: 'work_burnout',
      required: true,
    },
    {
      id: 'cbi_work_frustrating',
      text: 'Работа, учёба или основная нагрузка часто вызывают у меня внутреннее напряжение и раздражение',
      subscale: 'work_burnout',
      required: true,
    },
    {
      id: 'cbi_work_worn_out_end_day',
      text: 'К концу рабочего или учебного дня я чувствую себя вымотанным',
      subscale: 'work_burnout',
      required: true,
    },
    {
      id: 'cbi_work_morning_exhausted',
      text: 'Перед началом рабочего или учебного дня меня истощает сама мысль о предстоящей нагрузке',
      subscale: 'work_burnout',
      required: true,
    },
    {
      id: 'cbi_work_every_hour_tiring',
      text: 'Каждый час работы, учёбы или основной нагрузки даётся мне тяжело',
      subscale: 'work_burnout',
      required: true,
    },
    {
      id: 'cbi_client_hard_work',
      text: 'Мне бывает трудно работать, учиться или регулярно взаимодействовать с людьми',
      subscale: 'client_burnout',
      required: true,
    },
    {
      id: 'cbi_client_draining',
      text: 'Регулярное общение, помощь или поддержка других людей забирают у меня много сил',
      subscale: 'client_burnout',
      required: true,
    },
    {
      id: 'cbi_client_frustrating',
      text: 'Общение с людьми, которым я помогаю или с которыми регулярно взаимодействую, вызывает у меня напряжение или раздражение',
      subscale: 'client_burnout',
      required: true,
    },
    {
      id: 'cbi_client_gives_more_than_gets',
      text: 'Мне кажется, что я отдаю людям больше сил, чем успеваю восстанавливать',
      subscale: 'client_burnout',
      required: true,
    },
    {
      id: 'cbi_client_tired_of_people',
      text: 'Я чувствую усталость от людей, с которыми регулярно взаимодействую',
      subscale: 'client_burnout',
      required: true,
    },
    {
      id: 'cbi_client_wonder_how_long',
      text: 'Я думаю о том, как долго ещё смогу выдерживать такую нагрузку от общения или заботы',
      subscale: 'client_burnout',
      required: true,
    },
    {
      id: 'cbi_work_energy_for_close_people',
      text: 'После работы, учёбы или основной нагрузки у меня остаются силы на близких и личную жизнь',
      subscale: 'work_burnout',
      reverseScored: true,
      required: true,
    },
  ],
  subscales: [
    {
      id: 'personal_burnout',
      title: 'Общее истощение',
      minScore: 0,
      maxScore: 100,
      scoreDirection: 'higher_is_worse',
    },
    {
      id: 'work_burnout',
      title: 'Работа и нагрузка',
      minScore: 0,
      maxScore: 100,
      scoreDirection: 'higher_is_worse',
    },
    {
      id: 'client_burnout',
      title: 'Общение и забота о других',
      minScore: 0,
      maxScore: 100,
      scoreDirection: 'higher_is_worse',
    },
  ],
  resultBands: [
    {
      id: 'low',
      minScore: 0,
      maxScore: 24,
      title: 'Перегрузка сейчас выражена слабо',
      shortText:
        'Ответы показывают, что истощение в последнее время было слабым или появлялось редко.',
      description:
        'Это не диагноз, а спокойная точка наблюдения. Даже если перегрузка сейчас выражена слабо, полезно заранее замечать первые признаки усталости и не доводить себя до режима «терпеть до последнего».',
      recommendationText:
        'Сад «Выгорание» можно пройти как профилактику: собрать короткие практики отдыха, восстановления и более бережного распределения сил.',
      programReportText:
        'Стартовая оценка показала, что перегрузка была выражена слабо. В саде можно использовать практики как профилактику и способ заранее укрепить привычку восстанавливаться до сильного истощения.',
      ...sharedBurnoutComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'burnout_21',
        label: 'Перейти к саду «Выгорание»',
      },
    },
    {
      id: 'moderate',
      minScore: 25,
      maxScore: 49,
      title: 'Перегрузка сейчас заметна',
      shortText:
        'Ответы показывают, что усталость и истощение уже заметны и могут влиять на настроение, концентрацию, работу, учёбу или личную жизнь.',
      description:
        'Это не диагноз. Такой результат часто означает, что сил уходит больше, чем успевает восстанавливаться. Сейчас особенно важны не резкие перемены, а маленькие шаги: паузы, сон, снижение лишней нагрузки и честная проверка своих ресурсов.',
      recommendationText:
        'Подойдёт мягкое прохождение сада: короткие практики восстановления, без требования делать всё идеально и быстро.',
      programReportText:
        'Стартовая оценка показала заметную перегрузку. В саде пользователь работал с признаками истощения, паузами, восстановлением, распределением сил и снижением лишнего давления на себя.',
      ...sharedBurnoutComparisonCopy,
      safetyLevel: 'none',
      nextAction: {
        type: 'program',
        slug: 'burnout_21',
        label: 'Продолжить сад «Выгорание»',
      },
    },
    {
      id: 'high',
      minScore: 50,
      maxScore: 74,
      title: 'Перегрузка сейчас сильно заметна',
      shortText:
        'Ответы показывают, что истощение может занимать много места и заметно мешать обычному ритму жизни.',
      description:
        'Это не диагноз. Такой результат означает, что сейчас особенно важно не пытаться «собраться любой ценой». Когда сил мало, давление на себя часто только усиливает истощение.',
      recommendationText:
        'Начни с самого простого: короткая пауза, снижение необязательной нагрузки и один маленький шаг восстановления сегодня.',
      programReportText:
        'Стартовая оценка показала сильную перегрузку. В саде важно двигаться мягко: сначала стабилизация и восстановление сил, затем пересмотр нагрузки, границ и привычки требовать от себя слишком много.',
      ...sharedBurnoutComparisonCopy,
      safetyLevel: 'watch',
      nextAction: {
        type: 'program',
        slug: 'burnout_21',
        label: 'Продолжить сад мягко',
      },
    },
    {
      id: 'very_high',
      minScore: 75,
      maxScore: 100,
      title: 'Истощение сейчас очень выражено',
      shortText:
        'Ответы показывают, что усталость и истощение в последнее время были очень сильными и могли заметно мешать повседневной жизни.',
      description:
        'Это не диагноз. Такой результат означает, что сейчас важно снизить давление на себя и не оставаться с тяжёлым состоянием в одиночку. Иногда сильное истощение связано не только с нагрузкой, но и со сном, здоровьем, тревогой, депрессивным состоянием или долгим стрессом.',
      recommendationText:
        'Начни с короткого шага восстановления. Если истощение долго не проходит, мешает спать, работать, учиться, заботиться о себе или резко усиливается, стоит обратиться за живой поддержкой к специалисту в своём регионе.',
      programReportText:
        'Стартовая оценка показала очень выраженное истощение. В саде важно не усиливать давление: сначала короткие практики восстановления и стабилизации, затем бережный пересмотр нагрузки, отдыха и личных границ.',
      ...sharedBurnoutComparisonCopy,
      safetyLevel: 'support',
      nextAction: {
        type: 'program',
        slug: 'burnout_21',
        label: 'Продолжить сад мягко',
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
  relationshipsBoundariesV1,
  burnoutCbiV1,
  futureAssessment({
    slug: 'sleep_check_v1',
    title: 'Оценка сна',
    shortTitle: 'Сон',
    category: 'sleep',
    linkedProgramSlug: 'gentle_sleep_21',
    linkedProgramTitle: 'Мягкий сон',
    description:
      'Будущая оценка будет связана с вечерним состоянием, отдыхом и качеством восстановления.',
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
