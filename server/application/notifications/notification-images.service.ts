import type {
  Directness,
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

type ImageTag =
  | 'harm_organs'
  | 'harm_appearance'
  | 'harm_mental'
  | 'activity'
  | 'nature'
  | 'meditation'
  | 'daily_life'
  | 'neutral_abstract';

const IMAGE_TAGS = new Set<ImageTag>([
  'harm_organs',
  'harm_appearance',
  'harm_mental',
  'activity',
  'nature',
  'meditation',
  'daily_life',
  'neutral_abstract',
]);

const NEUTRAL_TAGS = new Set<ImageTag>([
  'activity',
  'nature',
  'meditation',
  'daily_life',
  'neutral_abstract',
]);

const SAFE_FALLBACK_ORDER: ImageTag[] = [
  'nature',
  'daily_life',
  'activity',
  'meditation',
  'neutral_abstract',
];

type ImageIndex = {
  common: Map<ImageTag, string[]>;
  entity: Map<string, { root: string[]; nested: string[] }>;
};

const IMAGE_INDEX = buildImageIndex();

type ImagePickParams = {
  userId: number;
  kind: NotificationKind;
  entityKey: string | null;
  imageTag: string | null;
  directness: Directness;
  subtype: NotificationSubtype | null;
  isMixedMode: boolean;
  habitIntent: 'build' | 'quit' | 'custom' | null;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function resolvePublicBaseUrl(): string {
  // Используем NUXT_PUBLIC_MEDIA_BASE_URL для картинок в push-уведомлениях
  // Это должно быть публично доступным доменом, чтобы Firebase Cloud Messaging мог скачать изображение
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

function isHarmTag(tag: ImageTag): boolean {
  return tag.startsWith('harm_');
}

function isMeditationEntity(params: {
  kind: NotificationKind;
  entityKey: string | null;
}): boolean {
  if (params.kind !== 'habits') return false;
  const key = params.entityKey?.trim().toLowerCase();
  return key === 'meditation';
}

function isImageTagAllowed(params: {
  kind: NotificationKind;
  entityKey: string | null;
  imageTag: ImageTag;
  directness: Directness;
  subtype: NotificationSubtype | null;
  isMixedMode: boolean;
  habitIntent: 'build' | 'quit' | 'custom' | null;
}): boolean {
  const {
    kind,
    entityKey,
    imageTag,
    directness,
    subtype,
    habitIntent,
    isMixedMode,
  } = params;

  // Для кастомных сущностей разрешены только нейтральные теги
  if (!entityKey && !NEUTRAL_TAGS.has(imageTag)) {
    return false;
  }

  if (!isHarmTag(imageTag)) {
    return true;
  }

  // Жесткие запреты для harm_*
  if (kind === 'therapy') return false;
  if (directness === 'soft') return false;
  if (habitIntent !== 'quit') return false;
  if (subtype !== 'informational') return false;
  // Для mixed допускаем harm_* только в режиме hard
  if (isMixedMode && directness !== 'hard') return false;

  if (imageTag === 'harm_organs') {
    return directness === 'hard';
  }

  return directness === 'moderate' || directness === 'hard';
}

function buildCandidateTags(params: {
  baseTag: ImageTag;
  isMeditationOnly: boolean;
}): ImageTag[] {
  const { baseTag, isMeditationOnly } = params;
  if (isMeditationOnly) {
    return ['meditation'];
  }

  const candidates: ImageTag[] = [];
  const pushUnique = (tag: ImageTag) => {
    if (!candidates.includes(tag)) {
      candidates.push(tag);
    }
  };

  pushUnique(baseTag);
  for (const tag of SAFE_FALLBACK_ORDER) {
    pushUnique(tag);
  }

  return candidates;
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

function resolveSequenceForTag(params: {
  kind: NotificationKind;
  entityKey: string | null;
  imageTag: ImageTag;
}): string[] {
  const { kind, entityKey, imageTag } = params;

  const common = IMAGE_INDEX.common.get(imageTag) ?? [];
  const entityKeySafe = entityKey ?? null;
  const entityLists =
    entityKeySafe && (kind === 'habits' || kind === 'therapy')
      ? (IMAGE_INDEX.entity.get(`${kind}:${entityKeySafe}:${imageTag}`) ?? null)
      : null;

  const entityRoot = entityLists?.root ?? [];
  const entityNested = entityLists?.nested ?? [];
  const entityMerged =
    entityRoot.length > 0 && entityNested.length > 0
      ? interleaveAlternating(entityRoot, entityNested)
      : entityRoot.length > 0
        ? entityRoot
        : entityNested;

  if (entityMerged.length > 0 && common.length > 0) {
    // 50/50 микс: чередуем источники без дублирования
    return interleaveAlternating(entityMerged, common);
  }

  return entityMerged.length > 0 ? entityMerged : common;
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
  imageTag: ImageTag;
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

  return null;
}

export async function pickNotificationImage(
  params: ImagePickParams
): Promise<string | null> {
  if (!params.imageTag) {
    return null;
  }
  const normalizedTag = normalizeImageTag(params.imageTag);
  if (!normalizedTag) {
    return null;
  }
  const candidateTags = buildCandidateTags({
    baseTag: normalizedTag,
    isMeditationOnly: isMeditationEntity({
      kind: params.kind,
      entityKey: params.entityKey,
    }),
  });

  for (const imageTag of candidateTags) {
    if (
      !isImageTagAllowed({
        kind: params.kind,
        entityKey: params.entityKey,
        imageTag,
        directness: params.directness,
        subtype: params.subtype,
        isMixedMode: params.isMixedMode,
        habitIntent: params.habitIntent,
      })
    ) {
      continue;
    }

    const sequence = resolveSequenceForTag({
      kind: params.kind,
      entityKey: params.entityKey,
      imageTag,
    });
    if (sequence.length === 0) {
      continue;
    }

    const imageUrl = await pickFromSequence({
      userId: params.userId,
      kind: params.kind,
      entityKey: params.entityKey,
      imageTag,
      sequence,
    });

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}
