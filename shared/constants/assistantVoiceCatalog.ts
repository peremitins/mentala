export type AssistantVoiceGender = 'female' | 'male';
export type AssistantVoiceCatalogLocale = 'ru' | 'en';

export type AssistantVoicePresentation = {
  label: string;
  description: string;
  previewText: string;
};

export type AssistantVoiceCatalogItem = {
  id: string;
  gender: AssistantVoiceGender;
  presentation: Record<AssistantVoiceCatalogLocale, AssistantVoicePresentation>;
  supportedInRealtime: boolean;
  supportedInTts: boolean;
  sortOrder: number;
};

// Каталог голосов — продуктовый слой Mentala.
// OpenAI не отдает "gender" как часть стабильного API-контракта, поэтому
// группировку female/male и локализованные имена фиксируем вручную.
export const ASSISTANT_VOICE_CATALOG: readonly AssistantVoiceCatalogItem[] = [
  {
    id: 'shimmer',
    gender: 'female',
    presentation: {
      ru: {
        label: 'Вера',
        description: 'Светлый, поддерживающий и мягкий тембр',
        previewText:
          'Я слышу тебя. Давай найдём одну понятную опору прямо сейчас.',
      },
      en: {
        label: 'Vera',
        description: 'Light, supportive, and reassuring',
        previewText:
          "I'm here with you. Let's find one clear point of support right now.",
      },
    },
    supportedInRealtime: true,
    supportedInTts: true,
    sortOrder: 10,
  },
  {
    id: 'sage',
    gender: 'female',
    presentation: {
      ru: {
        label: 'Надежда',
        description: 'Спокойный, уверенный и ровный тембр',
        previewText:
          'Я рядом. Давай посмотрим на ситуацию без спешки и лишнего давления.',
      },
      en: {
        label: 'Nadia',
        description: 'Calm, steady, and confident',
        previewText:
          "I'm here. Let's look at this calmly, without pressure or rush.",
      },
    },
    supportedInRealtime: true,
    supportedInTts: true,
    sortOrder: 20,
  },
  {
    id: 'coral',
    gender: 'female',
    presentation: {
      ru: {
        label: 'Любовь',
        description: 'Тёплый, бережный и мягкий тембр',
        previewText: 'Я рядом. Мы можем идти спокойно и бережно, шаг за шагом.',
      },
      en: {
        label: 'Lucy',
        description: 'Warm, gentle, and caring',
        previewText:
          "I'm here. We can move through this calmly and gently, step by step.",
      },
    },
    supportedInRealtime: true,
    supportedInTts: true,
    sortOrder: 30,
  },
  {
    id: 'echo',
    gender: 'male',
    presentation: {
      ru: {
        label: 'Алексей',
        description: 'Более глубокий, уверенный и собранный тембр',
        previewText:
          'Я с тобой. Давай сфокусируемся на самом важном и пойдём по шагам.',
      },
      en: {
        label: 'Alex',
        description: 'Deeper, confident, and composed',
        previewText:
          "I'm with you. Let's focus on what matters most and take it step by step.",
      },
    },
    supportedInRealtime: true,
    supportedInTts: true,
    sortOrder: 40,
  },
  {
    id: 'ash',
    gender: 'male',
    presentation: {
      ru: {
        label: 'Максим',
        description: 'Спокойный, ровный и устойчивый тембр',
        previewText:
          'Я рядом. Давай разберём это спокойно и без лишнего напряжения.',
      },
      en: {
        label: 'Max',
        description: 'Calm, steady, and grounded',
        previewText:
          "I'm here. Let's sort this out calmly and without extra tension.",
      },
    },
    supportedInRealtime: true,
    supportedInTts: true,
    sortOrder: 50,
  },
  {
    id: 'verse',
    gender: 'male',
    presentation: {
      ru: {
        label: 'Даниил',
        description: 'Мягкий, деликатный и тёплый тембр',
        previewText:
          'Я рядом. Можно не торопиться и начать с того, что сейчас ощущается сильнее всего.',
      },
      en: {
        label: 'Daniel',
        description: 'Gentle, delicate, and warm',
        previewText:
          "I'm here. There's no need to rush. We can start with what feels strongest right now.",
      },
    },
    supportedInRealtime: true,
    supportedInTts: true,
    sortOrder: 60,
  },
] as const;

export const DEFAULT_ASSISTANT_VOICE_ID = 'shimmer';

export function normalizeAssistantVoiceLocale(
  locale?: string | null
): AssistantVoiceCatalogLocale {
  const normalized = String(locale || '')
    .trim()
    .toLowerCase();
  return normalized.startsWith('en') ? 'en' : 'ru';
}

export function getAssistantVoiceCatalog(): readonly AssistantVoiceCatalogItem[] {
  return ASSISTANT_VOICE_CATALOG;
}

export function getSelectableAssistantVoiceCatalog(): AssistantVoiceCatalogItem[] {
  return ASSISTANT_VOICE_CATALOG.filter(
    (item) => item.supportedInRealtime && item.supportedInTts
  ).sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getAssistantVoiceCatalogItem(
  voiceId?: string | null
): AssistantVoiceCatalogItem | null {
  const normalized = String(voiceId || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return null;
  }

  return ASSISTANT_VOICE_CATALOG.find((item) => item.id === normalized) || null;
}

export function resolveAssistantVoiceCatalogItem(
  voiceId?: string | null
): AssistantVoiceCatalogItem {
  return (
    getAssistantVoiceCatalogItem(voiceId) ||
    getAssistantVoiceCatalogItem(DEFAULT_ASSISTANT_VOICE_ID)!
  );
}

export function resolveAssistantVoiceId(voiceId?: string | null): string {
  return resolveAssistantVoiceCatalogItem(voiceId).id;
}

export function getAssistantVoicePresentation(
  item: AssistantVoiceCatalogItem,
  locale?: string | null
): AssistantVoicePresentation {
  return item.presentation[normalizeAssistantVoiceLocale(locale)];
}

export function resolveAssistantVoicePresentation(
  voiceId?: string | null,
  locale?: string | null
): AssistantVoicePresentation {
  return getAssistantVoicePresentation(
    resolveAssistantVoiceCatalogItem(voiceId),
    locale
  );
}

export function isAssistantVoiceSupported(voiceId?: string | null): boolean {
  return Boolean(getAssistantVoiceCatalogItem(voiceId));
}

export function isAssistantVoiceSelectable(voiceId?: string | null): boolean {
  const item = getAssistantVoiceCatalogItem(voiceId);
  return Boolean(item?.supportedInRealtime && item?.supportedInTts);
}

export function getAssistantVoicesByGender(
  gender: AssistantVoiceGender,
  locale?: string | null
): Array<AssistantVoiceCatalogItem & AssistantVoicePresentation> {
  return getSelectableAssistantVoiceCatalog()
    .filter((item) => item.gender === gender)
    .map((item) => ({
      ...item,
      ...getAssistantVoicePresentation(item, locale),
    }));
}
