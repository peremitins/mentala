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

const CATALOG_HABIT_KEYS = new Set<string>(
  HABITS_CATALOG.map((habit) => habit.habitKey)
);
const CATALOG_THERAPY_KEYS = new Set<string>(
  THERAPY_TOPICS.map((topic) => topic.key)
);

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
    const parsedTopicKey = MeditationTopicKeyEnum.safeParse(topicKey);
    const meditationTopicKey = parsedTopicKey.success
      ? parsedTopicKey.data
      : undefined;

    if (trackId) {
      const target = {
        type: 'meditation_track',
        trackId,
        topicKey: meditationTopicKey,
      } satisfies AppNavigationTarget;

      return AppNavigationTargetDto.parse(target);
    }

    if (meditationTopicKey) {
      return {
        type: 'meditation_collection',
        topicKey: meditationTopicKey,
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

  if (path === '/quick-help/thought-dump') {
    return {
      type: 'quick_help_entry',
      entry: 'thought_dump',
    };
  }

  if (path === '/quick-help') {
    const entry = readStringParam(route.query.entry);
    if (
      entry &&
      ['panic', 'tension', 'technique_picker', 'thought_dump'].includes(entry)
    ) {
      return {
        type: 'quick_help_entry',
        entry: entry as
          | 'panic'
          | 'tension'
          | 'technique_picker'
          | 'thought_dump',
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

  if (
    path.startsWith('/programs/') &&
    /^\/programs\/[^/]+\/steps\/\d+/.test(path)
  ) {
    const slug = readStringParam(route.params.slug);
    if (slug) {
      return { type: 'program_step', slug };
    }
    return null;
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
      return null;
    case 'gratitude_diary':
      return null;
    case 'breath_practice': {
      if (target.slug === 'custom') {
        return 'breath.custom.create';
      }
      if (target.slug.startsWith('custom-')) {
        return 'breath.custom.manage';
      }
      return 'breath.catalog.full';
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
      return 'breath.catalog.full';
    }
    case 'quick_help':
      return null;
    case 'quick_help_entry': {
      return 'quick_help.practice';
    }
    case 'therapy_topic':
      return CATALOG_THERAPY_KEYS.has(target.topicKey)
        ? null
        : 'therapy.custom.create';
    case 'habit':
      return CATALOG_HABIT_KEYS.has(target.habitKey)
        ? null
        : 'habits.custom.create';
    case 'program_step':
      return 'programs.roadmap.full';
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
    case 'quick_help':
    case 'quick_help_entry':
      return { path: '/quick-help' };
    case 'therapy_topic':
      return { path: '/therapy' };
    case 'habit':
      return { path: '/habits' };
    case 'program_step':
      return { path: `/programs/${target.slug}/map` };
    default:
      return { path: '/' };
  }
}
