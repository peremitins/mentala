import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  dailyThoughts,
  energyEvents,
  moodCheckins,
  programs,
  programStepTemplates,
  users,
  userPlants,
  userPrograms,
  userProgramStepAttempts,
  userProgramStepProgress,
  userToolkitItems,
  type ProgramStepAction,
} from '@/server/infrastructure/db/schema';
import { resolveTrialUpsellAfterStep } from '@/server/application/subscriptions/trial-upsell.service';
import {
  getToolkitPhraseFields,
  resolveToolkitDestination,
  type ToolkitDestination,
} from '@/shared/toolkit/registry';
import type { ToolkitItemSource } from '@/shared/dto/toolkit';
import {
  MoodCheckinMoodEnum,
  ProgramStepActionDto,
  ProgramStepActionStateDto as ProgramStepActionStateSchema,
  type MoodCheckinMood,
  type ProgramOverviewDto,
  type ProgramStepActionStateDto,
  type ProgramStepDto,
  type ThoughtOfTheDayDto,
} from '@/shared/dto/retention';
import { toIsoString } from '@/server/utils/serialize';
import {
  DAILY_STEP_LIMIT_BASE,
  DEFAULT_RETENTION_TIMEZONE,
  diffDateKeys,
  getDailyLimitWindowMs,
  getDailyStepLimitForProgramDay,
  getDevDailyLimitCycleState,
  getLocalDateKey as getLocalDateKeyPure,
  getNextDailyResetAt,
  nextLocalMidnight as nextLocalMidnightPure,
  shiftDateKey as shiftDateKeyPure,
} from '@/server/application/programs/retention-timezone';
import { trackRetentionEvent } from '@/server/application/analytics/retention-events.service';
import {
  cancelPendingNextStepReminder,
  scheduleNextStepReminder,
} from '@/server/application/notifications/next-step-reminder.service';
import { getOrGeneratePlantSummary } from '@/server/application/garden/garden-summary.service';
import { recordStreakActivityForDate } from '@/server/application/streak/streak.service';
import {
  applyGender,
  applyGenderDeep,
  type UserGender,
} from '@/server/application/programs/gendered-text';

export const DEFAULT_RETENTION_PROGRAM_SLUG = 'calm_anxiety_30';
export const RETENTION_WEEKLY_GOAL = 50;

// Базовый максимум новых завершённых шагов программы за один локальный день
// пользователя. Первые дни программы лимит выше — см. DAILY_STEP_LIMIT_SCHEDULE
// в retention-timezone.ts (день 0 и 1 → 3 шага, дальше → 2).
// Replay (повтор уже завершённых шагов) лимитом не ограничен.
// См. retention/retention_long_term_strategy.md (pacing).
export const DAILY_STEP_LIMIT = DAILY_STEP_LIMIT_BASE;

const DEFAULT_TIMEZONE = DEFAULT_RETENTION_TIMEZONE;

// Blueprint'ы Садов вынесены в ./blueprints (один Сад = один файл).
// Билдеры action'ов и типы StepBlueprint живут в ./blueprints/builders.ts.
import {
  CALM_CHAPTERS,
  CHAPTER_LAST_STEPS_BY_SLUG,
  PEONY_CHAPTERS,
  PROGRAM_CHAPTERS_BY_SLUG,
  STEP_BLUEPRINTS_BY_SLUG,
  stepIntroAction,
  type ChapterAccent,
  type StepBlueprint,
} from './blueprints';

// Ре-экспорт для тестов (tests/*-blueprint.test.ts) и backward compat.
export { STEP_BLUEPRINTS_BY_SLUG };

function getStepBlueprintsForSlug(slug: string): StepBlueprint[] {
  const list = STEP_BLUEPRINTS_BY_SLUG[slug];
  if (!list || list.length === 0) {
    // Силуэтные программы (см. SILHOUETTE_PROGRAMS) видны в Оранжерее, но не
    // запускаются - у них пока нет контента. Бросаем структурированный error,
    // который endpoint'ы (start.post.ts) переводят в HTTP 503 + user-friendly
    // сообщение, а не в общий 500.
    const error = new Error(
      `No step blueprints registered for program slug: ${slug}`
    );
    (error as Error & { code?: string }).code = 'E_CONTENT_PENDING';
    throw error;
  }
  return list;
}

// Каталог «Мысли дня». Теги определяют, в каком контексте предпочтительно
// показывать текст:
//   anxiety      - сад «Спокойствие» (calm_anxiety_30), CBT/ACT по тревоге
//   self_compassion - сад «Внутренний критик» (self_kindness_21), Self-Compassion/CFT
//   stress       - перегрузка, ресурс, восстановление
//   low_mood     - подавленное настроение, нормализация, движение вперёд
//   universal    - подходит для любого контекста
//
// Алгоритм выбора: сначала кластер текущей программы, fallback на universal.
// При исчерпании показываем по кругу, исключая сохранённые тексты (v2).
// Источники: CBT (Beck), ACT (Hayes), Self-Compassion (Neff), DBT (Linehan).

type ThoughtTag =
  | 'anxiety'
  | 'self_compassion'
  | 'stress'
  | 'low_mood'
  | 'universal';

type ThoughtEntry = { text: string; tags: ThoughtTag[] };

const THOUGHT_CATALOG: ThoughtEntry[] = [
  // ── Тревога (anxiety, 20 текстов) ──────────────────────────────────────
  {
    text: 'Тревога предсказывает катастрофу, но прогнозы сбываются реже, чем кажется. Вспомни: чем закончился прошлый раз, когда тебя так накрывало?',
    tags: ['anxiety'],
  },
  {
    text: 'Когда тело напрягается и мысли несутся, это не сигнал опасности. Тревога появляется там, где тебе что-то небезразлично.',
    tags: ['anxiety'],
  },
  {
    text: 'Мысль «со мной что-то не так» очень убедительна. Но убедительность - это ещё не точность.',
    tags: ['anxiety'],
  },
  {
    text: 'Мозг при тревоге хорошо ищет угрозы и плохо видит то, что в порядке. Иногда стоит намеренно спросить себя: что сейчас идёт нормально?',
    tags: ['anxiety'],
  },
  {
    text: 'Избегание снижает тревогу на пять минут и усиливает её в следующий раз. Тело запоминает, что уйти было единственным способом справиться.',
    tags: ['anxiety'],
  },
  {
    text: 'Тревога просит проверить ещё раз, уточнить ещё раз, спросить ещё раз. Каждая проверка говорит мозгу, что угроза реальна. Иногда остановиться раньше - это тоже выбор.',
    tags: ['anxiety'],
  },
  {
    text: 'Ночью мозг переоценивает угрозы. Мысли, которые кажутся катастрофой в три ночи, редко выглядят так же утром.',
    tags: ['anxiety'],
  },
  {
    text: '«Я не справлюсь» - привычная мысль при тревоге, не факт. Ты {справлялся|справлялась} с трудным раньше, даже когда казалось, что нет.',
    tags: ['anxiety'],
  },
  {
    text: 'Неопределённость тяжелее, чем определённо плохое. Мозг не любит ситуации без ответа и начинает придумывать самый пугающий вариант. Это его способ заполнить пробел, а не описание реальности.',
    tags: ['anxiety'],
  },
  {
    text: 'Дышать медленнее при тревоге - не просто совет. Выдох длиннее вдоха напрямую активирует парасимпатическую систему, и тело начинает успокаиваться.',
    tags: ['anxiety'],
  },
  {
    text: 'Когда тревога громкая, с ней не нужно спорить. Можно заметить: вот она. И не следовать за каждой мыслью, которую она подбрасывает.',
    tags: ['anxiety'],
  },
  {
    text: 'Поиск заверений снаружи временно помогает и долгосрочно усиливает тревогу. Она учится, что спокойствие возможно только при чьём-то подтверждении.',
    tags: ['anxiety'],
  },
  {
    text: 'Тревога говорит языком «всегда» и «никогда». Реальность почти всегда сложнее и мягче этих слов.',
    tags: ['anxiety'],
  },
  {
    text: 'Откладывать при тревоге кажется облегчением, но дело никуда не уходит, а тревога о нём растёт. Маленький первый шаг работает лучше, чем ожидание правильного настроения.',
    tags: ['anxiety'],
  },
  {
    text: 'Учащённый пульс, напряжение, жар в лице при тревоге - не опасны. Тело готовится к действию, даже если действия не требуется.',
    tags: ['anxiety'],
  },
  {
    text: 'Перфекционизм и тревога часто ходят вместе. За «я {должен|должна} сделать это идеально» почти всегда прячется «я боюсь, что меня осудят».',
    tags: ['anxiety'],
  },
  {
    text: '«А вдруг» - вопрос, на который редко есть ответ прямо сейчас. Переносить неопределённость тяжело. Но это навык - он развивается, если не убегать от него каждый раз.',
    tags: ['anxiety'],
  },
  {
    text: 'Заземление помогает не потому что это магия. Оно переключает внимание с мыслей на ощущения, и мозг получает другой сигнал.',
    tags: ['anxiety'],
  },
  {
    text: 'Тревога требует немедленного ответа. Но большинство вещей, которые кажутся срочными, на самом деле ждут. Пауза перед реакцией - уже навык.',
    tags: ['anxiety'],
  },
  {
    text: 'Принятие неопределённости - не значит смириться с плохим. Это значит не тратить силы на то, что пока нельзя контролировать.',
    tags: ['anxiety'],
  },

  // ── Самосочувствие (self_compassion, 20 текстов) ───────────────────────
  {
    text: 'С другом в трудной ситуации ты бы {говорил|говорила} мягче, чем говоришь с собой. Это не случайность - это паттерн, который можно замечать.',
    tags: ['self_compassion'],
  },
  {
    text: 'Ошибка - это событие, которое произошло. Не определение тебя как человека.',
    tags: ['self_compassion'],
  },
  {
    text: 'Самокритика кажется полезной, как будто без неё расслабишься. На практике она сужает внимание и мешает исправлять ситуацию спокойно.',
    tags: ['self_compassion'],
  },
  {
    text: '«Я {должен был|должна была} знать лучше» - жёсткий стандарт. В тот момент ты {делал|делала} то, что {мог|могла}, с тем, что зна{л|ла} тогда.',
    tags: ['self_compassion'],
  },
  {
    text: 'Стыд говорит: «я плохой». Вина говорит: «я сделал что-то не то». Только второе помогает что-то изменить.',
    tags: ['self_compassion'],
  },
  {
    text: 'Критик внутри иногда пытается защитить: не дать ошибиться снова, не разочаровать других. Его намерение понятно. Но метод не всегда работает.',
    tags: ['self_compassion'],
  },
  {
    text: 'Трудный опыт - не то, что случается только с тобой. Ошибки, боль, растерянность - это часть того, что значит быть человеком.',
    tags: ['self_compassion'],
  },
  {
    text: 'Между ошибкой и самонаказанием можно вставить паузу. Один спокойный вдох. Этого иногда достаточно, чтобы выбрать другой ответ.',
    tags: ['self_compassion'],
  },
  {
    text: 'Требовать от себя большего - нормально. Требовать идеального - рецепт истощения, а не роста.',
    tags: ['self_compassion'],
  },
  {
    text: 'Когда тяжело, иногда самое точное, что можно сказать себе: «сейчас трудно, и это нормально». Не «всё пройдёт», не «соберись» - просто признание.',
    tags: ['self_compassion'],
  },
  {
    text: 'Мысль о том, что ты недостаточно {хорош|хороша}, очень убедительна. Убедительность не равна точности.',
    tags: ['self_compassion'],
  },
  {
    text: 'После ошибки внутренний критик часто говорит жёстко. Можно ответить иначе: спокойно признать, что случилось, и выбрать следующий маленький шаг.',
    tags: ['self_compassion'],
  },
  {
    text: 'Заботиться о себе не значит быть {слабым|слабой}. Это значит поддерживать ресурс, который позволяет вообще что-то делать.',
    tags: ['self_compassion'],
  },
  {
    text: 'Ты не {обязан|обязана} зарабатывать право на отдых. Усталость - это сигнал, а не наказание за недостаточную продуктивность.',
    tags: ['self_compassion'],
  },
  {
    text: 'Слова, которые ты выбираешь для себя в трудный момент, формируют то, как ты через него проходишь.',
    tags: ['self_compassion'],
  },
  {
    text: 'Возвращаться к себе после трудного дня, ошибки или неприятного разговора - это навык. Не интуиция и не черта характера, а то, что развивается через практику.',
    tags: ['self_compassion'],
  },
  {
    text: 'Рабочая поддержка звучит не идеально. Она честная и достаточно тёплая, чтобы на неё можно было опереться.',
    tags: ['self_compassion'],
  },
  {
    text: 'Тело не обязано заслуживать заботу через продуктивность. Оно просто участвует в твоём дне.',
    tags: ['self_compassion'],
  },
  {
    text: 'Когда критик внутри говорит громко, его не обязательно заглушать. Можно заметить: это опять он. И не идти за каждым его словом.',
    tags: ['self_compassion'],
  },
  {
    text: 'Разрешить себе быть {несовершенным|несовершенной} сегодня - это не сдаться. Это создать условия, в которых возможен реальный рост.',
    tags: ['self_compassion'],
  },

  // ── Стресс (stress, 8 текстов) ─────────────────────────────────────────
  {
    text: 'Перегрузка - это не сигнал о слабости. Это сигнал о том, что нагрузка превышает ресурс. Нагрузку можно изменить.',
    tags: ['stress'],
  },
  {
    text: '«Надо держаться» иногда полезно. Но держаться без восстановления - это расход, который рано или поздно предъявит счёт.',
    tags: ['stress'],
  },
  {
    text: 'Когда всё кажется срочным, ничто не срочно по-настоящему. Выбрать одно важное тяжело, но снижает нагрузку лучше, чем делать всё одновременно.',
    tags: ['stress'],
  },
  {
    text: 'Отдых, который прерывается виной, восстанавливает хуже. Разрешить себе отдыхать - это не лень, это управление ресурсом.',
    tags: ['stress'],
  },
  {
    text: 'Сделать меньше и действительно восстановиться часто эффективнее, чем продолжать на нуле.',
    tags: ['stress'],
  },
  {
    text: 'Тело реагирует на хронический стресс раньше, чем мы это осознаём. Усталость, раздражительность, снижение концентрации - это сигналы, а не слабость.',
    tags: ['stress'],
  },
  {
    text: 'Задачи не исчезают от беспокойства о них. Беспокойство забирает энергию, которая могла пойти на их решение.',
    tags: ['stress'],
  },
  {
    text: 'Восстановление - не награда за хорошую работу. Это часть того, как вообще работает работа.',
    tags: ['stress'],
  },

  // ── Низкое настроение (low_mood, 6 текстов) ───────────────────────────
  {
    text: 'Плохой день не отменяет навык. Он просто показывает, где сейчас нужна более мягкая опора.',
    tags: ['low_mood', 'universal'],
  },
  {
    text: 'Признать, что сейчас тяжело - первый шаг к тому, чтобы стало немного легче. Не сразу, но иногда достаточно назвать то, что есть.',
    tags: ['low_mood'],
  },
  {
    text: 'Настроение меняется. Не по команде, не быстро, но меняется. То, как ты себя чувствуешь прямо сейчас - не приговор.',
    tags: ['low_mood'],
  },
  {
    text: 'Когда сил мало, маленькие действия значат больше. Не потому что они магически меняют ситуацию, а потому что создают хоть какое-то движение.',
    tags: ['low_mood'],
  },
  {
    text: 'Закрытость от других в трудный момент кажется защитой. Но она часто усиливает тяжесть, а не снижает её.',
    tags: ['low_mood'],
  },
  {
    text: 'Иногда настроение снижается без видимой причины. Это не слабость характера и не «что-то со мной не так» - это просто то, как устроена психика.',
    tags: ['low_mood'],
  },

  // ── Универсальный (universal, 36 текстов) ─────────────────────────────
  {
    text: 'Навыки, которые работают в спокойное время, работают и в трудное. Но им нужна практика заранее.',
    tags: ['universal'],
  },
  {
    text: 'Замечать, что происходит внутри, без немедленной оценки - это и есть осознанность. Не ритуал, а внимание к себе.',
    tags: ['universal'],
  },
  {
    text: 'Изменения в поведении обычно предшествуют изменениям в ощущениях. Ждать правильного настроения для начала - долгое ожидание.',
    tags: ['universal'],
  },
  {
    text: 'Иногда самый полезный вопрос не «что я {должен|должна} делать?», а «что мне сейчас нужно?».',
    tags: ['universal'],
  },
  {
    text: 'То, что ты сейчас переживаешь, другие люди переживали тоже. Это не делает твой опыт менее настоящим, но напоминает: ты не {один|одна} в этом.',
    tags: ['universal'],
  },
  {
    text: 'Маленький шаг, который реально сделан, важнее идеального плана, который остался в голове.',
    tags: ['universal'],
  },
  {
    text: 'Поведение меняется не через силу воли, а через изменение среды. Иногда легче убрать соблазн, чем сопротивляться ему снова и снова.',
    tags: ['universal'],
  },
  {
    text: 'Злиться на близких нормально. Злость не отменяет любовь и не означает, что отношения сломаны.',
    tags: ['universal'],
  },
  {
    text: 'Большая часть беспокойства происходит не в настоящем, а в будущем, которого ещё нет. Прямо сейчас всё, как правило, в порядке.',
    tags: ['universal'],
  },
  {
    text: 'Хороший сон не роскошь. Он меняет то, как работает мозг, как мы реагируем на других и как оцениваем ситуацию.',
    tags: ['universal'],
  },
  {
    text: 'Сказать «нет» - это не жёсткость. Это честность о своих возможностях и забота о качестве того, на что ты говоришь «да».',
    tags: ['universal'],
  },
  {
    text: 'Смысл не всегда приходит готовым. Иногда он появляется в процессе, когда ты уже делаешь что-то важное для себя или других.',
    tags: ['universal'],
  },
  {
    text: 'Автопилот помогает экономить силы. Но иногда одна пауза и один осознанный вдох возвращают ощущение, что ты управляешь днём, а не он тобой.',
    tags: ['universal'],
  },
  {
    text: 'Не уметь что-то пока - это не постоянное состояние. Это просто этап.',
    tags: ['universal'],
  },
  {
    text: 'Одно из самых трудных умений - остановиться и спросить, что человек имел в виду, прежде чем принять свою интерпретацию за его слова.',
    tags: ['universal'],
  },
  {
    text: 'К себе часто применяют правила, которые ни к кому другому не применили бы. Это стоит замечать.',
    tags: ['universal'],
  },
  {
    text: 'Откладывать что-то неприятное - это нормально. Но чем дольше откладываешь, тем больше оно занимает место в голове.',
    tags: ['universal'],
  },
  {
    text: 'Чувство одиночества не означает, что ты {один|одна}. Иногда оно означает, что нужен другой тип контакта с людьми, которые уже рядом.',
    tags: ['universal'],
  },
  {
    text: 'Перемены редко ощущаются как прогресс в момент, когда происходят. Это видно только позже, оглядываясь назад.',
    tags: ['universal'],
  },
  {
    text: 'Когда ориентиры расплываются, иногда помогает один простой вопрос: что для меня сейчас важно?',
    tags: ['universal'],
  },
  {
    text: 'Чувства не нужно ни прогонять, ни превращать в действие. Можно просто позволить им быть, пока они не пройдут.',
    tags: ['universal'],
  },
  {
    text: 'Сделанное несовершенно почти всегда лучше несделанного идеально. Это работает для большинства вещей.',
    tags: ['universal'],
  },
  {
    text: 'Понять чужую точку зрения не значит согласиться с ней. Но это меняет то, как проходит разговор.',
    tags: ['universal'],
  },
  {
    text: 'Вчерашний день не определяет сегодняшний. Это не обязательно воспринимать как мотивацию - просто как факт.',
    tags: ['universal'],
  },
  {
    text: 'Принять что-то не значит одобрить. Это значит перестать тратить силы на борьбу с тем, что уже случилось.',
    tags: ['universal'],
  },
  {
    text: 'Мозг заточен замечать проблемы. Специально замечать, что работает, - не наивность, а противовес этой настройке.',
    tags: ['universal'],
  },
  {
    text: 'Прогресс редко выглядит как прямая линия вверх. Чаще это два шага вперёд, шаг назад, и снова вперёд, но уже с другим опытом.',
    tags: ['universal'],
  },
  {
    text: 'Заметить свою реакцию уже после того, как она произошла - это тоже навык. Он развивается в сторону того, чтобы замечать раньше.',
    tags: ['universal'],
  },
  {
    text: 'Потребности не исчезают, если их не называть. Они просто ищут другие выходы.',
    tags: ['universal'],
  },
  {
    text: 'Сравнивать себя с другими - автоматическая реакция мозга, не объективная оценка. У других свой контекст, который ты не видишь полностью.',
    tags: ['universal'],
  },
  {
    text: 'Полное присутствие в простых вещах - еде, прогулке, разговоре - это редкий вид отдыха от постоянного фонового шума мыслей.',
    tags: ['universal'],
  },
  {
    text: 'Просить о помощи - не признание слабости. Это признание того, что задача или момент требуют больше одного человека.',
    tags: ['universal'],
  },
  {
    text: 'Раздражение, усталость, скука - не просто неудобства. Они сигнализируют о чём-то, что стоит замечать.',
    tags: ['universal'],
  },
  {
    text: 'Начать что-то несовершенным образом и потом доделать всегда лучше, чем ждать правильных условий.',
    tags: ['universal'],
  },
  {
    text: 'Стойкость - это не отсутствие трудных моментов. Это то, как ты к ним возвращаешься. И каждый раз, когда возвращаешься, это немного проще.',
    tags: ['universal'],
  },
  {
    text: 'Пытаться соответствовать чужим ожиданиям постоянно - утомительно. Иногда стоит проверить, чьи именно ожидания тебя сейчас двигают.',
    tags: ['universal'],
  },
];

export function getThoughtTemplateForProgramStep(params: {
  programSlug?: string | null;
  step?: number | null;
  entryDate: string;
  userId: number;
}): string {
  // Определяем предпочтительный кластер по текущей программе.
  let preferredTag: ThoughtTag = 'universal';
  if (params.programSlug === 'calm_anxiety_30') preferredTag = 'anxiety';
  else if (params.programSlug === 'self_kindness_21')
    preferredTag = 'self_compassion';
  // relationships_21: отдельного кластера мыслей пока нет - используется
  // universal. При добавлении кластера relationships завести тег здесь.

  // Сначала ищем в кластере программы.
  let pool = THOUGHT_CATALOG.filter((t) => t.tags.includes(preferredTag));

  // Fallback на universal если кластер пуст (будущие программы без явного тега).
  if (pool.length === 0) {
    pool = THOUGHT_CATALOG.filter((t) => t.tags.includes('universal'));
  }

  // Абсолютный fallback на весь каталог.
  if (pool.length === 0) pool = THOUGHT_CATALOG;

  // Детерминированная ротация: разные пользователи получают разные тексты
  // в один и тот же день; один пользователь видит повтор не раньше чем
  // через N дней (N = размер пула для его программы: 20-60 дней).
  const hash = Math.abs(
    params.entryDate
      .split('')
      .reduce((sum, char) => sum + char.charCodeAt(0), params.userId)
  );
  const templateIndex = hash % pool.length;

  return (
    pool[templateIndex]?.text ??
    'Спокойствие начинается с одного понятного следующего шага.'
  );
}

// Чистые timezone-функции живут в `retention-timezone.ts` (без БД-зависимостей,
// тестируемы изолированно). Здесь re-export для backward compat и для возможности
// в будущем заменить дефолтную таймзону без правки 30+ вызывающих файлов.
export const getLocalDateKey = getLocalDateKeyPure;
const shiftDateKey = shiftDateKeyPure;

export function chapterForStep(
  step: number,
  totalSteps: number = 30,
  slug?: string | null
) {
  // Явные границы глав конкретного Сада (см. CHAPTER_LAST_STEPS_BY_SLUG в
  // ./blueprints). Появилось, когда Садов с одинаковым totalSteps стало
  // несколько - деление по totalSteps больше не однозначно.
  const breaks = slug ? CHAPTER_LAST_STEPS_BY_SLUG[slug] : undefined;
  if (breaks) {
    for (let chapter = 0; chapter < breaks.length; chapter += 1) {
      const lastStep = breaks[chapter];
      if (lastStep !== undefined && step <= lastStep) return chapter + 1;
    }
    return breaks.length + 1;
  }
  // Orchid calm_anxiety_30 (30 шагов) - исторические границы. Сохраняем
  // explicit-разбивку чтобы не сломать существующую запись программы #1.
  if (totalSteps === 30) {
    if (step <= 3) return 1;
    if (step <= 10) return 2;
    if (step <= 20) return 3;
    if (step <= 28) return 4;
    return 5;
  }
  // Peony self_kindness_21 (21 шаг) - explicit-разбивка из
  // .docs/content/program_self_kindness_21.md. Оставлено как fallback для
  // вызовов без slug (старые тесты).
  if (totalSteps === 21) {
    if (step <= 3) return 1;
    if (step <= 7) return 2;
    if (step <= 14) return 3;
    if (step <= 19) return 4;
    return 5;
  }
  // Fallback для будущих программ - пропорциональное деление по 5 главам.
  const ratio = step / totalSteps;
  if (ratio <= 0.15) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.8) return 3;
  if (ratio <= 0.95) return 4;
  return 5;
}

export function getProgramChaptersForTotalSteps(
  totalSteps: number,
  slug?: string | null
) {
  // Сначала точное соответствие по slug - с появлением нескольких Садов
  // по 21 шагу деление по totalSteps стало неоднозначным.
  const chapters = slug ? PROGRAM_CHAPTERS_BY_SLUG[slug] : undefined;
  if (chapters) return chapters;
  if (totalSteps === 21) return PEONY_CHAPTERS;
  return CALM_CHAPTERS;
}

function formatMinutesRu(minutes: number): string {
  const value = Math.max(1, Math.floor(minutes));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} минут`;
  if (last === 1) return `${value} минуту`;
  if (last >= 2 && last <= 4) return `${value} минуты`;
  return `${value} минут`;
}

function countWords(value?: string | null): number {
  if (!value) return 0;
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function estimateReadingSeconds(...texts: Array<string | null | undefined>) {
  const words = texts.reduce((sum, text) => sum + countWords(text), 0);
  if (words === 0) return 0;
  return Math.ceil((words / 180) * 60);
}

function getActionSeconds(
  action: ProgramStepAction,
  keys: Array<
    | 'completionDelaySeconds'
    | 'durationSeconds'
    | 'estimatedDurationSeconds'
    | 'minDurationSec'
  >
) {
  const values = keys
    .map((key) => action[key])
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value > 0
    );
  return values.length ? Math.max(...values) : 0;
}

function estimateChoiceQuestionSeconds(params: {
  mode?: 'single' | 'multiple';
  minSelected?: number;
  optionsCount?: number;
}) {
  const base = params.mode === 'multiple' ? 45 : 30;
  const minSelected = Math.max(0, params.minSelected ?? 0);
  const optionsCount = Math.max(0, params.optionsCount ?? 0);
  return base + Math.min(30, minSelected * 8 + Math.ceil(optionsCount / 4) * 5);
}

function estimateFormFieldSeconds(
  field: NonNullable<ProgramStepAction['fields']>[number]
) {
  if (field.type === 'rating_scale') return 30;
  if (field.type === 'choice' || field.type === 'experiment_status') {
    return estimateChoiceQuestionSeconds({
      mode: field.mode,
      minSelected: field.minSelected,
      optionsCount: field.options?.length,
    });
  }
  const maxLength = field.maxLength ?? 250;
  if (field.type === 'text' || maxLength <= 180) return 45;
  return maxLength > 700 ? 120 : 75;
}

function estimateWeeklyQuestionSeconds(
  question: NonNullable<ProgramStepAction['questions']>[number]
) {
  if (question.type === 'rating_scale') return 30;
  if (question.type === 'text') return 75;
  return estimateChoiceQuestionSeconds({
    mode: question.mode,
    minSelected: question.minSelected,
    optionsCount: question.options?.length,
  });
}

function estimateActionDurationSeconds(action: ProgramStepAction): number {
  const promptReadingSeconds = estimateReadingSeconds(
    action.title,
    action.subtitle,
    action.prompt,
    action.chipQuestion,
    action.scaleBeforeLabel,
    action.scaleAfterLabel
  );

  if (
    action.type === 'breathing' ||
    action.type === 'quick_help_breathing' ||
    action.type === 'quick_help_tension' ||
    action.type === 'meditation'
  ) {
    return (
      getActionSeconds(action, [
        'completionDelaySeconds',
        'durationSeconds',
        'estimatedDurationSeconds',
      ]) + promptReadingSeconds
    );
  }

  if (action.type === 'quick_help_grounding') {
    return (
      (getActionSeconds(action, [
        'completionDelaySeconds',
        'durationSeconds',
        'estimatedDurationSeconds',
      ]) || 180) + promptReadingSeconds
    );
  }

  if (action.type === 'ai_chat_session') {
    return Math.max(
      180,
      getActionSeconds(action, [
        'minDurationSec',
        'estimatedDurationSeconds',
        'durationSeconds',
      ]) + promptReadingSeconds
    );
  }

  if (action.type === 'structured_form') {
    const fields = action.fields ?? [];
    const fieldsSeconds = fields.reduce(
      (sum, field) => sum + estimateFormFieldSeconds(field),
      0
    );
    return Math.max(90, promptReadingSeconds + fieldsSeconds);
  }

  if (action.type === 'guided_steps') {
    const steps = action.steps ?? [];
    const stepsSeconds = steps.reduce((sum, step) => {
      if (
        typeof step.durationSeconds === 'number' &&
        Number.isFinite(step.durationSeconds)
      ) {
        return sum + Math.max(1, step.durationSeconds);
      }
      return sum + 45 + estimateReadingSeconds(step.title, step.text);
    }, 0);
    return Math.max(90, promptReadingSeconds + stepsSeconds);
  }

  if (action.type === 'weekly_check') {
    const questions = action.questions ?? [];
    const questionsSeconds = questions.reduce(
      (sum, question) =>
        sum +
        estimateReadingSeconds(question.question) +
        estimateWeeklyQuestionSeconds(question),
      0
    );
    return Math.max(120, promptReadingSeconds + questionsSeconds);
  }

  if (action.type === 'journal_entry') {
    const inputSeconds =
      action.journalFormat === 'structured'
        ? 180
        : action.journalFormat === 'oneLine'
          ? 45
          : 90;
    return promptReadingSeconds + inputSeconds;
  }

  if (action.type === 'thought_dump') return promptReadingSeconds + 150;
  if (action.type === 'ai_reflection' || action.type === 'micro_reflection') {
    return promptReadingSeconds + 60;
  }
  if (action.type === 'rating_scale' || action.type === 'next_route_choice') {
    return promptReadingSeconds + 30;
  }
  if (action.type === 'mood_checkin') return 20;
  return promptReadingSeconds;
}

export function estimateProgramStepActionsDurationSeconds(
  actions: ProgramStepAction[],
  readingTexts: Array<string | null | undefined> = []
) {
  const stepReadingSeconds = estimateReadingSeconds(...readingTexts);
  const actionsSeconds = actions.reduce(
    (sum, action) => sum + estimateActionDurationSeconds(action),
    0
  );
  return Math.max(60, stepReadingSeconds + actionsSeconds);
}

export function estimateProgramStepDurationSeconds(
  blueprint: StepBlueprint,
  actions = buildActions(1, blueprint)
) {
  const introIsAction = actions.some(
    (action) =>
      action.type === 'guided_steps' && action.formKind === 'step_intro'
  );
  return estimateProgramStepActionsDurationSeconds(actions, [
    blueprint.title,
    blueprint.subtitle,
    blueprint.nextHint,
    blueprint.prompt,
    blueprint.primarySubtitle,
    introIsAction ? null : blueprint.introText,
    introIsAction ? null : blueprint.miniArticle?.title,
    introIsAction ? null : blueprint.miniArticle?.body,
  ]);
}

function estimateProgramStepDurationMin(
  step: number,
  blueprint: StepBlueprint
) {
  return Math.max(
    1,
    Math.ceil(
      estimateProgramStepDurationSeconds(
        blueprint,
        buildActions(step, blueprint)
      ) / 60
    )
  );
}

function formatProgramStepDurationLabel(durationMin: number) {
  const safeMinutes = Math.max(1, Math.ceil(durationMin));
  if (safeMinutes <= 5) return formatMinutesRu(safeMinutes);
  const upper = Math.ceil((safeMinutes + 2) / 5) * 5;
  const lower = Math.max(5, upper - 5);
  return `${lower}-${upper} минут`;
}

function clampDurationMinutes(minutes: number, min: number, max: number) {
  const safe = Number.isFinite(minutes) ? Math.floor(minutes) : min;
  return Math.min(max, Math.max(min, safe));
}

function buildCompletionDelaySeconds(
  blueprint: StepBlueprint,
  minMinutes: number,
  maxMinutes = 10
) {
  return (
    clampDurationMinutes(blueprint.durationMin, minMinutes, maxMinutes) * 60
  );
}

// Экспортируется для тестов (tests/peony-blueprint.test.ts).
export function buildActions(
  step: number,
  blueprint: StepBlueprint
): ProgramStepAction[] {
  const introAction = stepIntroAction(blueprint);
  if (Array.isArray(blueprint.actions) && blueprint.actions.length > 0) {
    const actions = blueprint.actions.map(({ idSuffix, ...action }) => ({
      ...action,
      id: `step-${step}-${idSuffix}`,
      completionDelaySeconds: action.completionDelaySeconds ?? null,
      required: action.required ?? true,
    }));
    if (!introAction) return actions;
    const { idSuffix, ...action } = introAction;
    return [
      {
        ...action,
        id: `step-${step}-${idSuffix}`,
        completionDelaySeconds: action.completionDelaySeconds ?? null,
        required: action.required ?? true,
      },
      ...actions,
    ];
  }

  const actions: ProgramStepAction[] = [];
  if (introAction) {
    const { idSuffix, ...action } = introAction;
    actions.push({
      ...action,
      id: `step-${step}-${idSuffix}`,
      completionDelaySeconds: action.completionDelaySeconds ?? null,
      required: action.required ?? true,
    });
  }
  actions.push({
    id: `step-${step}-mood`,
    type: 'mood_checkin',
    title: 'Как ты себя чувствуешь?',
    subtitle: 'Отметь настроение перед практикой',
    completionDelaySeconds: null,
    energy: 1,
    required: true,
  });

  const primaryAction = buildPrimaryPracticeAction(step, blueprint);
  if (primaryAction) {
    actions.push(primaryAction);
    // Reflection «Как прошло?» после practice - но НЕ после AI-чата:
    // тот же вопрос уже был частью разговора с ассистентом
    // (см. retention/retention_long_term_strategy.md «Большой разговор»).
    // Для reflection/journal-шагов primary action уже сам по себе reflection -
    // отдельный «Как прошло?» action избыточен.
    const skipReflection =
      blueprint.kind === 'ai_chat_session' ||
      blueprint.kind === 'reflection' ||
      blueprint.kind === 'journal';
    if (!skipReflection) {
      actions.push({
        id: `step-${step}-reflection`,
        type: 'ai_reflection',
        title: 'Как прошло?',
        subtitle:
          blueprint.reflectionSubtitle ??
          'Можно выбрать вариант или добавить пару слов',
        // Если для шага заданы кастомные chips, prompt-текст не передаём:
        // chips + composer и так понятны, а текст «Выбери варианты: …, …, …»
        // дублирует чипы и читается как лишний шум (UX-фидбэк сессии 15).
        prompt: blueprint.reflectionChipOptions
          ? undefined
          : blueprint.reflectionPrompt,
        chipOptions: blueprint.reflectionChipOptions,
        completionDelaySeconds: null,
        energy: 1,
        required: true,
      });
    }
  }

  // Для journal-шагов primary action - это уже сам journal_entry; финальный
  // дневник дублировал бы action и был бы избыточен. Для остальных типов
  // финальный journal остаётся.
  if (blueprint.kind !== 'journal') {
    const journalPrompt = (() => {
      if (blueprint.journalPrompt) return blueprint.journalPrompt;
      if (blueprint.kind === 'reflection') {
        return blueprint.prompt ?? '';
      }
      if (blueprint.kind === 'ai_chat_session') {
        return 'Какую одну мысль из разговора хочешь оставить себе?';
      }
      return 'Что из сегодняшней практики я хочу взять с собой в завтрашний день?';
    })();

    actions.push({
      id: `step-${step}-journal`,
      type: 'journal_entry',
      title: 'Запись в дневнике',
      subtitle:
        blueprint.journalSubtitle ?? 'Что ты {осознал|осознала} сегодня?',
      prompt: journalPrompt,
      completionDelaySeconds: null,
      energy: 1,
      required: true,
    });
  }

  return actions;
}

function buildPrimaryPracticeAction(
  step: number,
  blueprint: StepBlueprint
): ProgramStepAction | null {
  if (blueprint.kind === 'breathing') {
    const completionDelaySeconds = buildCompletionDelaySeconds(blueprint, 3);
    return {
      id: `step-${step}-breathing`,
      type: 'breathing',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ??
        `Выполни практику ${formatMinutesRu(
          Math.round(completionDelaySeconds / 60)
        )}`,
      prompt: blueprint.prompt,
      template: blueprint.template || 'calm',
      durationSeconds: completionDelaySeconds,
      completionDelaySeconds,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'quick_help_breathing') {
    const completionDelaySeconds = buildCompletionDelaySeconds(blueprint, 3);
    return {
      id: `step-${step}-quick-breathing`,
      type: 'quick_help_breathing',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ??
        `Стабилизируй дыхание ${formatMinutesRu(
          Math.round(completionDelaySeconds / 60)
        )}`,
      prompt: blueprint.prompt,
      template: blueprint.template || 'box',
      durationSeconds: completionDelaySeconds,
      completionDelaySeconds,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'quick_help_grounding') {
    return {
      id: `step-${step}-quick-grounding`,
      type: 'quick_help_grounding',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ?? 'Пройди пять коротких шагов заземления',
      prompt: blueprint.prompt,
      template: '5-4-3-2-1',
      completionDelaySeconds: null,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'quick_help_tension') {
    const completionDelaySeconds = buildCompletionDelaySeconds(blueprint, 2);
    return {
      id: `step-${step}-quick-tension`,
      type: 'quick_help_tension',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ??
        `Сними напряжение за ${formatMinutesRu(
          Math.round(completionDelaySeconds / 60)
        )}`,
      prompt: blueprint.prompt,
      durationSeconds: completionDelaySeconds,
      completionDelaySeconds,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'thought_dump') {
    return {
      id: `step-${step}-thought-dump`,
      type: 'thought_dump',
      // title = primarySubtitle чтобы не дублировать заголовок шага из header'а.
      title: blueprint.primarySubtitle ?? blueprint.title,
      subtitle: undefined,
      prompt: blueprint.prompt,
      completionDelaySeconds: null,
      energy: 1,
      required: true,
    };
  }

  if (blueprint.kind === 'meditation') {
    const completionDelaySeconds = buildCompletionDelaySeconds(blueprint, 3);
    return {
      id: `step-${step}-meditation`,
      type: 'meditation',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ??
        `Прослушай аудио-практику ${formatMinutesRu(
          Math.round(completionDelaySeconds / 60)
        )}`,
      prompt: blueprint.prompt,
      template: blueprint.template || 'anxiety',
      targetId: blueprint.targetId,
      durationSeconds: completionDelaySeconds,
      completionDelaySeconds,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'ai_chat_session') {
    // AI-чат как тип шага Roadmap (retention/retention_long_term_strategy.md).
    // Embedded ChatRoom внутри step runner'а с собственными порогами eligibility.
    return {
      id: `step-${step}-ai-chat`,
      type: 'ai_chat_session',
      title: blueprint.title,
      subtitle: blueprint.subtitle,
      topicPrompt: blueprint.topicPrompt,
      goalHint: blueprint.goalHint,
      minQualifyingMessages: blueprint.minQualifyingMessages,
      minDurationSec: blueprint.minDurationSec,
      completionDelaySeconds: null,
      energy: 3,
      required: true,
    };
  }

  // reflection-шаги - primary action = ai_reflection с CBT-промптом. Этот action
  // и есть сам шаг (выбор вариантов + текстовое поле); отдельный «Как прошло?»
  // не добавляется (см. skipReflection в buildActions).
  //
  // title = primarySubtitle, чтобы не дублировать заголовок шага (blueprint.title
  // показывается в ProgramStepHeader сверху). primarySubtitle описывает «что
  // делаем сейчас» («Что сейчас просит внимания», «Где тревога звучит как факт»),
  // а сам blueprint.prompt идёт в action.prompt и рендерится UI как CBT-вопрос.
  if (blueprint.kind === 'reflection') {
    return {
      id: `step-${step}-reflection`,
      type: 'ai_reflection',
      title: blueprint.primarySubtitle ?? blueprint.title,
      subtitle: undefined,
      prompt: blueprint.prompt,
      chipOptions: blueprint.chipOptions,
      completionDelaySeconds: null,
      energy: 1,
      required: true,
    };
  }

  // journal-шаги - primary action = journal_entry. Тот же текст идёт в основную
  // запись дневника благодарности.
  // title = primarySubtitle чтобы не дублировать заголовок шага.
  if (blueprint.kind === 'journal') {
    return {
      id: `step-${step}-journal-primary`,
      type: 'journal_entry',
      title: blueprint.primarySubtitle ?? blueprint.title,
      subtitle: undefined,
      prompt: blueprint.prompt,
      completionDelaySeconds: null,
      energy: 1,
      required: true,
    };
  }

  return null;
}

function normalizeActions(value: unknown): ProgramStepAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ProgramStepActionDto.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function normalizeAttemptActions(value: unknown): ProgramStepActionStateDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ProgramStepActionStateSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function prepareAttemptActions(params: {
  templateActions: ProgramStepAction[];
  hadMoodToday: boolean;
}): ProgramStepActionStateDto[] {
  // Cast ниже снимает структурное несоответствие между ProgramStepAction
  // (inline-типы в schema.ts) и ProgramStepActionDto (Zod-выведенный тип).
  // Поля совпадают, отличия только в способе типизации nullable/optional.
  // Данные дальше валидируются через ProgramStepActionDto.parse, поэтому
  // приведение безопасно.
  return (
    params.templateActions
      // Если состояние уже отмечено сегодня на главной, не дублируем тот же
      // вопрос внутри ежедневного шага.
      .filter(
        (action) => !(params.hadMoodToday && action.type === 'mood_checkin')
      )
      .map((action) => {
        const isTimedPractice =
          action.type === 'breathing' ||
          action.type === 'quick_help_breathing' ||
          action.type === 'quick_help_tension' ||
          action.type === 'meditation';
        const minDelaySeconds =
          action.type === 'quick_help_tension' ? 120 : 180;
        const rawDelaySeconds =
          typeof action.completionDelaySeconds === 'number'
            ? action.completionDelaySeconds
            : typeof action.durationSeconds === 'number'
              ? action.durationSeconds
              : null;
        // Выделяем явный number для timed-практик, чтобы TS не выводил union
        // `number | null` в durationSeconds ниже (DTO ожидает только number | undefined).
        const timedDurationSeconds = Math.max(
          minDelaySeconds,
          rawDelaySeconds ?? minDelaySeconds
        );
        const completionDelaySeconds = isTimedPractice
          ? timedDurationSeconds
          : (action.completionDelaySeconds ?? null);
        const isRequiredRoadmapAction =
          action.type === 'mood_checkin' ||
          action.type === 'breathing' ||
          action.type === 'quick_help_breathing' ||
          action.type === 'quick_help_grounding' ||
          action.type === 'quick_help_tension' ||
          action.type === 'meditation' ||
          action.type === 'ai_reflection' ||
          action.type === 'micro_reflection' ||
          action.type === 'rating_scale' ||
          action.type === 'next_route_choice' ||
          action.type === 'journal_entry' ||
          action.type === 'thought_dump' ||
          action.type === 'ai_chat_session' ||
          action.type === 'structured_form' ||
          action.type === 'guided_steps' ||
          action.type === 'weekly_check';

        return {
          ...action,
          durationSeconds: isTimedPractice
            ? timedDurationSeconds
            : action.durationSeconds,
          completionDelaySeconds,
          required: action.required ?? isRequiredRoadmapAction,
          status: 'pending' as const,
        };
      }) as ProgramStepActionStateDto[]
  );
}

// Таймерные практики (анти-чит ожидание таймера перед «Продолжить»).
const TIMED_PRACTICE_ACTION_TYPES = new Set([
  'breathing',
  'quick_help_breathing',
  'quick_help_tension',
  'meditation',
]);

/**
 * При replay или повторном открытии уже завершённого шага не заставляем юзера
 * заново высиживать таймерные практики (медитация, дыхание): переносим их
 * completed-статус и output из последнего attempt этого шага. Юзер всё ещё может
 * переслушать практику, но кнопка «Продолжить» не блокируется таймером заново.
 *
 * Переносим только таймерные типы: рефлексии, дневник и формы при повторном
 * прохождении логично заполнять заново.
 */
function carryOverCompletedTimedPractices(params: {
  templateActions: ProgramStepActionStateDto[];
  priorActions: ProgramStepActionStateDto[];
}): ProgramStepActionStateDto[] {
  const completedTimedById = new Map(
    params.priorActions
      .filter(
        (action) =>
          action.status === 'completed' &&
          TIMED_PRACTICE_ACTION_TYPES.has(action.type)
      )
      .map((action) => [action.id, action])
  );
  if (completedTimedById.size === 0) return params.templateActions;
  return params.templateActions.map((action) => {
    const prior = completedTimedById.get(action.id);
    if (!prior) return action;
    return {
      ...action,
      status: 'completed' as const,
      output: prior.output,
    };
  });
}

function comparableAttemptAction(action: ProgramStepActionStateDto) {
  const templateAction = { ...action };
  delete templateAction.status;
  delete templateAction.output;
  return templateAction;
}

function mergeAttemptActionsWithTemplate(params: {
  existingActions: ProgramStepActionStateDto[];
  templateActions: ProgramStepActionStateDto[];
}) {
  const existingById = new Map(
    params.existingActions.map((action) => [action.id, action])
  );

  return params.templateActions.map((templateAction) => {
    const existing = existingById.get(templateAction.id);
    if (!existing) return templateAction;
    return {
      ...templateAction,
      status: existing.status ?? templateAction.status,
      output: existing.output,
    };
  });
}

function attemptActionsNeedTemplateRefresh(params: {
  existingActions: ProgramStepActionStateDto[];
  templateActions: ProgramStepActionStateDto[];
}) {
  return (
    JSON.stringify(params.existingActions.map(comparableAttemptAction)) !==
    JSON.stringify(params.templateActions.map(comparableAttemptAction))
  );
}

function readStepMiniArticle(
  value: unknown
): NonNullable<ProgramStepDto['miniArticle']> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  if (typeof item.title !== 'string' || typeof item.body !== 'string') {
    return null;
  }
  const sourceNotes = Array.isArray(item.sourceNotes)
    ? item.sourceNotes.filter(
        (note): note is string => typeof note === 'string' && note.length > 0
      )
    : undefined;

  return {
    title: item.title,
    body: item.body,
    sourceNotes,
    readingLevel: item.readingLevel === 'simple' ? 'simple' : undefined,
  };
}

function readStepContentMetadata(
  metadata: unknown
): Pick<ProgramStepDto, 'introText' | 'miniArticle'> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      introText: null,
      miniArticle: null,
    };
  }
  const item = metadata as Record<string, unknown>;
  return {
    introText: typeof item.introText === 'string' ? item.introText : null,
    miniArticle: readStepMiniArticle(item.miniArticle),
  };
}

function buildStepTemplateMetadata(blueprint: StepBlueprint) {
  return {
    kind: blueprint.kind ?? 'explicit_actions',
    template: blueprint.template || null,
    introText: blueprint.introText ?? null,
    miniArticle: blueprint.miniArticle ?? null,
  };
}

function stepTemplateNeedsRefresh(
  row: {
    chapter: number;
    title: string;
    subtitle: string | null;
    nextHint: string | null;
    durationMin: number;
    energyReward: number;
    actions: unknown;
    metadata: Record<string, unknown>;
  },
  step: number,
  blueprint: StepBlueprint,
  totalSteps: number = 30,
  slug?: string | null
) {
  const expectedActions = buildActions(step, blueprint);
  const expectedMetadata = buildStepTemplateMetadata(blueprint);
  const expectedDurationMin = estimateProgramStepDurationMin(step, blueprint);

  return (
    row.chapter !== chapterForStep(step, totalSteps, slug) ||
    row.title !== blueprint.title ||
    (row.subtitle ?? '') !== blueprint.subtitle ||
    (row.nextHint ?? '') !== blueprint.nextHint ||
    row.durationMin !== expectedDurationMin ||
    row.energyReward !== 5 ||
    JSON.stringify(normalizeActions(row.actions)) !==
      JSON.stringify(expectedActions) ||
    JSON.stringify(row.metadata ?? {}) !== JSON.stringify(expectedMetadata)
  );
}

function moodScore(mood: MoodCheckinMood): number {
  return {
    very_bad: 1,
    sad: 2,
    neutral: 3,
    good: 4,
    great: 5,
  }[mood];
}

function moodFromDb(value: string): MoodCheckinMood {
  const parsed = MoodCheckinMoodEnum.safeParse(value);
  return parsed.success ? parsed.data : 'neutral';
}

function toMoodDto(row: typeof moodCheckins.$inferSelect) {
  return {
    id: row.id,
    mood: moodFromDb(row.mood),
    score: row.score,
    entryDate: row.entryDate,
    source:
      row.source === 'program_step' || row.source === 'roadmap'
        ? row.source
        : 'home',
    createdAt: row.createdAt.toISOString(),
  };
}

function toThoughtDto(
  row: typeof dailyThoughts.$inferSelect
): ThoughtOfTheDayDto {
  return {
    id: row.id,
    entryDate: row.entryDate,
    text: row.text,
    source: row.source,
    saved: Boolean(row.savedAt),
  };
}

function toAttemptDto(row: typeof userProgramStepAttempts.$inferSelect): {
  id: number;
  step: number;
  replay: boolean;
  status: 'started' | 'completed';
  rewardGranted: boolean;
  actions: ProgramStepActionStateDto[];
  startedAt: string;
  completedAt: string | null;
} {
  const actions = Array.isArray(row.actions)
    ? (row.actions as ProgramStepActionStateDto[])
    : [];

  return {
    id: row.id,
    step: row.step,
    replay: row.replay,
    status: row.status === 'completed' ? 'completed' : 'started',
    rewardGranted: row.rewardGranted,
    actions,
    startedAt: row.startedAt.toISOString(),
    completedAt: toIsoString(row.completedAt),
  };
}

// Bootstrap-метаданные для каждого Сада. Используются при ensureProgram() - заводят
// запись в БД, если её ещё нет, и обновляют поля для уже существующих записей.
// При расширении до multi-Сад сюда добавляются новые элементы (см. retention/retention_long_term_strategy.md).
type ProgramBootstrap = {
  slug: string;
  title: string;
  subtitle: string | null;
  plantSetSlug: string;
  difficulty: 'gentle' | 'standard' | 'deep' | null;
  summaryText: string | null;
  totalSteps: number;
  themes: string[];
  requiredPlan: string | null;
  unlockRule: { kind: 'always' } | { kind: 'after_n_completed'; n: number };
};

const PROGRAM_BOOTSTRAP: Record<string, ProgramBootstrap> = {
  [DEFAULT_RETENTION_PROGRAM_SLUG]: {
    slug: DEFAULT_RETENTION_PROGRAM_SLUG,
    title: 'Спокойствие',
    subtitle: '30 шагов для мягкой работы с тревогой и стрессом',
    // На P1.5 первый Сад привязан к набору ассетов orchid (15 кадров готовы
    // в public/retention/plant/states/orchid/). Sunflower-сет будет
    // подключён позже, когда дорисуем его 15 стадий.
    plantSetSlug: 'orchid',
    difficulty: 'gentle',
    summaryText:
      'Сад Спокойствия - стартовый путь о том, как видеть тревогу как сигнал, а не как факт, и о мягких опорах для нервной системы.',
    totalSteps: 30,
    themes: ['anxiety', 'stress', 'calm'],
    requiredPlan: null,
    unlockRule: { kind: 'always' },
  },
  // Сад #2 «Внутренний критик» (Peony) - полноценная программа на 21 шаг
  // (см. STEP_BLUEPRINTS_SELF_KINDNESS_21 и
  // .docs/content/program_self_kindness_21.md). Методическая база:
  // Neff: три компонента самосострадания; Hayes: терапия принятия и
  // ответственности и дефузия; Salzberg: медитация доброжелательности;
  // Gilbert: терапия, сфокусированная на сострадании.
  // Открывается после завершения 1 регулярного Сада (Orchid).
  self_kindness_21: {
    slug: 'self_kindness_21',
    title: 'Внутренний критик',
    subtitle: 'Меньше самокритики и говорить с собой мягче',
    plantSetSlug: 'peony',
    difficulty: 'gentle',
    summaryText:
      'Сад «Внутренний критик» помогает замечать жёсткий внутренний тон, снижать самокритику и находить слова поддержки в трудные моменты.',
    totalSteps: 21,
    themes: ['self_compassion', 'inner_critic', 'kindness'],
    requiredPlan: null,
    unlockRule: { kind: 'after_n_completed', n: 1 },
  },
  // Сад #3 «Отношения» (Cyclamen) - полноценная программа на 21 шаг
  // (см. STEP_BLUEPRINTS_RELATIONSHIPS_21 в ./blueprints/relationships-21.ts).
  // Методическая база: ассертивность (границы, мягкий отказ, я-сообщения),
  // КПТ (проверка прогнозов, правила-убеждения), ACT (ценности в отношениях),
  // EFT/Готтман (близость, ремонт после конфликта).
  // Открывается после завершения 2 Садов (calm + self_kindness).
  relationships_21: {
    slug: 'relationships_21',
    title: 'Отношения',
    subtitle: '21 шаг о границах, близости и своих словах',
    plantSetSlug: 'cyclamen',
    difficulty: 'standard',
    summaryText:
      'Сад Отношений - про умение быть рядом с людьми, не теряя себя: пауза перед автоматическим «да», мягкий отказ без вины, просьба о поддержке и восстановление тепла после ссор.',
    totalSteps: 21,
    themes: ['relationships', 'boundaries', 'intimacy'],
    requiredPlan: null,
    unlockRule: { kind: 'after_n_completed', n: 2 },
  },
  // Сад #4 «Выгорание» (Azalea) - полноценная программа на 21 шаг
  // (см. STEP_BLUEPRINTS_BURNOUT_21 в ./blueprints/burnout-21.ts). Акцент
  // универсальный: работа, быт, забота о близких, учёба. Методическая база:
  // рамка выгорания Maslach (истощение, отстранённость, падение веры в себя)
  // как карта понимания; поведенческая активация (восстановительный отдых,
  // баланс нагрузки); КПТ (правила «отдых стыдно», перфекционизм, поведенческий
  // эксперимент); управление нагрузкой; self-compassion (Neff); ACT (ценности).
  // Красная линия: разведение выгорания и депрессии с маршрутизацией к живой
  // помощи. Открывается после завершения 3 Садов (calm + self_kindness +
  // relationships). Ассеты азалии (15 стадий) к публикации должны лежать в
  // public/retention/plant/states/azalea/.
  burnout_21: {
    slug: 'burnout_21',
    title: 'Выгорание',
    subtitle: '21 шаг к восстановлению, когда сил почти не осталось',
    plantSetSlug: 'azalea',
    difficulty: 'standard',
    summaryText:
      'Сад Выгорания - про мягкое восстановление, когда сил почти не осталось: вернуть телу опору, заметить, куда они утекают, снять часть нагрузки и собрать набор на трудные дни.',
    totalSteps: 21,
    themes: ['burnout', 'recovery'],
    requiredPlan: null,
    unlockRule: { kind: 'after_n_completed', n: 3 },
  },
  // Сад #5 «Мягкий сон» (Tulip Queen of Night) - полноценная программа на
  // 21 шаг (см. STEP_BLUEPRINTS_GENTLE_SLEEP_21 в ./blueprints/gentle-sleep-21.ts).
  // Методическая база: CBT-I (стимульный контроль Bootzin, когнитивная работа
  // с «я не усну» и подсчётом часов, психоэдукация: двухпроцессная модель,
  // гиперактивация); constructive worry; парадоксальная интенция (Франкл);
  // релаксация (дыхание, PMR, body scan). Жёсткое ограничение сна сознательно
  // не используется. Красные линии: апноэ, снотворные, хроническая бессонница,
  // депрессия - маршрутизация к врачу (шаг 4). Открывается после завершения
  // 4 Садов. Ассеты тюльпана (15 стадий) к публикации должны лежать в
  // public/retention/plant/states/tulip_queen_of_night/.
  gentle_sleep_21: {
    slug: 'gentle_sleep_21',
    title: 'Мягкий сон',
    subtitle: '21 шаг к спокойным вечерам и ночам без борьбы за сон',
    plantSetSlug: 'tulip_queen_of_night',
    difficulty: 'standard',
    summaryText:
      'Сад Мягкого сна - про ночи без борьбы: вечер, в котором день успевает закончиться, кровать, которая снова значит сон, и спокойные ответы на ночные мысли и пробуждения.',
    totalSteps: 21,
    themes: ['sleep', 'rest'],
    requiredPlan: null,
    unlockRule: { kind: 'after_n_completed', n: 4 },
  },
};

// Тизеры будущих Садов. Контента шагов у них ещё нет - в БД заводится только
// карточка-метаданные со status='coming_soon'. В Оранжерее они показываются под
// замком с пометкой «Скоро»; стартовать их нельзя, пока сад не переведён в
// published (т.е. пока не появится полноценный bootstrap в PROGRAM_BOOTSTRAP).
//
// Чтобы «открыть» тизер: добавляешь его slug в PROGRAM_BOOTSTRAP с blueprints
// шагов - ensureProgramBySlug сам перепишет статус на published. Чтобы убрать
// тизер из витрины - удали запись здесь (sync не удаляет осиротевшие строки
// автоматически, см. примечание в ensureTeaserPrograms).
type ProgramTeaser = {
  slug: string;
  title: string;
  subtitle: string;
  plantSetSlug: string | null;
  totalSteps: number;
  themes: string[];
  unlockRule: { kind: 'after_n_completed'; n: number };
};

// Реальные Сады по дорожной карте retention/retention_long_term_strategy.md
// Порядок совпадает с таблицей (#3–#9). Два первых (calm_anxiety_30 и
// self_kindness_21) уже в PROGRAM_BOOTSTRAP - здесь не дублируем.
const COMING_SOON_TEASERS: ProgramTeaser[] = [
  // Сад #3 «Отношения» переведён из тизера в PROGRAM_BOOTSTRAP (контент готов).
  {
    // Сад #4: ассеты азалии в работе
    slug: 'burnout_21',
    title: 'Выгорание',
    subtitle: 'Мягкое восстановление, когда ресурсов больше нет',
    plantSetSlug: null,
    totalSteps: 21,
    themes: ['burnout', 'recovery'],
    unlockRule: { kind: 'after_n_completed', n: 3 },
  },
  // Сад #5 «Мягкий сон» переведён из тизера в PROGRAM_BOOTSTRAP (контент готов).
  {
    // Сад #6: георгин Café au Lait
    slug: 'emotion_regulation_21',
    title: 'Эмоции',
    subtitle:
      'Понимать злость, выдерживать импульсы и выражать чувства без вреда',
    plantSetSlug: null,
    totalSteps: 21,
    themes: ['anger', 'emotions', 'regulation'],
    unlockRule: { kind: 'after_n_completed', n: 5 },
  },
  {
    // Сад #7: ландыш (P2)
    slug: 'sustainable_habits_21',
    title: 'Привычки',
    subtitle: 'Базовые ритуалы, которые поддерживают тело мягко и регулярно',
    plantSetSlug: null,
    totalSteps: 21,
    themes: ['habits', 'body'],
    unlockRule: { kind: 'after_n_completed', n: 6 },
  },
  {
    // Сад #8: подсолнух (P2)
    slug: 'joy_practice_21',
    title: 'Радость',
    subtitle: 'Замечать маленькое хорошее и возвращать в жизнь удовольствие',
    plantSetSlug: null,
    totalSteps: 21,
    themes: ['joy', 'gratitude', 'pleasure'],
    unlockRule: { kind: 'after_n_completed', n: 7 },
  },
  {
    // Сад #9: Король Протея, 28 шагов (P3)
    slug: 'purpose_28',
    title: 'Смысл',
    subtitle:
      'Найти ориентиры и направление - без давления и поиска «правильного» ответа',
    plantSetSlug: null,
    totalSteps: 28,
    themes: ['purpose', 'meaning', 'direction'],
    unlockRule: { kind: 'after_n_completed', n: 8 },
  },
];

/**
 * Заводит/обновляет тизер-карточки будущих Садов (status='coming_soon').
 *
 * Idempotent: на конфликте по slug обновляет только витринные поля и держит
 * status='coming_soon'. Если slug позже появится в PROGRAM_BOOTSTRAP,
 * ensureProgramBySlug перетрёт status на 'published' - поэтому тизер и готовый
 * Сад с одним slug не конфликтуют. Осиротевшие тизеры (удалённые отсюда) sync
 * не подчищает - это редкая ручная операция.
 */
async function ensureTeaserPrograms(): Promise<void> {
  if (COMING_SOON_TEASERS.length === 0) return;
  await db
    .insert(programs)
    .values(
      COMING_SOON_TEASERS.map((teaser) => ({
        slug: teaser.slug,
        title: teaser.title,
        subtitle: teaser.subtitle,
        totalSteps: teaser.totalSteps,
        themes: teaser.themes,
        requiredPlan: null,
        plantSetSlug: teaser.plantSetSlug,
        difficulty: 'gentle' as const,
        summaryText: teaser.subtitle,
        unlockRule: teaser.unlockRule,
        status: 'coming_soon' as const,
        metadata: { teaser: true },
      }))
    )
    .onConflictDoUpdate({
      target: programs.slug,
      set: {
        title: sql`excluded.title`,
        subtitle: sql`excluded.subtitle`,
        totalSteps: sql`excluded.total_steps`,
        unlockRule: sql`excluded.unlock_rule`,
        updatedAt: new Date(),
      },
      // Не трогаем status у уже published-садов: если slug стал готовым через
      // PROGRAM_BOOTSTRAP, тизер-sync не должен откатить его в coming_soon.
      setWhere: sql`${programs.status} = 'coming_soon'`,
    });
}

// In-process кэш: после первого successful ensure программа не нуждается в повторном UPSERT.
// Сбрасывается только при перезапуске сервера (деплой), что и так запускает bootstrap заново.
type ProgramRow = typeof programs.$inferSelect;
const programCache = new Map<string, ProgramRow>();

async function ensureProgramBySlug(slug: string) {
  if (programCache.has(slug)) return programCache.get(slug)!;

  const bootstrap = PROGRAM_BOOTSTRAP[slug];
  if (!bootstrap) {
    throw new Error(`No bootstrap registered for program slug: ${slug}`);
  }
  const blueprints = getStepBlueprintsForSlug(slug);

  await db
    .insert(programs)
    .values({
      slug: bootstrap.slug,
      title: bootstrap.title,
      subtitle: bootstrap.subtitle,
      totalSteps: blueprints.length,
      themes: bootstrap.themes,
      requiredPlan: bootstrap.requiredPlan,
      plantSetSlug: bootstrap.plantSetSlug,
      difficulty: bootstrap.difficulty,
      summaryText: bootstrap.summaryText,
      unlockRule: bootstrap.unlockRule,
      status: 'published',
      metadata: { bootstrap: true },
    })
    .onConflictDoUpdate({
      target: programs.slug,
      // Bootstrap-программа живёт в коде - при изменении ассетов растения / лора
      // существующая запись подтягивает новые значения без ручной миграции.
      // status='published' проставляем явно: если slug раньше был заведён как
      // тизер (coming_soon), появление blueprints переводит его в готовые.
      set: {
        plantSetSlug: bootstrap.plantSetSlug,
        difficulty: bootstrap.difficulty,
        summaryText: bootstrap.summaryText,
        unlockRule: bootstrap.unlockRule,
        status: 'published',
        updatedAt: new Date(),
      },
    });

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, slug))
    .limit(1);

  if (!program) {
    throw new Error(`Retention program was not created for slug: ${slug}`);
  }

  const existingSteps = await db
    .select({
      step: programStepTemplates.step,
      chapter: programStepTemplates.chapter,
      title: programStepTemplates.title,
      subtitle: programStepTemplates.subtitle,
      nextHint: programStepTemplates.nextHint,
      durationMin: programStepTemplates.durationMin,
      energyReward: programStepTemplates.energyReward,
      actions: programStepTemplates.actions,
      metadata: programStepTemplates.metadata,
    })
    .from(programStepTemplates)
    .where(eq(programStepTemplates.programId, program.id));
  const existingByStep = new Map(
    existingSteps.map((item) => [item.step, item])
  );
  const existing = new Set(existingByStep.keys());
  const desiredSteps = blueprints.map((blueprint, index) => ({
    blueprint,
    step: index + 1,
  }));
  const missing = desiredSteps.filter((item) => !existing.has(item.step));

  const totalSteps = blueprints.length;
  if (missing.length) {
    await db
      .insert(programStepTemplates)
      .values(
        missing.map(({ blueprint, step }) => ({
          programId: program.id,
          step,
          chapter: chapterForStep(step, totalSteps, slug),
          title: blueprint.title,
          subtitle: blueprint.subtitle,
          nextHint: blueprint.nextHint,
          durationMin: estimateProgramStepDurationMin(step, blueprint),
          energyReward: 5,
          actions: buildActions(step, blueprint),
          metadata: buildStepTemplateMetadata(blueprint),
        }))
      )
      .onConflictDoNothing();
  }

  const existingDesiredSteps = desiredSteps.filter(({ blueprint, step }) => {
    const row = existingByStep.get(step);
    return row
      ? stepTemplateNeedsRefresh(row, step, blueprint, totalSteps, slug)
      : false;
  });
  if (existingDesiredSteps.length) {
    // Bootstrap-программа живёт в коде, но лишние update на каждый /api/today не нужны.
    await Promise.all(
      existingDesiredSteps.map(({ blueprint, step }) =>
        db
          .update(programStepTemplates)
          .set({
            chapter: chapterForStep(step, totalSteps, slug),
            title: blueprint.title,
            subtitle: blueprint.subtitle,
            nextHint: blueprint.nextHint,
            durationMin: estimateProgramStepDurationMin(step, blueprint),
            energyReward: 5,
            actions: buildActions(step, blueprint),
            metadata: buildStepTemplateMetadata(blueprint),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(programStepTemplates.programId, program.id),
              eq(programStepTemplates.step, step)
            )
          )
      )
    );
  }

  programCache.set(slug, program);
  return program;
}

// Флаг гарантирует, что syncRetentionProgramBootstraps выполняется один раз за
// жизнь процесса. Nitro plugin вызывает его при старте; повторные вызовы — no-op.
let bootstrapSyncPromise: Promise<void> | null = null;
let bootstrapSyncDone = false;

export async function syncRetentionProgramBootstraps(): Promise<void> {
  if (bootstrapSyncDone) return;
  if (bootstrapSyncPromise) return bootstrapSyncPromise;

  bootstrapSyncPromise = (async () => {
    try {
      // Оранжерея читает список доступных Садов напрямую из `programs`, поэтому
      // перед snapshot синхронизируем кодовые bootstrap-метаданные с БД.
      await Promise.all(
        Object.keys(PROGRAM_BOOTSTRAP).map((slug) => ensureProgramBySlug(slug))
      );
      // Тизеры будущих Садов («Скоро») - лёгкие карточки без шагов.
      await ensureTeaserPrograms();
      bootstrapSyncDone = true;
    } finally {
      // Сброс в любом случае: если промис завис в rejected — следующий запрос
      // должен получить новую попытку, а не ту же зафиксированную ошибку.
      bootstrapSyncPromise = null;
    }
  })();
  return bootstrapSyncPromise;
}

async function ensureUserProgram(userId: number, programId: number) {
  // INSERT RETURNING: при успешной вставке возвращает новую строку (1 round trip).
  // При конфликте (onConflictDoNothing) returning() вернёт пустой массив — тогда
  // делаем SELECT (итого 2 round trips, только для повторных вызовов).
  const [inserted] = await db
    .insert(userPrograms)
    .values({
      userId,
      programId,
      currentStep: 1,
      status: 'active',
      metadata: {},
    })
    .onConflictDoNothing({
      target: [userPrograms.userId, userPrograms.programId],
    })
    .returning();

  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(userPrograms)
    .where(
      and(
        eq(userPrograms.userId, userId),
        eq(userPrograms.programId, programId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error('User retention program was not created');
  }

  return existing;
}

export async function getUserTimezone(userId: number): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.timezone || DEFAULT_TIMEZONE;
}

/**
 * Пол пользователя для гендеризации статических текстов программ.
 * При отсутствии (легаси-записи до обязательного онбординга) дефолтит на мужской -
 * см. gendered-text.ts.
 */
export async function getUserGender(userId: number): Promise<UserGender> {
  const [row] = await db
    .select({ gender: users.gender })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.gender === 'female' ? 'female' : 'male';
}

/**
 * Возвращает slug «текущей» программы пользователя для эндпоинтов вроде
 * `/api/today`. Приоритет:
 *  1. Активная программа (status='active'), последняя начатая.
 *  2. Если активных нет - последняя завершённая (контекст для пользователя
 *     который завершил сад и ещё не стартанул следующий - он увидит свой
 *     завершённый Сад на главной с CTA «Посадить следующий сад»).
 *  3. Если у пользователя ещё ни одной user_program нет - DEFAULT slug.
 */
export async function getCurrentProgramSlugForUser(
  userId: number
): Promise<string> {
  // 1. Активные программы - берём последнюю начатую.
  const [active] = await db
    .select({ programSlug: programs.slug, startedAt: userPrograms.startedAt })
    .from(userPrograms)
    .innerJoin(programs, eq(programs.id, userPrograms.programId))
    .where(
      and(eq(userPrograms.userId, userId), eq(userPrograms.status, 'active'))
    )
    .orderBy(desc(userPrograms.startedAt))
    .limit(1);
  if (active) return active.programSlug;

  // 2. Завершённые - последняя по completedAt.
  const [completed] = await db
    .select({ programSlug: programs.slug })
    .from(userPrograms)
    .innerJoin(programs, eq(programs.id, userPrograms.programId))
    .where(
      and(eq(userPrograms.userId, userId), eq(userPrograms.status, 'completed'))
    )
    .orderBy(desc(userPrograms.completedAt))
    .limit(1);
  if (completed) return completed.programSlug;

  // 3. Fallback на дефолтный (новый юзер без user_programs).
  return DEFAULT_RETENTION_PROGRAM_SLUG;
}

export async function getOrCreateProgramOverview(
  userId: number,
  slug = DEFAULT_RETENTION_PROGRAM_SLUG
): Promise<ProgramOverviewDto> {
  // gender не зависит от program — запускаем параллельно с ensureProgramBySlug.
  const [program, gender] = await Promise.all([
    ensureProgramBySlug(slug),
    getUserGender(userId),
  ]);
  const userProgram = await ensureUserProgram(userId, program.id);
  // steps и progressRows не зависят друг от друга — запрашиваем параллельно.
  const [steps, progressRows] = await Promise.all([
    db
      .select()
      .from(programStepTemplates)
      .where(eq(programStepTemplates.programId, program.id))
      .orderBy(asc(programStepTemplates.step)),
    db
      .select()
      .from(userProgramStepProgress)
      .where(eq(userProgramStepProgress.userProgramId, userProgram.id)),
  ]);
  const progressByStepId = new Map(
    progressRows.map((progress) => [progress.stepTemplateId, progress])
  );

  const completedSteps = progressRows.filter(
    (progress) => progress.status === 'completed'
  ).length;
  const currentStep = Math.min(
    Math.max(userProgram.currentStep, 1),
    program.totalSteps
  );

  const stepItems: ProgramStepDto[] = steps.map((step) => {
    const progress = progressByStepId.get(step.id);
    const isCompleted = progress?.status === 'completed';
    // Cast actions: schema.ts ProgramStepAction и Zod ProgramStepActionStateDto
    // структурно совместимы, но TS видит расхождение в способе типизации
    // nullable/optional полей. Данные ниже сериализуются через Zod на API-уровне.
    const actions = normalizeActions(
      step.actions
    ) as unknown as ProgramStepActionStateDto[];
    const contentMetadata = readStepContentMetadata(step.metadata);
    const status = isCompleted
      ? 'completed'
      : step.step === currentStep
        ? 'active'
        : step.step === currentStep + 1
          ? 'available'
          : 'locked';

    return {
      id: step.id,
      step: step.step,
      chapter: step.chapter,
      title: step.title,
      subtitle: step.subtitle ?? null,
      nextHint: step.nextHint ?? null,
      introText: contentMetadata.introText,
      miniArticle: contentMetadata.miniArticle,
      durationMin: step.durationMin,
      durationLabel: formatProgramStepDurationLabel(step.durationMin),
      energyReward: step.energyReward,
      actions,
      status,
      completedAt: toIsoString(progress?.completedAt),
    };
  });

  const chapters = getProgramChaptersForTotalSteps(
    program.totalSteps,
    program.slug
  ).map((chapter) => ({
    chapter: chapter.chapter,
    title: chapter.title,
    stepRange: chapter.stepRange,
    accent: chapter.accent as ChapterAccent,
    steps: stepItems.filter((step) => step.chapter === chapter.chapter),
  }));

  const currentStepItem =
    stepItems.find((step) => step.step === currentStep) ?? null;

  // Прогресс по под-этапам текущего шага: если есть незавершённая попытка
  // (status='started') с частью пройденных action'ов - фронт покажет
  // «Продолжить». Считаем только required-действия (как в completeProgramStep).
  let currentStepProgress: { doneCount: number; totalCount: number } | null =
    null;
  if (currentStepItem) {
    const [startedAttempt] = await db
      .select()
      .from(userProgramStepAttempts)
      .where(
        and(
          eq(userProgramStepAttempts.userProgramId, userProgram.id),
          eq(userProgramStepAttempts.stepTemplateId, currentStepItem.id),
          eq(userProgramStepAttempts.status, 'started')
        )
      )
      .orderBy(desc(userProgramStepAttempts.updatedAt))
      .limit(1);

    if (startedAttempt) {
      const attemptActions = normalizeAttemptActions(startedAttempt.actions);
      const requiredActions = attemptActions.filter(
        (action) => action.required !== false
      );
      const doneCount = requiredActions.filter(
        (action) => action.status === 'completed'
      ).length;
      currentStepProgress = {
        doneCount,
        totalCount: requiredActions.length,
      };
    }
  }

  const overview: ProgramOverviewDto = {
    id: program.id,
    slug: program.slug,
    title: program.title,
    subtitle: program.subtitle ?? null,
    totalSteps: program.totalSteps,
    currentStep,
    completedSteps,
    progressPercent: Math.round((completedSteps / program.totalSteps) * 100),
    currentStepItem,
    currentStepProgress,
    chapters,
    plantSetSlug: program.plantSetSlug ?? null,
  };

  // Единая точка резолва гендерных форм `{м|ж}` во всех текстовых полях DTO.
  return applyGenderDeep(overview, gender);
}

/**
 * Сколько новых шагов программы пользователь завершил за указанный локальный день.
 * Replay не учитывается - для replay не создаётся energy_event (source='program_step_complete').
 */
export async function countCompletedProgramStepsForDate(
  userId: number,
  entryDate: string
): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(energyEvents)
    .where(
      and(
        eq(energyEvents.userId, userId),
        eq(energyEvents.source, 'program_step_complete'),
        eq(energyEvents.eventDate, entryDate)
      )
    );
  return Number(row?.count ?? 0);
}

export type ProgramDailyLimitState = {
  dailyStepLimit: number;
  stepsDoneToday: number;
  nextResetAt: Date | null;
};

/**
 * Дневной лимит шагов для пользователя с учётом дня активной программы.
 *
 * День считается от `startedAt` последней активной `user_programs` в локальной
 * таймзоне пользователя: день 0 и 1 → 3 шага, дальше → 2 (см.
 * DAILY_STEP_LIMIT_SCHEDULE). Нет активной программы — считаем это днём 0:
 * программа создаётся при старте первого шага, и новый пользователь должен
 * сразу видеть стартовый лимит.
 *
 * Лимит общий на все программы, но при старте новой программы (новое растение
 * в Саду) onboarding-буст первых дней включается заново — это осознанно.
 */
async function getDailyStepLimitForUser(
  userId: number,
  timezone: string,
  now: Date
): Promise<number> {
  const [active] = await db
    .select({ startedAt: userPrograms.startedAt })
    .from(userPrograms)
    .where(
      and(eq(userPrograms.userId, userId), eq(userPrograms.status, 'active'))
    )
    .orderBy(desc(userPrograms.startedAt))
    .limit(1);

  if (!active?.startedAt) {
    return getDailyStepLimitForProgramDay(0);
  }

  const startKey = getLocalDateKeyPure(active.startedAt, timezone);
  const nowKey = getLocalDateKeyPure(now, timezone);
  return getDailyStepLimitForProgramDay(diffDateKeys(startKey, nowKey));
}

/**
 * Единое состояние daily-limit для Roadmap.
 *
 * Поведение:
 *  - prod (windowMs=0): окно = локальный календарный день пользователя.
 *  - dev (windowMs>0): после каждой нормы завершённых шагов включается короткий
 *    cooldown на N миллисекунд. Это удобнее для проверки, чем rolling-window:
 *    timed-практики часто длятся дольше 60 секунд, и события иначе успевают
 *    выпасть из окна ещё до старта следующего шага.
 */
export async function getProgramDailyLimitState(
  userId: number,
  timezone: string,
  now: Date
): Promise<ProgramDailyLimitState> {
  const windowMs = getDailyLimitWindowMs();
  const entryDate = getLocalDateKeyPure(now, timezone);
  const dailyStepLimit = await getDailyStepLimitForUser(userId, timezone, now);

  if (windowMs > 0) {
    const [row] = await db
      .select({
        count: sql<number>`count(*)::int`,
        latestCompletedAt: sql<Date | null>`max(${energyEvents.createdAt})`,
      })
      .from(energyEvents)
      .where(
        and(
          eq(energyEvents.userId, userId),
          eq(energyEvents.source, 'program_step_complete'),
          eq(energyEvents.eventDate, entryDate)
        )
      );

    const completedToday = Number(row?.count ?? 0);
    const latestCompletedAt = row?.latestCompletedAt
      ? new Date(row.latestCompletedAt)
      : null;
    const cycleState = getDevDailyLimitCycleState({
      completedCount: completedToday,
      latestCompletedAt,
      now,
      dailyStepLimit,
      windowMs,
    });

    return {
      dailyStepLimit,
      stepsDoneToday: cycleState.stepsDoneToday,
      nextResetAt: cycleState.nextResetAt,
    };
  }

  const stepsDoneToday = await countCompletedProgramStepsForDate(
    userId,
    entryDate
  );

  return {
    dailyStepLimit,
    stepsDoneToday,
    nextResetAt:
      stepsDoneToday >= dailyStepLimit
        ? getNextDailyResetAt(now, timezone)
        : null,
  };
}

/**
 * Backward-compatible счётчик для старых call-sites. Для dev-override теперь
 * возвращает прогресс текущего quota-cycle, а не raw rolling-window count.
 *
 * Используется и в `startProgramStep` (для проверки лимита перед стартом),
 * и в `/api/today` (для отдачи `programDailyLimit.stepsDoneToday`).
 */
export async function countCompletedProgramStepsInLimitWindow(
  userId: number,
  timezone: string,
  now: Date
): Promise<number> {
  const state = await getProgramDailyLimitState(userId, timezone, now);
  return state.stepsDoneToday;
}

/**
 * Локальная полночь следующего дня в timezone пользователя - возвращается клиенту,
 * чтобы корректно показать «Следующий шаг через X часов» в HomeRoadmapCard.
 *
 * Берём YYYY-MM-DD от entryDate (по локальной таймзоне пользователя), прибавляем 1 день
 * и считаем UTC-момент начала следующего локального дня.
 */
export const nextLocalMidnight = nextLocalMidnightPure;

export async function getTodayEnergy(userId: number, entryDate: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${energyEvents.amount}), 0)::int`,
    })
    .from(energyEvents)
    .where(
      and(
        eq(energyEvents.userId, userId),
        eq(energyEvents.eventDate, entryDate)
      )
    );
  return Number(row?.total ?? 0);
}

export async function getWeeklyEnergy(userId: number, entryDate: string) {
  const dates = Array.from({ length: 7 }, (_, index) =>
    shiftDateKey(entryDate, index - 6)
  );
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${energyEvents.amount}), 0)::int`,
    })
    .from(energyEvents)
    .where(
      and(
        eq(energyEvents.userId, userId),
        inArray(energyEvents.eventDate, dates)
      )
    );
  return Number(row?.total ?? 0);
}

export async function getLatestMoodForDate(userId: number, entryDate: string) {
  const [row] = await db
    .select()
    .from(moodCheckins)
    .where(
      and(
        eq(moodCheckins.userId, userId),
        eq(moodCheckins.entryDate, entryDate)
      )
    )
    .orderBy(desc(moodCheckins.createdAt))
    .limit(1);
  return row ? toMoodDto(row) : null;
}

export async function createMoodCheckin(params: {
  userId: number;
  mood: MoodCheckinMood;
  source: 'home' | 'program_step' | 'roadmap';
  note?: string | null;
  timezone: string;
}) {
  const now = new Date();
  const entryDate = getLocalDateKey(now, params.timezone);
  const existing = await getLatestMoodForDate(params.userId, entryDate);

  let item: typeof moodCheckins.$inferSelect;

  if (existing) {
    // За сегодня уже есть отметка — обновляем её, не создаём дубль
    const [updated] = await db
      .update(moodCheckins)
      .set({
        mood: params.mood,
        score: moodScore(params.mood),
        source: params.source,
        note: params.note ?? null,
      })
      .where(eq(moodCheckins.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error('Mood check-in was not updated');
    }
    item = updated;
  } else {
    const [inserted] = await db
      .insert(moodCheckins)
      .values({
        userId: params.userId,
        mood: params.mood,
        score: moodScore(params.mood),
        entryDate,
        source: params.source,
        note: params.note ?? null,
        metadata: {},
      })
      .returning();

    if (!inserted) {
      throw new Error('Mood check-in was not created');
    }
    item = inserted;

    await db.insert(energyEvents).values({
      userId: params.userId,
      amount: 1,
      source: 'mood_checkin',
      sourceId: String(item.id),
      eventDate: entryDate,
      metadata: { source: params.source },
    });

    try {
      await recordStreakActivityForDate({
        userId: params.userId,
        entryDate,
        source: 'mood_checkin',
        sourceId: String(item.id),
        metadata: { moodSource: params.source },
      });
    } catch (error) {
      console.error('[createMoodCheckin] streak update failed:', error);
    }
  }

  return {
    item: toMoodDto(item),
    rewardGranted: !existing,
    energyToday: await getTodayEnergy(params.userId, entryDate),
  };
}

export async function getOrCreateThoughtOfTheDay(params: {
  userId: number;
  entryDate: string;
  programSlug?: string | null;
  step?: number | null;
  /** Передать гендер снаружи чтобы избежать повторного SELECT (напр. после getOrCreateProgramOverview). */
  gender?: UserGender;
}): Promise<ThoughtOfTheDayDto> {
  // Гендер нужен для резолва {м|ж} разметки в тексте.
  // В БД хранится сырая разметка, резолв происходит при каждом чтении.
  const gender = params.gender ?? (await getUserGender(params.userId));

  const fallbackThoughtText = getThoughtTemplateForProgramStep(params);

  // Upsert-паттерн: сначала INSERT ON CONFLICT DO NOTHING, потом SELECT если конфликт.
  // Это защищает от race condition при параллельных запросах (PWA service worker + вкладка).
  const [inserted] = await db
    .insert(dailyThoughts)
    .values({
      userId: params.userId,
      entryDate: params.entryDate,
      text: fallbackThoughtText,
      source: 'fallback',
      programSlug: params.programSlug ?? DEFAULT_RETENTION_PROGRAM_SLUG,
      step: params.step ?? null,
      metadata: {},
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return {
      id: inserted.id,
      entryDate: inserted.entryDate,
      text: applyGender(inserted.text, gender),
      source: inserted.source,
      saved: false,
    };
  }

  // Запись уже существовала (конкурентная вставка или повторный вызов)
  const [existing] = await db
    .select()
    .from(dailyThoughts)
    .where(
      and(
        eq(dailyThoughts.userId, params.userId),
        eq(dailyThoughts.entryDate, params.entryDate)
      )
    )
    .limit(1);

  return {
    id: existing?.id ?? null,
    entryDate: params.entryDate,
    text: applyGender(existing?.text || fallbackThoughtText, gender),
    source: existing?.source || 'fallback',
    saved: Boolean(existing?.savedAt),
  };
}

async function findThoughtForUser(params: {
  userId: number;
  thoughtId?: number;
  entryDate?: string;
}) {
  if (params.thoughtId) {
    const [row] = await db
      .select()
      .from(dailyThoughts)
      .where(
        and(
          eq(dailyThoughts.userId, params.userId),
          eq(dailyThoughts.id, params.thoughtId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  if (!params.entryDate) return null;
  const [row] = await db
    .select()
    .from(dailyThoughts)
    .where(
      and(
        eq(dailyThoughts.userId, params.userId),
        eq(dailyThoughts.entryDate, params.entryDate)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function saveThoughtOfTheDay(params: {
  userId: number;
  entryDate: string;
  programSlug?: string | null;
  step?: number | null;
  thoughtId?: number;
}) {
  if (!params.thoughtId) {
    await getOrCreateThoughtOfTheDay({
      userId: params.userId,
      entryDate: params.entryDate,
      programSlug: params.programSlug,
      step: params.step,
    });
  }

  const thought = await findThoughtForUser({
    userId: params.userId,
    thoughtId: params.thoughtId,
    entryDate: params.entryDate,
  });

  if (!thought) {
    throw new Error('Thought of the day not found');
  }

  const now = new Date();
  const [freshlySaved] = await db
    .update(dailyThoughts)
    .set({ savedAt: now, updatedAt: now })
    .where(and(eq(dailyThoughts.id, thought.id), isNull(dailyThoughts.savedAt)))
    .returning();
  const rewardGranted = Boolean(freshlySaved);

  if (rewardGranted) {
    await db.insert(energyEvents).values({
      userId: params.userId,
      amount: 1,
      source: 'thought_saved',
      sourceId: String(thought.id),
      eventDate: thought.entryDate,
      metadata: {
        programSlug: thought.programSlug,
        step: thought.step,
      },
    });

    try {
      await recordStreakActivityForDate({
        userId: params.userId,
        entryDate: thought.entryDate,
        source: 'thought_saved',
        sourceId: String(thought.id),
        metadata: {
          programSlug: thought.programSlug,
          step: thought.step,
        },
      });
    } catch (error) {
      console.error('[saveThoughtOfTheDay] streak update failed:', error);
    }
  }

  const current =
    freshlySaved ||
    (await findThoughtForUser({
      userId: params.userId,
      thoughtId: thought.id,
    }));

  if (!current) {
    throw new Error('Thought of the day not found');
  }

  return {
    item: toThoughtDto(current),
    rewardGranted,
    energyToday: await getTodayEnergy(params.userId, thought.entryDate),
    energyWeekly: await getWeeklyEnergy(params.userId, thought.entryDate),
  };
}

export async function unsaveThoughtOfTheDay(params: {
  userId: number;
  entryDate: string;
  thoughtId?: number;
}) {
  const thought = await findThoughtForUser({
    userId: params.userId,
    thoughtId: params.thoughtId,
    entryDate: params.entryDate,
  });

  if (!thought) {
    throw new Error('Thought of the day not found');
  }

  const [updated] = await db
    .update(dailyThoughts)
    .set({ savedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(dailyThoughts.userId, params.userId),
        eq(dailyThoughts.id, thought.id)
      )
    )
    .returning();

  if (!updated) {
    throw new Error('Thought of the day not found');
  }

  return {
    item: toThoughtDto(updated),
    rewardGranted: false,
    energyToday: await getTodayEnergy(params.userId, thought.entryDate),
    energyWeekly: await getWeeklyEnergy(params.userId, thought.entryDate),
  };
}

export async function getSavedThoughtsCollection(params: {
  userId: number;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);
  const rows = await db
    .select()
    .from(dailyThoughts)
    .where(
      and(
        eq(dailyThoughts.userId, params.userId),
        isNotNull(dailyThoughts.savedAt)
      )
    )
    .orderBy(desc(dailyThoughts.savedAt))
    .limit(limit);

  return {
    items: rows
      .filter((row) => row.savedAt)
      .map((row) => ({
        ...toThoughtDto(row),
        id: row.id,
        savedAt: row.savedAt?.toISOString() ?? row.updatedAt.toISOString(),
      })),
  };
}

export async function getActivityStreak(userId: number, entryDate: string) {
  const dates = Array.from({ length: 30 }, (_, index) =>
    shiftDateKey(entryDate, -index)
  );
  const [energyRows, moodRows] = await Promise.all([
    db
      .select({ eventDate: energyEvents.eventDate })
      .from(energyEvents)
      .where(
        and(
          eq(energyEvents.userId, userId),
          inArray(energyEvents.eventDate, dates)
        )
      ),
    db
      .select({ entryDate: moodCheckins.entryDate })
      .from(moodCheckins)
      .where(
        and(
          eq(moodCheckins.userId, userId),
          inArray(moodCheckins.entryDate, dates)
        )
      ),
  ]);

  const activeDates = new Set([
    ...energyRows.map((row) => row.eventDate),
    ...moodRows.map((row) => row.entryDate),
  ]);
  let current = 0;

  for (const date of dates) {
    if (!activeDates.has(date)) break;
    current += 1;
  }

  let best = 0;
  let running = 0;
  for (const date of [...dates].reverse()) {
    if (activeDates.has(date)) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 0;
    }
  }

  const weekDates = Array.from({ length: 7 }, (_, index) =>
    shiftDateKey(entryDate, index - 6)
  );

  return {
    current,
    best,
    week: weekDates.map((date) => activeDates.has(date)),
  };
}

export async function startProgramStep(params: {
  userId: number;
  slug: string;
  step: number;
  replay: boolean;
}) {
  const program = await ensureProgramBySlug(params.slug);
  const userProgram = await ensureUserProgram(params.userId, program.id);
  const [stepTemplate] = await db
    .select()
    .from(programStepTemplates)
    .where(
      and(
        eq(programStepTemplates.programId, program.id),
        eq(programStepTemplates.step, params.step)
      )
    )
    .limit(1);

  if (!stepTemplate) {
    throw new Error('Unknown retention program step');
  }

  if (params.step > userProgram.currentStep) {
    throw new Error('Program step is not available yet');
  }

  const timezone = await getUserTimezone(params.userId);
  const entryDate = getLocalDateKey(new Date(), timezone);
  const hadMoodToday = Boolean(
    await getLatestMoodForDate(params.userId, entryDate)
  );

  // Дневной лимит шагов (3 в первые два дня программы, дальше 2) применяется
  // только к новым шагам.
  // Replay (повтор завершённого) и продолжение начатого, но незавершённого шага
  // ограничениями не блокируются - см. retention/retention_long_term_strategy.md
  const [existingProgressBeforeStart] = await db
    .select()
    .from(userProgramStepProgress)
    .where(
      and(
        eq(userProgramStepProgress.userProgramId, userProgram.id),
        eq(userProgramStepProgress.stepTemplateId, stepTemplate.id)
      )
    )
    .limit(1);
  const isNewStepStart =
    !params.replay && existingProgressBeforeStart?.status !== 'completed';
  if (isNewStepStart) {
    const now = new Date();
    const dailyLimitState = await getProgramDailyLimitState(
      params.userId,
      timezone,
      now
    );
    if (dailyLimitState.stepsDoneToday >= dailyLimitState.dailyStepLimit) {
      trackRetentionEvent('daily_step_limit_hit', {
        userId: params.userId,
        programSlug: params.slug ?? DEFAULT_RETENTION_PROGRAM_SLUG,
        stepsDoneToday: dailyLimitState.stepsDoneToday,
      });
      const error = new Error('Daily step limit reached');
      (error as Error & { code?: string; data?: unknown }).code =
        'E_DAILY_LIMIT';
      (error as Error & { code?: string; data?: unknown }).data = {
        stepsDoneToday: dailyLimitState.stepsDoneToday,
        dailyStepLimit: dailyLimitState.dailyStepLimit,
        nextResetAt: dailyLimitState.nextResetAt?.toISOString() ?? null,
      };
      throw error;
    }
  }

  const attempt = await db.transaction(async (tx) => {
    const [existingProgress] = await tx
      .select()
      .from(userProgramStepProgress)
      .where(
        and(
          eq(userProgramStepProgress.userProgramId, userProgram.id),
          eq(userProgramStepProgress.stepTemplateId, stepTemplate.id)
        )
      )
      .limit(1);

    let progress = existingProgress;
    // Replay имеет смысл только для уже пройденного canonical step.
    // Иначе ручной ?replay=1 мог бы лишить пользователя первой награды.
    const shouldReplay = progress?.status === 'completed';

    if (!progress) {
      const [createdProgress] = await tx
        .insert(userProgramStepProgress)
        .values({
          userProgramId: userProgram.id,
          stepTemplateId: stepTemplate.id,
          status: 'started',
          startedAt: new Date(),
          currentActionIndex: 0,
          metadata: {},
        })
        .returning();
      progress = createdProgress;
    } else if (progress.status !== 'completed') {
      const [updatedProgress] = await tx
        .update(userProgramStepProgress)
        .set({
          status: 'started',
          startedAt: progress.startedAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userProgramStepProgress.id, progress.id))
        .returning();
      progress = updatedProgress || progress;
    }

    // Resume сценарий (retention/retention_long_term_strategy.md):
    // если у пользователя уже есть незавершённый attempt этого шага - переиспользуем
    // его, чтобы сохранить статусы actions[i].status='completed' для тех, что
    // уже пройдены. Без этого resume на «первый pending action» не работает,
    // потому что каждый `start` создавал бы свежий attempt со всеми pending.
    //
    // Создаём новый attempt только если:
    //  - это replay (shouldReplay) - пользователь явно перезаходит после
    //    completion'а через кнопку «Повторить»;
    //  - у шага вообще нет привязанного `progress` (первый заход);
    //  - на progress нет ни одного started-attempt (например, после
    //    нечаянной сериализации без attempt).
    const existingActiveAttempts = progress
      ? await tx
          .select()
          .from(userProgramStepAttempts)
          .where(
            and(
              eq(userProgramStepAttempts.userProgramId, userProgram.id),
              eq(userProgramStepAttempts.stepTemplateId, stepTemplate.id),
              eq(userProgramStepAttempts.status, 'started')
            )
          )
          .orderBy(desc(userProgramStepAttempts.createdAt))
          .limit(1)
      : [];
    const reusableAttempt = !shouldReplay
      ? (existingActiveAttempts[0] ?? null)
      : null;
    const templateAttemptActions = prepareAttemptActions({
      templateActions: normalizeActions(stepTemplate.actions),
      hadMoodToday,
    });

    if (reusableAttempt) {
      const existingActions = normalizeAttemptActions(reusableAttempt.actions);
      if (
        attemptActionsNeedTemplateRefresh({
          existingActions,
          templateActions: templateAttemptActions,
        })
      ) {
        const mergedActions = mergeAttemptActionsWithTemplate({
          existingActions,
          templateActions: templateAttemptActions,
        });
        const [updatedAttempt] = await tx
          .update(userProgramStepAttempts)
          .set({
            actions: mergedActions,
            updatedAt: new Date(),
          })
          .where(eq(userProgramStepAttempts.id, reusableAttempt.id))
          .returning();
        return updatedAttempt ?? reusableAttempt;
      }

      return reusableAttempt;
    }

    // Новый attempt (replay или повторное открытие завершённого шага). Если у
    // шага уже был attempt с пройденными таймерными практиками, переносим их
    // completed-статус, чтобы не заставлять юзера снова ждать таймер медитации
    // или дыхания (он мог нечаянно нажать назад или перезайти в приложение).
    let attemptActionsForInsert = templateAttemptActions;
    const [priorAttempt] = await tx
      .select({ actions: userProgramStepAttempts.actions })
      .from(userProgramStepAttempts)
      .where(
        and(
          eq(userProgramStepAttempts.userProgramId, userProgram.id),
          eq(userProgramStepAttempts.stepTemplateId, stepTemplate.id)
        )
      )
      .orderBy(desc(userProgramStepAttempts.createdAt))
      .limit(1);
    if (priorAttempt) {
      attemptActionsForInsert = carryOverCompletedTimedPractices({
        templateActions: templateAttemptActions,
        priorActions: normalizeAttemptActions(priorAttempt.actions),
      });
    }

    const [createdAttempt] = await tx
      .insert(userProgramStepAttempts)
      .values({
        userId: params.userId,
        userProgramId: userProgram.id,
        stepTemplateId: stepTemplate.id,
        progressId: progress?.id ?? null,
        step: stepTemplate.step,
        status: 'started',
        replay: shouldReplay,
        actions: attemptActionsForInsert,
        rewardGranted: false,
        metadata: {},
      })
      .returning();

    if (!createdAttempt) {
      throw new Error('Program step attempt was not created');
    }

    return createdAttempt;
  });

  const overview = await getOrCreateProgramOverview(params.userId, params.slug);
  const step = overview.chapters
    .flatMap((chapter) => chapter.steps)
    .find((item) => item.step === params.step);

  if (!step) {
    throw new Error('Program step response was not created');
  }

  // Аналитика: фиксируем старт шага. Если у пользователя это первый шаг в
  // программе (currentStep=1, attempts отсутствовали) - заодно эмитим
  // program_started для D7/D30 cohort анализа.
  trackRetentionEvent('program_step_started', {
    userId: params.userId,
    programSlug: program.slug,
    step: step.step,
    isReplay: params.replay === true,
    hasAiChatAction: step.actions.some((a) => a.type === 'ai_chat_session'),
  });
  if (step.step === 1 && !params.replay) {
    trackRetentionEvent('program_started', {
      userId: params.userId,
      programSlug: program.slug,
    });
  }

  // Если пользователь сам пришёл к этому шагу, отменяем запланированный
  // на этот шаг push «завтра тебя ждёт следующий» - иначе ему придёт уже
  // нерелевантное напоминание. Идемпотентно: если push не было,
  // запрос ничего не сделает.
  if (!params.replay) {
    try {
      await cancelPendingNextStepReminder({
        userId: params.userId,
        programSlug: program.slug,
        stepNumber: step.step,
      });
    } catch (error) {
      console.error('[startProgramStep] cancel reminder failed:', error);
    }
  }

  // Резолв гендерных форм `{м|ж}`: `step` приходит из overview (уже резолвлен),
  // но `attempt.actions` копируются из шаблона с сырой разметкой - её надо
  // подставить здесь. applyGenderDeep на уже резолвленных строках - no-op.
  const gender = await getUserGender(params.userId);
  return applyGenderDeep(
    {
      attempt: toAttemptDto(attempt),
      step,
      program: {
        slug: program.slug,
        title: program.title,
        totalSteps: program.totalSteps,
      },
    },
    gender
  );
}

export async function updateProgramStepAction(params: {
  userId: number;
  attemptId: number;
  actionId: string;
  status?: 'pending' | 'completed';
  output?: unknown;
}) {
  const [attempt] = await db
    .select()
    .from(userProgramStepAttempts)
    .where(
      and(
        eq(userProgramStepAttempts.id, params.attemptId),
        eq(userProgramStepAttempts.userId, params.userId)
      )
    )
    .limit(1);

  if (!attempt) {
    throw new Error('Program step attempt not found');
  }

  const actions = Array.isArray(attempt.actions)
    ? (attempt.actions as ProgramStepActionStateDto[])
    : [];
  const actionFound = actions.some((action) => action.id === params.actionId);

  if (!actionFound) {
    throw new Error('Program step action not found');
  }

  const targetIndex = actions.findIndex(
    (action) => action.id === params.actionId
  );
  const output =
    params.output && typeof params.output === 'object'
      ? (params.output as Record<string, unknown>)
      : null;
  const shouldSkipRemaining =
    output?.safeExit === true &&
    output.skipRemainingActionsOnSafeExit === true &&
    params.status === 'completed';

  const nextActions = actions.map((action, index) => {
    if (action.id === params.actionId) {
      return {
        ...action,
        status: params.status ?? action.status ?? 'completed',
        output: params.output ?? action.output,
      };
    }
    if (
      shouldSkipRemaining &&
      index > targetIndex &&
      action.required !== false
    ) {
      return {
        ...action,
        status: 'completed' as const,
        output: action.output ?? {
          skippedBySafeExit: true,
          skippedAfterActionId: params.actionId,
        },
      };
    }
    return action;
  });

  const [updated] = await db
    .update(userProgramStepAttempts)
    .set({ actions: nextActions, updatedAt: new Date() })
    .where(eq(userProgramStepAttempts.id, attempt.id))
    .returning();

  if (!updated) {
    throw new Error('Program step attempt was not updated');
  }

  const gender = await getUserGender(params.userId);
  return applyGenderDeep({ attempt: toAttemptDto(updated) }, gender);
}

// Upsert системного элемента набора (практика/чат) с дедупом по itemKey и
// накоплением источников. Один и тот же элемент из разных садов = одна карточка.
async function upsertSystemToolkitItem(
  userId: number,
  dest: ToolkitDestination,
  source: ToolkitItemSource
) {
  const [existing] = await db
    .select()
    .from(userToolkitItems)
    .where(
      and(
        eq(userToolkitItems.userId, userId),
        eq(userToolkitItems.itemKey, dest.itemKey)
      )
    )
    .limit(1);

  if (existing) {
    const sources = Array.isArray(existing.sources) ? existing.sources : [];
    const alreadyHasSource = sources.some(
      (s) => s.programSlug === source.programSlug && s.stepId === source.stepId
    );
    if (!alreadyHasSource) {
      await db
        .update(userToolkitItems)
        .set({ sources: [...sources, source], updatedAt: new Date() })
        .where(eq(userToolkitItems.id, existing.id));
    }
    return;
  }

  await db
    .insert(userToolkitItems)
    .values({
      userId,
      type: dest.type,
      title: dest.title,
      content: null,
      toolRef: dest.toolRef,
      itemKey: dest.itemKey,
      sources: [source],
      origin: 'roadmap',
    })
    // Защита от гонки: партиальный unique (userId, item_key).
    // Для partial-индекса в ON CONFLICT нужен совпадающий WHERE-предикат.
    .onConflictDoNothing({
      target: [userToolkitItems.userId, userToolkitItems.itemKey],
      where: sql`${userToolkitItems.itemKey} IS NOT NULL`,
    });
}

// Сохраняем личную фразу пользователя. Дедуп по тексту, чтобы повтор/replay шага
// не плодил дубликаты одной и той же фразы.
async function insertPhraseToolkitItem(
  userId: number,
  content: string,
  source: ToolkitItemSource
) {
  const [existing] = await db
    .select({ id: userToolkitItems.id })
    .from(userToolkitItems)
    .where(
      and(
        eq(userToolkitItems.userId, userId),
        eq(userToolkitItems.type, 'phrase'),
        eq(userToolkitItems.content, content)
      )
    )
    .limit(1);

  if (existing) {
    return;
  }

  await db.insert(userToolkitItems).values({
    userId,
    type: 'phrase',
    title: content.slice(0, 120),
    content,
    toolRef: null,
    itemKey: null,
    sources: [source],
    origin: 'roadmap',
  });
}

// Материализация «Моего набора» из ответов шага: проходим structured_form-экшены,
// для choice-полей берём только опции с реальным назначением (см. registry), а
// текстовые поля сохраняем как личные фразы. Концептуальные пункты без экрана и
// «ничего из этого» отфильтровываются на уровне реестра.
async function materializeToolkitFromAttempt(params: {
  userId: number;
  programSlug: string;
  gardenTitle: string;
  actions: ProgramStepActionStateDto[];
}) {
  for (const action of params.actions) {
    const output = action.output as
      | { type?: string; formKind?: string; fields?: Record<string, unknown> }
      | undefined;
    if (
      !output ||
      output.type !== 'structured_form' ||
      !output.formKind ||
      !output.fields
    ) {
      continue;
    }

    const formKind = output.formKind;
    const fields = output.fields;
    const source: ToolkitItemSource = {
      programSlug: params.programSlug,
      stepId: action.id,
      gardenTitle: params.gardenTitle,
    };

    // Запускаемые практики/чат из мультивыбора
    for (const [fieldId, value] of Object.entries(fields)) {
      if (!Array.isArray(value)) {
        continue;
      }
      for (const optionId of value) {
        if (typeof optionId !== 'string') {
          continue;
        }
        const dest = resolveToolkitDestination(formKind, fieldId, optionId);
        if (!dest) {
          continue;
        }
        await upsertSystemToolkitItem(params.userId, dest, source);
      }
    }

    // Личные фразы из текстовых полей
    for (const fieldId of getToolkitPhraseFields(formKind)) {
      const raw = fields[fieldId];
      if (typeof raw !== 'string') {
        continue;
      }
      const content = raw.trim();
      if (!content) {
        continue;
      }
      await insertPhraseToolkitItem(params.userId, content, source);
    }
  }
}

export async function completeProgramStep(params: {
  userId: number;
  attemptId: number;
  timezone: string;
}) {
  const [attempt] = await db
    .select()
    .from(userProgramStepAttempts)
    .where(
      and(
        eq(userProgramStepAttempts.id, params.attemptId),
        eq(userProgramStepAttempts.userId, params.userId)
      )
    )
    .limit(1);

  if (!attempt) {
    throw new Error('Program step attempt not found');
  }

  const [stepTemplate] = await db
    .select()
    .from(programStepTemplates)
    .where(eq(programStepTemplates.id, attempt.stepTemplateId))
    .limit(1);

  if (!stepTemplate) {
    throw new Error('Program step template not found');
  }

  // Программа уже создана к моменту completion'а (через startProgramStep / getOrCreateProgramOverview).
  // Достаточно получить запись напрямую по programId шага, без повторного ensure*.
  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, stepTemplate.programId))
    .limit(1);

  if (!program) {
    throw new Error('Retention program not found for attempt');
  }

  const entryDate = getLocalDateKey(new Date(), params.timezone);
  let rewardGranted = false;

  const updatedAttempt = await db.transaction(async (tx) => {
    const [freshAttempt] = await tx
      .select()
      .from(userProgramStepAttempts)
      .where(eq(userProgramStepAttempts.id, attempt.id))
      .limit(1);

    if (!freshAttempt) {
      throw new Error('Program step attempt not found');
    }

    const actions = Array.isArray(freshAttempt.actions)
      ? (freshAttempt.actions as ProgramStepActionStateDto[])
      : [];
    const hasIncompleteRequiredAction = actions.some(
      (action) => action.required !== false && action.status !== 'completed'
    );

    if (hasIncompleteRequiredAction) {
      throw new Error('Program step actions are not completed');
    }

    const alreadyCompleted = freshAttempt.status === 'completed';
    const shouldGrantReward = !freshAttempt.replay && !alreadyCompleted;
    rewardGranted = shouldGrantReward;

    const [completedAttempt] = await tx
      .update(userProgramStepAttempts)
      .set({
        status: 'completed',
        completedAt: freshAttempt.completedAt || new Date(),
        rewardGranted: freshAttempt.rewardGranted || shouldGrantReward,
        updatedAt: new Date(),
      })
      .where(eq(userProgramStepAttempts.id, freshAttempt.id))
      .returning();

    if (shouldGrantReward && freshAttempt.progressId) {
      await tx
        .update(userProgramStepProgress)
        .set({
          status: 'completed',
          completedAt: new Date(),
          bestAttemptId: freshAttempt.id,
          updatedAt: new Date(),
        })
        .where(eq(userProgramStepProgress.id, freshAttempt.progressId));

      const isLastStep = freshAttempt.step >= program.totalSteps;
      const nextStep = Math.min(freshAttempt.step + 1, program.totalSteps);
      await tx
        .update(userPrograms)
        .set({
          currentStep: nextStep,
          status: isLastStep ? 'completed' : 'active',
          completedAt: isLastStep ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(userPrograms.id, freshAttempt.userProgramId));

      await tx.insert(energyEvents).values({
        userId: params.userId,
        amount: stepTemplate.energyReward,
        source: 'program_step_complete',
        sourceId: String(freshAttempt.id),
        eventDate: entryDate,
        metadata: {
          step: freshAttempt.step,
          programSlug: program.slug,
        },
      });

      // Программа завершена - фиксируем растение в Оранжерее. UNIQUE(userId, programId)
      // делает операцию идемпотентной: replay/повтор завершения не создаст дубликат.
      if (isLastStep) {
        // Подтягиваем последние 3 сохранённые мысли пользователя за период
        // программы - они будут показаны на лор-карточке растения как «след»
        // прохождения Сада (см. retention/retention_long_term_strategy.md).
        // userProgram уже определён в startProgramStep'е выше (через freshAttempt.userProgramId).
        const [userProgramRow] = await tx
          .select({ startedAt: userPrograms.startedAt })
          .from(userPrograms)
          .where(eq(userPrograms.id, freshAttempt.userProgramId))
          .limit(1);

        const savedThoughtRows = userProgramRow?.startedAt
          ? await tx
              .select({ id: dailyThoughts.id })
              .from(dailyThoughts)
              .where(
                and(
                  eq(dailyThoughts.userId, params.userId),
                  isNotNull(dailyThoughts.savedAt),
                  gte(dailyThoughts.savedAt, userProgramRow.startedAt)
                )
              )
              .orderBy(desc(dailyThoughts.savedAt))
              .limit(3)
          : [];

        await tx
          .insert(userPlants)
          .values({
            userId: params.userId,
            programId: program.id,
            programSlug: program.slug,
            plantSetSlug: program.plantSetSlug ?? 'orchid',
            // Финальная стадия = последний state в `public/retention/plant/<set>/states`.
            // 15 - последний state из retention/retention_long_term_strategy.md (стадии 1..15,
            // семя/росток убраны, первая стадия - уже зелёные листья).
            stateIndex: 15,
            completedAt: new Date(),
            // ВАЖНО: НЕ сохраняем `program.summaryText` (preset из таблицы programs).
            // Раньше так делалось - и getOrGeneratePlantSummary видел непустой текст,
            // отдавал его как кеш, и AI-генерация НИКОГДА не запускалась. Пользователь
            // видел статичный preset из БД вместо клинического разбора. Теперь оставляем
            // null - сигнал «отчёт ещё не сгенерирован». Fire-and-forget вызов ниже
            // (после транзакции) запускает LLM и кэширует результат в user_summary.
            userSummary: null,
            savedThoughts: { ids: savedThoughtRows.map((r) => r.id) },
            metadata: {
              completedAtStep: freshAttempt.step,
              attemptId: freshAttempt.id,
            },
          })
          .onConflictDoNothing({
            target: [userPlants.userId, userPlants.programId],
          });
      }
    }

    if (!completedAttempt) {
      throw new Error('Program step attempt was not completed');
    }

    return completedAttempt;
  });

  // ВАЖНО: запускаем AI-генерацию клинического отчёта в фоне, ВНЕ транзакции
  // (LLM-вызовы идут 5-15 сек, держать транзакцию открытой нельзя). Эндпоинт
  // GET /api/garden/plants/:id/summary-status делает polling - фронт показывает
  // пользователю full-screen overlay «Готовится клинический разбор…».
  //
  // Идемпотентность: getOrGeneratePlantSummary при force=true пересоздаёт
  // summary. При повторных complete (replay) summary НЕ перегенерируется -
  // здесь мы проверяем что это первое завершение (rewardGranted=true) и
  // что шаг последний. UNIQUE(userId, programId) на user_plants гарантирует,
  // что plant создан один раз.
  if (rewardGranted && updatedAttempt.step >= program.totalSteps) {
    void (async () => {
      try {
        const [plant] = await db
          .select({ id: userPlants.id })
          .from(userPlants)
          .where(
            and(
              eq(userPlants.userId, params.userId),
              eq(userPlants.programId, program.id)
            )
          )
          .limit(1);
        if (!plant) return;
        await getOrGeneratePlantSummary({
          userId: params.userId,
          plantId: plant.id,
          // force=true - даже если userSummary случайно непустой (legacy данные),
          // перегенерируем именно при первом завершении программы. Это единственный
          // момент, когда такая регенерация безопасна (преобразует preset → AI).
          force: true,
        });
      } catch (error) {
        // НЕ throw - это фоновая задача, основной ответ пользователю уже
        // отправлен. Фронт сделает polling и получит fallback (preset)
        // через 10-20 сек если LLM упал. Лог критичен для мониторинга.
        console.error(
          '[completeProgramStep] async plant summary generation failed:',
          error
        );
      }
    })();
  }

  // Материализуем «Мой набор»: запускаемые практики и личные фразы, выбранные в шаге.
  // Идемпотентно (дедуп по itemKey/тексту), поэтому безопасно при replay. Не критично
  // для завершения шага — ошибки логируем, но не пробрасываем.
  try {
    await materializeToolkitFromAttempt({
      userId: params.userId,
      programSlug: program.slug,
      gardenTitle: program.title,
      actions:
        (updatedAttempt.actions as ProgramStepActionStateDto[] | null) || [],
    });
  } catch (error) {
    console.error(
      '[completeProgramStep] toolkit materialization failed:',
      error
    );
  }

  // Аналитика: фиксируем завершение шага, отдельно - завершение программы.
  // ai_chat_step_completed эмитим, если шаг содержал ai_chat_session action,
  // чтобы считать AI-chat completion rate vs остальные типы (стратегия §10).
  trackRetentionEvent('program_step_completed', {
    userId: params.userId,
    programSlug: program.slug,
    step: updatedAttempt.step,
    rewardGranted,
  });
  const hadAiChat = (
    (updatedAttempt.actions as Array<{ type?: string }> | null) || []
  ).some((a) => a?.type === 'ai_chat_session');
  if (hadAiChat) {
    trackRetentionEvent('ai_chat_step_completed', {
      userId: params.userId,
      programSlug: program.slug,
      step: updatedAttempt.step,
    });
  }
  if (rewardGranted) {
    try {
      await recordStreakActivityForDate({
        userId: params.userId,
        entryDate,
        source: 'program_step_complete',
        sourceId: String(updatedAttempt.id),
        metadata: {
          programSlug: program.slug,
          step: updatedAttempt.step,
        },
      });
    } catch (error) {
      console.error('[completeProgramStep] streak update failed:', error);
    }
  }
  if (rewardGranted && updatedAttempt.step >= program.totalSteps) {
    trackRetentionEvent('program_completed', {
      userId: params.userId,
      programSlug: program.slug,
      totalSteps: program.totalSteps,
    });
  }

  // Утренний push про следующий шаг — в 10:00 следующего дня по локальному
  // времени пользователя. Планируется только если reward засчитан и программа
  // ещё не завершена. Идемпотентно через entityKey.
  if (rewardGranted && updatedAttempt.step < program.totalSteps) {
    try {
      const timezone = await getUserTimezone(params.userId);
      await scheduleNextStepReminder({
        userId: params.userId,
        programSlug: program.slug,
        programTitle: program.title,
        nextStepNumber: updatedAttempt.step + 1,
        timezone,
      });
    } catch (error) {
      console.error('[completeProgramStep] schedule reminder failed:', error);
    }
  }

  const gender = await getUserGender(params.userId);
  // Промо-paywall привязки карты в триале считаем только при реальном завершении
  // нового шага (не replay). Ошибки промо не должны ломать завершение шага.
  const trialUpsell = rewardGranted
    ? await resolveTrialUpsellAfterStep({ userId: params.userId }).catch(
        (error) => {
          console.error(
            '[completeProgramStep] trial upsell resolve failed:',
            error
          );
          return null;
        }
      )
    : null;

  return applyGenderDeep(
    {
      attempt: toAttemptDto(updatedAttempt),
      program: await getOrCreateProgramOverview(params.userId, program.slug),
      rewardGranted,
      ...(trialUpsell ? { trialUpsell } : {}),
    },
    gender
  );
}
