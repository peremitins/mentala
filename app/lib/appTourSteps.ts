/**
 * Конфигурация шагов продуктового тура (App Tour).
 * См. .docs/arch_app_tour.md для полного описания.
 *
 * Медиа-ассеты в public/onboarding/tour/ добавляются отдельно (вне этого файла).
 * Если src указан, но файл отсутствует — bubble покажется без медиа (graceful fallback).
 */

export type AppTourMediaType = 'image' | 'gif' | 'video';

export interface AppTourMedia {
  type: AppTourMediaType;
  src: string;
  alt?: string;
  /** Постер для видео */
  poster?: string;
}

export type AppTourPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'center'
  | 'auto';

/**
 * Контекст для skip-функций — собирается в useAppTour() из биллинга/энтайтлментов.
 * Расширяй этот тип, если потребуется проверять доступность других фич.
 */
export interface AppTourSkipContext {
  /** Доступ к чату с ИИ-ассистентом (chat.assistant) */
  hasChatAccess: boolean;
  /** Доступ к голосовому режиму (chat.realtime_voice) */
  hasRealtimeVoiceAccess: boolean;
}

export interface AppTourStep {
  /** Уникальный id шага — для логов и отладки */
  id: string;
  /** Путь страницы, на которой шаг должен показываться */
  page: string;
  /**
   * CSS-селектор подсвечиваемого элемента.
   * null — bubble показывается по центру экрана без spotlight.
   */
  targetSelector: string | null;
  bubble: {
    title: string;
    description: string;
    media?: AppTourMedia;
    placement?: AppTourPlacement;
  };
  /** Padding spotlight в px (по умолчанию 8) */
  highlightPadding?: number;
  /** Показать tap-анимацию по target перед навигацией на следующий шаг */
  tapBeforeNext?: boolean;
  /** Куда перейти после нажатия «Далее» (если шаг ведёт на другую страницу) */
  navigateTo?: string;
  /**
   * После navigateTo дождаться появления этого селектора в DOM
   * перед тем, как показать следующий шаг. Без этого spotlight
   * может попытаться позиционироваться на ещё не отрендеренном элементе.
   */
  awaitSelector?: string;
  /**
   * Если функция возвращает true — шаг автоматически пропускается.
   * Используется, когда фича недоступна юзеру (закончился триал, нет тарифа,
   * фича скрыта по флагу и т.д.). Без skipIf тур мог бы застрять, потому что
   * `data-tour`-элемент просто не отрендерится в DOM.
   */
  skipIf?: (ctx: AppTourSkipContext) => boolean;
}

/** Базовый путь к медиа-ассетам тура */
export const APP_TOUR_MEDIA_BASE = '/onboarding/tour';

export const APP_TOUR_STEPS: AppTourStep[] = [
  // -------------------------------------------------------------------
  // 1. Главная — карточка ИИ-помощника
  // -------------------------------------------------------------------
  {
    id: 'home-hero',
    page: '/',
    targetSelector: '[data-tour="home-hero"]',
    bubble: {
      title: 'ИИ-помощник',
      description:
        'Это твой личный ИИ-психолог. Расскажи, что беспокоит. Он выслушает, задаст нужные вопросы и предложит конкретные шаги. Доступен 24/7.',
      placement: 'auto',
    },
    highlightPadding: 12,
    tapBeforeNext: true,
    navigateTo: '/chat',
    awaitSelector: '[data-tour="chat-mic"]',
  },

  // -------------------------------------------------------------------
  // 2. Чат — микрофон (запись голоса)
  // -------------------------------------------------------------------
  {
    id: 'chat-mic',
    page: '/chat',
    targetSelector: '[data-tour="chat-mic"]',
    bubble: {
      title: 'Запись голоса',
      description:
        'Нажми и говори вместо того, чтобы печатать. Твой голос превратится в текст и отправится как обычное сообщение.',
      placement: 'auto',
    },
    // Если у юзера нет доступа к чату (закончился триал, basic-тариф) —
    // шаги про чат пропускаются: всё равно не сможет ими воспользоваться.
    skipIf: (ctx) => !ctx.hasChatAccess,
  },

  // -------------------------------------------------------------------
  // 3. Чат — голосовой режим (трубка)
  // -------------------------------------------------------------------
  {
    id: 'chat-realtime-voice',
    page: '/chat',
    targetSelector: '[data-tour="chat-realtime-voice"]',
    bubble: {
      title: 'Разговор вживую',
      description:
        'Режим живого общения голосом. Говоришь, и ИИ-помощник тут же отвечает голосом, как настоящий разговор. Никакого печатания.',
      placement: 'auto',
    },
    // Чат недоступен → шаг бесполезен. Realtime voice тоже отдельная фича,
    // но она обычно требует чата как минимум — поэтому достаточно проверки чата.
    skipIf: (ctx) => !ctx.hasChatAccess,
  },

  // -------------------------------------------------------------------
  // 4. Чат — кнопка «Подвести итог»
  // -------------------------------------------------------------------
  {
    id: 'chat-summary',
    page: '/chat',
    targetSelector: '[data-tour="chat-summary"]',
    bubble: {
      title: 'Итог сессии',
      description:
        'После разговора нажми эту кнопку. ИИ-помощник структурирует всё, что вы обсудили: о чём говорили, что было важным, и какие шаги сделать дальше.',
      placement: 'auto',
    },
    tapBeforeNext: true,
    navigateTo: '/session-summaries-user',
    awaitSelector: '[data-tour="summary-example"], main, body',
    skipIf: (ctx) => !ctx.hasChatAccess,
  },

  // -------------------------------------------------------------------
  // 5. Пример экрана с итогами (центрированный bubble)
  // -------------------------------------------------------------------
  {
    id: 'summary-example',
    page: '/session-summaries-user',
    targetSelector: null,
    bubble: {
      title: 'Так выглядит итог',
      description:
        'Здесь три раздела: о чём была сессия, что было важным и какие следующие шаги. К итогам всегда можно вернуться через «Историю сессий» на главной.',
      media: {
        type: 'image',
        src: `${APP_TOUR_MEDIA_BASE}/05-summary-example.webp`,
        alt: 'Пример итога сессии',
      },
      placement: 'auto',
    },
    navigateTo: '/therapy',
    awaitSelector: '[data-tour="therapy-card"]',
    skipIf: (ctx) => !ctx.hasChatAccess,
  },

  // -------------------------------------------------------------------
  // 6. Терапия — кнопка «Поговорить»
  // -------------------------------------------------------------------
  {
    id: 'therapy-quick-chat',
    page: '/therapy',
    targetSelector: '[data-tour="therapy-quick-chat"]',
    bubble: {
      title: 'Поговорить',
      description:
        'Запускает сессию с ИИ-помощником именно по этой теме. Он уже знает контекст и подготовлен работать с этим состоянием.',
      placement: 'auto',
    },
    highlightPadding: 6,
  },

  // -------------------------------------------------------------------
  // 7. Терапия — кнопка «Медитация»
  // -------------------------------------------------------------------
  {
    id: 'therapy-quick-meditation',
    page: '/therapy',
    targetSelector: '[data-tour="therapy-quick-meditation"]',
    bubble: {
      title: 'Медитации по теме',
      description:
        'Подборка медитаций, специально подобранных под это состояние. Можно слушать прямо сейчас.',
      placement: 'auto',
    },
    highlightPadding: 6,
  },

  // -------------------------------------------------------------------
  // 8. Терапия — кнопка «Дыхание»
  // -------------------------------------------------------------------
  {
    id: 'therapy-quick-breath',
    page: '/therapy',
    targetSelector: '[data-tour="therapy-quick-breath"]',
    bubble: {
      title: 'Дыхательные практики',
      description:
        'Короткие упражнения, чтобы быстро снять напряжение. Работают за 2–5 минут, можно делать где угодно.',
      placement: 'auto',
    },
    highlightPadding: 6,
  },

  // -------------------------------------------------------------------
  // 9. Терапия — провал в карточку темы
  // -------------------------------------------------------------------
  {
    id: 'therapy-card',
    page: '/therapy',
    targetSelector: '[data-tour="therapy-card"]',
    bubble: {
      title: 'У каждой темы свой мир',
      description:
        'Внутри темы есть свои настройки напоминаний, медитации и дыхание. Давай заглянем внутрь.',
      placement: 'auto',
    },
    highlightPadding: 8,
    tapBeforeNext: true,
    navigateTo: '/therapy/anxiety',
    awaitSelector: '[data-tour="therapy-reminders-card"]',
  },

  // -------------------------------------------------------------------
  // 10. Тема — карточка «Напоминания»
  // -------------------------------------------------------------------
  {
    id: 'therapy-reminders-card',
    page: '/therapy/anxiety',
    targetSelector: '[data-tour="therapy-reminders-card"]',
    bubble: {
      title: 'Почему напоминания работают',
      description:
        'Регулярные напоминания дают сильнейший эффект. Они помогают не забывать про практики, формируют привычку и поддерживают тебя в моменты, когда ты этого не ждёшь. Без напоминаний прогресс замедляется в разы.',
      placement: 'auto',
    },
    highlightPadding: 8,
  },

  // -------------------------------------------------------------------
  // 11. Тема — тумблер напоминаний
  // -------------------------------------------------------------------
  {
    id: 'therapy-reminders-toggle',
    page: '/therapy/anxiety',
    targetSelector: '[data-tour="therapy-reminders-toggle"]',
    bubble: {
      title: 'Включить напоминания',
      description:
        'Включи, и приложение будет регулярно напоминать практиковаться. Частоту, время и дни можно настроить под себя.',
      placement: 'auto',
    },
    highlightPadding: 8,
  },

  // -------------------------------------------------------------------
  // 12. Тема — провал в настройки напоминаний
  // -------------------------------------------------------------------
  {
    id: 'therapy-reminders-edit',
    page: '/therapy/anxiety',
    targetSelector: '[data-tour="therapy-reminders-edit"]',
    bubble: {
      title: 'Тонкая настройка',
      description:
        'Здесь подберёшь оптимальную частоту, временной диапазон и дни. И главное: напишешь личные пожелания.',
      placement: 'auto',
    },
    highlightPadding: 6,
    tapBeforeNext: true,
    navigateTo: '/therapy/anxiety/notifications',
    awaitSelector: '[data-tour="custom-prompt"]',
  },

  // -------------------------------------------------------------------
  // 13. Настройки напоминаний — общий обзор
  // -------------------------------------------------------------------
  {
    id: 'notifications-overview',
    page: '/therapy/anxiety/notifications',
    targetSelector: null,
    bubble: {
      title: 'Настройки напоминаний',
      description:
        'Выбери частоту, временной диапазон и активные дни. Приложение распределит напоминания так, чтобы они помогали, а не раздражали.',
      media: {
        type: 'image',
        src: `${APP_TOUR_MEDIA_BASE}/14-custom-prompt.webp`,
        alt: 'Блок «Мои пожелания»',
      },
      placement: 'auto',
    },
  },

  // -------------------------------------------------------------------
  // 14. Настройки напоминаний — «Мои пожелания»
  // -------------------------------------------------------------------
  {
    id: 'custom-prompt',
    page: '/therapy/anxiety/notifications',
    targetSelector: '[data-tour="custom-prompt"]',
    bubble: {
      title: 'Персонализация под себя',
      description:
        'Опиши в свободной форме, как ты хочешь получать напоминания: тон, стиль, какие-то детали. ИИ адаптирует тексты под твои пожелания.',
      placement: 'auto',
    },
    highlightPadding: 8,
    navigateTo: '/',
    awaitSelector: '[data-tour="home-hero"]',
  },

  // -------------------------------------------------------------------
  // 15. Финальный шаг — на главной
  // -------------------------------------------------------------------
  {
    id: 'final',
    page: '/',
    targetSelector: null,
    bubble: {
      title: 'Готово!',
      description:
        'Теперь ты знаешь, где что искать. Удачи! И помни: мы рядом, когда тебе нужна поддержка.',
      placement: 'auto',
    },
  },
];
