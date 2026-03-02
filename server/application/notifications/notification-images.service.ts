import type {
  Directness,
  NotificationActionHint,
  NotificationKind,
  NotificationSubtype,
} from '@/shared/dto/notifications';

import notificationImageMap from './notification-image-map.json';
import { getNextRotationIndex } from './repositories/notification-image-rotation.repository';
import { validateNotificationImagePath } from './notification-image-validation';

const IMAGE_BASE_PATH = '/notifications';
const notificationImageMapLookup = notificationImageMap as Record<
  string,
  string
>;
const DEBUG_NOTIFICATION_IMAGES =
  process.env.DEBUG_NOTIFICATION_IMAGES === 'true' ||
  process.env.DEBUG_NOTIFICATIONS === 'true';

type ImageTag =
  | 'harm_organs'
  | 'harm_appearance'
  | 'harm_mental'
  | 'activity'
  | 'nature'
  | 'meditation'
  | 'daily_life'
  | 'neutral_abstract';

type ImageSource = 'entity' | 'common';

const IMAGE_TAG_LIST: ImageTag[] = [
  'harm_organs',
  'harm_appearance',
  'harm_mental',
  'activity',
  'nature',
  'meditation',
  'daily_life',
  'neutral_abstract',
];

const IMAGE_TAGS = new Set<ImageTag>(IMAGE_TAG_LIST);
const HARM_TAGS = new Set<ImageTag>([
  'harm_organs',
  'harm_appearance',
  'harm_mental',
]);
const SAFE_COMMON_TAGS: ImageTag[] = [
  'activity',
  'nature',
  'meditation',
  'daily_life',
  'neutral_abstract',
];
const SAFE_COMMON_TAG_SET = new Set<ImageTag>(SAFE_COMMON_TAGS);
const THERAPY_COMMON_TAGS = new Set<ImageTag>([
  'activity',
  'nature',
  'meditation',
  'daily_life',
  'neutral_abstract',
]);
const KNOWN_HABIT_KEYS = new Set([
  'alcohol',
  'nutrition',
  'smoking',
  'sugar',
  'water',
  'meditation',
]);
const HABIT_POLICY: Record<
  string,
  {
    entityTags: ImageTag[];
    commonTags: ImageTag[];
  }
> = {
  alcohol: {
    entityTags: ['harm_mental', 'harm_organs'],
    commonTags: ['activity', 'nature'],
  },
  nutrition: {
    entityTags: ['harm_appearance', 'harm_organs', 'neutral_abstract'],
    commonTags: ['activity', 'nature'],
  },
  smoking: {
    entityTags: ['harm_appearance', 'harm_organs', 'neutral_abstract'],
    commonTags: ['activity', 'nature'],
  },
  sugar: {
    entityTags: ['neutral_abstract'],
    commonTags: ['activity', 'nature'],
  },
  water: {
    entityTags: ['neutral_abstract'],
    commonTags: ['activity'],
  },
  meditation: {
    entityTags: ['meditation'],
    commonTags: ['meditation'],
  },
};

const ACTIVITY_MARKERS = [
  /спорт/iu,
  /трениров/iu,
  /зарядк/iu,
  /упражнен/iu,
  /бег/iu,
  /пробеж/iu,
  /ходьб/iu,
  /движен/iu,
  /активност/iu,
  /workout/iu,
  /exercise/iu,
  /running/iu,
  /jogging/iu,
  /walking/iu,
];
const MEDITATION_MARKERS = [
  /медитац/iu,
  /осознан/iu,
  /дыхани/iu,
  /дыхательн/iu,
  /mindful/iu,
  /meditat/iu,
  /пранаям/iu,
];
const NATURE_MARKERS = [
  /природ/iu,
  /лес/iu,
  /парк/iu,
  /неб/iu,
  /море/iu,
  /океан/iu,
  /озер/iu,
  /река/iu,
  /горы/iu,
  /трава/iu,
  /прогулк/iu,
  /nature/iu,
  /forest/iu,
  /ocean/iu,
  /sea/iu,
];
const DAILY_LIFE_MARKERS = [
  /ежеднев/iu,
  /рутин/iu,
  /утренн/iu,
  /вечерн/iu,
  /режим/iu,
  /быт/iu,
  /перерыв/iu,
  /пауз/iu,
  /отдых/iu,
  /сон/iu,
  /everyday/iu,
  /routine/iu,
];
const HARM_ORGANS_MARKERS = [
  /печен/iu,
  /сердц/iu,
  /сосуд/iu,
  /легк/iu,
  /инфаркт/iu,
  /инсульт/iu,
  /рак/iu,
  /онколог/iu,
  /давлен/iu,
  /холестерин/iu,
  /внутренн\w*\s+орган/iu,
  /поврежд\w*\s+орган/iu,
  /вред\w*\s+орган/iu,
];
const HARM_MENTAL_MARKERS = [
  /тревог/iu,
  /депресс/iu,
  /стресс/iu,
  /паник/iu,
  /эмоци/iu,
  /настроен/iu,
  /отношен/iu,
  /сем(ь|ей)/iu,
  /социал/iu,
  /стыд/iu,
  /вина/iu,
  /одиноч/iu,
];
const HARM_APPEARANCE_MARKERS = [
  /ухудш\w*\s+(внешн|кож|зуб|волос|фигур)/iu,
  /плох\w*\s+(внешн|кож|зуб|волос|фигур)/iu,
  /вред\w*\s+(внешн|кож|зуб|волос|фигур)/iu,
  /прыщ/iu,
  /сып/iu,
  /морщин/iu,
  /тускл\w*\s+кож/iu,
  /дрябл\w*/iu,
  /волос/iu,
  /лишн(ий|его)\s+вес/iu,
  /ожирен/iu,
  /целлюлит/iu,
  /желтизн\w*\s+зуб/iu,
  /отек/iu,
  /акне/iu,
];
const GENERIC_HARM_MARKERS = [
  /вред/iu,
  /риск/iu,
  /опасн/iu,
  /болез/iu,
  /разруш/iu,
  /ухудш/iu,
  /токс/iu,
  /зависим/iu,
];
const NEUTRAL_ABSTRACT_MARKERS = [
  /баланс/iu,
  /выбор/iu,
  /здоров(ый|ая|ое)/iu,
  /полезн/iu,
  /привычк/iu,
  /питани/iu,
  /овощ/iu,
  /фрукт/iu,
  /белок/iu,
  /злак/iu,
  /тарелк/iu,
  /рацион/iu,
  /перекус/iu,
  /калори/iu,
  /клетчатк/iu,
  /пищевар/iu,
  /еда/iu,
  /сахар/iu,
  /сладк/iu,
  /курен/iu,
  /сигар/iu,
  /никотин/iu,
  /дым/iu,
  /алкогол/iu,
  /вода/iu,
  /water/iu,
  /nutrition/iu,
];
const POSITIVE_MARKERS = [
  /спокой/iu,
  /поддерж/iu,
  /прогресс/iu,
  /улучш/iu,
  /восстанов/iu,
  /гармон/iu,
  /радост/iu,
  /забот/iu,
];
const BENEFIT_MARKERS = [
  /польз/iu,
  /полезн/iu,
  /улучш/iu,
  /лучше/iu,
  /самочувств/iu,
  /энерг/iu,
  /здоров/iu,
  /восстанов/iu,
];

type ImageIndex = {
  common: Map<ImageTag, string[]>;
  entity: Map<string, { root: string[]; nested: string[] }>;
};

type ImagePickParams = {
  userId: number;
  kind: NotificationKind;
  entityKey: string | null;
  imageTag: string | null;
  directness: Directness;
  subtype: NotificationSubtype | null;
  isMixedMode: boolean;
  habitIntent: 'build' | 'quit' | 'custom' | null;
  text?: string;
  actionHint?: NotificationActionHint | null;
  textSource?: 'templates' | 'ai';
};

type SemanticSignals = {
  hasActivity: boolean;
  hasMeditation: boolean;
  hasNature: boolean;
  hasDailyLife: boolean;
  hasHarmOrgans: boolean;
  hasHarmMental: boolean;
  hasHarmAppearance: boolean;
  hasAnyHarm: boolean;
  hasPositiveTone: boolean;
  hasBenefitTone: boolean;
  markerScores: Record<ImageTag, number>;
};

type TagPolicy = {
  normalizedEntityKey: string | null;
  allowedEntityTags: Set<ImageTag>;
  allowedCommonTags: Set<ImageTag>;
  isCustomEntity: boolean;
  isWater: boolean;
};

type TagSequence = {
  entity: string[];
  common: string[];
};

type MatchedTag = {
  tag: ImageTag;
  score: number;
  sequence: TagSequence;
};

const IMAGE_INDEX = buildImageIndex();
const MATCH_SCORE_THRESHOLD = resolveMatchScoreThreshold();

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function resolvePublicBaseUrl(): string {
  // Используем NUXT_PUBLIC_MEDIA_BASE_URL для картинок в push-уведомлениях.
  const baseUrl =
    process.env.NUXT_PUBLIC_MEDIA_BASE_URL ||
    process.env.NUXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_ORIGIN ||
    process.env.NUXT_PRIVATE_API_BASE ||
    'http://localhost:3000';

  return normalizeBaseUrl(baseUrl);
}

function resolveHashedNotificationPath(relative: string): string {
  const candidate = `${IMAGE_BASE_PATH}/${relative}`;
  return notificationImageMapLookup[candidate] ?? candidate;
}

function resolveMatchScoreThreshold(): number {
  const raw =
    Number(process.env.NOTIFICATION_IMAGE_MATCH_SCORE_THRESHOLD) ||
    Number(process.env.NUXT_NOTIFICATION_IMAGE_MATCH_SCORE_THRESHOLD) ||
    0.65;

  if (!Number.isFinite(raw)) {
    return 0.65;
  }

  return Math.min(Math.max(raw, 0.3), 0.95);
}

function logImageDebug(event: string, payload: Record<string, unknown>): void {
  if (!DEBUG_NOTIFICATION_IMAGES) return;
  console.log(`[NotificationImages][debug] ${event}`, payload);
}

function normalizeImageTag(tag: string | null): ImageTag | null {
  if (!tag) return null;
  const normalized = tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');
  if (normalized === 'neutral') {
    return 'neutral_abstract';
  }
  return IMAGE_TAGS.has(normalized as ImageTag)
    ? (normalized as ImageTag)
    : null;
}

function normalizeEntityKey(entityKey: string | null): string | null {
  if (!entityKey) return null;
  const normalized = entityKey.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isHarmTag(tag: ImageTag): boolean {
  return HARM_TAGS.has(tag);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hasAnyMarker(text: string, markers: RegExp[]): boolean {
  return markers.some((pattern) => pattern.test(text));
}

function collectSemanticSignals(params: {
  text: string;
  actionHint: NotificationActionHint | null;
}): SemanticSignals {
  const raw = params.text.trim().toLowerCase();
  const hasActivity = hasAnyMarker(raw, ACTIVITY_MARKERS);
  const hasMeditation =
    hasAnyMarker(raw, MEDITATION_MARKERS) || params.actionHint === 'meditation';
  const hasNature = hasAnyMarker(raw, NATURE_MARKERS);
  const hasDailyLife = hasAnyMarker(raw, DAILY_LIFE_MARKERS);
  const hasHarmOrgans = hasAnyMarker(raw, HARM_ORGANS_MARKERS);
  const hasHarmMental = hasAnyMarker(raw, HARM_MENTAL_MARKERS);
  const hasHarmAppearance = hasAnyMarker(raw, HARM_APPEARANCE_MARKERS);
  const hasGenericHarm = hasAnyMarker(raw, GENERIC_HARM_MARKERS);
  const hasAnyHarm =
    hasHarmOrgans || hasHarmMental || hasHarmAppearance || hasGenericHarm;
  const hasPositiveTone = hasAnyMarker(raw, POSITIVE_MARKERS);
  const hasBenefitTone = hasAnyMarker(raw, BENEFIT_MARKERS);
  const hasNeutralAbstract = hasAnyMarker(raw, NEUTRAL_ABSTRACT_MARKERS);

  const markerScores: Record<ImageTag, number> = {
    harm_organs: hasHarmOrgans ? 0.72 : 0,
    harm_mental: hasHarmMental ? 0.72 : 0,
    harm_appearance: hasHarmAppearance ? 0.72 : 0,
    activity: hasActivity ? 0.66 : 0,
    meditation: hasMeditation ? 0.7 : 0,
    nature: hasNature ? 0.66 : 0,
    daily_life: hasDailyLife ? 0.66 : 0,
    neutral_abstract: hasNeutralAbstract ? 0.62 : 0,
  };

  if (hasAnyHarm) {
    markerScores.harm_organs = Math.max(markerScores.harm_organs, 0.38);
    markerScores.harm_mental = Math.max(markerScores.harm_mental, 0.38);
    markerScores.harm_appearance = Math.max(markerScores.harm_appearance, 0.34);
  }

  if (
    !hasAnyHarm &&
    !hasNeutralAbstract &&
    (hasActivity || hasMeditation || hasNature || hasDailyLife)
  ) {
    markerScores.neutral_abstract = Math.max(
      markerScores.neutral_abstract,
      0.4
    );
  }

  return {
    hasActivity,
    hasMeditation,
    hasNature,
    hasDailyLife,
    hasHarmOrgans,
    hasHarmMental,
    hasHarmAppearance,
    hasAnyHarm,
    hasPositiveTone,
    hasBenefitTone,
    markerScores,
  };
}

function hasStrongConflict(tag: ImageTag, signals: SemanticSignals): boolean {
  if (tag === 'nature') {
    return signals.hasAnyHarm && !signals.hasNature;
  }
  if (tag === 'daily_life') {
    return signals.hasAnyHarm && !signals.hasDailyLife;
  }
  if (tag === 'activity') {
    return signals.hasMeditation && !signals.hasActivity;
  }
  if (tag === 'meditation') {
    return signals.hasAnyHarm && !signals.hasMeditation;
  }
  if (isHarmTag(tag)) {
    return !signals.hasAnyHarm && signals.hasPositiveTone;
  }
  return false;
}

function isPositiveQuitWithoutHarm(signals: SemanticSignals): boolean {
  return (
    !signals.hasAnyHarm && (signals.hasPositiveTone || signals.hasBenefitTone)
  );
}

function resolveTagPolicy(params: {
  kind: NotificationKind;
  entityKey: string | null;
}): TagPolicy {
  const normalizedEntityKey = normalizeEntityKey(params.entityKey);
  const entityTags = getEntityAvailableTags({
    kind: params.kind,
    entityKey: normalizedEntityKey,
  });
  const isKnownHabitKey = normalizedEntityKey
    ? KNOWN_HABIT_KEYS.has(normalizedEntityKey)
    : false;

  if (params.kind === 'therapy') {
    const allowedEntityTags = new Set<ImageTag>(
      [...entityTags].filter((tag) => !isHarmTag(tag))
    );

    return {
      normalizedEntityKey,
      allowedEntityTags,
      allowedCommonTags: new Set<ImageTag>(THERAPY_COMMON_TAGS),
      isCustomEntity: !normalizedEntityKey,
      isWater: false,
    };
  }

  if (!normalizedEntityKey) {
    return {
      normalizedEntityKey,
      allowedEntityTags: new Set<ImageTag>(),
      allowedCommonTags: new Set<ImageTag>(SAFE_COMMON_TAGS),
      isCustomEntity: true,
      isWater: false,
    };
  }

  const policyByKey = HABIT_POLICY[normalizedEntityKey];
  if (policyByKey) {
    return {
      normalizedEntityKey,
      allowedEntityTags: new Set<ImageTag>(policyByKey.entityTags),
      allowedCommonTags: new Set<ImageTag>(policyByKey.commonTags),
      isCustomEntity: false,
      isWater: normalizedEntityKey === 'water',
    };
  }

  if (!isKnownHabitKey && entityTags.size === 0) {
    return {
      normalizedEntityKey,
      allowedEntityTags: new Set<ImageTag>(),
      allowedCommonTags: new Set<ImageTag>(SAFE_COMMON_TAGS),
      isCustomEntity: true,
      isWater: false,
    };
  }

  return {
    normalizedEntityKey,
    allowedEntityTags: new Set<ImageTag>(entityTags),
    allowedCommonTags: new Set<ImageTag>(['activity', 'nature']),
    isCustomEntity: false,
    isWater: false,
  };
}

function computeTagScore(params: {
  imageTag: ImageTag;
  normalizedLlmTag: ImageTag | null;
  policy: TagPolicy;
  signals: SemanticSignals;
  kind: NotificationKind;
  directness: Directness;
  subtype: NotificationSubtype | null;
  habitIntent: 'build' | 'quit' | 'custom' | null;
  actionHint: NotificationActionHint | null;
}): number {
  const {
    imageTag,
    normalizedLlmTag,
    policy,
    signals,
    kind,
    directness,
    subtype,
    habitIntent,
    actionHint,
  } = params;

  let score = 0;

  if (normalizedLlmTag === imageTag) {
    score += 0.72;
  }

  score += signals.markerScores[imageTag] ?? 0;

  // Для neutral_abstract даём небольшой буст, когда уже есть явные
  // предметные маркеры питания/здорового выбора, чтобы не терять moderate/hard.
  if (
    imageTag === 'neutral_abstract' &&
    signals.markerScores[imageTag] >= 0.6
  ) {
    score += 0.06;
  }

  if (imageTag === 'meditation' && actionHint === 'meditation') {
    score += 0.2;
  }
  if (imageTag === 'activity' && actionHint === 'breathing') {
    score += 0.12;
  }

  if (isHarmTag(imageTag)) {
    if (subtype === 'informational') score += 0.12;
    if (directness === 'hard') score += 0.08;
    if (directness === 'soft') score -= 0.3;
    if (habitIntent === 'quit') score += 0.05;
    if (signals.hasPositiveTone && !signals.hasAnyHarm) {
      score -= 0.28;
    }
  } else {
    if (subtype === 'motivational') score += 0.08;
    if (directness === 'soft') score += 0.06;
  }

  if (policy.isWater && imageTag === 'neutral_abstract') {
    score += 0.2;
  }

  if (kind === 'therapy' && SAFE_COMMON_TAG_SET.has(imageTag)) {
    score += 0.04;
  }

  // Для терапии (особенно stress/anxiety) mental-напряжение — это валидный контекст
  // для safe-визуалов из common. Без этого большинство reminder/motivational
  // не проходят порог и остаются без картинок.
  if (kind === 'therapy') {
    // Для stress допускаем более уверенный safe-match: по ТЗ это целевая
    // терапевтическая тема, где common-визуалы используются чаще.
    if (policy.normalizedEntityKey === 'stress') {
      if (imageTag === 'nature') {
        score += 0.64;
      } else if (imageTag === 'daily_life') {
        score += 0.66;
      } else if (imageTag === 'meditation') {
        score += signals.hasMeditation ? 0.7 : 0.6;
      } else if (imageTag === 'activity') {
        score += signals.hasActivity ? 0.66 : 0.5;
      }
    } else if (signals.hasHarmMental) {
      if (imageTag === 'nature') {
        score += 0.68;
      } else if (imageTag === 'daily_life') {
        score += 0.66;
      } else if (imageTag === 'meditation') {
        score += signals.hasMeditation ? 0.7 : 0.58;
      } else if (imageTag === 'activity') {
        score += signals.hasActivity ? 0.66 : 0.45;
      }
    }
  }

  if (normalizedLlmTag === imageTag && hasStrongConflict(imageTag, signals)) {
    score -= 0.28;
  }

  return clampScore(score);
}

function isImageTagAllowed(params: {
  imageTag: ImageTag;
  source: ImageSource;
  policy: TagPolicy;
  kind: NotificationKind;
  directness: Directness;
  subtype: NotificationSubtype | null;
  isMixedMode: boolean;
  habitIntent: 'build' | 'quit' | 'custom' | null;
  signals: SemanticSignals;
}): boolean {
  const {
    imageTag,
    source,
    policy,
    kind,
    directness,
    subtype,
    habitIntent,
    isMixedMode,
    signals,
  } = params;

  const sourceAllowed =
    source === 'entity'
      ? policy.allowedEntityTags.has(imageTag)
      : policy.allowedCommonTags.has(imageTag);

  if (!sourceAllowed) {
    return false;
  }

  if (policy.isCustomEntity && isHarmTag(imageTag)) {
    return false;
  }

  if (source === 'common' && isHarmTag(imageTag)) {
    return false;
  }

  if (kind === 'habits' && source === 'common') {
    if (imageTag === 'activity' && !signals.hasActivity) return false;
    if (imageTag === 'meditation' && !signals.hasMeditation) return false;
    if (imageTag === 'daily_life' && !signals.hasDailyLife) return false;
    if (imageTag === 'nature' && !signals.hasNature) return false;
  }

  // Для quit-тем в позитивном контексте запрещаем только сущностные ассеты:
  // они несут негативный визуальный смысл и не подходят к пользе/прогрессу.
  // При этом common-ассеты остаются разрешены (если есть semantic match).
  if (
    kind === 'habits' &&
    source === 'entity' &&
    habitIntent === 'quit' &&
    isPositiveQuitWithoutHarm(signals)
  ) {
    return false;
  }

  if (!isHarmTag(imageTag)) {
    return true;
  }

  if (kind === 'therapy') return false;
  if (directness === 'soft') return false;
  if (subtype && subtype !== 'informational') return false;
  if (isMixedMode && directness !== 'hard') return false;

  // Для build-сценариев разрешаем harm-теги только при явном harm-контексте в тексте.
  if (habitIntent === 'build' && !signals.hasAnyHarm) {
    return false;
  }

  if (
    (imageTag === 'harm_mental' || imageTag === 'harm_appearance') &&
    directness === 'moderate'
  ) {
    return true;
  }

  if (imageTag === 'harm_organs') {
    return directness === 'hard' || directness === 'moderate';
  }

  return true;
}

function buildCandidateTags(params: {
  normalizedLlmTag: ImageTag | null;
  policy: TagPolicy;
}): Set<ImageTag> {
  const tags = new Set<ImageTag>();

  for (const tag of params.policy.allowedEntityTags) {
    tags.add(tag);
  }
  for (const tag of params.policy.allowedCommonTags) {
    tags.add(tag);
  }
  if (params.normalizedLlmTag) {
    tags.add(params.normalizedLlmTag);
  }

  return tags;
}

function interleaveAlternating(
  primary: string[],
  secondary: string[]
): string[] {
  const result: string[] = [];
  const maxLength = Math.max(primary.length, secondary.length);

  for (let i = 0; i < maxLength; i += 1) {
    if (i < primary.length) {
      result.push(primary[i]);
    }
    if (i < secondary.length) {
      result.push(secondary[i]);
    }
  }

  return result;
}

function interleaveRoundRobin(groups: string[][]): string[] {
  const result: string[] = [];
  const maxLength = groups.reduce(
    (max, group) => Math.max(max, group.length),
    0
  );

  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (index < group.length) {
        result.push(group[index]);
      }
    }
  }

  return result;
}

// Ищем тег на любом уровне глубины (нужно для вложенных папок therapy).
function findTagInSegments(
  segments: string[],
  startIndex: number
): { tag: ImageTag; index: number } | null {
  for (let i = startIndex; i < segments.length - 1; i += 1) {
    const tag = normalizeImageTag(segments[i]);
    if (tag) {
      return { tag, index: i };
    }
  }
  return null;
}

function getEntityAvailableTags(params: {
  kind: NotificationKind;
  entityKey: string | null;
}): Set<ImageTag> {
  const { kind, entityKey } = params;
  const available = new Set<ImageTag>();

  if (!entityKey) {
    return available;
  }

  for (const tag of IMAGE_TAG_LIST) {
    const record = IMAGE_INDEX.entity.get(`${kind}:${entityKey}:${tag}`);
    if (!record) continue;
    if (record.root.length === 0 && record.nested.length === 0) continue;
    available.add(tag);
  }

  return available;
}

function resolveTagSequence(params: {
  kind: NotificationKind;
  entityKey: string | null;
  imageTag: ImageTag;
}): TagSequence {
  const { kind, entityKey, imageTag } = params;

  const common = IMAGE_INDEX.common.get(imageTag) ?? [];
  const entityLists =
    entityKey && (kind === 'habits' || kind === 'therapy')
      ? (IMAGE_INDEX.entity.get(`${kind}:${entityKey}:${imageTag}`) ?? null)
      : null;

  const entityRoot = entityLists?.root ?? [];
  const entityNested = entityLists?.nested ?? [];
  const entity =
    entityRoot.length > 0 && entityNested.length > 0
      ? interleaveAlternating(entityRoot, entityNested)
      : entityRoot.length > 0
        ? entityRoot
        : entityNested;

  return { entity, common };
}

function buildImageIndex(): ImageIndex {
  const common = new Map<ImageTag, string[]>();
  const entity = new Map<string, { root: string[]; nested: string[] }>();

  for (const sourcePath of Object.keys(notificationImageMapLookup)) {
    if (!sourcePath.startsWith(`${IMAGE_BASE_PATH}/`)) continue;

    const relativePath = sourcePath.slice(`${IMAGE_BASE_PATH}/`.length);
    if (relativePath.includes('/male/') || relativePath.includes('/female/')) {
      // Гендерные подкаталоги запрещены, игнорируем их полностью.
      continue;
    }

    const segments = relativePath.split('/');
    if (segments.length < 3) continue;

    const [root, entityKey] = segments;

    if (root === 'common') {
      const tag = normalizeImageTag(entityKey);
      if (!tag) continue;
      const list = common.get(tag) ?? [];
      list.push(relativePath);
      common.set(tag, list);
      continue;
    }

    if (root !== 'habits' && root !== 'therapy') continue;
    if (!entityKey) continue;

    if (root === 'habits') {
      const tagCandidate = segments[2];
      if (!tagCandidate) continue;
      if (tagCandidate === 'male' || tagCandidate === 'female') continue;
      const tag = normalizeImageTag(tagCandidate);
      if (!tag) continue;
      const key = `${root}:${entityKey}:${tag}`;
      const list = entity.get(key) ?? { root: [], nested: [] };
      list.root.push(relativePath);
      entity.set(key, list);
      continue;
    }

    const tagInfo = findTagInSegments(segments, 2);
    if (!tagInfo) continue;

    const key = `${root}:${entityKey}:${tagInfo.tag}`;
    const list = entity.get(key) ?? { root: [], nested: [] };
    if (tagInfo.index === 2) {
      list.root.push(relativePath);
    } else {
      list.nested.push(relativePath);
    }
    entity.set(key, list);
  }

  const sortEntries = (items: string[]) =>
    items.sort((left, right) => left.localeCompare(right));

  for (const [tag, items] of common.entries()) {
    common.set(tag, sortEntries(items));
  }

  for (const [key, items] of entity.entries()) {
    entity.set(key, {
      root: sortEntries(items.root),
      nested: sortEntries(items.nested),
    });
  }

  return { common, entity };
}

async function pickFromSequence(params: {
  userId: number;
  kind: NotificationKind;
  entityKey: string | null;
  imageTag: string;
  sequence: string[];
}): Promise<string | null> {
  const { userId, kind, entityKey, imageTag, sequence } = params;
  if (sequence.length === 0) return null;

  let rotationIndex = 0;
  try {
    rotationIndex = await getNextRotationIndex({
      userId,
      kind,
      entityKey,
      imageTag,
    });
  } catch (error) {
    console.warn(
      `[NotificationImages] ⚠️ Failed to load rotation index, fallback to 0:`,
      error
    );
  }

  // Важно: при изменении пула всегда нормализуем индекс modulo актуальной длины.
  const safeIndex = Math.abs(rotationIndex) % sequence.length;
  const baseUrl = resolvePublicBaseUrl();
  const skippedReasons: Record<string, number> = {};

  for (let offset = 0; offset < sequence.length; offset += 1) {
    const selected = sequence[(safeIndex + offset) % sequence.length];
    const hashedPath = resolveHashedNotificationPath(selected);
    const validation = validateNotificationImagePath(hashedPath);

    if (!validation.valid) {
      skippedReasons[validation.reason] =
        (skippedReasons[validation.reason] ?? 0) + 1;
      continue;
    }

    return `${baseUrl}${hashedPath}`;
  }

  if (Object.keys(skippedReasons).length > 0) {
    console.warn(
      '[NotificationImages] ⚠️ No valid image candidate after checks',
      {
        userId,
        kind,
        entityKey,
        imageTag,
        skippedReasons,
      }
    );
  }

  logImageDebug('no_valid_asset_after_validation', {
    userId,
    kind,
    entityKey,
    imageTag,
    sequenceSize: sequence.length,
  });

  return null;
}

async function shouldAttachImageByFrequencyGate(params: {
  userId: number;
  kind: NotificationKind;
  entityKey: string | null;
}): Promise<boolean> {
  // Для sugar ограничиваем частоту вложений: максимум 50% уведомлений с картинкой.
  if (params.kind !== 'habits' || params.entityKey !== 'sugar') {
    return true;
  }

  try {
    const gateIndex = await getNextRotationIndex({
      userId: params.userId,
      kind: params.kind,
      entityKey: params.entityKey,
      imageTag: 'sugar_frequency_gate',
    });
    return Math.abs(gateIndex) % 2 === 0;
  } catch (error) {
    console.warn(
      '[NotificationImages] ⚠️ Sugar frequency gate failed, fallback to allow image',
      {
        userId: params.userId,
        kind: params.kind,
        entityKey: params.entityKey,
        error,
      }
    );
    return true;
  }
}

function buildMatchedTags(params: {
  candidateTags: Set<ImageTag>;
  normalizedLlmTag: ImageTag | null;
  policy: TagPolicy;
  kind: NotificationKind;
  entityKey: string | null;
  directness: Directness;
  subtype: NotificationSubtype | null;
  habitIntent: 'build' | 'quit' | 'custom' | null;
  actionHint: NotificationActionHint | null;
  signals: SemanticSignals;
}): {
  matched: MatchedTag[];
  scores: Record<ImageTag, number>;
} {
  const scores: Record<ImageTag, number> = {
    harm_organs: 0,
    harm_appearance: 0,
    harm_mental: 0,
    activity: 0,
    nature: 0,
    meditation: 0,
    daily_life: 0,
    neutral_abstract: 0,
  };
  const matched: MatchedTag[] = [];

  for (const tag of params.candidateTags) {
    const score = computeTagScore({
      imageTag: tag,
      normalizedLlmTag: params.normalizedLlmTag,
      policy: params.policy,
      signals: params.signals,
      kind: params.kind,
      directness: params.directness,
      subtype: params.subtype,
      habitIntent: params.habitIntent,
      actionHint: params.actionHint,
    });

    scores[tag] = score;

    if (score < MATCH_SCORE_THRESHOLD) continue;

    matched.push({
      tag,
      score,
      sequence: resolveTagSequence({
        kind: params.kind,
        entityKey: params.entityKey,
        imageTag: tag,
      }),
    });
  }

  matched.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (
      params.normalizedLlmTag &&
      left.tag !== right.tag &&
      (left.tag === params.normalizedLlmTag ||
        right.tag === params.normalizedLlmTag)
    ) {
      return left.tag === params.normalizedLlmTag ? -1 : 1;
    }

    return left.tag.localeCompare(right.tag);
  });

  return { matched, scores };
}

export async function pickNotificationImage(
  params: ImagePickParams
): Promise<string | null> {
  const normalizedEntityKey = normalizeEntityKey(params.entityKey);
  const normalizedLlmTag = normalizeImageTag(params.imageTag);
  const policy = resolveTagPolicy({
    kind: params.kind,
    entityKey: normalizedEntityKey,
  });
  const candidateTags = buildCandidateTags({
    normalizedLlmTag,
    policy,
  });

  if (candidateTags.size === 0) {
    logImageDebug('no_candidates', {
      userId: params.userId,
      kind: params.kind,
      entityKey: normalizedEntityKey,
      reason: 'candidate_tags_empty',
    });
    return null;
  }

  const signals = collectSemanticSignals({
    text: params.text ?? '',
    actionHint: params.actionHint ?? null,
  });

  const { matched, scores } = buildMatchedTags({
    candidateTags,
    normalizedLlmTag,
    policy,
    kind: params.kind,
    entityKey: normalizedEntityKey,
    directness: params.directness,
    subtype: params.subtype,
    habitIntent: params.habitIntent,
    actionHint: params.actionHint ?? null,
    signals,
  });

  logImageDebug('semantic_scores', {
    userId: params.userId,
    kind: params.kind,
    entityKey: normalizedEntityKey,
    textSource: params.textSource ?? 'unknown',
    threshold: MATCH_SCORE_THRESHOLD,
    llmTag: normalizedLlmTag,
    scores,
  });

  if (matched.length === 0) {
    logImageDebug('no_match', {
      userId: params.userId,
      kind: params.kind,
      entityKey: normalizedEntityKey,
      threshold: MATCH_SCORE_THRESHOLD,
      llmTag: normalizedLlmTag,
      reason: 'semantic_threshold_not_met',
    });
    return null;
  }

  if (
    params.kind === 'habits' &&
    params.habitIntent === 'quit' &&
    isPositiveQuitWithoutHarm(signals)
  ) {
    logImageDebug('skip_entity_for_positive_quit_context', {
      userId: params.userId,
      kind: params.kind,
      entityKey: normalizedEntityKey,
      llmTag: normalizedLlmTag,
      reason: 'entity_assets_blocked_positive_or_benefit_text_for_quit_habit',
    });
  }

  const allowByFrequencyGate = await shouldAttachImageByFrequencyGate({
    userId: params.userId,
    kind: params.kind,
    entityKey: normalizedEntityKey,
  });
  if (!allowByFrequencyGate) {
    logImageDebug('skip_by_frequency_gate', {
      userId: params.userId,
      kind: params.kind,
      entityKey: normalizedEntityKey,
      reason: 'entity_frequency_gate',
    });
    return null;
  }

  if (params.kind === 'therapy') {
    // Для therapy всегда приоритет сущностных ассетов, затем common fallback.
    for (const item of matched) {
      if (item.sequence.entity.length === 0) continue;
      if (
        !isImageTagAllowed({
          imageTag: item.tag,
          source: 'entity',
          policy,
          kind: params.kind,
          directness: params.directness,
          subtype: params.subtype,
          isMixedMode: params.isMixedMode,
          habitIntent: params.habitIntent,
          signals,
        })
      ) {
        continue;
      }

      const imageUrl = await pickFromSequence({
        userId: params.userId,
        kind: params.kind,
        entityKey: normalizedEntityKey,
        imageTag: item.tag,
        sequence: item.sequence.entity,
      });

      if (imageUrl) {
        return imageUrl;
      }
    }

    const commonGroups: string[][] = [];
    const commonTags: ImageTag[] = [];

    for (const item of matched) {
      if (item.sequence.common.length === 0) continue;
      if (
        !isImageTagAllowed({
          imageTag: item.tag,
          source: 'common',
          policy,
          kind: params.kind,
          directness: params.directness,
          subtype: params.subtype,
          isMixedMode: params.isMixedMode,
          habitIntent: params.habitIntent,
          signals,
        })
      ) {
        continue;
      }

      commonGroups.push(item.sequence.common);
      commonTags.push(item.tag);
    }

    if (commonGroups.length > 1) {
      const mixedCommonSequence = interleaveRoundRobin(commonGroups);
      const imageUrl = await pickFromSequence({
        userId: params.userId,
        kind: params.kind,
        entityKey: normalizedEntityKey,
        imageTag: 'therapy_common_mix',
        sequence: mixedCommonSequence,
      });

      if (imageUrl) {
        return imageUrl;
      }
    } else if (commonGroups.length === 1) {
      const imageUrl = await pickFromSequence({
        userId: params.userId,
        kind: params.kind,
        entityKey: normalizedEntityKey,
        imageTag: commonTags[0],
        sequence: commonGroups[0],
      });

      if (imageUrl) {
        return imageUrl;
      }
    }

    return null;
  }

  if (policy.isWater) {
    const neutral = matched.find((item) => item.tag === 'neutral_abstract');
    const activity = matched.find((item) => item.tag === 'activity');

    if (
      neutral &&
      activity &&
      neutral.sequence.entity.length > 0 &&
      activity.sequence.common.length > 0 &&
      isImageTagAllowed({
        imageTag: 'neutral_abstract',
        source: 'entity',
        policy,
        kind: params.kind,
        directness: params.directness,
        subtype: params.subtype,
        isMixedMode: params.isMixedMode,
        habitIntent: params.habitIntent,
        signals,
      }) &&
      isImageTagAllowed({
        imageTag: 'activity',
        source: 'common',
        policy,
        kind: params.kind,
        directness: params.directness,
        subtype: params.subtype,
        isMixedMode: params.isMixedMode,
        habitIntent: params.habitIntent,
        signals,
      })
    ) {
      // Для воды чередуем neutral_abstract + common/activity в одной ротации.
      const mixedSequence = interleaveAlternating(
        neutral.sequence.entity,
        activity.sequence.common
      );
      const imageUrl = await pickFromSequence({
        userId: params.userId,
        kind: params.kind,
        entityKey: normalizedEntityKey,
        imageTag: 'water_mix',
        sequence: mixedSequence,
      });

      if (imageUrl) {
        return imageUrl;
      }
    }
  }

  // Для habits всегда сначала пробуем сущностные теги, потом common fallback.
  for (const item of matched) {
    if (item.sequence.entity.length === 0) continue;

    if (
      !isImageTagAllowed({
        imageTag: item.tag,
        source: 'entity',
        policy,
        kind: params.kind,
        directness: params.directness,
        subtype: params.subtype,
        isMixedMode: params.isMixedMode,
        habitIntent: params.habitIntent,
        signals,
      })
    ) {
      continue;
    }

    const imageUrl = await pickFromSequence({
      userId: params.userId,
      kind: params.kind,
      entityKey: normalizedEntityKey,
      imageTag: item.tag,
      sequence: item.sequence.entity,
    });

    if (imageUrl) {
      return imageUrl;
    }
  }

  for (const item of matched) {
    if (item.sequence.common.length === 0) continue;

    if (
      !isImageTagAllowed({
        imageTag: item.tag,
        source: 'common',
        policy,
        kind: params.kind,
        directness: params.directness,
        subtype: params.subtype,
        isMixedMode: params.isMixedMode,
        habitIntent: params.habitIntent,
        signals,
      })
    ) {
      continue;
    }

    const imageUrl = await pickFromSequence({
      userId: params.userId,
      kind: params.kind,
      entityKey: normalizedEntityKey,
      imageTag: item.tag,
      sequence: item.sequence.common,
    });

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}
