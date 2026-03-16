import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { HABITS_CATALOG } from '@/app/lib/habitsCatalog';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import {
  AppNavigationTargetDto,
  BreathPracticeGroupKeyEnum,
  resolveDefaultBreathPracticeSlug,
  type AppNavigationTarget,
} from '@/shared/navigation';
import { MeditationTopicKeyEnum } from '@/shared/dto/meditations';

const BASIC_FREE_BREATH_SLUGS = new Set(['4-7-8', 'box-breathing']);
const CATALOG_HABIT_KEYS = new Set(
  HABITS_CATALOG.map((habit) => habit.habitKey)
);
const CATALOG_THERAPY_KEYS = new Set(THERAPY_TOPICS.map((topic) => topic.key));

function readStringParam(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' && first.trim() ? first.trim() : null;
  }

  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveAppNavigationTargetFromRoute(
  route: Pick<RouteLocationNormalizedLoaded, 'path' | 'params' | 'query'>
): AppNavigationTarget | null {
  const path = route.path;

  if (path === '/') {
    return { type: 'home' };
  }

  if (path === '/meditations' || path.startsWith('/meditations/')) {
    const trackId = readStringParam(route.query.trackId);
    const topicKey = readStringParam(route.query.topic);

    if (trackId) {
      const target = {
        type: 'meditation_track',
        trackId,
        topicKey:
          topicKey && MeditationTopicKeyEnum.safeParse(topicKey).success
            ? topicKey
            : undefined,
      } satisfies AppNavigationTarget;

      return AppNavigationTargetDto.parse(target);
    }

    if (topicKey && MeditationTopicKeyEnum.safeParse(topicKey).success) {
      return {
        type: 'meditation_collection',
        topicKey,
      };
    }

    return { type: 'meditations_list' };
  }

  if (path === '/breath-practices' || path.startsWith('/breath-practices/')) {
    const slug = readStringParam(route.params.slug);
    const groupKey = readStringParam(route.query.group);
    const parsedGroupKey =
      groupKey && BreathPracticeGroupKeyEnum.safeParse(groupKey).success
        ? groupKey
        : undefined;

    if (slug) {
      return AppNavigationTargetDto.parse({
        type: 'breath_practice',
        slug,
        groupKey: parsedGroupKey,
      });
    }

    return { type: 'breath_practices_list' };
  }

  if (path === '/quick-help') {
    const entry = readStringParam(route.query.entry);
    if (entry && ['panic', 'tension', 'technique_picker'].includes(entry)) {
      return {
        type: 'quick_help_entry',
        entry: entry as 'panic' | 'tension' | 'technique_picker',
      };
    }

    return { type: 'quick_help' };
  }

  if (
    path === '/practices/gratitude-diary' ||
    path.startsWith('/practices/gratitude-diary/')
  ) {
    return { type: 'gratitude_diary' };
  }

  if (path === '/therapy' || path.startsWith('/therapy/')) {
    const topicKey = readStringParam(route.params.key);
    if (topicKey) {
      return {
        type: 'therapy_topic',
        topicKey,
      };
    }

    return { type: 'therapy_list' };
  }

  if (path === '/habits' || path.startsWith('/habits/')) {
    const habitKey = readStringParam(route.params.id);
    if (habitKey) {
      return {
        type: 'habit',
        habitKey,
      };
    }

    return { type: 'habits_list' };
  }

  return null;
}

export function resolveNavigationFeatureKey(
  target: AppNavigationTarget
): string | null {
  switch (target.type) {
    case 'meditations_list':
    case 'meditation_collection':
    case 'meditation_track':
      return 'meditations.library.full';
    case 'gratitude_diary':
      return 'gratitude.diary.full';
    case 'breath_practice': {
      if (target.slug === 'custom') {
        return 'breath.custom.create';
      }
      if (target.slug.startsWith('custom-')) {
        return 'breath.custom.manage';
      }
      return BASIC_FREE_BREATH_SLUGS.has(target.slug)
        ? null
        : 'breath.catalog.full';
    }
    case 'breath_practice_group': {
      if (target.groupKey === 'custom') {
        return 'breath.custom.create';
      }
      const preferredSlug =
        target.preferredSlug ??
        resolveDefaultBreathPracticeSlug(target.groupKey);
      if (!preferredSlug) {
        return null;
      }
      return BASIC_FREE_BREATH_SLUGS.has(preferredSlug)
        ? null
        : 'breath.catalog.full';
    }
    case 'therapy_topic':
      return CATALOG_THERAPY_KEYS.has(target.topicKey)
        ? null
        : 'therapy.custom.create';
    case 'habit':
      return CATALOG_HABIT_KEYS.has(target.habitKey)
        ? null
        : 'habits.custom.create';
    default:
      return null;
  }
}

export function buildBlockedNavigationFallbackRoute(
  target: AppNavigationTarget
) {
  switch (target.type) {
    case 'meditations_list':
    case 'meditation_collection':
    case 'meditation_track':
      return { path: '/practices' };
    case 'breath_practice':
    case 'breath_practice_group':
      return { path: '/breath-practices' };
    case 'gratitude_diary':
      return { path: '/practices' };
    case 'therapy_topic':
      return { path: '/therapy' };
    case 'habit':
      return { path: '/habits' };
    default:
      return { path: '/' };
  }
}
