export type NotificationKind = 'therapy' | 'habits';
export type TherapyType =
  | 'breath_cue'
  | 'grounding'
  | 'body_scan'
  | 'reframe'
  | 'mi_prompt'
  | 'sos';
export type HabitsType =
  // build-привычки
  | 'water'
  | 'steps'
  | 'sleep'
  | 'training'
  | 'focus'
  | 'nutrition'
  | 'meditation'
  | 'gratitude'
  | 'morning_routine'
  | 'planning'
  // quit-привычки
  | 'smoking'
  | 'alcohol'
  | 'sugar'
  | 'screentime'
  | 'caffeine'
  | 'procrastination'
  // универсальные
  | 'custom'
  | 'quit'; // legacy
export type Addressing = 'informal' | 'formal';
export type Tone =
  | 'delicate'
  | 'neutral'
  | 'uplifting'
  | 'resolute'
  | 'demanding';
export type Directness = 'soft' | 'moderate' | 'hard' | 'universal';

// Новые типы для habits v3
export type HabitIntent = 'build' | 'quit' | 'custom';
export type HabitSubtype =
  | 'reminder'
  | 'informational'
  | 'motivational'
  | 'mixed';
export type HabitKey =
  // build
  | 'water'
  | 'steps'
  | 'sleep'
  | 'training'
  | 'focus'
  | 'nutrition'
  | 'meditation'
  | 'gratitude'
  | 'morning_routine'
  | 'planning'
  // quit
  | 'smoking'
  | 'alcohol'
  | 'sugar'
  | 'screentime'
  | 'caffeine'
  | 'procrastination'
  // custom (fallback для пользовательских привычек)
  | 'custom';

export interface NotificationTemplate {
  id: string;
  kind: NotificationKind;
  type: TherapyType | HabitsType;
  directness: Directness[]; // Только для informational (universal), для reminder/motivational можно не указывать
  topic?: string; // Для therapy: привязка к теме (anxiety, stress, mood, etc.)
  // Новые поля для habits v3
  intent?: HabitIntent; // Для habits: build | quit | custom
  habitKey?: HabitKey; // Для habits: нормализованный ключ (water, smoking, etc.)
  subtype?: HabitSubtype; // Для habits: reminder | informational | motivational
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

/**
 * Каталог шаблонов для типа "therapy" (Терапия)
 */
export const therapyTemplates: NotificationTemplate[] = [
  // ==========================================
  // BREATH_CUE — Дыхательные практики
  // ==========================================
  {
    id: 'psy_breath_478_01',
    kind: 'therapy',
    type: 'breath_cue',
    topic: 'anxiety', // Привязка к теме
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сделай 3 тихих цикла дыхания 4-7-8, {name}. Начни с первого.',
        moderate: 'Сделай 3 цикла 4-7-8. Держи фокус на выдохе.',
        hard: 'Сейчас 3 цикла 4-7-8. Действуй.',
      },
      formal: {
        soft: 'Сделайте 3 тихих цикла дыхания 4-7-8, {name}. Начните с первого.',
        moderate: 'Сделайте 3 цикла 4-7-8. Держите фокус на выдохе.',
        hard: 'Сейчас 3 цикла 4-7-8. Действуйте.',
      },
    },
  },
  {
    id: 'psy_breath_478_02',
    kind: 'therapy',
    type: 'breath_cue',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Время для короткой паузы. 3 цикла дыхания 4-7-8, {name}.',
        moderate: 'Проведи 3 цикла дыхания 4-7-8. Фокус на длинном выдохе.',
        hard: 'Стоп. 3 цикла 4-7-8 прямо сейчас.',
      },
      formal: {
        soft: 'Время для короткой паузы. 3 цикла дыхания 4-7-8, {name}.',
        moderate:
          'Выполните 3 цикла дыхания 4-7-8. Сфокусируйтесь на длинном выдохе.',
        hard: 'Стоп. 3 цикла 4-7-8 прямо сейчас.',
      },
    },
  },
  {
    id: 'psy_breath_box_01',
    kind: 'therapy',
    type: 'breath_cue',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Попробуй квадратное дыхание, {name}: 4 секунды вдох — задержка — выдох — задержка.',
        moderate: 'Квадратное дыхание: 4-4-4-4. Три раза подряд.',
        hard: 'Квадратное дыхание сейчас: 4-4-4-4. Три цикла.',
      },
      formal: {
        soft: 'Попробуйте квадратное дыхание, {name}: 4 секунды вдох — задержка — выдох — задержка.',
        moderate: 'Квадратное дыхание: 4-4-4-4. Три раза подряд.',
        hard: 'Квадратное дыхание сейчас: 4-4-4-4. Три цикла.',
      },
    },
  },

  // ==========================================
  // GROUNDING — Техники заземления
  // ==========================================
  {
    id: 'psy_grounding_54321_01',
    kind: 'therapy',
    type: 'grounding',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Попробуй технику 5-4-3-2-1, {name}. Заметь 5 вещей, которые видишь.',
        moderate:
          'Техника 5-4-3-2-1: найди 5 вещей вокруг, 4 звука, 3 тактильных ощущения.',
        hard: 'Сейчас пауза: 5-4-3-2-1. Заверши и возвращайся к задаче.',
      },
      formal: {
        soft: 'Попробуйте технику 5-4-3-2-1, {name}. Отметьте 5 вещей, которые видите.',
        moderate:
          'Техника 5-4-3-2-1: найдите 5 вещей вокруг, 4 звука, 3 тактильных ощущения.',
        hard: 'Сейчас пауза: 5-4-3-2-1. Завершите и возвращайтесь к задаче.',
      },
    },
  },
  {
    id: 'psy_grounding_3things_01',
    kind: 'therapy',
    type: 'grounding',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сделай небольшой вдох-выдох, {name}. Заметь 3 вещи вокруг.',
        moderate: 'Останови взгляд на 3 предметах. Назови их про себя.',
        hard: 'Сейчас: найди 3 вещи в комнате. Назови их.',
      },
      formal: {
        soft: 'Сделайте небольшой вдох-выдох, {name}. Отметьте 3 вещи вокруг.',
        moderate: 'Остановите взгляд на 3 предметах. Назовите их про себя.',
        hard: 'Сейчас: найдите 3 вещи в комнате. Назовите их.',
      },
    },
  },
  {
    id: 'psy_grounding_tactile_01',
    kind: 'therapy',
    type: 'grounding',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Потрогай любой предмет рядом, {name}. Почувствуй текстуру и температуру.',
        moderate:
          'Найди что-то рядом и потрогай. Заметь текстуру, температуру, вес.',
        hard: 'Возьми что-то в руки. Почувствуй текстуру и температуру.',
      },
      formal: {
        soft: 'Потрогайте любой предмет рядом, {name}. Почувствуйте текстуру и температуру.',
        moderate:
          'Найдите что-то рядом и потрогайте. Отметьте текстуру, температуру, вес.',
        hard: 'Возьмите что-то в руки. Почувствуйте текстуру и температуру.',
      },
    },
  },

  // ==========================================
  // BODY_SCAN — Сканирование тела
  // ==========================================
  {
    id: 'psy_bodyscan_shoulders_01',
    kind: 'therapy',
    type: 'body_scan',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Обрати внимание на плечи, {name}. Если напряжены — опусти их.',
        moderate:
          'Проверь плечи. Если напряжены — сделай вдох и опусти на выдохе.',
        hard: 'Плечи напряжены? Опусти их сейчас.',
      },
      formal: {
        soft: 'Обратите внимание на плечи, {name}. Если напряжены — опустите их.',
        moderate:
          'Проверьте плечи. Если напряжены — сделайте вдох и опустите на выдохе.',
        hard: 'Плечи напряжены? Опустите их сейчас.',
      },
    },
  },
  {
    id: 'psy_bodyscan_jaw_01',
    kind: 'therapy',
    type: 'body_scan',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Проверь челюсть, {name}. Если сжата — отпусти.',
        moderate: 'Челюсть расслаблена? Если нет — разожми.',
        hard: 'Разожми челюсть прямо сейчас.',
      },
      formal: {
        soft: 'Проверьте челюсть, {name}. Если сжата — отпустите.',
        moderate: 'Челюсть расслаблена? Если нет — разожмите.',
        hard: 'Разожмите челюсть прямо сейчас.',
      },
    },
  },
  {
    id: 'psy_bodyscan_belly_01',
    kind: 'therapy',
    type: 'body_scan',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Положи руку на живот, {name}. Почувствуй дыхание.',
        moderate:
          'Рука на живот. Следи за подъёмом и опусканием на вдохе и выдохе.',
        hard: 'Рука на живот. Дыши животом, а не грудью.',
      },
      formal: {
        soft: 'Положите руку на живот, {name}. Почувствуйте дыхание.',
        moderate:
          'Рука на живот. Следите за подъёмом и опусканием на вдохе и выдохе.',
        hard: 'Рука на живот. Дышите животом, а не грудью.',
      },
    },
  },

  // ==========================================
  // REFRAME — Рефрейминг мыслей
  // ==========================================
  {
    id: 'psy_reframe_01',
    kind: 'therapy',
    type: 'reframe',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Если сейчас что-то беспокоит, {name} — попробуй переформулировать: "Что если это не так страшно?"',
        moderate:
          'Какая мысль сейчас беспокоит? Спроси себя: "Есть ли альтернативный взгляд?"',
        hard: 'Какая мысль тревожит? Спроси: "Это факт или предположение?"',
      },
      formal: {
        soft: 'Если сейчас что-то беспокоит, {name} — попробуйте переформулировать: "Что если это не так страшно?"',
        moderate:
          'Какая мысль сейчас беспокоит? Спросите себя: "Есть ли альтернативный взгляд?"',
        hard: 'Какая мысль тревожит? Спросите: "Это факт или предположение?"',
      },
    },
  },
  {
    id: 'psy_reframe_02',
    kind: 'therapy',
    type: 'reframe',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Попробуй взглянуть на ситуацию под другим углом, {name}. Что хорошего может выйти?',
        moderate:
          'Ситуация: какую пользу она может принести? Подумай о возможностях.',
        hard: 'Найди одну положительную сторону в текущей ситуации. Прямо сейчас.',
      },
      formal: {
        soft: 'Попробуйте взглянуть на ситуацию под другим углом, {name}. Что хорошего может выйти?',
        moderate:
          'Ситуация: какую пользу она может принести? Подумайте о возможностях.',
        hard: 'Найдите одну положительную сторону в текущей ситуации. Прямо сейчас.',
      },
    },
  },

  // ==========================================
  // MI_PROMPT — Мотивационное интервьюирование
  // ==========================================
  {
    id: 'psy_mi_01',
    kind: 'therapy',
    type: 'mi_prompt',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Что сейчас для тебя важно, {name}? Подумай и назови одну вещь.',
        moderate: 'Чего ты хочешь достичь сегодня? Одна цель.',
        hard: 'Какая твоя главная цель сегодня? Назови её.',
      },
      formal: {
        soft: 'Что сейчас для Вас важно, {name}? Подумайте и назовите одну вещь.',
        moderate: 'Чего Вы хотите достичь сегодня? Одна цель.',
        hard: 'Какая Ваша главная цель сегодня? Назовите её.',
      },
    },
  },
  {
    id: 'psy_mi_02',
    kind: 'therapy',
    type: 'mi_prompt',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Что тебе сейчас нужно, {name}? Отдых, движение или поддержка?',
        moderate:
          'Оцени своё состояние. Что поможет: пауза, активность или разговор?',
        hard: 'Что нужно сейчас: отдых, движение или поддержка? Выбери одно.',
      },
      formal: {
        soft: 'Что Вам сейчас нужно, {name}? Отдых, движение или поддержка?',
        moderate:
          'Оцените своё состояние. Что поможет: пауза, активность или разговор?',
        hard: 'Что нужно сейчас: отдых, движение или поддержка? Выберите одно.',
      },
    },
  },

  // ==========================================
  // SOS — Быстрый вызов SOS-карты
  // ==========================================
  {
    id: 'psy_sos_01',
    kind: 'therapy',
    type: 'sos',
    directness: ['moderate', 'hard'],
    ru: {
      informal: {
        moderate: 'Тревога высокая? Открой SOS-карту прямо сейчас.',
        hard: 'Высокая тревога. SOS-карта — сейчас.',
      },
      formal: {
        moderate: 'Тревога высокая? Откройте SOS-карту прямо сейчас.',
        hard: 'Высокая тревога. SOS-карта — сейчас.',
      },
    },
  },
  {
    id: 'psy_sos_02',
    kind: 'therapy',
    type: 'sos',
    directness: ['moderate', 'hard'],
    ru: {
      informal: {
        moderate: 'Чувствуешь, что не справляешься? Открой SOS-карту.',
        hard: 'Не справляешься? SOS-карта — открой.',
      },
      formal: {
        moderate: 'Чувствуете, что не справляетесь? Откройте SOS-карту.',
        hard: 'Не справляетесь? SOS-карта — откройте.',
      },
    },
  },
];

/**
 * Каталог шаблонов для типа "habits" (Привычки)
 */
export const habitsTemplates: NotificationTemplate[] = [
  // ==========================================
  // WATER (build) - 20 REMINDER + 20 INFORMATIONAL + 20 MOTIVATIONAL = 60 шаблонов
  // ==========================================

  // Reminder (20 шаблонов)
  {
    id: 'habit_water_reminder_01',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Обезвоживание снижает концентрацию на 20%.',
    },
  },
  {
    id: 'habit_water_info_02',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода составляет 60% массы тела взрослого человека.',
    },
  },
  {
    id: 'habit_water_info_03',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Мозг на 75% состоит из воды.',
    },
  },
  {
    id: 'habit_water_info_05',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода помогает выводить токсины из организма через почки.',
    },
  },
  {
    id: 'habit_water_info_06',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Обезвоживание может вызывать головную боль и усталость.',
    },
  },
  {
    id: 'habit_water_info_08',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода участвует в регуляции температуры тела.',
    },
  },
  {
    id: 'habit_water_info_09',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Достаточное потребление воды улучшает состояние кожи.',
    },
  },
  {
    id: 'habit_water_info_10',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода необходима для нормального пищеварения.',
    },
  },
  {
    id: 'habit_water_info_11',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Чувство жажды появляется при обезвоживании 1-2%.',
    },
  },
  {
    id: 'habit_water_info_12',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода помогает суставам оставаться смазанными и гибкими.',
    },
  },
  {
    id: 'habit_water_info_13',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Питьевая вода в течение дня улучшает метаболизм на 24-30%.',
    },
  },
  {
    id: 'habit_water_info_14',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода не содержит калорий и способствует контролю веса.',
    },
  },
  {
    id: 'habit_water_info_16',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Стакан воды перед едой может снизить аппетит на 13%.',
    },
  },
  {
    id: 'habit_water_info_17',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Вода помогает доставлять кислород к клеткам организма.',
    },
  },
  {
    id: 'habit_water_info_18',
    kind: 'habits',
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'water',
    intent: 'build',
    habitKey: 'water',
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
    type: 'steps',
    intent: 'build',
    habitKey: 'steps',
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
    type: 'steps',
    intent: 'build',
    habitKey: 'steps',
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
  // Сон (build)
  {
    id: 'habit_sleep_reminder_01',
    kind: 'habits',
    type: 'sleep',
    intent: 'build',
    habitKey: 'sleep',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Подготовился ли ты ко сну? Если нет, отложи телефон и подыши.',
        moderate: 'Пора готовиться ко сну. Телефон в сторону, дыхание 4-7-8.',
        hard: 'Спать. Телефон убрать. 3 цикла 4-7-8.',
      },
      formal: {
        soft: 'Подготовились ли Вы ко сну? Если нет, отложите телефон и подышите.',
        moderate: 'Пора готовиться ко сну. Телефон в сторону, дыхание 4-7-8.',
        hard: 'Спать. Телефон убрать. 3 цикла 4-7-8.',
      },
    },
  },
  {
    id: 'habit_sleep_motivational_01',
    kind: 'habits',
    type: 'sleep',
    intent: 'build',
    habitKey: 'sleep',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоё завтра начинается с качественного сна. Начни готовиться сейчас.',
        moderate: 'Сделай шаг к спокойной ночи: свет тише, дыхание ровнее.',
        hard: 'Готовимся ко сну. Мини-ритуал — сейчас.',
      },
      formal: {
        soft: 'Ваше завтра начинается с качественного сна. Начните готовиться сейчас.',
        moderate: 'Сделайте шаг к спокойной ночи: свет тише, дыхание ровнее.',
        hard: 'Готовимся ко сну. Мини-ритуал — сейчас.',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Регулярная физическая активность улучшает качество сна.',
    },
  },
  {
    id: 'habit_training_info_06',
    kind: 'habits',
    type: 'training',
    intent: 'build',
    habitKey: 'training',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Тренировки повышают метаболизм на 24-48 часов после занятия.',
    },
  },
  {
    id: 'habit_training_info_07',
    kind: 'habits',
    type: 'training',
    intent: 'build',
    habitKey: 'training',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Аэробные упражнения улучшают работу сердца и лёгких.',
    },
  },
  {
    id: 'habit_training_info_08',
    kind: 'habits',
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Регулярные тренировки улучшают когнитивные функции и память.',
    },
  },
  {
    id: 'habit_training_info_10',
    kind: 'habits',
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Физическая активность снижает уровень стресса и тревожности.',
    },
  },
  {
    id: 'habit_training_info_13',
    kind: 'habits',
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'training',
    intent: 'build',
    habitKey: 'training',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через 48 часов обоняние и вкус начинают восстанавливаться.',
    },
  },
  {
    id: 'habit_smoking_info_03',
    kind: 'habits',
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через месяц без курения риск инфаркта снижается на 50%.',
    },
  },
  {
    id: 'habit_smoking_info_05',
    kind: 'habits',
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Курение является причиной 85% случаев рака лёгких.',
    },
  },
  {
    id: 'habit_smoking_info_12',
    kind: 'habits',
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через 10 лет без курения риск рака лёгких снижается вдвое.',
    },
  },
  {
    id: 'habit_smoking_info_15',
    kind: 'habits',
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты заслуживаешь здоровую жизнь. Продолжай путь.',
        moderate: 'Каждый день — доказательство твоей силы.',
        hard: 'Докажи, что ты достоин здоровой жизни. Действуй.',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'smoking',
    intent: 'quit',
    habitKey: 'smoking',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Неделя без алкоголя улучшает качество сна на 35%.',
    },
  },
  {
    id: 'habit_alcohol_info_03',
    kind: 'habits',
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Алкоголь увеличивает риск развития депрессии в 3 раза.',
    },
  },
  {
    id: 'habit_alcohol_info_04',
    kind: 'habits',
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через месяц без алкоголя кровяное давление нормализуется.',
    },
  },
  {
    id: 'habit_alcohol_info_06',
    kind: 'habits',
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Алкоголь негативно влияет на отношения с близкими людьми.',
    },
  },
  {
    id: 'habit_alcohol_info_07',
    kind: 'habits',
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через 5 дней без алкоголя кожа выглядит свежее и здоровее.',
    },
  },
  {
    id: 'habit_alcohol_info_08',
    kind: 'habits',
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Отказ от алкоголя повышает работоспособность на 40%.',
    },
  },
  {
    id: 'habit_alcohol_info_10',
    kind: 'habits',
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Через год без алкоголя риск рака печени снижается на 50%.',
    },
  },
  {
    id: 'habit_alcohol_info_11',
    kind: 'habits',
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Алкоголь является одной из главных причин цирроза печени.',
    },
  },
  {
    id: 'habit_alcohol_info_12',
    kind: 'habits',
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Отказ от алкоголя укрепляет иммунную систему.',
    },
  },
  {
    id: 'habit_alcohol_info_14',
    kind: 'habits',
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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
    type: 'alcohol',
    intent: 'quit',
    habitKey: 'alcohol',
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

  // Универсальное напоминание
  // ==========================================
  // CUSTOM (build) - Универсальные шаблоны для любых пользовательских привычек
  // 20 REMINDER + 20 INFORMATIONAL + 20 MOTIVATIONAL = 60 шаблонов
  // ==========================================

  // Reminder (20 шаблонов) - универсальные напоминания
  {
    id: 'habit_custom_reminder_01',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Время для своей привычки. Даже маленький шаг — это прогресс.',
        moderate: 'Время для привычки. Сделай небольшой шаг.',
        hard: 'Привычка. Действуй.',
      },
      formal: {
        soft: 'Время для своей привычки. Даже маленький шаг — это прогресс.',
        moderate: 'Время для привычки. Сделайте небольшой шаг.',
        hard: 'Привычка. Действуйте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_02',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Не забудь про свою цель. Каждое действие важно.',
        moderate: 'Не забудь про цель. Действуй сейчас.',
        hard: 'Цель. Действуй.',
      },
      formal: {
        soft: 'Не забудьте про свою цель. Каждое действие важно.',
        moderate: 'Не забудьте про цель. Действуйте сейчас.',
        hard: 'Цель. Действуйте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_03',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Пора поработать над своей привычкой. Ты молодец, что не сдаёшься.',
        moderate: 'Пора поработать над привычкой. Продолжай.',
        hard: 'Работай над привычкой. Сейчас.',
      },
      formal: {
        soft: 'Пора поработать над своей привычкой. Вы молодец, что не сдаётесь.',
        moderate: 'Пора поработать над привычкой. Продолжайте.',
        hard: 'Работайте над привычкой. Сейчас.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_04',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Настало время для шага к своей цели. Начни прямо сейчас.',
        moderate: 'Время для шага к цели. Начни сейчас.',
        hard: 'Шаг к цели. Начинай.',
      },
      formal: {
        soft: 'Настало время для шага к своей цели. Начните прямо сейчас.',
        moderate: 'Время для шага к цели. Начните сейчас.',
        hard: 'Шаг к цели. Начинайте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_05',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Помнишь о своей цели? Удели ей немного времени.',
        moderate: 'Помнишь о цели? Удели время сейчас.',
        hard: 'Цель помнишь? Время.',
      },
      formal: {
        soft: 'Помните о своей цели? Уделите ей немного времени.',
        moderate: 'Помните о цели? Уделите время сейчас.',
        hard: 'Цель помните? Время.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_06',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоя привычка ждёт внимания. Подари ей пару минут.',
        moderate: 'Привычка ждёт. Подари пару минут.',
        hard: 'Привычка ждёт. Действуй.',
      },
      formal: {
        soft: 'Ваша привычка ждёт внимания. Подарите ей пару минут.',
        moderate: 'Привычка ждёт. Подарите пару минут.',
        hard: 'Привычка ждёт. Действуйте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_07',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Маленькое напоминание о твоей цели. Время действовать.',
        moderate: 'Напоминание о цели. Действуй.',
        hard: 'Цель. Действуй.',
      },
      formal: {
        soft: 'Маленькое напоминание о Вашей цели. Время действовать.',
        moderate: 'Напоминание о цели. Действуйте.',
        hard: 'Цель. Действуйте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_08',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сделай что-то для своей привычки сегодня. Любой шаг считается.',
        moderate: 'Сделай для привычки сегодня. Любой шаг.',
        hard: 'Для привычки. Шаг.',
      },
      formal: {
        soft: 'Сделайте что-то для своей привычки сегодня. Любой шаг считается.',
        moderate: 'Сделайте для привычки сегодня. Любой шаг.',
        hard: 'Для привычки. Шаг.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_09',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Уделил ли ты сегодня время своей цели? Если нет, самое время.',
        moderate: 'Уделил время цели? Если нет — сейчас.',
        hard: 'Время цели? Нет? Действуй.',
      },
      formal: {
        soft: 'Уделили ли Вы сегодня время своей цели? Если нет, самое время.',
        moderate: 'Уделили время цели? Если нет — сейчас.',
        hard: 'Время цели? Нет? Действуйте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_10',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый день — возможность стать ближе к цели. Используй её.',
        moderate: 'Каждый день = возможность. Используй.',
        hard: 'Возможность. Используй.',
      },
      formal: {
        soft: 'Каждый день — возможность стать ближе к цели. Используйте её.',
        moderate: 'Каждый день = возможность. Используйте.',
        hard: 'Возможность. Используйте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_11',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Напоминаю о твоей важной привычке. Найди время для неё.',
        moderate: 'Важная привычка. Найди время.',
        hard: 'Привычка. Время.',
      },
      formal: {
        soft: 'Напоминаю о Вашей важной привычке. Найдите время для неё.',
        moderate: 'Важная привычка. Найдите время.',
        hard: 'Привычка. Время.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_12',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Продолжай двигаться к цели. Сделай маленький шаг сейчас.',
        moderate: 'Двигайся к цели. Маленький шаг сейчас.',
        hard: 'К цели. Шаг.',
      },
      formal: {
        soft: 'Продолжайте двигаться к цели. Сделайте маленький шаг сейчас.',
        moderate: 'Двигайтесь к цели. Маленький шаг сейчас.',
        hard: 'К цели. Шаг.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_13',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоя привычка важна. Позаботься о ней прямо сейчас.',
        moderate: 'Привычка важна. Позаботься сейчас.',
        hard: 'Привычка. Заботься.',
      },
      formal: {
        soft: 'Ваша привычка важна. Позаботьтесь о ней прямо сейчас.',
        moderate: 'Привычка важна. Позаботьтесь сейчас.',
        hard: 'Привычка. Заботьтесь.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_14',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Не откладывай. Уделив время привычке сейчас, ты благодаришь себя позже.',
        moderate: 'Не откладывай. Время привычке сейчас.',
        hard: 'Не откладывай. Действуй.',
      },
      formal: {
        soft: 'Не откладывайте. Уделив время привычке сейчас, Вы благодарите себя позже.',
        moderate: 'Не откладывайте. Время привычке сейчас.',
        hard: 'Не откладывайте. Действуйте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_15',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Пора уделить внимание своей цели. Начни с малого.',
        moderate: 'Внимание цели. Начни с малого.',
        hard: 'Цель. Малое. Начни.',
      },
      formal: {
        soft: 'Пора уделить внимание своей цели. Начните с малого.',
        moderate: 'Внимание цели. Начните с малого.',
        hard: 'Цель. Малое. Начните.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_16',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Помни о том, зачем ты начал. Сделай шаг к цели.',
        moderate: 'Помни, зачем начал. Шаг к цели.',
        hard: 'Помни. Шаг.',
      },
      formal: {
        soft: 'Помните о том, зачем Вы начали. Сделайте шаг к цели.',
        moderate: 'Помните, зачем начали. Шаг к цели.',
        hard: 'Помните. Шаг.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_17',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоя цель требует постоянства. Продолжай работать над ней.',
        moderate: 'Цель требует постоянства. Работай над ней.',
        hard: 'Постоянство. Работай.',
      },
      formal: {
        soft: 'Ваша цель требует постоянства. Продолжайте работать над ней.',
        moderate: 'Цель требует постоянства. Работайте над ней.',
        hard: 'Постоянство. Работайте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_18',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждое усилие приближает тебя к цели. Действуй сейчас.',
        moderate: 'Каждое усилие = приближение. Действуй.',
        hard: 'Усилие. Действуй.',
      },
      formal: {
        soft: 'Каждое усилие приближает Вас к цели. Действуйте сейчас.',
        moderate: 'Каждое усилие = приближение. Действуйте.',
        hard: 'Усилие. Действуйте.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_19',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сегодня отличный день для работы над привычкой. Начни.',
        moderate: 'Отличный день для привычки. Начни.',
        hard: 'Отличный день. Начни.',
      },
      formal: {
        soft: 'Сегодня отличный день для работы над привычкой. Начните.',
        moderate: 'Отличный день для привычки. Начните.',
        hard: 'Отличный день. Начните.',
      },
    },
  },
  {
    id: 'habit_custom_reminder_20',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'reminder',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Уделив всего немного времени, ты сделаешь большой шаг. Начни.',
        moderate: 'Немного времени = большой шаг. Начни.',
        hard: 'Время. Шаг. Начни.',
      },
      formal: {
        soft: 'Уделив всего немного времени, Вы сделаете большой шаг. Начните.',
        moderate: 'Немного времени = большой шаг. Начните.',
        hard: 'Время. Шаг. Начните.',
      },
    },
  },

  // Informational (20 шаблонов) - универсальные факты о привычках - universal формат
  {
    id: 'habit_custom_info_01',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Формирование новой привычки занимает в среднем 66 дней.',
    },
  },
  {
    id: 'habit_custom_info_02',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Маленькие ежедневные действия создают большие долгосрочные результаты.',
    },
  },
  {
    id: 'habit_custom_info_03',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        '40% наших ежедневных действий — это привычки, а не осознанные решения.',
    },
  },
  {
    id: 'habit_custom_info_04',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Регулярность важнее интенсивности при формировании привычек.',
    },
  },
  {
    id: 'habit_custom_info_05',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Привязка новой привычки к существующей увеличивает шансы на успех на 80%.',
    },
  },
  {
    id: 'habit_custom_info_06',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Публичное объявление о своей цели повышает вероятность успеха на 65%.',
    },
  },
  {
    id: 'habit_custom_info_07',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Визуализация успеха активирует те же области мозга, что и реальное действие.',
    },
  },
  {
    id: 'habit_custom_info_08',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Отслеживание прогресса увеличивает мотивацию и вероятность достижения цели.',
    },
  },
  {
    id: 'habit_custom_info_09',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Лучшее время для формирования привычки — утро, когда сила воли максимальна.',
    },
  },
  {
    id: 'habit_custom_info_10',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Пропуск одного дня не влияет на формирование привычки, важна общая регулярность.',
    },
  },
  {
    id: 'habit_custom_info_11',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Конкретные цели (например, "5 раз в неделю") эффективнее абстрактных ("чаще").',
    },
  },
  {
    id: 'habit_custom_info_12',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Награждение себя после выполнения привычки усиливает нейронные связи.',
    },
  },
  {
    id: 'habit_custom_info_13',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Изменение окружения может быть эффективнее, чем попытки изменить себя.',
    },
  },
  {
    id: 'habit_custom_info_14',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Хорошие привычки формируются медленно, но сохраняются долго.',
    },
  },
  {
    id: 'habit_custom_info_15',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Планирование "если-то" (if-then) удваивает шансы на выполнение привычки.',
    },
  },
  {
    id: 'habit_custom_info_16',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal: 'Привычки сохраняются даже при потере сознательной памяти.',
    },
  },
  {
    id: 'habit_custom_info_17',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Сила воли — ограниченный ресурс, который истощается в течение дня.',
    },
  },
  {
    id: 'habit_custom_info_18',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Создание цепочки привычек делает их выполнение автоматическим.',
    },
  },
  {
    id: 'habit_custom_info_19',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Социальная поддержка увеличивает вероятность успеха в 3-4 раза.',
    },
  },
  {
    id: 'habit_custom_info_20',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'informational',
    directness: ['universal'],
    ru: {
      universal:
        'Начать с малого — ключ к долгосрочному успеху в формировании привычек.',
    },
  },

  // Motivational (20 шаблонов) - универсальная мотивация
  {
    id: 'habit_custom_motiv_01',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты на правильном пути. Продолжай двигаться к своей цели.',
        moderate: 'Правильный путь. Продолжай к цели.',
        hard: 'Правильный путь. К цели.',
      },
      formal: {
        soft: 'Вы на правильном пути. Продолжайте двигаться к своей цели.',
        moderate: 'Правильный путь. Продолжайте к цели.',
        hard: 'Правильный путь. К цели.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_02',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый шаг считается. Не останавливайся на достигнутом.',
        moderate: 'Каждый шаг важен. Не останавливайся.',
        hard: 'Шаг важен. Не стой.',
      },
      formal: {
        soft: 'Каждый шаг считается. Не останавливайтесь на достигнутом.',
        moderate: 'Каждый шаг важен. Не останавливайтесь.',
        hard: 'Шаг важен. Не стойте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_03',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты сильнее, чем думаешь. Продолжай работать над своей привычкой.',
        moderate: 'Ты сильнее. Продолжай работать.',
        hard: 'Сильнее. Работай.',
      },
      formal: {
        soft: 'Вы сильнее, чем думаете. Продолжайте работать над своей привычкой.',
        moderate: 'Вы сильнее. Продолжайте работать.',
        hard: 'Сильнее. Работайте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_04',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Успех складывается из маленьких побед. Добавь ещё одну сегодня.',
        moderate: 'Успех = маленькие победы. Добавь сегодня.',
        hard: 'Победа. Добавь.',
      },
      formal: {
        soft: 'Успех складывается из маленьких побед. Добавьте ещё одну сегодня.',
        moderate: 'Успех = маленькие победы. Добавьте сегодня.',
        hard: 'Победа. Добавьте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_05',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Гордись собой за каждое усилие. Ты молодец!',
        moderate: 'Гордись усилиями. Ты молодец!',
        hard: 'Гордись. Молодец.',
      },
      formal: {
        soft: 'Гордитесь собой за каждое усилие. Вы молодец!',
        moderate: 'Гордитесь усилиями. Вы молодец!',
        hard: 'Гордитесь. Молодец.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_06',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твои цели достойны усилий. Продолжай работать над ними.',
        moderate: 'Цели достойны усилий. Работай.',
        hard: 'Достойные цели. Работай.',
      },
      formal: {
        soft: 'Ваши цели достойны усилий. Продолжайте работать над ними.',
        moderate: 'Цели достойны усилий. Работайте.',
        hard: 'Достойные цели. Работайте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_07',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Изменения начинаются с малого. Ты уже на пути к лучшей версии себя.',
        moderate: 'Изменения = с малого. Ты на пути.',
        hard: 'Малое. Путь.',
      },
      formal: {
        soft: 'Изменения начинаются с малого. Вы уже на пути к лучшей версии себя.',
        moderate: 'Изменения = с малого. Вы на пути.',
        hard: 'Малое. Путь.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_08',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Не сдавайся. Результаты придут с постоянством.',
        moderate: 'Не сдавайся. Постоянство = результаты.',
        hard: 'Не сдавайся. Постоянство.',
      },
      formal: {
        soft: 'Не сдавайтесь. Результаты придут с постоянством.',
        moderate: 'Не сдавайтесь. Постоянство = результаты.',
        hard: 'Не сдавайтесь. Постоянство.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_09',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты инвестируешь в своё будущее. Продолжай в том же духе.',
        moderate: 'Инвестируешь в будущее. Продолжай.',
        hard: 'В будущее. Продолжай.',
      },
      formal: {
        soft: 'Вы инвестируете в своё будущее. Продолжайте в том же духе.',
        moderate: 'Инвестируете в будущее. Продолжайте.',
        hard: 'В будущее. Продолжайте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_10',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоя решимость впечатляет. Не останавливайся сейчас.',
        moderate: 'Решимость впечатляет. Не останавливайся.',
        hard: 'Решимость. Не стой.',
      },
      formal: {
        soft: 'Ваша решимость впечатляет. Не останавливайтесь сейчас.',
        moderate: 'Решимость впечатляет. Не останавливайтесь.',
        hard: 'Решимость. Не стойте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_11',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Каждый день ты становишься немного лучше. Продолжай этот путь.',
        moderate: 'Каждый день = лучше. Продолжай путь.',
        hard: 'День = лучше. Путь.',
      },
      formal: {
        soft: 'Каждый день Вы становитесь немного лучше. Продолжайте этот путь.',
        moderate: 'Каждый день = лучше. Продолжайте путь.',
        hard: 'День = лучше. Путь.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_12',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Будущее "я" благодарит тебя за сегодняшние усилия. Продолжай.',
        moderate: 'Будущее "я" благодарит. Продолжай.',
        hard: 'Будущее благодарит. Продолжай.',
      },
      formal: {
        soft: 'Будущее "я" благодарит Вас за сегодняшние усилия. Продолжайте.',
        moderate: 'Будущее "я" благодарит. Продолжайте.',
        hard: 'Будущее благодарит. Продолжайте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_13',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты уже начал. Это самая сложная часть. Продолжай.',
        moderate: 'Уже начал = сложное позади. Продолжай.',
        hard: 'Начал. Продолжай.',
      },
      formal: {
        soft: 'Вы уже начали. Это самая сложная часть. Продолжайте.',
        moderate: 'Уже начали = сложное позади. Продолжайте.',
        hard: 'Начали. Продолжайте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_14',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Твоя привычка формируется с каждым действием. Добавь ещё одно.',
        moderate: 'Привычка формируется. Добавь действие.',
        hard: 'Формируется. Добавь.',
      },
      formal: {
        soft: 'Ваша привычка формируется с каждым действием. Добавьте ещё одно.',
        moderate: 'Привычка формируется. Добавьте действие.',
        hard: 'Формируется. Добавьте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_15',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты контролируешь свои привычки. Создай ту жизнь, которую хочешь.',
        moderate: 'Контролируешь привычки. Создай жизнь.',
        hard: 'Контроль. Создавай.',
      },
      formal: {
        soft: 'Вы контролируете свои привычки. Создайте ту жизнь, которую хотите.',
        moderate: 'Контролируете привычки. Создайте жизнь.',
        hard: 'Контроль. Создавайте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_16',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Маленькие шаги ведут к великим достижениям. Сделай свой шаг.',
        moderate: 'Маленькие шаги = великие достижения. Шаг.',
        hard: 'Малое = великое. Шаг.',
      },
      formal: {
        soft: 'Маленькие шаги ведут к великим достижениям. Сделайте свой шаг.',
        moderate: 'Маленькие шаги = великие достижения. Шаг.',
        hard: 'Малое = великое. Шаг.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_17',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Верь в процесс. Результаты приходят тем, кто не сдаётся.',
        moderate: 'Верь в процесс = результаты.',
        hard: 'Верь. Результаты.',
      },
      formal: {
        soft: 'Верьте в процесс. Результаты приходят тем, кто не сдаётся.',
        moderate: 'Верьте в процесс = результаты.',
        hard: 'Верьте. Результаты.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_18',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты заслуживаешь той жизни, о которой мечтаешь. Работай над ней.',
        moderate: 'Заслуживаешь мечты. Работай.',
        hard: 'Заслуживаешь. Работай.',
      },
      formal: {
        soft: 'Вы заслуживаете той жизни, о которой мечтаете. Работайте над ней.',
        moderate: 'Заслуживаете мечты. Работайте.',
        hard: 'Заслуживаете. Работайте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_19',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Сегодняшние усилия — завтрашние достижения. Действуй сейчас.',
        moderate: 'Сегодня = завтра. Действуй.',
        hard: 'Сегодня = завтра. Действуй.',
      },
      formal: {
        soft: 'Сегодняшние усилия — завтрашние достижения. Действуйте сейчас.',
        moderate: 'Сегодня = завтра. Действуйте.',
        hard: 'Сегодня = завтра. Действуйте.',
      },
    },
  },
  {
    id: 'habit_custom_motiv_20',
    kind: 'habits',
    type: 'custom',
    intent: 'build',
    habitKey: 'custom',
    subtype: 'motivational',
    directness: ['soft', 'moderate', 'hard'],
    ru: {
      informal: {
        soft: 'Ты пишешь историю своей жизни каждый день. Сделай её вдохновляющей.',
        moderate: 'Пишешь свою историю. Сделай вдохновляющей.',
        hard: 'Пиши историю. Вдохновляй.',
      },
      formal: {
        soft: 'Вы пишете историю своей жизни каждый день. Сделайте её вдохновляющей.',
        moderate: 'Пишете свою историю. Сделайте вдохновляющей.',
        hard: 'Пишите историю. Вдохновляйте.',
      },
    },
  },
];

/**
 * Полный каталог шаблонов
 */
export const notificationTemplates: NotificationTemplate[] = [
  ...therapyTemplates,
  ...habitsTemplates,
];

/**
 * Fallback текст при отсутствии подходящего шаблона
 */
export const FALLBACK_TEXT = 'Время сделать паузу и восстановить дыхание.';

/**
 * Подбор шаблона по параметрам
 * @param kind - тип уведомления (therapy | habits)
 * @param options - опциональные параметры фильтрации (topicKey, intent, habitKey, subtype)
 * @returns случайный подходящий шаблон или null
 *
 * Примечание: addressing и tone берутся из БД (userPreferences) и используются только в getTemplateText для выбора текста
 */
export function findTemplate(
  kind: NotificationKind,
  options?: {
    topicKey?: string;
    habitId?: string;
    type?: TherapyType | HabitsType;
    intent?: HabitIntent;
    habitKey?: HabitKey;
    subtype?: HabitSubtype;
    excludeTemplateIds?: string[];
    useFirst?: boolean; // Если true, возвращает первый шаблон вместо случайного (для production)
  }
): NotificationTemplate | null {
  const {
    topicKey,
    type,
    intent,
    habitKey: habitKeyParam,
    habitId,
    subtype,
    excludeTemplateIds,
    useFirst = false,
  } = options || {};
  // Используем habitKey, если передан, иначе fallback на habitId (для обратной совместимости)
  const habitKey = habitKeyParam || habitId;
  console.log('[findTemplate] Searching:', {
    kind,
    habitKey,
    intent,
    subtype,
    topicKey,
  });

  const templates = notificationTemplates.filter((t) => {
    const matchKind = t.kind === kind;
    const matchType = !type || t.type === type;

    // Для информационных шаблонов directness всегда 'universal'
    // Если subtype = 'informational', то ищем шаблоны с directness = 'universal'
    const matchDirectness =
      subtype === 'informational' ? t.directness.includes('universal') : true; // Для reminder/motivational не фильтруем по directness

    // Фильтруем по topicKey (для therapy)
    const matchTopic = !topicKey || !t.topic || t.topic === topicKey;

    // Для habits: приоритет новым полям (intent, habitKey, subtype)
    let matchHabit = true;
    if (kind === 'habits') {
      // Если intent передан, шаблон должен иметь тот же intent
      if (intent !== undefined) {
        if (t.intent) {
          matchHabit = matchHabit && t.intent === intent;
        } else {
          matchHabit = false; // Если intent передан, но у шаблона его нет - не подходит
        }
      }
      // Если habitKey передан, шаблон должен иметь тот же habitKey
      if (habitKey !== undefined && habitKey !== null) {
        if (t.habitKey) {
          matchHabit = matchHabit && t.habitKey === habitKey;
        } else {
          matchHabit = false; // Если habitKey передан, но у шаблона его нет - не подходит
        }
      }
      // Если subtype передан, шаблон должен иметь тот же subtype
      if (subtype !== undefined && subtype !== null) {
        if (t.subtype) {
          matchHabit = matchHabit && t.subtype === subtype;
        } else {
          matchHabit = false; // Если subtype передан, но у шаблона его нет - не подходит
        }
      }
    }

    // Исключаем недавно использованные
    const notExcluded =
      !excludeTemplateIds || !excludeTemplateIds.includes(t.id);

    const matches =
      matchKind &&
      matchType &&
      matchDirectness &&
      matchTopic &&
      matchHabit &&
      notExcluded;

    // Отладочное логирование для habits
    if (kind === 'habits' && habitKey && t.habitKey === habitKey) {
      // Логируем только шаблоны с правильным habitKey
      if (!matches) {
        console.log(
          `[findTemplate] Template ${t.id} (${t.habitKey}) filtered out:`,
          `matchKind=${matchKind},`,
          `matchType=${matchType},`,
          `matchDirectness=${matchDirectness} (t.directness=${JSON.stringify(t.directness)}, subtype=${subtype}),`,
          `matchHabit=${matchHabit},`,
          `t.intent=${t.intent},`,
          `intent=${intent},`,
          `t.subtype=${t.subtype},`,
          `subtype=${subtype},`,
          `notExcluded=${notExcluded}`
        );
      }
    }

    return matches;
  });

  if (templates.length === 0) {
    // Если все шаблоны исключены, начинаем новый круг
    if (excludeTemplateIds && excludeTemplateIds.length > 0) {
      console.warn('[findTemplate] All templates excluded, starting new cycle');
      return findTemplate(kind, {
        ...options,
        excludeTemplateIds: undefined,
      });
    }
    console.warn(
      `[findTemplate] No templates found for: kind=${kind}, habitKey=${habitKey}, intent=${intent}, subtype=${subtype}`
    );
    // Для отладки: показываем сколько всего шаблонов habits
    if (kind === 'habits') {
      const allHabitsTemplates = notificationTemplates.filter(
        (t) => t.kind === 'habits'
      );
      console.log(
        `[findTemplate] Total habits templates: ${allHabitsTemplates.length}`
      );
      if (habitKey) {
        const withHabitKey = allHabitsTemplates.filter(
          (t) => t.habitKey === habitKey
        );
        console.log(
          `[findTemplate] Templates with habitKey="${habitKey}": ${withHabitKey.length}`
        );
      }
    }
    return null;
  }

  // Возвращаем случайный шаблон из подходящих (или первый, если useFirst = true)
  if (useFirst) {
    return templates[0] ?? null;
  }
  return templates[Math.floor(Math.random() * templates.length)] ?? null;
}

/**
 * Получить текст шаблона с подстановкой плейсхолдеров
 * @param template - шаблон
 * @param addressing - обращение
 * @param directness - стиль подачи
 * @param userName - имя пользователя (для подстановки {name})
 * @returns итоговый текст уведомления
 */
export function getTemplateText(
  template: NotificationTemplate,
  addressing: Addressing,
  directness: Directness,
  userName?: string
): string {
  let text: string | undefined;

  // 1. Приоритет: универсальный текст (для informational)
  if (template.ru.universal) {
    text = template.ru.universal;
  }
  // 2. Universal с учетом addressing
  else if (template.ru[addressing]?.universal) {
    text = template.ru[addressing].universal;
  }
  // 3. Точное совпадение addressing + directness
  else if (template.ru[addressing]?.[directness]) {
    text = template.ru[addressing][directness];
  }
  // 4. Fallback на moderate (если запрошен soft/hard, но его нет)
  else if (directness !== 'moderate' && template.ru[addressing]?.moderate) {
    text = template.ru[addressing].moderate;
  }

  if (!text) return FALLBACK_TEXT;

  // Подстановка плейсхолдера {name}
  if (userName && userName.trim()) {
    return text.replace(/{name}/g, userName);
  }

  // Удаляем плейсхолдер и лишние запятые/пробелы, если имя отсутствует
  return text
    .replace(/{name}/g, '')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Получить текст уведомления с fallback-логикой
 * @param kind - тип уведомления
 * @param addressing - обращение (из БД: userPreferences.addressing)
 * @param directness - стиль подачи (из настроек: notificationPreferences.directness)
 * @param userName - имя пользователя
 * @param options - опциональные параметры (topicKey, intent, habitKey, subtype)
 * @returns итоговый текст уведомления
 */
export function getNotificationText(
  kind: NotificationKind,
  addressing: Addressing,
  directness: Directness,
  userName?: string,
  options?: {
    topicKey?: string;
    intent?: HabitIntent;
    habitKey?: HabitKey;
    subtype?: HabitSubtype;
  }
): string {
  // Находим шаблон (tone больше не используется в фильтрации)
  const template = findTemplate(kind, options);

  // Если шаблон найден — вернуть текст с подстановкой
  if (template) {
    return getTemplateText(template, addressing, directness, userName);
  }

  // Fallback: дефолтный текст
  return FALLBACK_TEXT;
}
