import type {
  NotificationActionHint,
  NotificationNavigation,
} from '../../../shared/dto/notifications';

const DEFAULT_MEDITATION_TRACK_ID =
  process.env.DEFAULT_MEDITATION_TRACK_ID?.trim() || 'ultimate-relaxation';
const DEFAULT_BREATH_PRACTICE_SLUG =
  process.env.DEFAULT_BREATH_PRACTICE_SLUG?.trim() || 'box-breathing';

const BREATH_478_PATTERN = /4\s*[-–—‑]?\s*7\s*[-–—‑]?\s*8/iu;
const BREATH_4444_PATTERN = /4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4/iu;
const BOX_BREATHING_TEXT_MARKERS = [
  /квадратн.*дых/iu,
  /коробочн/iu,
  /box\s*breath/iu,
  /square\s*breath/iu,
];

// Выбираем конкретную дыхательную практику по тексту уведомления.
export function resolveBreathPracticeSlugFromText(
  notificationText?: string | null
): string | null {
  if (!notificationText) return null;
  const normalizedText = notificationText.trim();
  if (!normalizedText) return null;

  // При конфликте маркеров приоритет у явного 4-7-8.
  if (BREATH_478_PATTERN.test(normalizedText)) {
    return '4-7-8';
  }

  const hasBoxPattern =
    BREATH_4444_PATTERN.test(normalizedText) ||
    BOX_BREATHING_TEXT_MARKERS.some((pattern) => pattern.test(normalizedText));
  if (hasBoxPattern) {
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
