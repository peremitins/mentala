import type { ToolkitItemType, ToolkitToolRef } from '../dto/toolkit';

/**
 * Реестр «Моего набора»: связывает опции выбора в roadmap-шагах с реальными
 * запускаемыми элементами приложения.
 *
 * Опции шага хранятся как `option_1..option_N` (см. makeChoiceOptions в
 * retention-program.service.ts) и сами по себе НЕ ссылаются на практики. Многие
 * опции вообще не имеют экрана («короткая пауза», «сон/еда/вода», «ничего из этого»,
 * концептуальные приёмы) — для них назначение = null, и в набор они не попадают.
 *
 * При завершении шага сервер прогоняет ответы через resolveToolkitDestination():
 * только опции с назначением материализуются в набор как запускаемые элементы,
 * а текстовые поля (см. getToolkitPhraseFields) — как личные фразы.
 *
 * Реестр расширяемый: для новых программ добавляются записи по их formKind.
 */

export interface ToolkitDestination {
  type: Extract<ToolkitItemType, 'practice' | 'ai_chat'>;
  title: string;
  toolRef: ToolkitToolRef;
  // Канонический ключ дедупа: один и тот же элемент из разных садов = одна карточка.
  itemKey: string;
}

// formKind → fieldId → optionId → назначение | null (null = в набор не идёт).
const SELF_KINDNESS_TOOLKIT: Record<
  string,
  Record<string, ToolkitDestination | null>
> = {
  // «Что поможет, когда в теле много напряжения?»
  body_tool: {
    option_1: {
      type: 'practice',
      title: 'Дыхание с длинным выдохом',
      toolRef: { kind: 'breath', slug: 'long-exhale-4-6' },
      itemKey: 'breath:long-exhale-4-6',
    },
    option_2: {
      type: 'practice',
      title: 'Заземление 5-4-3-2-1',
      toolRef: { kind: 'sos', entry: 'panic' },
      itemKey: 'sos:panic',
    },
    option_3: {
      type: 'practice',
      title: 'Снятие напряжения в теле',
      toolRef: { kind: 'sos', entry: 'tension' },
      itemKey: 'sos:tension',
    },
    option_4: null, // короткая пауза перед реакцией — нет экрана
    option_5: null, // сон, еда или вода — нет экрана
    option_6: null, // ничего из этого
  },
  // «Что поможет, когда самокритики становится слишком много?»
  thought_tool: {
    option_1: null, // посмотреть на мысль со стороны — концепт, нет экрана
    option_2: null, // проверить мысль через факты — концепт, нет экрана
    option_3: null, // фраза внутреннего наставника — текст, нет экрана
    option_4: {
      type: 'ai_chat',
      title: 'Поговорить с помощником',
      toolRef: { kind: 'chat' },
      itemKey: 'chat',
    },
    option_5: {
      type: 'practice',
      title: 'Выгрузка мыслей',
      toolRef: { kind: 'thought_dump' },
      itemKey: 'thought_dump',
    },
    option_6: null, // ничего из этого
  },
  // «Что поможет, когда нужно сделать следующий шаг?» — все варианты концептуальные,
  // отдельных экранов нет, поэтому в набор не попадают.
  action_tool: {
    option_1: null,
    option_2: null,
    option_3: null,
    option_4: null,
    option_5: null,
    option_6: null,
  },
};

// Сад «Отношения» (relationships_21), шаг 20 «Мой кодекс отношений».
const RELATIONSHIPS_TOOLKIT: Record<
  string,
  Record<string, ToolkitDestination | null>
> = {
  // «Что поможет перед трудным разговором?»
  before_talk: {
    option_1: {
      type: 'practice',
      title: 'Дыхание с длинным выдохом',
      toolRef: { kind: 'breath', slug: 'long-exhale-4-6' },
      itemKey: 'breath:long-exhale-4-6',
    },
    option_2: {
      type: 'practice',
      title: 'Квадратное дыхание',
      toolRef: { kind: 'breath', slug: 'box-breathing' },
      itemKey: 'breath:box-breathing',
    },
    option_3: {
      type: 'practice',
      title: 'Заземление 5-4-3-2-1',
      toolRef: { kind: 'sos', entry: 'panic' },
      itemKey: 'sos:panic',
    },
    option_4: null, // репетиция первой фразы — концепт, нет экрана
    option_5: null, // вспомнить своё «зачем» — концепт, нет экрана
    option_6: null, // ничего из этого
  },
  // «Что поможет, когда границу продавили или разговор был тяжёлым?»
  after_pushback: {
    option_1: {
      type: 'practice',
      title: 'Снятие напряжения в теле',
      toolRef: { kind: 'sos', entry: 'tension' },
      itemKey: 'sos:tension',
    },
    option_2: {
      type: 'practice',
      title: 'Физиологический вздох',
      toolRef: { kind: 'breath', slug: 'physiological-sigh' },
      itemKey: 'breath:physiological-sigh',
    },
    option_3: {
      type: 'practice',
      title: 'Выгрузка мыслей',
      toolRef: { kind: 'thought_dump' },
      itemKey: 'thought_dump',
    },
    option_4: {
      type: 'ai_chat',
      title: 'Поговорить с помощником',
      toolRef: { kind: 'chat' },
      itemKey: 'chat',
    },
    option_5: null, // фраза на момент вины — текст, нет экрана
    option_6: null, // ничего из этого
  },
  // «Что поможет, когда хочется больше тепла и близости?» — все варианты
  // концептуальные действия в жизни, отдельных экранов нет.
  closeness_tool: {
    option_1: null,
    option_2: null,
    option_3: null,
    option_4: null,
    option_5: null,
    option_6: null,
  },
};

// Сад «Мягкий сон» (gentle_sleep_21), шаг 20 «Ночной набор».
const GENTLE_SLEEP_TOOLKIT: Record<
  string,
  Record<string, ToolkitDestination | null>
> = {
  // «Что берёшь на вечер, когда голова не отпускает?»
  evening_racing: {
    option_1: {
      type: 'practice',
      title: 'Выгрузка мыслей',
      toolRef: { kind: 'thought_dump' },
      itemKey: 'thought_dump',
    },
    option_2: {
      type: 'practice',
      title: 'Дыхание 4-7-8',
      toolRef: { kind: 'breath', slug: '4-7-8' },
      itemKey: 'breath:4-7-8',
    },
    option_3: {
      type: 'practice',
      title: 'Дыхание с длинным выдохом',
      toolRef: { kind: 'breath', slug: 'long-exhale-4-6' },
      itemKey: 'breath:long-exhale-4-6',
    },
    option_4: {
      type: 'ai_chat',
      title: 'Поговорить с помощником',
      toolRef: { kind: 'chat' },
      itemKey: 'chat',
    },
    option_5: null, // свой порядок вечера - концепт, нет экрана
    option_6: null, // ничего из этого
  },
  // «Что берёшь на ночь, когда сон не идёт?»
  cant_sleep: {
    option_1: null, // встать и посидеть с тихим занятием - действие в жизни, нет экрана
    option_2: {
      type: 'practice',
      title: 'Ровное дыхание 6-6',
      toolRef: { kind: 'breath', slug: 'equal-6-6' },
      itemKey: 'breath:equal-6-6',
    },
    option_3: {
      type: 'practice',
      title: 'Снятие напряжения в теле',
      toolRef: { kind: 'sos', entry: 'tension' },
      itemKey: 'sos:tension',
    },
    option_4: null, // перестать стараться уснуть (парадоксальная интенция) - концепт
    option_5: null, // практика «Тихая ночь» - медитация шага, deep-link'а в наборе пока нет
    option_6: null, // ничего из этого
  },
  // «Что берёшь на пробуждение среди ночи?» - почти всё концептуальные ходы
  // без отдельного экрана, в набор не материализуются.
  night_wake: {
    option_1: null, // не проверять время - концепт
    option_2: null, // десять медленных выдохов - делается без экрана
    option_3: null, // разрешить себе просто лежать - концепт
    option_4: null, // встать, если бодрость всерьёз - действие в жизни
    option_5: null, // практика «Тихая ночь» - см. cant_sleep.option_5
    option_6: null, // ничего из этого
  },
};

const TOOLKIT_REGISTRY: Record<
  string,
  Record<string, Record<string, ToolkitDestination | null>>
> = {
  self_kindness_toolkit: SELF_KINDNESS_TOOLKIT,
  relationships_toolkit: RELATIONSHIPS_TOOLKIT,
  gentle_sleep_21_toolkit: GENTLE_SLEEP_TOOLKIT,
};

// Текстовые поля шага, которые сохраняем как личные фразы (type='phrase').
const TOOLKIT_PHRASE_FIELDS: Record<string, string[]> = {
  self_kindness_toolkit: ['one_phrase'],
  relationships_toolkit: ['one_phrase'],
  gentle_sleep_21_toolkit: ['one_phrase'],
};

/**
 * Назначение для выбранной опции либо null, если возвращаться некуда.
 */
export function resolveToolkitDestination(
  formKind: string,
  fieldId: string,
  optionId: string
): ToolkitDestination | null {
  return TOOLKIT_REGISTRY[formKind]?.[fieldId]?.[optionId] ?? null;
}

/**
 * Список fieldId текстовых полей формы, которые материализуются как личные фразы.
 */
export function getToolkitPhraseFields(formKind: string): string[] {
  return TOOLKIT_PHRASE_FIELDS[formKind] ?? [];
}

/**
 * Резолв toolRef → роут приложения (для deep-link из «Моего набора»).
 */
export function resolveToolkitRoute(toolRef: ToolkitToolRef): string {
  switch (toolRef.kind) {
    case 'sos':
      return `/quick-help?entry=${toolRef.entry}`;
    case 'breath':
      return `/breath-practices/${toolRef.slug}`;
    case 'thought_dump':
      return '/quick-help/thought-dump';
    case 'chat':
      return '/chat';
  }
}
