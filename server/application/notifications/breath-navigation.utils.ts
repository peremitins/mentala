import type {
  NotificationActionHint,
  NotificationNavigation,
} from '../../../shared/dto/notifications';
import {
  buildAppNavigationPath,
  buildLegacyNotificationNavigation,
  type AppNavigationTarget,
} from '../../../shared/navigation';

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
  {
    pattern: /4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4/iu,
    slug: 'box-breathing',
  },
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
  const target = resolveNavigationTargetFromActionHint(
    actionHint,
    notificationText
  );
  return buildLegacyNotificationNavigation(target) ?? { type: 'home' };
}

export function resolveNavigationTargetFromActionHint(
  actionHint?: NotificationActionHint | null,
  notificationText?: string | null
): AppNavigationTarget {
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
      groupKey:
        detectedSlug === '4-7-8'
          ? 'sleep'
          : detectedSlug === 'box-breathing'
            ? 'popular'
            : 'anxiety',
    };
  }

  if (actionHint === 'gratitude_diary') {
    return { type: 'gratitude_diary' };
  }

  if (actionHint === 'grounding') {
    return { type: 'quick_help_entry', entry: 'panic' };
  }

  if (actionHint === 'tension_release') {
    return { type: 'quick_help_entry', entry: 'tension' };
  }

  if (actionHint === 'thought_dump') {
    return { type: 'quick_help_entry', entry: 'thought_dump' };
  }

  return { type: 'home' };
}

// Строим deepLink для payload так же, как ожидает клиентский fallback.
export function buildDeepLinkFromNavigation(
  navigation: NotificationNavigation
): string {
  const target: AppNavigationTarget =
    navigation.type === 'home'
      ? { type: 'home' }
      : navigation.type === 'meditation_track'
        ? {
            type: 'meditation_track',
            trackId: navigation.trackId,
          }
        : navigation.type === 'breath_practices'
          ? { type: 'breath_practices_list' }
          : {
              type: 'breath_practice',
              slug: navigation.slug,
              groupKey:
                navigation.slug === '4-7-8'
                  ? 'sleep'
                  : navigation.slug === DEFAULT_BREATH_PRACTICE_SLUG
                    ? 'popular'
                    : undefined,
            };

  return buildAppNavigationPath(target);
}

export function buildDeepLinkFromTarget(target: AppNavigationTarget): string {
  return buildAppNavigationPath(target);
}
