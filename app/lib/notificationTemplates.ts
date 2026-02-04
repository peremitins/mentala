/**
 * Каталог шаблонов уведомлений
 *
 * Этот файл содержит только определения типов и данные шаблонов.
 * Шаблоны используются скриптом миграции (scripts/migrate-templates-to-db.ts)
 * для переноса в БД (таблицы notification_text_presets и notification_texts).
 *
 * В продакшене используются тексты из БД, а не этот файл напрямую.
 */

// Импортируем общие типы из shared DTO
import type {
  NotificationKind,
  NotificationSubtype,
  NotificationImageTag,
} from '@/shared/dto/notifications';

// Тип Directness с поддержкой 'universal' (используется только в шаблонах)
export type Directness = 'soft' | 'moderate' | 'hard' | 'universal';

// Универсальный идентификатор сущности
export type EntityKey = string;

// Intent для привычек (только build | quit, без custom)
export type HabitIntent = 'build' | 'quit';

// Реэкспорт типов для использования в скрипте миграции
export type { NotificationKind, NotificationSubtype };

export interface NotificationTemplate {
  id: string;
  kind: NotificationKind;
  entityKey: EntityKey; // Универсальный идентификатор (заменяет type, habitKey, topic)
  directness: Directness[];
  // Для привычек
  intent?: HabitIntent; // build | quit
  // Для всех видов (habits и therapy)
  subtype?: NotificationSubtype; // reminder | informational | motivational | mixed
  imageTag?: NotificationImageTag | null; // опциональный тег изображения (по умолчанию null)
  ru: {
    // Universal text (для informational) - один текст для всех directness
    universal?: string;
    // Или вариативные тексты (для reminder/motivational)
    // addressing берется из БД (userPreferences.addressing)
    informal?: {
      universal?: string; // Universal с учетом addressing
      soft?: string;
      moderate?: string;
      hard?: string;
    };
    formal?: {
      universal?: string; // Universal с учетом addressing
      soft?: string;
      moderate?: string;
      hard?: string;
    };
  };
}

// По умолчанию у шаблонов нет картинки, но можно указать imageTag явно
function applyImageTags(
  templates: NotificationTemplate[]
): NotificationTemplate[] {
  return templates.map((template) => {
    if (template.imageTag !== undefined) {
      return template;
    }

    // Для воды всегда используем neutral_abstract
    if (template.kind === 'habits' && template.entityKey === 'water') {
      return {
        ...template,
        imageTag: 'neutral_abstract',
      };
    }

    return {
      ...template,
      imageTag: null,
    };
  });
}

/**
 * Каталог шаблонов для типа "therapy" (Терапия)
 */
const rawTherapyTemplates: NotificationTemplate[] = [
  // =========================
  // ANXIETY (Тревога и паника) - 45 templates
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psyanxietyreminder01',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, тревога растет - сделай 3 цикла дыхания 4-7-8: вдох 4, задержка 7, выдох 8.',
        moderate:
          '{name}, стоп тревоге: 3 цикла 4-7-8 (4 вдох - 7 пауза - 8 выдох). Медленно, без усилий.',
        hard: '{name}, сейчас дыхание. 3 цикла 4-7-8. Делай и не спорь с тревогой.',
      },
      formal: {
        soft: '{name}, тревога растет - сделайте 3 цикла дыхания 4-7-8: вдох 4, задержка 7, выдох 8.',
        moderate:
          '{name}, остановите тревогу: 3 цикла 4-7-8 (4 вдох - 7 пауза - 8 выдох). Медленно, без усилий.',
        hard: '{name}, сейчас дыхание. 3 цикла 4-7-8. Делайте и не спорьте с тревогой.',
      },
    },
  },
  {
    id: 'psyanxietyreminder02',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, короткое заземление 5-4-3-2-1: назови 5 вещей, которые видишь.',
        moderate:
          '{name}, заземление 5-4-3-2-1: 5 вижу, 4 чувствую телом, 3 слышу, 2 ощущаю запах, 1 ощущаю вкус.',
        hard: '{name}, возвращайся в реальность: 5-4-3-2-1. Прямо сейчас, по шагам.',
      },
      formal: {
        soft: '{name}, короткое заземление 5-4-3-2-1: назовите 5 вещей, которые видите.',
        moderate:
          '{name}, заземление 5-4-3-2-1: 5 вижу, 4 чувствую телом, 3 слышу, 2 ощущаю запах, 1 ощущаю вкус.',
        hard: '{name}, возвращайтесь в реальность: 5-4-3-2-1. Прямо сейчас, по шагам.',
      },
    },
  },
  {
    id: 'psyanxietyreminder03',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если трясет - прижми стопы к полу и сделай 5 медленных выдохов.',
        moderate:
          '{name}, опора телом: стопы в пол, плечи вниз, 5 длинных выдохов. Тревога уходит быстрее через выдох.',
        hard: '{name}, стопы в пол. Длинный выдох. Еще 4 раза. Делай.',
      },
      formal: {
        soft: '{name}, если трясет - прижмите стопы к полу и сделайте 5 медленных выдохов.',
        moderate:
          '{name}, опора телом: стопы в пол, плечи вниз, 5 длинных выдохов. Тревога уходит быстрее через выдох.',
        hard: '{name}, стопы в пол. Длинный выдох. Еще 4 раза. Делайте.',
      },
    },
  },
  {
    id: 'psyanxietyreminder04',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, проверь тело: разожми челюсть и опусти язык. Это быстро снижает напряжение.',
        moderate:
          '{name}, расслабь челюсть: губы мягко закрыты, зубы не сжаты, язык лежит свободно. 20 секунд.',
        hard: '{name}, разожми челюсть. Сейчас. И держи 20 секунд.',
      },
      formal: {
        soft: '{name}, проверьте тело: разожмите челюсть и опустите язык. Это быстро снижает напряжение.',
        moderate:
          '{name}, расслабьте челюсть: губы мягко закрыты, зубы не сжаты, язык лежит свободно. 20 секунд.',
        hard: '{name}, разожмите челюсть. Сейчас. И удерживайте 20 секунд.',
      },
    },
  },
  {
    id: 'psyanxietyreminder05',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай мини-скан: плечи вниз, живот мягче, ладони теплые. 30 секунд.',
        moderate:
          '{name}, быстрый body-scan: плечи - вниз, живот - мягче, ладони - согреть. 30 секунд и обратно в дело.',
        hard: '{name}, перестань застревать в голове. 30 секунд скан тела - сейчас.',
      },
      formal: {
        soft: '{name}, сделайте мини-скан: плечи вниз, живот мягче, ладони теплые. 30 секунд.',
        moderate:
          '{name}, быстрый body-scan: плечи - вниз, живот - мягче, ладони - согреть. 30 секунд и обратно к делам.',
        hard: '{name}, перестаньте застревать в голове. 30 секунд сканирования тела - сейчас.',
      },
    },
  },
  {
    id: 'psyanxietyreminder06',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, тревога любит скорость. Замедлись: сделай любое действие в 2 раза медленнее 1 минуту.',
        moderate:
          '{name}, на минуту включи "замедление": шаги, движения, речь - в 2 раза медленнее.',
        hard: '{name}, замедляйся. Минута медленных движений - сейчас.',
      },
      formal: {
        soft: '{name}, тревога любит скорость. Замедлитесь: сделайте любое действие в 2 раза медленнее 1 минуту.',
        moderate:
          '{name}, на минуту включите "замедление": шаги, движения, речь - в 2 раза медленнее.',
        hard: '{name}, замедляйтесь. Минута медленных движений - сейчас.',
      },
    },
  },
  {
    id: 'psyanxietyreminder07',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, назови мысль: «Сейчас у меня тревожная мысль». Это помогает отделить мысль от факта.',
        moderate:
          '{name}, пометь мысль: «Это тревога говорит». Потом спроси: что я знаю точно, а что додумываю?',
        hard: '{name}, стоп. Это мысль, не факт. Назови ее и вернись к реальности.',
      },
      formal: {
        soft: '{name}, назовите мысль: «Сейчас у меня тревожная мысль». Это помогает отделить мысль от факта.',
        moderate:
          '{name}, отметьте мысль: «Это тревога говорит». Потом спросите: что я знаю точно, а что додумываю?',
        hard: '{name}, стоп. Это мысль, не факт. Назовите ее и вернитесь к реальности.',
      },
    },
  },
  {
    id: 'psyanxietyreminder08',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай "контур безопасности": оглянись и найди 3 спокойных предмета вокруг.',
        moderate:
          '{name}, проверь безопасность: где ты? что вокруг? найди 3 нейтральных/спокойных объекта и задержи взгляд на каждом 5 секунд.',
        hard: '{name}, оглянись. 3 объекта. Взгляд по 5 секунд. Возвращай мозг домой.',
      },
      formal: {
        soft: '{name}, сделайте "контур безопасности": оглянитесь и найдите 3 спокойных предмета вокруг.',
        moderate:
          '{name}, проверьте безопасность: где вы? что вокруг? найдите 3 нейтральных/спокойных объекта и задержите взгляд на каждом 5 секунд.',
        hard: '{name}, оглянитесь. 3 объекта. Взгляд по 5 секунд. Возвращайте мозг домой.',
      },
    },
  },
  {
    id: 'psyanxietyreminder09',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если паника рядом - выпей воды маленькими глотками. Это помогает телу переключиться.',
        moderate:
          '{name}, возьми воду. 5 маленьких глотков. Пауза. Еще 5. Дыхание выровняется быстрее.',
        hard: '{name}, вода. Сейчас. Маленькими глотками. Тело должно понять, что ты в порядке.',
      },
      formal: {
        soft: '{name}, если паника рядом - выпейте воды маленькими глотками. Это помогает телу переключиться.',
        moderate:
          '{name}, возьмите воду. 5 маленьких глотков. Пауза. Еще 5. Дыхание выровняется быстрее.',
        hard: '{name}, вода. Сейчас. Маленькими глотками. Тело должно понять, что вы в порядке.',
      },
    },
  },
  {
    id: 'psyanxietyreminder10',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай микро-действие: убери одну мелочь, открой окно, встань. Действие заземляет.',
        moderate:
          '{name}, выбери одно простое действие на 1 минуту. Тревога падает, когда появляется контроль.',
        hard: '{name}, хватит прокручивать. Сделай одно действие на 60 секунд. Сейчас.',
      },
      formal: {
        soft: '{name}, сделайте микро-действие: уберите одну мелочь, откройте окно, встаньте. Действие заземляет.',
        moderate:
          '{name}, выберите одно простое действие на 1 минуту. Тревога снижается, когда появляется контроль.',
        hard: '{name}, хватит прокручивать. Сделайте одно действие на 60 секунд. Сейчас.',
      },
    },
  },
  {
    id: 'psyanxietyreminder11',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй фразу: «Сейчас мне тревожно. Я переживу эту волну».',
        moderate:
          '{name}, поддержка без пафоса: «Мне тревожно, но это пройдет. Я дышу и остаюсь здесь».',
        hard: '{name}, не убегай. Это волна. Дыши и стой. Пройдет.',
      },
      formal: {
        soft: '{name}, попробуйте фразу: «Сейчас мне тревожно. Я переживу эту волну».',
        moderate:
          '{name}, поддержка без пафоса: «Мне тревожно, но это пройдет. Я дышу и остаюсь здесь».',
        hard: '{name}, не убегайте. Это волна. Дышите и оставайтесь. Пройдет.',
      },
    },
  },
  {
    id: 'psyanxietyreminder12',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, напряжение в руках? Сожми кулаки на 5 секунд и отпусти. 3 раза.',
        moderate:
          '{name}, сброс напряжения: сожми кулаки на 5 секунд - отпусти. Повтори 3 раза.',
        hard: '{name}, кулаки: сжал 5 секунд - отпустил. Три раза. Сейчас.',
      },
      formal: {
        soft: '{name}, напряжение в руках? Сожмите кулаки на 5 секунд и отпустите. 3 раза.',
        moderate:
          '{name}, сброс напряжения: сожмите кулаки на 5 секунд - отпустите. Повторите 3 раза.',
        hard: '{name}, кулаки: сжали 5 секунд - отпустили. Три раза. Сейчас.',
      },
    },
  },
  {
    id: 'psyanxietyreminder13',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери точку и смотри на нее 10 секунд, пока выдыхаешь. Это успокаивает.',
        moderate:
          '{name}, фиксация взгляда: 10 секунд смотри в одну точку и делай длинный выдох.',
        hard: '{name}, взгляд в точку. Длинный выдох. 10 секунд. Делай.',
      },
      formal: {
        soft: '{name}, выберите точку и смотрите на нее 10 секунд, пока выдыхаете. Это успокаивает.',
        moderate:
          '{name}, фиксация взгляда: 10 секунд смотрите в одну точку и делайте длинный выдох.',
        hard: '{name}, взгляд в точку. Длинный выдох. 10 секунд. Делайте.',
      },
    },
  },
  {
    id: 'psyanxietyreminder14',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если тревога про будущее - вернись в "сейчас": что ты делаешь в эту минуту?',
        moderate:
          '{name}, вопрос на возвращение: что происходит прямо сейчас, в этой комнате? 2 факта.',
        hard: '{name}, хватит будущего. 2 факта о настоящем - сейчас.',
      },
      formal: {
        soft: '{name}, если тревога про будущее - вернитесь в "сейчас": что вы делаете в эту минуту?',
        moderate:
          '{name}, вопрос на возвращение: что происходит прямо сейчас, в этой комнате? 2 факта.',
        hard: '{name}, хватит будущего. 2 факта о настоящем - сейчас.',
      },
    },
  },
  {
    id: 'psyanxietyreminder15',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня тренировка спокойствия: 1 минуту дыши медленнее, чем обычно.',
        moderate:
          '{name}, 1 минута медленного дыхания. Не глубже - просто медленнее. Это снижает уровень тревоги.',
        hard: '{name}, минута медленного дыхания - сейчас. Не откладывай.',
      },
      formal: {
        soft: '{name}, сегодня тренировка спокойствия: 1 минуту дышите медленнее, чем обычно.',
        moderate:
          '{name}, 1 минута медленного дыхания. Не глубже - просто медленнее. Это снижает уровень тревоги.',
        hard: '{name}, минута медленного дыхания - сейчас. Не откладывайте.',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psyanxietyinfo11_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, тревога - это сигнал опасности, который иногда срабатывает слишком громко.',
        moderate:
          '{name}, при тревоге мозг угадывает худший сценарий. Это не прогноз, а режим защиты.',
        hard: '{name}, запомни: тревога не доказывает, что случится плохое. Она просто шумит.',
      },
      formal: {
        soft: '{name}, тревога - это сигнал опасности, который иногда срабатывает слишком громко.',
        moderate:
          '{name}, при тревоге мозг угадывает худший сценарий. Это не прогноз, а режим защиты.',
        hard: '{name}, запомните: тревога не доказывает, что случится плохое. Она просто шумит.',
      },
    },
  },
  {
    id: 'psyanxietyinfo12_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, паника - это волна: она нарастает, достигает пика и спадает.',
        moderate:
          '{name}, цель при панике - не "убрать сразу", а переждать пик. Дыхание и заземление ускоряют спад.',
        hard: '{name}, не убегай от волны. Пережди пик и делай шаги - так она быстрее уходит.',
      },
      formal: {
        soft: '{name}, паника - это волна: она нарастает, достигает пика и спадает.',
        moderate:
          '{name}, цель при панике - не "убрать сразу", а переждать пик. Дыхание и заземление ускоряют спад.',
        hard: '{name}, не убегайте от волны. Переждите пик и делайте шаги - так она быстрее уходит.',
      },
    },
  },
  {
    id: 'psyanxietyinfo13_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, длинный выдох - самый быстрый способ сказать телу: "опасности нет".',
        moderate:
          '{name}, если делать выдох длиннее вдоха, нервная система успокаивается быстрее.',
        hard: '{name}, не ищи сложного. Длинный выдох - базовый переключатель.',
      },
      formal: {
        soft: '{name}, длинный выдох - самый быстрый способ сказать телу: "опасности нет".',
        moderate:
          '{name}, если делать выдох длиннее вдоха, нервная система успокаивается быстрее.',
        hard: '{name}, не ищите сложного. Длинный выдох - базовый переключатель.',
      },
    },
  },
  {
    id: 'psyanxietyinfo14_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, 5-4-3-2-1 работает, потому что переводит внимание с мыслей на ощущения.',
        moderate:
          '{name}, заземление - это не "медитация". Это быстрый способ вернуть мозг в "здесь-и-сейчас".',
        hard: '{name}, тревога живет в голове. Заземление возвращает управление телом.',
      },
      formal: {
        soft: '{name}, 5-4-3-2-1 работает, потому что переводит внимание с мыслей на ощущения.',
        moderate:
          '{name}, заземление - это не "медитация". Это быстрый способ вернуть мозг в "здесь-и-сейчас".',
        hard: '{name}, тревога живет в голове. Заземление возвращает управление телом.',
      },
    },
  },
  {
    id: 'psyanxietyinfo15_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мысль может звучать уверенно и все равно быть ошибкой.',
        moderate:
          '{name}, тревожная мысль обычно говорит "точно будет плохо". Это стиль тревоги, не факт.',
        hard: '{name}, перестань принимать тревожные мысли за правду. Проверяй фактами.',
      },
      formal: {
        soft: '{name}, мысль может звучать уверенно и все равно быть ошибкой.',
        moderate:
          '{name}, тревожная мысль обычно говорит "точно будет плохо". Это стиль тревоги, не факт.',
        hard: '{name}, перестаньте принимать тревожные мысли за правду. Проверяйте фактами.',
      },
    },
  },
  {
    id: 'psyanxietyinfo16_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, тело и мозг связаны: расслабление мышц снижает тревогу в голове.',
        moderate:
          '{name}, когда челюсть/плечи зажаты, мозг считывает это как сигнал угрозы.',
        hard: '{name}, хочешь меньше тревоги - начни с тела. Это самый прямой путь.',
      },
      formal: {
        soft: '{name}, тело и мозг связаны: расслабление мышц снижает тревогу в голове.',
        moderate:
          '{name}, когда челюсть/плечи зажаты, мозг считывает это как сигнал угрозы.',
        hard: '{name}, хотите меньше тревоги - начните с тела. Это самый прямой путь.',
      },
    },
  },
  {
    id: 'psyanxietyinfo17_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, тревога усиливается, когда нет действий. Маленькое действие возвращает контроль.',
        moderate:
          '{name}, правило: меньше прокрутки - больше микро-действий (1 минута). Это стабилизирует.',
        hard: '{name}, хватит крутить. Действие лечит тревогу лучше, чем размышления.',
      },
      formal: {
        soft: '{name}, тревога усиливается, когда нет действий. Маленькое действие возвращает контроль.',
        moderate:
          '{name}, правило: меньше прокрутки - больше микро-действий (1 минута). Это стабилизирует.',
        hard: '{name}, хватит прокручивать. Действие снижает тревогу лучше, чем размышления.',
      },
    },
  },
  {
    id: 'psyanxietyinfo18_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, иногда тревога = усталость. Проверь: удалось ли поесть, попить воды, поспать?',
        moderate:
          '{name}, базовые вещи реально влияют: вода, еда, сон, свет, движение. Тревога снижается быстрее.',
        hard: '{name}, сначала база: вода/еда/сон. Потом уже мысли.',
      },
      formal: {
        soft: '{name}, иногда тревога = усталость. Проверьте: ели ли вы, пили ли воду, спали ли?',
        moderate:
          '{name}, базовые вещи реально влияют: вода, еда, сон, свет, движение. Тревога снижается быстрее.',
        hard: '{name}, сначала база: вода/еда/сон. Потом уже мысли.',
      },
    },
  },
  {
    id: 'psyanxietyinfo19_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, страх ощущается как факт, но это ощущение. Оно проходит.',
        moderate:
          '{name}, тревога не требует веры. Она требует навыков: выдох, заземление, простое действие.',
        hard: '{name}, не жди, что "перестанет быть страшно". Делай шаги вместе со страхом.',
      },
      formal: {
        soft: '{name}, страх ощущается как факт, но это ощущение. Оно проходит.',
        moderate:
          '{name}, тревога не требует веры. Она требует навыков: выдох, заземление, простое действие.',
        hard: '{name}, не ждите, что "перестанет быть страшно". Делайте шаги вместе со страхом.',
      },
    },
  },
  {
    id: 'psyanxietyinfo20_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, быстрые техники работают лучше, если повторять их регулярно, а не только в пик.',
        moderate:
          '{name}, тренируй спокойствие в спокойствии: 1 минута дыхания или заземления в день.',
        hard: '{name}, хочешь стабильности - тренируй ее каждый день. Минута - достаточно.',
      },
      formal: {
        soft: '{name}, быстрые техники работают лучше, если повторять их регулярно, а не только на пике.',
        moderate:
          '{name}, тренируйте спокойствие в спокойствии: 1 минута дыхания или заземления в день.',
        hard: '{name}, хотите стабильности - тренируйте ее каждый день. Минуты достаточно.',
      },
    },
  },
  {
    id: 'psyanxietyinfo21_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, "успокоиться" не всегда значит "ничего не чувствовать". Достаточно вернуть управляемость.',
        moderate:
          '{name}, цель - снизить интенсивность на 20-30%, а не сделать ноль. Это уже победа.',
        hard: '{name}, не требуй от себя идеала. Снизь на треть - и продолжай жить.',
      },
      formal: {
        soft: '{name}, "успокоиться" не всегда значит "ничего не чувствовать". Достаточно вернуть управляемость.',
        moderate:
          '{name}, цель - снизить интенсивность на 20-30%, а не сделать ноль. Это уже победа.',
        hard: '{name}, не требуйте от себя идеала. Снизьте на треть - и продолжайте жить.',
      },
    },
  },
  {
    id: 'psyanxietyinfo22_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если тревога говорит "срочно", это часто ложная срочность.',
        moderate:
          '{name}, тревога ускоряет. Полезная пауза: выдох - факт - действие.',
        hard: '{name}, не ведись на "срочно". Сначала выдох, потом решение.',
      },
      formal: {
        soft: '{name}, если тревога говорит "срочно", это часто ложная срочность.',
        moderate:
          '{name}, тревога ускоряет. Полезная пауза: выдох - факт - действие.',
        hard: '{name}, не ведитесь на "срочно". Сначала выдох, потом решение.',
      },
    },
  },
  {
    id: 'psyanxietyinfo23_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если тело "включилось", сначала помоги телу. Разговоры с собой потом.',
        moderate:
          '{name}, порядок такой: дыхание/тело -> заземление -> мысль. Так быстрее приходит ясность.',
        hard: '{name}, сначала тело. Потом мысли. Иначе тревога будет сильнее.',
      },
      formal: {
        soft: '{name}, если тело "включилось", сначала помогите телу. Разговоры с собой потом.',
        moderate:
          '{name}, порядок такой: дыхание/тело -> заземление -> мысль. Так быстрее приходит ясность.',
        hard: '{name}, сначала тело. Потом мысли. Иначе тревога будет сильнее.',
      },
    },
  },
  {
    id: 'psyanxietyinfo24_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, безопаснее всего снижать тревогу через простые телесные вещи: выдох, опора, взгляд.',
        moderate:
          '{name}, техники работают не потому, что "магия", а потому что меняют состояние нервной системы.',
        hard: '{name}, это физиология. Делай шаги - и состояние изменится.',
      },
      formal: {
        soft: '{name}, безопаснее всего снижать тревогу через простые телесные вещи: выдох, опора, взгляд.',
        moderate:
          '{name}, техники работают не потому, что "магия", а потому что меняют состояние нервной системы.',
        hard: '{name}, это физиология. Делайте шаги - и состояние изменится.',
      },
    },
  },
  {
    id: 'psyanxietyinfo25_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, тревога может быть сильной и все равно безопасной.',
        moderate:
          '{name}, неприятно - да. Опасно - обычно нет. Отделяй "неприятно" от "катастрофа".',
        hard: '{name}, тревога не равна катастрофе. Не путай ощущение с фактом.',
      },
      formal: {
        soft: '{name}, тревога может быть сильной и все равно безопасной.',
        moderate:
          '{name}, неприятно - да. Опасно - обычно нет. Отделяйте "неприятно" от "катастрофа".',
        hard: '{name}, тревога не равна катастрофе. Не путайте ощущение с фактом.',
      },
    },
  },

  // --- MOTIVATIONAL (15) ---
  {
    id: 'psyanxietymotiv01_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сейчас не нужно сохранять спокойствие. Достаточно дышать и быть здесь.',
        moderate:
          '{name}, тревога шумит, но ты управляешь действиями. Сделай один маленький шаг.',
        hard: '{name}, не спорь с тревогой. Выдох - шаг - дальше.',
      },
      formal: {
        soft: '{name}, вы не обязаны быть спокойными прямо сейчас. Достаточно дышать и быть здесь.',
        moderate:
          '{name}, тревога шумит, но вы управляете действиями. Сделайте один маленький шаг.',
        hard: '{name}, не спорьте с тревогой. Выдох - шаг - дальше.',
      },
    },
  },
  {
    id: 'psyanxietymotiv02_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, у тебя уже получалось справляться с таким. Эта волна тоже пройдет.',
        moderate:
          '{name}, сейчас задача простая: пережить пик. Потом станет легче.',
        hard: '{name}, держись. Пережди пик и делай шаги.',
      },
      formal: {
        soft: '{name}, вы уже справлялись с таким. Эта волна тоже пройдет.',
        moderate:
          '{name}, сейчас задача простая: пережить пик. Потом станет легче.',
        hard: '{name}, держитесь. Переждите пик и делайте шаги.',
      },
    },
  },
  {
    id: 'psyanxietymotiv03_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери доброту к себе: «мне тяжело, и это нормально».',
        moderate:
          '{name}, поддержка важнее самокритики. Ты делаешь лучшее, что можешь.',
        hard: '{name}, перестань себя бить. Помоги себе.',
      },
      formal: {
        soft: '{name}, выберите доброту к себе: «мне тяжело, и это нормально».',
        moderate:
          '{name}, поддержка важнее самокритики. Вы делаете лучшее, что можете.',
        hard: '{name}, перестаньте себя ругать. Помогите себе.',
      },
    },
  },
  {
    id: 'psyanxietymotiv04_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, один длинный выдох - это уже управление.',
        moderate:
          '{name}, не нужно идеально. Нужно чуть лучше, чем минуту назад.',
        hard: '{name}, сделай один длинный выдох. Сейчас.',
      },
      formal: {
        soft: '{name}, один длинный выдох - это уже управление.',
        moderate:
          '{name}, не нужно идеально. Нужно чуть лучше, чем минуту назад.',
        hard: '{name}, сделайте один длинный выдох. Сейчас.',
      },
    },
  },
  {
    id: 'psyanxietymotiv05_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, смелость - это делать шаг, даже когда страшно.',
        moderate:
          '{name}, тревоге не обязательно исчезать, чтобы можно было действовать.',
        hard: '{name}, делай шаг вместе со страхом.',
      },
      formal: {
        soft: '{name}, смелость - это делать шаг, даже когда страшно.',
        moderate:
          '{name}, тревога не должна исчезнуть, чтобы вы могли действовать.',
        hard: '{name}, делайте шаг вместе со страхом.',
      },
    },
  },
  {
    id: 'psyanxietymotiv06_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, с тобой всё в порядке. Твоя система защиты просто устала.',
        moderate:
          '{name}, тревога - это перегруз, а не приговор. Ее можно разгрузить.',
        hard: '{name}, это перегруз. Разгружайся по шагам.',
      },
      formal: {
        soft: '{name}, вы не сломаны. Ваша система защиты просто устала.',
        moderate:
          '{name}, тревога - это перегруз, а не приговор. Ее можно разгрузить.',
        hard: '{name}, это перегруз. Разгружайтесь по шагам.',
      },
    },
  },
  {
    id: 'psyanxietymotiv07_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня достаточно “нормально”, не нужно “идеально”.',
        moderate:
          '{name}, сделай минимум: дыхание, вода, один шаг. Этого достаточно.',
        hard: '{name}, минимум - тоже план. Выполни.',
      },
      formal: {
        soft: '{name}, сегодня достаточно “нормально”, не нужно “идеально”.',
        moderate:
          '{name}, сделайте минимум: дыхание, вода, один шаг. Этого достаточно.',
        hard: '{name}, минимум - тоже план. Выполните.',
      },
    },
  },
  {
    id: 'psyanxietymotiv08_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, возвращай себе контроль: внимание в тело, потом - в дела.',
        moderate:
          '{name}, не нужно решать всё сразу. Достаточно одного следующего шага.',
        hard: '{name}, один шаг. Сейчас. Остальное потом.',
      },
      formal: {
        soft: '{name}, возвращайте себе контроль: внимание в тело, потом - к делам.',
        moderate:
          '{name}, вы не обязаны решить все. Достаточно решить один следующий шаг.',
        hard: '{name}, один шаг. Сейчас. Остальное потом.',
      },
    },
  },
  {
    id: 'psyanxietymotiv09_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, пусть тревога едет рядом, но за руль садишься ты.',
        moderate:
          '{name}, тревога может говорить что угодно. Решения принимаешь ты.',
        hard: '{name}, ты за рулем. Делай, несмотря на шум.',
      },
      formal: {
        soft: '{name}, пусть тревога едет рядом, но за руль садитесь вы.',
        moderate:
          '{name}, тревога может говорить что угодно. Решения принимаете вы.',
        hard: '{name}, вы за рулем. Делайте, несмотря на шум.',
      },
    },
  },
  {
    id: 'psyanxietymotiv10_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты заслуживаешь спокойствия. Начни с 60 секунд заботы о себе.',
        moderate:
          '{name}, одна минута техники сейчас экономит часы прокрутки потом.',
        hard: '{name}, минута техники. Сейчас.',
      },
      formal: {
        soft: '{name}, вы заслуживаете спокойствия. Начните с 60 секунд заботы о себе.',
        moderate:
          '{name}, одна минута техники сейчас экономит часы прокрутки потом.',
        hard: '{name}, минута техники. Сейчас.',
      },
    },
  },
  {
    id: 'psyanxietymotiv11_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твой темп ок. Тревога не решает, как быстро тебе “надо”.',
        moderate: '{name}, замедление - это сила. Ты возвращаешь ясность.',
        hard: '{name}, замедляйся. Так ты победишь.',
      },
      formal: {
        soft: '{name}, ваш темп нормальный. Тревога не решает, как быстро вам “надо”.',
        moderate: '{name}, замедление - это сила. Вы возвращаете ясность.',
        hard: '{name}, замедляйтесь. Так вы справитесь.',
      },
    },
  },
  {
    id: 'psyanxietymotiv12_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сейчас не нужно “понять все”. Нужно пережить момент.',
        moderate: '{name}, сначала стабилизация, потом анализ. Ты все успеешь.',
        hard: '{name}, сначала стабилизируйся. Потом думай.',
      },
      formal: {
        soft: '{name}, сейчас не нужно “понять все”. Нужно пережить момент.',
        moderate: '{name}, сначала стабилизация, потом анализ. Вы все успеете.',
        hard: '{name}, сначала стабилизируйтесь. Потом думайте.',
      },
    },
  },
  {
    id: 'psyanxietymotiv13_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты не в одиночестве. Поддержку нормально просить.',
        moderate:
          '{name}, если тяжело - напиши одному человеку. 1 сообщение уже помогает.',
        hard: '{name}, не тяни в одиночку. Напиши кому-то.',
      },
      formal: {
        soft: '{name}, вы не одни. Поддержку нормально просить.',
        moderate:
          '{name}, если тяжело - напишите одному человеку. Одно сообщение уже помогает.',
        hard: '{name}, не тяните в одиночку. Напишите кому-то.',
      },
    },
  },
  {
    id: 'psyanxietymotiv14_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты учишься успокаиваться. Навык растет от повторений.',
        moderate:
          '{name}, каждый раз, когда ты делаешь технику, ты тренируешь устойчивость.',
        hard: '{name}, повторяй. Так создается устойчивость.',
      },
      formal: {
        soft: '{name}, вы учитесь успокаиваться. Навык растет от повторений.',
        moderate:
          '{name}, каждый раз, когда вы делаете технику, вы тренируете устойчивость.',
        hard: '{name}, повторяйте. Так создается устойчивость.',
      },
    },
  },
  {
    id: 'psyanxietymotiv15_new',
    kind: 'therapy',
    entityKey: 'anxiety',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, даже маленький прогресс - прогресс.',
        moderate:
          '{name}, сегодня достаточно стать спокойнее на 10%. Это уже меняет день.',
        hard: '{name}, на 10% лучше - уже достаточно. Сделай шаг.',
      },
      formal: {
        soft: '{name}, даже небольшой прогресс - прогресс.',
        moderate:
          '{name}, сегодня достаточно стать спокойнее на 10%. Это уже меняет день.',
        hard: '{name}, на 10% лучше - уже достаточно. Сделайте шаг.',
      },
    },
  },

  // =========================
  // STRESS (Стресс и выгорание) - 45 templates
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psystressreminder01_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, квадратное дыхание 4-4-4-4: вдох 4, пауза 4, выдох 4, пауза 4. 3 круга.',
        moderate:
          '{name}, снижаем стресс: 3 круга 4-4-4-4 (вдох - пауза - выдох - пауза). Ровно, без героизма.',
        hard: '{name}, выдыхай стресс. 3 круга 4-4-4-4. Сейчас.',
      },
      formal: {
        soft: '{name}, квадратное дыхание 4-4-4-4: вдох 4, пауза 4, выдох 4, пауза 4. 3 круга.',
        moderate:
          '{name}, снижаем стресс: 3 круга 4-4-4-4 (вдох - пауза - выдох - пауза). Ровно, без усилий.',
        hard: '{name}, выдыхайте стресс. 3 круга 4-4-4-4. Сейчас.',
      },
    },
  },
  {
    id: 'psystressreminder02_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, микро-пауза: 30 секунд ничего не делай и просто выдохни.',
        moderate:
          '{name}, пауза на 30 секунд: отложи телефон, выдохни длинно 5 раз.',
        hard: '{name}, стоп. 30 секунд паузы. Потом продолжишь.',
      },
      formal: {
        soft: '{name}, микро-пауза: 30 секунд ничего не делайте и просто выдохните.',
        moderate:
          '{name}, пауза на 30 секунд: отложите телефон, выдохните длинно 5 раз.',
        hard: '{name}, стоп. 30 секунд паузы. Потом продолжите.',
      },
    },
  },
  {
    id: 'psystressreminder03_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, проверь плечи: опусти их и сделай круги плечами 10 раз.',
        moderate:
          '{name}, разгрузи верх: 10 кругов плечами назад, 10 - вперед. Дыши спокойно.',
        hard: '{name}, плечи вниз. 10 кругов. Сейчас.',
      },
      formal: {
        soft: '{name}, проверьте плечи: опустите их и сделайте круги плечами 10 раз.',
        moderate:
          '{name}, разгрузите верх: 10 кругов плечами назад, 10 - вперед. Дышите спокойно.',
        hard: '{name}, плечи вниз. 10 кругов. Сейчас.',
      },
    },
  },
  {
    id: 'psystressreminder04_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай "3 вещи": назови 3 предмета вокруг и 3 ощущения в теле.',
        moderate:
          '{name}, быстрое заземление: 3 предмета вокруг + 3 ощущения в теле. Это возвращает в реальность.',
        hard: '{name}, 3 и 3. Три предмета и три ощущения. Сейчас.',
      },
      formal: {
        soft: '{name}, сделайте "3 вещи": назовите 3 предмета вокруг и 3 ощущения в теле.',
        moderate:
          '{name}, быстрое заземление: 3 предмета вокруг + 3 ощущения в теле. Это возвращает в реальность.',
        hard: '{name}, 3 и 3. Три предмета и три ощущения. Сейчас.',
      },
    },
  },
  {
    id: 'psystressreminder05_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если чувствуешь усталость — выбери одну задачу и сократи её до первого шага.',
        moderate:
          '{name}, анти-выгорание: один следующий шаг, не весь проект. Что самое маленькое действие?',
        hard: '{name}, перестань тащить все сразу. Один шаг. Сейчас.',
      },
      formal: {
        soft: '{name}, если устали - выберите одну задачу и сократите ее до первого шага.',
        moderate:
          '{name}, анти-выгорание: один следующий шаг, не весь проект. Какое самое маленькое действие?',
        hard: '{name}, перестаньте тащить все сразу. Один шаг. Сейчас.',
      },
    },
  },
  {
    id: 'psystressreminder06_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай разгрузку глаз: 20 секунд смотри вдаль.',
        moderate:
          '{name}, экран утомляет. 20 секунд взгляд вдаль + 3 длинных выдоха.',
        hard: '{name}, глаза от экрана. 20 секунд вдаль. Делай.',
      },
      formal: {
        soft: '{name}, сделайте разгрузку глаз: 20 секунд смотрите вдаль.',
        moderate:
          '{name}, экран утомляет. 20 секунд взгляд вдаль + 3 длинных выдоха.',
        hard: '{name}, глаза от экрана. 20 секунд вдаль. Делайте.',
      },
    },
  },
  {
    id: 'psystressreminder07_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попей воды. Усталость часто усиливается от обезвоживания.',
        moderate:
          '{name}, пауза на воду: 10 маленьких глотков. Потом вернешься к делу.',
        hard: '{name}, вода. Сейчас. Потом продолжишь.',
      },
      formal: {
        soft: '{name}, попейте воды. Усталость часто усиливается от обезвоживания.',
        moderate:
          '{name}, пауза на воду: 10 маленьких глотков. Потом вернетесь к делам.',
        hard: '{name}, вода. Сейчас. Потом продолжите.',
      },
    },
  },
  {
    id: 'psystressreminder08_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, 1 минута ходьбы по комнате - и нервная система успокаивается.',
        moderate:
          '{name}, встань и пройдись 1-2 минуты. Движение сбрасывает стресс.',
        hard: '{name}, вставай и иди 2 минуты. Сейчас.',
      },
      formal: {
        soft: '{name}, 1 минута ходьбы по комнате - и нервная система успокаивается.',
        moderate:
          '{name}, встаньте и пройдитесь 1-2 минуты. Движение сбрасывает стресс.',
        hard: '{name}, вставайте и идите 2 минуты. Сейчас.',
      },
    },
  },
  {
    id: 'psystressreminder09_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай короткий body-scan: где напряжение сильнее всего? ослабь на 10%.',
        moderate:
          '{name}, найди 1 место напряжения (шея/плечи/живот) и сделай его мягче на 10%.',
        hard: '{name}, найди напряжение и ослабь. Не надо идеально - на 10%.',
      },
      formal: {
        soft: '{name}, сделайте короткий body-scan: где напряжение сильнее всего? ослабьте на 10%.',
        moderate:
          '{name}, найдите 1 место напряжения (шея/плечи/живот) и сделайте его мягче на 10%.',
        hard: '{name}, найдите напряжение и ослабьте. Не нужно идеально - на 10%.',
      },
    },
  },
  {
    id: 'psystressreminder10_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выдохни и спроси: что важно сегодня, а что можно отложить?',
        moderate:
          '{name}, перегруз? выбери 1 главное на сегодня. Остальное - в список, не в голову.',
        hard: '{name}, сейчас выбор: 1 главное, остальное - позже. Решай.',
      },
      formal: {
        soft: '{name}, выдохните и спросите: что важно сегодня, а что можно отложить?',
        moderate:
          '{name}, перегруз? выберите 1 главное на сегодня. Остальное - в список, не в голову.',
        hard: '{name}, сейчас выбор: 1 главное, остальное - позже. Решайте.',
      },
    },
  },
  {
    id: 'psystressreminder11_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если выгораешь - снизь план на 20%. Это не слабость, это настройка нагрузки.',
        moderate:
          '{name}, выгорание лечится не "соберись", а снижением нагрузки и восстановлением. Сегодня - минус 20% к плану.',
        hard: '{name}, хватит ломать себя. Снизь нагрузку на 20% и возьми паузу.',
      },
      formal: {
        soft: '{name}, если выгораете - снизьте план на 20%. Это не слабость, это настройка нагрузки.',
        moderate:
          '{name}, выгорание лечится не "соберитесь", а снижением нагрузки и восстановлением. Сегодня - минус 20% к плану.',
        hard: '{name}, хватит ломать себя. Снизьте нагрузку на 20% и возьмите паузу.',
      },
    },
  },
  {
    id: 'psystressreminder12_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай "закрытие вкладок": выпиши 3 мысли на бумагу/в заметки.',
        moderate:
          '{name}, разгрузка головы: выпиши 3 пункта, которые крутятся. Это снижает шум.',
        hard: '{name}, хватит держать все в голове. Выпиши 3 пункта. Сейчас.',
      },
      formal: {
        soft: '{name}, сделайте "закрытие вкладок": выпишите 3 мысли на бумагу/в заметки.',
        moderate:
          '{name}, разгрузка головы: выпишите 3 пункта, которые крутятся. Это снижает шум.',
        hard: '{name}, хватит держать все в голове. Выпишите 3 пункта. Сейчас.',
      },
    },
  },
  {
    id: 'psystressreminder13_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай 10 медленных наклонов головы вправо-влево. Дыши.',
        moderate:
          '{name}, шея напряжена? 10 медленных наклонов вправо-влево + длинный выдох.',
        hard: '{name}, шея: 10 наклонов. Медленно. Сейчас.',
      },
      formal: {
        soft: '{name}, сделайте 10 медленных наклонов головы вправо-влево. Дышите.',
        moderate:
          '{name}, шея напряжена? 10 медленных наклонов вправо-влево + длинный выдох.',
        hard: '{name}, шея: 10 наклонов. Медленно. Сейчас.',
      },
    },
  },
  {
    id: 'psystressreminder14_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, поставь таймер на 5 минут и сделай паузу без экрана.',
        moderate:
          '{name}, 5 минут без экрана. Это реально помогает мозгу восстановиться.',
        hard: '{name}, телефон в сторону. 5 минут паузы. Делай.',
      },
      formal: {
        soft: '{name}, поставьте таймер на 5 минут и сделайте паузу без экрана.',
        moderate:
          '{name}, 5 минут без экрана. Это реально помогает мозгу восстановиться.',
        hard: '{name}, телефон в сторону. 5 минут паузы. Делайте.',
      },
    },
  },
  {
    id: 'psystressreminder15_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери один способ восстановиться сегодня: сон, прогулка или тишина 10 минут.',
        moderate:
          '{name}, план восстановления: 10 минут тишины или 10 минут прогулки. Не больше - но обязательно.',
        hard: '{name}, восстановление - задача. 10 минут тишины/прогулки - сегодня.',
      },
      formal: {
        soft: '{name}, выберите один способ восстановиться сегодня: сон, прогулка или тишина 10 минут.',
        moderate:
          '{name}, план восстановления: 10 минут тишины или 10 минут прогулки. Не больше - но обязательно.',
        hard: '{name}, восстановление - задача. 10 минут тишины/прогулки - сегодня.',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psystressinfo11_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, стресс - это перегруз системы. Он снижается через паузы и восстановление.',
        moderate:
          '{name}, при перегрузе мозг хуже думает и больше тревожится. Это нормально для усталости.',
        hard: '{name}, если "тупишь" — возможно, просто перегруз. Это не лень.',
      },
      formal: {
        soft: '{name}, стресс - это перегруз системы. Он снижается через паузы и восстановление.',
        moderate:
          '{name}, при перегрузе мозг хуже думает и больше тревожится. Это нормально для усталости.',
        hard: '{name}, если "тупите" - возможно, вы просто перегружены. Это не лень.',
      },
    },
  },
  {
    id: 'psystressinfo12_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выгорание часто начинается с режима "всегда надо".',
        moderate:
          '{name}, выгорание - это не слабость. Это результат долгой нагрузки без восстановления.',
        hard: '{name}, если нет восстановления, ресурс заканчивается. Это физика.',
      },
      formal: {
        soft: '{name}, выгорание часто начинается с режима "всегда надо".',
        moderate:
          '{name}, выгорание - это не слабость. Это результат долгой нагрузки без восстановления.',
        hard: '{name}, если нет восстановления, ресурс заканчивается. Это физика.',
      },
    },
  },
  {
    id: 'psystressinfo13_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, пауза - это часть работы, а не награда за работу.',
        moderate:
          '{name}, короткие паузы каждые 60-90 минут помогают держать ресурс ровнее.',
        hard: '{name}, паузы не делают слабым. Они делают эффективным.',
      },
      formal: {
        soft: '{name}, пауза - это часть работы, а не награда за работу.',
        moderate:
          '{name}, короткие паузы каждые 60-90 минут помогают держать ресурс ровнее.',
        hard: '{name}, паузы не делают слабым. Они делают эффективным.',
      },
    },
  },
  {
    id: 'psystressinfo14_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, квадратное дыхание помогает, потому что выравнивает ритм и снижает возбуждение.',
        moderate:
          '{name}, когда дыхание ровное, телу проще "отпустить" стресс.',
        hard: '{name}, хочешь быстрее выдохнуть стресс - делай ровное дыхание, не мысли.',
      },
      formal: {
        soft: '{name}, квадратное дыхание помогает, потому что выравнивает ритм и снижает возбуждение.',
        moderate:
          '{name}, когда дыхание ровное, телу проще "отпустить" стресс.',
        hard: '{name}, хотите быстрее выдохнуть стресс - делайте ровное дыхание, не мысли.',
      },
    },
  },
  {
    id: 'psystressinfo15_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, усталость усиливает раздражительность и тревожность. Это нормально.',
        moderate:
          '{name}, когда ресурс на нуле, любая мелочь кажется большой. Это не про "испортился", это перегруз.',
        hard: '{name}, если всё бесит — похоже на выгорание. Лечится отдыхом и границами.',
      },
      formal: {
        soft: '{name}, усталость усиливает раздражительность и тревожность. Это нормально.',
        moderate:
          '{name}, когда ресурс на нуле, любая мелочь кажется большой. Это не "вы испортились", это перегруз.',
        hard: '{name}, если все раздражает - скорее всего, вы выгорели. Лечится отдыхом и границами.',
      },
    },
  },
  {
    id: 'psystressinfo16_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, "не успеваю" часто означает: задач слишком много одновременно.',
        moderate:
          '{name}, мозг плохо работает в режиме многозадачности. Один фокус = меньше стресса.',
        hard: '{name}, многозадачность - это стресс. Режь до одного.',
      },
      formal: {
        soft: '{name}, "не успеваю" часто означает: задач слишком много одновременно.',
        moderate:
          '{name}, мозг плохо работает в режиме многозадачности. Один фокус = меньше стресса.',
        hard: '{name}, многозадачность - это стресс. Сведите до одного.',
      },
    },
  },
  {
    id: 'psystressinfo17_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если нет сил - это тоже информация. Ее важно слушать.',
        moderate:
          '{name}, ресурс не бесконечен. Его можно пополнить, но сначала нужно снизить расход.',
        hard: '{name}, ты не робот. Нужны границы и восстановление.',
      },
      formal: {
        soft: '{name}, если нет сил - это тоже информация. Ее важно слушать.',
        moderate:
          '{name}, ресурс не бесконечен. Его можно пополнить, но сначала нужно снизить расход.',
        hard: '{name}, вы не робот. Нужны границы и восстановление.',
      },
    },
  },
  {
    id: 'psystressinfo18_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, восстановление - это сон, еда, движение и тишина. Без них мозг не перезагружается.',
        moderate:
          '{name}, чем проще привычки (сон/еда/вода/движение), тем стабильнее психика.',
        hard: '{name}, хочешь меньше выгорания - начни с базы. Это не банально, это работает.',
      },
      formal: {
        soft: '{name}, восстановление - это сон, еда, движение и тишина. Без них мозг не перезагружается.',
        moderate:
          '{name}, чем проще привычки (сон/еда/вода/движение), тем стабильнее психика.',
        hard: '{name}, хотите меньше выгорания - начните с базы. Это не банально, это работает.',
      },
    },
  },
  {
    id: 'psystressinfo19_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, отдых - это не только "ничего". Это и смена деятельности.',
        moderate:
          '{name}, иногда лучший отдых - 10 минут прогулки или растяжки, а не еще один скролл.',
        hard: '{name}, скролл не восстанавливает так, как сон/движение/тишина. Выбирай умнее.',
      },
      formal: {
        soft: '{name}, отдых - это не только "ничего". Это и смена деятельности.',
        moderate:
          '{name}, иногда лучший отдых - 10 минут прогулки или растяжки, а не еще один скролл.',
        hard: '{name}, скролл не восстанавливает так, как сон/движение/тишина. Выбирайте умнее.',
      },
    },
  },
  {
    id: 'psystressinfo20_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, "устал" и "ленивый" - разные вещи. Усталость требует восстановления.',
        moderate:
          '{name}, если мотивации нет, часто причина в истощении, а не в характере.',
        hard: '{name}, хватит ругать себя. Чини ресурс, а не самооценку.',
      },
      formal: {
        soft: '{name}, "устал" и "ленивый" - разные вещи. Усталость требует восстановления.',
        moderate:
          '{name}, если мотивации нет, часто причина в истощении, а не в характере.',
        hard: '{name}, хватит ругать себя. Восстанавливайте ресурс, а не самооценку.',
      },
    },
  },
  {
    id: 'psystressinfo21_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, стресс легче переживать, когда есть план: 1 главное + 1 пауза.',
        moderate:
          '{name}, план на день при перегрузе: одно главное дело и один слот восстановления.',
        hard: '{name}, без плана перегруз растет. Сделай 1 главное и 1 паузу.',
      },
      formal: {
        soft: '{name}, стресс легче переживать, когда есть план: 1 главное + 1 пауза.',
        moderate:
          '{name}, план на день при перегрузе: одно главное дело и один слот восстановления.',
        hard: '{name}, без плана перегруз растет. Сделайте 1 главное и 1 паузу.',
      },
    },
  },
  {
    id: 'psystressinfo22_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, постоянная нагрузка делает эмоции "громче". Это физиология.',
        moderate:
          '{name}, когда ресурс низкий, мозг быстрее включает тревогу и раздражение.',
        hard: '{name}, сначала ресурс - потом героизм. Иначе перегоришь.',
      },
      formal: {
        soft: '{name}, постоянная нагрузка делает эмоции "громче". Это физиология.',
        moderate:
          '{name}, когда ресурс низкий, мозг быстрее включает тревогу и раздражение.',
        hard: '{name}, сначала ресурс - потом героизм. Иначе перегорите.',
      },
    },
  },
  {
    id: 'psystressinfo23_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, "нормально устать" - да. Но "нормально жить без отдыха" - нет.',
        moderate:
          '{name}, выгорание часто начинается незаметно. Регулярные паузы - профилактика.',
        hard: '{name}, если хочешь долго ехать - перестань ездить на пустом баке.',
      },
      formal: {
        soft: '{name}, "нормально устать" - да. Но "нормально жить без отдыха" - нет.',
        moderate:
          '{name}, выгорание часто начинается незаметно. Регулярные паузы - профилактика.',
        hard: '{name}, если хотите долго ехать - перестаньте ездить на пустом баке.',
      },
    },
  },
  {
    id: 'psystressinfo24_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, маленькие ритуалы восстановления работают лучше редких отпусков.',
        moderate:
          '{name}, ежедневные 5-10 минут восстановления дают больше устойчивости, чем ожидание "когда станет легче".',
        hard: '{name}, устойчивость строится ежедневно. Иначе - качели.',
      },
      formal: {
        soft: '{name}, небольшие ритуалы восстановления работают лучше редких отпусков.',
        moderate:
          '{name}, ежедневные 5-10 минут восстановления дают больше устойчивости, чем ожидание "когда станет легче".',
        hard: '{name}, устойчивость строится ежедневно. Иначе - качели.',
      },
    },
  },
  {
    id: 'psystressinfo25_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, стресс снижается, когда ты возвращаешь себе выбор и границы.',
        moderate:
          '{name}, границы - это не конфликт. Это способ сохранить ресурс.',
        hard: '{name}, если не ставишь границы, ресурс ставит тебя на паузу сам.',
      },
      formal: {
        soft: '{name}, стресс снижается, когда вы возвращаете себе выбор и границы.',
        moderate:
          '{name}, границы - это не конфликт. Это способ сохранить ресурс.',
        hard: '{name}, если вы не ставите границы, ресурс ставит вас на паузу сам.',
      },
    },
  },

  // --- MOTIVATIONAL (15) ---
  {
    id: 'psystressmotiv01_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, постоянная продуктивность не обязательна. Ресурс важнее.',
        moderate: '{name}, сегодня цель: сохранить силы. Это тоже результат.',
        hard: '{name}, стоп гонка. Береги ресурс.',
      },
      formal: {
        soft: '{name}, вы не обязаны быть продуктивными всегда. Ресурс важнее.',
        moderate: '{name}, сегодня цель: сохранить силы. Это тоже результат.',
        hard: '{name}, остановите гонку. Берегите ресурс.',
      },
    },
  },
  {
    id: 'psystressmotiv02_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право на паузу.',
        moderate:
          '{name}, пауза сейчас = меньше ошибок и меньше стресса потом.',
        hard: '{name}, сделай паузу. Сейчас.',
      },
      formal: {
        soft: '{name}, вы имеете право на паузу.',
        moderate:
          '{name}, пауза сейчас = меньше ошибок и меньше стресса потом.',
        hard: '{name}, сделайте паузу. Сейчас.',
      },
    },
  },
  {
    id: 'psystressmotiv03_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, дело не в лени — это усталость. Лечится восстановлением.',
        moderate:
          '{name}, сначала восстановление, потом скорость. Так ты выдержишь длинную дистанцию.',
        hard: '{name}, перестань себя ломать. Восстановись.',
      },
      formal: {
        soft: '{name}, вы не ленивы - вы устали. Это лечится восстановлением.',
        moderate:
          '{name}, сначала восстановление, потом скорость. Так вы выдержите длинную дистанцию.',
        hard: '{name}, перестаньте себя ломать. Восстановитесь.',
      },
    },
  },
  {
    id: 'psystressmotiv04_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно делать меньше и всё равно оставаться ценным человеком.',
        moderate:
          '{name}, “меньше” иногда = “умнее”. Сократи план и сохрани силы.',
        hard: '{name}, режь план. Сохраняй силы.',
      },
      formal: {
        soft: '{name}, вы можете делать меньше - и все равно быть ценными.',
        moderate:
          '{name}, “меньше” иногда = “умнее”. Сократите план и сохраните силы.',
        hard: '{name}, сократите план. Сохраняйте силы.',
      },
    },
  },
  {
    id: 'psystressmotiv05_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, один следующий шаг - это уже движение вперед.',
        moderate: '{name}, делай по одному. Многозадачность сжигает ресурс.',
        hard: '{name}, один шаг. Не десять.',
      },
      formal: {
        soft: '{name}, один следующий шаг - это уже движение вперед.',
        moderate: '{name}, делайте по одному. Многозадачность сжигает ресурс.',
        hard: '{name}, один шаг. Не десять.',
      },
    },
  },
  {
    id: 'psystressmotiv06_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твой организм не обязан “тянуть” бесконечно.',
        moderate: '{name}, забота о себе - это поддержка системы, а не каприз.',
        hard: '{name}, забота о себе - обязательна. Точка.',
      },
      formal: {
        soft: '{name}, ваш организм не обязан “тянуть” бесконечно.',
        moderate: '{name}, забота о себе - это поддержка системы, а не каприз.',
        hard: '{name}, забота о себе - обязательна. Точка.',
      },
    },
  },
  {
    id: 'psystressmotiv07_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь замедлиться и не проиграть.',
        moderate: '{name}, замедление возвращает качество и спокойнее голову.',
        hard: '{name}, замедляйся. Это выгодно.',
      },
      formal: {
        soft: '{name}, вы можете замедлиться и не проиграть.',
        moderate: '{name}, замедление возвращает качество и спокойнее голову.',
        hard: '{name}, замедляйтесь. Это выгодно.',
      },
    },
  },
  {
    id: 'psystressmotiv08_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты заслуживаешь восстановления, даже если “еще не все сделано”.',
        moderate: '{name}, сначала ресурс. Потом задачи. Так устойчивее.',
        hard: '{name}, восстановись. Потом продолжишь.',
      },
      formal: {
        soft: '{name}, вы заслуживаете восстановления, даже если “еще не все сделано”.',
        moderate: '{name}, сначала ресурс. Потом задачи. Так устойчивее.',
        hard: '{name}, восстановитесь. Потом продолжите.',
      },
    },
  },
  {
    id: 'psystressmotiv09_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твой день не обязан быть героическим.',
        moderate:
          '{name}, сделай минимум качественно - и это будет достаточно.',
        hard: '{name}, минимум. Качественно. Дальше отдых.',
      },
      formal: {
        soft: '{name}, ваш день не обязан быть героическим.',
        moderate: '{name}, сделайте минимум качественно - и этого достаточно.',
        hard: '{name}, минимум. Качественно. Дальше отдых.',
      },
    },
  },
  {
    id: 'psystressmotiv10_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня выбери одну вещь, которая тебя поддержит.',
        moderate:
          '{name}, выбери один ритуал восстановления: вода, прогулка или 10 минут тишины.',
        hard: '{name}, выбери и сделай один ритуал восстановления. Сегодня.',
      },
      formal: {
        soft: '{name}, сегодня выберите одну вещь, которая вас поддержит.',
        moderate:
          '{name}, выберите один ритуал восстановления: вода, прогулка или 10 минут тишины.',
        hard: '{name}, выберите и сделайте один ритуал восстановления. Сегодня.',
      },
    },
  },
  {
    id: 'psystressmotiv11_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право сказать “не сейчас”.',
        moderate:
          '{name}, границы - это способ не сгореть. Маленькое “нет” спасает ресурс.',
        hard: '{name}, скажи “нет” лишнему. Сохрани себя.',
      },
      formal: {
        soft: '{name}, вы имеете право сказать “не сейчас”.',
        moderate:
          '{name}, границы - это способ не сгореть. Маленькое “нет” сохраняет ресурс.',
        hard: '{name}, скажите “нет” лишнему. Сохраните себя.',
      },
    },
  },
  {
    id: 'psystressmotiv12_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, отдых - это часть результата.',
        moderate:
          '{name}, чем бережнее к себе сейчас, тем стабильнее ты завтра.',
        hard: '{name}, отдыхай, чтобы не сломаться.',
      },
      formal: {
        soft: '{name}, отдых - это часть результата.',
        moderate:
          '{name}, чем бережнее к себе сейчас, тем стабильнее вы завтра.',
        hard: '{name}, отдыхайте, чтобы не сломаться.',
      },
    },
  },
  {
    id: 'psystressmotiv13_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно спасать всё и всех.',
        moderate: '{name}, выбери главное. Остальное может подождать.',
        hard: '{name}, главное - первое. Остальное потом.',
      },
      formal: {
        soft: '{name}, вы не обязаны спасать все и всех.',
        moderate: '{name}, выберите главное. Остальное может подождать.',
        hard: '{name}, главное - первое. Остальное потом.',
      },
    },
  },
  {
    id: 'psystressmotiv14_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь восстановиться. Не быстро, но точно.',
        moderate:
          '{name}, устойчивость растет, когда ты регулярно делаешь маленькие паузы.',
        hard: '{name}, делай паузы регулярно. Так ты вытянешь.',
      },
      formal: {
        soft: '{name}, вы можете восстановиться. Не быстро, но точно.',
        moderate:
          '{name}, устойчивость растет, когда вы регулярно делаете маленькие паузы.',
        hard: '{name}, делайте паузы регулярно. Так вы справитесь.',
      },
    },
  },
  {
    id: 'psystressmotiv15_new',
    kind: 'therapy',
    entityKey: 'stress',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня достаточно стать легче на 10%. Это реально меняет день.',
        moderate:
          '{name}, выбери один маленький шаг, который снизит нагрузку на 10%.',
        hard: '{name}, снизь нагрузку на 10% и продолжай. Сейчас.',
      },
      formal: {
        soft: '{name}, сегодня достаточно стать легче на 10%. Это реально меняет день.',
        moderate:
          '{name}, выберите один маленький шаг, который снизит нагрузку на 10%.',
        hard: '{name}, снизьте нагрузку на 10% и продолжайте. Сейчас.',
      },
    },
  },

  // =========================
  // MOOD - 45 templates [NEW]
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psymoodreminder01_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мягкая пауза на настроение: 10 спокойных вдохов и длинных выдохов. Не “исправляй себя”, просто снизь напряжение на 10%.',
        moderate:
          '{name}, 10 дыханий с длинным выдохом. Это быстрый способ сделать внутренний шум тише и вернуть ясность без лишних слов.',
        hard: '{name}, пауза. 10 длинных выдохов. Потом вернешься к делам.',
      },
      formal: {
        soft: '{name}, мягкая пауза: 10 спокойных вдохов и длинных выдохов. Не “исправляйте себя”, просто снизьте напряжение на 10%.',
        moderate:
          '{name}, 10 дыханий с длинным выдохом. Это быстрый способ сделать внутренний шум тише и вернуть ясность без лишних слов.',
        hard: '{name}, пауза. 10 длинных выдохов. Потом вернетесь к делам.',
      },
    },
  },
  {
    id: 'psymoodreminder02_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, проверь базу: вода, еда, сон. Иногда “плохое настроение” — это усталость тела, а не проблема характера.',
        moderate:
          '{name}, быстрое восстановление: стакан воды + что-то простое поесть. Настроение часто растет, когда телу хватает топлива.',
        hard: '{name}, сначала база: вода и еда. Потом уже мысли.',
      },
      formal: {
        soft: '{name}, проверьте базу: вода, еда, сон. Иногда “плохое настроение” — это усталость тела, а не проблема характера.',
        moderate:
          '{name}, быстрое восстановление: стакан воды + что-то простое поесть. Настроение растет, когда телу хватает топлива.',
        hard: '{name}, сначала база: вода и еда. Потом уже мысли.',
      },
    },
  },
  {
    id: 'psymoodreminder03_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай “микро-порядок”: убери одну маленькую зону на 2 минуты. Внешний порядок часто делает внутри спокойнее.',
        moderate:
          '{name}, 2 минуты наведи порядок на столе или вокруг себя. Это простое действие возвращает ощущение контроля и чуть поднимает тон.',
        hard: '{name}, 2 минуты уборки. Сейчас. Потом оценишь состояние.',
      },
      formal: {
        soft: '{name}, сделайте “микро-порядок”: уберите одну маленькую зону на 2 минуты. Внешний порядок часто делает внутри спокойнее.',
        moderate:
          '{name}, 2 минуты наведите порядок на столе или вокруг себя. Это возвращает контроль и чуть поднимает тон.',
        hard: '{name}, 2 минуты уборки. Сейчас. Потом оцените состояние.',
      },
    },
  },
  {
    id: 'psymoodreminder04_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, добавь свет: открой шторы или включи яркую лампу. Свет — простой способ поддержать мозг, когда настроение “в минусе”.',
        moderate:
          '{name}, 5 минут света и воздуха: окно/балкон/улица. Маленький выход в мир часто помогает сильнее, чем прокрутка мыслей.',
        hard: '{name}, свет и воздух. 5 минут. Делай.',
      },
      formal: {
        soft: '{name}, добавьте свет: откройте шторы или включите яркую лампу. Свет поддерживает мозг, когда настроение снижается.',
        moderate:
          '{name}, 5 минут света и воздуха: окно/балкон/улица. Маленький выход в мир помогает сильнее прокрутки мыслей.',
        hard: '{name}, свет и воздух. 5 минут. Сделайте.',
      },
    },
  },
  {
    id: 'psymoodreminder05_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, тело “держит” эмоции. Разомни плечи и шею 60 секунд, пока выдыхаешь длинно. Это реально снижает напряжение.',
        moderate:
          '{name}, 60 секунд: плечи вниз, круги плечами, мягкая шея. Дыши ровно. Настроение часто улучшается через тело.',
        hard: '{name}, 60 секунд разминки. Плечи, шея, длинный выдох. Сейчас.',
      },
      formal: {
        soft: '{name}, тело “держит” эмоции. Разомните плечи и шею 60 секунд с длинным выдохом. Это снижает напряжение.',
        moderate:
          '{name}, 60 секунд: плечи вниз, круги плечами, мягкая шея. Дышите ровно. Настроение улучшается через тело.',
        hard: '{name}, 60 секунд разминки. Плечи, шея, длинный выдох. Сейчас.',
      },
    },
  },
  {
    id: 'psymoodreminder06_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай “3 хороших мелочи”: назови 3 вещи, которые сегодня были хотя бы нейтральными. Это возвращает баланс восприятия.',
        moderate:
          '{name}, 3 нейтральных факта дня. Не надо “радоваться”, просто отметь, что не всё плохо. Это снижает ощущение провала.',
        hard: '{name}, назови 3 нейтральных факта. Быстро. Без споров с собой.',
      },
      formal: {
        soft: '{name}, сделайте “3 хороших мелочи”: назовите 3 вещи, которые сегодня были хотя бы нейтральными. Это возвращает баланс.',
        moderate:
          '{name}, 3 нейтральных факта дня. Не нужно “радоваться”, просто отметьте, что не всё плохо. Это снижает чувство провала.',
        hard: '{name}, назовите 3 нейтральных факта. Быстро. Без споров с собой.',
      },
    },
  },
  {
    id: 'psymoodreminder07_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если тянет в телефон — сделай обмен: 3 минуты музыки без скролла. Мозгу нужна разрядка, но не лишний шум.',
        moderate:
          '{name}, 3 минуты без ленты: музыка, тишина или окно. Это маленькая пауза, которая реально разгружает настроение.',
        hard: '{name}, стоп скролл. 3 минуты тишины или музыки. Сейчас.',
      },
      formal: {
        soft: '{name}, если тянет в телефон — сделайте обмен: 3 минуты музыки без скролла. Мозгу нужна разрядка, но не лишний шум.',
        moderate:
          '{name}, 3 минуты без ленты: музыка, тишина или окно. Это разгружает настроение.',
        hard: '{name}, остановите скролл. 3 минуты тишины или музыки. Сейчас.',
      },
    },
  },
  {
    id: 'psymoodreminder08_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай “одну добрую вещь” для себя: чай, душ, крем, плед. Маленькая забота помогает психике чувствовать безопасность.',
        moderate:
          '{name}, выбери один жест заботы на 5 минут. Не “для красоты”, а чтобы телу стало чуть спокойнее и теплее внутри.',
        hard: '{name}, 5 минут заботы о себе. Выбирай и делай.',
      },
      formal: {
        soft: '{name}, сделайте “одну добрую вещь” для себя: чай, душ, плед. Маленькая забота помогает психике чувствовать безопасность.',
        moderate:
          '{name}, выберите один жест заботы на 5 минут. Чтобы телу стало чуть спокойнее и теплее внутри.',
        hard: '{name}, 5 минут заботы о себе. Выберите и сделайте.',
      },
    },
  },
  {
    id: 'psymoodreminder09_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мини-прогулка: 5 минут пройтись по комнате или на улице. Движение часто возвращает тон быстрее, чем разговоры в голове.',
        moderate:
          '{name}, 5 минут движения без цели: пройтись, потянуться, подняться по лестнице. Это “перезапуск” для настроения.',
        hard: '{name}, 5 минут движения. Сейчас. Не обсуждаем.',
      },
      formal: {
        soft: '{name}, мини-прогулка: 5 минут пройтись по комнате или на улице. Движение возвращает тон быстрее мыслей.',
        moderate:
          '{name}, 5 минут движения без цели: пройтись, потянуться, подняться по лестнице. Это “перезапуск” для настроения.',
        hard: '{name}, 5 минут движения. Сейчас. Без обсуждений.',
      },
    },
  },
  {
    id: 'psymoodreminder10_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если в голове тяжело — выпиши 3 мысли в заметки. “Я вернусь к этому позже”. Запись снижает шум и облегчает внутри.',
        moderate:
          '{name}, выгрузи мысли: 3 пункта и один следующий шаг. Не решай всё сразу — только разгрузи голову.',
        hard: '{name}, выпиши 3 мысли. Сейчас. Потом легче.',
      },
      formal: {
        soft: '{name}, если в голове тяжело — выпишите 3 мысли в заметки. “Я вернусь к этому позже”. Запись снижает шум.',
        moderate:
          '{name}, выгрузите мысли: 3 пункта и один следующий шаг. Не решайте всё сразу — только разгрузите голову.',
        hard: '{name}, выпишите 3 мысли. Сейчас. Потом станет легче.',
      },
    },
  },
  {
    id: 'psymoodreminder11_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй фразу: “мне сейчас непросто, и я поддержу себя”. Это не магия — это переключение с критики на заботу.',
        moderate:
          '{name}, замени “что со мной не так?” на “что мне нужно?”. Один ответ и один шаг — и настроение станет чуть ровнее.',
        hard: '{name}, хватит критики. Что тебе нужно? Назови и сделай один шаг.',
      },
      formal: {
        soft: '{name}, попробуйте фразу: “мне сейчас непросто, и я поддержу себя”. Это переключает с критики на заботу.',
        moderate:
          '{name}, замените “что со мной не так?” на “что мне нужно?”. Один ответ и один шаг — и настроение ровнее.',
        hard: '{name}, хватит критики. Что вам нужно? Назовите и сделайте один шаг.',
      },
    },
  },
  {
    id: 'psymoodreminder12_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери “одно главное” на сегодня и отпусти остальное. Когда задач меньше, внутри меньше давления и больше шансов на облегчение.',
        moderate:
          '{name}, 1 главное дело + 1 маленькая пауза. Такой план держит настроение ровнее, чем попытка “успеть всё”.',
        hard: '{name}, один приоритет. Остальное — в сторону. Делай.',
      },
      formal: {
        soft: '{name}, выберите “одно главное” на сегодня и отпустите остальное. Когда задач меньше, меньше давления и больше облегчения.',
        moderate:
          '{name}, 1 главное дело + 1 маленькая пауза. Такой план держит настроение ровнее.',
        hard: '{name}, один приоритет. Остальное — в сторону. Сделайте.',
      },
    },
  },
  {
    id: 'psymoodreminder13_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, поддержи себя контактами: напиши одному человеку коротко “как ты?”. Связь с людьми часто мягко поднимает настроение.',
        moderate:
          '{name}, одно сообщение близкому — это маленькая опора. Не нужно объяснять всё, достаточно контакта и одного теплого слова.',
        hard: '{name}, напиши кому-то. Одно сообщение. Сейчас.',
      },
      formal: {
        soft: '{name}, поддержите себя контактами: напишите одному человеку коротко “как вы?”. Связь с людьми мягко поднимает настроение.',
        moderate:
          '{name}, одно сообщение близкому — маленькая опора. Не нужно объяснять всё, достаточно контакта и теплого слова.',
        hard: '{name}, напишите кому-то. Одно сообщение. Сейчас.',
      },
    },
  },
  {
    id: 'psymoodreminder14_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай 10 секунд “взгляд вдаль” и длинный выдох. Это простая разгрузка, когда мозг устал и всё кажется тяжелее.',
        moderate:
          '{name}, 20 секунд смотри вдаль + 3 длинных выдоха. Мелочь, но она реально снимает внутренний разгон.',
        hard: '{name}, взгляд вдаль. 3 длинных выдоха. Поехали.',
      },
      formal: {
        soft: '{name}, сделайте 10 секунд “взгляд вдаль” и длинный выдох. Это разгрузка, когда мозг устал и всё кажется тяжелее.',
        moderate:
          '{name}, 20 секунд смотрите вдаль + 3 длинных выдоха. Это снимает внутренний разгон.',
        hard: '{name}, взгляд вдаль. 3 длинных выдоха. Начните.',
      },
    },
  },
  {
    id: 'psymoodreminder15_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, короткий чек-ин: “что я чувствую?”, “что мне нужно?”, “какой один шаг я могу сделать?”. Три вопроса возвращают опору.',
        moderate:
          '{name}, 3 вопроса для ясности: чувство — потребность — шаг. Ответь кратко и сделай один шаг. Это помогает выровнять день.',
        hard: '{name}, чувство. потребность. шаг. Ответь и сделай.',
      },
      formal: {
        soft: '{name}, короткий чек-ин: “что я чувствую?”, “что мне нужно?”, “какой один шаг я могу сделать?”. Это возвращает опору.',
        moderate:
          '{name}, 3 вопроса: чувство — потребность — шаг. Ответьте кратко и сделайте один шаг. Это выравнивает день.',
        hard: '{name}, чувство. потребность. шаг. Ответьте и сделайте.',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psymoodinfo01_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, настроение — не “характер”, а состояние. Оно зависит от сна, еды, стресса и нагрузки. Это можно поддерживать простыми шагами.',
        moderate:
          '{name}, когда мало сна и много стресса, мозг видит мир мрачнее. Это не правда о жизни, а эффект перегруза.',
        hard: '{name}, если всё кажется плохим — проверь ресурс. Перегруз меняет восприятие.',
      },
      formal: {
        soft: '{name}, настроение — не “характер”, а состояние. Оно зависит от сна, еды, стресса и нагрузки. Его можно поддерживать шагами.',
        moderate:
          '{name}, когда мало сна и много стресса, мозг видит мир мрачнее. Это не правда о жизни, а эффект перегруза.',
        hard: '{name}, если всё кажется плохим — проверьте ресурс. Перегруз меняет восприятие.',
      },
    },
  },
  {
    id: 'psymoodinfo02_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, эмоции приходят волнами. Даже сильные чувства обычно спадают, если не подкармливать их самокритикой и прокруткой.',
        moderate:
          '{name}, цель — не “всегда быть в плюсе”, а уметь возвращаться в рабочее состояние. Это навык, а не талант.',
        hard: '{name}, не жди постоянной радости. Учись возвращаться. Это и есть устойчивость.',
      },
      formal: {
        soft: '{name}, эмоции приходят волнами. Даже сильные чувства спадают, если не подкармливать их самокритикой и прокруткой.',
        moderate:
          '{name}, цель — не “всегда быть в плюсе”, а уметь возвращаться в рабочее состояние. Это навык.',
        hard: '{name}, не ждите постоянной радости. Учитесь возвращаться. Это устойчивость.',
      },
    },
  },
  {
    id: 'psymoodinfo03_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, самокритика усиливает тяжесть. Поддержка снижает напряжение и помогает действовать. Это не “слабость”, а работающая стратегия.',
        moderate:
          '{name}, вопрос “что со мной не так?” редко помогает. Вопрос “что мне нужно?” чаще приводит к шагу и облегчению.',
        hard: '{name}, критика не лечит. Нужны потребности и шаги.',
      },
      formal: {
        soft: '{name}, самокритика усиливает тяжесть. Поддержка снижает напряжение и помогает действовать. Это работающая стратегия.',
        moderate:
          '{name}, вопрос “что со мной не так?” редко помогает. Вопрос “что мне нужно?” чаще приводит к шагу и облегчению.',
        hard: '{name}, критика не лечит. Нужны потребности и шаги.',
      },
    },
  },
  {
    id: 'psymoodinfo04_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, маленькие действия меняют состояние. Даже 2–5 минут движения дают мозгу сигнал: “я живу, я справляюсь, я могу”.',
        moderate:
          '{name}, мотивация часто появляется после действия, а не до него. Поэтому “маленький шаг” — реально эффективный инструмент.',
        hard: '{name}, не жди мотивацию. Действие запускает ее.',
      },
      formal: {
        soft: '{name}, маленькие действия меняют состояние. Даже 2–5 минут движения дают мозгу сигнал: “я справляюсь”.',
        moderate:
          '{name}, мотивация часто появляется после действия, а не до него. Поэтому “маленький шаг” — эффективный инструмент.',
        hard: '{name}, не ждите мотивацию. Действие запускает ее.',
      },
    },
  },
  {
    id: 'psymoodinfo05_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, “ничего не хочется” часто значит: система перегружена. Это не лень, а сигнал снизить нагрузку и восстановить базу.',
        moderate:
          '{name}, когда ресурс низкий, мозг экономит силы и “гасит” интерес. Восстановление возвращает желание постепенно.',
        hard: '{name}, если нет сил — это ресурс, не характер. Чини ресурс.',
      },
      formal: {
        soft: '{name}, “ничего не хочется” часто значит: система перегружена. Это не лень, а сигнал снизить нагрузку и восстановить базу.',
        moderate:
          '{name}, когда ресурс низкий, мозг экономит силы и “гасит” интерес. Восстановление возвращает желание постепенно.',
        hard: '{name}, если нет сил — это ресурс, не характер. Восстанавливайте ресурс.',
      },
    },
  },
  {
    id: 'psymoodinfo06_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, дневной свет и воздух — простые регуляторы настроения. Даже короткий выход на улицу помогает мозгу “настроить яркость”.',
        moderate:
          '{name}, чем меньше света и движения, тем проще застрять в тяжести. Микро-прогулка — маленькое лекарство без побочек.',
        hard: '{name}, свет и движение — база для настроения. Без нее темнеет внутри.',
      },
      formal: {
        soft: '{name}, дневной свет и воздух — простые регуляторы настроения. Даже короткий выход на улицу помогает мозгу “настроить яркость”.',
        moderate:
          '{name}, чем меньше света и движения, тем проще застрять в тяжести. Микро-прогулка помогает.',
        hard: '{name}, свет и движение — база для настроения. Без нее темнеет внутри.',
      },
    },
  },
  {
    id: 'psymoodinfo07_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мозг запоминает плохое ярче, чем нейтральное. Поэтому “3 нейтральных факта” — это тренировка баланса, а не самообман.',
        moderate:
          '{name}, когда ты замечаешь нейтральное и хорошее, ты расширяешь картину. Так настроение становится устойчивее.',
        hard: '{name}, отмечать нейтральное — не слабость. Это навык устойчивости.',
      },
      formal: {
        soft: '{name}, мозг запоминает плохое ярче, чем нейтральное. Поэтому “3 нейтральных факта” — тренировка баланса, а не самообман.',
        moderate:
          '{name}, когда вы замечаете нейтральное и хорошее, вы расширяете картину. Так настроение устойчивее.',
        hard: '{name}, отмечать нейтральное — навык устойчивости.',
      },
    },
  },
  {
    id: 'psymoodinfo08_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, эмоции живут в теле: челюсть, плечи, дыхание. Расслабление мышц часто снижает тяжесть быстрее, чем “правильные мысли”.',
        moderate:
          '{name}, когда тело зажато, мозг считывает угрозу. Поэтому разминка и длинный выдох — простой способ вернуть спокойнее фон.',
        hard: '{name}, хочешь ровнее настроение — начни с тела. Это прямой путь.',
      },
      formal: {
        soft: '{name}, эмоции живут в теле: челюсть, плечи, дыхание. Расслабление мышц снижает тяжесть быстрее “правильных мыслей”.',
        moderate:
          '{name}, когда тело зажато, мозг считывает угрозу. Поэтому разминка и длинный выдох возвращают спокойнее фон.',
        hard: '{name}, хотите ровнее настроение — начните с тела. Это прямой путь.',
      },
    },
  },
  {
    id: 'psymoodinfo09_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, настроение падает, когда всё “надо”. План “1 главное + пауза” снижает давление и помогает жить устойчивее.',
        moderate:
          '{name}, когда список дел бесконечный, психика устает. Сокращение плана — это не проигрыш, а управление нагрузкой.',
        hard: '{name}, режь список. Чем меньше давления, тем ровнее состояние.',
      },
      formal: {
        soft: '{name}, настроение падает, когда всё “надо”. План “1 главное + пауза” снижает давление и помогает жить устойчивее.',
        moderate:
          '{name}, когда список дел бесконечный, психика устает. Сокращение плана — управление нагрузкой.',
        hard: '{name}, сокращайте список. Чем меньше давления, тем ровнее состояние.',
      },
    },
  },
  {
    id: 'psymoodinfo10_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, связь с людьми — фактор устойчивости. Даже короткий контакт снижает чувство одиночества и помогает настроению держаться.',
        moderate:
          '{name}, не обязательно “разговаривать о чувствах”. Иногда достаточно присутствия и простого “как ты?”.',
        hard: '{name}, изоляция усиливает тяжесть. Контакт — снижает.',
      },
      formal: {
        soft: '{name}, связь с людьми — фактор устойчивости. Даже короткий контакт снижает одиночество и помогает настроению держаться.',
        moderate:
          '{name}, не обязательно “разговаривать о чувствах”. Иногда достаточно присутствия и простого “как вы?”.',
        hard: '{name}, изоляция усиливает тяжесть. Контакт — снижает.',
      },
    },
  },
  {
    id: 'psymoodinfo11_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, прокрутка мыслей не равна решению. Запись мыслей на бумагу часто снижает тревожность и делает картину яснее.',
        moderate:
          '{name}, мозг устает держать всё в памяти. Когда ты записываешь, он “отпускает” и становится тише.',
        hard: '{name}, хочешь тишины — выгрузи мысли на бумагу. Это работает.',
      },
      formal: {
        soft: '{name}, прокрутка мыслей не равна решению. Запись мыслей снижает тревожность и делает картину яснее.',
        moderate:
          '{name}, мозг устает держать всё в памяти. Когда вы записываете, он “отпускает” и становится тише.',
        hard: '{name}, хотите тишины — выгрузите мысли на бумагу. Это работает.',
      },
    },
  },
  {
    id: 'psymoodinfo12_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, “нормально” — это хорошая цель. Не нужно чувствовать счастье каждый день, достаточно держать жизнь в движении маленькими шагами.',
        moderate:
          '{name}, устойчивость — это не отсутствие грусти, а способность возвращаться к базовым опорам: сон, еда, контакт, движение.',
        hard: '{name}, цель — устойчивость, не вечный кайф. Держи базу.',
      },
      formal: {
        soft: '{name}, “нормально” — хорошая цель. Не нужно быть счастливыми каждый день, достаточно двигаться маленькими шагами.',
        moderate:
          '{name}, устойчивость — это не отсутствие грусти, а способность возвращаться к базовым опорам: сон, еда, контакт, движение.',
        hard: '{name}, цель — устойчивость, не вечная радость. Держите базу.',
      },
    },
  },
  {
    id: 'psymoodinfo13_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, чувство вины часто давит сильнее, чем реальные ошибки. Снижение самонаказания обычно улучшает настроение быстрее, чем “соберись”.',
        moderate:
          '{name}, если ты делаешь максимум в своих условиях — это уже достаточно. Самобичевание не добавляет сил, только забирает.',
        hard: '{name}, вина не дает сил. Поддержка дает. Выбирай поддержку.',
      },
      formal: {
        soft: '{name}, чувство вины часто давит сильнее, чем реальные ошибки. Снижение самонаказания улучшает настроение быстрее, чем “соберитесь”.',
        moderate:
          '{name}, если вы делаете максимум в своих условиях — этого достаточно. Самобичевание не добавляет сил.',
        hard: '{name}, вина не дает сил. Поддержка дает. Выбирайте поддержку.',
      },
    },
  },
  {
    id: 'psymoodinfo14_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, настроение легче удерживать, когда есть регулярность: сон, еда, маленькие планы. Ритм — это “поручни” для психики.',
        moderate:
          '{name}, чем хаотичнее режим, тем сильнее качели. Мини-распорядок на день — простой способ стабилизировать фон.',
        hard: '{name}, хочешь меньше качелей — делай ритм. Ритм лечит.',
      },
      formal: {
        soft: '{name}, настроение легче удерживать, когда есть регулярность: сон, еда, планы. Ритм — это “поручни” для психики.',
        moderate:
          '{name}, чем хаотичнее режим, тем сильнее качели. Мини-распорядок — простой способ стабилизировать фон.',
        hard: '{name}, хотите меньше качелей — делайте ритм. Ритм стабилизирует.',
      },
    },
  },
  {
    id: 'psymoodinfo15_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если состояние держится долго и мешает жить, поддержка специалиста — нормальный шаг. Просить помощь — это забота, не слабость.',
        moderate:
          '{name}, иногда нужна внешняя опора: разговор, терапия, план восстановления. Это ускоряет выход из тяжелого периода.',
        hard: '{name}, если тяжело долго — обратись за помощью. Это разумно.',
      },
      formal: {
        soft: '{name}, если состояние держится долго и мешает жить, поддержка специалиста — нормальный шаг. Просить помощь — забота.',
        moderate:
          '{name}, иногда нужна внешняя опора: разговор, терапия, план восстановления. Это ускоряет выход из тяжелого периода.',
        hard: '{name}, если тяжело долго — обратитесь за помощью. Это разумно.',
      },
    },
  },

  // Motivational (15)
  {
    id: 'psymoodmotiv01_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, настроение меняется волнами. Сейчас может быть тяжело, но это не навсегда. Сделай один маленький шаг: вода, окно, 10 вдохов.',
        moderate:
          '{name}, не нужно “починить себя” за раз. Выбери 1 действие на 5 минут — и верни себе ощущение контроля. Этого уже достаточно.',
        hard: '{name}, хватит ждать идеального состояния. Сделай 1 шаг на 5 минут и продолжай. Настроение подтянется позже.',
      },
      formal: {
        soft: '{name}, настроение меняется волнами. Сейчас может быть тяжело, но это не навсегда. Сделайте один маленький шаг: вода, окно, 10 вдохов.',
        moderate:
          '{name}, не нужно “починить себя” за раз. Выберите 1 действие на 5 минут — и верните себе ощущение контроля. Этого достаточно.',
        hard: '{name}, хватит ждать идеального состояния. Сделайте 1 шаг на 5 минут и продолжайте. Настроение подтянется позже.',
      },
    },
  },
  {
    id: 'psymoodmotiv02_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно чувствовать радость всегда. Достаточно бережности к себе: меньше критики, больше простых действий и отдыха.',
        moderate:
          '{name}, если сил мало — снизь план на 20%. Это не проигрыш, а настройка нагрузки. Так ресурс начнет возвращаться без чувства вины.',
        hard: '{name}, перестань давить на себя. Снизь план и сделай базу: еда, вода, сон. Потом решай остальное.',
      },
      formal: {
        soft: '{name}, вы не обязаны чувствовать радость всегда. Достаточно быть бережными к себе: меньше критики, больше простых действий и отдыха.',
        moderate:
          '{name}, если сил мало — снизьте план на 20%. Это не проигрыш, а настройка нагрузки. Так ресурс вернется без чувства вины.',
        hard: '{name}, перестаньте давить на себя. Снизьте план и сделайте базу: еда, вода, сон. Потом решайте остальное.',
      },
    },
  },
  {
    id: 'psymoodmotiv03_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй сегодня “мягкую победу”: одно простое дело, которое можно завершить. Завершение поднимает настроение лучше, чем прокрутка мыслей.',
        moderate:
          '{name}, выбери задачу, которую реально закрыть за 10 минут. Маленькая завершенность дает мозгу сигнал: “я справляюсь”.',
        hard: '{name}, 10 минут — и закрой одну маленькую задачу. Потом решишь, что дальше. Сейчас важна опора.',
      },
      formal: {
        soft: '{name}, попробуйте сегодня “мягкую победу”: одно простое дело, которое можно завершить. Завершение поднимает настроение лучше прокрутки мыслей.',
        moderate:
          '{name}, выберите задачу, которую реально закрыть за 10 минут. Завершенность дает сигнал: “я справляюсь”.',
        hard: '{name}, 10 минут — и закройте одну маленькую задачу. Потом решите, что дальше. Сейчас важна опора.',
      },
    },
  },
  {
    id: 'psymoodmotiv04_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твоё состояние достойно заботы, а не обвинений. Скажи себе: “сейчас мне непросто, и я поддержу себя”. Это реально помогает.',
        moderate:
          '{name}, самокритика истощает. Поддержка восстанавливает. Замени “что со мной не так?” на “что мне сейчас нужно?”.',
        hard: '{name}, прекрати самобичевание. Спроси: что мне нужно прямо сейчас? И сделай хотя бы один пункт.',
      },
      formal: {
        soft: '{name}, ваше состояние достойно заботы, а не обвинений. Скажите: “сейчас мне непросто, и я поддержу себя”. Это помогает.',
        moderate:
          '{name}, самокритика истощает. Поддержка восстанавливает. Замените “что со мной не так?” на “что мне сейчас нужно?”.',
        hard: '{name}, прекратите самобичевание. Спросите: что нужно прямо сейчас? И сделайте хотя бы один пункт.',
      },
    },
  },
  {
    id: 'psymoodmotiv05_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если внутри пусто — это не значит, что внутри пустота. Это усталость. Дай себе 10 минут тишины и один стакан воды.',
        moderate:
          '{name}, когда “ничего не хочется”, начни с тела: вода, еда, душ, прогулка 5 минут. Настроение часто подтягивается вслед за телом.',
        hard: '{name}, не жди мотивации. Сделай базу для тела: вода, еда, движение. Потом появятся силы.',
      },
      formal: {
        soft: '{name}, если внутри пусто — это не значит, что вы пусты. Это усталость. Дайте 10 минут тишины и стакан воды.',
        moderate:
          '{name}, когда “ничего не хочется”, начните с тела: вода, еда, душ, прогулка 5 минут. Настроение подтягивается вслед за телом.',
        hard: '{name}, не ждите мотивации. Сделайте базу: вода, еда, движение. Потом появятся силы.',
      },
    },
  },
  {
    id: 'psymoodmotiv06_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно не держать образ силы, а просто быть человеком. Выбери один бережный шаг и считай это успехом — без требований к себе.',
        moderate:
          '{name}, сила — не в том, чтобы “терпеть”. Сила — вовремя поддержать себя. Сделай паузу и вернись с ресурсом.',
        hard: '{name}, хватит терпеть. Поддержи себя: пауза, дыхание, вода. Потом решай задачи.',
      },
      formal: {
        soft: '{name}, сегодня можно быть не сильными, а живыми. Выберите один бережный шаг и считайте это успехом — без требований к себе.',
        moderate:
          '{name}, сила — не в том, чтобы “терпеть”. Сила — вовремя поддержать себя. Сделайте паузу и вернитесь с ресурсом.',
        hard: '{name}, хватит терпеть. Поддержите себя: пауза, дыхание, вода. Потом решайте задачи.',
      },
    },
  },
  {
    id: 'psymoodmotiv07_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай 3 добрых факта о себе: “я стараюсь”, “я не сдаюсь”, “я учусь”. Это не лозунги — это опора, когда штормит.',
        moderate:
          '{name}, вспомни 1 вещь, с которой уже получалось справляться. Опыт — доказательство, что ты умеешь проходить сложные периоды.',
        hard: '{name}, у тебя есть опыт. Вспомни одну победу и сделай следующий шаг. Сейчас.',
      },
      formal: {
        soft: '{name}, назовите 3 добрых факта о себе: “я стараюсь”, “я не сдаюсь”, “я учусь”. Это опора, когда штормит.',
        moderate:
          '{name}, вспомните 1 вещь, с которой вы уже справились. Опыт — доказательство, что вы проходите сложные периоды.',
        hard: '{name}, у вас есть опыт. Вспомните одну победу и сделайте следующий шаг. Сейчас.',
      },
    },
  },
  {
    id: 'psymoodmotiv08_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право на медленный день. Береги ресурс: меньше задач, больше воздуха и простых действий. Не нужно тащить всё.',
        moderate:
          '{name}, если день тяжёлый — это не повод себя ломать. Пересобери план и выбери 1 главное. Остальное пусть подождёт.',
        hard: '{name}, убери лишнее. Оставь одно главное и сделай его. Остальное — позже.',
      },
      formal: {
        soft: '{name}, вы имеете право на медленный день. Берегите ресурс: меньше задач, больше воздуха и простых действий. Вы не обязаны тянуть всё.',
        moderate:
          '{name}, если день тяжёлый — это не повод себя ломать. Пересоберите план и выберите 1 главное. Остальное подождёт.',
        hard: '{name}, уберите лишнее. Оставьте одно главное и сделайте его. Остальное — позже.',
      },
    },
  },
  {
    id: 'psymoodmotiv09_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй “настроение через действие”: 5 минут движения или уборки. Не для идеала, а чтобы мозг получил сигнал: жизнь продолжается.',
        moderate:
          '{name}, сделай 5 минут активности: пройтись, размяться, привести в порядок одну зону. Действие часто поднимает тонус быстрее слов.',
        hard: '{name}, 5 минут движения. Сейчас. Потом оценишь состояние.',
      },
      formal: {
        soft: '{name}, попробуйте “настроение через действие”: 5 минут движения или уборки. Чтобы мозг получил сигнал: жизнь продолжается.',
        moderate:
          '{name}, сделайте 5 минут активности: пройтись, размяться, привести в порядок одну зону. Действие поднимает тонус быстрее слов.',
        hard: '{name}, 5 минут движения. Сейчас. Потом оцените состояние.',
      },
    },
  },
  {
    id: 'psymoodmotiv10_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если грустно — это не ошибка. Это сигнал: тебе нужна поддержка. Напиши одному человеку или сделай что-то тёплое для себя.',
        moderate:
          '{name}, не обязательно справляться в одиночку. Одно сообщение “мне непросто” — это уже помощь и снижение внутреннего давления.',
        hard: '{name}, не тащи в одиночку. Напиши кому-то прямо сейчас.',
      },
      formal: {
        soft: '{name}, если грустно — это не ошибка. Это сигнал: нужна поддержка. Напишите одному человеку или сделайте что-то тёплое для себя.',
        moderate:
          '{name}, не обязательно справляться в одиночку. Одно сообщение “мне непросто” — это уже помощь и снижение давления.',
        hard: '{name}, не тяните в одиночку. Напишите кому-то прямо сейчас.',
      },
    },
  },
  {
    id: 'psymoodmotiv11_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, даже если сегодня “серо”, можно добавить одну маленькую искру: музыка, свет, прогулка 10 минут. Небольшие вещи меняют тон.',
        moderate:
          '{name}, добавь света: открой окно, включи яркую лампу, выйди на улицу на 5 минут. Тело ловит сигнал “день продолжается”.',
        hard: '{name}, свет и воздух. Сейчас. 5 минут — и уже легче.',
      },
      formal: {
        soft: '{name}, даже если сегодня “серо”, можно добавить одну маленькую искру: музыка, свет, прогулка 10 минут. Это меняет тон.',
        moderate:
          '{name}, добавьте света: откройте окно, включите яркую лампу, выйдите на улицу на 5 минут. Тело ловит сигнал “день продолжается”.',
        hard: '{name}, свет и воздух. Сейчас. 5 минут — и станет легче.',
      },
    },
  },
  {
    id: 'psymoodmotiv12_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно “чувствовать правильно”. Чувства приходят и уходят. Важно, что ты выбираешь бережные действия для себя.',
        moderate:
          '{name}, сегодня сделай ставку на стабильность: одно простое дело, один приём пищи, одна прогулка. Так настроение становится ровнее.',
        hard: '{name}, стабилизируй день: еда, вода, движение, сон. Без этого настроение не выровнять.',
      },
      formal: {
        soft: '{name}, вы не обязаны “чувствовать правильно”. Чувства приходят и уходят. Важно, что вы выбираете бережные действия для себя.',
        moderate:
          '{name}, сегодня сделайте ставку на стабильность: одно простое дело, один приём пищи, одна прогулка. Так настроение ровнее.',
        hard: '{name}, стабилизируйте день: еда, вода, движение, сон. Без этого настроение не выровнять.',
      },
    },
  },
  {
    id: 'psymoodmotiv13_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, разреши себе “не успеть всё”. Твоя ценность не измеряется списком дел. Важно сохранить себя, а не закрыть все пункты.',
        moderate:
          '{name}, выбери 1 главное и сделай его. Всё остальное — бонус. Так меньше давления и больше шансов реально почувствовать облегчение.',
        hard: '{name}, одно главное — сделай. Остальное вычеркивай или переносишь. Точка.',
      },
      formal: {
        soft: '{name}, разрешите себе “не успеть всё”. Ваша ценность не измеряется списком дел. Важно сохранить себя, а не закрыть все пункты.',
        moderate:
          '{name}, выберите 1 главное и сделайте его. Всё остальное — бонус. Так меньше давления и больше облегчения.',
        hard: '{name}, одно главное — сделайте. Остальное переносите. Точка.',
      },
    },
  },
  {
    id: 'psymoodmotiv14_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты учишься жить устойчиво. Каждый раз, когда ты выбираешь сон, еду и паузу, ты строишь фундамент для более ровного настроения.',
        moderate:
          '{name}, устойчивость — навык. Делай маленькие опоры ежедневно, и настроение станет менее “качелями”. Ты движешься правильно.',
        hard: '{name}, делай опоры каждый день. Без них качели не остановятся.',
      },
      formal: {
        soft: '{name}, вы учитесь жить устойчиво. Каждый раз, когда выбираете сон, еду и паузу, вы строите фундамент для ровного настроения.',
        moderate:
          '{name}, устойчивость — навык. Делайте маленькие опоры ежедневно, и настроение станет ровнее. Вы движетесь правильно.',
        hard: '{name}, делайте опоры каждый день. Без них “качели” не остановятся.',
      },
    },
  },
  {
    id: 'psymoodmotiv15_new',
    kind: 'therapy',
    entityKey: 'mood',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня достаточно стать лучше на 10%. Не “счастливым”, а чуть легче. Один шаг — и ты уже помогаешь себе.',
        moderate:
          '{name}, измеряй день не идеалом, а маленьким улучшением. Что даст +10% к состоянию прямо сейчас? Сделай это.',
        hard: '{name}, +10% к состоянию. Выбери одно действие и сделай. Сейчас.',
      },
      formal: {
        soft: '{name}, сегодня достаточно стать лучше на 10%. Не “счастливыми”, а чуть легче. Один шаг — и вы уже помогаете себе.',
        moderate:
          '{name}, измеряйте день не идеалом, а маленьким улучшением. Что даст +10% к состоянию сейчас? Сделайте это.',
        hard: '{name}, +10% к состоянию. Выберите одно действие и сделайте. Сейчас.',
      },
    },
  },

  // =========================
  // LONELINESS (Одиночество и социальные связи) - 45 templates
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psylonelinessreminder01',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если сейчас одиноко - начни с малого: отправь одному человеку короткое «привет» без объяснений.',
        moderate:
          '{name}, выбери одного человека и напиши ему сегодня: «Привет! Как ты?» Одно сообщение - и точка.',
        hard: '{name}, перестань прятаться. Открой чат и отправь «привет» прямо сейчас. 20 секунд - поехали.',
      },
      formal: {
        soft: '{name}, если сейчас одиноко - начните с малого: отправьте одному человеку короткое «привет» без объяснений.',
        moderate:
          '{name}, выберите одного человека и напишите ему сегодня: «Привет! Как вы?» Одно сообщение - и точка.',
        hard: '{name}, перестаньте прятаться. Откройте чат и отправьте «привет» прямо сейчас. 20 секунд - поехали.',
      },
    },
  },
  {
    id: 'psylonelinessreminder02',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно начать очень мягко: ответь на сторис реакцией или стикером.',
        moderate:
          '{name}, выбери один диалог и отправь реакцию на сторис/пост или стикер. Никаких объяснений не нужно.',
        hard: '{name}, хватит откладывать. Выбери диалог и отправь реакцию или стикер сейчас. Без раздумий.',
      },
      formal: {
        soft: '{name}, можно начать очень мягко: ответьте на сторис реакцией или стикером.',
        moderate:
          '{name}, выберите один диалог и отправьте реакцию на сторис/пост или стикер. Никаких объяснений не нужно.',
        hard: '{name}, хватит откладывать. Выберите диалог и отправьте реакцию или стикер сейчас. Без раздумий.',
      },
    },
  },
  {
    id: 'psylonelinessreminder03',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если тянет закрыться - попробуй наоборот: выйди на 10 минут и просто пройдись.',
        moderate:
          '{name}, сейчас задача простая: выйти на улицу на 10-15 минут. Быть среди людей - уже поддержка.',
        hard: '{name}, вставай. Открой дверь и выйди на 10 минут. Не обсуждаем - делаем.',
      },
      formal: {
        soft: '{name}, если тянет закрыться - попробуйте наоборот: выйдите на 10 минут и просто пройдитесь.',
        moderate:
          '{name}, сейчас задача простая: выйти на улицу на 10-15 минут. Быть среди людей - уже поддержка.',
        hard: '{name}, вставайте. Откройте дверь и выйдите на 10 минут. Не обсуждаем - делаем.',
      },
    },
  },
  {
    id: 'psylonelinessreminder04',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, зайди в ближайшую кофейню/магазин и просто побудь среди людей пару минут.',
        moderate:
          '{name}, выбери место рядом (кофейня/магазин) и загляни туда на 5 минут. Цель - быть в живом пространстве.',
        hard: '{name}, хватит сидеть дома. Одевайся и выйди в ближайшую кофейню/магазин. 5 минут - и назад.',
      },
      formal: {
        soft: '{name}, зайдите в ближайшую кофейню/магазин и просто побудьте среди людей пару минут.',
        moderate:
          '{name}, выберите место рядом (кофейня/магазин) и загляните туда на 5 минут. Цель - быть в живом пространстве.',
        hard: '{name}, хватит сидеть дома. Одевайтесь и выйдите в ближайшую кофейню/магазин. 5 минут - и назад.',
      },
    },
  },
  {
    id: 'psylonelinessreminder05',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери одного человека, с кем "нормально" общаться, и напиши нейтрально: «Как дела?»',
        moderate:
          '{name}, не ищи идеальных слов. Напиши простое: «Привет! Как дела?» - и остановись.',
        hard: '{name}, перестань ждать "идеального момента". Напиши «Как дела?» одному человеку сейчас.',
      },
      formal: {
        soft: '{name}, выберите одного человека, с кем "нормально" общаться, и напишите нейтрально: «Как дела?»',
        moderate:
          '{name}, не ищите идеальных слов. Напишите простое: «Привет! Как дела?» - и остановитесь.',
        hard: '{name}, перестаньте ждать "идеального момента". Напишите «Как дела?» одному человеку сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessreminder06',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно не начинать разговор. Скинь мем/картинку - это тоже связь.',
        moderate:
          '{name}, выбери одного человека и скинь мем/картинку. Без "как дела", без ожиданий - просто контакт.',
        hard: '{name}, хватит думать. Найди мем и отправь одному человеку сейчас. Действуй.',
      },
      formal: {
        soft: '{name}, можно не начинать разговор. Отправьте мем/картинку - это тоже связь.',
        moderate:
          '{name}, выберите одного человека и отправьте мем/картинку. Без "как дела", без ожиданий - просто контакт.',
        hard: '{name}, хватит думать. Найдите мем и отправьте одному человеку сейчас. Действуйте.',
      },
    },
  },
  {
    id: 'psylonelinessreminder07',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй "маленькую смелость": комментарий под постом или короткая реакция - и все.',
        moderate:
          '{name}, сделай один социальный микрошаг: комментарий из 1 фразы или реакция. На этом достаточно.',
        hard: '{name}, перестань исчезать. Напиши одну фразу в комментариях или отправь реакцию. Прямо сейчас.',
      },
      formal: {
        soft: '{name}, попробуйте "маленькую смелость": комментарий под постом или короткая реакция - и все.',
        moderate:
          '{name}, сделайте один социальный микрошаг: комментарий из 1 фразы или реакция. На этом достаточно.',
        hard: '{name}, перестаньте исчезать. Напишите одну фразу в комментариях или отправьте реакцию. Прямо сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessreminder08',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня задача на 1 минуту: выйти из дома и сделать 20 шагов. Просто "переключить среду".',
        moderate:
          '{name}, выйди и пройдись 10 минут. Не ради спорта - ради контакта с жизнью вокруг.',
        hard: '{name}, вставай и выходи. 10 минут прогулки - сейчас. Потом решишь, что дальше.',
      },
      formal: {
        soft: '{name}, сегодня задача на 1 минуту: выйдите из дома и сделайте 20 шагов. Просто "переключить среду".',
        moderate:
          '{name}, выйдите и пройдитесь 10 минут. Не ради спорта - ради контакта с жизнью вокруг.',
        hard: '{name}, вставайте и выходите. 10 минут прогулки - сейчас. Потом решите, что дальше.',
      },
    },
  },
  {
    id: 'psylonelinessreminder09',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если сложно начать разговор - выбери самый нейтральный вход: «Как день?»',
        moderate:
          '{name}, напиши коротко: «Как день?» или «Как неделя?» в один чат. Без разгона и без объяснений.',
        hard: '{name}, хватит молчать. Выбирай чат и отправляй: «Как день?» Сейчас.',
      },
      formal: {
        soft: '{name}, если сложно начать разговор - выберите самый нейтральный вход: «Как день?»',
        moderate:
          '{name}, напишите коротко: «Как день?» или «Как неделя?» в один чат. Без разгона и без объяснений.',
        hard: '{name}, хватит молчать. Выбирайте чат и отправляйте: «Как день?» Сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessreminder10',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если кажется "я никому не нужен" - давай проверим делом: один маленький контакт сегодня.',
        moderate:
          '{name}, одна проверка реальностью: выбери человека и напиши коротко. Не рассуждаем - делаем.',
        hard: '{name}, хватит верить мысли "я никому не нужен". Докажи обратное действием: напиши сейчас.',
      },
      formal: {
        soft: '{name}, если кажется "я никому не нужен" - давайте проверим делом: один маленький контакт сегодня.',
        moderate:
          '{name}, одна проверка реальностью: выберите человека и напишите коротко. Не рассуждаем - делаем.',
        hard: '{name}, хватит верить мысли "я никому не нужен". Докажите обратное действием: напишите сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessreminder11',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, хочешь связи - сделай шаг: предложи встречу на этой неделе (кофе/прогулка).',
        moderate:
          '{name}, выбери человека и напиши: «Есть время на кофе на этой неделе?» Одно предложение - достаточно.',
        hard: '{name}, перестань ждать. Напиши сейчас: «Кофе на этой неделе?» Отправляй.',
      },
      formal: {
        soft: '{name}, если хочется связи - сделайте шаг: предложите встречу на этой неделе (кофе/прогулка).',
        moderate:
          '{name}, выберите человека и напишите: «Есть время на кофе на этой неделе?» Одного предложения достаточно.',
        hard: '{name}, перестаньте ждать. Напишите сейчас: «Кофе на этой неделе?» Отправляйте.',
      },
    },
  },
  {
    id: 'psylonelinessreminder12',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выход "в люди" тоже считается: зайди в место с людьми и просто побудь там 3-5 минут.',
        moderate:
          '{name}, выбери простую точку (магазин/кафе) и зайди. Цель - контакт с реальностью, не разговор.',
        hard: '{name}, хватит изоляции. Выйди в ближайшее место с людьми на 5 минут. Сейчас.',
      },
      formal: {
        soft: '{name}, выход "в люди" тоже считается: зайдите в место с людьми и просто побудьте там 3-5 минут.',
        moderate:
          '{name}, выберите простую точку (магазин/кафе) и зайдите. Цель - контакт с реальностью, не разговор.',
        hard: '{name}, хватит изоляции. Выйдите в ближайшее место с людьми на 5 минут. Сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessreminder13',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если окажешься на улице - можно перекинуться парой фраз по ситуации, без продолжения.',
        moderate:
          '{name}, маленький шаг офлайн: один короткий обмен фразами по делу (очередь, товар, дорога) - и ты уже в контакте.',
        hard: '{name}, хватит жить в вакууме. Выйди и сделай один короткий обмен фразами по ситуации. Все.',
      },
      formal: {
        soft: '{name}, если окажетесь на улице - можно перекинуться парой фраз по ситуации, без продолжения.',
        moderate:
          '{name}, небольшой шаг офлайн: один короткий обмен фразами по делу (очередь, товар, дорога) - и вы уже в контакте.',
        hard: '{name}, хватит жить в вакууме. Выйдите и сделайте один короткий обмен фразами по ситуации. Все.',
      },
    },
  },
  {
    id: 'psylonelinessreminder14',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй сделать контакт проще: одна короткая фраза по ситуации в любом публичном месте.',
        moderate:
          '{name}, если ты в магазине/кафе/очереди - можно сказать 1-2 фразы по делу. Это нормальный контакт, без неловких разговоров.',
        hard: '{name}, не прячься. Выйди и произнеси 1-2 фразы по ситуации. Это твой шаг на сегодня.',
      },
      formal: {
        soft: '{name}, попробуйте сделать контакт проще: одна короткая фраза по ситуации в любом публичном месте.',
        moderate:
          '{name}, если вы в магазине/кафе/очереди - можно сказать 1-2 фразы по делу. Это нормальный контакт, без неловких разговоров.',
        hard: '{name}, не прячьтесь. Выйдите и произнесите 1-2 фразы по ситуации. Это ваш шаг на сегодня.',
      },
    },
  },
  {
    id: 'psylonelinessreminder15',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мысль "никому нет дела" - это мысль, не факт. Давай проверим маленьким контактом.',
        moderate:
          '{name}, проверка фактов: один контакт сегодня. Сообщение/реакция/мем - любой вариант.',
        hard: '{name}, хватит жить в догадках. Проверь реальность: сделай контакт сейчас (сообщение/реакция/мем).',
      },
      formal: {
        soft: '{name}, мысль "никому нет дела" - это мысль, не факт. Давайте проверим маленьким контактом.',
        moderate:
          '{name}, проверка фактов: один контакт сегодня. Сообщение/реакция/мем - любой вариант.',
        hard: '{name}, хватит жить в догадках. Проверьте реальность: сделайте контакт сейчас (сообщение/реакция/мем).',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psylonelinessinfo01',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, одиночество - это не "поломка". Это сигнал: тебе важна связь.',
        moderate:
          '{name}, одиночество часто усиливается, когда мы исчезаем. Лучшее лекарство - маленький контакт, а не идеальный разговор.',
        hard: '{name}, запомни: изоляция кормит одиночество. Разрывай цикл действием - хотя бы одним контактом.',
      },
      formal: {
        soft: '{name}, одиночество - это не "поломка". Это сигнал: вам важна связь.',
        moderate:
          '{name}, одиночество часто усиливается, когда мы исчезаем. Лучшее "лекарство" - маленький контакт, а не идеальный разговор.',
        hard: '{name}, запомните: изоляция кормит одиночество. Разрывайте цикл действием - хотя бы одним контактом.',
      },
    },
  },
  {
    id: 'psylonelinessinfo02',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если кажется "я лишний" - это чувство, а не приговор. Чувства меняются.',
        moderate:
          '{name}, мысль "я никому не интересен" обычно звучит убедительно, но не является фактом. Ее можно проверять действиями.',
        hard: '{name}, хватит верить каждой мысли. "Я никому не нужен" - гипотеза. Проверь ее контактом.',
      },
      formal: {
        soft: '{name}, если кажется "я лишний" - это чувство, а не приговор. Чувства меняются.',
        moderate:
          '{name}, мысль "я никому не интересен" обычно звучит убедительно, но не является фактом. Ее можно проверять действиями.',
        hard: '{name}, хватит верить каждой мысли. "Я никому не нужен" - гипотеза. Проверьте ее контактом.',
      },
    },
  },
  {
    id: 'psylonelinessinfo03',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, "быть среди людей" - тоже социальный контакт, даже без разговоров.',
        moderate:
          '{name}, иногда первое, что помогает, - смена среды: выйти туда, где есть жизнь и люди, хотя бы на 10 минут.',
        hard: '{name}, не жди настроения. Сначала действие: выйти в пространство с людьми. Потом станет легче.',
      },
      formal: {
        soft: '{name}, "быть среди людей" - тоже социальный контакт, даже без разговоров.',
        moderate:
          '{name}, иногда первое, что помогает, - смена среды: выйти туда, где есть жизнь и люди, хотя бы на 10 минут.',
        hard: '{name}, не ждите настроения. Сначала действие: выйти в пространство с людьми. Потом станет легче.',
      },
    },
  },
  {
    id: 'psylonelinessinfo04',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, одиночество не означает "со мной что-то не так". Оно означает "мне нужен контакт".',
        moderate:
          '{name}, когда хочется закрыться - это естественно. Но одиночество снижается не от закрывания, а от маленьких шагов к связи.',
        hard: '{name}, закрываться - привычно, но это тупик. Нужен шаг наружу: контакт, люди, движение.',
      },
      formal: {
        soft: '{name}, одиночество не означает "со мной что-то не так". Оно означает "мне нужен контакт".',
        moderate:
          '{name}, когда хочется закрыться - это естественно. Но одиночество снижается не от закрывания, а от маленьких шагов к связи.',
        hard: '{name}, закрываться - привычно, но это тупик. Нужен шаг наружу: контакт, люди, движение.',
      },
    },
  },
  {
    id: 'psylonelinessinfo05',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, контакт не обязан быть "глубоким". Достаточно короткого "привет".',
        moderate:
          '{name}, для связи не нужно много слов. Часто хватает малого: реакция, мем, одно предложение.',
        hard: '{name}, хватит усложнять. Связь начинается с одного простого действия. Выбирай и делай.',
      },
      formal: {
        soft: '{name}, контакт не обязан быть "глубоким". Достаточно короткого «привет».',
        moderate:
          '{name}, для связи не нужно много слов. Часто хватает малого: реакция, мем, одно предложение.',
        hard: '{name}, хватит усложнять. Связь начинается с одного простого действия. Выбирайте и делайте.',
      },
    },
  },
  {
    id: 'psylonelinessinfo06',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, одиночество усиливается в тишине. Даже маленький контакт уже снижает напряжение.',
        moderate:
          '{name}, чем дольше тишина, тем страшнее "выйти на связь". Поэтому работают микрошаги - 1 сообщение, 1 реакция.',
        hard: '{name}, тишина делает хуже. Разрывай ее микродействием - прямо сегодня.',
      },
      formal: {
        soft: '{name}, одиночество усиливается в тишине. Даже маленький контакт уже снижает напряжение.',
        moderate:
          '{name}, чем дольше тишина, тем страшнее "выйти на связь". Поэтому работают микрошаги - 1 сообщение, 1 реакция.',
        hard: '{name}, тишина делает хуже. Разрывайте ее микродействием - прямо сегодня.',
      },
    },
  },
  {
    id: 'psylonelinessinfo07',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно "быть интересным" в каждом контакте. Достаточно быть настоящим человеком.',
        moderate:
          '{name}, чувство "я навязываюсь" часто обманывает. Реальность обычно мягче, чем тревога.',
        hard: '{name}, прекрати угадывать за других. Не решай за человека заранее - просто сделай контакт.',
      },
      formal: {
        soft: '{name}, вам не нужно "быть интересным" в каждом контакте. Достаточно быть настоящим человеком.',
        moderate:
          '{name}, чувство "я навязываюсь" часто обманывает. Реальность обычно мягче, чем тревога.',
        hard: '{name}, прекратите угадывать за других. Не решайте за человека заранее - просто сделайте контакт.',
      },
    },
  },
  {
    id: 'psylonelinessinfo08',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если накрывает - вернись в тело: стопы, дыхание. А потом - один маленький шаг к людям.',
        moderate:
          '{name}, сначала стабилизация (дыхание/заземление), потом действие. Не наоборот.',
        hard: '{name}, не нужно "чинить всё" сразу. Стабилизируйся и сделай один шаг к связи. Всё.',
      },
      formal: {
        soft: '{name}, если накрывает - вернитесь в тело: стопы, дыхание. А потом - один маленький шаг к людям.',
        moderate:
          '{name}, сначала стабилизация (дыхание/заземление), потом действие. Не наоборот.',
        hard: '{name}, вы не обязаны "починить все". Стабилизируйтесь и сделайте один шаг к связи. Все.',
      },
    },
  },
  {
    id: 'psylonelinessinfo09',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, одиночество - не про количество людей вокруг. Это про ощущение связи. Его можно создавать маленькими шагами.',
        moderate:
          '{name}, связь строится на регулярности: короткие "касания" важнее редких длинных разговоров.',
        hard: '{name}, перестань ждать "идеальной связи". Делай маленькие касания регулярно - это и есть путь.',
      },
      formal: {
        soft: '{name}, одиночество - не про количество людей вокруг. Это про ощущение связи. Его можно создавать маленькими шагами.',
        moderate:
          '{name}, связь строится на регулярности: короткие "касания" важнее редких длинных разговоров.',
        hard: '{name}, перестаньте ждать "идеальной связи". Делайте маленькие касания регулярно - это и есть путь.',
      },
    },
  },
  {
    id: 'psylonelinessinfo10',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если хочется закрыться - это понятная реакция. Но это не единственный вариант.',
        moderate:
          '{name}, можно выбрать не "закрыться или общаться часами", а третий вариант: короткий контакт на 10 секунд.',
        hard: '{name}, хватит крайностей. Не нужно "общаться идеально". Нужен один короткий контакт - все.',
      },
      formal: {
        soft: '{name}, если хочется закрыться - это понятная реакция. Но это не единственный вариант.',
        moderate:
          '{name}, можно выбрать не "закрыться или общаться часами", а третий вариант: короткий контакт на 10 секунд.',
        hard: '{name}, хватит крайностей. Не нужно "общаться идеально". Нужен один короткий контакт - все.',
      },
    },
  },
  {
    id: 'psylonelinessinfo11',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, иногда контакт - это просто "я помню о тебе". И этого достаточно.',
        moderate:
          '{name}, простой сигнал внимания (реакция/мем/одно слово) - это уже связь, без обязательств.',
        hard: '{name}, не драматизируй. Один маленький сигнал - и ты уже не в изоляции.',
      },
      formal: {
        soft: '{name}, иногда контакт - это просто "я помню о вас". И этого достаточно.',
        moderate:
          '{name}, простой сигнал внимания (реакция/мем/одно слово) - это уже связь, без обязательств.',
        hard: '{name}, не драматизируйте. Один маленький сигнал - и вы уже не в изоляции.',
      },
    },
  },
  {
    id: 'psylonelinessinfo12',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если в голове "все бессмысленно" - начни с простого: выйти в живое пространство.',
        moderate:
          '{name}, мозг в одиночестве рисует мрачнее. Смена среды и маленький контакт реально меняют ощущение.',
        hard: '{name}, хватит оставаться один на один с мыслью. Действие - и картинка меняется. Проверь.',
      },
      formal: {
        soft: '{name}, если в голове "все бессмысленно" - начните с простого: выйти в живое пространство.',
        moderate:
          '{name}, мозг в одиночестве рисует мрачнее. Смена среды и маленький контакт реально меняют ощущение.',
        hard: '{name}, хватит оставаться один на один с мыслью. Действие - и картина меняется. Проверьте.',
      },
    },
  },
  {
    id: 'psylonelinessinfo13',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, когда одиноко, тело часто напряжено. Пара глубоких выдохов - и становится чуть легче сделать шаг.',
        moderate:
          '{name}, сначала выдох, потом действие. Пауза помогает не проваливаться в "все плохо".',
        hard: '{name}, выдохни. А теперь перестань крутить мысли - делай один шаг к контакту.',
      },
      formal: {
        soft: '{name}, когда одиноко, тело часто напряжено. Пара глубоких выдохов - и становится чуть легче сделать шаг.',
        moderate:
          '{name}, сначала выдох, потом действие. Пауза помогает не проваливаться в "все плохо".',
        hard: '{name}, выдохните. А теперь перестаньте крутить мысли - сделайте один шаг к контакту.',
      },
    },
  },
  {
    id: 'psylonelinessinfo14',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, хороший контакт — не тот, где всё идеально, а тот, где ты появился и остался в связи.',
        moderate:
          '{name}, цель - не "понравиться", а "выйти на связь". Это разные задачи.',
        hard: '{name}, хватит пытаться выглядеть идеально. Просто появись - и этого достаточно.',
      },
      formal: {
        soft: '{name}, хороший контакт - не тот, где все идеально, а тот, где вы появились.',
        moderate:
          '{name}, цель - не "понравиться", а "выйти на связь". Это разные задачи.',
        hard: '{name}, хватит пытаться выглядеть идеально. Просто появитесь - и этого достаточно.',
      },
    },
  },
  {
    id: 'psylonelinessinfo15',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, маленькая цель на сегодня: один социальный шаг. Один - уже победа.',
        moderate:
          '{name}, выбери один из трех вариантов: 1) «привет», 2) реакция/стикер, 3) выйти "в люди" на 10 минут.',
        hard: '{name}, выбирай: «привет» / реакция / выйти на 10 минут. Не думай - делай один из них сейчас.',
      },
      formal: {
        soft: '{name}, маленькая цель на сегодня: один социальный шаг. Один - уже победа.',
        moderate:
          '{name}, выберите один из трех вариантов: 1) «привет», 2) реакция/стикер, 3) выйти "в люди" на 10 минут.',
        hard: '{name}, выбирайте: «привет» / реакция / выйти на 10 минут. Не думайте - сделайте один из них сейчас.',
      },
    },
  },

  // --- MOTIVATIONAL (15) ---
  {
    id: 'psylonelinessmotiv01',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, один маленький шаг к людям - и день уже меняется. Ты справишься.',
        moderate:
          '{name}, сегодня не нужно "становиться общительным". Нужно просто сделать один контакт. Это по силам.',
        hard: '{name}, хватит ждать. Один контакт - сейчас. Делай шаг и возвращай себе жизнь.',
      },
      formal: {
        soft: '{name}, один маленький шаг к людям - и день уже меняется. У вас получится.',
        moderate:
          '{name}, сегодня не нужно "становиться общительным". Нужно просто сделать один контакт. Это по силам.',
        hard: '{name}, хватит ждать. Один контакт - сейчас. Сделайте шаг и возвращайте себе жизнь.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv02',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно оставаться с этим в одиночку. Достаточно маленького "привет".',
        moderate:
          '{name}, связь начинается с простого. Одно сообщение - это уже движение вперед.',
        hard: '{name}, перестань тащить все в одиночку. Напиши сейчас. Не оправдывайся - действуй.',
      },
      formal: {
        soft: '{name}, вам не нужно оставаться с этим в одиночку. Достаточно маленького "привет".',
        moderate:
          '{name}, связь начинается с простого. Одно сообщение - это уже движение вперед.',
        hard: '{name}, перестаньте тащить все в одиночку. Напишите сейчас. Не оправдывайтесь - действуйте.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv03',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, даже если сейчас нет сил - маленький шаг к людям все равно возможен.',
        moderate:
          '{name}, не нужно настроение. Нужен микрошаг. А настроение подтянется следом.',
        hard: '{name}, хватит ждать "когда захочется". Сделай микрошаг сейчас - и точка.',
      },
      formal: {
        soft: '{name}, даже если сейчас нет сил - маленький шаг к людям все равно возможен.',
        moderate:
          '{name}, не нужно настроение. Нужен микрошаг. А настроение подтянется следом.',
        hard: '{name}, хватит ждать "когда захочется". Сделайте микрошаг сейчас - и точка.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv04',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выйти на улицу на 10 минут - это уже забота о себе и шаг к связи.',
        moderate:
          '{name}, сделай простой выход "в люди". Не разговор, не подвиг - просто присутствие.',
        hard: '{name}, подними себя и выйди. 10 минут среди людей - это твоя задача на сейчас.',
      },
      formal: {
        soft: '{name}, выйти на улицу на 10 минут - это уже забота о себе и шаг к связи.',
        moderate:
          '{name}, сделайте простой выход "в люди". Не разговор, не подвиг - просто присутствие.',
        hard: '{name}, поднимите себя и выйдите. 10 минут среди людей - это ваша задача на сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv05',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, одна реакция или стикер — и шаг из изоляции уже сделан. Это работает.',
        moderate:
          '{name}, выбери легкий формат: реакция/стикер/мем. Ты делаешь связь проще - и это сила.',
        hard: '{name}, хватит усложнять. Отправь реакцию/стикер сейчас. Действуй.',
      },
      formal: {
        soft: '{name}, одна реакция или стикер - и вы уже сделали шаг из изоляции. Это работает.',
        moderate:
          '{name}, выберите легкий формат: реакция/стикер/мем. Вы делаете связь проще - и это сила.',
        hard: '{name}, хватит усложнять. Отправьте реакцию/стикер сейчас. Действуйте.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv06',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, это не "слишком поздно". Связь не живёт по расписанию.',
        moderate:
          '{name}, если давно не общались - это не повод молчать дальше. Один короткий контакт все меняет.',
        hard: '{name}, хватит оправданий "давно не писал". Напиши сейчас - и все.',
      },
      formal: {
        soft: '{name}, вы не "слишком поздно написали". Связь не живет по расписанию.',
        moderate:
          '{name}, если давно не общались - это не повод молчать дальше. Один короткий контакт все меняет.',
        hard: '{name}, хватит оправданий "давно не писал". Напишите сейчас — и всё.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv07',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, связь можно создать самостоятельно. Начни с одного шага — и этого достаточно.',
        moderate:
          '{name}, выбери один шаг к людям и сделай его сегодня. Регулярность важнее идеала.',
        hard: '{name}, перестань ждать, что "кто-то спасёт". Создай контакт сам. Сейчас.',
      },
      formal: {
        soft: '{name}, вы можете создать связь сами. Начните с одного шага - и этого достаточно.',
        moderate:
          '{name}, выберите один шаг к людям и сделайте его сегодня. Регулярность важнее идеала.',
        hard: '{name}, перестаньте ждать, что "кто-то спасет". Создайте контакт сами. Сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv08',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй план на неделю: одна встреча или маленькая активность "вне дома". Это реально.',
        moderate:
          '{name}, предложи встречу на этой неделе - кофе/прогулка. Это простой способ вернуть связь.',
        hard: '{name}, делаем ход: напиши человеку и предложи кофе на этой неделе. Отправляй.',
      },
      formal: {
        soft: '{name}, попробуйте план на неделю: одна встреча или небольшая активность "вне дома". Это реально.',
        moderate:
          '{name}, предложите встречу на этой неделе - кофе/прогулка. Это простой способ вернуть связь.',
        hard: '{name}, сделайте ход: напишите человеку и предложите кофе на этой неделе. Отправляйте.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv09',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно справляться в одиночку. Можно начать с маленького контакта.',
        moderate:
          '{name}, одиночество - не "твой характер", это состояние. Его можно менять действиями.',
        hard: '{name}, это состояние, а не судьба. Меняй его: один контакт сейчас.',
      },
      formal: {
        soft: '{name}, вам не нужно справляться в одиночку. Вы можете начать с маленького контакта.',
        moderate:
          '{name}, одиночество - не "ваш характер", это состояние. Его можно менять действиями.',
        hard: '{name}, это состояние, а не судьба. Меняйте его: один контакт сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv10',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, маленькая стабилизация + маленький контакт = уже легче. Ты можешь.',
        moderate:
          '{name}, сделай вдох-выдох и один шаг к людям. Это самый короткий путь "в норму".',
        hard: '{name}, хватит крутить это в голове. Вдох. Выдох. И действие: контакт сейчас.',
      },
      formal: {
        soft: '{name}, небольшая стабилизация + небольшой контакт = уже легче. У вас получится.',
        moderate:
          '{name}, сделайте вдох-выдох и один шаг к людям. Это самый короткий путь "в норму".',
        hard: '{name}, хватит крутить это в голове. Вдох. Выдох. И действие: контакт сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv11',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты уже делаешь важное - не закрываешь глаза на себя. Остался один маленький шаг к связи.',
        moderate:
          '{name}, сделай один контакт сегодня. Это маленькая победа над изоляцией.',
        hard: '{name}, победа сегодня простая: один контакт. Не больше. Не меньше. Делай.',
      },
      formal: {
        soft: '{name}, вы уже делаете важное - не закрываете глаза на себя. Остался один маленький шаг к связи.',
        moderate:
          '{name}, сделайте один контакт сегодня. Это маленькая победа над изоляцией.',
        hard: '{name}, победа сегодня простая: один контакт. Не больше. Не меньше. Сделайте.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv12',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, каждый раз, когда ты выходишь "в люди", ты тренируешь связь. Это навык.',
        moderate:
          '{name}, связь - это навык. Маленькие повторения дают эффект быстрее, чем редкие подвиги.',
        hard: '{name}, хватит ждать "само". Тренируй навык: один микрошаг сегодня. Поехали.',
      },
      formal: {
        soft: '{name}, каждый раз, когда вы выходите "в люди", вы тренируете связь. Это навык.',
        moderate:
          '{name}, связь - это навык. Маленькие повторения дают эффект быстрее, чем редкие подвиги.',
        hard: '{name}, хватит ждать "само". Тренируйте навык: один микрошаг сегодня. Поехали.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv13',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно быть "удобным". Важно быть живым и появляться.',
        moderate:
          '{name}, не нужно писать идеально. Главное — появиться и сделать шаг.',
        hard: '{name}, перестань вылизывать текст в голове. Напиши просто и отправь. Сейчас.',
      },
      formal: {
        soft: '{name}, не нужно быть "удобным". Важно быть живым и появляться.',
        moderate:
          '{name}, вам не нужно писать идеально. Главное - появиться и сделать шаг.',
        hard: '{name}, перестаньте вылизывать текст в голове. Напишите просто и отправьте. Сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv14',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если страшно - это значит, что шаг важный. Сделай его мягко: реакция или короткое "привет".',
        moderate:
          '{name}, страх - не стоп-сигнал. Это сигнал "делаем маленький шаг".',
        hard: '{name}, страх есть - и что? Делай шаг. Реакция/"привет" - сейчас.',
      },
      formal: {
        soft: '{name}, если страшно - это значит, что шаг важный. Сделайте его мягко: реакция или короткое "привет".',
        moderate:
          '{name}, страх - не стоп-сигнал. Это сигнал "делаем маленький шаг".',
        hard: '{name}, страх есть - и что? Сделайте шаг. Реакция/"привет" - сейчас.',
      },
    },
  },
  {
    id: 'psylonelinessmotiv15',
    kind: 'therapy',
    entityKey: 'loneliness',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно стать себе союзником: выйти, написать, проявиться. Маленьким шагом.',
        moderate:
          '{name}, одиночество не "победит", если ты делаешь шаги. Один шаг сегодня - уже достаточно.',
        hard: '{name}, перестань отдавать день одиночеству. Сделай шаг к людям прямо сейчас.',
      },
      formal: {
        soft: '{name}, сегодня можно стать себе союзником: выйти, написать, проявиться. Маленьким шагом.',
        moderate:
          '{name}, одиночество не "победит", если вы делаете шаги. Один шаг сегодня - уже достаточно.',
        hard: '{name}, перестаньте отдавать день одиночеству. Сделайте шаг к людям прямо сейчас.',
      },
    },
  },

  // =========================
  // ANGER - 45 templates [NEW]
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psyangerreminder01_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, пауза на 10 секунд. Разожми челюсть, опусти плечи и сделай длинный выдох. Злость любит скорость, а пауза возвращает контроль.',
        moderate:
          '{name}, стоп на 10 секунд: челюсть мягкая, плечи вниз, выдох длиннее вдоха. Это “охлаждение”, чтобы не сказать лишнего.',
        hard: '{name}, стоп. Челюсть разжать. Длинный выдох. Не реагируй сразу.',
      },
      formal: {
        soft: '{name}, пауза на 10 секунд. Расслабьте челюсть, опустите плечи и сделайте длинный выдох. Пауза возвращает контроль.',
        moderate:
          '{name}, стоп на 10 секунд: челюсть мягкая, плечи вниз, выдох длиннее вдоха. Это “охлаждение”, чтобы не сказать лишнего.',
        hard: '{name}, стоп. Расслабьте челюсть. Длинный выдох. Не реагируйте сразу.',
      },
    },
  },
  {
    id: 'psyangerreminder02_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, проверь тело: где напряжение? кулаки, челюсть, грудь? Ослабь на 10%. Иногда злость — это перегруз, которому нужен выход.',
        moderate:
          '{name}, найди 3 точки зажима (кулаки/челюсть/плечи) и отпусти их на 10%. Так ты снижаешь накал, не подавляя себя.',
        hard: '{name}, найди зажимы и отпусти. Кулаки/челюсть/плечи. Сейчас.',
      },
      formal: {
        soft: '{name}, проверьте тело: где напряжение? кулаки, челюсть, грудь? Ослабьте на 10%. Иногда злость — это перегруз.',
        moderate:
          '{name}, найдите 3 точки зажима (кулаки/челюсть/плечи) и отпустите их на 10%. Это снижает накал.',
        hard: '{name}, найдите зажимы и отпустите. Кулаки/челюсть/плечи. Сейчас.',
      },
    },
  },
  {
    id: 'psyangerreminder03_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, прежде чем отвечать, сделай правило: “сначала 2 выдоха”. Это маленький тормоз, который спасает отношения и нервы.',
        moderate:
          '{name}, два длинных выдоха перед ответом. Это не слабость, а управление импульсом. Потом решишь, что говорить.',
        hard: '{name}, два выдоха — потом слова. Точка.',
      },
      formal: {
        soft: '{name}, прежде чем отвечать, сделайте правило: “сначала 2 выдоха”. Это маленький тормоз, который сохраняет отношения и нервы.',
        moderate:
          '{name}, два длинных выдоха перед ответом. Это управление импульсом. Потом решите, что говорить.',
        hard: '{name}, два выдоха — потом слова. Точка.',
      },
    },
  },
  {
    id: 'psyangerreminder04_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если накрывает — смени позицию: встань, сделай 10 шагов, посмотри в окно. Смена контекста сбивает пик злости.',
        moderate:
          '{name}, 10 шагов и взгляд вдаль на 20 секунд. Злость любит туннель, а ты расширяешь поле и возвращаешь управление.',
        hard: '{name}, встань. 10 шагов. Взгляд вдаль. Остываем.',
      },
      formal: {
        soft: '{name}, если накрывает — смените позицию: встаньте, сделайте 10 шагов, посмотрите в окно. Смена контекста сбивает пик злости.',
        moderate:
          '{name}, 10 шагов и взгляд вдаль на 20 секунд. Вы расширяете поле внимания и возвращаете управление.',
        hard: '{name}, встаньте. 10 шагов. Взгляд вдаль. Остываем.',
      },
    },
  },
  {
    id: 'psyangerreminder05_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, тактильная “заземлялка”: сожми и отпусти ладони 10 раз, почувствуй пальцы. Это возвращает тебя в тело и снижает накал.',
        moderate:
          '{name}, 10 раз сожми-отпусти кулаки медленно. Заметь ощущения в ладонях. Это помогает злости не управлять тобой.',
        hard: '{name}, кулаки сжать-отпустить 10 раз. Медленно. Делай.',
      },
      formal: {
        soft: '{name}, тактильное “заземление”: сожмите и отпустите ладони 10 раз, почувствуйте пальцы. Это снижает накал.',
        moderate:
          '{name}, 10 раз сожмите-отпустите кулаки медленно. Отметьте ощущения в ладонях. Это помогает управлять импульсом.',
        hard: '{name}, кулаки сжать-отпустить 10 раз. Медленно. Сделайте.',
      },
    },
  },
  {
    id: 'psyangerreminder06_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если хочется “врезать словом” — отложи ответ на 5 минут. Твоя сила — выбрать момент, а не выплеснуть.',
        moderate:
          '{name}, отложи ответ на 5 минут. Это не уступка, а контроль. Вернешься, когда эмоция станет тише.',
        hard: '{name}, не отвечай сейчас. 5 минут паузы. Потом.',
      },
      formal: {
        soft: '{name}, если хочется ответить резко — отложите ответ на 5 минут. Сила в выборе момента, а не в выплеске.',
        moderate:
          '{name}, отложите ответ на 5 минут. Это контроль. Вернетесь, когда эмоция станет тише.',
        hard: '{name}, не отвечайте сейчас. 5 минут паузы. Потом.',
      },
    },
  },
  {
    id: 'psyangerreminder07_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, спроси себя: “я злюсь, потому что мне больно/страшно/несправедливо?” Название причины снижает накал и даёт ясность.',
        moderate:
          '{name}, назови злость точнее: боль? усталость? границы нарушили? Чем точнее название, тем меньше взрыв и больше решений.',
        hard: '{name}, назови причину злости одним словом. Потом решай, что делать.',
      },
      formal: {
        soft: '{name}, спросите себя: “я злюсь, потому что мне больно/страшно/несправедливо?” Название причины снижает накал.',
        moderate:
          '{name}, назовите злость точнее: боль? усталость? нарушены границы? Точность снижает взрыв и повышает решения.',
        hard: '{name}, назовите причину злости одним словом. Затем решайте.',
      },
    },
  },
  {
    id: 'psyangerreminder08_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, “охлаждение”: выпей воды маленькими глотками и выдохни длинно. Простое действие возвращает паузу между стимулом и реакцией.',
        moderate:
          '{name}, вода + длинный выдох. Это маленький ритуал “не взрываться”. Дай себе 30 секунд и только потом отвечай.',
        hard: '{name}, вода. Длинный выдох. Потом слова.',
      },
      formal: {
        soft: '{name}, “охлаждение”: выпейте воды маленькими глотками и выдохните длинно. Это возвращает паузу между стимулом и реакцией.',
        moderate:
          '{name}, вода + длинный выдох. Дайте себе 30 секунд и только потом отвечайте.',
        hard: '{name}, вода. Длинный выдох. Потом слова.',
      },
    },
  },
  {
    id: 'psyangerreminder09_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери канал злости без разрушений: 20 приседаний, быстрый шаг, сжать полотенце. Энергии нужен выход.',
        moderate:
          '{name}, разрядка 60 секунд: приседания/планка/быстрый шаг. Сначала снизь физиологию, потом решай конфликт.',
        hard: '{name}, разрядка 60 секунд. Потом разговариваешь.',
      },
      formal: {
        soft: '{name}, выберите канал злости без разрушений: 20 приседаний, быстрый шаг, сжать полотенце. Энергии нужен выход.',
        moderate:
          '{name}, разрядка 60 секунд: приседания/планка/быстрый шаг. Сначала снизьте физиологию, потом решайте конфликт.',
        hard: '{name}, разрядка 60 секунд. Потом разговаривайте.',
      },
    },
  },
  {
    id: 'psyangerreminder10_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мини-граница: скажи “мне нужна пауза, вернусь позже”. Это честно и безопасно, когда эмоция на пике.',
        moderate:
          '{name}, если тон растёт — обозначь паузу. Лучше пауза сейчас, чем слова, которые потом придётся чинить.',
        hard: '{name}, скажи: “пауза”. И выйди/замолчи на 5 минут.',
      },
      formal: {
        soft: '{name}, мини-граница: скажите “мне нужна пауза, я вернусь позже”. Это честно и безопасно на пике эмоций.',
        moderate:
          '{name}, если тон растёт — обозначьте паузу. Лучше пауза сейчас, чем слова, которые потом придётся исправлять.',
        hard: '{name}, скажите: “пауза”. И выйдите/замолчите на 5 минут.',
      },
    },
  },
  {
    id: 'psyangerreminder11_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, проверь усталость: злость усиливается, когда ты голоден или не выспался. Сначала база, потом спор.',
        moderate:
          '{name}, если ты на нуле, любой триггер звучит громче. Еда/вода/сон — это часть управления злостью.',
        hard: '{name}, на нуле не спорь. Сначала ресурс.',
      },
      formal: {
        soft: '{name}, проверьте усталость: злость усиливается, когда вы голодны или не выспались. Сначала база, потом спор.',
        moderate:
          '{name}, если вы на нуле, любой триггер громче. Еда/вода/сон — часть управления злостью.',
        hard: '{name}, на нуле не спорьте. Сначала ресурс.',
      },
    },
  },
  {
    id: 'psyangerreminder12_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери цель: “быть правым” или “быть в контакте”. Иногда злость просит победы, а тебе нужна близость и уважение.',
        moderate:
          '{name}, напомни себе: цель — решить, не разнести. Один длинный выдох и вопрос: “что я хочу получить в итоге?”.',
        hard: '{name}, цель — решение, не драка. Спроси: что ты хочешь в итоге?',
      },
      formal: {
        soft: '{name}, выберите цель: “быть правым” или “быть в контакте”. Иногда злость просит победы, а вам нужна связь и уважение.',
        moderate:
          '{name}, напомните себе: цель — решить, не разрушить. Выдох и вопрос: “чего я хочу в итоге?”.',
        hard: '{name}, цель — решение, не драка. Спросите: чего хотите в итоге?',
      },
    },
  },
  {
    id: 'psyangerreminder13_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если тебя триггернуло — это сигнал. Запиши: что случилось, что я почувствовал, что мне важно. Так злость превращается в смысл.',
        moderate:
          '{name}, 3 строки: событие — эмоция — потребность. Это быстро переводит злость из “взрыва” в ясный запрос.',
        hard: '{name}, событие-эмоция-потребность. 3 строки. Сейчас.',
      },
      formal: {
        soft: '{name}, если вас триггернуло — это сигнал. Запишите: что случилось, что вы почувствовали, что вам важно.',
        moderate:
          '{name}, 3 строки: событие — эмоция — потребность. Это переводит злость из “взрыва” в ясный запрос.',
        hard: '{name}, событие-эмоция-потребность. 3 строки. Сейчас.',
      },
    },
  },
  {
    id: 'psyangerreminder14_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выдохни и смягчи голос на один тон. Тело и голос связаны: когда тон ниже, мозг быстрее успокаивается.',
        moderate:
          '{name}, говори чуть медленнее и тише на 10%. Это не “сдаться”, а вернуть себе управление разговором и не разрушить связь.',
        hard: '{name}, замедлись и говори тише. Иначе сорвёшься.',
      },
      formal: {
        soft: '{name}, выдохните и смягчите голос на один тон. Тело и голос связаны: когда тон ниже, мозг успокаивается быстрее.',
        moderate:
          '{name}, говорите чуть медленнее и тише на 10%. Это возвращает управление разговором и сохраняет связь.',
        hard: '{name}, замедлитесь и говорите тише. Иначе сорвётесь.',
      },
    },
  },
  {
    id: 'psyangerreminder15_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, финальный чек: “если я скажу это сейчас — станет лучше или хуже?”. Один вопрос спасает от лишних слов, когда внутри кипит.',
        moderate:
          '{name}, перед фразой спроси: “это приближает решение?”. Если нет — пауза, выдох, и только потом формулировка.',
        hard: '{name}, спроси: это приближает решение? Нет — молчи и дыши.',
      },
      formal: {
        soft: '{name}, финальный чек: “если я скажу это сейчас — станет лучше или хуже?”. Один вопрос спасает от лишних слов.',
        moderate:
          '{name}, перед фразой спросите: “это приближает решение?”. Если нет — пауза и выдох, затем формулировка.',
        hard: '{name}, спросите: это приближает решение? Нет — молчите и дышите.',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psyangerinfo01_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, злость — не “плохая” эмоция. Она часто сигнализирует о границах, усталости или несправедливости. Важно не подавить, а направить.',
        moderate:
          '{name}, злость = энергия на защиту. Проблема не в чувстве, а в импульсивной реакции. Пауза даёт шанс выбрать действие.',
        hard: '{name}, злость нормальна. Опасна не она, а реакция без паузы.',
      },
      formal: {
        soft: '{name}, злость — не “плохая” эмоция. Она сигнализирует о границах, усталости или несправедливости. Важно направлять её.',
        moderate:
          '{name}, злость — энергия на защиту. Проблема не в чувстве, а в импульсивной реакции. Пауза даёт шанс выбрать действие.',
        hard: '{name}, злость нормальна. Опасна реакция без паузы.',
      },
    },
  },
  {
    id: 'psyangerinfo02_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, на пике злости мышление становится “туннельным”: кажется, что есть только один правильный ответ. Пауза расширяет картину.',
        moderate:
          '{name}, когда тело в возбуждении, мозг быстрее видит угрозу и обиду. Сначала успокой физиологию, потом обсуждай смысл.',
        hard: '{name}, сначала тело, потом разговор. Иначе туннель и взрыв.',
      },
      formal: {
        soft: '{name}, на пике злости мышление становится “туннельным”: кажется, что есть только один ответ. Пауза расширяет картину.',
        moderate:
          '{name}, при возбуждении мозг быстрее видит угрозу и обиду. Сначала успокойте физиологию, потом обсуждайте смысл.',
        hard: '{name}, сначала тело, потом разговор. Иначе будет “туннель” и взрыв.',
      },
    },
  },
  {
    id: 'psyangerinfo03_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, длинный выдох — простой способ снизить возбуждение. Он помогает “снять газ”, не подавляя злость и не делая вид, что всё ок.',
        moderate:
          '{name}, чем длиннее выдох, тем меньше внутренний разгон. Это проще, чем убеждать себя “не злись”.',
        hard: '{name}, длинный выдох снижает разгон. “Не злись” — нет.',
      },
      formal: {
        soft: '{name}, длинный выдох снижает возбуждение. Он помогает “снять газ”, не подавляя злость и не делая вид, что всё в порядке.',
        moderate:
          '{name}, чем длиннее выдох, тем меньше разгон. Это проще, чем убеждать себя “не злиться”.',
        hard: '{name}, длинный выдох снижает разгон. “Не злитесь” — не работает.',
      },
    },
  },
  {
    id: 'psyangerinfo04_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, злость часто усиливается от голода, недосыпа и перегруза. Это не “слабость”, а биология: ресурс ниже — терпимость ниже.',
        moderate:
          '{name}, когда устаёшь, триггеры звучат громче. Поэтому забота о базовом ресурсе — часть управления эмоциями.',
        hard: '{name}, ресурс решает. Ноль сил = больше злости. Это нормально.',
      },
      formal: {
        soft: '{name}, злость усиливается от голода, недосыпа и перегруза. Это биология: ресурс ниже — терпимость ниже.',
        moderate:
          '{name}, когда вы устали, триггеры звучат громче. Забота о ресурсе — часть управления эмоциями.',
        hard: '{name}, ресурс решает. Ноль сил = больше злости. Это нормально.',
      },
    },
  },
  {
    id: 'psyangerinfo05_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, злость иногда прикрывает уязвимость: боль, стыд, страх. Если найти “что под ней”, реакция становится мягче и точнее.',
        moderate:
          '{name}, вопрос “что мне сейчас важно?” помогает перевести злость в потребность и границу. Так появляется шанс на решение.',
        hard: '{name}, под злостью часто уязвимость. Найди её — и станет тише.',
      },
      formal: {
        soft: '{name}, злость иногда прикрывает уязвимость: боль, стыд, страх. Если найти “что под ней”, реакция становится точнее.',
        moderate:
          '{name}, вопрос “что мне сейчас важно?” переводит злость в потребность и границу. Появляется шанс на решение.',
        hard: '{name}, под злостью часто уязвимость. Найдите её — и станет тише.',
      },
    },
  },
  {
    id: 'psyangerinfo06_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, “пауза” — не уступка. Это инструмент, чтобы выбрать слова и не разрушить то, что потом важно чинить.',
        moderate:
          '{name}, пауза не отменяет границы. Она даёт шанс донести их ясно, без оскорблений и “сжигания мостов”.',
        hard: '{name}, пауза — сила. Она спасает от лишнего.',
      },
      formal: {
        soft: '{name}, пауза — не уступка. Это инструмент, чтобы выбрать слова и не разрушить то, что потом важно исправлять.',
        moderate:
          '{name}, пауза не отменяет границы. Она помогает донести их ясно, без оскорблений и “сжигания мостов”.',
        hard: '{name}, пауза — сила. Она спасает от лишнего.',
      },
    },
  },
  {
    id: 'psyangerinfo07_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, разрядка через тело помогает, потому что злость — это энергия. Когда телу есть куда “сбросить”, голове проще думать.',
        moderate:
          '{name}, короткая физическая нагрузка снижает возбуждение быстрее разговоров в голове. Это не избегание, а регуляция.',
        hard: '{name}, злость — энергия. Сбрось её телом, иначе сбросишь словами.',
      },
      formal: {
        soft: '{name}, разрядка через тело помогает, потому что злость — энергия. Когда телу есть куда “сбросить”, голове проще думать.',
        moderate:
          '{name}, короткая физическая нагрузка снижает возбуждение быстрее мыслей. Это регуляция, а не избегание.',
        hard: '{name}, злость — энергия. Сбросьте её телом, иначе сбросите словами.',
      },
    },
  },
  {
    id: 'psyangerinfo08_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если реагировать “в моменте”, часто получается борьба за правоту. Если подождать, появляется шанс поговорить про потребность и решение.',
        moderate:
          '{name}, конфликт легче решать, когда накал ниже. Это не про “проглотить”, а про выбрать момент для ясной границы.',
        hard: '{name}, решают конфликты на низком накале. На пике — ломают.',
      },
      formal: {
        soft: '{name}, если реагировать сразу, часто получается борьба за правоту. Если подождать, появляется шанс говорить о потребности и решении.',
        moderate:
          '{name}, конфликт легче решать, когда накал ниже. Это про выбор момента для ясной границы.',
        hard: '{name}, конфликты решают на низком накале. На пике — ломают.',
      },
    },
  },
  {
    id: 'psyangerinfo09_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, слова, сказанные в злости, часто “долго живут” у другого человека. Пауза — способ защитить отношения и себя от сожаления.',
        moderate:
          '{name}, грубость даёт краткое облегчение, но повышает цену конфликта. Регуляция эмоции делает результат выгоднее.',
        hard: '{name}, хочешь меньше последствий — не говори на пике.',
      },
      formal: {
        soft: '{name}, слова, сказанные в злости, часто “долго живут” у другого человека. Пауза защищает отношения и снижает сожаление.',
        moderate:
          '{name}, грубость даёт краткое облегчение, но повышает цену конфликта. Регуляция делает результат лучше.',
        hard: '{name}, хотите меньше последствий — не говорите на пике.',
      },
    },
  },
  {
    id: 'psyangerinfo10_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, злость можно перевести в запрос: “мне важно…”, “мне нужно…”, “я пока не готов…”. Это сохраняет границы и снижает драку.',
        moderate:
          '{name}, формула “факт — чувство — просьба” помогает говорить жёстко, но без разрушения. Это полезный навык для отношений.',
        hard: '{name}, переводи злость в запрос. Иначе получится нападение.',
      },
      formal: {
        soft: '{name}, злость можно перевести в запрос: “мне важно…”, “мне нужно…”, “я пока не готов…”. Это сохраняет границы.',
        moderate:
          '{name}, формула “факт — чувство — просьба” помогает говорить твёрдо без разрушения. Это полезный навык.',
        hard: '{name}, переводите злость в запрос. Иначе получится нападение.',
      },
    },
  },
  {
    id: 'psyangerinfo11_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, раздражительность часто накапливается, когда долго “терпишь”. Регулярные маленькие границы снижают риск взрыва.',
        moderate:
          '{name}, если копить, потом рвёт. Лучше вовремя: “мне так не подходит”, “остановись”, “давай иначе”. Это профилактика.',
        hard: '{name}, копишь — взорвёшься. Ставь границы раньше.',
      },
      formal: {
        soft: '{name}, раздражительность накапливается, когда долго “терпишь”. Регулярные границы снижают риск взрыва.',
        moderate:
          '{name}, если копить, потом будет срыв. Лучше вовремя: “мне так не подходит”, “остановитесь”. Это профилактика.',
        hard: '{name}, копите — сорвётесь. Ставьте границы раньше.',
      },
    },
  },
  {
    id: 'psyangerinfo12_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, злость не обязана исчезнуть, чтобы действовать разумно. Достаточно снизить накал до уровня, где ты выбираешь, а не взрываешься.',
        moderate:
          '{name}, цель регуляции — не “стать спокойным навсегда”, а вернуть контроль над поведением. Это достижимо тренировкой.',
        hard: '{name}, цель — контроль, а не вечный дзен. Тренируй регуляцию.',
      },
      formal: {
        soft: '{name}, злость не обязана исчезнуть, чтобы вы действовали разумно. Достаточно снизить накал до уровня выбора.',
        moderate:
          '{name}, цель регуляции — вернуть контроль над поведением, а не “стать спокойным навсегда”. Это тренируется.',
        hard: '{name}, цель — контроль, а не вечный дзен. Тренируйте регуляцию.',
      },
    },
  },
  {
    id: 'psyangerinfo13_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, “мне нужно время” — честная фраза. Она защищает от импульсивных слов и показывает, что ты берёшь ответственность за реакцию.',
        moderate:
          '{name}, пауза в разговоре — это техника безопасности. Так меньше эскалации и больше шансов услышать друг друга.',
        hard: '{name}, пауза — техника безопасности. Пользуйся.',
      },
      formal: {
        soft: '{name}, “мне нужно время” — честная фраза. Она защищает от импульсивных слов и показывает ответственность за реакцию.',
        moderate:
          '{name}, пауза в разговоре — техника безопасности. Так меньше эскалации и больше шансов услышать друг друга.',
        hard: '{name}, пауза — техника безопасности. Используйте её.',
      },
    },
  },
  {
    id: 'psyangerinfo14_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, иногда злость — сигнал, что твои ценности задеты. Вопрос “что для меня важно?” помогает из эмоции сделать действие без разрушений.',
        moderate:
          '{name}, ценности дают направление: уважение, безопасность, честность. Когда ты видишь ценность, легче говорить спокойно и по делу.',
        hard: '{name}, найди ценность под злостью. Тогда появится ясный шаг.',
      },
      formal: {
        soft: '{name}, иногда злость — сигнал, что ваши ценности задеты. Вопрос “что для меня важно?” помогает сделать действие без разрушений.',
        moderate:
          '{name}, ценности дают направление: уважение, безопасность, честность. Когда видна ценность, легче говорить спокойно.',
        hard: '{name}, найдите ценность под злостью. Тогда появится ясный шаг.',
      },
    },
  },
  {
    id: 'psyangerinfo15_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если злость часто выходит из-под контроля, это можно тренировать: навыки паузы, границ, разрядки. С этим не нужно оставаться одному.',
        moderate:
          '{name}, регулярные срывы — повод усилить поддержку: терапия, работа со стрессом, режим сна. Это решаемо, шаг за шагом.',
        hard: '{name}, если срывы частые — нужна поддержка и тренировка навыков. Это нормально.',
      },
      formal: {
        soft: '{name}, если злость часто выходит из-под контроля, это можно тренировать: навыки паузы, границ, разрядки. Не оставайтесь одни.',
        moderate:
          '{name}, регулярные срывы — повод усилить поддержку: терапия, работа со стрессом, режим сна. Это решаемо.',
        hard: '{name}, если срывы частые — нужна поддержка и тренировка навыков. Это нормально.',
      },
    },
  },

  // --- MOTIVATIONAL (15) ---
  {
    id: 'psyangermotiv01_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь злиться и при этом выбирать поведение. Это и есть сила: не подавить чувство, а удержать руль. Начни с одного длинного выдоха.',
        moderate:
          '{name}, твоя задача — не “не злиться”, а не разрушать. Пауза, выдох, граница — и ты уже управляешь ситуацией.',
        hard: '{name}, управляй реакцией. Чувство есть — руль у тебя.',
      },
      formal: {
        soft: '{name}, вы можете злиться и при этом выбирать поведение. Это сила: не подавить чувство, а удержать руль. Начните с длинного выдоха.',
        moderate:
          '{name}, задача — не “не злиться”, а не разрушать. Пауза, выдох, граница — и вы управляете ситуацией.',
        hard: '{name}, управляйте реакцией. Чувство есть — руль у вас.',
      },
    },
  },
  {
    id: 'psyangermotiv02_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери сегодня один новый ответ вместо привычного взрыва. Даже маленькая победа над импульсом укрепляет уверенность и уважение к себе.',
        moderate:
          '{name}, попробуй “на один тон мягче”. Не ради уступки, а ради контроля. Так ты защищаешь и себя, и отношения.',
        hard: '{name}, сделай иначе, чем обычно. Один раз. Это и есть тренировка.',
      },
      formal: {
        soft: '{name}, выберите сегодня один новый ответ вместо привычного взрыва. Маленькая победа над импульсом укрепляет уважение к себе.',
        moderate:
          '{name}, попробуйте “на один тон мягче”. Ради контроля. Так вы защищаете себя и отношения.',
        hard: '{name}, сделайте иначе, чем обычно. Один раз. Это тренировка.',
      },
    },
  },
  {
    id: 'psyangermotiv03_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, когда ты ставишь границу спокойно, это не про слабость. Это про точность. Точность сильнее крика.',
        moderate:
          '{name}, попробуй говорить фактами и просьбой. Это сложнее, чем сорваться, но результат чище: меньше стыда и больше уважения.',
        hard: '{name}, выбери точность вместо крика. Факт + просьба. Всё.',
      },
      formal: {
        soft: '{name}, когда вы ставите границу спокойно, вы не становитесь “слабыми”. Вы становитесь точными. Точность сильнее крика.',
        moderate:
          '{name}, попробуйте говорить фактами и просьбой. Это сложнее, но результат чище: меньше стыда и больше уважения.',
        hard: '{name}, выберите точность вместо крика. Факт + просьба.',
      },
    },
  },
  {
    id: 'psyangermotiv04_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, злость может стать топливом: навести порядок, защитить границу, изменить правила. Направь энергию туда, где станет лучше.',
        moderate:
          '{name}, направь злость в действие, которое улучшает жизнь: один разговор по делу, один отказ, один шаг к уважению к себе.',
        hard: '{name}, направь энергию в действие, а не в разрушение. Выбирай шаг.',
      },
      formal: {
        soft: '{name}, злость может стать топливом: навести порядок, защитить границу, изменить правила. Направьте энергию туда, где станет лучше.',
        moderate:
          '{name}, направьте злость в действие, которое улучшает жизнь: один разговор по делу, один отказ, один шаг к уважению к себе.',
        hard: '{name}, направьте энергию в действие, а не в разрушение. Выберите шаг.',
      },
    },
  },
  {
    id: 'psyangermotiv05_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты уже делаешь важное: замечаешь накал. Следующий шаг — пауза. Навык строится не за день, а за повторения.',
        moderate:
          '{name}, сегодня тренировка: заметил — выдохнул — выбрал фразу. Три шага. Не идеально, а достаточно.',
        hard: '{name}, тренировка: заметил — выдох — выбрал. Повтори.',
      },
      formal: {
        soft: '{name}, вы уже делаете важное: замечаете накал. Следующий шаг — пауза. Навык строится повторениями.',
        moderate:
          '{name}, сегодня тренировка: заметили — выдохнули — выбрали фразу. Три шага. Не идеально, а достаточно.',
        hard: '{name}, тренировка: заметили — выдох — выбрали. Повторите.',
      },
    },
  },
  {
    id: 'psyangermotiv06_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно выигрывать спор. Цель — сохранить себя и уважение. Иногда лучший ход — пауза и ясная граница позже.',
        moderate:
          '{name}, выбери стратегию: меньше эскалации — больше результата. Пауза сейчас экономит много сил и последствий потом.',
        hard: '{name}, не играй в эскалацию. Пауза. Потом граница.',
      },
      formal: {
        soft: '{name}, вы не обязаны выигрывать спор. Цель — сохранить себя и уважение. Иногда лучший ход — пауза и граница позже.',
        moderate:
          '{name}, выберите стратегию: меньше эскалации — больше результата. Пауза сейчас экономит силы и последствия.',
        hard: '{name}, не эскалируйте. Пауза. Потом граница.',
      },
    },
  },
  {
    id: 'psyangermotiv07_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня достаточно снизить накал на 10%. Не “стать спокойным”, а вернуть управляемость. Один длинный выдох — уже шаг.',
        moderate:
          '{name}, цель — минус 10% накала. Это достижимо: выдох, плечи вниз, пауза. Маленькое снижение — большой эффект в словах.',
        hard: '{name}, минус 10% накала. Выдох. Пауза. Всё.',
      },
      formal: {
        soft: '{name}, сегодня достаточно снизить накал на 10%. Не “стать спокойными”, а вернуть управляемость. Длинный выдох — шаг.',
        moderate:
          '{name}, цель — минус 10% накала. Это достижимо: выдох, плечи вниз, пауза. Маленькое снижение — большой эффект.',
        hard: '{name}, минус 10% накала. Выдох. Пауза.',
      },
    },
  },
  {
    id: 'psyangermotiv08_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, злость говорит: “я важен, со мной так нельзя”. Это можно сказать спокойно. Ты имеешь право на границы и уважение.',
        moderate:
          '{name}, защити себя без разрушения: короткая просьба, чёткая граница, спокойный тон. Это взрослая сила, а не крик.',
        hard: '{name}, ставь границу спокойно. Так ты сильнее.',
      },
      formal: {
        soft: '{name}, злость говорит: “мне важно, со мной так нельзя”. Это можно сказать спокойно. Вы имеете право на границы.',
        moderate:
          '{name}, защитите себя без разрушения: короткая просьба, чёткая граница, спокойный тон. Это сила.',
        hard: '{name}, ставьте границу спокойно. Так вы сильнее.',
      },
    },
  },
  {
    id: 'psyangermotiv09_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно отвечать мгновенно. Дай себе право “подумать и вернуться”. Это уважение к себе и к другому.',
        moderate:
          '{name}, выбери паузу как инструмент. Пауза — это не проигрыш, это управление ситуацией и сохранение будущих отношений.',
        hard: '{name}, не отвечай сразу. Возьми паузу. Вернёшься.',
      },
      formal: {
        soft: '{name}, вы не обязаны отвечать мгновенно. Дайте себе право “подумать и вернуться”. Это уважение к себе и к другому.',
        moderate:
          '{name}, выберите паузу как инструмент. Пауза — это управление ситуацией и сохранение отношений.',
        hard: '{name}, не отвечайте сразу. Возьмите паузу. Вернётесь.',
      },
    },
  },
  {
    id: 'psyangermotiv10_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если сорвался — это не конец. Можно восстановить: извиниться, объяснить, что был на пике, и предложить разговор позже.',
        moderate:
          '{name}, ошибка — не приговор. Важно, что ты делаешь после: берёшь ответственность, чинишь, учишься. Это зрелость.',
        hard: '{name}, сорвался — чини. Ответственность, извинение, пауза. Дальше тренировка.',
      },
      formal: {
        soft: '{name}, если сорвались — это не конец. Можно восстановить: извиниться, объяснить пик эмоции и предложить разговор позже.',
        moderate:
          '{name}, ошибка — не приговор. Важно, что вы делаете после: ответственность, восстановление, обучение. Это зрелость.',
        hard: '{name}, сорвались — восстановите. Ответственность, извинение, пауза. Дальше тренировка.',
      },
    },
  },
  {
    id: 'psyangermotiv11_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно быть твёрдым и спокойным одновременно. Это навык. Один маленький шаг сейчас делает следующий раз легче.',
        moderate:
          '{name}, тренируй “твёрдо и уважительно”. Это даёт больше результата, чем нападение. Ты строишь силу без разрушений.',
        hard: '{name}, будь твёрдым и уважительным. Это максимум контроля.',
      },
      formal: {
        soft: '{name}, вы можете быть твёрдыми и спокойными одновременно. Это навык. Один шаг сейчас делает следующий раз легче.',
        moderate:
          '{name}, тренируйте “твёрдо и уважительно”. Это даёт больше результата, чем нападение.',
        hard: '{name}, будьте твёрдыми и уважительными. Это максимум контроля.',
      },
    },
  },
  {
    id: 'psyangermotiv12_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, в момент злости ты можешь выбрать заботу о будущем себе. Пауза сейчас = меньше стыда, меньше конфликтов, больше уважения.',
        moderate:
          '{name}, подумай о завтрашнем себе: он скажет спасибо за паузу и точные слова. Ты умеешь управлять собой.',
        hard: '{name}, сделай хорошо будущему себе: пауза и точные слова.',
      },
      formal: {
        soft: '{name}, в момент злости вы можете выбрать заботу о будущем себе. Пауза сейчас = меньше стыда и конфликтов.',
        moderate:
          '{name}, подумайте о завтрашнем себе: он скажет спасибо за паузу и точные слова. Вы можете управлять собой.',
        hard: '{name}, сделайте хорошо будущему себе: пауза и точные слова.',
      },
    },
  },
  {
    id: 'psyangermotiv13_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно “сдерживаться” через силу. Можно отрегулировать: тело, дыхание, пауза. Это мягко и эффективно.',
        moderate:
          '{name}, регуляция — это забота о себе. Не подавление, а управление. Ты выбираешь путь без разрушений.',
        hard: '{name}, не дави злость. Управляй ею: тело, выдох, пауза.',
      },
      formal: {
        soft: '{name}, вы не обязаны “сдерживаться” через силу. Можно отрегулировать: тело, дыхание, пауза. Это мягко и эффективно.',
        moderate:
          '{name}, регуляция — забота о себе. Не подавление, а управление. Вы выбираете путь без разрушений.',
        hard: '{name}, не подавляйте злость. Управляйте: тело, выдох, пауза.',
      },
    },
  },
  {
    id: 'psyangermotiv14_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право на недовольство. И ты имеешь право выражать это безопасно. Выбирай форму, которая уважает тебя.',
        moderate:
          '{name}, недовольство — нормально. Важно, чтобы твоя реакция работала на тебя: ясная граница, спокойный тон, конкретная просьба.',
        hard: '{name}, выражай злость так, чтобы это работало на тебя. Без разрушений.',
      },
      formal: {
        soft: '{name}, вы имеете право быть недовольными. И вы имеете право выражать это безопасно. Выбирайте форму, которая уважает вас.',
        moderate:
          '{name}, недовольство — нормально. Важно, чтобы реакция работала на вас: граница, тон, просьба.',
        hard: '{name}, выражайте злость так, чтобы это работало на вас. Без разрушений.',
      },
    },
  },
  {
    id: 'psyangermotiv15_new',
    kind: 'therapy',
    entityKey: 'anger',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, один навык на сегодня: “остановиться на секунду”. Это маленький выбор, который постепенно меняет сценарий злости.',
        moderate:
          '{name}, сегодня тренируем паузу. Каждая пауза — кирпичик в контроль. Ты строишь привычку, которая реально освобождает.',
        hard: '{name}, пауза. Каждый раз. Это твой новый стандарт.',
      },
      formal: {
        soft: '{name}, один навык на сегодня: “остановиться на секунду”. Это маленький выбор, который постепенно меняет сценарий злости.',
        moderate:
          '{name}, сегодня тренируем паузу. Каждая пауза — кирпичик в контроль. Вы строите привычку.',
        hard: '{name}, пауза. Каждый раз. Это ваш новый стандарт.',
      },
    },
  },

  // =========================
  // SELFEESTEEM - 45 templates [NEW]
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psyselfesteemreminder01_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, поймай внутреннего критика и сделай паузу: “я бы так говорил с другом?”. Замени фразу на более добрую и точную.',
        moderate:
          '{name}, стоп самокритике: спроси “это факт или ругань?”. Оставь факт, убери оскорбление. Так ты поддержишь себя, а не добьёшь.',
        hard: '{name}, стоп. Это ругань, не факт. Переформулируй нормально.',
      },
      formal: {
        soft: '{name}, поймайте внутреннего критика и сделайте паузу: “я бы так говорил с другом?”. Замените фразу на более добрую.',
        moderate:
          '{name}, стоп самокритике: спросите “это факт или ругань?”. Оставьте факт, уберите оскорбление.',
        hard: '{name}, стоп. Это ругань, не факт. Переформулируйте.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder02_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй “мягкую правду”: “мне трудно, но я стараюсь”. Это честно и поддерживает, вместо того чтобы подрубать тебе ноги.',
        moderate:
          '{name}, замени “я провалил” на “у меня не получилось с первого раза”. Так ты оставляешь шанс на рост, а не ставишь крест.',
        hard: '{name}, убери “я провал”. Скажи: “не получилось, попробую иначе”.',
      },
      formal: {
        soft: '{name}, попробуйте “мягкую правду”: “мне трудно, но я стараюсь”. Это честно и поддерживает.',
        moderate:
          '{name}, замените “я провалил” на “у меня не получилось с первого раза”. Это оставляет шанс на рост.',
        hard: '{name}, уберите “я провал”. Скажите: “не получилось, попробую иначе”.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder03_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, 3 добрых факта о себе — прямо сейчас. Не комплименты “в воздух”, а факты: что получилось сделать, что удалось выдержать, чему научился.',
        moderate:
          '{name}, выпиши 3 факта: “у меня получилось…”, “я справляюсь…”, “я учусь…”. Это подпирает самооценку реальностью.',
        hard: '{name}, 3 факта о себе. Без “но”. Пиши.',
      },
      formal: {
        soft: '{name}, 3 добрых факта о себе — прямо сейчас. Не абстракции, а факты: что вы сделали, выдержали, чему научились.',
        moderate:
          '{name}, выпишите 3 факта: “у меня получилось…”, “я справляюсь…”, “я учусь…”. Это поддерживает самооценку.',
        hard: '{name}, 3 факта о себе. Без “но”. Запишите.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder04_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня не нужно быть идеальным. Достаточно быть достаточно хорошим человеком. И сделать один небольшой шаг в сторону своих ценностей.',
        moderate:
          '{name}, перфекционизм кормит самокритику. Выбери “сделано на 70%” — и сохрани силы. Это взрослая стратегия.',
        hard: '{name}, хватит идеала. Сделай на 70% и отпусти.',
      },
      formal: {
        soft: '{name}, сегодня не нужно быть идеальными. Достаточно быть достаточно хорошими и сделать один небольшой шаг к своим ценностям.',
        moderate:
          '{name}, перфекционизм усиливает самокритику. Выберите “сделано на 70%” и сохраните силы.',
        hard: '{name}, хватит идеала. Сделайте на 70% и отпустите.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder05_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, заметь сравнение с другими и вернись к себе: “что у меня стало лучше по сравнению с прошлой неделей?”. Сравнение с собой — честнее.',
        moderate:
          '{name}, когда сравниваешься, спроси: “я вижу всю картину или только витрину?”. Верни фокус на свой путь и один шаг.',
        hard: '{name}, не сравнивай себя с чужой витриной. Сравни с собой вчера.',
      },
      formal: {
        soft: '{name}, заметив сравнение с другими, вернитесь к себе: “что у меня стало лучше по сравнению с прошлой неделей?”.',
        moderate:
          '{name}, спросите: “я вижу всю картину или только витрину?”. Верните фокус на свой путь и один шаг.',
        hard: '{name}, не сравнивайте себя с чужой витриной. Сравните с собой вчера.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder06_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если ошибся, попробуй фразу: “я человек, и я учусь”. Ошибка — данные, а не приговор твоей ценности.',
        moderate:
          '{name}, ошибка не равна “со мной что-то не так”. Ошибка = “мне нужен другой способ”. Так ты остаёшься на своей стороне.',
        hard: '{name}, ошибка — не ты. Это данные. Исправляй и иди дальше.',
      },
      formal: {
        soft: '{name}, если ошиблись, попробуйте фразу: “я человек, и я учусь”. Ошибка — данные, а не приговор ценности.',
        moderate:
          '{name}, ошибка не равна “со мной что-то не так”. Ошибка = “нужен другой способ”. Оставайтесь на своей стороне.',
        hard: '{name}, ошибка — не вы. Это данные. Исправьте и идите дальше.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder07_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери один добрый жест к себе на 5 минут: вода, плед, душ, прогулка. Самоподдержка начинается с действий, не с лозунгов.',
        moderate:
          '{name}, 5 минут заботы о себе — это “я на своей стороне”. Маленькие действия укрепляют самооценку лучше больших обещаний.',
        hard: '{name}, 5 минут заботы. Делай. Это твоя опора.',
      },
      formal: {
        soft: '{name}, выберите один добрый жест к себе на 5 минут: вода, плед, душ, прогулка. Самоподдержка начинается с действий.',
        moderate:
          '{name}, 5 минут заботы о себе — это “я на своей стороне”. Маленькие действия укрепляют самооценку.',
        hard: '{name}, 5 минут заботы. Сделайте. Это ваша опора.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder08_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, замени “надо” на “я выбираю”. Даже если выбор маленький, он возвращает достоинство и ощущение авторства своей жизни.',
        moderate:
          '{name}, “я выбираю” вместо “я должен” снижает внутренний прессинг. Попробуй в одной фразе прямо сейчас.',
        hard: '{name}, убери “должен”. Скажи: “я выбираю”.',
      },
      formal: {
        soft: '{name}, замените “надо” на “я выбираю”. Даже маленький выбор возвращает достоинство и ощущение авторства жизни.',
        moderate:
          '{name}, “я выбираю” вместо “я должен” снижает внутреннее давление. Попробуйте в одной фразе сейчас.',
        hard: '{name}, уберите “должен”. Скажите: “я выбираю”.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder09_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, короткий чек: ты бы поддержал друга в такой ситуации? Скажи себе те же слова. Самосострадание — это навык, не слабость.',
        moderate:
          '{name}, попробуй говорить с собой как с человеком, которого ценишь. Это не “сладость”, а способ сохранять ресурс и устойчивость.',
        hard: '{name}, говори с собой нормально. Как с близким.',
      },
      formal: {
        soft: '{name}, короткий чек: вы бы поддержали друга? Скажите себе те же слова. Самосострадание — навык.',
        moderate:
          '{name}, попробуйте говорить с собой как с человеком, которого цените. Это способ сохранять ресурс и устойчивость.',
        hard: '{name}, говорите с собой уважительно. Как с близким.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder10_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, заметил “всё или ничего”? Найди третий вариант: “частично получилось”, “шаг уже сделан”. Серый цвет — признак зрелости.',
        moderate:
          '{name}, мышление “или идеально, или провал” — ловушка критика. Добавь шкалу 0–10 и оцени усилие честно.',
        hard: '{name}, хватит “всё/ничего”. Оцени по шкале и двигайся.',
      },
      formal: {
        soft: '{name}, заметили “всё или ничего”? Найдите третий вариант: “частично получилось”, “шаг уже сделан”. Это зрелый взгляд.',
        moderate:
          '{name}, мышление “или идеально, или провал” — ловушка критика. Добавьте шкалу 0–10 и оцените усилие.',
        hard: '{name}, хватит “всё/ничего”. Оцените по шкале и двигайтесь.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder11_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если стыдно — сделай паузу и назови чувство. Стыд любит молчание, а ясность делает его меньше.',
        moderate:
          '{name}, назови: “мне стыдно/мне больно”. И добавь: “я справлюсь”. Это не отменяет ответственности, но снимает самонаказание.',
        hard: '{name}, назови чувство. Стыд. И перестань добивать себя.',
      },
      formal: {
        soft: '{name}, если стыдно — сделайте паузу и назовите чувство. Стыд любит молчание, а ясность делает его меньше.',
        moderate:
          '{name}, назовите: “мне стыдно/мне больно”. И добавьте: “я справлюсь”. Это снижает самонаказание.',
        hard: '{name}, назовите чувство. Стыд. И перестаньте добивать себя.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder12_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй “похвала за процесс”: отметь усилие, а не результат. Самооценка крепнет, когда ты видишь свой труд, а не только итог.',
        moderate:
          '{name}, найди, что получилось сделать правильно в процессе. Даже если итог неидеален, навыки строятся из правильных шагов.',
        hard: '{name}, отметь усилие. Не только результат. Это важно.',
      },
      formal: {
        soft: '{name}, попробуйте “похвалу за процесс”: отметьте усилие, а не только результат. Самооценка крепнет так.',
        moderate:
          '{name}, найдите, что вы сделали правильно в процессе. Даже если итог неидеален, навыки строятся шагами.',
        hard: '{name}, отметьте усилие. Не только результат. Это важно.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder13_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, выбери одну ценность: забота, честность, рост. И спроси: “какой маленький шаг сейчас будет в её сторону?”. Это опора сильнее критики.',
        moderate:
          '{name}, самооценка растёт, когда ты живёшь по ценностям. Один маленький шаг сегодня важнее, чем тысяча обвинений.',
        hard: '{name}, шаг по ценности. Сейчас. И меньше самокритики.',
      },
      formal: {
        soft: '{name}, выберите одну ценность: забота, честность, рост. Спросите: “какой маленький шаг сейчас будет в её сторону?”.',
        moderate:
          '{name}, самооценка растёт, когда вы живёте по ценностям. Один шаг сегодня важнее обвинений.',
        hard: '{name}, шаг по ценности. Сейчас. И меньше самокритики.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder14_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мини-граница с критиком: “я не разговариваю с собой в таком тоне”. Повтори и переключись на действие: один маленький шаг.',
        moderate:
          '{name}, запрети оскорбления внутри. Оставь факты и шаги. Самоуважение начинается с тона, которым ты к себе обращаешься.',
        hard: '{name}, внутри без оскорблений. Факты и шаги. Всё.',
      },
      formal: {
        soft: '{name}, мини-граница с критиком: “я не разговариваю с собой в таком тоне”. Повторите и переключитесь на действие.',
        moderate:
          '{name}, запретите оскорбления внутри. Оставьте факты и шаги. Самоуважение начинается с тона к себе.',
        hard: '{name}, внутри без оскорблений. Факты и шаги. Всё.',
      },
    },
  },
  {
    id: 'psyselfesteemreminder15_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, финальный чек: “что я могу сделать для себя прямо сейчас на 10% лучше?”. Один маленький выбор — и ты уже на своей стороне.',
        moderate:
          '{name}, выбери улучшение на 10%: вода, пауза, письмо, шаг. Самооценка складывается из маленьких актов поддержки.',
        hard: '{name}, +10% заботы о себе. Выбери и сделай.',
      },
      formal: {
        soft: '{name}, финальный чек: “что я могу сделать для себя прямо сейчас на 10% лучше?”. Один выбор — и вы на своей стороне.',
        moderate:
          '{name}, выберите улучшение на 10%: вода, пауза, письмо, шаг. Самооценка строится актами поддержки.',
        hard: '{name}, +10% заботы о себе. Выберите и сделайте.',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psyselfesteeminfo01_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, самооценка — это не “самоуверенность”, а отношение к себе в трудности. Поддержка помогает учиться и действовать, критика часто парализует.',
        moderate:
          '{name}, жесткая самокритика редко улучшает результат. Она повышает стресс и снижает ресурс. Лучше работают факты, выводы и следующий шаг.',
        hard: '{name}, критика не мотивирует долго. Мотивируют ясные шаги и поддержка.',
      },
      formal: {
        soft: '{name}, самооценка — не “самоуверенность”, а отношение к себе в трудности. Поддержка помогает учиться и действовать.',
        moderate:
          '{name}, жесткая самокритика повышает стресс и снижает ресурс. Лучше работают факты, выводы и следующий шаг.',
        hard: '{name}, критика не мотивирует долго. Работают шаги и поддержка.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo02_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, внутренний критик часто “пугает”, чтобы защитить от ошибок и стыда. Но его стиль грубый. Можно оставить цель, сменив тон.',
        moderate:
          '{name}, критик пытается контролировать через давление. Это даёт краткий эффект, но ухудшает состояние. Полезнее — добрый и точный внутренний голос.',
        hard: '{name}, критик хочет защитить, но делает хуже. Меняй тон, оставляй цель.',
      },
      formal: {
        soft: '{name}, внутренний критик часто пытается защитить от ошибок и стыда. Можно оставить цель, но сменить тон на уважительный.',
        moderate:
          '{name}, критик контролирует через давление. Это ухудшает состояние. Полезнее — добрый и точный внутренний голос.',
        hard: '{name}, критик хочет защитить, но делает хуже. Меняйте тон.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo03_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, “я” и “мой результат” — разные вещи. Ошибка говорит о методе, не о твоей ценности. Это важное разделение для устойчивости.',
        moderate:
          '{name}, когда ты приравниваешь промах к “со мной что-то не так”, мотивация падает. Когда видишь “мне нужен другой способ”, появляется рост.',
        hard: '{name}, ты ≠ результат. Результат — данные, не приговор.',
      },
      formal: {
        soft: '{name}, “я” и “мой результат” — разные вещи. Ошибка говорит о методе, не о ценности. Это важно для устойчивости.',
        moderate:
          '{name}, приравнивание промаха к “со мной что-то не так” снижает мотивацию. Формулировка “нужен другой способ” запускает рост.',
        hard: '{name}, вы ≠ результат. Результат — данные, не приговор.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo04_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мозг склонен замечать недостатки сильнее успехов. Поэтому фиксация усилий и маленьких побед — не самообман, а коррекция перекоса.',
        moderate:
          '{name}, если отмечать только ошибки, картина становится несправедливой. Баланс = видеть и сильные стороны, и зоны роста.',
        hard: '{name}, мозг видит минусы ярче. Тренируй баланс, иначе критик победит.',
      },
      formal: {
        soft: '{name}, мозг замечает недостатки сильнее успехов. Поэтому фиксация усилий и маленьких побед — коррекция перекоса.',
        moderate:
          '{name}, если отмечать только ошибки, картина становится несправедливой. Баланс = видеть сильные стороны и зоны роста.',
        hard: '{name}, мозг видит минусы ярче. Тренируйте баланс.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo05_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, перфекционизм часто маскируется под “высокие стандарты”, но внутри там страх ошибки. “Достаточно хорошо” снижает стресс и даёт двигаться дальше.',
        moderate:
          '{name}, “идеально” часто значит “никогда”. Когда ты разрешаешь себе 70–80%, появляется завершение, а с ним и спокойнее отношение к себе.',
        hard: '{name}, идеальность парализует. Дай себе право на 70% и движение.',
      },
      formal: {
        soft: '{name}, перфекционизм часто маскируется под “высокие стандарты”, но внутри — страх ошибки. “Достаточно хорошо” снижает стресс.',
        moderate:
          '{name}, “идеально” часто означает “никогда”. При 70–80% появляется завершение и более спокойное отношение к себе.',
        hard: '{name}, идеальность парализует. Дайте себе право на 70% и движение.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo06_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, самоуважение растёт не от мыслей “я классный человек”, а от повторяющихся действий в свою пользу: границы, отдых, честность с собой.',
        moderate:
          '{name}, когда ты делаешь то, что для тебя важно, даже маленькими шагами, самооценка укрепляется естественно — через опыт, а не через лозунги.',
        hard: '{name}, хочешь уважать себя — действуй в свою пользу, не только думай.',
      },
      formal: {
        soft: '{name}, самоуважение растёт не от мыслей “я хороший”, а от действий в свою пользу: границы, отдых, честность с собой.',
        moderate:
          '{name}, когда вы делаете важные для себя шаги, самооценка укрепляется через опыт, а не через лозунги.',
        hard: '{name}, хотите уважать себя — действуйте в свою пользу, не только думайте.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo07_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, привычка ругать себя часто идёт из прошлого опыта: так с тобой разговаривали. Сейчас ты можешь выбрать другой внутренний тон.',
        moderate:
          '{name}, внутренний голос можно перенастроить. Это не мгновенный щелчок, а навык, который приходит через новые формулировки и действия.',
        hard: '{name}, прошлый голос внутри — не приговор. Его можно переписать.',
      },
      formal: {
        soft: '{name}, привычка самокритики часто идёт из прошлого опыта. Сейчас вы можете выбрать другой внутренний тон.',
        moderate:
          '{name}, внутренний голос можно перенастроить. Это навык, который формируется через новые формулировки и действия.',
        hard: '{name}, прошлый голос внутри — не приговор. Его можно переписать.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo08_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сравнение с другими почти всегда нечестно: ты видишь их результат, а свою “кухню”. Для самооценки полезнее сравнивать себя с собой.',
        moderate:
          '{name}, ориентация на чужие стандарты часто делает план невыполнимым. Свой темп и свои ограничения — важная часть честной оценки.',
        hard: '{name}, сравнивай свой путь с собой вчера, а не с чужой витриной.',
      },
      formal: {
        soft: '{name}, сравнение с другими редко бывает честным: вы видите их результат, а свою “кухню”. Полезнее сравнивать себя с собой.',
        moderate:
          '{name}, ориентация на чужие стандарты делает план невыполнимым. Учёт своих условий — часть здоровой самооценки.',
        hard: '{name}, сравнивайте свой путь с собой вчера, а не с чужой витриной.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo09_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, стыд заставляет прятаться и молчать. Но когда ты делишься с безопасным человеком, стыд обычно уменьшается, а не растёт.',
        moderate:
          '{name}, открытость в поддерживающих отношениях постепенно лечит ощущение “со мной что-то не так”. Опыт принятия переписывает старые убеждения.',
        hard: '{name}, стыд боится света. Безопасный разговор его ослабляет.',
      },
      formal: {
        soft: '{name}, стыд заставляет прятаться и молчать. Но в контакте с безопасным человеком он обычно уменьшается.',
        moderate:
          '{name}, опыт принятия в поддерживающих отношениях может переписать убеждение “со мной что-то не так”.',
        hard: '{name}, стыд боится света. Безопасный разговор его ослабляет.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo10_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, самооценка не должна зависеть только от продуктивности. Твоя ценность не только в том, сколько сделано, но и в том, кто ты есть.',
        moderate:
          '{name}, если мерить себя только результатами, любой спад превращается в “я ноль”. Добавь другие критерии: ценности, заботу, честность.',
        hard: '{name}, ты больше, чем список задач. Расширь критерии ценности.',
      },
      formal: {
        soft: '{name}, самооценка не должна зависеть только от продуктивности. Вы ценны не только результатами, но и тем, кто вы есть.',
        moderate:
          '{name}, если оценивать себя только по достижениям, любой спад превращается в “я ничто”. Добавьте другие критерии.',
        hard: '{name}, вы больше, чем список задач. Расширьте критерии ценности.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo11_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, самоуважение усиливается, когда твои действия совпадают с твоими ценностями. Даже если шаг маленький, внутри становится устойчивее.',
        moderate:
          '{name}, жить “против себя” долго не получается без цены. Жизнь по ценностям поддерживает ощущение смысла и собственной опоры.',
        hard: '{name}, согласованность с ценностями = прочная опора. Это важнее чужого одобрения.',
      },
      formal: {
        soft: '{name}, самоуважение усиливается, когда ваши действия совпадают с ценностями. Даже маленький шаг делает внутри устойчивее.',
        moderate:
          '{name}, жизнь “против себя” имеет высокую цену. Жизнь по ценностям поддерживает смысл и опору.',
        hard: '{name}, согласованность с ценностями — прочная опора. Это важнее чужого одобрения.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo12_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мягкий внутренний диалог не делает тебя слабым. Он создаёт условия, в которых легче пробовать, ошибаться и расти.',
        moderate:
          '{name}, исследования показывают: самосострадание связано с большей устойчивостью и мотивацией, а не с ленью. Поддержка эффективнее ругани.',
        hard: '{name}, добрый голос внутри — инструмент роста, а не слабость.',
      },
      formal: {
        soft: '{name}, мягкий внутренний диалог не делает вас слабыми. Он создаёт условия для проб, ошибок и роста.',
        moderate:
          '{name}, самосострадание связано с большей устойчивостью и мотивацией. Поддержка эффективнее саморугательства.',
        hard: '{name}, добрый внутренний голос — инструмент роста, не слабость.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo13_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ощущение “я недостаточно хорош” часто обобщает одну область на всю личность. Полезно разделять: где реально нужны навыки, а где уже всё ок.',
        moderate:
          '{name}, точная формулировка “я мало умею именно в этом” честнее, чем “я не ок”. Она даёт шанс учиться, а не только стыдиться.',
        hard: '{name}, меняй “я никакой” на “здесь мне не хватает навыка”. Это честнее.',
      },
      formal: {
        soft: '{name}, ощущение “я недостаточно хорош” часто обобщает одну область на всю личность. Полезно разделять, где нужны навыки.',
        moderate:
          '{name}, формулировка “мне не хватает опыта в этом” честнее, чем “я не ок”. Она даёт шанс учиться.',
        hard: '{name}, меняйте “я никакой” на “здесь не хватает навыка”. Это честнее.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo14_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, критика от других заходит глубже, когда внутри уже есть похожий голос. Усиление собственной поддержки снижает силу внешних ударов.',
        moderate:
          '{name}, если внутри появляется фраза “они правы, я не ок”, это повод усилить свой внутренний ресурс, а не добивать себя.',
        hard: '{name}, чужая критика легче переживается, когда внутри ты на своей стороне.',
      },
      formal: {
        soft: '{name}, внешняя критика ранит сильнее, если внутри есть похожий голос. Усиление самоподдержки снижает её силу.',
        moderate:
          '{name}, мысль “они правы, со мной что-то не так” — сигнал усилить внутренний ресурс, а не добивать себя.',
        hard: '{name}, чужая критика легче переносится, когда вы на своей стороне.',
      },
    },
  },
  {
    id: 'psyselfesteeminfo15_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если самокритика не отпускает и мешает жить, это не “каприз”, а повод обратиться за поддержкой. С этим не нужно справляться одному.',
        moderate:
          '{name}, работа с самооценкой — реальная задача для терапии. Постепенно можно выстроить более честный и тёплый взгляд на себя.',
        hard: '{name}, если критика внутри слишком громкая — обратись за помощью. Это нормальный шаг.',
      },
      formal: {
        soft: '{name}, если самокритика не отпускает и мешает жить, это повод обратиться за поддержкой. С этим не нужно быть одному.',
        moderate:
          '{name}, работа с самооценкой — реалистичная цель терапии. Можно выстроить более честный и тёплый взгляд на себя.',
        hard: '{name}, если внутренний критик слишком громкий — обратитесь за помощью. Это нормальный шаг.',
      },
    },
  },

  // --- MOTIVATIONAL (15) ---
  {
    id: 'psyselfesteemmotiv01_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня твоя задача — быть на своей стороне. Не идеалом, а поддержкой себе. Один мягкий шаг вместо саморугательства.',
        moderate:
          '{name}, выбери: обвинять себя или помочь себе. Поддержка даст сил сделать шаг, критика только выжмет остатки.',
        hard: '{name}, стань на свою сторону. Сейчас. Потом шаг.',
      },
      formal: {
        soft: '{name}, сегодня ваша задача — быть на своей стороне. Не идеальными, а поддерживающими. Один мягкий шаг вместо саморугательства.',
        moderate:
          '{name}, выберите: обвинять себя или помочь себе. Поддержка даёт силы двигаться.',
        hard: '{name}, станьте на свою сторону. Сейчас. Потом шаг.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv02_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты уже прошёл многое, с чем кто-то другой мог бы не справиться. Дай себе хотя бы маленькое признание за эту выносливость.',
        moderate:
          '{name}, вспомни три ситуации, где удалось выдержать сложное. Это не отменяет трудностей, но показывает: ты далеко не “ничто”.',
        hard: '{name}, у тебя есть доказательства силы. Вспомни их и опирайся.',
      },
      formal: {
        soft: '{name}, вы уже прошли многое, с чем кто-то другой мог бы не справиться. Отметьте свою выносливость.',
        moderate:
          '{name}, вспомните три ситуации, где вы выдержали сложное. Это доказательства вашей силы.',
        hard: '{name}, у вас есть доказательства силы. Вспомните их и опирайтесь.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv03_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, даже если внутренний голос суровый, ты можешь добавить к нему другой: тёплый и честный. Небольшие фразы уже меняют ощущение себя.',
        moderate:
          '{name}, начни с одной новой фразы: “мне трудно, но я стараюсь”. Повтори её несколько раз и посмотри, как меняется тон внутри.',
        hard: '{name}, добавь новый голос: честный и тёплый. Это твоя работа.',
      },
      formal: {
        soft: '{name}, даже если внутренний голос суров, вы можете добавить другой: тёплый и честный. Это меняет ощущение себя.',
        moderate:
          '{name}, начните с фразы: “мне трудно, но я стараюсь”. Повторите её несколько раз и отметьте изменение тона внутри.',
        hard: '{name}, добавьте новый голос: честный и тёплый. Это ваша работа.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv04_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно быть не идеалом и всё равно достойным уважения и заботы. Эти вещи не отменяют друг друга.',
        moderate:
          '{name}, не жди, пока станешь “лучшей версией”, чтобы относиться к себе по-человечески. Забота сейчас ускоряет рост.',
        hard: '{name}, относись к себе достойно уже сейчас, а не “когда стану лучше”.',
      },
      formal: {
        soft: '{name}, вы можете быть неидеальными и при этом достойными уважения и заботы. Эти вещи не противоречат.',
        moderate:
          '{name}, не ждите “лучшей версии”, чтобы относиться к себе по-человечески. Забота сейчас ускоряет рост.',
        hard: '{name}, относитесь к себе достойно уже сейчас, а не “когда стану лучше”.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv05_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, один маленький шаг сегодня важнее, чем идеальный план, который так и не начался. Выбери дело на 5–10 минут и сделай его.',
        moderate:
          '{name}, действие лечит чувство “я ничего не делаю”. Не замахивайся на огромный рывок, начни с посильного шага.',
        hard: '{name}, меньше планов — больше одного реального шага. Сейчас.',
      },
      formal: {
        soft: '{name}, один небольшой шаг важнее идеального плана без старта. Выберите дело на 5–10 минут и сделайте его.',
        moderate:
          '{name}, действие снижает ощущение “я ничего не делаю”. Начните с посильного шага.',
        hard: '{name}, меньше планов — больше одного реального шага. Сейчас.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv06_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право на свои чувства, даже если кто-то их не понимает. Твоя задача — относиться к себе не хуже, чем к другим.',
        moderate:
          '{name}, перестань обесценивать свои реакции фразами “ерунда, нельзя так чувствовать”. Можно. Важно — что ты с этим делаешь.',
        hard: '{name}, не отменяй свои чувства. Признай их и поддержи себя.',
      },
      formal: {
        soft: '{name}, вы имеете право на свои чувства, даже если кто-то их не понимает. Ваша задача — относиться к себе не хуже, чем к другим.',
        moderate:
          '{name}, обесценивание “ерунда, нельзя так чувствовать” не помогает. Признайте чувства и решайте, что сделать для себя.',
        hard: '{name}, не отменяйте свои чувства. Признайте их и поддержите себя.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv07_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно попробовать жить не из “мне недостаточно”, а из “я учусь”. Ошибка в такой позиции — не провал, а часть процесса.',
        moderate:
          '{name}, скажи себе: “я в процессе, а не на экзамене”. Это даёт больше воздуха и меньше страха “не дотянуть до идеала”.',
        hard: '{name}, ты не на экзамене, а в процессе. Живи так.',
      },
      formal: {
        soft: '{name}, сегодня можно попробовать жить не из “мне недостаточно”, а из “я учусь”. Ошибки становятся частью пути.',
        moderate:
          '{name}, скажите себе: “я в процессе, а не на экзамене”. Это снижает страх не дотянуть до идеала.',
        hard: '{name}, вы не на экзамене, а в процессе. Живите так.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv08_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай сегодня маленький шаг по ценности, а не по страху. Это может быть честность, забота, творчество — то, что важно именно тебе.',
        moderate:
          '{name}, когда ты выбираешь ценности, а не только избегание, внутри появляется ощущение: “я живу свою жизнь, а не только от чего-то бегу”.',
        hard: '{name}, один шаг по ценности сегодня. Это укрепит тебя больше, чем сто самоупрёков.',
      },
      formal: {
        soft: '{name}, сделайте сегодня маленький шаг по ценности, а не по страху. Это может быть честность, забота или творчество.',
        moderate:
          '{name}, выбор в пользу ценностей даёт ощущение “я живу свою жизнь”, а не только избегаю ошибок.',
        hard: '{name}, один шаг по ценности укрепит вас больше, чем сто самоупрёков.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv09_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твоя история не сводится к самым трудным моментам. В ней есть и сила, и забота, и выборы, которые уже сделаны в твою пользу.',
        moderate:
          '{name}, посмотри на свою жизнь как на целое, а не только на провалы. Там есть эпизоды, которыми ты можешь по праву гордиться.',
        hard: '{name}, ты больше, чем сумма ошибок. Замечай и сильные главы.',
      },
      formal: {
        soft: '{name}, ваша история не сводится к самым трудным моментам. В ней есть сила, забота и удачные выборы.',
        moderate:
          '{name}, смотрите на жизнь целиком, а не только на провалы. Там есть эпизоды, которыми можно гордиться.',
        hard: '{name}, вы больше, чем сумма ошибок. Замечайте сильные главы.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv10_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно быть одновременно и “не там, где хотел”, и достойным уважения. Эти состояния совместимы, и второе помогает менять первое.',
        moderate:
          '{name}, поддерживая себя, ты не “расслабляешься навсегда”, а создаёшь прочный фундамент для изменений. На обвинениях далеко не уехать.',
        hard: '{name}, уважай себя даже в точке старта. Так легче двигаться.',
      },
      formal: {
        soft: '{name}, можно быть одновременно “не там, где хотелось бы”, и достойными уважения. Это совместимо.',
        moderate:
          '{name}, самоподдержка создаёт фундамент для изменений. На обвинениях устойчивых перемен не построить.',
        hard: '{name}, уважайте себя даже в точке старта. Так легче двигаться.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv11_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно потренировать новое правило: “со мной нельзя говорить унизительно — даже себе”. Это важная внутренняя граница.',
        moderate:
          '{name}, когда ты останавливаешь унижающие фразы внутри, ты постепенно строишь другое отношение к себе. Это работа, но она окупается.',
        hard: '{name}, не позволяй себе унижать себя. Это твой новый стандарт.',
      },
      formal: {
        soft: '{name}, сегодня можно потренировать правило: “со мной нельзя говорить унизительно — даже себе”. Это внутренняя граница.',
        moderate:
          '{name}, останавливая унижающие фразы внутри, вы строите иное отношение к себе. Эта работа окупается.',
        hard: '{name}, не позволяйте себе унижать себя. Это ваш новый стандарт.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv12_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, каждое маленькое “я за себя” прибавляет по капле уверенности. Это не видно сразу, но через время становится твоей новой нормой.',
        moderate:
          '{name}, сегодня выбери один жест “я за себя”: сказать “нет”, попросить помощи, отдохнуть. Такие решения реально переписывают самооценку.',
        hard: '{name}, сделай один шаг “я за себя”. Это инвестиция в тебя.',
      },
      formal: {
        soft: '{name}, каждое маленькое “я за себя” добавляет уверенности. Эффект накапливается и становится нормой.',
        moderate:
          '{name}, выберите сегодня один жест “я за себя”: отказаться, попросить помощи, отдохнуть. Это переписывает самооценку.',
        hard: '{name}, сделайте один шаг “я за себя”. Это инвестиция в вас.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv13_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь не верить в себя на 100% и всё равно действовать. Уверенность часто догоняет после шагов, а не до них.',
        moderate:
          '{name}, не жди полного ощущения “я точно смогу”. Достаточно “я попробую, поддерживая себя”. Это уже другая позиция.',
        hard: '{name}, делай шаг и с сомнениями. Уверенность придёт по пути.',
      },
      formal: {
        soft: '{name}, вы можете не верить в себя на 100% и всё равно действовать. Уверенность часто приходит после шагов.',
        moderate:
          '{name}, не ждите ощущения “я точно смогу”. Достаточно “я попробую, поддерживая себя”.',
        hard: '{name}, действуйте даже с сомнениями. Уверенность придёт по пути.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv14_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно быть в процессе восстановления самооценки и при этом уже строить жизнь по-другому. Не обязательно ждать “полного ремонта”.',
        moderate:
          '{name}, начни менять жизнь параллельно с работой над отношением к себе. Маленькие внешние изменения подкрепляют внутренние.',
        hard: '{name}, не жди идеальной самооценки, чтобы жить. Делай шаги уже сейчас.',
      },
      formal: {
        soft: '{name}, можно восстанавливать самооценку и одновременно менять жизнь. Не обязательно ждать “полного ремонта”.',
        moderate:
          '{name}, меняйте жизнь параллельно работе над отношением к себе. Внешние шаги подкрепляют внутренние.',
        hard: '{name}, не ждите идеальной самооценки, чтобы жить. Делайте шаги сейчас.',
      },
    },
  },
  {
    id: 'psyselfesteemmotiv15_new',
    kind: 'therapy',
    entityKey: 'selfesteem',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня достаточно прибавить +10% доброты к себе. Не полностью изменить всё, а чуть снизить жесткость и сделать один шаг поддержки.',
        moderate:
          '{name}, спроси: “как выглядел бы вариант на 10% бережнее ко мне?”. Выбери его. Так и строится новая самооценка.',
        hard: '{name}, +10% бережности к себе. Выбери версию помягче и сделай.',
      },
      formal: {
        soft: '{name}, сегодня достаточно прибавить +10% доброты к себе. Чуть меньше жесткости и один шаг поддержки.',
        moderate:
          '{name}, спросите: “как выглядел бы вариант на 10% бережнее ко мне?”. Выберите его.',
        hard: '{name}, добавьте +10% бережности к себе. Выберите более мягкий вариант и действуйте.',
      },
    },
  },
  // =========================
  // RELATIONS - 45 templates [NEW]
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psyrelationsreminder01_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй Я‑сообщение: “я чувствую… когда… и мне важно…”. Так меньше обвинений и больше шанса быть услышанным.',
        moderate:
          '{name}, вместо “ты опять…” скажи “я злюсь/мне стало обидно, когда…, потому что мне важно…”. Формула мягче, но яснее.',
        hard: '{name}, говори “я чувствую…, когда…”, а не “ты всегда…”. Это про уважение.',
      },
      formal: {
        soft: '{name}, попробуйте Я‑сообщение: “я чувствую… когда… и мне важно…”. Так меньше обвинений и больше шансов быть услышанными.',
        moderate:
          '{name}, вместо “вы опять…” скажите “я злюсь/обиделась, когда…, потому что мне важно…”. Формулировка мягче и яснее.',
        hard: '{name}, говорите “я чувствую…, когда…”, а не “вы всегда…”. Это про уважение.',
      },
    },
  },
  {
    id: 'psyrelationsreminder02_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если разговор накаляется, можно сделать паузу: “я сейчас на эмоциях, давай продолжим позже”. Пауза бережёт и тебя, и контакт.',
        moderate:
          '{name}, когда голоса уже повышены, лучше остановиться. Пауза — не проигрыш, а шанс не сказать лишнего.',
        hard: '{name}, скажи: “стоп, мне нужна пауза”. И выйди из конфликта на время.',
      },
      formal: {
        soft: '{name}, если разговор накаляется, можно сказать: “я сейчас на эмоциях, давайте продолжим позже”. Пауза защищает контакт.',
        moderate:
          '{name}, когда разговор становится слишком горячим, остановка помогает не наговорить лишнего.',
        hard: '{name}, обозначьте: “стоп, мне нужна пауза”. Временно выйдите из конфликта.',
      },
    },
  },
  {
    id: 'psyrelationsreminder03_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, граница может звучать мягко: “со мной так нельзя, давай искать другой способ”. Это не агрессия, а забота о себе.',
        moderate:
          '{name}, скажи конкретно: “мне не ок такой тон/шутки, давай без этого”. Чёткая формулировка снижает недопонимание.',
        hard: '{name}, прямо скажи: “так со мной нельзя”. Ты имеешь право.',
      },
      formal: {
        soft: '{name}, граница может звучать мягко: “со мной так нельзя, давайте искать другой способ”. Это забота о себе и о контакте.',
        moderate:
          '{name}, обозначьте: “мне не подходит такой тон/такие шутки, давайте без этого”. Чётко и спокойно.',
        hard: '{name}, скажите: “так со мной нельзя”. Это ваше право.',
      },
    },
  },
  {
    id: 'psyrelationsreminder04_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, перед важным разговором сделай 3 спокойных выдоха. Спокойное тело помогает говорить яснее и не уйти в крик.',
        moderate:
          '{name}, 3–5 глубоких выдохов перед “тяжёлой темой” — как настройка. Так меньше шансов сорваться.',
        hard: '{name}, сначала выдохни, потом говори. Иначе будет только срыв.',
      },
      formal: {
        soft: '{name}, перед важным разговором сделайте 3 спокойных выдоха. Это помогает сохранить ясность.',
        moderate:
          '{name}, 3–5 медленных выдохов перед сложной темой снижают риск срыва.',
        hard: '{name}, сначала выдохните, затем говорите. Это важно.',
      },
    },
  },
  {
    id: 'psyrelationsreminder05_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй спросить партнёра: “как ты это видишь?”. Иногда искренний интерес снижает оборону и открывает диалог.',
        moderate:
          '{name}, добавь в разговор один вопрос, а не только аргументы: “что для тебя сейчас важно?”. Это укрепляет контакт.',
        hard: '{name}, не только говори — спроси: “как ты на это смотришь?”.',
      },
      formal: {
        soft: '{name}, спросите у другого: “как вы это видите?”. Интерес к его позиции снижает напряжение.',
        moderate:
          '{name}, добавьте вопрос “что для вас важно в этой ситуации?”. Это улучшает понимание.',
        hard: '{name}, не только говорите — спросите: “как вы на это смотрите?”.',
      },
    },
  },
  {
    id: 'psyrelationsreminder06_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если боишься обидеть, начни с признания: “мне важно наши отношения, поэтому хочу обсудить одну вещь…”. Это создаёт опору для разговора.',
        moderate:
          '{name}, формула “мне важен ты/вы, и поэтому мне важно сказать…” помогает сочетать честность и заботу.',
        hard: '{name}, начни с “мне важны наши отношения, поэтому скажу честно…”.',
      },
      formal: {
        soft: '{name}, если вы боитесь обидеть, начните так: “мне важны наши отношения, поэтому хочу обсудить одну тему…”.',
        moderate:
          '{name}, фраза “мне важны вы и наш контакт, поэтому мне важно сказать…” соединяет честность и заботу.',
        hard: '{name}, начните: “мне важны наши отношения, поэтому скажу честно…”.',
      },
    },
  },
  {
    id: 'psyrelationsreminder07_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если не готов сразу отвечать, честно скажи: “мне нужно время подумать, вернусь к этому позже”. Это тоже граница.',
        moderate:
          '{name}, тебе не обязательно моментально выдавать ответ. Дай себе паузу, а другому — честную рамку по времени.',
        hard: '{name}, скажи: “я подумаю и отвечу позже”, вместо того чтобы молча исчезать.',
      },
      formal: {
        soft: '{name}, если вы не готовы ответить, скажите: “мне нужно время подумать, я вернусь к этому вопросу позже”.',
        moderate:
          '{name}, мгновенный ответ не обязателен. Обозначьте паузу и срок, когда вернётесь к теме.',
        hard: '{name}, скажите: “я подумаю и отвечу позже”, а не исчезайте молча.',
      },
    },
  },
  {
    id: 'psyrelationsreminder08_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, напоминание: говорить “нет” можно мягко. Например: “я не могу сейчас, но могу вот так/вот тогда”.',
        moderate:
          '{name}, чёткое “нет” с коротким объяснением уважительнее, чем согласиться и злиться. Ты имеешь право отказывать.',
        hard: '{name}, если не хочешь/не можешь — скажи “нет”. Это нормально.',
      },
      formal: {
        soft: '{name}, “нет” можно говорить мягко: “я не могу сейчас, но могу так/позже”.',
        moderate:
          '{name}, чёткий отказ с объяснением уважительнее, чем согласие “через силу”. У вас есть право отказывать.',
        hard: '{name}, если вы не хотите или не можете — допустимо сказать “нет”.',
      },
    },
  },
  {
    id: 'psyrelationsreminder09_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй сначала перефразировать другого: “я правильно понял, что…?”. Это снижает недопонимание в конфликте.',
        moderate:
          '{name}, коротко повтори смысл: “то есть тебе важно…, верно?”. Так человек чувствует, что его слушают.',
        hard: '{name}, уточни: “я правильно тебя услышал, что…?”.',
      },
      formal: {
        soft: '{name}, перефразируйте собеседника: “я правильно понял, что…?”. Это уменьшает риск недопонимания.',
        moderate:
          '{name}, отражение смысла (“вам важно…, верно?”) помогает человеку чувствовать, что его слышат.',
        hard: '{name}, уточните: “я правильно вас услышал, что…?”.',
      },
    },
  },
  {
    id: 'psyrelationsreminder10_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если разговор становится жёстким, смягчи голос и темп речи. Даже 10% тише помогают снизить накал.',
        moderate:
          '{name}, говори медленнее и тише — это не слабость, а управление ситуацией. Так легче оставаться в уважении.',
        hard: '{name}, замедлись и убавь громкость. Не подливай огонь.',
      },
      formal: {
        soft: '{name}, если разговор становится жёстким, чуть замедлите речь и снизьте тон. Это помогает снизить напряжение.',
        moderate:
          '{name}, более медленный и спокойный голос — способ управлять накалом, а не уступать.',
        hard: '{name}, замедлите речь и снизьте громкость. Так вы не усилите конфликт.',
      },
    },
  },
  {
    id: 'psyrelationsreminder11_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, перед тем как писать длинное сообщение в эмоциях, сделай паузу и перечитай. Может, часть лучше убрать или смягчить.',
        moderate:
          '{name}, не отправляй то, что писалось “на взлёте”. Дай себе 5 минут и второй взгляд на текст.',
        hard: '{name}, не жми “отправить” сразу. Передохни и перечитай.',
      },
      formal: {
        soft: '{name}, перед отправкой эмоционального сообщения сделайте паузу и перечитайте текст.',
        moderate:
          '{name}, дайте себе 5 минут, а затем ещё раз посмотрите, всё ли вы хотите отправить в таком виде.',
        hard: '{name}, не отправляйте написанное на пике эмоций. Перечитайте после паузы.',
      },
    },
  },
  {
    id: 'psyrelationsreminder12_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, важно напоминание: твоё “чувствовать по‑своему” не нуждается в разрешении других. Твоя внутренняя реальность тоже важна.',
        moderate:
          '{name}, даже если кто‑то говорит “не драматизируй”, твои чувства всё равно реальны. Вопрос — как с ними обходиться.',
        hard: '{name}, твои чувства легитимны, даже если их не одобряют.',
      },
      formal: {
        soft: '{name}, ваши чувства не нуждаются в чьём‑то разрешении. Ваша внутренняя реальность важна.',
        moderate:
          '{name}, даже если окружающие обесценивают ваши реакции, они остаются реальными. Важно, как вы с ними обращаетесь.',
        hard: '{name}, ваши чувства легитимны, даже если их не одобряют.',
      },
    },
  },
  {
    id: 'psyrelationsreminder13_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если разговор зашёл в тупик, можно переключиться с “кто прав” на “что нам обоим важно сейчас”. Это меняет траекторию.',
        moderate:
          '{name}, задай вопрос: “давай попробуем найти решение, которое нас обоих устроит?”. Так вы становитесь в одну команду против проблемы.',
        hard: '{name}, меньше спора “кто прав”, больше фокуса “что нам нужно решить”.',
      },
      formal: {
        soft: '{name}, если спор заходит в тупик, попробуйте перейти от вопроса “кто прав” к вопросу “что нам обоим важно сейчас”.',
        moderate:
          '{name}, фраза “давайте искать решение, которое устроит нас обоих” помогает стать в одну команду против проблемы.',
        hard: '{name}, меньше спора “кто прав”, больше внимания к тому, “что решить”.',
      },
    },
  },
  {
    id: 'psyrelationsreminder14_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, напомни себе: ты отвечаешь за свои слова и поведение, но не за настроение другого. Это снимает лишнюю вину.',
        moderate:
          '{name}, делай свою часть — говорить честно и уважительно. Реакция другого уже не полностью в твоей власти.',
        hard: '{name}, твоя зона ответственности — твои действия, не чужие эмоции.',
      },
      formal: {
        soft: '{name}, вы отвечаете за свои слова и поведение, но не за каждую эмоцию другого человека.',
        moderate:
          '{name}, ваша задача — говорить честно и уважительно. Реакция другого не полностью под вашим контролем.',
        hard: '{name}, ваша ответственность — ваши действия, а не чужие чувства.',
      },
    },
  },
  {
    id: 'psyrelationsreminder15_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, перед разговором спроси себя: “что я хочу в итоге — близости, ясности, защиты границ?”. Ответ поможет выбрать тон.',
        moderate:
          '{name}, если цель — сохранить контакт, выбирай слова, которые не уничтожают, а проясняют. Границы тоже можно ставить по‑человечески.',
        hard: '{name}, помни цель: не победить, а решить и сохранить уважение.',
      },
      formal: {
        soft: '{name}, перед беседой спросите себя: “чего я хочу в результате — близости, ясности, защиты границ?”.',
        moderate:
          '{name}, если цель — сохранить контакт, выбирайте формулировки, которые проясняют, а не разрушают.',
        hard: '{name}, держите в фокусе цель — решение и уважение, а не “победа любой ценой”.',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psyrelationsinfo01_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, Я‑сообщения помогают говорить о себе, а не нападать. Формула простая: чувство — ситуация — твоя потребность.',
        moderate:
          '{name}, “я расстраиваюсь, когда сообщения игнорируются, потому что контакт для меня важен” звучит мягче и понятнее, чем “ты меня постоянно игнорируешь”.',
        hard: '{name}, Я‑сообщения снижают оборону у другого и повышают шанс диалога.',
      },
      formal: {
        soft: '{name}, Я‑сообщения позволяют говорить о своих чувствах и потребностях без нападения.',
        moderate:
          '{name}, формула “я чувствую…, когда…, потому что мне важно…” звучит мягче и понятнее, чем прямое обвинение.',
        hard: '{name}, Я‑сообщения уменьшают защитную реакцию и облегчают диалог.',
      },
    },
  },
  {
    id: 'psyrelationsinfo02_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, границы — это не стена, а линия “что мне ок, а что нет”. Они защищают твоё здоровье и при этом могут звучать мягко.',
        moderate:
          '{name}, когда границ нет, копится раздражение и усталость. Когда они появляются, отношения становятся понятнее и честнее.',
        hard: '{name}, право на границы есть у всех, не только у “очень смелых”.',
      },
      formal: {
        soft: '{name}, границы — это понимание, что для вас приемлемо, а что нет. Они защищают ваше состояние.',
        moderate:
          '{name}, отсутствие границ ведёт к накоплению обиды и выгорания. Чёткие границы делают отношения яснее.',
        hard: '{name}, право на личные границы есть у каждого человека.',
      },
    },
  },
  {
    id: 'psyrelationsinfo03_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, конфликт сам по себе не признак “плохих” отношений. Важно не отсутствие конфликтов, а то, как вы с ними обходитесь.',
        moderate:
          '{name}, возможность говорить о сложном и при этом оставаться в уважении — более надёжный показатель близости, чем постоянное согласие.',
        hard: '{name}, здоровые отношения выдерживают честные разговоры и конфликты.',
      },
      formal: {
        soft: '{name}, наличие конфликтов не делает отношения “плохими”. Важен способ их проживания.',
        moderate:
          '{name}, способность обсуждать сложные темы, сохраняя уважение, — важный признак близости.',
        hard: '{name}, здоровые отношения выдерживают честные конфликты.',
      },
    },
  },
  {
    id: 'psyrelationsinfo04_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, когда мы говорим через обвинения, другой чаще слышит не боль, а атаку. Поэтому он защищается, а не сближается.',
        moderate:
          '{name}, смена “ты всегда/никогда” на “я чувствую/я хочу” помогает перевести разговор из режима обороны в режим диалога.',
        hard: '{name}, обвинения включают защиту, а не эмпатию. Формулировки важны.',
      },
      formal: {
        soft: '{name}, обвинительные фразы чаще вызывают защиту, чем сочувствие. Тогда человек не слышит вашу боль.',
        moderate:
          '{name}, переход от “вы всегда/никогда” к “я чувствую/я бы хотел” переводит разговор в более конструктивный формат.',
        hard: '{name}, обвинения включают защиту, а не эмпатию. Формулировки имеют значение.',
      },
    },
  },
  {
    id: 'psyrelationsinfo05_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, право сказать “нет” не делает тебя эгоистом(кой). Это способ заботиться о себе и не копить скрытую злость.',
        moderate:
          '{name}, постоянное “да” при внутреннем “нет” ведёт к выгоранию и пассивной агрессии. Честный отказ честнее для всех.',
        hard: '{name}, отказ — часть здоровых отношений, а не предательство.',
      },
      formal: {
        soft: '{name}, право на отказ — часть уважения к себе, а не проявление эгоизма.',
        moderate:
          '{name}, постоянное согласие “через силу” часто приводит к выгоранию и скрытой агрессии. Честный отказ полезнее.',
        hard: '{name}, отказ — нормальная часть здоровых отношений.',
      },
    },
  },
  {
    id: 'psyrelationsinfo06_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, слушать — это не то же самое, что соглашаться. Ты можешь признавать чувства другого и при этом иметь своё мнение и границы.',
        moderate:
          '{name}, фраза “я тебя слышу, и в то же время для меня важно…” соединяет эмпатию и уважение к себе.',
        hard: '{name}, можно слышать другого и всё равно оставаться при своём.',
      },
      formal: {
        soft: '{name}, слушать и признавать чувства другого не означает автоматически соглашаться.',
        moderate:
          '{name}, формулировка “я вас слышу, и в то же время для меня важно…” сочетает эмпатию и собственную позицию.',
        hard: '{name}, вы можете признавать эмоции другого и при этом сохранять свои границы.',
      },
    },
  },
  {
    id: 'psyrelationsinfo07_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ощущение “я всегда виноват” часто связано с прошлым опытом. В реальных взрослых отношениях ответственность обычно делится.',
        moderate:
          '{name}, полезно различать: где твоя часть ответственности, а где зона другого человека. Это снижает лишнюю вину.',
        hard: '{name}, не вся ответственность в конфликте на тебе. Там двое.',
      },
      formal: {
        soft: '{name}, устойчивое чувство тотальной вины нередко связано с прошлым опытом, а не с реальной ситуацией.',
        moderate:
          '{name}, важно разделять, где ваша доля ответственности, а где зона другого человека.',
        hard: '{name}, конфликт редко бывает полностью “виной” одного человека.',
      },
    },
  },
  {
    id: 'psyrelationsinfo08_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, когда ты говоришь о себе конкретно (“я злюсь/мне страшно/я нуждаюсь”), другому проще понять, что именно происходит.',
        moderate:
          '{name}, общие формулировки “всё плохо/ты меня не ценишь” вызывают защиту. Конкретика (“мне стало неприятно, когда…”) делает разговор яснее.',
        hard: '{name}, чем конкретнее ты, тем меньше недопониманий.',
      },
      formal: {
        soft: '{name}, конкретные описания своих чувств и ситуаций помогают другому лучше вас понимать.',
        moderate:
          '{name}, общие обвинения усиливают защиту, а конкретные примеры делают разговор предметным.',
        hard: '{name}, конкретика снижает риск недопонимания и конфликта.',
      },
    },
  },
  {
    id: 'psyrelationsinfo09_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не каждый человек готов измениться, даже если ты очень стараешься. Это больно, но важно помнить: изменение — зона ответственности каждого.',
        moderate:
          '{name}, ты можешь влиять на формат общения, но не можешь в одиночку “починить” отношения. Нужны усилия с обеих сторон.',
        hard: '{name}, не нужно вытягивать отношения в одиночку.',
      },
      formal: {
        soft: '{name}, не каждый партнёр готов меняться, даже если вы много вкладываетесь. Изменение — ответственность обоих.',
        moderate:
          '{name}, вы можете менять свою часть взаимодействия, но не можете в одиночку “починить” отношения.',
        hard: '{name}, вы не обязаны спасать отношения в одиночку.',
      },
    },
  },
  {
    id: 'psyrelationsinfo10_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, дистанция в отношениях иногда необходима, чтобы сохранить себя. Пауза — это тоже форма заботы, а не всегда “конец”.',
        moderate:
          '{name}, временное уменьшение контакта может помочь увидеть ситуацию яснее и снизить накал эмоций.',
        hard: '{name}, иногда лучше немного отойти, чем продолжать разрушать друг друга.',
      },
      formal: {
        soft: '{name}, небольшая дистанция в отношениях может быть способом сохранить себя, а не обязательно разрывом.',
        moderate:
          '{name}, временное снижение контакта помогает снизить накал и лучше понять, что вы хотите дальше.',
        hard: '{name}, иногда важнее немного отдалиться, чем усиливать взаимные раны.',
      },
    },
  },
  {
    id: 'psyrelationsinfo11_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, способность извиниться не делает тебя слабым. Она делает связь живой: признавая свою часть, ты укрепляешь доверие.',
        moderate:
          '{name}, “мне жаль, что я так сказал” — мощная фраза, если за ней стоит искренность и готовность что‑то поменять.',
        hard: '{name}, извинения при ответственности — это сила, а не слабость.',
      },
      formal: {
        soft: '{name}, умение признавать свои ошибки и извиняться укрепляет доверие в отношениях.',
        moderate:
          '{name}, искреннее “мне жаль, что я так сказал” работает, когда за ним стоит готовность к изменениям.',
        hard: '{name}, извинения при реальной ответственности — проявление силы, а не слабости.',
      },
    },
  },
  {
    id: 'psyrelationsinfo12_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, поддерживающие отношения — это не только про “любовь”, но и про уважение, любопытство к миру другого и способность договариваться.',
        moderate:
          '{name}, важно смотреть не только на чувства, но и на то, как вы решаете бытовые и эмоциональные задачи вместе.',
        hard: '{name}, любовь без уважения и договорённостей быстро истощается.',
      },
      formal: {
        soft: '{name}, поддерживающие отношения строятся на уважении, интересе к опыту другого и способности договариваться.',
        moderate:
          '{name}, помимо чувств, имеет значение, как вы решаете практические и эмоциональные задачи вместе.',
        hard: '{name}, одних чувств недостаточно без уважения и договорённостей.',
      },
    },
  },
  {
    id: 'psyrelationsinfo13_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, чувство одиночества в отношениях может быть сигналом, что твои важные темы, желания или границы не замечают.',
        moderate:
          '{name}, вместо того чтобы молча терпеть одиночество рядом с другим, можно пробовать говорить о том, чего тебе не хватает.',
        hard: '{name}, если в отношениях одиноко, это повод не обвинять себя, а посмотреть, чего тебе недодают.',
      },
      formal: {
        soft: '{name}, ощущение одиночества в отношениях часто говорит о том, что ваши потребности и границы не замечают.',
        moderate:
          '{name}, важно не только терпеть, но и говорить о том, чего вам не хватает в контакте.',
        hard: '{name}, одиночество в отношениях — сигнал к пересмотру, а не повод винить себя.',
      },
    },
  },
  {
    id: 'psyrelationsinfo14_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твоё чувство самоценности влияет на выбор партнёров и готовность терпеть неприемлемое. Чем выше внутренняя опора, тем здоровее границы.',
        moderate:
          '{name}, работа над отношениями с собой — это одновременно работа над качеством всех других отношений.',
        hard: '{name}, чем больше ты ценишь себя, тем меньше соглашаешься на разрушительное.',
      },
      formal: {
        soft: '{name}, уровень вашей самоценности влияет на выбор партнёров и готовность терпеть неприемлемое.',
        moderate:
          '{name}, укрепляя отношение к себе, вы косвенно улучшаете качество всех других отношений.',
        hard: '{name}, чем больше вы цените себя, тем меньше соглашаетесь на разрушительные сценарии.',
      },
    },
  },
  {
    id: 'psyrelationsinfo15_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если ты постоянно оказываешься в похожих болезненных сценариях, это не приговор, а точка, с которой можно начать менять свои привычные роли.',
        moderate:
          '{name}, повторяющиеся паттерны в отношениях — хороший материал для работы с психологом: они часто идут из старого опыта.',
        hard: '{name}, заметить свой сценарий — первый шаг к тому, чтобы выйти из него.',
      },
      formal: {
        soft: '{name}, повторяющиеся болезненные сценарии в отношениях — не приговор, а ориентир, где можно начать изменения.',
        moderate:
          '{name}, такие паттерны часто связаны с прошлым опытом и могут быть темой для психотерапии.',
        hard: '{name}, осознание своего сценария — первый шаг к его изменению.',
      },
    },
  },

  // --- MOTIVATIONAL (15) ---
  {
    id: 'psyrelationsmotiv01_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня достаточно одного чуть более честного и тёплого предложения в разговоре. Не надо идеала, нужен маленький шаг.',
        moderate:
          '{name}, попробуй в одной ситуации выбрать Я‑сообщение вместо обвинения. Это уже смена паттерна.',
        hard: '{name}, поменяй хотя бы одну фразу на “я чувствую/мне важно”. Это движение.',
      },
      formal: {
        soft: '{name}, сегодня достаточно одного более честного и бережного высказывания. Маленький шаг уже ценен.',
        moderate:
          '{name}, в одной ситуации выберите Я‑сообщение вместо обвинения. Это уже изменение привычки.',
        hard: '{name}, замените хотя бы одну фразу на “я чувствую/мне важно”. Это шаг вперёд.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv02_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь защищать свои границы и при этом сохранять теплоту. Твёрдость и мягкость вполне совместимы.',
        moderate:
          '{name}, каждое спокойное “мне так не подходит” строит новый образ себя в отношениях — не удобного, а живого.',
        hard: '{name}, скажи честно, как тебе, и при этом оставайся уважительным. Это тебе по силам.',
      },
      formal: {
        soft: '{name}, вы можете защищать свои границы и оставаться тёплыми. Твёрдость и мягкость совместимы.',
        moderate:
          '{name}, каждое спокойное “мне так не подходит” укрепляет ваш новый образ в отношениях.',
        hard: '{name}, говорите честно и уважительно. Вы способны сочетать это.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv03_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право выбирать, с кем и как быть рядом. Это не эгоизм, а взрослая позиция.',
        moderate:
          '{name}, если рядом с кем‑то тебе постоянно больно и страшно, твоя задача — не только терпеть, но и думать, что ты можешь для себя сделать.',
        hard: '{name}, не нужно оставаться там, где тебя систематически ранят.',
      },
      formal: {
        soft: '{name}, вы имеете право выбирать формат и близость отношений. Это часть взрослой ответственности за себя.',
        moderate:
          '{name}, если рядом с кем‑то вам слишком больно, важно думать не только о терпении, но и о шагах в свою защиту.',
        hard: '{name}, вы не обязаны оставаться в отношениях, которые систематически вас ранят.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv04_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, отношения — это навык, а не врождённый талант. Ты вправе учиться говорить, слушать и ставить границы постепенно.',
        moderate:
          '{name}, ошибки в разговорах не делают тебя “плохим партнёром”. Они показывают, где есть пространство для роста.',
        hard: '{name}, ты можешь учиться близости и границам. Это не “поломка”, а процесс.',
      },
      formal: {
        soft: '{name}, навыки общения и близости можно развивать. Это не врождённый “талант избранных”.',
        moderate:
          '{name}, ошибки в разговорах — не приговор, а ориентир для развития.',
        hard: '{name}, вы можете учиться близости и границам. Это процесс, а не поломка.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv05_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно выбрать одну маленькую заботу о себе в отношениях: вовремя уйти, мягко сказать “нет” или честно озвучить, что тебе важно.',
        moderate:
          '{name}, каждый такой шаг — кирпичик в дом, где тебе безопаснее. Даже если кажется мелочью, это вклад.',
        hard: '{name}, сделай сегодня один шаг “за себя” в общении. Это важно.',
      },
      formal: {
        soft: '{name}, выберите сегодня один жест заботы о себе в отношениях: мягкий отказ, честное сообщение, уважение к своему времени.',
        moderate:
          '{name}, каждый такой шаг — вклад в более безопасное пространство для вас.',
        hard: '{name}, сделайте один конкретный шаг “за себя” в общении. Это важно.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv06_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь одновременно ценить отношения и при этом не соглашаться на всё. Настоящая близость выдерживает “нет”.',
        moderate:
          '{name}, если связь разрушается от одного “нет”, это больше похоже на контроль, чем на любовь.',
        hard: '{name}, твой отказ не обязан разрушать любовь. Если разрушает — это сигнал.',
      },
      formal: {
        soft: '{name}, вы можете ценить отношения и при этом не соглашаться на всё. Близость выдерживает “нет”.',
        moderate:
          '{name}, если связь не выдерживает отказа, это похоже скорее на контроль, чем на поддержку.',
        hard: '{name}, если одно “нет” разрушает отношения, это важный сигнал для вас.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv07_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно быть идеальным партнёром. Достаточно быть живым человеком, который готов замечать и исправлять ошибки.',
        moderate:
          '{name}, вместо гонки за идеалом выбери курс на честность и уважение. Это реальнее и надёжнее для отношений.',
        hard: '{name}, убери планку “идеал”. Будь честным и уважительным — этого много.',
      },
      formal: {
        soft: '{name}, вам не нужно быть идеальным партнёром. Важно быть живым человеком, готовым учиться.',
        moderate:
          '{name}, курс на честность и уважение полезнее, чем стремление к идеальному образу.',
        hard: '{name}, отпустите планку “идеал”. Честность и уважение уже многое дают.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv08_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право на поддержку, а не только на критику в свой адрес. В отношениях можно просить о помощи и тепле.',
        moderate:
          '{name}, попробуй сформулировать одну простую просьбу к близкому: “мне бы очень помогло, если ты…”. Это не слабость.',
        hard: '{name}, попросить о поддержке — не значит быть “обузой”. Это человеческая потребность.',
      },
      formal: {
        soft: '{name}, вы имеете право на поддержку, а не только на критику. Просьбы о помощи — нормальная часть близости.',
        moderate:
          '{name}, сформулируйте одну конкретную просьбу: “мне помогло бы, если вы…”. Это не проявление слабости.',
        hard: '{name}, просьба о поддержке — естественная часть отношений, а не “нагрузка”.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv09_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твой голос в отношениях имеет значение. Даже если раньше было много молчания, сейчас можно по чуть‑чуть начинать звучать.',
        moderate:
          '{name}, начни с одной фразы про себя: “для меня важно…”, “мне больно, когда…”. Так ты заявляешь о своём присутствии.',
        hard: '{name}, набирай свой голос. С одного предложения — но уже сегодня.',
      },
      formal: {
        soft: '{name}, ваш голос в отношениях важен. Даже если раньше вы чаще молчали, теперь можно постепенно проявляться.',
        moderate:
          '{name}, начните с одной фразы о себе: “для меня важно…”, “мне больно, когда…”.',
        hard: '{name}, заявите о себе хотя бы одним предложением уже сегодня.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv10_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, даже один по‑другому прожитый конфликт — это уже новый опыт для вас обоих. Не обесценивай маленькие изменения.',
        moderate:
          '{name}, если сегодня удалось смягчить тон, обозначить границу или вовремя взять паузу — это шаг, который формирует новый сценарий.',
        hard: '{name}, считай не только ссоры, но и моменты, где получилось сделать по‑новому. Это прогресс.',
      },
      formal: {
        soft: '{name}, один по‑новому прожитый конфликт — уже ценный опыт для отношений.',
        moderate:
          '{name}, если вы сегодня смягчили тон, обозначили границу или взяли паузу, это шаг к новому сценарию.',
        hard: '{name}, замечайте моменты, где вы действуете иначе. Это и есть прогресс.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv11_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, фраза “я достоин уважения” — важный внутренний ориентир. Она помогает не соглашаться на унижение, даже если страшно.',
        moderate:
          '{name}, повтори для себя: “со мной можно говорить по‑человечески”. И действуй так, будто это правда.',
        hard: '{name}, со тобой нельзя обращаться плохо. Даже если раньше это терпелось.',
      },
      formal: {
        soft: '{name}, внутреннее ощущение “я достоин уважения” помогает выстраивать более здоровые отношения.',
        moderate:
          '{name}, напомните себе: “со мной можно говорить по‑человечески”. Вы имеете право опираться на это.',
        hard: '{name}, с вами нельзя обращаться унизительно. Даже если раньше вы это терпели.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv12_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно учиться отделять человека от его поведения: “ты мне важен, но вот это мне не подходит”. Это делает разговор чище.',
        moderate:
          '{name}, такая позиция помогает не рушить всё целиком, а работать с конкретными моментами, которые болят.',
        hard: '{name}, разделяй: человек ценен, а поведение можно обсуждать и менять.',
      },
      formal: {
        soft: '{name}, полезно различать человека и его поведение: “вы мне важны, но вот это мне не подходит”.',
        moderate:
          '{name}, это позволяет сохранять ценность связи и при этом обсуждать сложные моменты.',
        hard: '{name}, разделяйте: человек ценен, а поведение может быть темой изменений.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv13_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь искать тех, с кем рядом спокойно и можно быть собой. Это не каприз, а базовая потребность близости.',
        moderate:
          '{name}, если сейчас вокруг мало таких людей, это не значит, что их нет. Ты уже делаешь шаг, замечая, что тебе нужно.',
        hard: '{name}, ты имеешь право на людей, с которыми можно быть живым, а не только удобным.',
      },
      formal: {
        soft: '{name}, искать отношения, где можно быть собой и чувствовать спокойствие, — нормальная потребность.',
        moderate:
          '{name}, даже если сейчас таких людей мало, ваш поиск и осознание своих нужд — уже шаг к изменениям.',
        hard: '{name}, вы имеете право на отношения, где вы живой человек, а не только удобная роль.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv14_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если сейчас в отношениях сложно, это не отменяет твоей ценности. Сложности — про систему взаимодействий, а не про “со мной что-то не так”.',
        moderate:
          '{name}, смотри на ситуацию шире: есть твои шаги, шаги другого и общий контекст. Ты — не только свои ошибки.',
        hard: '{name}, проблемы в отношениях не делают тебя “не тем”.',
      },
      formal: {
        soft: '{name}, трудности в отношениях не отменяют вашей ценности как человека.',
        moderate:
          '{name}, важно видеть систему: ваши шаги, шаги другого и контекст, а не сводить всё к “со мной что-то не так”.',
        hard: '{name}, проблемы в отношениях не означают, что с вами “что‑то не так”.',
      },
    },
  },
  {
    id: 'psyrelationsmotiv15_new',
    kind: 'therapy',
    entityKey: 'relations',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня достаточно +10% внимания к себе в отношениях: чуть яснее сказать, чуть раньше поставить границу, чуть мягче поддержать себя после разговора.',
        moderate:
          '{name}, не обязательно всё перестраивать сразу. Маленькие изменения, повторённые много раз, создают новый стиль общения.',
        hard: '{name}, +10% ясности и заботы о себе в контактах — уже большой шаг. Начни сегодня.',
      },
      formal: {
        soft: '{name}, сегодня достаточно добавить +10% внимания к себе в отношениях: немного больше ясности и заботы.',
        moderate:
          '{name}, небольшие изменения, которые вы повторяете, постепенно формируют новый стиль общения.',
        hard: '{name}, добавьте +10% ясности и заботы о себе в контактах — начните уже сегодня.',
      },
    },
  },
  // =========================
  // GRIEF - 45 templates [NEW]
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psygriefreminder01_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай сейчас мягкий выдох и отметь: “со мной случилось тяжёлое”. Твои чувства не каприз, а реакция на утрату.',
        moderate:
          '{name}, на секунду остановись и просто признай: “мне правда очень больно”. Не нужно держаться из последних сил каждую минуту.',
        hard: '{name}, это правда тяжело. Ты имеешь право чувствовать всё, что чувствуешь.',
      },
      formal: {
        soft: '{name}, сделайте мягкий выдох и отметьте: “со мной произошло тяжёлое”. Ваши чувства естественны при утрате.',
        moderate:
          '{name}, позвольте себе признать: “мне сейчас очень больно”. Не обязательно держаться сильными постоянно.',
        hard: '{name}, это тяжёлый опыт. Вы имеете право на любые чувства.',
      },
    },
  },
  {
    id: 'psygriefreminder02_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, проверь тело: сожми и отпусти плечи, разожми челюсть, сделай 3 спокойных выдоха. Тело тоже держит в себе горе.',
        moderate:
          '{name}, 3 раза: вдох через нос, длинный выдох через рот. Чуть-чуть снижая напряжение в теле, ты поддерживаешь и сердце.',
        hard: '{name}, разожми челюсть и сделай 3 медленных выдоха. Тебе можно чуть отпустить напряжение.',
      },
      formal: {
        soft: '{name}, проверьте тело: мягко поднимите и опустите плечи, расслабьте челюсть, сделайте 3 спокойных выдоха.',
        moderate:
          '{name}, три цикла “вдох через нос — длинный выдох через рот” слегка снижут напряжение в теле и поддержат вас.',
        hard: '{name}, расслабьте челюсть и сделайте 3 медленных выдоха. Можно немного отпустить напряжение.',
      },
    },
  },
  {
    id: 'psygriefreminder03_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если слёзы близко — это нормально. Попробуй дать им выйти хотя бы немного, не торопя себя остановиться.',
        moderate:
          '{name}, слёзы сейчас — не слабость, а один из способов прожить боль. Ты ничего не “ломаешь”, когда плачешь.',
        hard: '{name}, если хочется плакать — плачь. Это часть горя.',
      },
      formal: {
        soft: '{name}, если слёзы подступают, это естественно. Можно позволить им выйти, не торопя себя.',
        moderate:
          '{name}, слёзы — нормальная реакция на утрату, а не признак слабости.',
        hard: '{name}, если вам хочется плакать, дайте себе такую возможность.',
      },
    },
  },
  {
    id: 'psygriefreminder04_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай маленькое заземление: огляни комнату и найди 5 предметов одного цвета. Это помогает вернуться из тяжёлых мыслей в сейчас.',
        moderate:
          '{name}, назови про себя: 5 предметов, которые видишь, 4 звука, которые слышишь. Так ты чуть-чуть опираешься на реальность.',
        hard: '{name}, оглянись вокруг и найди 5 вещей, которые видишь. Это простой способ вернуться в момент.',
      },
      formal: {
        soft: '{name}, попробуйте заземлиться: найдите взглядом 5 предметов одного цвета вокруг вас.',
        moderate:
          '{name}, перечислите: 5 вещей, которые видите, и 4 звука, которые слышите. Это помогает опереться на настоящее.',
        hard: '{name}, найдите 5 предметов вокруг себя. Это мягкое заземление в моменте.',
      },
    },
  },
  {
    id: 'psygriefreminder05_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, напоминание: тебе не нужно “держаться ради других” каждую секунду. Можно быть живым, а не идеальным сильным.',
        moderate:
          '{name}, сейчас достаточно просто дышать и выполнять самые базовые вещи. Всё “сверх” — опция, а не обязанность.',
        hard: '{name}, не требуй от себя подвигов. Сейчас главное — выдерживать день за днём.',
      },
      formal: {
        soft: '{name}, вам не нужно постоянно “держаться ради других”. Вы имеете право быть живыми и уязвимыми.',
        moderate:
          '{name}, сейчас достаточно базовых шагов: дышать, есть, спать по мере сил. Остальное необязательно.',
        hard: '{name}, не требуйте от себя подвигов. Задача — выдерживать этот период, а не быть идеальными.',
      },
    },
  },
  {
    id: 'psygriefreminder06_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если мысли крутятся по кругу, можно мягко сказать себе: “стоп, сейчас я просто сделаю один маленький шаг по уходу за собой”.',
        moderate:
          '{name}, выбери один шаг: выпить воды, умыться, переодеться. Это не отменяет боли, но поддерживает тебя в ней.',
        hard: '{name}, сделай один маленький шаг о себе: вода, умыться или сменить одежду.',
      },
      formal: {
        soft: '{name}, если мысли застревают, мягко скажите себе: “сейчас я сделаю один маленький шаг заботы о себе”.',
        moderate:
          '{name}, выберите одно действие: выпить воды, умыться, переодеться. Это небольшой, но важный жест поддержки.',
        hard: '{name}, сделайте один шаг ухода за собой: вода, умывание или переодевание.',
      },
    },
  },
  {
    id: 'psygriefreminder07_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если боль усиливается вечером, можно заранее придумать мягкий ритуал: тёплый душ, плед, спокойная музыка или свеча.',
        moderate:
          '{name}, выбери сегодня один простой вечерний ритуал, который даёт хоть каплю тепла. Он не лечит утрату, но поддерживает тебя.',
        hard: '{name}, подготовь себе вечер: плед, чай, что-то тихое. В такие моменты тебе особенно нужна опора.',
      },
      formal: {
        soft: '{name}, если вечера особенно тяжёлые, заранее продумайте небольшой успокаивающий ритуал: душ, плед, тёплый напиток.',
        moderate:
          '{name}, один простой вечерний ритуал с заботой о себе не отменяет горе, но создаёт опору.',
        hard: '{name}, подготовьте себе тёплый, тихий вечер. В это время особенно важна поддержка.',
      },
    },
  },
  {
    id: 'psygriefreminder08_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если хочется о нём/ней/этом думать или говорить — это нормально. Попробуй на пару минут позволить себе эти мысли осознанно.',
        moderate:
          '{name}, можно на время “давать место” воспоминаниям: например, 5–10 минут, а потом мягко возвращаться в текущий день.',
        hard: '{name}, дай себе немного времени на воспоминания, а потом вернись в сегодня.',
      },
      formal: {
        soft: '{name}, если вам хочется вспоминать или говорить об утрате, это нормально. Можно позволить себе немного времени для этого.',
        moderate:
          '{name}, полезно “давать место” воспоминаниям ограниченное время, а затем мягко возвращаться к настоящему.',
        hard: '{name}, выделите немного времени для воспоминаний, а потом вернитесь в сегодняшний день.',
      },
    },
  },
  {
    id: 'psygriefreminder09_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, напомни себе: нет “правильной скорости” проживания горя. Не нужно вкладываться в чужие сроки типа “пора отпустить”.',
        moderate:
          '{name}, если внутри звучит “я должен уже прийти в норму”, попробуй заменить на “я двигаюсь в своём темпе”.',
        hard: '{name}, у горя нет дедлайна. Ты имеешь право на свой темп.',
      },
      formal: {
        soft: '{name}, у проживания утраты нет “правильных сроков”. Вы не обязаны соответствовать ожиданиям других.',
        moderate:
          '{name}, замените внутреннее “я должен уже прийти в норму” на “я иду в своём темпе”.',
        hard: '{name}, у горя нет единого дедлайна. Ваш темп имеет право быть таким, какой он есть.',
      },
    },
  },
  {
    id: 'psygriefreminder10_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если накатывает волной, попробуй описать вслух или про себя: “сейчас мне…”, “я чувствую…”, “мне хочется…”. Название эмоций чуть снижает их силу.',
        moderate:
          '{name}, 3 строки: “я чувствую…”, “я думаю…”, “мне сейчас нужно… хотя бы чуть-чуть”. Это помогает не утонуть в общем коме.',
        hard: '{name}, назови, что с тобой: чувство, мысль и маленькая потребность. Так становится чуть понятнее.',
      },
      formal: {
        soft: '{name}, когда эмоции накрывают, попробуйте описать: “сейчас мне…”, “я чувствую…”, “мне хочется…”.',
        moderate:
          '{name}, три фразы — про чувство, мысль и потребность — помогают структурировать переживание.',
        hard: '{name}, назовите своё чувство, мысль и небольшую потребность. Это делает состояние понятнее.',
      },
    },
  },
  {
    id: 'psygriefreminder11_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь опереться на кого‑то: написать, позвонить, просто сказать “мне плохо, побудь со мной, не надо советов”.',
        moderate:
          '{name}, выбери одного человека, кому можно коротко дать знать, как тебе. Не обязательно объяснять всё — достаточно “мне тяжело, можешь просто быть рядом?”.',
        hard: '{name}, ты имеешь право попросить: “мне плохо, просто побудь со мной, без решений”.',
      },
      formal: {
        soft: '{name}, вы можете опереться на другого человека: написать или позвонить и попросить просто побыть рядом.',
        moderate:
          '{name}, достаточно короткой фразы: “мне сейчас тяжело, можете просто побыть со мной, без советов?”.',
        hard: '{name}, вы имеете право просить о присутствии, а не только о советах.',
      },
    },
  },
  {
    id: 'psygriefreminder12_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если хочется закрыться от всех — это тоже понятная реакция. Может помочь договориться с собой: “сегодня хотя бы один маленький контакт, и на этом достаточно”.',
        moderate:
          '{name}, выбери минимальный уровень общения, который тебе посилен: одно сообщение, короткий звонок или просто ответ на важное.',
        hard: '{name}, тебе можно сокращать контакты, но не обязательно обрывать всё. Один посильный контакт на сегодня — ок.',
      },
      formal: {
        soft: '{name}, желание уединиться при горе естественно. Можно договориться с собой о минимальном, посильном уровне контактов.',
        moderate:
          '{name}, выберите небольшой объём общения: одно сообщение, короткий звонок или ответ только на важные запросы.',
        hard: '{name}, вы можете снижать количество контактов, сохраняя один посильный для себя уровень.',
      },
    },
  },
  {
    id: 'psygriefreminder13_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, проверь: удалось ли сегодня поесть что‑то тёплое и попить воды. Тело не знает, что “сейчас не до него”, ему по‑прежнему нужен базовый уход.',
        moderate:
          '{name}, даже если аппетита нет, попробуй маленькую порцию или тёплый напиток. Это не мелочь, а поддержка организма в тяжёлый момент.',
        hard: '{name}, по возможности что‑нибудь съешь и выпей воды. Телу сейчас особенно нужна опора.',
      },
      formal: {
        soft: '{name}, проверьте: ели ли вы сегодня тёплую пищу и пили ли воду. Телу по‑прежнему нужен базовый уход.',
        moderate:
          '{name}, даже при отсутствии аппетита небольшая порция еды или тёплый напиток поддержат организм.',
        hard: '{name}, постарайтесь что‑то съесть и выпить воды. Это важная поддержка тела.',
      },
    },
  },
  {
    id: 'psygriefreminder14_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если вокруг звучит “возьми себя в руки”, напомни себе: твоя задача — не соответствовать этим фразам, а выжить и сберечь себя.',
        moderate:
          '{name}, чужие ожидания могут не совпадать с твоей реальностью. Тебе можно выбирать, кого слушать и чьим словам не верить.',
        hard: '{name}, люди могут не понимать, но твоё горе от этого не меньше и не “неправильное”.',
      },
      formal: {
        soft: '{name}, фразы “возьмите себя в руки” часто не отражают глубину вашего горя. Важно ориентироваться на свои ощущения.',
        moderate:
          '{name}, вы имеете право не соответствовать чужим ожиданиям по скорости и форме проживания утраты.',
        hard: '{name}, непонимание окружающих не делает ваше горе менее реальным.',
      },
    },
  },
  {
    id: 'psygriefreminder15_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сейчас достаточно плюс 5–10% заботы о себе: чуть мягче с собой говорить, сделать один посильный шаг, позволить себе усталость.',
        moderate:
          '{name}, спроси себя: “как выглядел бы вариант на 10% бережнее ко мне в этой боли?” и, если возможно, выбери его.',
        hard: '{name}, добавь сегодня немного бережности к себе. Ты и так проходишь через многое.',
      },
      formal: {
        soft: '{name}, сейчас достаточно добавить хоть немного заботы о себе: мягкий тон, один посильный шаг, разрешение на усталость.',
        moderate:
          '{name}, спросите: “что было бы на 10% бережнее ко мне в этой ситуации?” и по возможности выберите этот вариант.',
        hard: '{name}, добавьте немного бережности к себе сегодня. Вы уже проходите через тяжёлое.',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psygriefinfo01_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, горе часто приходит волнами: то накрывает сильно, то немного отпускает. Это естественный процесс, а не “скачки настроения”.',
        moderate:
          '{name}, то, что тебе то легче, то снова очень больно, не значит, что ты “откатываешься назад”. Так обычно и выглядит путь проживania утраты.',
        hard: '{name}, волнообразность горя — норма. Это не признак, что ты “неправильно справляешься”.',
      },
      formal: {
        soft: '{name}, переживание утраты часто происходит волнами: периоды усиления боли сменяются относительным облегчением.',
        moderate:
          '{name}, колебания состояния не означают, что вы “идёте назад”. Это естественная динамика горя.',
        hard: '{name}, волнообразное течение горя — нормальный процесс, а не ошибка.',
      },
    },
  },
  {
    id: 'psygriefinfo02_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, горе может проявляться по‑разному: слёзы, злость, пустота, вина, страх, онемение. Нет “правильного” набора реакций.',
        moderate:
          '{name}, если ты чувствуешь не только грусть, но и, например, злость или облегчение, это тоже нормальные человеческие реакции.',
        hard: '{name}, любые эмоции при утрате — допустимы. Даже те, которых ты не ожидал от себя.',
      },
      formal: {
        soft: '{name}, горе проявляется не только слезами, но и злостью, пустотой, чувством вины или онемением. Все эти реакции возможны.',
        moderate:
          '{name}, даже смешанные чувства, вроде облегчения или раздражения, могут быть частью нормального процесса.',
        hard: '{name}, широкий спектр эмоций при утрате — нормален, даже если он вас удивляет.',
      },
    },
  },
  {
    id: 'psygriefinfo03_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, многие люди в горе отмечают трудности с концентрацией, памятью и энергией. Это не “леность”, а нагрузка психики.',
        moderate:
          '{name}, снижение работоспособности и рассеянность в такой период — частая реакция. Мозг занят очень тяжёлой внутренней работой.',
        hard: '{name}, то, что тебе тяжело думать и делать привычное, закономерно. Это не про слабость — ты в горе.',
      },
      formal: {
        soft: '{name}, при горе часто ухудшается концентрация, память и уровень энергии. Это типичная реакция психики.',
        moderate:
          '{name}, снижение работоспособности в период утраты связано с тем, что значительная часть ресурсов уходит на эмоциональную переработку.',
        hard: '{name}, трудности с привычными делами в таком состоянии закономерны и не означают вашу слабость.',
      },
    },
  },
  {
    id: 'psygriefinfo04_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, чувство вины при утрате встречается очень часто: “надо было сделать иначе, сказать больше, успеть”. Это попытка ума найти контроль там, где его не было.',
        moderate:
          '{name}, вина часто цепляется к мелочам задним числом. Важно помнить, что тогда действия опирались на те силы и знания, что были.',
        hard: '{name}, посмертная “перепроверка” своего прошлого поведения — часть горя, а не объективный суд над тобой.',
      },
      formal: {
        soft: '{name}, чувство вины (“можно было сделать иначе”) — частая часть переживания утраты.',
        moderate:
          '{name}, вина часто возникает как попытка найти контроль в ситуации, где его не было. Тогда вы действовали исходя из своих возможностей.',
        hard: '{name}, склонность обвинять себя задним числом — часть горя, а не объективная оценка ваших действий.',
      },
    },
  },
  {
    id: 'psygriefinfo05_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, иногда горе проявляется как онемение и отсутствие чувств. Это не значит, что тебе “безразлично” — так психика защищает от перегруза.',
        moderate:
          '{name}, отсутствие слёз или ярких эмоций не отменяет глубины потери. У каждого свой способ реагировать.',
        hard: '{name}, если ты “как будто ничего не чувствуешь” — это тоже реакция на шок и боль, а не черствость.',
      },
      formal: {
        soft: '{name}, ощущение эмоционального онемения при утрате — распространённая защитная реакция.',
        moderate:
          '{name}, отсутствие слёз не означает, что вы переживаете потерю меньше. У каждого человека свой способ реагировать.',
        hard: '{name}, эмоциональная “заморозка” — один из вариантов реакции на сильную боль, а не черствость.',
      },
    },
  },
  {
    id: 'psygriefinfo06_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, привычные опоры (сон, еда, движение, контакт с людьми) особенно важны при горе. Они не лечат саму утрату, но помогают выдерживать её.',
        moderate:
          '{name}, маленькие ритуалы ухода за собой снижают риск полного истощения и помогают проживать день за днём.',
        hard: '{name}, базовая забота о теле сейчас — не роскошь, а часть выживания.',
      },
      formal: {
        soft: '{name}, базовые опоры — сон, питание, движение, контакт — особенно важны в период горя.',
        moderate:
          '{name}, небольшие ежедневные ритуалы самоухода уменьшают риск истощения и помогают выдерживать переживание.',
        hard: '{name}, забота о теле сейчас — необходимый элемент поддержания вашего ресурса.',
      },
    },
  },
  {
    id: 'psygriefinfo07_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, разговоры “о нём/ней/этом” могут быть частью исцеления. Когда ты делишься, боль становится чуть менее одинокой.',
        moderate:
          '{name}, делиться воспоминаниями, горем и даже злостью с кем‑то, кто может просто слушать, — важная форма поддержки.',
        hard: '{name}, говорить о своей потере — не “мучить” других, а искать человеческую опору.',
      },
      formal: {
        soft: '{name}, разговоры о потере и воспоминания могут быть важной частью процесса переживания горя.',
        moderate:
          '{name}, возможность поделиться своим опытом с тем, кто способен слушать, снижает чувство одиночества в боли.',
        hard: '{name}, говорить о своей утрате — это способ искать поддержку, а не “нагружать” людей.',
      },
    },
  },
  {
    id: 'psygriefinfo08_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, многие отмечают, что даты, места и какие‑то мелкие ассоциации могут резко усиливать боль. Это естественные триггеры памяти.',
        moderate:
          '{name}, ожидание “особых” дней (годовщина, праздники) тоже может быть тяжёлым. К этим дням можно готовиться мягко, заранее думая о поддержке.',
        hard: '{name}, если в определённые дни или места становится особенно больно — это не странно, а закономерно.',
      },
      formal: {
        soft: '{name}, усиление боли в определённые даты, местах или ситуациях связано с триггерами памяти и является частой реакцией.',
        moderate:
          '{name}, к значимым датам можно готовиться заранее, продумывая способы поддержки себя.',
        hard: '{name}, резкое усиление чувств в “особые дни” — естественная часть процесса горевания.',
      },
    },
  },
  {
    id: 'psygriefinfo09_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, у кого‑то горе выглядит как сильная закрытость, у кого‑то — как активность и дела. Это не про “правильно/неправильно”, а про разные стили.',
        moderate:
          '{name}, если ты делаешь много дел, чтобы не рухнуть, это тоже способ справляться. Важно лишь иногда останавливаться и слышать себя.',
        hard: '{name}, твой способ держаться сейчас — твой. Главное, чтобы он не разрушал тебя полностью.',
      },
      formal: {
        soft: '{name}, стили переживания горя различаются: от сильного уединения до активности. Оба варианта могут быть нормальными.',
        moderate:
          '{name}, активность и “уход в дела” тоже могут быть защитой. Важно искать баланс и моменты контакта с собой.',
        hard: '{name}, ваш способ переживать утрату имеет право быть таким, какой он есть, если он не разрушает вас.',
      },
    },
  },
  {
    id: 'psygriefinfo10_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, иногда люди в горе злятся на ушедшего, на врачей, на Бога, на близких или на себя. Злость — тоже часть живого процесса, а не “неблагодарность”.',
        moderate:
          '{name}, важно дать себе право замечать эту злость и не стыдиться её. С ней тоже можно обходиться бережно.',
        hard: '{name}, злость при горе не делает тебя плохим человеком. Она говорит о боли и бессилии.',
      },
      formal: {
        soft: '{name}, злость на ушедшего, на обстоятельства или на себя — частая часть переживания утраты.',
        moderate:
          '{name}, признание этой злости без самосудов помогает мягче проживать горе.',
        hard: '{name}, наличие злости в горе не делает вас “плохим человеком”. Это реакция на боль и бессилие.',
      },
    },
  },
  {
    id: 'psygriefinfo11_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, дыхательные и заземляющие практики не убирают горе, но помогают снизить его остроту на несколько минут. Иногда этого уже много.',
        moderate:
          '{name}, короткие упражнения (дыхание, ощущение опоры, взгляд по комнате) — это маленькие “мостики” через особо тяжёлые моменты.',
        hard: '{name}, несколько минут дыхания или заземления не обесценивают твою боль, а помогают её выдержать.',
      },
      formal: {
        soft: '{name}, дыхание и заземление не отменяют горя, но снижают его остроту в конкретный момент.',
        moderate:
          '{name}, короткие практики могут быть “мостиками” через самые тяжёлые эпизоды дня.',
        hard: '{name}, несколько минут дыхания и заземления — это не отрицание боли, а способ выдержать её.',
      },
    },
  },
  {
    id: 'psygriefinfo12_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, желание “держаться ради детей/родных” понятно. И при этом важно, чтобы у тебя тоже было место для своих слёз и слабости.',
        moderate:
          '{name}, дети и близкие выигрывают, когда взрослый не ломается, но и не превращается в камень. Живая, честная опора лучше, чем маска.',
        hard: '{name}, заботясь о других, не забывай про себя. Тебе тоже нужна опора.',
      },
      formal: {
        soft: '{name}, желание быть опорой для близких важно, но у вас тоже должно быть пространство для своих чувств.',
        moderate:
          '{name}, дети и родные нуждаются не в идеальном, а в живом взрослом, который способен и поддерживать, и признавать свои эмоции.',
        hard: '{name}, заботясь о других, не забывайте о собственных потребностях и границах.',
      },
    },
  },
  {
    id: 'psygriefinfo13_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, память об ушедшем может жить в твоих жестах, словах, традициях. Потеря не стирает ценность того, что было.',
        moderate:
          '{name}, со временем у многих боль из острой превращается в более мягкую, а связь — из физической в внутреннюю и символическую.',
        hard: '{name}, то, что было важно между вами, не исчезает полностью. Оно меняет форму.',
      },
      formal: {
        soft: '{name}, память об утраченных остаётся в ваших поступках, словах и традициях. Потеря не обнуляет значимость этих связей.',
        moderate:
          '{name}, со временем острая боль часто сменяется более мягкой, а связь — становится внутренней.',
        hard: '{name}, значимое, что было между вами, не исчезает, а трансформируется.',
      },
    },
  },
  {
    id: 'psygriefinfo14_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мысли “я не имею права радоваться/смеяться” после утраты тоже встречаются часто. Но эпизоды радости не отменяют глубину любви и горя.',
        moderate:
          '{name}, способность иногда смеяться или чувствовать тепло не означает предательство памяти. Это признак того, что в тебе всё ещё есть живое.',
        hard: '{name}, моменты радости не делают твоё горе менее настоящим.',
      },
      formal: {
        soft: '{name}, чувство вины за эпизоды радости после утраты распространено, но радость не отменяет глубины вашей любви и боли.',
        moderate:
          '{name}, способность иногда испытывать приятные чувства — признак того, что в вас остаётся жизненность, а не знак предательства.',
        hard: '{name}, моменты радости не обесценивают ваше горе.',
      },
    },
  },
  {
    id: 'psygriefinfo15_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если боль становится невыносимой и мысли уходят к тому, чтобы исчезнуть, это важный сигнал для поиска поддержки, а не повод стыдиться.',
        moderate:
          '{name}, с тяжелым горем можно обращаться к специалистам, кризисным службам, группам поддержки. Тебе не нужно держать это всё в одиночку.',
        hard: '{name}, если ты думаешь о том, чтобы с собой что‑то сделать, очень важно немедленно обратиться за помощью. Твоя жизнь важна.',
      },
      formal: {
        soft: '{name}, если боль кажется невыносимой и появляются мысли о саморазрушении, это сигнал не стыдиться, а искать помощь.',
        moderate:
          '{name}, при тяжёлом горе имеет смысл обратиться к специалистам или в кризисные службы. Это нормально и важно.',
        hard: '{name}, при мыслях о причинении себе вреда необходимо срочно обратиться за профессиональной поддержкой. Ваша жизнь ценна.',
      },
    },
  },

  // --- MOTIVATIONAL (15) ---
  {
    id: 'psygriefmotiv01_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сейчас твоя задача — не “быть сильным”, а быть живым. Маленькие жесты заботы о себе — уже большая работа.',
        moderate:
          '{name}, каждый день, когда ты продолжаешь дышать, как‑то есть, что‑то делать, — уже шаг через очень тяжёлый опыт.',
        hard: '{name}, то, что ты всё ещё держишься в этой боли, — уже сила.',
      },
      formal: {
        soft: '{name}, ваша задача сейчас — не демонстрировать силу, а сохранять себя живыми.',
        moderate:
          '{name}, каждый прожитый день с минимальной заботой о себе — значимый шаг в условиях утраты.',
        hard: '{name}, то, что вы выдерживаете этот опыт, уже говорит о вашей силе.',
      },
    },
  },
  {
    id: 'psygriefmotiv02_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь относиться к себе так, как относился бы к другу в такой ситуации: без требований, с теплом и правом на слабость.',
        moderate:
          '{name}, попробуй мысленно сказать себе что‑то, что сказал бы близкому человеку, переживающему такую же утрату. Ты тоже достоин этой поддержки.',
        hard: '{name}, поговори с собой, как с любимым человеком, а не как с врагом.',
      },
      formal: {
        soft: '{name}, вы можете относиться к себе так, как относились бы к другу в аналогичной ситуации: бережно и без чрезмерных требований.',
        moderate:
          '{name}, попробуйте сказать себе слова, которые вы бы сказали близкому человеку с такой же потерей.',
        hard: '{name}, разговаривайте с собой как с важным человеком, а не как с противником.',
      },
    },
  },
  {
    id: 'psygriefmotiv03_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право идти маленькими шагами. Один посильный шаг за день — уже движение сквозь туман боли.',
        moderate:
          '{name}, не обязательно “подниматься на ноги” сразу. Сейчас важно не масштаб, а то, что ты не бросаешь себя.',
        hard: '{name}, маленький шаг сегодня — полностью достаточно. Не обесценивай его.',
      },
      formal: {
        soft: '{name}, вы имеете право двигаться маленькими шагами. Это всё равно движение.',
        moderate:
          '{name}, сейчас важен не масштаб, а сам факт, что вы продолжаете заботиться о себе хотя бы немного.',
        hard: '{name}, один небольшой шаг сегодня — уже достаточный результат.',
      },
    },
  },
  {
    id: 'psygriefmotiv04_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, в том, что ты чувствуешь так глубоко, есть и свидетельство твоей способности любить. Боль сильна там, где была большая значимость.',
        moderate:
          '{name}, твоя боль говорит не о слабости, а о том, насколько важным было то, что ты потерял. Это про ценность связи.',
        hard: '{name}, сила твоей боли — отражение силы любви, а не твоей “несостоятельности”.',
      },
      formal: {
        soft: '{name}, глубина боли часто отражает глубину значимости и любви, которую вы испытывали.',
        moderate:
          '{name}, ваши чувства говорят не о слабости, а о важности утраченного человека или части жизни.',
        hard: '{name}, интенсивность горя — показатель ценности связи, а не вашей несостоятельности.',
      },
    },
  },
  {
    id: 'psygriefmotiv05_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно пробовать строить день вокруг маленьких опор: чашка чая, короткая прогулка, пару слов с кем‑то надёжным.',
        moderate:
          '{name}, выбери сегодня три крошечных опоры и посмотри, как они помогут выдержать день. Не для счастья, а для выживания.',
        hard: '{name}, собери себе несколько маленьких опор на этот день. Ты заслуживаешь поддержки.',
      },
      formal: {
        soft: '{name}, вы можете выстраивать день вокруг небольших опор: тёплый напиток, короткая прогулка, разговор.',
        moderate:
          '{name}, выберите несколько небольших опор, чтобы помочь себе выдержать этот день.',
        hard: '{name}, создайте для себя пару маленьких опор. Вы достойны поддержки.',
      },
    },
  },
  {
    id: 'psygriefmotiv06_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, даже если ты сейчас не видишь впереди света, это не значит, что его нет. Психика умеет постепенно находить новые опоры.',
        moderate:
          '{name}, возможно, прямо сейчас ты просто на самом тёмном отрезке пути. Это не финал истории, а очень тяжёлый её фрагмент.',
        hard: '{name}, то, что сейчас темно, не значит, что так будет всегда.',
      },
      formal: {
        soft: '{name}, ощущение отсутствия будущего при горе распространено, но психика обладает способностью находить новые опоры со временем.',
        moderate:
          '{name}, то, что сейчас кажется самым тёмным отрезком, не означает, что таким останется вся ваша жизнь.',
        hard: '{name}, нынешняя тьма не равна постоянству. Время и поддержка меняют картину.',
      },
    },
  },
  {
    id: 'psygriefmotiv07_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь сочетать память и жизнь дальше. Не обязательно “забывать”, чтобы продолжать жить.',
        moderate:
          '{name}, со временем многие люди находят способы не терять связь в сердце и при этом идти дальше в своей жизни.',
        hard: '{name}, продолжать жить не значит предавать, это значит не исчезать вместе с утратой.',
      },
      formal: {
        soft: '{name}, возможно сочетать память об утраченных и движение вперёд. Это не взаимоисключающие вещи.',
        moderate:
          '{name}, со временем многие находят формы внутренней связи и одновременно строят свою дальнейшую жизнь.',
        hard: '{name}, продолжать жить — не означает предавать память, а означает не исчезать вместе с утратой.',
      },
    },
  },
  {
    id: 'psygriefmotiv08_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты уже делаешь много: ищешь слова, читаешь это, дышишь. Это тоже действия, даже если они не кажутся “достижениями”.',
        moderate:
          '{name}, иногда самым большим достижением дня становится то, что удалось встать, что‑то поесть и хоть немного позаботиться о себе.',
        hard: '{name}, не обесценивай то, что ты вообще поднимаешься и что‑то делаешь в таком состоянии.',
      },
      formal: {
        soft: '{name}, то, что вы сейчас ищете понимание и поддержку, уже является важным действием.',
        moderate:
          '{name}, иногда главным достижением дня становится то, что вы встали, поели и сделали минимальные шаги заботы о себе.',
        hard: '{name}, не обесценивайте свою способность продолжать действовать даже в этом состоянии.',
      },
    },
  },
  {
    id: 'psygriefmotiv09_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если рядом есть люди, готовые быть, опирайся потихоньку. Это не “нагрузка”, а естественная человеческая взаимность.',
        moderate:
          '{name}, позволить себе опереться на других — такое же мужество, как и выдерживать боль на ногах.',
        hard: '{name}, просить о поддержке — это признак живости, а не слабости.',
      },
      formal: {
        soft: '{name}, если рядом есть готовые поддержать люди, опора на них — естественная человеческая потребность.',
        moderate:
          '{name}, позволять себе поддержку — это проявление зрелости и мужества.',
        hard: '{name}, просьба о помощи говорит не о слабости, а о вашем желании сохранять себя.',
      },
    },
  },
  {
    id: 'psygriefmotiv10_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты вправе искать форматы, которые помогут — книги, группы поддержки, терапия, разговоры. Не нужно “справляться в одиночку”.',
        moderate:
          '{name}, обращение за помощью — не капитуляция, а выбор не быть в одиночку с непосильной болью.',
        hard: '{name}, ты имеешь право на профессиональную и человеческую поддержку в этом.',
      },
      formal: {
        soft: '{name}, вы можете искать поддержку в разных форматах: личные контакты, группы, специалисты.',
        moderate:
          '{name}, обращение за помощью говорит о том, что вы выбираете не оставаться один на один с непосильной болью.',
        hard: '{name}, вы имеете право на профессиональную и человеческую поддержку в проживании горя.',
      },
    },
  },
  {
    id: 'psygriefmotiv11_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно поставить планку очень низко и всё равно быть к себе теплее, чем обычно. Это не про слабость, а про выживание.',
        moderate:
          '{name}, снижающаяся требовательность к себе в такой период — не “разбалованность”, а адаптация к реальной нагрузке.',
        hard: '{name}, сейчас не время мерить себя старыми стандартами эффективности.',
      },
      formal: {
        soft: '{name}, в период горя допустимо снижать ожидания от себя и быть мягче к своим возможностям.',
        moderate:
          '{name}, уменьшение требований к себе — адаптивная реакция, а не распущенность.',
        hard: '{name}, текущие стандарты должны учитывать ваш реальный внутренний ресурс.',
      },
    },
  },
  {
    id: 'psygriefmotiv12_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь не верить сейчас в “станет легче”, и это нормально. Пусть в это верит кто‑то рядом, пока ты просто дышишь и живёшь день за днём.',
        moderate:
          '{name}, не обязательно прямо сейчас находить смысл во всём, что случилось. Достаточно потихоньку выдерживать происходящее.',
        hard: '{name}, тебе не нужно верить в свет вперёд, чтобы жить этот день. Достаточно выдержать его по чуть‑чуть.',
      },
      formal: {
        soft: '{name}, вам не обязательно сейчас верить, что “станет легче”. Ваше дело — переживать день за днём.',
        moderate:
          '{name}, поиск смысла может прийти позже. Сейчас важно постепенно выдерживать происходящее.',
        hard: '{name}, для того чтобы жить этот день, не нужно сразу видеть свет вперёд. Достаточно маленьких шагов.',
      },
    },
  },
  {
    id: 'psygriefmotiv13_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если получится, посвяти сегодня один небольшой жест в память о том, кого/что ты потерял: слово, свеча, мысль, фото.',
        moderate:
          '{name}, такие маленькие ритуалы могут дать ощущение связи и уважения к тому, что было, и поддержать тебя внутри.',
        hard: '{name}, маленький ритуал памяти сегодня может стать для тебя тихой опорой.',
      },
      formal: {
        soft: '{name}, если вам подходит, сделайте сегодня один небольшой жест памяти: мысль, фото, свеча, слово.',
        moderate:
          '{name}, такие ритуалы помогают ощущать связь и уважать свой опыт и утрату.',
        hard: '{name}, один маленький ритуал памяти может поддержать вас в этот день.',
      },
    },
  },
  {
    id: 'psygriefmotiv14_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твоя история не заканчивается только этой утратой, хотя сейчас ей может казаться всё заполненным. Внутри тебя есть больше, чем один тяжёлый эпизод.',
        moderate:
          '{name}, со временем эта глава останется важной, но вокруг неё могут появиться и другие — про опору, связи, заботу.',
        hard: '{name}, эта утрата — часть твоей истории, но не вся твоя история целиком.',
      },
      formal: {
        soft: '{name}, ваша жизнь не сводится только к этой утрате, хоть сейчас она может занимать всё пространство.',
        moderate:
          '{name}, со временем рядом с этой важной главой могут появиться и другие — о поддержке, смыслах и новых опорах.',
        hard: '{name}, утрата — это часть вашей истории, но не вся история.',
      },
    },
  },
  {
    id: 'psygriefmotiv15_new',
    kind: 'therapy',
    entityKey: 'grief',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня достаточно добавить +10% мягкости к себе: чуть меньше ругать, чуть больше признавать свою боль и усталость.',
        moderate:
          '{name}, спроси: “как бы я поступил, если бы относился к себе с уважением в этом горе?” и сделай один такой шаг.',
        hard: '{name}, выбери сегодня хотя бы один поступок, в котором ты на своей стороне.',
      },
      formal: {
        soft: '{name}, сегодня достаточно добавить немного мягкости к себе: меньше самокритики, больше признания боли и усталости.',
        moderate:
          '{name}, спросите себя: “что можно было бы сделать сейчас из уважения к себе в этой ситуации?” и реализуйте один такой шаг.',
        hard: '{name}, сделайте хотя бы один поступок, в котором вы на своей стороне.',
      },
    },
  },
  // =========================
  // PERFECTIONISM - 45 templates [NEW]
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psyperfreminder01_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно выбрать не “идеально”, а “достаточно хорошо”. Попробуй спросить себя: “что было бы достаточно на 70–80%?”.',
        moderate:
          '{name}, сними планку с “идеально” на “выполнено”. Заверши на уровне, который рабочий, а не безупречный.',
        hard: '{name}, цель — не идеал, а готово. 70–80% достаточно.',
      },
      formal: {
        soft: '{name}, сегодня можно выбрать не идеальное, а достаточно хорошее выполнение. Спросите себя, что будет приемлемым результатом.',
        moderate:
          '{name}, переведите фокус с “идеально” на “выполнено”. Рабочий уровень уже ценен.',
        hard: '{name}, цель — завершённость, а не идеал. 70–80% достаточно.',
      },
    },
  },
  {
    id: 'psyperfreminder02_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, начни с “плохого черновика”: разреши себе сделать первую версию быстро и неаккуратно. Красоту добавишь потом.',
        moderate:
          '{name}, правило: сначала черновик, потом доработка. Не пытайся сделать финал с первого захода.',
        hard: '{name}, сделай грубый черновик. Потом полирнёшь.',
      },
      formal: {
        soft: '{name}, начните с чернового варианта, позволяя себе неточности. Доработка будет следующим шагом.',
        moderate:
          '{name}, используйте принцип: “сначала черновик, затем правки”, а не финальный результат с первого раза.',
        hard: '{name}, выполните черновой вариант без стремления к идеалу. Полировка позже.',
      },
    },
  },
  {
    id: 'psyperfreminder03_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если застрял, раздели задачу на микрошаг: “открыть файл”, “написать 3 предложения”, “дописать один абзац”.',
        moderate:
          '{name}, не делай “идеальный проект”, сделай сейчас один конкретный кусочек. Остальное — позже.',
        hard: '{name}, выбери первый шаг на 5–10 минут и сделай только его.',
      },
      formal: {
        soft: '{name}, при застревании разбейте задачу на микрошаги: открыть документ, написать несколько предложений.',
        moderate:
          '{name}, сосредоточьтесь на одном небольшом фрагменте задачи, а не на всём объёме сразу.',
        hard: '{name}, выберите один шаг на 5–10 минут и выполните только его.',
      },
    },
  },
  {
    id: 'psyperfreminder04_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай короткую сессию: 15 минут работы, не трогая бесконечные правки. Потом остановись — даже если хочется “докрутить чуть-чуть”.',
        moderate:
          '{name}, поставь таймер и просто двигайся вперёд, а не застревай на одном месте. Проверка и шлифовка будут отдельным этапом.',
        hard: '{name}, 15 минут без перфекционистских правок. Только движение вперёд.',
      },
      formal: {
        soft: '{name}, попробуйте 15‑минутную сессию без избыточных правок, двигаясь вперёд по задаче.',
        moderate:
          '{name}, разделите время: сейчас продвижение, затем отдельное время на шлифовку.',
        hard: '{name}, работайте 15 минут без остановки на мелкие исправления.',
      },
    },
  },
  {
    id: 'psyperfreminder05_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, спроси себя: “какой минимальный результат меня устроит сегодня?”. Не “идеал”, а честный минимум.',
        moderate:
          '{name}, выпиши “минимум”, “норма”, “идеал”. Остановись хотя бы на уровне “норма”, не гонись всегда за последней колонкой.',
        hard: '{name}, сегодня достаточно уровня “минимум/норма”. Идеал — опция.',
      },
      formal: {
        soft: '{name}, определите минимально приемлемый результат на сегодня, а не только идеальный.',
        moderate:
          '{name}, выделите уровни “минимум”, “норма”, “идеал” и ориентируйтесь хотя бы на первые два.',
        hard: '{name}, позвольте себе остановиться на уровне “достаточно”, а не только на идеале.',
      },
    },
  },
  {
    id: 'psyperfreminder06_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, заметил привычное “всё или ничего”? Попробуй вариант “чуть-чуть, но сделаю”: 10–20% задачи всё же лучше, чем 0%.',
        moderate:
          '{name}, когда хочется бросить, потому что не получится идеально, напомни себе: “частично выполненное — всё ещё выполненное”.',
        hard: '{name}, не отменяй дело только потому, что не будет идеала. Сделай часть.',
      },
      formal: {
        soft: '{name}, если включается установка “всё или ничего”, можно выбрать вариант “сделать часть” как компромисс.',
        moderate:
          '{name}, частичное выполнение задачи лучше, чем полное её откладывание из‑за страха несовершенства.',
        hard: '{name}, не отказывайтесь от действия, если не получается идеально. Сделайте доступный объём.',
      },
    },
  },
  {
    id: 'psyperfreminder07_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, перед тем как перепроверять в третий раз, спроси: “это правда нужно или я просто снимаю тревогу?”. Иногда можно остановиться.',
        moderate:
          '{name}, задай себе лимит: максимум 2 круга проверки, не 10. Остальное — уже про тревогу, а не качество.',
        hard: '{name}, ограничь количество проверок. После второго круга — стоп.',
      },
      formal: {
        soft: '{name}, перед очередной проверкой спросите себя, действительно ли это улучшает результат или лишь снижает тревогу.',
        moderate:
          '{name}, задайте лимит числа проверок (например, две), чтобы не застревать в бесконечной шлифовке.',
        hard: '{name}, ограничьте количество циклов проверки. После второго остановитесь.',
      },
    },
  },
  {
    id: 'psyperfreminder08_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно разрешить себе ошибаться. Скажи: “ошибка — не катастрофа, а часть процесса”. Даже если внутри так не кажется.',
        moderate:
          '{name}, напомни себе: “идеальных людей нет, есть живые с ошибками”. Не нужно быть исключением.',
        hard: '{name}, ошибка — не приговор твоей ценности. Она у всех.',
      },
      formal: {
        soft: '{name}, позвольте себе ошибаться, рассматривая ошибки как часть процесса, а не как катастрофу.',
        moderate:
          '{name}, напомните: идеальных людей не существует, есть живые люди с ошибками.',
        hard: '{name}, ошибки не обнуляют вашу ценность как человека.',
      },
    },
  },
  {
    id: 'psyperfreminder09_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если в голове звучит “надо лучше”, добавь вопрос: “для кого и какой ценой?”. Это помогает притормозить автоматическое усердие.',
        moderate:
          '{name}, прежде чем докручивать, уточни: “что реально изменится от этих лишних 20% усилий?”. Иногда ответ — почти ничего.',
        hard: '{name}, спроси: стоит ли доп.потрат сил реального эффекта. Не всегда.',
      },
      formal: {
        soft: '{name}, дополняйте мысль “нужно лучше” вопросом: “для кого и за какую цену?”. Это помогает оценить реальную необходимость.',
        moderate:
          '{name}, оценивайте, насколько дополнительные усилия действительно влияют на результат, а не только на ощущение контроля.',
        hard: '{name}, сопоставляйте затраты и эффект, прежде чем бесконечно улучшать.',
      },
    },
  },
  {
    id: 'psyperfreminder10_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, вспомни: не нужно нравиться всем. “Делать хорошо” ≠ “получить чужое идеальное одобрение”.',
        moderate:
          '{name}, часть напряжения — от желания не вызвать ни одной критики. Это невозможно по определению.',
        hard: '{name}, даже идеальное, по твоим меркам, всё равно кому-то не зайдёт. И это нормально.',
      },
      formal: {
        soft: '{name}, желание “сделать идеально для всех” нереалистично: у людей разные ожидания.',
        moderate:
          '{name}, стремление избежать любой критики создаёт чрезмерное напряжение и не достигается на практике.',
        hard: '{name}, даже очень качественный результат не гарантирует полного отсутствия критики.',
      },
    },
  },
  {
    id: 'psyperfreminder11_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, проверь, не сравниваешь ли себя с чьим‑то “готовым результатом”, пока у тебя ещё процесс. Это нечестное сравнение.',
        moderate:
          '{name}, сравнение “моё незакончено” с “у него/неё уже шедевр” почти всегда бьёт по самооценке. Лучше сравни себя с собой “до”.',
        hard: '{name}, сравнивай свой прогресс с собой, а не с чужой витриной.',
      },
      formal: {
        soft: '{name}, сравнение своего процесса с чужим готовым результатом обычно искажает восприятие.',
        moderate:
          '{name}, полезнее сравнивать текущий уровень с вашим же прошлым уровнем, а не с чужими достижениями.',
        hard: '{name}, ориентируйтесь на собственный прогресс, а не на идеальные примеры других людей.',
      },
    },
  },
  {
    id: 'psyperfreminder12_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай мини‑план: “черновик — пауза — правки”. Это аккуратнее, чем пытаться сделать всё идеально за один присест.',
        moderate:
          '{name}, раздели этапы: сейчас только набросок, позже — вычитка, ещё позже — финальный проход. Так меньше внутреннего давления.',
        hard: '{name}, один этап за раз. Не требуй от себя сразу финал.',
      },
      formal: {
        soft: '{name}, выстройте этапы: черновик, пауза, правки. Это снижает давление идеальности “с первого раза”.',
        moderate:
          '{name}, последовательное разделение этапов работы помогает уменьшить напряжение и повысить качество.',
        hard: '{name}, выполняйте по одному этапу, не требуя сразу финального уровня.',
      },
    },
  },
  {
    id: 'psyperfreminder13_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, напомни себе: “я не моя работа/оценки/результат”. Ошибка в задаче ≠ “со мной что‑то не так целиком”.',
        moderate:
          '{name}, когда хочется назвать себя “никем” из‑за одного промаха, попробуй заменить на “здесь у меня не получилось так, как хотелось”.',
        hard: '{name}, отделяй результат (“не вышло”) от личности (“со мной что-то не так”). Это разные вещи.',
      },
      formal: {
        soft: '{name}, вы — не только ваши результаты. Ошибка в задаче не означает, что с вами что‑то не так в целом.',
        moderate:
          '{name}, заменяйте глобальные оценки (“я ничто”) на конкретные (“здесь у меня не получилось так, как я планировал”).',
        hard: '{name}, разделяйте оценку работы и оценку себя как человека.',
      },
    },
  },
  {
    id: 'psyperfreminder14_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если чувствуешь, что застрял в бесконечном улучшении, поставь жёсткий дедлайн: “после вот этого времени я останавливаюсь”.',
        moderate:
          '{name}, наметь точку “хватит”: ещё один раунд правок — и стоп. Дальше твой внутренний критик просто требует невозможного.',
        hard: '{name}, зафиксируй момент остановки и уважай его. Иначе конца не будет.',
      },
      formal: {
        soft: '{name}, при склонности бесконечно улучшать заранее определите время или этап, на котором вы остановитесь.',
        moderate:
          '{name}, обозначьте для себя точку завершения, чтобы не поддаваться бесконечным требованиям внутреннего критика.',
        hard: '{name}, фиксируйте момент “готово” и придерживайтесь его.',
      },
    },
  },
  {
    id: 'psyperfreminder15_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, финальный чек: “то, что я хочу улучшать дальше, правда важно или это уже про страх?”. Этот вопрос помогает отпустить лишнее.',
        moderate:
          '{name}, если улучшения касаются деталей, которые почти никто не заметит, — возможно, уже можно остановиться.',
        hard: '{name}, спроси: это про качество или про тревогу? Если второе — хватит.',
      },
      formal: {
        soft: '{name}, задайте себе вопрос: “следующие доработки действительно важны или это уже больше про тревогу, чем про качество?”.',
        moderate:
          '{name}, если вы шлифуете детали, которые почти никто не заметит, возможно, стоит завершить.',
        hard: '{name}, различайте улучшения ради дела и улучшения ради снижения тревоги. На вторых можно остановиться.',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psyperfinfo01_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, перфекционизм часто рождается как попытка избежать критики и отвержения: “если сделаю идеально, меня примут и не осудят”.',
        moderate:
          '{name}, такая стратегия когда‑то могла помогать, но во взрослой жизни часто приводит к выгоранию и вечному ощущению “мало”.',
        hard: '{name}, корни перфекционизма — про защиту, а не про каприз.',
      },
      formal: {
        soft: '{name}, перфекционизм часто возникает как способ защититься от критики и отвержения.',
        moderate:
          '{name}, ранее эта стратегия могла быть полезной, но во взрослой жизни она нередко приводит к выгоранию и хроническому недовольству собой.',
        hard: '{name}, перфекционизм — это скорее защита, чем прихоть.',
      },
    },
  },
  {
    id: 'psyperfinfo02_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, установка “если не идеально, значит плохо” делает мир чёрно‑белым. Но в реальности есть много оттенков “достаточно хорошо”.',
        moderate:
          '{name}, когда есть только “успех” или “провал”, почти любая реальная жизнь ощущается провалом. Гибкость критериев снижает давление.',
        hard: '{name}, жёсткая система оценок подталкивает к вечному разочарованию, даже при хороших результатах.',
      },
      formal: {
        soft: '{name}, мысль “если не идеально, значит плохо” создаёт чёрно‑белое восприятие, несовместимое с реальностью.',
        moderate:
          '{name}, жёсткая дихотомия успех/провал приводит к тому, что большинство нормальных результатов воспринимаются как неудача.',
        hard: '{name}, гибкие критерии полезнее строгих “идеал или ничто” для психологического здоровья.',
      },
    },
  },
  {
    id: 'psyperfinfo03_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, страх ошибки часто не про сам факт, а про то, что за ним следует в голове: “меня осудят, отвергнут, посчитают никчёмным человеком”.',
        moderate:
          '{name}, отделяя ошибку от катастрофических последствий, можно заметить, что часть страха — про старый опыт, а не про текущую реальность.',
        hard: '{name}, ты боишься не ошибки, а того смысла, который ей придавал кто‑то в прошлом.',
      },
      formal: {
        soft: '{name}, страх ошибки часто связан не столько с самой ошибкой, сколько с ожидаемой оценкой и отвержением.',
        moderate:
          '{name}, если отделить фактическую ошибку от фантазий о катастрофических последствиях, страх часто становится более управляемым.',
        hard: '{name}, значительная часть страха ошибок связана с прошлым опытом оценивания, а не с текущей ситуацией.',
      },
    },
  },
  {
    id: 'psyperfinfo04_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, парадокс: перфекционизм часто замедляет развитие. Из‑за страха сделать “неидеально” человек не пробует новое и не тренируется.',
        moderate:
          '{name}, навык растёт через много “так себе” попыток, а не через одну идеальную. Без ошибок обучение почти невозможно.',
        hard: '{name}, требование идеала с первого раза блокирует практику, а значит — рост.',
      },
      formal: {
        soft: '{name}, перфекционизм может тормозить развитие, потому что мешает делать первые, несовершенные шаги.',
        moderate:
          '{name}, обучение строится на множестве неидеальных попыток, а не на одном совершенном действии.',
        hard: '{name}, ожидание идеального результата с первого раза блокирует процесс обучения и роста.',
      },
    },
  },
  {
    id: 'psyperfinfo05_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, постоянный внутренний кнут (“мало, не так, позор”) истощает и со временем снижает мотивацию, а не повышает её.',
        moderate:
          '{name}, исследования показывают, что чрезмерная самокритика связана с выгоранием и прокрастинацией, а не с устойчивыми достижениями.',
        hard: '{name}, жёсткая ругань внутри не делает тебя продуктивнее в долгую.',
      },
      formal: {
        soft: '{name}, хроническая самокритика ведёт к истощению и снижению мотивации.',
        moderate:
          '{name}, избыточный внутренний критик часто связан с выгоранием и откладыванием, а не с стабильными успехами.',
        hard: '{name}, жёсткое самобичевание в долгосрочной перспективе ухудшает результаты.',
      },
    },
  },
  {
    id: 'psyperfinfo06_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, “достаточно хорошо” — это не сдаться, а признать реальные ограничения: время, силы, знания, контекст.',
        moderate:
          '{name}, учитывая обстоятельства, иногда 70% усилий — максимум возможного. Это честнее, чем требовать от себя невозможного.',
        hard: '{name}, реалистичная планка — зрелость, а не леность.',
      },
      formal: {
        soft: '{name}, концепция “достаточно хорошо” учитывает реальные ограничения ресурсов и контекста.',
        moderate:
          '{name}, иногда 70% усилий в текущих условиях — объективный максимум, а не “недоработка”.',
        hard: '{name}, реалистичные ожидания от себя — признак зрелости, а не лености.',
      },
    },
  },
  {
    id: 'psyperfinfo07_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, многие успешные проекты начинались с грубых набросков. Важнее было начать и потом дорабатывать, а не ждать идеальной идеи.',
        moderate:
          '{name}, мир редко видит первые версии — он видит доработанные, выросшие из черновиков. Черновик — это начало, а не провал.',
        hard: '{name}, ценность черновика в том, что он существует. Невоплощённый идеал — нет.',
      },
      formal: {
        soft: '{name}, множество успешных результатов начинались с несовершенных черновиков.',
        moderate:
          '{name}, внешне видимая “идеальность” часто скрывает за собой долгий путь доработок, начавшийся с грубых попыток.',
        hard: '{name}, существующий черновик ценнее невоплощённой идеальной идеи.',
      },
    },
  },
  {
    id: 'psyperfinfo08_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, перфекционизм может маскироваться под “высокие стандарты”, но критерий один: остаётся ли место теплу и уважению к себе.',
        moderate:
          '{name}, полезно отличать здоровое стремление к качеству от разрушительного: первое учитывает ресурсы, второе их игнорирует.',
        hard: '{name}, если стандарт лишает тебя сна, здоровья и радости, он уже не про развитие.',
      },
      formal: {
        soft: '{name}, перфекционизм нередко скрывается под формулировкой “высокие стандарты”. Важно учитывать отношение к себе внутри.',
        moderate:
          '{name}, здоровое стремление к качеству учитывает ресурсы и границы, разрушительное — нет.',
        hard: '{name}, если стандарты систематически вредят здоровью и жизни, они требуют пересмотра.',
      },
    },
  },
  {
    id: 'psyperfinfo09_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сравнение “я должен делать как в идеале, иначе нельзя” часто не учитывает твоих реальных условий: времени, поддержки, опыта.',
        moderate:
          '{name}, честная оценка своей стартовой точки и контекста помогает ставить живые, а не фантастические требования.',
        hard: '{name}, стандарты без учёта условий почти всегда будут казаться “недостижимыми”.',
      },
      formal: {
        soft: '{name}, перфекционистские требования часто игнорируют реальные условия: время, поддержку, уровень опыта.',
        moderate:
          '{name}, более честные критерии учитывают отправную точку и контекст, в котором вы находитесь.',
        hard: '{name}, стандарты без учёта условий предсказуемо воспринимаются как недостижимые.',
      },
    },
  },
  {
    id: 'psyperfinfo10_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, перфекционизм часто связан с убеждением “меня можно любить/уважать только за идеальные результаты”. Это очень тяжёлая планка.',
        moderate:
          '{name}, когда ценность завязана только на успехи, любой промах воспринимается как угроза “быть никому не нужным человеком”.',
        hard: '{name}, твоя ценность шире, чем твои достижения.',
      },
      formal: {
        soft: '{name}, перфекционизм нередко опирается на убеждение, что любовь и уважение зависят только от достижений.',
        moderate:
          '{name}, при такой установке любой промах ощущается как угроза собственной значимости.',
        hard: '{name}, ваша ценность как человека не равна сумме ваших успехов.',
      },
    },
  },
  {
    id: 'psyperfinfo11_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, перфекционизм часто соседствует с прокрастинацией: чем страшнее неидеальность, тем труднее вообще начать.',
        moderate:
          '{name}, установка “сделать немного и неидеально” парадоксально помогает уменьшить откладывание и двигаться вперёд.',
        hard: '{name}, разрешая себе черновики, ты снижаешь и перфекционизм, и прокрастинацию.',
      },
      formal: {
        soft: '{name}, перфекционизм нередко приводит к откладыванию задач из‑за страха сделать недостаточно хорошо.',
        moderate:
          '{name}, разрешение на “неидеальные первые шаги” снижает и перфекционизм, и прокрастинацию.',
        hard: '{name}, практика черновиков — эффективный способ уменьшить блокирующий перфекционизм.',
      },
    },
  },
  {
    id: 'psyperfinfo12_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мягкий внутренний диалог не означает отказ от развития. Он создаёт почву, где можно пробовать и расти без парализующей вины.',
        moderate:
          '{name}, самосострадание связано с большей устойчивостью и мотивацией, чем жёсткая самокритика. Поддержка даёт больше сил для изменений.',
        hard: '{name}, доброта к себе — это инструмент роста, а не поблажка.',
      },
      formal: {
        soft: '{name}, доброжелательное отношение к себе не исключает стремления к развитию.',
        moderate:
          '{name}, исследования показывают, что самосострадание связано с большей устойчивостью и мотивацией, чем жёсткая самокритика.',
        hard: '{name}, самоподдержка — ресурс для изменений, а не признак слабости.',
      },
    },
  },
  {
    id: 'psyperfinfo13_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, иногда “быть хорошим человеком” для всех означает быть жёстким к себе. Со временем это разрушает, а не помогает.',
        moderate:
          '{name}, баланс между ожиданиями других и собственными границами — важная часть выхода из перфекционизма.',
        hard: '{name}, твоим границам тоже нужно место, не только чужим ожиданиям.',
      },
      formal: {
        soft: '{name}, стремление соответствовать всем ожиданиям часто идёт в ущерб собственным границам и потребностям.',
        moderate:
          '{name}, поиск баланса между требованиями окружения и заботой о себе — важный шаг в работе с перфекционизмом.',
        hard: '{name}, ваши границы и ресурсы не менее важны, чем чужие ожидания.',
      },
    },
  },
  {
    id: 'psyperfinfo14_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, многие сферы жизни не требуют идеала, чтобы быть ценными: дружба, хобби, отдых. “Хорошо” там часто более чем достаточно.',
        moderate:
          '{name}, попытка сделать идеальными все области сразу лишает сил. Расставление приоритетов помогает уменьшить давление.',
        hard: '{name}, не всё в жизни обязано быть безупречным. Это невозможно.',
      },
      formal: {
        soft: '{name}, далеко не все сферы жизни требуют идеального выполнения, чтобы приносить пользу и радость.',
        moderate:
          '{name}, попытка довести до идеала всё сразу ведёт к истощению. Приоритизация снижает давление.',
        hard: '{name}, не все области жизни должны быть безупречными. Это нереалистичное ожидание.',
      },
    },
  },
  {
    id: 'psyperfinfo15_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, работа с перфекционизмом — не отказ от качества, а переход к более человечным стандартам: с учётом ресурса и права на ошибки.',
        moderate:
          '{name}, постепенно можно выстроить стиль, где ты и стараешься, и не уничтожаешь себя за каждую несовершенность.',
        hard: '{name}, цель — не “стать пофигистом”, а научиться жить без вечной внутренней плётки.',
      },
      formal: {
        soft: '{name}, работа с перфекционизмом не означает отказа от качества, а подразумевает более реалистичные и человечные стандарты.',
        moderate:
          '{name}, со временем можно сформировать стиль, где есть и стремление к развитию, и уважение к собственным границам.',
        hard: '{name}, цель — не безразличие, а жизнь без разрушительной самокритики.',
      },
    },
  },

  // --- MOTIVATIONAL (15) ---
  {
    id: 'psyperfmotiv01_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно потренировать новый подход: “сделать достаточно” вместо “выжать максимум любой ценой”. Это уже шаг к свободе.',
        moderate:
          '{name}, попробуй один раз сознательно остановиться на уровне “достаточно хорошо” и увидеть, что мир не рухнул.',
        hard: '{name}, выбери одну задачу и сделай её просто хорошо. Этого достаточно.',
      },
      formal: {
        soft: '{name}, сегодня можно попробовать подход “достаточно хорошо” вместо привычного максимализма.',
        moderate:
          '{name}, остановитесь на уровне “достаточно” хотя бы в одной задаче и посмотрите на результат.',
        hard: '{name}, выполните одну задачу просто хорошо, не стремясь к идеалу. Это уже практика.',
      },
    },
  },
  {
    id: 'psyperfmotiv02_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно быть ответственным и надёжным, даже если что‑то сделано не безупречно. Эти качества не требуют идеала.',
        moderate:
          '{name}, твоя ценность как человека, друга, специалиста не исчезает от нескольких “неидеальных” задач.',
        hard: '{name}, ты не сводишься к количеству заусенцев в работе.',
      },
      formal: {
        soft: '{name}, вы можете оставаться ответственными и надёжными, даже если результат далёк от идеала.',
        moderate:
          '{name}, ваша ценность как человека и специалиста не определяется несколькими несовершенными задачами.',
        hard: '{name}, вы — больше, чем набор идеально выполненных пунктов.',
      },
    },
  },
  {
    id: 'psyperfmotiv03_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй сегодня говорить с собой на 10% мягче: меньше “какой ужас”, больше “я стараюсь, и это уже что‑то”.',
        moderate:
          '{name}, мягкий внутренний голос не расслабляет до “ничего не делать”. Он даёт опору, чтобы делать устойчиво.',
        hard: '{name}, добавь к критике хотя бы одну фразу поддержки. Это уже другая система.',
      },
      formal: {
        soft: '{name}, попробуйте сегодня снизить жёсткость самокритики хотя бы на 10%, добавив больше признания своих усилий.',
        moderate:
          '{name}, более мягкий внутренний диалог не ведёт к пассивности, а создаёт опору для устойчивой работы.',
        hard: '{name}, добавьте к критическим мыслям одну поддерживающую фразу. Это шаг к новому стилю.',
      },
    },
  },
  {
    id: 'psyperfmotiv04_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно дать себе право на “чуток хуже, чем мог бы”, чтобы сохранить силы на другие важные вещи.',
        moderate:
          '{name}, не всё требует максимума: иногда выгоднее распределить энергию, чем выжать её из себя в одной точке.',
        hard: '{name}, оставь часть сил себе, а не только результату.',
      },
      formal: {
        soft: '{name}, позвольте себе сегодня выполнить что‑то не на максимуме, чтобы сохранить ресурс для других задач.',
        moderate:
          '{name}, разумное распределение энергии эффективнее, чем выжимание максимума из одной задачи.',
        hard: '{name}, сохранение части сил — инвестиция в устойчивость, а не лень.',
      },
    },
  },
  {
    id: 'psyperfmotiv05_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай один шаг “вопреки перфекционизму”: отправить черновик на обратную связь, завершить текст, даже если хочется править дальше.',
        moderate:
          '{name}, наблюдай, что произойдёт, когда ты остановишься не на идеале, а на “готово”. Это и есть эксперимент.',
        hard: '{name}, рискни завершить, а не бесконечно улучшать. Это важный опыт.',
      },
      formal: {
        soft: '{name}, попробуйте сделать сегодня шаг “вопреки перфекционизму”: отправить неидеальный черновик или вовремя остановиться.',
        moderate:
          '{name}, отследите, что реально происходит, когда вы сдаёте работу на уровне “готово”, а не “идеал”.',
        hard: '{name}, завершите задачу, не доводя её до максимума. Это ценный эксперимент.',
      },
    },
  },
  {
    id: 'psyperfmotiv06_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право быть “достаточно хорошим человеком”, а не легендой без единой ошибки. Жить так легче.',
        moderate:
          '{name}, мир нуждается не только в безупречных героях, но и в живых людях, с которыми можно быть по‑человечески.',
        hard: '{name}, не нужно быть идеалом, чтобы оставаться ценным человеком.',
      },
      formal: {
        soft: '{name}, вы имеете право быть достаточно хорошим человеком, а не безупречным образом.',
        moderate:
          '{name}, окружающим нужны не только идеальные герои, но и живые люди, с которыми можно быть настоящими.',
        hard: '{name}, для того чтобы быть ценными, вам не нужно соответствовать идеальному образу.',
      },
    },
  },
  {
    id: 'psyperfmotiv07_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь учиться относиться к ошибке как к информации, а не приговору. “Что я могу вынести?” вместо “какой кошмар я”.',
        moderate:
          '{name}, каждая несовершенность может стать уроком, если ты не тратишь всё топливо на самоунижение.',
        hard: '{name}, переключайся с “я ужасен” на “что мне полезно отсюда взять?”.',
      },
      formal: {
        soft: '{name}, можно рассматривать ошибки как источник информации, а не как приговор.',
        moderate:
          '{name}, вопрос “чему это меня учит?” полезнее, чем “что со мной не так?”.',
        hard: '{name}, переведите фокус с самоуничижения на извлечение уроков.',
      },
    },
  },
  {
    id: 'psyperfmotiv08_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня можно потренировать одну новую установку: “лучше сделано, чем идеально спланировано”.',
        moderate:
          '{name}, попробуй отдать приоритет действию, а не бесконечному улучшению планов. Даже маленький шаг сильнее идеальной мысли.',
        hard: '{name}, выбери действие вместо бесконечного планирования. Хоть маленькое.',
      },
      formal: {
        soft: '{name}, попробуйте установку “лучше сделано достаточно хорошо, чем идеально задумано, но не реализовано”.',
        moderate:
          '{name}, отдайте приоритет реальному действию, даже небольшому, над длительной шлифовкой планов.',
        hard: '{name}, выберите действие, а не бесконечное планирование. Пусть даже маленькое.',
      },
    },
  },
  {
    id: 'psyperfmotiv09_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, заметить свой перфекционизм — уже шаг. Значит, внутри тебя есть часть, которая хочет жить мягче.',
        moderate:
          '{name}, то, что ты читаешь это и размышляешь о “достаточно хорошо”, говорит: ты уже двигаешься к более человечным стандартам.',
        hard: '{name}, твоё желание выйти из жёсткого перфекционизма — уже внутренняя сила.',
      },
      formal: {
        soft: '{name}, осознание своих перфекционистских тенденций — важный первый шаг к изменениям.',
        moderate:
          '{name}, сам факт, что вы интересуетесь темой “достаточно хорошо”, говорит о движении к более реалистичным стандартам.',
        hard: '{name}, ваше стремление снижать разрушительный перфекционизм — признак внутренней силы.',
      },
    },
  },
  {
    id: 'psyperfmotiv10_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь учиться жить в системе, где ошибаться не равно “потерять любовь”. Для этого нужно потихоньку пробовать быть собой, а не только проектом.',
        moderate:
          '{name}, начни с маленьких шагов — показать неидеальный результат, честно признать “не успел”, и заметить, что мир выдерживает это.',
        hard: '{name}, мир часто переносит наши несовершенства лучше, чем наш внутренний критик.',
      },
      formal: {
        soft: '{name}, постепенно можно строить внутреннюю систему, где ошибка не означает потерю любви и уважения.',
        moderate:
          '{name}, начните с небольших шагов по демонстрации неидеальности и отмечайте реальные последствия.',
        hard: '{name}, внешняя реальность обычно терпимее к вашим несовершенствам, чем ваш внутренний критик.',
      },
    },
  },
  {
    id: 'psyperfmotiv11_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно выбрать один участок жизни, где ты сознательно снизишь планку и посмотришь, сколько энергии освободится.',
        moderate:
          '{name}, не надо менять всё сразу. Достаточно одной сферы, где ты разрешишь себе быть “просто нормальным”.',
        hard: '{name}, начни с одной области, где “нормально” будет твоей новой нормой.',
      },
      formal: {
        soft: '{name}, выберите одну сферу, где вы осознанно снизите требования до “достаточно хорошо”.',
        moderate:
          '{name}, не нужно менять всё сразу. Достаточно начать с одного участка жизни.',
        hard: '{name}, в одной области позвольте себе нормальный уровень, а не идеальный.',
      },
    },
  },
  {
    id: 'psyperfmotiv12_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, каждый раз, когда ты выбираешь завершить вместо бесконечной шлифовки, ты учишься освобождать время и для других сторон жизни.',
        moderate:
          '{name}, твоя жизнь — не только про исправление мелких недочётов. В ней есть люди, отдых, интерес, которые тоже заслуживают места.',
        hard: '{name}, не отдавай всё время перфекционизму. Оставь кусочек жизни себе.',
      },
      formal: {
        soft: '{name}, выбор завершить задачу вместо бесконечной доработки освобождает время и ресурс для других важных сфер.',
        moderate:
          '{name}, ваша жизнь включает не только работу над ошибками, но и отношения, отдых и интересы.',
        hard: '{name}, не позволяйте перфекционизму забирать всё пространство вашей жизни.',
      },
    },
  },
  {
    id: 'psyperfmotiv13_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, будущее “я” с благодарностью примет твою сегодняшнюю заботу: меньшую плётку, чуть более реалистичные планы, право на передышку.',
        moderate:
          '{name}, то, как ты обращаешься с собой сейчас, становится для тебя нормой на годы вперёд. Эта система может быть мягче.',
        hard: '{name}, меняя обращение с собой сегодня, ты меняешь качество своей жизни дальше.',
      },
      formal: {
        soft: '{name}, ваше будущее “я” выиграет от того, что вы уже сейчас снижаете избыточную жёсткость к себе.',
        moderate:
          '{name}, текущий стиль обращения с собой со временем становится автоматическим. Его можно сделать более бережным.',
        hard: '{name}, изменения в отношении к себе сегодня влияют на качество вашей жизни в будущем.',
      },
    },
  },
  {
    id: 'psyperfmotiv14_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты можешь быть в процессе — учиться, пробовать, ошибаться — и всё равно быть достойным уважения и доброго отношения.',
        moderate:
          '{name}, не нужно ждать “идеальной версии себя”, чтобы относиться к себе по‑человечески. Забота сейчас ускоряет развитие.',
        hard: '{name}, относись к себе уважительно уже в процессе, а не “когда исправишься”.',
      },
      formal: {
        soft: '{name}, вы можете находиться в процессе обучения и изменений и одновременно быть достойными уважения.',
        moderate:
          '{name}, не обязательно ждать “окончательной версии себя”, чтобы начать относиться к себе по‑доброму.',
        hard: '{name}, относитесь к себе уважительно уже сейчас, а не только “после исправления”.',
      },
    },
  },
  {
    id: 'psyperfmotiv15_new',
    kind: 'therapy',
    entityKey: 'perfectionism',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сегодня достаточно +10% мягкости к себе и −10% требований. Маленький сдвиг, если повторять его часто, создаёт новый стиль жизни.',
        moderate:
          '{name}, спроси: “что я могу сделать на 10% проще и на 10% бережнее к себе?” и попробуй применить это в одной задаче.',
        hard: '{name}, +10% бережности и −10% идеала на сегодня. Этого более чем достаточно.',
      },
      formal: {
        soft: '{name}, сегодня достаточно немного снизить требования и добавить чуть больше мягкости к себе.',
        moderate:
          '{name}, выберите одну задачу и выполните её на 10% проще и бережнее к себе, чем обычно.',
        hard: '{name}, уменьшите идеал хотя бы на 10% и добавьте столько же бережности. Этого достаточно на сегодня.',
      },
    },
  },
  // =========================
  // SOS - 45 templates [NEW]
  // 15 reminder + 15 informational + 15 motivational
  // =========================

  // --- REMINDER (15) ---
  {
    id: 'psysosreminder01_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сейчас важно не разбирать всё по полочкам, а чуть снизить накал. Сделай один медленный вдох и длинный выдох, просто отмечая: “я здесь, я дышу”.',
        moderate:
          '{name}, тревога может быть очень громкой, но сделай сейчас 3 цикла: вдох носом, длинный выдох ртом. Только это.',
        hard: '{name}, остановись на пару секунд и сделай 3 медленных выдоха. Сначала стабилизируемся, потом думаем.',
      },
      formal: {
        soft: '{name}, сейчас важнее немного снизить напряжение, чем всё анализировать. Сделайте один медленный вдох и длинный выдох, отметив: “я здесь, я дышу”.',
        moderate:
          '{name}, выполните 3 цикла: спокойный вдох через нос и более длинный выдох через рот. Этого достаточно на сейчас.',
        hard: '{name}, остановитесь и сделайте 3 медленных выдоха. Сначала стабилизация, потом решения.',
      },
    },
  },
  {
    id: 'psysosreminder02_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй технику “коробочного дыхания”: 4 счёта вдох — 4 задержка — 4 выдох — 4 пауза. Несколько кругов — и тело чуть отпускает.',
        moderate:
          '{name}, сделай 4–6 циклов “4-4-4-4”: вдох, пауза, выдох, пауза по 4 счёта каждый. Это помогает вернуть контроль над дыханием.',
        hard: '{name}, включи “коробку”: 4 вдох — 4 задержка — 4 выдох — 4 пауза. Повтори несколько раз.',
      },
      formal: {
        soft: '{name}, попробуйте “коробочное дыхание”: вдох на 4 счёта, задержка на 4, выдох на 4, пауза на 4.',
        moderate:
          '{name}, выполните 4–6 циклов дыхания 4-4-4-4, чтобы чуть снизить физиологическое напряжение.',
        hard: '{name}, используйте схему 4-4-4-4: вдох, задержка, выдох, пауза по 4 счёта каждый.',
      },
    },
  },
  {
    id: 'psysosreminder03_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сделай мини‑заземление “5-4-3-2-1”: 5 предметов, которые видишь, 4 звука, которые слышишь, 3 тактильных ощущения, 2 запаха, 1 вкус.',
        moderate:
          '{name}, переключи внимание: посмотри вокруг и по схеме “5-4-3-2-1” назови для себя, что видишь, слышишь, чувствуешь.',
        hard: '{name}, включи упражнение 5-4-3-2-1: 5 вижу, 4 слышу, 3 чувствую телом, 2 запаха, 1 вкус.',
      },
      formal: {
        soft: '{name}, попробуйте упражнение “5-4-3-2-1”: перечислите 5 увиденных предметов, 4 звука, 3 ощущения, 2 запаха и 1 вкус.',
        moderate:
          '{name}, это заземление “5-4-3-2-1” мягко возвращает внимание в текущий момент через органы чувств.',
        hard: '{name}, используйте технику “5-4-3-2-1”, чтобы вернуть внимание в здесь-и-сейчас через зрение, слух и тело.',
      },
    },
  },
  {
    id: 'psysosreminder04_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, обрати внимание на опору: почувствуй, как ноги стоят на полу, а тело опирается на стул или кровать. Напомни себе: “подо мной есть опора”.',
        moderate:
          '{name}, сожми ступнями пол или носки, слегка нажми спиной на поверхность. Дай нервной системе сигнал: “я держусь”.',
        hard: '{name}, почувствуй пол под ногами и спинку под спиной. Найди опору телом.',
      },
      formal: {
        soft: '{name}, обратите внимание на опору: почувствуйте контакт стоп с полом и тела с поверхностью, на которой вы сидите или лежите.',
        moderate:
          '{name}, немного усильте давление стоп в пол или спины в опору, чтобы тело ощутило стабильность.',
        hard: '{name}, найдите телесную опору: пол под ногами, спинка стула или кровать под вами.',
      },
    },
  },
  {
    id: 'psysosreminder05_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сейчас можно сократить задачу до минимума: “мне нужно просто пережить ближайшие 10 минут”. Остальное — потом.',
        moderate:
          '{name}, вместо “как жить дальше” возьми фокус “как прожить следующий кусочек времени”. Сильная тревога не про всю жизнь сразу.',
        hard: '{name}, не решай сейчас всю жизнь. Сейчас задача — выдержать этот отрезок.',
      },
      formal: {
        soft: '{name}, сузьте горизонт: сейчас достаточно пережить ближайшие несколько минут, а не решать весь день или жизнь.',
        moderate:
          '{name}, смена фокуса с “всего будущего” на “ближайший промежуток” снижает перегрузку.',
        hard: '{name}, ограничьте задачу: выдержать этот период, а не всё сразу.',
      },
    },
  },
  {
    id: 'psysosreminder06_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если мысли мчатся, попробуй вслух или про себя проговаривать: “вдох… выдох…” и считать выдохи до 10.',
        moderate:
          '{name}, сделай фокусировку на выдохах: считай каждый выдох до 10 и начинай заново. Это немного замедляет внутреннюю гонку.',
        hard: '{name}, считай выдохи до 10, концентрируясь только на них.',
      },
      formal: {
        soft: '{name}, при сильном потоке мыслей попробуйте считать свои выдохи до 10, сопровождая их мысленным “вдох… выдох…”.',
        moderate:
          '{name}, концентрация на счёте выдохов помогает немного замедлить внутренний разгон.',
        hard: '{name}, сосчитайте 10 выдохов, удерживая внимание только на дыхании.',
      },
    },
  },
  {
    id: 'psysosreminder07_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй холод: умыться прохладной водой, подержать ладони под краном или приложить что‑то прохладное к шее. Это помогает “перезагрузить” тело.',
        moderate:
          '{name}, краткий контакт с прохладной водой или предметом может снизить интенсивность паники в теле.',
        hard: '{name}, умывайся прохладной водой или охлади ладони. Это быстрая телесная помощь.',
      },
      formal: {
        soft: '{name}, используйте прохладную воду: умыться, подержать руки под струёй или приложить к шее.',
        moderate:
          '{name}, краткое охлаждение помогает немного “перезагрузить” нервную систему и снизить накал.',
        hard: '{name}, умывание прохладной водой может быстро снизить телесное напряжение.',
      },
    },
  },
  {
    id: 'psysosreminder08_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если можешь, назови вслух три вещи: “меня зовут…”, “сейчас … (день недели/время)”, “я нахожусь в… (комната/город)”. Это возвращает в реальность.',
        moderate:
          '{name}, ориентация: кто ты, где ты, какой день и время — простая, но рабочая техника вернуть мозг в “здесь и сейчас”.',
        hard: '{name}, проговори: как тебя зовут, где ты и какой сейчас день/примерное время.',
      },
      formal: {
        soft: '{name}, произнесите: “меня зовут…”, “сейчас … (день недели/время)”, “я нахожусь в…”. Это помогает сориентироваться в реальности.',
        moderate:
          '{name}, простая вербализация “кто я, где я, какое сейчас время” заземляет и снижает ощущение нереальности.',
        hard: '{name}, вслух назовите своё имя, место и текущий день/время.',
      },
    },
  },
  {
    id: 'psysosreminder09_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сожми ладонью какой‑то предмет — кружку, подушку, ткань — и почувствуй его форму, вес, температуру. Это маленькое заземление.',
        moderate:
          '{name}, направь внимание в руку: сжимай и разжимай предмет, отмечая ощущения. Так часть энергии выходит из головы в тело.',
        hard: '{name}, возьми любой предмет в руку и ощути его максимально подробно.',
      },
      formal: {
        soft: '{name}, возьмите в руку любой предмет и обратите внимание на его форму, текстуру и температуру.',
        moderate:
          '{name}, фокус на тактильных ощущениях (сжимать и разжимать предмет) помогает вывести часть напряжения из мыслей в тело.',
        hard: '{name}, удерживайте предмет в руке, исследуя его ощущениями. Это простой способ заземления.',
      },
    },
  },
  {
    id: 'psysosreminder10_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, напомни себе: “прямо сейчас я в безопасности настолько, насколько могу быть в этой точке”. Этой фразы иногда хватает, чтобы отступить на шаг от паники.',
        moderate:
          '{name}, тревога часто кричит “опасность везде”, но посмотри вокруг и найди хотя бы 3 признака относительной безопасности здесь и сейчас.',
        hard: '{name}, отметь: “прямо сейчас со мной ничего не происходит, я здесь, в этой комнате/месте”.',
      },
      formal: {
        soft: '{name}, скажите себе: “прямо сейчас я в той степени безопасности, которая доступна в этой точке”.',
        moderate:
          '{name}, найдите три признака относительной безопасности вокруг: стены, двери, люди, освещённость.',
        hard: '{name}, отметьте, что в данный момент непосредственной угрозы нет, вы находитесь в конкретном месте.',
      },
    },
  },
  {
    id: 'psysosreminder11_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сильная тревога часто делает мысли очень громкими. Сейчас не обязательно им верить, достаточно чуть замедлить тело.',
        moderate:
          '{name}, отдели факты от мыслей: факт — “сердце бьётся быстро”, мысль — “я не справлюсь”. С телом мы сейчас и поработаем.',
        hard: '{name}, не спорь с тревожными мыслями, займись дыханием и телом. Мозг подтянется позже.',
      },
      formal: {
        soft: '{name}, при сильной тревоге мысли могут быть искажёнными. Сейчас важнее немного успокоить тело, чем спорить с мыслями.',
        moderate:
          '{name}, разделите факты (телесные ощущения) и мысли (оценки). Сначала поработаем с телом.',
        hard: '{name}, переключитесь с анализа мыслей на простые телесные техники. Когнитивная часть подтянется позже.',
      },
    },
  },
  {
    id: 'psysosreminder12_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если очень страшно, можно написать или сказать кому‑то пару слов: “мне плохо, можешь просто немного побыть со мной?”. Не нужно тянуть это в одиночку.',
        moderate:
          '{name}, выбери одного человека, кому можешь дать короткий сигнал: “сейчас тяжело, мне нужно просто ваше присутствие/сообщение”.',
        hard: '{name}, ты имеешь право попросить: “мне сейчас плохо, побудь со мной, без советов”.',
      },
      formal: {
        soft: '{name}, при сильной тревоге вы можете обратиться к кому‑то с коротким сообщением: “мне сейчас тяжело, побудьте немного рядом?”.',
        moderate:
          '{name}, один небольшой контакт с надёжным человеком уже может снизить чувство одиночества в этом состоянии.',
        hard: '{name}, вы имеете право просить о присутствии, а не только о решениях.',
      },
    },
  },
  {
    id: 'psysosreminder13_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, попробуй медленно описать 3 предмета вокруг так, будто объясняешь их человеку по телефону: цвет, форма, размер. Это переключает мозг.',
        moderate:
          '{name}, когда ты сознательно описываешь детали вокруг, часть ресурса уходит из тревожных сцен в голову на текущую реальность.',
        hard: '{name}, выбери 3 вещи и подробно опиши их про себя. Это фокус на “здесь”.',
      },
      formal: {
        soft: '{name}, опишите для себя три предмета вокруг: цвет, форму, размер, текстуру, как если бы рассказывали об этом другому.',
        moderate:
          '{name}, детальное описание текущих объектов помогает переключить внимание с тревожных сценариев на реальность.',
        hard: '{name}, выберите три объекта и подробно опишите их в уме.',
      },
    },
  },
  {
    id: 'psysosreminder14_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, напоминание: тревожная волна всегда имеет пик и спад. Твоя задача — помочь себе пройти через волну, а не победить её силой мысли.',
        moderate:
          '{name}, сейчас важно переждать гребень волны, используя дыхание и заземление. Она не длится вечно, даже если ощущается так.',
        hard: '{name}, у любой тревоги есть начало, пик и спад. Твоя задача — выдержать, а не быть “идеально спокойным”.',
      },
      formal: {
        soft: '{name}, тревожная реакция развивается волнообразно: усиливается и затем снижается.',
        moderate:
          '{name}, ваша задача — помочь себе пройти через пик с помощью дыхания и заземления, а не полностью “выключить” тревогу.',
        hard: '{name}, у тревоги есть пик и спад; важно выдержать волну, а не добиться полной идеальной спокойности.',
      },
    },
  },
  {
    id: 'psysosreminder15_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сейчас достаточно одного маленького шага: 10 дыханий, глоток воды, прохладная вода на руки, взгляд по комнате. Выбери что‑то одно.',
        moderate:
          '{name}, не нужно сразу делать все техники. Одна посильная практика лучше, чем идеальный план в голове.',
        hard: '{name}, выбери одну SOS‑технику и сделай её. Этого достаточно.',
      },
      formal: {
        soft: '{name}, сейчас достаточно выполнить одну небольшую технику: несколько дыханий, глоток воды или заземление взглядом.',
        moderate:
          '{name}, одна посильная практика помогает больше, чем желание сделать сразу всё идеально.',
        hard: '{name}, выберите одну SOS‑технику и примените её. Этого достаточно на сейчас.',
      },
    },
  },

  // --- INFORMATIONAL (15) ---
  {
    id: 'psysosinfo01_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, при сильной тревоге тело включает режим “угроза”, даже если реальной опасности нет. Быстрый пульс, дрожь и жар — нормальные реакции системы.',
        moderate:
          '{name}, то, что ты чувствуешь в теле (сердце, дыхание, напряжение), — работа нервной системы, а не “сумасшествие”.',
        hard: '{name}, телу сейчас кажется, что есть угроза. Эти симптомы — защитная реакция, а не поломка.',
      },
      formal: {
        soft: '{name}, при сильной тревоге организм переходит в режим реагирования на угрозу, даже если объективной опасности нет.',
        moderate:
          '{name}, учащённое сердцебиение, дрожь и напряжение — это работа нервной системы, а не “сумасшествие”.',
        hard: '{name}, воспринимаемая угрозой реакция тела является защитным механизмом, а не признаком поломки.',
      },
    },
  },
  {
    id: 'psysosinfo02_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, длинный выдох активирует парасимпатическую систему — ту часть нервной системы, которая отвечает за успокоение.',
        moderate:
          '{name}, когда выдох чуть длиннее вдоха, тело получает сигнал “можно немного отпустить тревогу”. Поэтому дыхательные техники так важны.',
        hard: '{name}, удлинённый выдох — это прямой телесный способ чуть уменьшить тревогу.',
      },
      formal: {
        soft: '{name}, удлинённый выдох активирует парасимпатическую нервную систему, связанную с расслаблением.',
        moderate:
          '{name}, дыхание с более длинным выдохом даёт организму сигнал о возможности снижения уровня тревоги.',
        hard: '{name}, техники с акцентом на выдох — один из самых быстрых физиологических способов стабилизации.',
      },
    },
  },
  {
    id: 'psysosinfo03_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, заземляющие упражнения (про чувства, опору, предметы вокруг) помогают мозгу переключиться из тревожных сценариев в контакт с реальностью.',
        moderate:
          '{name}, когда ты замечаешь цвета, звуки, ощущения, ты как будто говоришь нервной системе: “мы сейчас здесь, а не в страшных картинках в голове”.',
        hard: '{name}, фокус на “что я вижу/слышу/чувствую” возвращает из панических сценариев в текущий момент.',
      },
      formal: {
        soft: '{name}, заземление через органы чувств помогает переключить внимание с тревожных мыслей на реальное окружение.',
        moderate:
          '{name}, фиксация на зрении, слухе и телесных ощущениях снижает вовлечённость в внутренние страшные сценарии.',
        hard: '{name}, концентрация на “здесь и сейчас” через чувства — эффективный способ уменьшить паническое переживание.',
      },
    },
  },
  {
    id: 'psysosinfo04_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мысль “мне станет плохо навсегда” при панике — часть самой паники. В действительности пик приступа ограничен по времени.',
        moderate:
          '{name}, приступы острой тревоги и паники обычно имеют максимум и затем идут на спад, хотя в момент кажется, что это бесконечно.',
        hard: '{name}, ощущение “никогда не отпустит” — симптом паники, а не факт.',
      },
      formal: {
        soft: '{name}, ощущение бесконечности приступа является частью панического переживания.',
        moderate:
          '{name}, панические эпизоды имеют временные рамки: интенсивность нарастает, достигает пика и постепенно снижается.',
        hard: '{name}, убеждение, что “так будет всегда”, — проявление паники, а не объективная реальность.',
      },
    },
  },
  {
    id: 'psysosinfo05_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, спорить с тревожными мыслями в разгар приступа почти бесполезно. Гораздо эффективнее в этот момент дышать и заземляться.',
        moderate:
          '{name}, когнитивные техники лучше срабатывают, когда накал немного спал. В момент SOS в фокусе — тело и “здесь и сейчас”.',
        hard: '{name}, сначала стабилизация тела, потом разговоры с мыслями. Не наоборот.',
      },
      formal: {
        soft: '{name}, во время острого приступа тревоги попытки логически переубедить себя малоэффективны.',
        moderate:
          '{name}, сначала рекомендуется снизить физиологическое возбуждение, а затем подключать работу с мыслями.',
        hard: '{name}, при SOS‑состояниях приоритет у телесных и заземляющих техник, а не у анализа.',
      },
    },
  },
  {
    id: 'psysosinfo06_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, небольшие физические действия (сжать-расслабить мышцы, пройтись по комнате, потянуться) помогают вывести часть напряжения изнутри наружу.',
        moderate:
          '{name}, когда мышцы получают возможность чуть поработать и расслабиться, сигнал тревоги в теле становится слабее.',
        hard: '{name}, короткое движение тела может снизить накал тревоги сильнее, чем ещё один круг тревожных мыслей.',
      },
      formal: {
        soft: '{name}, лёгкая физическая активность и напряжение/расслабление мышц помогают уменьшить внутреннее напряжение.',
        moderate:
          '{name}, работа с мышцами даёт телу сигнал, что интенсивная реакция может завершаться.',
        hard: '{name}, краткие движения и мышечные упражнения — полезное дополнение к дыханию при SOS‑состояниях.',
      },
    },
  },
  {
    id: 'psysosinfo07_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, мозг в тревоге часто предлагает катастрофические сценарии “что если…”. Это не прогноз, а защита, которая пытается “подготовить” ко всему.',
        moderate:
          '{name}, сами по себе мысли “а вдруг” ещё не реальность. Важно отличать факты от фантазий, даже если фантазии очень яркие.',
        hard: '{name}, яркая страшная картинка в голове — не доказательство, что так и будет.',
      },
      formal: {
        soft: '{name}, при тревоге ум склонен продуцировать катастрофические сценарии как форму защиты.',
        moderate:
          '{name}, “что если…”-мысли являются мыслями, а не фактами, даже если переживаются очень убедительно.',
        hard: '{name}, яркость тревожных представлений не делает их предсказаниями реальности.',
      },
    },
  },
  {
    id: 'psysosinfo08_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, простые фразы вроде “сейчас волна, она пройдёт”, “я делаю маленькие шаги, чтобы помочь себе” помогают снизить ощущение беспомощности.',
        moderate:
          '{name}, внутренний диалог в стиле поддержки, а не критики, даёт нервной системе сигнал, что рядом есть “внутренний взрослый”.',
        hard: '{name}, поддерживающие фразы — это не слабость, а способ перестать оставлять себя одного на один с тревогой.',
      },
      formal: {
        soft: '{name}, мягкие самоподдерживающие фразы уменьшают ощущение полной беспомощности при тревоге.',
        moderate:
          '{name}, внутренний голос, который поддерживает, а не критикует, способствует стабилизации состояния.',
        hard: '{name}, самоподдержка в речи — важный ресурс в SOS‑моментах.',
      },
    },
  },
  {
    id: 'psysosinfo09_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, заранее продуманный “SOS‑набор” (2–3 любимых упражнения, вода, контакт человека) облегчает момент, когда уже “накрыло”.',
        moderate:
          '{name}, когда есть готовый план “что делать при сильной тревоге”, мозгу чуть спокойнее — есть ощущение контроля.',
        hard: '{name}, подготовленный алгоритм SOS снижает панику “я не знаю, что делать”.',
      },
      formal: {
        soft: '{name}, заранее составленный набор SOS‑шагов облегчает использование техник в остром состоянии.',
        moderate:
          '{name}, наличие плана действий при сильной тревоге уменьшает чувство полной потери контроля.',
        hard: '{name}, чёткий алгоритм SOS уменьшает растерянность в критический момент.',
      },
    },
  },
  {
    id: 'psysosinfo10_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не обязательно ждать, когда тревога станет невыносимой, чтобы пользоваться дыханием и заземлением. Их можно применять при первых признаках.',
        moderate:
          '{name}, раннее использование SOS‑техник часто не даёт приступу разогнаться до максимума.',
        hard: '{name}, чем раньше подключаешь техники, тем мягче проходит волна.',
      },
      formal: {
        soft: '{name}, дыхательные и заземляющие техники полезно применять уже при первых признаках усиления тревоги.',
        moderate:
          '{name}, раннее вмешательство снижает вероятность развития максимально интенсивного приступа.',
        hard: '{name}, использование SOS‑приёмов на ранних этапах делает волну тревоги более управляемой.',
      },
    },
  },
  {
    id: 'psysosinfo11_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, иногда тревога связана с реальными сложностями, но даже тогда сначала нужно стабилизировать тело, а потом решать задачи.',
        moderate:
          '{name}, думать стратегически в режиме паники трудно — мозг занят выживанием. SOS‑техники возвращают доступ к более трезвому мышлению.',
        hard: '{name}, сначала “снять пожар”, потом решать вопросы. Это не бегство, а правильная последовательность.',
      },
      formal: {
        soft: '{name}, даже если тревога связана с реальными проблемами, их лучше решать после частичной стабилизации состояния.',
        moderate:
          '{name}, при высоком уровне тревоги способность к трезвому анализу снижается, и SOS‑техники помогают её восстановить.',
        hard: '{name}, сначала снижение острого реагирования, затем — работа с ситуацией. Это рациональный порядок шагов.',
      },
    },
  },
  {
    id: 'psysosinfo12_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, у разных людей работают разные техники: кому‑то подходит дыхание, кому‑то — движение, кому‑то — холод или опора на звук. Это нормально.',
        moderate:
          '{name}, важно экспериментировать и постепенно собирать свой личный набор SOS‑инструментов.',
        hard: '{name}, если одна техника не откликается, это не провал. Ищи свои способы.',
      },
      formal: {
        soft: '{name}, эффективность конкретных SOS‑техник индивидуальна: кому‑то больше помогает дыхание, кому‑то — заземление или движение.',
        moderate:
          '{name}, полезно со временем собрать собственный набор работающих приёмов.',
        hard: '{name}, отсутствие эффекта от одной техники не означает, что другие способы не сработают.',
      },
    },
  },
  {
    id: 'psysosinfo13_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, даже если в момент паники кажется, что “я схожу с ума”, это типичная мысль при сильной тревоге. Она не означает реальную потерю рассудка.',
        moderate:
          '{name}, панические симптомы очень пугают, но сами по себе они не приводят к “сойти с ума” или “умереть от паники”.',
        hard: '{name}, паника неприятна, но не смертельна и не “сводит с ума”.',
      },
      formal: {
        soft: '{name}, мысль “я схожу с ума” часто сопровождает панические эпизоды, но не отражает фактического состояния психики.',
        moderate:
          '{name}, панические приступы крайне неприятны, но сами по себе не приводят к смерти или психотическому расстройству.',
        hard: '{name}, паника безопасна в плане физического и психического “надлома”, хотя и очень дискомфортна.',
      },
    },
  },
  {
    id: 'psysosinfo14_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если SOS‑состояния повторяются часто или сильно мешают жить, это повод не ругать себя, а подумать о дополнительной профессиональной поддержке.',
        moderate:
          '{name}, регулярная сильная тревога — это нагрузка, с которой не обязательно справляться в одиночку. Есть специалисты и сервисы, которые помогают.',
        hard: '{name}, частые тяжёлые приступы тревоги — уважительная причина обратиться к психотерапевту или врачу.',
      },
      formal: {
        soft: '{name}, частые или очень интенсивные SOS‑состояния являются поводом задуматься о профессиональной помощи.',
        moderate:
          '{name}, обращаться за поддержкой к психологам или врачам при регулярной сильной тревоге — нормальная и ответственная стратегия.',
        hard: '{name}, повторяющиеся тяжёлые приступы тревоги — достаточное основание для обращения за профессиональной помощью.',
      },
    },
  },
  {
    id: 'psysosinfo15_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'informational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, SOS‑техники не делают жизнь стерильно спокойной, но помогают переживать пики тревоги мягче и безопаснее для здоровья.',
        moderate:
          '{name}, постепенная тренировка таких приёмов делает тебя устойчивее к стрессу в долгую.',
        hard: '{name}, каждый раз, когда ты применяешь технику, ты тренируешь нервную систему справляться.',
      },
      formal: {
        soft: '{name}, SOS‑техники не убирают стресс полностью, но позволяют проходить через его пики мягче.',
        moderate:
          '{name}, повторяющаяся практика техник стабилизации повышает устойчивость к тревоге со временем.',
        hard: '{name}, каждое использование SOS‑приёмов — это тренировка нервной системы адаптироваться к нагрузке.',
      },
    },
  },

  // --- MOTIVATIONAL (15) ---
  {
    id: 'psysosmotiv01_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты уже делаешь что‑то важное — ищешь способ помочь себе в тяжёлом состоянии. Это не слабость, а забота.',
        moderate:
          '{name}, каждый раз, когда вместо того чтобы просто терпеть, ты применяешь технику, ты становишься для себя опорой.',
        hard: '{name}, то, что ты вообще пытаешься себе помочь, — уже сила.',
      },
      formal: {
        soft: '{name}, то, что вы ищете способы поддержать себя в тяжёлые моменты, уже является важным шагом.',
        moderate:
          '{name}, использование техник вместо пассивного терпения — проявление заботы о себе и личной ответственности.',
        hard: '{name}, сама попытка помочь себе говорит о вашей внутренней силе.',
      },
    },
  },
  {
    id: 'psysosmotiv02_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, не нужно “держаться идеально” в такие моменты. Достаточно маленьких шагов: дышать, опираться, переждать волну.',
        moderate:
          '{name}, планка “быть всегда спокойным” нереалистична. Гораздо честнее — “я делаю посильные шаги, когда мне тяжело”.',
        hard: '{name}, не нужно быть идеальным в тревоге. Нужно быть живым.',
      },
      formal: {
        soft: '{name}, в такие моменты от вас не требуется идеальная выдержка. Достаточно посильных шагов.',
        moderate:
          '{name}, реалистичная цель — не “никогда не тревожиться”, а уметь поддерживать себя при тревоге.',
        hard: '{name}, вам не нужно быть идеальными, важно оставаться живыми и поддержанными.',
      },
    },
  },
  {
    id: 'psysosmotiv03_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно относиться к себе так, как ты бы отнёсся к другу в панике: без “соберись”, с присутствием и теплом.',
        moderate:
          '{name}, попробуй сказать себе слова, которые сказал бы близкому человеку: “я рядом с собой, давай потихоньку дышать”.',
        hard: '{name}, будь сейчас себе другом, а не критиком.',
      },
      formal: {
        soft: '{name}, вы можете обращаться с собой так, как отнеслись бы к близкому человеку в панике: с участием и без давления.',
        moderate:
          '{name}, произнесите в свой адрес слова поддержки, которые сказали бы другому, переживающему тревогу.',
        hard: '{name}, выберите позицию внутреннего союзника, а не внутреннего критика.',
      },
    },
  },
  {
    id: 'psysosmotiv04_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, каждый небольшой опыт “мне удалось справиться с волной” добавляет по миллиметру уверенности, что это можно выдерживать.',
        moderate:
          '{name}, сейчас может казаться, что ты очень хрупкий, но уже были моменты, когда ты держался. Этот — ещё один.',
        hard: '{name}, ты уже переживал тяжёлые состояния. У тебя есть опыт выдерживать.',
      },
      formal: {
        soft: '{name}, каждый раз, когда вы проходите через тревожную волну, вы накапливаете опыт справляться.',
        moderate:
          '{name}, даже если вам кажется, что вы очень уязвимы, факты говорят о том, что вы уже выдерживали подобные состояния.',
        hard: '{name}, наличие опыта переживания тяжёлых эпизодов говорит о вашей устойчивости.',
      },
    },
  },
  {
    id: 'psysosmotiv05_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сейчас достаточно сделать что‑то маленькое: 10 дыханий, одно заземление, один звонок. Это уже действие, не бездействие.',
        moderate:
          '{name}, не обесценивай маленькие шаги — именно из них со временем складывается ощущение “я могу себе помочь”.',
        hard: '{name}, один маленький шаг сегодня — это много.',
      },
      formal: {
        soft: '{name}, небольшой шаг (несколько дыханий, короткое упражнение) уже является значимым действием.',
        moderate:
          '{name}, именно последовательные маленькие действия формируют ощущение собственной способности справляться.',
        hard: '{name}, один посильный шаг в таком состоянии — серьёзный вклад.',
      },
    },
  },
  {
    id: 'psysosmotiv06_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, ты имеешь право искать поддержку — у людей, у специалистов, в техниках. Не нужно быть “самодостаточным роботом”.',
        moderate:
          '{name}, просить помощи и опираться на других в тревоге — это зрелость, а не слабость.',
        hard: '{name}, опора на других в SOS‑момент — нормальная человеческая потребность.',
      },
      formal: {
        soft: '{name}, вы имеете право опираться на других людей и специалистов в тяжёлые моменты.',
        moderate:
          '{name}, обращение за поддержкой при сильной тревоге — проявление ответственности за себя.',
        hard: '{name}, поиск помощи в SOS‑состояниях — нормальный и здоровый шаг.',
      },
    },
  },
  {
    id: 'psysosmotiv07_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, когда ты учишься техникам стабилизации, ты словно обучаешь мозг новой реакции: не только паниковать, но и помогать себе.',
        moderate:
          '{name}, каждая практика — это “тренировка нервной системы”, а не просто случайный жест. Ты усиливаешь свои навыки.',
        hard: '{name}, сейчас ты не просто терпишь, ты тренируешь новый способ реагировать.',
      },
      formal: {
        soft: '{name}, тренируя техники стабилизации, вы формируете у мозга альтернативные реакции, кроме паники.',
        moderate:
          '{name}, каждое использование SOS‑приёмов — это вклад в ваш навык справляться, а не разовый жест.',
        hard: '{name}, вы сейчас не просто “выживаете”, вы обучаете свою нервную систему новому способу реагирования.',
      },
    },
  },
  {
    id: 'psysosmotiv08_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно поставить себе задачу не “убрать тревогу”, а “сделать её на пару процентов терпимее”. Так к себе проще относиться.',
        moderate:
          '{name}, цель “чуть легче, чем было 5 минут назад” реалистичнее, чем “мне должно стать идеально спокойно”.',
        hard: '{name}, достаточно, если станет хоть немного легче. Не гонись за идеально нулевой тревогой.',
      },
      formal: {
        soft: '{name}, более мягкая цель — не полностью убрать тревогу, а сделать её чуть менее интенсивной.',
        moderate:
          '{name}, фокус на небольшом уменьшении дискомфорта делает задачу более выполнимой.',
        hard: '{name}, даже небольшое снижение напряжения — уже важный результат.',
      },
    },
  },
  {
    id: 'psysosmotiv09_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твоя ценность не измеряется тем, насколько спокойно ты умеешь реагировать. Ты ценен и в своём волнении.',
        moderate:
          '{name}, тревога не делает тебя “плохим” или “неправильным”. Она говорит о чувствительности и нагрузке.',
        hard: '{name}, с тревогой ты всё равно остаёшься достойным уважения человеком.',
      },
      formal: {
        soft: '{name}, ваша ценность не зависит от уровня вашей тревожности.',
        moderate:
          '{name}, наличие тревоги говорит о вашей чувствительности и текущей нагрузке, а не о “несостоятельности”.',
        hard: '{name}, даже в состояниях тревоги вы остаётесь человеком, достойным уважения и поддержки.',
      },
    },
  },
  {
    id: 'psysosmotiv10_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, можно представить, что внутри есть часть, которая боится, и часть, которая может её поддержать. Сейчас ты тренируешь эту поддерживающую часть.',
        moderate:
          '{name}, каждый раз, когда ты мягко говоришь себе “давай подышим, я рядом”, ты становишься для себя тем, кого, возможно, когда‑то не хватало.',
        hard: '{name}, ты можешь быть себе опорой, даже когда страшно.',
      },
      formal: {
        soft: '{name}, можно относиться к своей тревожной части с поддержкой, как к испуганному ребёнку внутри.',
        moderate:
          '{name}, когда вы говорите себе “я рядом, давай попробуем подышать”, вы становитесь для себя внутренней опорой.',
        hard: '{name}, вы способны быть себе поддерживающей стороной, даже при сильной тревоге.',
      },
    },
  },
  {
    id: 'psysosmotiv11_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, со временем такие SOS‑шаги могут стать автоматическими, и каждую следующую волну будет переживать чуть проще.',
        moderate:
          '{name}, то, что сейчас кажется “очень тяжёлым”, может стать более управляемым, если регулярно тренировать навыки стабилизации.',
        hard: '{name}, это состояние не обречено быть всегда таким же тяжёлым. Навыки меняют картину.',
      },
      formal: {
        soft: '{name}, при регулярной практике SOS‑приёмы становятся более автоматическими и доступными.',
        moderate:
          '{name}, навыки стабилизации помогают с течением времени переживать тревожные волны менее тяжело.',
        hard: '{name}, ваше состояние имеет потенциал становиться более управляемым благодаря новым навыкам.',
      },
    },
  },
  {
    id: 'psysosmotiv12_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, сейчас можно снизить требования к себе до минимума: “достаточно, что я дышу и делаю маленькие шаги”. Этого правда достаточно.',
        moderate:
          '{name}, ты уже говоришь себе “как мне помочь?”, а не только “что со мной не так?”. Это важный сдвиг.',
        hard: '{name}, ты делаешь больше, чем просто страдать — ты ищешь способы поддержки. Это много.',
      },
      formal: {
        soft: '{name}, сейчас достаточно того, что вы дышите и делаете небольшие шаги по самоподдержке.',
        moderate:
          '{name}, переход от вопроса “что со мной не так?” к “как я могу себе помочь?” — значимое изменение.',
        hard: '{name}, вы уже действуете в сторону поддержки, а не только переживаете — это важно.',
      },
    },
  },
  {
    id: 'psysosmotiv13_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, если получится, отметь любое небольшое улучшение: “стало на каплю легче”, “дыхание чуть ровнее”. Это подтверждение, что ты влияешь на своё состояние.',
        moderate:
          '{name}, фиксируя маленькие изменения в сторону облегчения, ты укрепляешь веру “я не совсем безоружен перед тревогой”.',
        hard: '{name}, замечай даже крошечные улучшения — это доказательства твоих возможностей.',
      },
      formal: {
        soft: '{name}, фиксация даже небольших улучшений (дыхание, напряжение) укрепляет чувство влияния на своё состояние.',
        moderate:
          '{name}, отмечая малые изменения, вы поддерживаете убеждение, что не полностью беспомощны перед тревогой.',
        hard: '{name}, замеченные улучшения — это ваши доказательства способности влиять на своё состояние.',
      },
    },
  },
  {
    id: 'psysosmotiv14_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, твоя жизнь не сводится только к этим тревожным эпизодам, даже если сейчас они занимают много места.',
        moderate:
          '{name}, помимо тревоги, в тебе есть и другие части — умеющие любить, интересоваться, радоваться. Им тоже со временем можно будет дать место.',
        hard: '{name}, это важная часть твоего опыта, но не вся ты целиком.',
      },
      formal: {
        soft: '{name}, ваша жизнь не ограничивается только периодами сильной тревоги.',
        moderate:
          '{name}, помимо тревожных переживаний у вас есть и другие стороны — интерес, тепло, способность к радости.',
        hard: '{name}, SOS‑состояния — лишь часть вашей истории, а не вся идентичность.',
      },
    },
  },
  {
    id: 'psysosmotiv15_new',
    kind: 'therapy',
    entityKey: 'sos',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: '{name}, на сегодня достаточно добавить +10% заботы к себе: чуть мягче говорить с собой, сделать одну технику, разрешить себе усталость.',
        moderate:
          '{name}, спроси: “что поможет мне пережить этот момент на 10% мягче к себе?” и сделай это, если можешь.',
        hard: '{name}, +10% бережности к себе в такой момент — уже серьёзный шаг.',
      },
      formal: {
        soft: '{name}, на сегодня достаточно немного добавить заботы к себе: мягче внутренняя речь, одна техника, разрешение на усталость.',
        moderate:
          '{name}, задайте вопрос: “что сделает этот момент на 10% мягче для меня?” и реализуйте это, если возможно.',
        hard: '{name}, небольшое увеличение бережности к себе в SOS‑состоянии — уже значимое достижение.',
      },
    },
  },
];

export const therapyTemplates: NotificationTemplate[] =
  applyImageTags(rawTherapyTemplates);

/**
 * Каталог шаблонов для типа "habits" (Привычки)
 */
const rawHabitsTemplates: NotificationTemplate[] = [
  // ==========================================
  // WATER (build) - 20 REMINDER + 20 INFORMATIONAL + 20 MOTIVATIONAL = 60 шаблонов
  // ==========================================

  // Reminder (20 шаблонов)
  {
    id: 'habit_water_reminder_01',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Выпил ли ты воду сегодня? Если нет, сделай это сейчас.',
        moderate: 'Проверь: выпил ли ты воду? Если нет — стакан сейчас.',
        hard: 'Вода. Стакан. Сейчас.',
      },
      formal: {
        soft: 'Выпили ли Вы воду сегодня? Если нет, сделайте это сейчас.',
        moderate: 'Проверьте: выпили ли Вы воду? Если нет — стакан сейчас.',
        hard: 'Вода. Стакан. Сейчас.',
      },
    },
  },
  {
    id: 'habit_water_reminder_02',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Время для глотка воды. Не забудь позаботиться о себе.',
        moderate: 'Время для воды. Сделай глоток прямо сейчас.',
        hard: 'Выпей воду. Сейчас.',
      },
      formal: {
        soft: 'Время для глотка воды. Не забудьте позаботиться о себе.',
        moderate: 'Время для воды. Сделайте глоток прямо сейчас.',
        hard: 'Выпейте воду. Сейчас.',
      },
    },
  },
  {
    id: 'habit_water_reminder_03',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Как давно ты пил воду? Самое время восполнить баланс.',
        moderate: 'Давно не пил? Стакан воды — восполни баланс.',
        hard: 'Вода нужна. Выпей стакан.',
      },
      formal: {
        soft: 'Как давно Вы пили воду? Самое время восполнить баланс.',
        moderate: 'Давно не пили? Стакан воды — восполните баланс.',
        hard: 'Вода нужна. Выпейте стакан.',
      },
    },
  },
  {
    id: 'habit_water_reminder_04',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Пора освежиться. Налей себе воды и сделай пару глотков.',
        moderate: 'Освежись. Вода поможет держать фокус.',
        hard: 'Вода. Пей.',
      },
      formal: {
        soft: 'Пора освежиться. Налейте себе воды и сделайте пару глотков.',
        moderate: 'Освежитесь. Вода поможет держать фокус.',
        hard: 'Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_05',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Не забывай о гидратации. Сделай маленький перерыв на воду.',
        moderate: 'Гидратация важна. Выпей воды прямо сейчас.',
        hard: 'Стакан воды. Без отлагательств.',
      },
      formal: {
        soft: 'Не забывайте о гидратации. Сделайте маленький перерыв на воду.',
        moderate: 'Гидратация важна. Выпейте воды прямо сейчас.',
        hard: 'Стакан воды. Без отлагательств.',
      },
    },
  },
  {
    id: 'habit_water_reminder_06',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоё тело нуждается в воде. Позаботься о нём.',
        moderate: 'Тело просит воду. Дай ему это.',
        hard: 'Выпей. Тело нуждается.',
      },
      formal: {
        soft: 'Ваше тело нуждается в воде. Позаботьтесь о нём.',
        moderate: 'Тело просит воду. Дайте ему это.',
        hard: 'Выпейте. Тело нуждается.',
      },
    },
  },
  {
    id: 'habit_water_reminder_07',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Маленькая пауза на воду. Это займёт всего минуту.',
        moderate: 'Пауза на воду. Сделай прямо сейчас.',
        hard: 'Минута. Вода. Пей.',
      },
      formal: {
        soft: 'Маленькая пауза на воду. Это займёт всего минуту.',
        moderate: 'Пауза на воду. Сделайте прямо сейчас.',
        hard: 'Минута. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_08',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Хочешь быть в тонусе? Начни с глотка воды.',
        moderate: 'Тонус начинается с воды. Выпей сейчас.',
        hard: 'Тонус = вода. Пей.',
      },
      formal: {
        soft: 'Хотите быть в тонусе? Начните с глотка воды.',
        moderate: 'Тонус начинается с воды. Выпейте сейчас.',
        hard: 'Тонус = вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_09',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Проверь свой баланс: когда ты последний раз пил воду?',
        moderate: 'Проверь баланс. Когда последний раз пил? Восполни сейчас.',
        hard: 'Баланс воды. Восполни.',
      },
      formal: {
        soft: 'Проверьте свой баланс: когда Вы последний раз пили воду?',
        moderate:
          'Проверьте баланс. Когда последний раз пили? Восполните сейчас.',
        hard: 'Баланс воды. Восполните.',
      },
    },
  },
  {
    id: 'habit_water_reminder_10',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Небольшой глоток воды поможет держать концентрацию.',
        moderate: 'Глоток воды = концентрация. Выпей сейчас.',
        hard: 'Вода. Концентрация. Пей.',
      },
      formal: {
        soft: 'Небольшой глоток воды поможет держать концентрацию.',
        moderate: 'Глоток воды = концентрация. Выпейте сейчас.',
        hard: 'Вода. Концентрация. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_11',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сделай перерыв и налей себе воды. Ты заслужил это.',
        moderate: 'Перерыв на воду. Налей и выпей.',
        hard: 'Перерыв. Вода. Сейчас.',
      },
      formal: {
        soft: 'Сделайте перерыв и налейте себе воды. Вы заслужили это.',
        moderate: 'Перерыв на воду. Налейте и выпейте.',
        hard: 'Перерыв. Вода. Сейчас.',
      },
    },
  },
  {
    id: 'habit_water_reminder_12',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Поддержи свой организм. Выпей воды прямо сейчас.',
        moderate: 'Организм нуждается в поддержке. Вода — сейчас.',
        hard: 'Поддержка = вода. Пей.',
      },
      formal: {
        soft: 'Поддержите свой организм. Выпейте воды прямо сейчас.',
        moderate: 'Организм нуждается в поддержке. Вода — сейчас.',
        hard: 'Поддержка = вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_13',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Время освежиться. Стакан воды — и дальше с новыми силами.',
        moderate: 'Освежись водой. Это даст новые силы.',
        hard: 'Вода. Силы. Пей.',
      },
      formal: {
        soft: 'Время освежиться. Стакан воды — и дальше с новыми силами.',
        moderate: 'Освежитесь водой. Это даст новые силы.',
        hard: 'Вода. Силы. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_14',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Напомню о простом: выпей воды. Это основа.',
        moderate: 'Основа — вода. Выпей сейчас.',
        hard: 'Основа = вода. Пей.',
      },
      formal: {
        soft: 'Напомню о простом: выпейте воды. Это основа.',
        moderate: 'Основа — вода. Выпейте сейчас.',
        hard: 'Основа = вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_15',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сколько воды ты выпил сегодня? Добавь ещё стакан.',
        moderate: 'Сколько воды выпил? Добавь стакан сейчас.',
        hard: 'Сколько выпил? Добавь стакан.',
      },
      formal: {
        soft: 'Сколько воды Вы выпили сегодня? Добавьте ещё стакан.',
        moderate: 'Сколько воды выпили? Добавьте стакан сейчас.',
        hard: 'Сколько выпили? Добавьте стакан.',
      },
    },
  },
  {
    id: 'habit_water_reminder_16',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Пришло время для воды. Не откладывай заботу о себе.',
        moderate: 'Время для воды. Забота о себе — сейчас.',
        hard: 'Вода. Забота. Сейчас.',
      },
      formal: {
        soft: 'Пришло время для воды. Не откладывайте заботу о себе.',
        moderate: 'Время для воды. Забота о себе — сейчас.',
        hard: 'Вода. Забота. Сейчас.',
      },
    },
  },
  {
    id: 'habit_water_reminder_17',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твой организм работает лучше с водой. Позаботься о нём.',
        moderate: 'Организм работает лучше с водой. Выпей сейчас.',
        hard: 'Работа = вода. Пей.',
      },
      formal: {
        soft: 'Ваш организм работает лучше с водой. Позаботьтесь о нём.',
        moderate: 'Организм работает лучше с водой. Выпейте сейчас.',
        hard: 'Работа = вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_18',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Поддержи уровень энергии: выпей воды.',
        moderate: 'Энергия нуждается в воде. Выпей сейчас.',
        hard: 'Энергия = вода. Пей.',
      },
      formal: {
        soft: 'Поддержите уровень энергии: выпейте воды.',
        moderate: 'Энергия нуждается в воде. Выпейте сейчас.',
        hard: 'Энергия = вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_19',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Маленькое напоминание: пора выпить воды.',
        moderate: 'Напоминание: вода нужна сейчас.',
        hard: 'Вода нужна. Пей.',
      },
      formal: {
        soft: 'Маленькое напоминание: пора выпить воды.',
        moderate: 'Напоминание: вода нужна сейчас.',
        hard: 'Вода нужна. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_reminder_20',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ещё один стакан воды не помешает. Налей и выпей.',
        moderate: 'Ещё стакан не помешает. Выпей сейчас.',
        hard: 'Ещё стакан. Пей.',
      },
      formal: {
        soft: 'Ещё один стакан воды не помешает. Налейте и выпейте.',
        moderate: 'Ещё стакан не помешает. Выпейте сейчас.',
        hard: 'Ещё стакан. Пейте.',
      },
    },
  },
  // Informational (20 шаблонов) - universal формат
  {
    id: 'habit_water_info_01',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Обезвоживание снижает концентрацию на 20%.',
    },
  },
  {
    id: 'habit_water_info_02',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода составляет 60% массы тела взрослого человека.',
    },
  },
  {
    id: 'habit_water_info_03',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Недостаток воды на 1-2% от массы тела снижает физическую работоспособность на 10-20%.',
    },
  },
  {
    id: 'habit_water_info_04',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Мозг на 75% состоит из воды.',
    },
  },
  {
    id: 'habit_water_info_05',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода помогает выводить токсины из организма через почки.',
    },
  },
  {
    id: 'habit_water_info_06',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Рекомендуемая норма — 1.5-2 литра воды в день для взрослого человека.',
    },
  },
  {
    id: 'habit_water_info_07',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Обезвоживание может вызывать головную боль и усталость.',
    },
  },
  {
    id: 'habit_water_info_08',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода участвует в регуляции температуры тела.',
    },
  },
  {
    id: 'habit_water_info_09',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Достаточное потребление воды улучшает состояние кожи.',
    },
  },
  {
    id: 'habit_water_info_10',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода необходима для нормального пищеварения.',
    },
  },
  {
    id: 'habit_water_info_11',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Чувство жажды появляется при обезвоживании 1-2%.',
    },
  },
  {
    id: 'habit_water_info_12',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода помогает суставам оставаться смазанными и гибкими.',
    },
  },
  {
    id: 'habit_water_info_13',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Питьевая вода в течение дня улучшает метаболизм на 24-30%.',
    },
  },
  {
    id: 'habit_water_info_14',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Обезвоживание на 3-4% снижает спортивные показатели на 25-50%.',
    },
  },
  {
    id: 'habit_water_info_15',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода не содержит калорий и способствует контролю веса.',
    },
  },
  {
    id: 'habit_water_info_16',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Стакан воды перед едой может снизить аппетит на 13%.',
    },
  },
  {
    id: 'habit_water_info_17',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода помогает доставлять кислород к клеткам организма.',
    },
  },
  {
    id: 'habit_water_info_18',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Хроническое обезвоживание может приводить к проблемам с почками.',
    },
  },
  {
    id: 'habit_water_info_19',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Вода необходима для производства слюны и поддержания здоровья полости рта.',
    },
  },
  {
    id: 'habit_water_info_20',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Регулярное питьё воды улучшает настроение и снижает уровень стресса.',
    },
  },
  // Motivational (20 шаблонов)
  {
    id: 'habit_water_motiv_01',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Гидратация помогает держать темп. Сделай глоток и продолжай.',
        moderate: 'Стакан воды — и тебе легче сосредоточиться.',
        hard: 'Стакан воды. Поддержи фокус.',
      },
      formal: {
        soft: 'Гидратация помогает держать темп. Сделайте глоток и продолжайте.',
        moderate: 'Стакан воды — и Вам легче сосредоточиться.',
        hard: 'Стакан воды. Поддержите фокус.',
      },
    },
  },
  {
    id: 'habit_water_motiv_02',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Забота о себе начинается с простого. Выпей воды.',
        moderate: 'Забота о себе = вода. Сделай это сейчас.',
        hard: 'Забота начинается с воды. Пей.',
      },
      formal: {
        soft: 'Забота о себе начинается с простого. Выпейте воды.',
        moderate: 'Забота о себе = вода. Сделайте это сейчас.',
        hard: 'Забота начинается с воды. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_03',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый глоток — шаг к здоровью. Продолжай в том же духе.',
        moderate: 'Каждый глоток = шаг к здоровью. Продолжай.',
        hard: 'Каждый глоток = здоровье. Пей.',
      },
      formal: {
        soft: 'Каждый глоток — шаг к здоровью. Продолжайте в том же духе.',
        moderate: 'Каждый глоток = шаг к здоровью. Продолжайте.',
        hard: 'Каждый глоток = здоровье. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_04',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты делаешь правильный выбор для своего здоровья. Выпей воды.',
        moderate: 'Правильный выбор = вода. Делай его сейчас.',
        hard: 'Правильный выбор. Вода. Пей.',
      },
      formal: {
        soft: 'Вы делаете правильный выбор для своего здоровья. Выпейте воды.',
        moderate: 'Правильный выбор = вода. Делайте его сейчас.',
        hard: 'Правильный выбор. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_05',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоё тело благодарит тебя за каждый стакан воды.',
        moderate: 'Тело благодарит за воду. Дай ему ещё.',
        hard: 'Тело благодарит. Пей воду.',
      },
      formal: {
        soft: 'Ваше тело благодарит Вас за каждый стакан воды.',
        moderate: 'Тело благодарит за воду. Дайте ему ещё.',
        hard: 'Тело благодарит. Пейте воду.',
      },
    },
  },
  {
    id: 'habit_water_motiv_06',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты строишь привычку заботы о себе. Продолжай с водой.',
        moderate: 'Привычка заботы = вода. Строй её дальше.',
        hard: 'Привычка заботы. Вода. Строй.',
      },
      formal: {
        soft: 'Вы строите привычку заботы о себе. Продолжайте с водой.',
        moderate: 'Привычка заботы = вода. Стройте её дальше.',
        hard: 'Привычка заботы. Вода. Стройте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_07',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Маленькие шаги ведут к большим результатам. Начни с воды.',
        moderate: 'Маленькие шаги = большие результаты. Вода — сейчас.',
        hard: 'Маленькие шаги. Вода. Начни.',
      },
      formal: {
        soft: 'Маленькие шаги ведут к большим результатам. Начните с воды.',
        moderate: 'Маленькие шаги = большие результаты. Вода — сейчас.',
        hard: 'Маленькие шаги. Вода. Начните.',
      },
    },
  },
  {
    id: 'habit_water_motiv_08',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты уже молодец, что следишь за гидратацией. Продолжай!',
        moderate: 'Следишь за гидратацией = молодец. Продолжай!',
        hard: 'Гидратация = сила. Продолжай.',
      },
      formal: {
        soft: 'Вы уже молодец, что следите за гидратацией. Продолжайте!',
        moderate: 'Следите за гидратацией = молодец. Продолжайте!',
        hard: 'Гидратация = сила. Продолжайте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_09',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Инвестируй в себя. Выпей воды и почувствуй разницу.',
        moderate: 'Инвестиция в себя = вода. Почувствуй разницу.',
        hard: 'Инвестируй. Вода. Пей.',
      },
      formal: {
        soft: 'Инвестируйте в себя. Выпейте воды и почувствуйте разницу.',
        moderate: 'Инвестиция в себя = вода. Почувствуйте разницу.',
        hard: 'Инвестируйте. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_10',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сегодня ты делаешь выбор в пользу здоровья. Выпей воды.',
        moderate: 'Выбор в пользу здоровья = вода. Делай сейчас.',
        hard: 'Выбор здоровья. Вода. Пей.',
      },
      formal: {
        soft: 'Сегодня Вы делаете выбор в пользу здоровья. Выпейте воды.',
        moderate: 'Выбор в пользу здоровья = вода. Делайте сейчас.',
        hard: 'Выбор здоровья. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_11',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Стакан воды — это акт любви к себе. Сделай это.',
        moderate: 'Вода = любовь к себе. Сделай это.',
        hard: 'Любовь к себе. Вода. Пей.',
      },
      formal: {
        soft: 'Стакан воды — это акт любви к себе. Сделайте это.',
        moderate: 'Вода = любовь к себе. Сделайте это.',
        hard: 'Любовь к себе. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_12',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты на пути к лучшей версии себя. Поддержи это водой.',
        moderate: 'Путь к лучшей версии = вода. Поддержи.',
        hard: 'Лучшая версия. Вода. Поддержи.',
      },
      formal: {
        soft: 'Вы на пути к лучшей версии себя. Поддержите это водой.',
        moderate: 'Путь к лучшей версии = вода. Поддержите.',
        hard: 'Лучшая версия. Вода. Поддержите.',
      },
    },
  },
  {
    id: 'habit_water_motiv_13',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый день — возможность стать здоровее. Начни с воды.',
        moderate: 'Возможность здоровья = вода. Начни сейчас.',
        hard: 'Возможность здоровья. Вода. Начни.',
      },
      formal: {
        soft: 'Каждый день — возможность стать здоровее. Начните с воды.',
        moderate: 'Возможность здоровья = вода. Начните сейчас.',
        hard: 'Возможность здоровья. Вода. Начните.',
      },
    },
  },
  {
    id: 'habit_water_motiv_14',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоя энергия зависит от простых вещей. Выпей воды.',
        moderate: 'Энергия зависит от воды. Выпей сейчас.',
        hard: 'Энергия = вода. Пей.',
      },
      formal: {
        soft: 'Ваша энергия зависит от простых вещей. Выпейте воды.',
        moderate: 'Энергия зависит от воды. Выпейте сейчас.',
        hard: 'Энергия = вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_15',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты заслуживаешь чувствовать себя хорошо. Выпей воды.',
        moderate: 'Заслуживаешь хорошего самочувствия = вода. Выпей.',
        hard: 'Заслуживаешь хорошего. Вода. Пей.',
      },
      formal: {
        soft: 'Вы заслуживаете чувствовать себя хорошо. Выпейте воды.',
        moderate: 'Заслуживаете хорошего самочувствия = вода. Выпейте.',
        hard: 'Заслуживаете хорошего. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_16',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сила в постоянстве. Продолжай пить воду регулярно.',
        moderate: 'Сила в постоянстве. Вода регулярно.',
        hard: 'Постоянство = сила. Вода. Пей.',
      },
      formal: {
        soft: 'Сила в постоянстве. Продолжайте пить воду регулярно.',
        moderate: 'Сила в постоянстве. Вода регулярно.',
        hard: 'Постоянство = сила. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_17',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый стакан воды — вклад в твоё будущее. Продолжай.',
        moderate: 'Каждый стакан = вклад в будущее. Продолжай.',
        hard: 'Вклад в будущее. Вода. Пей.',
      },
      formal: {
        soft: 'Каждый стакан воды — вклад в Ваше будущее. Продолжайте.',
        moderate: 'Каждый стакан = вклад в будущее. Продолжайте.',
        hard: 'Вклад в будущее. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_18',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты контролируешь своё здоровье. Начни с воды.',
        moderate: 'Контроль здоровья = вода. Начни сейчас.',
        hard: 'Контроль здоровья. Вода. Пей.',
      },
      formal: {
        soft: 'Вы контролируете своё здоровье. Начните с воды.',
        moderate: 'Контроль здоровья = вода. Начните сейчас.',
        hard: 'Контроль здоровья. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_19',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Простые привычки меняют жизнь. Выпей воды.',
        moderate: 'Простые привычки меняют жизнь. Вода — сейчас.',
        hard: 'Привычки меняют жизнь. Вода. Пей.',
      },
      formal: {
        soft: 'Простые привычки меняют жизнь. Выпейте воды.',
        moderate: 'Простые привычки меняют жизнь. Вода — сейчас.',
        hard: 'Привычки меняют жизнь. Вода. Пейте.',
      },
    },
  },
  {
    id: 'habit_water_motiv_20',
    kind: 'habits',
    entityKey: 'water',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты делаешь отличную работу. Поддержи себя водой.',
        moderate: 'Отличная работа! Поддержи себя водой.',
        hard: 'Отличная работа. Вода. Поддержи.',
      },
      formal: {
        soft: 'Вы делаете отличную работу. Поддержите себя водой.',
        moderate: 'Отличная работа! Поддержите себя водой.',
        hard: 'Отличная работа. Вода. Поддержите.',
      },
    },
  },
  // Движение/шаги (build)
  {
    id: 'habit_steps_reminder_01',
    kind: 'habits',
    entityKey: 'steps',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сделал ли ты сегодня шаги? Если нет, прогуляйся 5 минут.',
        moderate:
          'Проверь: сделал ли ты шаги? Если нет — 5 минут ходьбы сейчас.',
        hard: '5 минут ходьбы. Сейчас.',
      },
      formal: {
        soft: 'Сделали ли Вы сегодня шаги? Если нет, прогуляйтесь 5 минут.',
        moderate:
          'Проверьте: сделали ли Вы шаги? Если нет — 5 минут ходьбы сейчас.',
        hard: '5 минут ходьбы. Сейчас.',
      },
    },
  },
  {
    id: 'habit_steps_motivational_01',
    kind: 'habits',
    entityKey: 'steps',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Движение освежает. Пройди немного — почувствуешь разницу.',
        moderate: '10 минут движения — вклад в ясность и тонус.',
        hard: '10 минут активной ходьбы. Поехали.',
      },
      formal: {
        soft: 'Движение освежает. Пройдитесь немного — почувствуете разницу.',
        moderate: '10 минут движения — вклад в ясность и тонус.',
        hard: '10 минут активной ходьбы. Поехали.',
      },
    },
  },
  // ==========================================
  // TRAINING (build) - 20 REMINDER + 20 INFORMATIONAL + 20 MOTIVATIONAL = 60 шаблонов
  // ==========================================

  // Reminder (20 шаблонов)
  {
    id: 'habit_training_reminder_01',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сделал ли ты сегодня тренировку? Если нет, хотя бы 10 минут.',
        moderate: 'Время для тренировки. Хотя бы 10 минут.',
        hard: 'Тренировка. 10 минут. Начинай.',
      },
      formal: {
        soft: 'Сделали ли Вы сегодня тренировку? Если нет, хотя бы 10 минут.',
        moderate: 'Время для тренировки. Хотя бы 10 минут.',
        hard: 'Тренировка. 10 минут. Начинайте.',
      },
    },
  },
  {
    id: 'habit_training_reminder_02',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоё тело ждёт движения. Начни с короткой тренировки.',
        moderate: 'Тело ждёт движения. Начни тренировку сейчас.',
        hard: 'Тело ждёт. Тренировка. Начинай.',
      },
      formal: {
        soft: 'Ваше тело ждёт движения. Начните с короткой тренировки.',
        moderate: 'Тело ждёт движения. Начните тренировку сейчас.',
        hard: 'Тело ждёт. Тренировка. Начинайте.',
      },
    },
  },
  {
    id: 'habit_training_reminder_03',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Пора размяться. Даже 5 минут активности имеют значение.',
        moderate: 'Пора размяться. 5 минут активности — сейчас.',
        hard: 'Размялся? Нет? Начинай.',
      },
      formal: {
        soft: 'Пора размяться. Даже 5 минут активности имеют значение.',
        moderate: 'Пора размяться. 5 минут активности — сейчас.',
        hard: 'Размялись? Нет? Начинайте.',
      },
    },
  },
  {
    id: 'habit_training_reminder_04',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Откладываешь тренировку? Начни прямо сейчас, потом поблагодаришь себя.',
        moderate: 'Не откладывай тренировку. Начни сейчас.',
        hard: 'Не откладывай. Начинай.',
      },
      formal: {
        soft: 'Откладываете тренировку? Начните прямо сейчас, потом поблагодарите себя.',
        moderate: 'Не откладывайте тренировку. Начните сейчас.',
        hard: 'Не откладывайте. Начинайте.',
      },
    },
  },
  {
    id: 'habit_training_reminder_05',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Когда последний раз ты тренировался? Пора вернуться к активности.',
        moderate: 'Последний раз тренировался? Вернись к активности.',
        hard: 'Тренировка давно? Вернись.',
      },
      formal: {
        soft: 'Когда последний раз Вы тренировались? Пора вернуться к активности.',
        moderate: 'Последний раз тренировались? Вернитесь к активности.',
        hard: 'Тренировка давно? Вернитесь.',
      },
    },
  },
  {
    id: 'habit_training_reminder_06',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Найди 15 минут для себя. Тренировка перезагрузит твой день.',
        moderate: '15 минут для себя. Тренировка перезагрузит день.',
        hard: '15 минут. Тренировка. Перезагрузка.',
      },
      formal: {
        soft: 'Найдите 15 минут для себя. Тренировка перезагрузит Ваш день.',
        moderate: '15 минут для себя. Тренировка перезагрузит день.',
        hard: '15 минут. Тренировка. Перезагрузка.',
      },
    },
  },
  {
    id: 'habit_training_reminder_07',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сидишь долго? Встань и сделай несколько упражнений.',
        moderate: 'Сидишь долго? Встань, сделай упражнения.',
        hard: 'Долго сидишь? Упражнения. Сейчас.',
      },
      formal: {
        soft: 'Сидите долго? Встаньте и сделайте несколько упражнений.',
        moderate: 'Сидите долго? Встаньте, сделайте упражнения.',
        hard: 'Долго сидите? Упражнения. Сейчас.',
      },
    },
  },
  {
    id: 'habit_training_reminder_08',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Хватит откладывать. Даже 10 минут тренировки лучше, чем ничего.',
        moderate: 'Хватит откладывать. 10 минут — лучше, чем ничего.',
        hard: 'Хватит откладывать. Начинай.',
      },
      formal: {
        soft: 'Хватит откладывать. Даже 10 минут тренировки лучше, чем ничего.',
        moderate: 'Хватит откладывать. 10 минут — лучше, чем ничего.',
        hard: 'Хватит откладывать. Начинайте.',
      },
    },
  },
  {
    id: 'habit_training_reminder_09',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Тренировка не обязательно должна быть долгой. Начни с малого.',
        moderate: 'Тренировка может быть короткой. Начни с малого.',
        hard: 'Начни с малого. Тренируйся.',
      },
      formal: {
        soft: 'Тренировка не обязательно должна быть долгой. Начните с малого.',
        moderate: 'Тренировка может быть короткой. Начните с малого.',
        hard: 'Начните с малого. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_reminder_10',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Движение — жизнь. Сделай что-то активное прямо сейчас.',
        moderate: 'Движение = жизнь. Будь активным сейчас.',
        hard: 'Движение = жизнь. Двигайся.',
      },
      formal: {
        soft: 'Движение — жизнь. Сделайте что-то активное прямо сейчас.',
        moderate: 'Движение = жизнь. Будьте активным сейчас.',
        hard: 'Движение = жизнь. Двигайтесь.',
      },
    },
  },
  {
    id: 'habit_training_reminder_11',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Планировал тренировку сегодня? Пора воплотить план в жизнь.',
        moderate: 'Планировал тренировку? Воплоти план в жизнь.',
        hard: 'План есть? Воплощай.',
      },
      formal: {
        soft: 'Планировали тренировку сегодня? Пора воплотить план в жизнь.',
        moderate: 'Планировали тренировку? Воплотите план в жизнь.',
        hard: 'План есть? Воплощайте.',
      },
    },
  },
  {
    id: 'habit_training_reminder_12',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твои мышцы ждут нагрузки. Не разочаруй их.',
        moderate: 'Мышцы ждут нагрузки. Не разочаруй.',
        hard: 'Мышцы ждут. Тренируйся.',
      },
      formal: {
        soft: 'Ваши мышцы ждут нагрузки. Не разочаруйте их.',
        moderate: 'Мышцы ждут нагрузки. Не разочаруйте.',
        hard: 'Мышцы ждут. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_reminder_13',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Небольшая тренировка сейчас даст большой результат позже.',
        moderate: 'Небольшая тренировка = большой результат.',
        hard: 'Тренировка = результат. Начинай.',
      },
      formal: {
        soft: 'Небольшая тренировка сейчас даст большой результат позже.',
        moderate: 'Небольшая тренировка = большой результат.',
        hard: 'Тренировка = результат. Начинайте.',
      },
    },
  },
  {
    id: 'habit_training_reminder_14',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Почувствуй прилив энергии после тренировки. Начни сейчас.',
        moderate: 'Прилив энергии после тренировки. Начни сейчас.',
        hard: 'Энергия ждёт. Тренируйся.',
      },
      formal: {
        soft: 'Почувствуйте прилив энергии после тренировки. Начните сейчас.',
        moderate: 'Прилив энергии после тренировки. Начните сейчас.',
        hard: 'Энергия ждёт. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_reminder_15',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сегодня отличный день для тренировки. Не пропускай.',
        moderate: 'Отличный день для тренировки. Не пропускай.',
        hard: 'Отличный день. Тренируйся.',
      },
      formal: {
        soft: 'Сегодня отличный день для тренировки. Не пропускайте.',
        moderate: 'Отличный день для тренировки. Не пропускайте.',
        hard: 'Отличный день. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_reminder_16',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждая тренировка приближает тебя к цели. Начни сегодня.',
        moderate: 'Каждая тренировка = шаг к цели. Начни.',
        hard: 'К цели. Тренируйся.',
      },
      formal: {
        soft: 'Каждая тренировка приближает Вас к цели. Начните сегодня.',
        moderate: 'Каждая тренировка = шаг к цели. Начните.',
        hard: 'К цели. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_reminder_17',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоё будущее "я" скажет спасибо за сегодняшнюю тренировку.',
        moderate: 'Будущее "я" скажет спасибо. Тренируйся.',
        hard: 'Будущее благодарит. Тренируйся.',
      },
      formal: {
        soft: 'Ваше будущее "я" скажет спасибо за сегодняшнюю тренировку.',
        moderate: 'Будущее "я" скажет спасибо. Тренируйтесь.',
        hard: 'Будущее благодарит. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_reminder_18',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Не знаешь, с чего начать? Просто начни двигаться.',
        moderate: 'Не знаешь? Просто двигайся.',
        hard: 'Не думай. Двигайся.',
      },
      formal: {
        soft: 'Не знаете, с чего начать? Просто начните двигаться.',
        moderate: 'Не знаете? Просто двигайтесь.',
        hard: 'Не думайте. Двигайтесь.',
      },
    },
  },
  {
    id: 'habit_training_reminder_19',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Подари себе 20 минут активности. Ты это заслужил.',
        moderate: 'Подари себе 20 минут активности. Заслужил.',
        hard: '20 минут. Ты заслужил.',
      },
      formal: {
        soft: 'Подарите себе 20 минут активности. Вы это заслужили.',
        moderate: 'Подарите себе 20 минут активности. Заслужили.',
        hard: '20 минут. Вы заслужили.',
      },
    },
  },
  {
    id: 'habit_training_reminder_20',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Нет времени на длинную тренировку? Сделай короткую, но интенсивную.',
        moderate: 'Нет времени? Короткая, но интенсивная.',
        hard: 'Нет времени? Интенсивно.',
      },
      formal: {
        soft: 'Нет времени на длинную тренировку? Сделайте короткую, но интенсивную.',
        moderate: 'Нет времени? Короткая, но интенсивная.',
        hard: 'Нет времени? Интенсивно.',
      },
    },
  },

  // Informational (20 шаблонов) - universal формат
  {
    id: 'habit_training_info_01',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Регулярные тренировки снижают риск сердечно-сосудистых заболеваний на 35%.',
    },
  },
  {
    id: 'habit_training_info_02',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        '30 минут умеренной активности 5 раз в неделю — рекомендация ВОЗ.',
    },
  },
  {
    id: 'habit_training_info_03',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Физические упражнения повышают уровень эндорфинов — гормонов счастья.',
    },
  },
  {
    id: 'habit_training_info_04',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Силовые тренировки увеличивают плотность костной ткани и предотвращают остеопороз.',
    },
  },
  {
    id: 'habit_training_info_05',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Регулярная физическая активность улучшает качество сна.',
    },
  },
  {
    id: 'habit_training_info_06',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Тренировки повышают метаболизм на 24-48 часов после занятия.',
    },
  },
  {
    id: 'habit_training_info_07',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Аэробные упражнения улучшают работу сердца и лёгких.',
    },
  },
  {
    id: 'habit_training_info_08',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Физическая активность снижает риск развития диабета 2 типа на 50%.',
    },
  },
  {
    id: 'habit_training_info_09',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Регулярные тренировки улучшают когнитивные функции и память.',
    },
  },
  {
    id: 'habit_training_info_10',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Даже 10 минут интенсивных упражнений улучшают настроение на 2-3 часа.',
    },
  },
  {
    id: 'habit_training_info_11',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Тренировки укрепляют иммунную систему и снижают частоту простуд.',
    },
  },
  {
    id: 'habit_training_info_12',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Физическая активность снижает уровень стресса и тревожности.',
    },
  },
  {
    id: 'habit_training_info_13',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Регулярные занятия спортом увеличивают продолжительность жизни на 3-7 лет.',
    },
  },
  {
    id: 'habit_training_info_14',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Высокоинтенсивные интервальные тренировки (HIIT) сжигают калории в течение 24 часов.',
    },
  },
  {
    id: 'habit_training_info_15',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Растяжка после тренировки уменьшает болезненность мышц на 50%.',
    },
  },
  {
    id: 'habit_training_info_16',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Физические упражнения стимулируют рост новых нейронов в мозге.',
    },
  },
  {
    id: 'habit_training_info_17',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Тренировки на свежем воздухе на 50% эффективнее улучшают настроение.',
    },
  },
  {
    id: 'habit_training_info_18',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Регулярная физическая активность снижает риск депрессии на 30%.',
    },
  },
  {
    id: 'habit_training_info_19',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Упражнения с весом собственного тела так же эффективны, как тренировки в зале.',
    },
  },
  {
    id: 'habit_training_info_20',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Физическая активность улучшает самооценку и уверенность в себе.',
    },
  },

  // Motivational (20 шаблонов)
  {
    id: 'habit_training_motiv_01',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Движение — энергия. Выбери лёгкое: растяжка или быстрая прогулка.',
        moderate: '10 минут активности — и ты силён в делах.',
        hard: 'Активность 10 минут. Начинай.',
      },
      formal: {
        soft: 'Движение — энергия. Выберите лёгкое: растяжка или быстрая прогулка.',
        moderate: '10 минут активности — и Вы сильны в делах.',
        hard: 'Активность 10 минут. Начинайте.',
      },
    },
  },
  {
    id: 'habit_training_motiv_02',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждая тренировка делает тебя сильнее. Не останавливайся.',
        moderate: 'Каждая тренировка = сила. Не останавливайся.',
        hard: 'Сильнее с каждой тренировкой. Вперёд.',
      },
      formal: {
        soft: 'Каждая тренировка делает Вас сильнее. Не останавливайтесь.',
        moderate: 'Каждая тренировка = сила. Не останавливайтесь.',
        hard: 'Сильнее с каждой тренировкой. Вперёд.',
      },
    },
  },
  {
    id: 'habit_training_motiv_03',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты можешь больше, чем думаешь. Докажи это себе сегодня.',
        moderate: 'Можешь больше. Докажи себе сегодня.',
        hard: 'Можешь больше. Докажи.',
      },
      formal: {
        soft: 'Вы можете больше, чем думаете. Докажите это себе сегодня.',
        moderate: 'Можете больше. Докажите себе сегодня.',
        hard: 'Можете больше. Докажите.',
      },
    },
  },
  {
    id: 'habit_training_motiv_04',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Единственная тренировка, о которой жалеют — та, которую не сделали.',
        moderate: 'Жалеют о пропущенных. Не жалей — тренируйся.',
        hard: 'Не жалей. Тренируйся.',
      },
      formal: {
        soft: 'Единственная тренировка, о которой жалеют — та, которую не сделали.',
        moderate: 'Жалеют о пропущенных. Не жалейте — тренируйтесь.',
        hard: 'Не жалейте. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_05',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоё тело — храм. Позаботься о нём с помощью тренировки.',
        moderate: 'Тело — храм. Позаботься тренировкой.',
        hard: 'Тело = храм. Тренируйся.',
      },
      formal: {
        soft: 'Ваше тело — храм. Позаботьтесь о нём с помощью тренировки.',
        moderate: 'Тело — храм. Позаботьтесь тренировкой.',
        hard: 'Тело = храм. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_06',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сегодня — идеальный день, чтобы стать лучше. Начни с тренировки.',
        moderate: 'Идеальный день стать лучше. Тренируйся.',
        hard: 'Стань лучше. Тренируйся.',
      },
      formal: {
        soft: 'Сегодня — идеальный день, чтобы стать лучше. Начните с тренировки.',
        moderate: 'Идеальный день стать лучше. Тренируйтесь.',
        hard: 'Станьте лучше. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_07',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Побороть себя сегодня — победить завтра. Тренируйся.',
        moderate: 'Победи себя сегодня = победа завтра.',
        hard: 'Победи себя. Тренируйся.',
      },
      formal: {
        soft: 'Побороть себя сегодня — победить завтра. Тренируйтесь.',
        moderate: 'Победите себя сегодня = победа завтра.',
        hard: 'Победите себя. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_08',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Не ищи оправданий. Найди способ тренироваться сегодня.',
        moderate: 'Не ищи оправданий. Найди способ.',
        hard: 'Без оправданий. Тренируйся.',
      },
      formal: {
        soft: 'Не ищите оправданий. Найдите способ тренироваться сегодня.',
        moderate: 'Не ищите оправданий. Найдите способ.',
        hard: 'Без оправданий. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_09',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Инвестируй в своё здоровье. Тренировка — лучшая инвестиция.',
        moderate: 'Инвестируй в здоровье = тренировка.',
        hard: 'Инвестируй. Тренируйся.',
      },
      formal: {
        soft: 'Инвестируйте в своё здоровье. Тренировка — лучшая инвестиция.',
        moderate: 'Инвестируйте в здоровье = тренировка.',
        hard: 'Инвестируйте. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_10',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый шаг к цели начинается с решения тренироваться сегодня.',
        moderate: 'К цели = решение тренироваться сегодня.',
        hard: 'К цели. Тренируйся.',
      },
      formal: {
        soft: 'Каждый шаг к цели начинается с решения тренироваться сегодня.',
        moderate: 'К цели = решение тренироваться сегодня.',
        hard: 'К цели. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_11',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Гордись собой за каждую тренировку. Ты делаешь отличную работу.',
        moderate: 'Гордись за каждую тренировку. Отличная работа.',
        hard: 'Гордись. Тренируйся.',
      },
      formal: {
        soft: 'Гордитесь собой за каждую тренировку. Вы делаете отличную работу.',
        moderate: 'Гордитесь за каждую тренировку. Отличная работа.',
        hard: 'Гордитесь. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_12',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Результаты приходят к тем, кто не сдаётся. Продолжай тренироваться.',
        moderate: 'Результаты = не сдаваться. Тренируйся.',
        hard: 'Не сдавайся. Тренируйся.',
      },
      formal: {
        soft: 'Результаты приходят к тем, кто не сдаётся. Продолжайте тренироваться.',
        moderate: 'Результаты = не сдаваться. Тренируйтесь.',
        hard: 'Не сдавайтесь. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_13',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты строишь лучшую версию себя. Продолжай с тренировкой.',
        moderate: 'Строишь лучшую версию. Тренируйся.',
        hard: 'Лучшая версия. Тренируйся.',
      },
      formal: {
        soft: 'Вы строите лучшую версию себя. Продолжайте с тренировкой.',
        moderate: 'Строите лучшую версию. Тренируйтесь.',
        hard: 'Лучшая версия. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_14',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сильное тело — сильный дух. Тренируйся для обоих.',
        moderate: 'Сильное тело = сильный дух. Тренируйся.',
        hard: 'Тело и дух. Тренируйся.',
      },
      formal: {
        soft: 'Сильное тело — сильный дух. Тренируйтесь для обоих.',
        moderate: 'Сильное тело = сильный дух. Тренируйтесь.',
        hard: 'Тело и дух. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_15',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Начни сейчас, поблагодаришь себя потом. Тренируйся.',
        moderate: 'Начни сейчас = благодарность потом.',
        hard: 'Начни. Тренируйся.',
      },
      formal: {
        soft: 'Начните сейчас, поблагодарите себя потом. Тренируйтесь.',
        moderate: 'Начните сейчас = благодарность потом.',
        hard: 'Начните. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_16',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Преодолей лень. Почувствуй силу после тренировки.',
        moderate: 'Преодолей лень. Почувствуй силу.',
        hard: 'Преодолей. Тренируйся.',
      },
      formal: {
        soft: 'Преодолейте лень. Почувствуйте силу после тренировки.',
        moderate: 'Преодолейте лень. Почувствуйте силу.',
        hard: 'Преодолейте. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_17',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждая тренировка — вклад в твоё долголетие.',
        moderate: 'Каждая тренировка = долголетие.',
        hard: 'Долголетие. Тренируйся.',
      },
      formal: {
        soft: 'Каждая тренировка — вклад в Ваше долголетие.',
        moderate: 'Каждая тренировка = долголетие.',
        hard: 'Долголетие. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_18',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты контролируешь своё тело. Докажи это тренировкой.',
        moderate: 'Контролируешь тело = тренировка.',
        hard: 'Контроль. Тренируйся.',
      },
      formal: {
        soft: 'Вы контролируете своё тело. Докажите это тренировкой.',
        moderate: 'Контролируете тело = тренировка.',
        hard: 'Контроль. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_19',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоя сила растёт с каждым днём тренировок. Продолжай.',
        moderate: 'Сила растёт с тренировками. Продолжай.',
        hard: 'Сила растёт. Тренируйся.',
      },
      formal: {
        soft: 'Ваша сила растёт с каждым днём тренировок. Продолжайте.',
        moderate: 'Сила растёт с тренировками. Продолжайте.',
        hard: 'Сила растёт. Тренируйтесь.',
      },
    },
  },
  {
    id: 'habit_training_motiv_20',
    kind: 'habits',
    entityKey: 'training',
    intent: 'build',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Действуй сегодня для результатов завтра. Тренируйся.',
        moderate: 'Действуй сегодня = результаты завтра.',
        hard: 'Действуй. Тренируйся.',
      },
      formal: {
        soft: 'Действуйте сегодня для результатов завтра. Тренируйтесь.',
        moderate: 'Действуйте сегодня = результаты завтра.',
        hard: 'Действуйте. Тренируйтесь.',
      },
    },
  },
  // ==========================================
  // SMOKING (quit) - БЕЗ reminder! Только informational + motivational
  // ==========================================

  // Informational (факты) - universal формат (один текст для всех)
  {
    id: 'habit_smoking_info_01',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Через 20 минут после отказа от курения пульс и давление нормализуются.',
    },
  },
  {
    id: 'habit_smoking_info_02',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через 48 часов обоняние и вкус начинают восстанавливаться.',
    },
  },
  {
    id: 'habit_smoking_info_03',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Через 2 недели дыхание становится легче, лёгкие начинают очищаться.',
    },
  },
  {
    id: 'habit_smoking_info_04',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через месяц без курения риск инфаркта снижается на 50%.',
    },
  },
  {
    id: 'habit_smoking_info_05',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Курение сокращает продолжительность жизни в среднем на 10-15 лет.',
    },
  },
  {
    id: 'habit_smoking_info_06',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Через год без курения риск сердечных заболеваний снижается вдвое.',
    },
  },
  {
    id: 'habit_smoking_info_07',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Дети курильщиков болеют респираторными заболеваниями на 70% чаще.',
    },
  },
  {
    id: 'habit_smoking_info_08',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Через 5 лет без курения риск инсульта сравнивается с некурящим человеком.',
    },
  },
  {
    id: 'habit_smoking_info_09',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Курение пачки сигарет в день обходится примерно в 150 000₽ в год.',
    },
  },
  {
    id: 'habit_smoking_info_10',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Кожа заметно улучшается и выглядит моложе после отказа от курения.',
    },
  },
  {
    id: 'habit_smoking_info_11',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Курение является причиной 85% случаев рака лёгких.',
    },
  },
  {
    id: 'habit_smoking_info_12',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Курение ежегодно уносит жизни более 8 миллионов человек в мире.',
    },
  },
  {
    id: 'habit_smoking_info_13',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Через 72 часа уровень никотина в организме полностью выводится.',
    },
  },
  {
    id: 'habit_smoking_info_14',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через 10 лет без курения риск рака лёгких снижается вдвое.',
    },
  },
  {
    id: 'habit_smoking_info_15',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Физическая выносливость значительно улучшается уже через 3-9 месяцев без курения.',
    },
  },

  // Motivational (поддержка и мотивация)
  {
    id: 'habit_smoking_motiv_01',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты сильнее зависимости. Каждый час — твоя победа.',
        moderate: 'Ты держишься. Это требует силы и ты справляешься.',
        hard: 'Докажи себе силу. Каждый час — победа.',
      },
      formal: {
        soft: 'Вы сильнее зависимости. Каждый час — Ваша победа.',
        moderate: 'Вы держитесь. Это требует силы и Вы справляетесь.',
        hard: 'Докажите себе силу. Каждый час — победа.',
      },
    },
  },
  {
    id: 'habit_smoking_motiv_02',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоя семья гордится тобой. Продолжай.',
        moderate: 'Ты делаешь это ради близких. Они верят в тебя.',
        hard: 'Семья ждёт здорового тебя. Не подведи.',
      },
      formal: {
        soft: 'Ваша семья гордится Вами. Продолжайте.',
        moderate: 'Вы делаете это ради близких. Они верят в Вас.',
        hard: 'Семья ждёт здорового Вас. Не подведите.',
      },
    },
  },
  {
    id: 'habit_smoking_motiv_03',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый чистый день — инвестиция в будущее.',
        moderate: 'Ты строишь здоровое будущее. День за днём.',
        hard: 'Будущее зависит от сегодня. Действуй.',
      },
      formal: {
        soft: 'Каждый чистый день — инвестиция в будущее.',
        moderate: 'Вы строите здоровое будущее. День за днём.',
        hard: 'Будущее зависит от сегодня. Действуйте.',
      },
    },
  },
  {
    id: 'habit_smoking_motiv_04',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты свободен от зависимости. Продолжай идти.',
        moderate: 'Свобода — в твоих руках. Ты уже на пути.',
        hard: 'Свобода требует действий. Продолжай борьбу.',
      },
      formal: {
        soft: 'Вы свободны от зависимости. Продолжайте идти.',
        moderate: 'Свобода — в Ваших руках. Вы уже на пути.',
        hard: 'Свобода требует действий. Продолжайте борьбу.',
      },
    },
  },
  {
    id: 'habit_smoking_motiv_05',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Подумай о детях — они дышат чистым воздухом благодаря тебе.',
        moderate: 'Твои дети будут дышать чистым воздухом. Ради них.',
        hard: 'Защити семью. Брось табак.',
      },
      formal: {
        soft: 'Подумайте о детях — они дышат чистым воздухом благодаря Вам.',
        moderate: 'Ваши дети будут дышать чистым воздухом. Ради них.',
        hard: 'Защитите семью. Бросайте табак.',
      },
    },
  },
  {
    id: 'habit_smoking_motiv_06',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты заслуживаешь здоровую жизнь. Продолжай путь.',
        moderate: 'Каждый день — доказательство твоей силы.',
        hard: 'Докажи себе: здоровая жизнь тебе по силам. Действуй.',
      },
      formal: {
        soft: 'Вы заслуживаете здоровую жизнь. Продолжайте путь.',
        moderate: 'Каждый день — доказательство Вашей силы.',
        hard: 'Докажите, что Вы достойны здоровой жизни. Действуйте.',
      },
    },
  },
  {
    id: 'habit_smoking_motiv_07',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты вдохновляешь других своим примером.',
        moderate: 'Твоя сила воли — пример для окружающих.',
        hard: 'Стань примером. Вдохнови других бросить.',
      },
      formal: {
        soft: 'Вы вдохновляете других своим примером.',
        moderate: 'Ваша сила воли — пример для окружающих.',
        hard: 'Станьте примером. Вдохновите других бросить.',
      },
    },
  },
  {
    id: 'habit_smoking_motiv_08',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоё тело говорит спасибо. Слушай его.',
        moderate: 'Организм восстанавливается. Ты на правильном пути.',
        hard: 'Тело восстанавливается. Не предавай его снова.',
      },
      formal: {
        soft: 'Ваше тело говорит спасибо. Слушайте его.',
        moderate: 'Организм восстанавливается. Вы на правильном пути.',
        hard: 'Тело восстанавливается. Не предавайте его снова.',
      },
    },
  },
  {
    id: 'habit_smoking_motiv_09',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый день ты выбираешь жизнь. Это важный выбор.',
        moderate: 'Сегодня ты выбираешь жизнь. Продолжай выбирать.',
        hard: 'Каждый день без табака — победа над зависимостью.',
      },
      formal: {
        soft: 'Каждый день Вы выбираете жизнь. Это важный выбор.',
        moderate: 'Сегодня Вы выбираете жизнь. Продолжайте выбирать.',
        hard: 'Каждый день без табака — победа над зависимостью.',
      },
    },
  },
  {
    id: 'habit_smoking_motiv_10',
    kind: 'habits',
    entityKey: 'smoking',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты стал лучшей версией себя. Продолжай расти.',
        moderate: 'Ты доказал себе, что способен на большее.',
        hard: 'Стань лучшей версией себя. Докажи свою силу.',
      },
      formal: {
        soft: 'Вы стали лучшей версией себя. Продолжайте расти.',
        moderate: 'Вы доказали себе, что способны на большее.',
        hard: 'Станьте лучшей версией себя. Докажите свою силу.',
      },
    },
  },
  // ==========================================
  // ALCOHOL (quit) - БЕЗ reminder! Только informational + motivational
  // ==========================================

  // Informational (факты) - universal формат (один текст для всех)
  {
    id: 'habit_alcohol_info_01',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Через 72 часа без алкоголя печень начинает активно восстанавливаться.',
    },
  },
  {
    id: 'habit_alcohol_info_02',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Неделя без алкоголя улучшает качество сна на 35%.',
    },
  },
  {
    id: 'habit_alcohol_info_03',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Алкоголь увеличивает риск развития депрессии в 3 раза.',
    },
  },
  {
    id: 'habit_alcohol_info_04',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Через 2 недели без алкоголя память и концентрация значительно улучшаются.',
    },
  },
  {
    id: 'habit_alcohol_info_05',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через месяц без алкоголя кровяное давление нормализуется.',
    },
  },
  {
    id: 'habit_alcohol_info_06',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Алкоголь негативно влияет на отношения с близкими людьми.',
    },
  },
  {
    id: 'habit_alcohol_info_07',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через 5 дней без алкоголя кожа выглядит свежее и здоровее.',
    },
  },
  {
    id: 'habit_alcohol_info_08',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Дети из семей с алкогольной зависимостью имеют повышенный риск психологических проблем.',
    },
  },
  {
    id: 'habit_alcohol_info_09',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Отказ от алкоголя повышает работоспособность на 40%.',
    },
  },
  {
    id: 'habit_alcohol_info_10',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через год без алкоголя риск рака печени снижается на 50%.',
    },
  },
  {
    id: 'habit_alcohol_info_11',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Алкоголь является одной из главных причин цирроза печени.',
    },
  },
  {
    id: 'habit_alcohol_info_12',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Через 6 месяцев без алкоголя риск сердечно-сосудистых заболеваний значительно снижается.',
    },
  },
  {
    id: 'habit_alcohol_info_13',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Отказ от алкоголя укрепляет иммунную систему.',
    },
  },
  {
    id: 'habit_alcohol_info_14',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Алкоголь замедляет процесс восстановления после физических нагрузок на 30%.',
    },
  },
  {
    id: 'habit_alcohol_info_15',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Через 3 месяца без алкоголя энергия и общий тонус организма заметно возрастают.',
    },
  },

  // Motivational (поддержка, социальный фокус, сила)
  {
    id: 'habit_alcohol_motiv_01',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый трезвый день — победа. Ты сильнее, чем думаешь!',
        moderate: 'Ещё один день без алкоголя — ты молодец! Продолжай.',
        hard: 'Докажи свою силу. Ещё один день — ещё одна победа.',
      },
      formal: {
        soft: 'Каждый трезвый день — победа. Вы сильнее, чем думаете!',
        moderate: 'Ещё один день без алкоголя — Вы молодцы! Продолжайте.',
        hard: 'Докажите свою силу. Ещё один день — ещё одна победа.',
      },
    },
  },
  {
    id: 'habit_alcohol_motiv_02',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоя семья гордится тобой. Каждый день — вклад в будущее.',
        moderate: 'Семья видит твою силу. Продолжай ради них.',
        hard: 'Семья нуждается в трезвом тебе. Держись.',
      },
      formal: {
        soft: 'Ваша семья гордится Вами. Каждый день — вклад в будущее.',
        moderate: 'Семья видит Вашу силу. Продолжайте ради них.',
        hard: 'Семья нуждается в трезвом Вас. Держитесь.',
      },
    },
  },
  {
    id: 'habit_alcohol_motiv_03',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты уже столько прошёл! Не останавливайся, ты справишься.',
        moderate: 'Ты справляешься. Каждый час без алкоголя — твой успех.',
        hard: 'Путь начат. Не отступай. Продолжай борьбу.',
      },
      formal: {
        soft: 'Вы уже столько прошли! Не останавливайтесь, Вы справитесь.',
        moderate: 'Вы справляетесь. Каждый час без алкоголя — Ваш успех.',
        hard: 'Путь начат. Не отступайте. Продолжайте борьбу.',
      },
    },
  },
  {
    id: 'habit_alcohol_motiv_04',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Представь, каким сильным ты будешь через месяц без алкоголя!',
        moderate: 'Месяц без алкоголя — новый ты. Ты почти у цели!',
        hard: 'Месяц без алкоголя = новая жизнь. Вперёд.',
      },
      formal: {
        soft: 'Представьте, каким сильным Вы будете через месяц без алкоголя!',
        moderate: 'Месяц без алкоголя — новый Вы. Вы почти у цели!',
        hard: 'Месяц без алкоголя = новая жизнь. Вперёд.',
      },
    },
  },
  {
    id: 'habit_alcohol_motiv_05',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Дети замечают твои изменения. Будь для них примером.',
        moderate: 'Дети видят в тебе пример силы. Не подведи их.',
        hard: 'Дети смотрят на тебя. Будь сильным.',
      },
      formal: {
        soft: 'Дети замечают Ваши изменения. Будьте для них примером.',
        moderate: 'Дети видят в Вас пример силы. Не подведите их.',
        hard: 'Дети смотрят на Вас. Будьте сильным.',
      },
    },
  },
  {
    id: 'habit_alcohol_motiv_06',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Алкоголь украл у тебя время. Верни его — живи трезво.',
        moderate: 'Верни себе жизнь. Каждый трезвый день — это твоя победа.',
        hard: 'Верни жизнь. Действуй сейчас.',
      },
      formal: {
        soft: 'Алкоголь украл у Вас время. Верните его — живите трезво.',
        moderate: 'Верните себе жизнь. Каждый трезвый день — это Ваша победа.',
        hard: 'Верните жизнь. Действуйте сейчас.',
      },
    },
  },
  {
    id: 'habit_alcohol_motiv_07',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты дал себе обещание. Держи слово — это твоя сила.',
        moderate: 'Ты обещал себе. Держи слово. Ты сильнее алкоголя.',
        hard: 'Обещал — держи. Ты сильнее.',
      },
      formal: {
        soft: 'Вы дали себе обещание. Держите слово — это Ваша сила.',
        moderate: 'Вы обещали себе. Держите слово. Вы сильнее алкоголя.',
        hard: 'Обещали — держите. Вы сильнее.',
      },
    },
  },
  {
    id: 'habit_alcohol_motiv_08',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Близкие ждут тебя трезвым. Каждый день — подарок для них.',
        moderate: 'Близкие гордятся твоей силой. Не останавливайся.',
        hard: 'Близкие верят в тебя. Не подведи.',
      },
      formal: {
        soft: 'Близкие ждут Вас трезвым. Каждый день — подарок для них.',
        moderate: 'Близкие гордятся Вашей силой. Не останавливайтесь.',
        hard: 'Близкие верят в Вас. Не подведите.',
      },
    },
  },
  {
    id: 'habit_alcohol_motiv_09',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый трезвый час — это ты выбираешь себя и свою жизнь.',
        moderate: 'Ты выбрал жизнь без алкоголя. Это твоя победа.',
        hard: 'Выбирай жизнь. Каждый час — твоё решение.',
      },
      formal: {
        soft: 'Каждый трезвый час — это Вы выбираете себя и свою жизнь.',
        moderate: 'Вы выбрали жизнь без алкоголя. Это Ваша победа.',
        hard: 'Выбирайте жизнь. Каждый час — Ваше решение.',
      },
    },
  },
  {
    id: 'habit_alcohol_motiv_10',
    kind: 'habits',
    entityKey: 'alcohol',
    intent: 'quit',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты строишь новую жизнь. Трезвость — твой фундамент.',
        moderate: 'Новая жизнь начинается с трезвости. Ты на правильном пути.',
        hard: 'Трезвость = сила. Ты строишь новую жизнь.',
      },
      formal: {
        soft: 'Вы строите новую жизнь. Трезвость — Ваш фундамент.',
        moderate: 'Новая жизнь начинается с трезвости. Вы на правильном пути.',
        hard: 'Трезвость = сила. Вы строите новую жизнь.',
      },
    },
  },
];

export const habitsTemplates: NotificationTemplate[] =
  applyImageTags(rawHabitsTemplates);

/**
 * Полный каталог шаблонов
 * Используется в скрипте миграции для переноса в БД
 */
export const notificationTemplates: NotificationTemplate[] = [
  ...therapyTemplates,
  ...habitsTemplates,
];
