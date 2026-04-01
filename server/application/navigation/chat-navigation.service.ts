import { BREATH_PRACTICES } from '../../../app/lib/breathPracticesCatalog';
import { HABITS_CATALOG } from '../../../app/lib/habitsCatalog';
import { mapHabitToMeditationTopic } from '../../../app/lib/meditations';
import {
  mapHabitToBreathGroup,
  mapTherapyToBreathGroup,
} from '../../../app/lib/practiceActions';
import { THERAPY_TOPICS } from '../../../app/lib/therapyCatalog';
import {
  buildLegacySuggestedChipActionPayload,
  buildNavigationTargetKey,
  type AppNavigationResolvedBy,
  type AppNavigationTarget,
  type BreathPracticeGroupKey,
} from '../../../shared/navigation';
import type { ChatEntryContext, SuggestedChip } from '../../../shared/dto';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type NavigationChipCandidate = {
  target: AppNavigationTarget;
  text: string;
  resolvedBy: AppNavigationResolvedBy;
};

const MAX_ACTION_CHIPS = 3;

const MEDITATION_TOPIC_LABELS = {
  sleep: 'Медитации для сна',
  anxiety: 'Медитации от тревоги',
  stress: 'Медитации для разгрузки',
} as const;

const BREATH_GROUP_LABELS: Record<BreathPracticeGroupKey, string> = {
  popular: 'Подборка дыхания',
  sleep: 'Дыхание для сна',
  anxiety: 'Дыхание от тревоги',
  focus: 'Дыхание для фокуса',
  custom: 'Своя дыхательная практика',
};

const QUICK_HELP_LABELS = {
  panic: 'Быстрая помощь при тревоге',
  tension: 'Снять напряжение',
  technique_picker: 'Быстрая помощь',
} as const;

const MEDITATION_TOPIC_PATTERNS: Array<{
  pattern: RegExp;
  topicKey: 'sleep' | 'anxiety' | 'stress';
}> = [
  {
    pattern: /(сон|сна|заснуть|засып|бессонниц|вечерн)/iu,
    topicKey: 'sleep',
  },
  {
    pattern: /(тревог|паник|успоко|успокои|страх|накрыло|накрывает)/iu,
    topicKey: 'anxiety',
  },
  {
    pattern: /(стресс|напряж|выгор|устал|перегруз|раздраж|злост)/iu,
    topicKey: 'stress',
  },
];

const BREATH_ALIAS_RULES: Array<{
  pattern: RegExp;
  slug: string;
  groupKey?: BreathPracticeGroupKey;
}> = [
  {
    pattern: /4\s*[-–—‑]?\s*7\s*[-–—‑]?\s*8/iu,
    slug: '4-7-8',
    groupKey: 'sleep',
  },
  {
    pattern:
      /4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4|квадратн.*дых|box\s*breath/iu,
    slug: 'box-breathing',
    groupKey: 'focus',
  },
  {
    pattern: /4\s*[-–—‑]?\s*6|длинн.*выдох|long\s*exhale/iu,
    slug: 'long-exhale-4-6',
    groupKey: 'anxiety',
  },
  { pattern: /5\s*[-–—‑]?\s*5\b/iu, slug: 'equal-5-5', groupKey: 'popular' },
  { pattern: /6\s*[-–—‑]?\s*6\b/iu, slug: 'equal-6-6', groupKey: 'sleep' },
  {
    pattern: /2\s*[-–—‑]?\s*4|сомкнут.*губ|pursed\s*lip/iu,
    slug: 'pursed-lip',
    groupKey: 'anxiety',
  },
  {
    pattern: /4\s*[-–—‑]?\s*4\b|диафрагм|живот(ом|ом)/iu,
    slug: 'diaphragmatic',
    groupKey: 'anxiety',
  },
  {
    pattern: /ноздр|alternate|поперемен/iu,
    slug: 'alternate-nostril',
    groupKey: 'focus',
  },
  {
    pattern: /физиологическ.*вздох|sigh|быстро.*успоко/iu,
    slug: 'physiological-sigh',
    groupKey: 'anxiety',
  },
];

const QUICK_HELP_PATTERNS: Array<{
  pattern: RegExp;
  target: AppNavigationTarget;
}> = [
  {
    pattern: /(паник|тревог|накрыло|не могу успокоитьс|мне очень тревожно)/iu,
    target: { type: 'quick_help_entry', entry: 'panic' },
  },
  {
    pattern: /(напряж|зажат|злость|злюсь|стресс прямо сейчас)/iu,
    target: { type: 'quick_help_entry', entry: 'tension' },
  },
  {
    pattern:
      /(быстр(ую|ая)\s+практик|sos|быстрая помощь|прямо сейчас|экстренно)/iu,
    target: { type: 'quick_help_entry', entry: 'technique_picker' },
  },
];

const OPEN_INTENT_PATTERN =
  /(открой|открыть|покажи|показать|перейд(и|ем)|запусти|запустить|дай|подбери|нужн(а|о)|хочу|можно)/iu;

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNavigationChip(
  candidate: NavigationChipCandidate
): SuggestedChip {
  const compat = buildLegacySuggestedChipActionPayload(candidate.target);

  return {
    text: candidate.text,
    intent: 'action_step',
    kind: 'action',
    target: candidate.target,
    action: compat?.action,
    params: compat?.params,
  };
}

function uniqueCandidates(
  candidates: NavigationChipCandidate[]
): NavigationChipCandidate[] {
  const seen = new Set<string>();
  const unique: NavigationChipCandidate[] = [];

  for (const candidate of candidates) {
    const key = buildNavigationTargetKey(candidate.target);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(candidate);
  }

  return unique.slice(0, MAX_ACTION_CHIPS);
}

function createMeditationCollectionCandidate(
  topicKey: 'sleep' | 'anxiety' | 'stress',
  resolvedBy: AppNavigationResolvedBy = 'registry_rule'
): NavigationChipCandidate {
  return {
    target: {
      type: 'meditation_collection',
      topicKey,
    },
    text: MEDITATION_TOPIC_LABELS[topicKey],
    resolvedBy,
  };
}

function createBreathGroupCandidate(
  groupKey: BreathPracticeGroupKey,
  resolvedBy: AppNavigationResolvedBy = 'registry_rule'
): NavigationChipCandidate {
  return {
    target: {
      type: 'breath_practice_group',
      groupKey,
    },
    text: BREATH_GROUP_LABELS[groupKey],
    resolvedBy,
  };
}

function createBreathPracticeCandidate(
  slug: string,
  groupKey?: BreathPracticeGroupKey,
  resolvedBy: AppNavigationResolvedBy = 'exact'
): NavigationChipCandidate {
  const practice = BREATH_PRACTICES.find((item) => item.slug === slug);

  return {
    target: {
      type: 'breath_practice',
      slug,
      groupKey,
    },
    text: practice
      ? `Дыхание ${practice.title}`
      : 'Открыть дыхательную практику',
    resolvedBy,
  };
}

function createQuickHelpCandidate(
  entry: 'panic' | 'tension' | 'technique_picker',
  resolvedBy: AppNavigationResolvedBy = 'registry_rule'
): NavigationChipCandidate {
  return {
    target: {
      type: 'quick_help_entry',
      entry,
    },
    text: QUICK_HELP_LABELS[entry],
    resolvedBy,
  };
}

function resolveLastUserMessage(messages: ChatMessage[]): string {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user');

  return String(lastUserMessage?.content || '').trim();
}

function resolveMeditationTopicFromText(
  text: string
): 'sleep' | 'anxiety' | 'stress' | null {
  const match = MEDITATION_TOPIC_PATTERNS.find((rule) =>
    rule.pattern.test(text)
  );
  return match?.topicKey ?? null;
}

function resolveBreathPracticeFromText(
  text: string
): { slug: string; groupKey?: BreathPracticeGroupKey } | null {
  const aliasMatch = BREATH_ALIAS_RULES.find((rule) => rule.pattern.test(text));
  if (aliasMatch) {
    return {
      slug: aliasMatch.slug,
      groupKey: aliasMatch.groupKey,
    };
  }

  const normalized = normalizeText(text);
  const practice = BREATH_PRACTICES.find((item) => {
    const title = normalizeText(item.title);
    const goal = normalizeText(item.goal);
    const description = normalizeText(item.description);

    return (
      normalized.includes(item.slug) ||
      normalized.includes(title) ||
      (title.length >= 3 && title.includes(normalized)) ||
      normalized.includes(goal) ||
      normalized.includes(description)
    );
  });

  if (!practice) {
    return null;
  }

  return {
    slug: practice.slug,
    groupKey: practice.tags[0],
  };
}

async function resolveMeditationTrackFromText(
  text: string
): Promise<NavigationChipCandidate | null> {
  const normalized = normalizeText(text);
  if (
    !normalized ||
    normalized.length < 4 ||
    !/медит|трек|аудио/iu.test(text)
  ) {
    return null;
  }

  const [{ db }, { meditationTracks }] = await Promise.all([
    import('../../infrastructure/db/client'),
    import('../../infrastructure/db/schema'),
  ]);

  const rows = await db
    .select({
      id: meditationTracks.id,
      title: meditationTracks.title,
      topicKey: meditationTracks.topicKey,
      topicKeys: meditationTracks.topicKeys,
    })
    .from(meditationTracks);

  let bestMatch: {
    id: string;
    title: string;
    topicKey: 'sleep' | 'anxiety' | 'stress';
    score: number;
  } | null = null;

  for (const row of rows) {
    const title = normalizeText(row.title);
    const id = normalizeText(row.id);
    let score = 0;

    if (normalized.includes(id)) {
      score += 10;
    }
    if (normalized.includes(title)) {
      score += 12;
    }

    const tokens = title.split(' ').filter((token) => token.length >= 4);
    const tokenMatches = tokens.filter((token) =>
      normalized.includes(token)
    ).length;
    score += tokenMatches * 2;

    if (score > (bestMatch?.score ?? 0)) {
      bestMatch = {
        id: row.id,
        title: row.title,
        topicKey: row.topicKey as 'sleep' | 'anxiety' | 'stress',
        score,
      };
    }
  }

  if (!bestMatch || bestMatch.score < 8) {
    return null;
  }

  return {
    target: {
      type: 'meditation_track',
      trackId: bestMatch.id,
      topicKey: bestMatch.topicKey,
    },
    text: `Медитация ${bestMatch.title}`,
    resolvedBy: 'fuzzy',
  };
}

function resolveTherapyTopicCandidate(
  text: string
): NavigationChipCandidate | null {
  const normalized = normalizeText(text);
  if (!normalized || !/терап|тем(а|у)/iu.test(text)) {
    return null;
  }

  const match = THERAPY_TOPICS.find((topic) => {
    const name = normalizeText(topic.name);
    const description = normalizeText(topic.description);

    return (
      normalized.includes(topic.key) ||
      normalized.includes(name) ||
      description.includes(normalized)
    );
  });

  if (!match) {
    if (/терап/i.test(text)) {
      return {
        target: { type: 'therapy_list' },
        text: 'Открыть терапию',
        resolvedBy: 'normalized',
      };
    }
    return null;
  }

  return {
    target: {
      type: 'therapy_topic',
      topicKey: match.key,
    },
    text: match.name,
    resolvedBy: 'exact',
  };
}

function resolveHabitCandidate(text: string): NavigationChipCandidate | null {
  const normalized = normalizeText(text);
  if (!normalized || !/привыч|хабит/iu.test(text)) {
    return null;
  }

  const match = HABITS_CATALOG.find((habit) => {
    const name = normalizeText(habit.name);
    const description = normalizeText(habit.description);

    return (
      normalized.includes(habit.habitKey) ||
      normalized.includes(name) ||
      description.includes(normalized)
    );
  });

  if (!match) {
    return {
      target: { type: 'habits_list' },
      text: 'Открыть привычки',
      resolvedBy: 'normalized',
    };
  }

  return {
    target: {
      type: 'habit',
      habitKey: match.habitKey,
    },
    text: match.name,
    resolvedBy: 'exact',
  };
}

function buildContextCandidates(
  entryContext?: ChatEntryContext | null
): NavigationChipCandidate[] {
  if (!entryContext) {
    return [];
  }

  if (entryContext.type === 'habit') {
    const candidates: NavigationChipCandidate[] = [];
    const meditationTopic = mapHabitToMeditationTopic(entryContext.habit_id);
    const breathGroup = mapHabitToBreathGroup(entryContext.habit_id);

    if (entryContext.habit_id === 'gratitude') {
      candidates.push({
        target: { type: 'gratitude_diary' },
        text: 'Дневник благодарности',
        resolvedBy: 'registry_rule',
      });
    }

    if (meditationTopic) {
      candidates.push(createMeditationCollectionCandidate(meditationTopic));
    }
    if (breathGroup) {
      candidates.push(createBreathGroupCandidate(breathGroup));
    }

    return candidates;
  }

  if (entryContext.type === 'therapy_topic') {
    const candidates: NavigationChipCandidate[] = [];
    const meditationTopic = (() => {
      if (
        entryContext.topic_id === 'anxiety' ||
        entryContext.topic_id === 'phobias'
      ) {
        return 'anxiety' as const;
      }
      if (
        entryContext.topic_id === 'stress' ||
        entryContext.topic_id === 'anger'
      ) {
        return 'stress' as const;
      }
      return null;
    })();
    const breathGroup = mapTherapyToBreathGroup(entryContext.topic_id);

    if (meditationTopic) {
      candidates.push(createMeditationCollectionCandidate(meditationTopic));
    }
    if (breathGroup) {
      candidates.push(createBreathGroupCandidate(breathGroup));
    }

    return candidates;
  }

  if (entryContext.type === 'sos') {
    if (entryContext.sos_entry === 'panic') {
      return [createQuickHelpCandidate('panic')];
    }
    if (entryContext.sos_entry === 'tension') {
      return [createQuickHelpCandidate('tension')];
    }
    return [
      {
        target: { type: 'quick_help_entry', entry: 'panic' },
        text: 'Мне тревожно',
        resolvedBy: 'registry_rule',
      },
      {
        target: { type: 'quick_help_entry', entry: 'tension' },
        text: 'Снять напряжение',
        resolvedBy: 'registry_rule',
      },
      {
        target: { type: 'quick_help_entry', entry: 'technique_picker' },
        text: 'Дай короткую технику',
        resolvedBy: 'registry_rule',
      },
    ];
  }

  if (entryContext.type === 'thought_dump') {
    const topicKey = resolveMeditationTopicFromText(entryContext.dump_text);
    if (!topicKey) {
      return [];
    }
    return [
      createMeditationCollectionCandidate(topicKey),
      createBreathGroupCandidate(topicKey === 'sleep' ? 'sleep' : 'anxiety'),
    ];
  }

  return [];
}

async function resolveTargetsFromText(
  text: string
): Promise<NavigationChipCandidate[]> {
  if (!text) {
    return [];
  }

  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const candidates: NavigationChipCandidate[] = [];
  const hasOpenIntent =
    OPEN_INTENT_PATTERN.test(text) ||
    /медитац|дыхан|sos|быстрая помощь|дневник благодарн|терап|привыч/iu.test(
      text
    );

  if (!hasOpenIntent) {
    return [];
  }

  if (/дневник благодарн|благодарност/iu.test(text)) {
    candidates.push({
      target: { type: 'gratitude_diary' },
      text: 'Дневник благодарности',
      resolvedBy: 'normalized',
    });
  }

  const therapyCandidate = resolveTherapyTopicCandidate(text);
  if (therapyCandidate) {
    candidates.push(therapyCandidate);
  }

  const habitCandidate = resolveHabitCandidate(text);
  if (habitCandidate) {
    candidates.push(habitCandidate);
  }

  const quickHelpMatch = QUICK_HELP_PATTERNS.find((rule) =>
    rule.pattern.test(text)
  );
  if (quickHelpMatch) {
    const entry =
      quickHelpMatch.target.type === 'quick_help_entry'
        ? quickHelpMatch.target.entry
        : 'technique_picker';
    candidates.push(createQuickHelpCandidate(entry));
  }

  const breathMatch = resolveBreathPracticeFromText(text);
  if (breathMatch) {
    candidates.push(
      createBreathPracticeCandidate(
        breathMatch.slug,
        breathMatch.groupKey,
        'registry_rule'
      )
    );
  } else if (/дыхан|подыш/iu.test(text)) {
    const topicKey = resolveMeditationTopicFromText(text);
    if (topicKey === 'sleep') {
      candidates.push(createBreathGroupCandidate('sleep'));
    } else if (topicKey === 'stress') {
      candidates.push(createBreathGroupCandidate('focus'));
    } else if (topicKey === 'anxiety') {
      candidates.push(createBreathGroupCandidate('anxiety'));
    } else {
      candidates.push({
        target: { type: 'breath_practices_list' },
        text: 'Открыть дыхательные практики',
        resolvedBy: 'normalized',
      });
    }
  }

  const meditationTrackCandidate = await resolveMeditationTrackFromText(text);
  if (meditationTrackCandidate) {
    candidates.push(meditationTrackCandidate);
  } else {
    const meditationTopic = resolveMeditationTopicFromText(text);
    if (meditationTopic) {
      candidates.push(createMeditationCollectionCandidate(meditationTopic));
    } else if (/медитац|медитацию|медитации/iu.test(text)) {
      candidates.push({
        target: { type: 'meditations_list' },
        text: 'Открыть медитации',
        resolvedBy: 'normalized',
      });
    }
  }

  if (
    candidates.length === 0 &&
    /успоко|быстро помочь|поддерж(ка|и)/iu.test(text)
  ) {
    candidates.push(createMeditationCollectionCandidate('anxiety'));
    candidates.push(
      createBreathPracticeCandidate('long-exhale-4-6', 'anxiety')
    );
    candidates.push(createQuickHelpCandidate('technique_picker'));
  }

  return uniqueCandidates(candidates);
}

export async function buildNavigationSuggestedChips(params: {
  messages: ChatMessage[];
  entryContext?: ChatEntryContext | null;
}): Promise<SuggestedChip[]> {
  const lastUserMessage = resolveLastUserMessage(params.messages);
  const explicitCandidates = await resolveTargetsFromText(lastUserMessage);
  const contextCandidates =
    explicitCandidates.length > 0
      ? []
      : buildContextCandidates(params.entryContext);

  return uniqueCandidates([...explicitCandidates, ...contextCandidates]).map(
    buildNavigationChip
  );
}
