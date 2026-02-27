import type {
  NotificationActionHint,
  NotificationNavigation,
} from '../../../shared/dto/notifications';

const DEFAULT_MEDITATION_TRACK_ID =
  process.env.DEFAULT_MEDITATION_TRACK_ID?.trim() || 'ultimate-relaxation';
const DEFAULT_BREATH_PRACTICE_SLUG =
  process.env.DEFAULT_BREATH_PRACTICE_SLUG?.trim() || 'box-breathing';

// Паттерны техник в порядке проверки: более специфичные первыми.
// AI генерирует тексты unpredictably — можем встретить 4-7-8, 4-4-4-4, 4-6 и др.
const BREATH_TECHNIQUE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  slug: string;
}> = [
  { pattern: /4\s*[-–—‑]?\s*7\s*[-–—‑]?\s*8/iu, slug: '4-7-8' },
  { pattern: /4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4/iu, slug: 'box-breathing' },
  { pattern: /4\s*[-–—‑]?\s*6\b/iu, slug: 'long-exhale-4-6' },
  { pattern: /5\s*[-–—‑]?\s*5\b/iu, slug: 'equal-5-5' },
  { pattern: /6\s*[-–—‑]?\s*6\b/iu, slug: 'equal-6-6' },
  { pattern: /4\s*[-–—‑]?\s*4\b/iu, slug: 'diaphragmatic' },
  { pattern: /2\s*[-–—‑]?\s*4\b/iu, slug: 'pursed-lip' },
];

const BOX_BREATHING_TEXT_MARKERS = [
  /квадратн.*дых/iu,
  /коробочн/iu,
  /box\s*breath/iu,
  /square\s*breath/iu,
];

/**
 * Определяет slug дыхательной практики по тексту уведомления.
 * AI может упомянуть любую технику (4-7-8, 4-4-4-4, 4-6 и т.д.) — редирект на соответствующую.
 * При отсутствии явного упоминания — null (fallback на DEFAULT_BREATH_PRACTICE_SLUG).
 */
export function resolveBreathPracticeSlugFromText(
  notificationText?: string | null
): string | null {
  if (!notificationText) return null;
  const normalizedText = notificationText.trim();
  if (!normalizedText) return null;

  for (const { pattern, slug } of BREATH_TECHNIQUE_PATTERNS) {
    if (pattern.test(normalizedText)) return slug;
  }
  if (BOX_BREATHING_TEXT_MARKERS.some((p) => p.test(normalizedText))) {
    return 'box-breathing';
  }

  return null;
}

export function resolveNavigationFromActionHint(
  actionHint?: NotificationActionHint | null,
  notificationText?: string | null
): NotificationNavigation {
  if (actionHint === 'meditation') {
    return {
      type: 'meditation_track',
      trackId: DEFAULT_MEDITATION_TRACK_ID,
    };
  }

  if (actionHint === 'breathing') {
    const detectedSlug =
      resolveBreathPracticeSlugFromText(notificationText) ??
      DEFAULT_BREATH_PRACTICE_SLUG;
    return {
      type: 'breath_practice',
      slug: detectedSlug,
    };
  }

  return { type: 'home' };
}

// Строим deepLink для payload так же, как ожидает клиентский fallback.
export function buildDeepLinkFromNavigation(
  navigation: NotificationNavigation
): string {
  switch (navigation.type) {
    case 'meditation_track':
      return `/meditations?trackId=${encodeURIComponent(navigation.trackId)}`;
    case 'breath_practice':
      return `/breath-practices/${encodeURIComponent(navigation.slug)}${
        navigation.slug === DEFAULT_BREATH_PRACTICE_SLUG ? '?group=popular' : ''
      }`;
    case 'breath_practices':
      return '/breath-practices';
    default:
      return '/';
  }
}
