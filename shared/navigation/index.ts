import { z } from 'zod';
import { MeditationTopicKeyEnum } from '../dto/meditations';

export const BreathPracticeGroupKeyEnum = z.enum([
  'popular',
  'sleep',
  'anxiety',
  'focus',
  'custom',
]);

export const QuickHelpEntryEnum = z.enum([
  'panic',
  'tension',
  'technique_picker',
  'thought_dump',
]);

export const AppNavigationTargetTypeEnum = z.enum([
  'home',
  'meditations_list',
  'meditation_collection',
  'meditation_track',
  'breath_practices_list',
  'breath_practice_group',
  'breath_practice',
  'quick_help',
  'quick_help_entry',
  'gratitude_diary',
  'therapy_list',
  'therapy_topic',
  'habits_list',
  'habit',
  'program_step',
]);

export const HomeNavigationTargetDto = z.object({
  type: z.literal('home'),
});

export const MeditationsListNavigationTargetDto = z.object({
  type: z.literal('meditations_list'),
});

export const MeditationCollectionNavigationTargetDto = z.object({
  type: z.literal('meditation_collection'),
  topicKey: MeditationTopicKeyEnum,
});

export const MeditationTrackNavigationTargetDto = z.object({
  type: z.literal('meditation_track'),
  trackId: z.string().trim().min(1).max(160),
  topicKey: MeditationTopicKeyEnum.optional(),
});

export const BreathPracticesListNavigationTargetDto = z.object({
  type: z.literal('breath_practices_list'),
});

export const BreathPracticeGroupNavigationTargetDto = z.object({
  type: z.literal('breath_practice_group'),
  groupKey: BreathPracticeGroupKeyEnum,
  preferredSlug: z.string().trim().min(1).max(160).optional(),
});

export const BreathPracticeNavigationTargetDto = z.object({
  type: z.literal('breath_practice'),
  slug: z.string().trim().min(1).max(160),
  groupKey: BreathPracticeGroupKeyEnum.optional(),
});

export const QuickHelpNavigationTargetDto = z.object({
  type: z.literal('quick_help'),
});

export const QuickHelpEntryNavigationTargetDto = z.object({
  type: z.literal('quick_help_entry'),
  entry: QuickHelpEntryEnum,
});

export const GratitudeDiaryNavigationTargetDto = z.object({
  type: z.literal('gratitude_diary'),
});

export const TherapyListNavigationTargetDto = z.object({
  type: z.literal('therapy_list'),
});

export const TherapyTopicNavigationTargetDto = z.object({
  type: z.literal('therapy_topic'),
  topicKey: z.string().trim().min(1).max(160),
});

export const HabitsListNavigationTargetDto = z.object({
  type: z.literal('habits_list'),
});

export const HabitNavigationTargetDto = z.object({
  type: z.literal('habit'),
  habitKey: z.string().trim().min(1).max(160),
});

export const ProgramStepNavigationTargetDto = z.object({
  type: z.literal('program_step'),
  slug: z.string().trim().min(1).max(160),
});

export const AppNavigationTargetDto = z.discriminatedUnion('type', [
  HomeNavigationTargetDto,
  MeditationsListNavigationTargetDto,
  MeditationCollectionNavigationTargetDto,
  MeditationTrackNavigationTargetDto,
  BreathPracticesListNavigationTargetDto,
  BreathPracticeGroupNavigationTargetDto,
  BreathPracticeNavigationTargetDto,
  QuickHelpNavigationTargetDto,
  QuickHelpEntryNavigationTargetDto,
  GratitudeDiaryNavigationTargetDto,
  TherapyListNavigationTargetDto,
  TherapyTopicNavigationTargetDto,
  HabitsListNavigationTargetDto,
  HabitNavigationTargetDto,
  ProgramStepNavigationTargetDto,
]);

export const AppNavigationSourceEnum = z.enum([
  'push',
  'chat_chip',
  'chat_cta',
  'chat_command',
  'habit_page',
  'therapy_page',
  'system_recommendation',
  'route_guard',
]);

export const AppNavigationResolvedByEnum = z.enum([
  'exact',
  'normalized',
  'fuzzy',
  'registry_rule',
  'user_selected',
  'fallback',
  'legacy_action',
  'legacy_notification',
]);

const SourceMetaValueDto = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const AppNavigationRequestDto = z.object({
  target: AppNavigationTargetDto,
  source: AppNavigationSourceEnum,
  entryPoint: z.string().trim().min(1).max(120).optional(),
  rawQuery: z.string().trim().min(1).max(400).optional(),
  sourceMeta: z.record(SourceMetaValueDto).optional(),
});

export const NavigationIntentExtractionDto = z.object({
  intent: z.enum([
    'open_meditation',
    'open_breath_practice',
    'open_quick_help',
    'open_gratitude_diary',
    'open_therapy_topic',
    'open_habit',
    'none',
  ]),
  query: z.string().trim().min(1).max(200).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export const AppNavigationResultPlanEnum = z.enum(['basic', 'pro', 'premium']);

export const NavigationResolutionOutcomeDto = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('none'),
    reason: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    kind: z.literal('resolved'),
    target: AppNavigationTargetDto,
    resolvedBy: AppNavigationResolvedByEnum,
  }),
  z.object({
    kind: z.literal('shortlist'),
    targets: z.array(AppNavigationTargetDto).min(1).max(3),
    resolvedBy: AppNavigationResolvedByEnum,
  }),
  z.object({
    kind: z.literal('not_found'),
    query: z.string().trim().min(1).max(200).optional(),
    resolvedBy: AppNavigationResolvedByEnum.optional(),
  }),
  z.object({
    kind: z.literal('paywall'),
    target: AppNavigationTargetDto,
    featureKey: z.string().trim().min(1).max(160),
    requiredPlan: AppNavigationResultPlanEnum.optional(),
  }),
  z.object({
    kind: z.literal('blocked'),
    target: AppNavigationTargetDto,
    reason: z.string().trim().min(1).max(200),
    featureKey: z.string().trim().min(1).max(160).optional(),
  }),
  z.object({
    kind: z.literal('fallback'),
    requestedTarget: AppNavigationTargetDto,
    target: AppNavigationTargetDto,
    reason: z.string().trim().min(1).max(200).optional(),
  }),
]);

export const AppNavigationResultDto = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('opened'),
    target: AppNavigationTargetDto,
    request: AppNavigationRequestDto,
  }),
  z.object({
    status: z.literal('paywall'),
    target: AppNavigationTargetDto,
    request: AppNavigationRequestDto,
    featureKey: z.string().trim().min(1).max(160),
    requiredPlan: AppNavigationResultPlanEnum.optional(),
  }),
  z.object({
    status: z.literal('blocked'),
    target: AppNavigationTargetDto,
    request: AppNavigationRequestDto,
    reason: z.string().trim().min(1).max(200),
    featureKey: z.string().trim().min(1).max(160).optional(),
  }),
  z.object({
    status: z.literal('not_found'),
    request: AppNavigationRequestDto,
  }),
  z.object({
    status: z.literal('error'),
    request: AppNavigationRequestDto,
    message: z.string().trim().min(1).max(400),
  }),
]);

export const LegacyNotificationNavigationDto = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('home'),
  }),
  z.object({
    type: z.literal('meditation_track'),
    trackId: z.string().trim().min(1).max(160),
  }),
  z.object({
    type: z.literal('breath_practices'),
  }),
  z.object({
    type: z.literal('breath_practice'),
    slug: z.string().trim().min(1).max(160),
  }),
  z.object({
    type: z.literal('gratitude_diary'),
  }),
]);

export type AppNavigationTarget = z.infer<typeof AppNavigationTargetDto>;
export type AppNavigationRequest = z.infer<typeof AppNavigationRequestDto>;
export type AppNavigationSource = z.infer<typeof AppNavigationSourceEnum>;
export type AppNavigationResolvedBy = z.infer<
  typeof AppNavigationResolvedByEnum
>;
export type NavigationIntentExtraction = z.infer<
  typeof NavigationIntentExtractionDto
>;
export type NavigationResolutionOutcome = z.infer<
  typeof NavigationResolutionOutcomeDto
>;
export type AppNavigationResult = z.infer<typeof AppNavigationResultDto>;
export type LegacyNotificationNavigation = z.infer<
  typeof LegacyNotificationNavigationDto
>;
export type BreathPracticeGroupKey = z.infer<typeof BreathPracticeGroupKeyEnum>;
export type QuickHelpEntry = z.infer<typeof QuickHelpEntryEnum>;
export type AppNavigationRouteLocation = {
  path: string;
  query?: Record<string, string | undefined>;
};

const GRATITUDE_DIARY_NOTIFICATION_ENTITY_KEYS = new Set([
  'gratitude',
  'gratitude_diary',
]);

const GRATITUDE_DIARY_NOTIFICATION_TITLE_MARKERS = [
  /дневник\s+благодарности/iu,
  /gratitude\s+diary/iu,
];

export type NotificationContextTargetParams = {
  title?: string | null;
  entityKey?: string | null;
  entityDisplayName?: string | null;
};

export type LegacySuggestedChipAction =
  | 'open_meditations'
  | 'open_meditation_track'
  | 'open_meditations_collection'
  | 'open_breath_practices'
  | 'open_breath_practice'
  | 'open_sos'
  | 'open_gratitude_diary'
  | 'open_therapy'
  | 'open_therapy_topic'
  | 'open_habits'
  | 'open_habit';

export type LegacySuggestedChipActionParams = {
  trackId?: string;
  collectionId?: string;
  practiceId?: string;
  groupKey?: BreathPracticeGroupKey;
  sosEntry?: QuickHelpEntry;
  topicKey?: string;
  habitKey?: string;
  source?: 'chat';
};

const DEFAULT_GROUP_SLUGS: Record<
  Exclude<BreathPracticeGroupKey, 'custom'>,
  string
> = {
  popular: '4-7-8',
  sleep: '4-7-8',
  anxiety: 'long-exhale-4-6',
  focus: 'box-breathing',
};

function cleanupQuery(
  query?: Record<string, string | undefined>
): Record<string, string | undefined> | undefined {
  if (!query) return undefined;
  const nextEntries = Object.entries(query).filter(
    ([, value]) => typeof value === 'string' && value.trim().length > 0
  );
  if (!nextEntries.length) return undefined;
  return Object.fromEntries(nextEntries);
}

function normalizeNotificationContextText(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeNotificationContextKey(value?: string | null): string {
  return normalizeNotificationContextText(value).replace(/[\s-]+/g, '_');
}

export function isGratitudeDiaryNotificationContext(
  params: NotificationContextTargetParams
): boolean {
  const entityCandidates = [params.entityKey, params.entityDisplayName].map(
    (value) => normalizeNotificationContextKey(value)
  );

  if (
    entityCandidates.some((value) =>
      GRATITUDE_DIARY_NOTIFICATION_ENTITY_KEYS.has(value)
    )
  ) {
    return true;
  }

  const titleCandidates = [params.title, params.entityDisplayName].map(
    (value) => normalizeNotificationContextText(value)
  );

  return titleCandidates.some((value) =>
    GRATITUDE_DIARY_NOTIFICATION_TITLE_MARKERS.some((pattern) =>
      pattern.test(value)
    )
  );
}

export function resolveGuaranteedTargetFromNotificationContext(
  params: NotificationContextTargetParams
): AppNavigationTarget | null {
  if (isGratitudeDiaryNotificationContext(params)) {
    return { type: 'gratitude_diary' };
  }

  return null;
}

export function parseAppNavigationTarget(
  value: unknown
): AppNavigationTarget | null {
  const parsed = AppNavigationTargetDto.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseLegacyNotificationNavigation(
  value: unknown
): LegacyNotificationNavigation | null {
  const parsed = LegacyNotificationNavigationDto.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function buildNavigationTargetKey(target: AppNavigationTarget): string {
  switch (target.type) {
    case 'meditation_collection':
      return `${target.type}:${target.topicKey}`;
    case 'meditation_track':
      return `${target.type}:${target.trackId}`;
    case 'breath_practice_group':
      return `${target.type}:${target.groupKey}:${target.preferredSlug ?? ''}`;
    case 'breath_practice':
      return `${target.type}:${target.slug}:${target.groupKey ?? ''}`;
    case 'quick_help_entry':
      return `${target.type}:${target.entry}`;
    case 'therapy_topic':
      return `${target.type}:${target.topicKey}`;
    case 'habit':
      return `${target.type}:${target.habitKey}`;
    default:
      return target.type;
  }
}

export function resolveDefaultBreathPracticeSlug(
  groupKey: BreathPracticeGroupKey
): string | null {
  if (groupKey === 'custom') {
    return null;
  }
  return DEFAULT_GROUP_SLUGS[groupKey];
}

export function buildAppNavigationRoute(
  target: AppNavigationTarget
): AppNavigationRouteLocation {
  switch (target.type) {
    case 'home':
      return { path: '/' };
    case 'meditations_list':
      return { path: '/meditations' };
    case 'meditation_collection':
      return {
        path: '/meditations',
        query: { topic: target.topicKey },
      };
    case 'meditation_track':
      return {
        path: '/meditations',
        query: cleanupQuery({
          trackId: target.trackId,
          topic: target.topicKey,
        }),
      };
    case 'breath_practices_list':
      return { path: '/breath-practices' };
    case 'breath_practice_group': {
      const preferredSlug =
        target.preferredSlug ??
        resolveDefaultBreathPracticeSlug(target.groupKey);
      if (!preferredSlug) {
        return { path: '/breath-practices' };
      }
      return {
        path: `/breath-practices/${encodeURIComponent(preferredSlug)}`,
        query: { group: target.groupKey },
      };
    }
    case 'breath_practice':
      return {
        path: `/breath-practices/${encodeURIComponent(target.slug)}`,
        query: cleanupQuery({
          group: target.groupKey,
        }),
      };
    case 'quick_help':
      return { path: '/quick-help' };
    case 'quick_help_entry':
      if (target.entry === 'thought_dump') {
        return { path: '/quick-help/thought-dump' };
      }
      return {
        path: '/quick-help',
        query: { entry: target.entry },
      };
    case 'gratitude_diary':
      return { path: '/practices/gratitude-diary' };
    case 'therapy_list':
      return { path: '/therapy' };
    case 'therapy_topic':
      return { path: `/therapy/${encodeURIComponent(target.topicKey)}` };
    case 'habits_list':
      return { path: '/habits' };
    case 'habit':
      return { path: `/habits/${encodeURIComponent(target.habitKey)}` };
    default:
      return { path: '/' };
  }
}

export function buildAppNavigationPath(target: AppNavigationTarget): string {
  const route = buildAppNavigationRoute(target);
  const query = cleanupQuery(route.query);
  if (!query) return route.path;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (!value) continue;
    search.set(key, value);
  }

  const serializedQuery = search.toString();
  if (!serializedQuery) return route.path;
  return `${route.path}?${serializedQuery}`;
}

export function resolveTargetFromLegacySuggestedChipAction(params: {
  action?: string | null;
  params?: LegacySuggestedChipActionParams | null;
}): AppNavigationTarget | null {
  const action =
    typeof params.action === 'string' ? params.action.trim() : undefined;
  if (!action) return null;

  let candidate: AppNavigationTarget | null = null;

  if (action === 'open_meditations') {
    candidate = { type: 'meditations_list' };
  }

  if (action === 'open_meditation_track' && params.params?.trackId) {
    candidate = {
      type: 'meditation_track',
      trackId: params.params.trackId,
    };
  }

  if (
    action === 'open_meditations_collection' &&
    params.params?.collectionId &&
    MeditationTopicKeyEnum.safeParse(params.params.collectionId).success
  ) {
    candidate = {
      type: 'meditation_collection',
      topicKey: params.params.collectionId as z.infer<
        typeof MeditationTopicKeyEnum
      >,
    };
  }

  if (action === 'open_breath_practices') {
    if (params.params?.groupKey) {
      candidate = {
        type: 'breath_practice_group',
        groupKey: params.params.groupKey,
      };
    } else {
      candidate = { type: 'breath_practices_list' };
    }
  }

  if (action === 'open_breath_practice' && params.params?.practiceId) {
    candidate = {
      type: 'breath_practice',
      slug: params.params.practiceId,
      groupKey: params.params.groupKey,
    };
  }

  if (action === 'open_sos') {
    if (params.params?.sosEntry) {
      candidate = {
        type: 'quick_help_entry',
        entry: params.params.sosEntry,
      };
    } else {
      candidate = { type: 'quick_help' };
    }
  }

  if (action === 'open_gratitude_diary') {
    candidate = { type: 'gratitude_diary' };
  }

  if (action === 'open_therapy') {
    candidate = { type: 'therapy_list' };
  }

  if (action === 'open_therapy_topic' && params.params?.topicKey) {
    candidate = {
      type: 'therapy_topic',
      topicKey: params.params.topicKey,
    };
  }

  if (action === 'open_habits') {
    candidate = { type: 'habits_list' };
  }

  if (action === 'open_habit' && params.params?.habitKey) {
    candidate = {
      type: 'habit',
      habitKey: params.params.habitKey,
    };
  }

  return candidate ? parseAppNavigationTarget(candidate) : null;
}

export function buildLegacySuggestedChipActionPayload(
  target: AppNavigationTarget
): {
  action: LegacySuggestedChipAction;
  params?: LegacySuggestedChipActionParams;
} | null {
  switch (target.type) {
    case 'meditations_list':
      return { action: 'open_meditations' };
    case 'meditation_collection':
      return {
        action: 'open_meditations_collection',
        params: {
          collectionId: target.topicKey,
          source: 'chat',
        },
      };
    case 'meditation_track':
      return {
        action: 'open_meditation_track',
        params: {
          trackId: target.trackId,
          source: 'chat',
        },
      };
    case 'breath_practices_list':
      return {
        action: 'open_breath_practices',
        params: {
          source: 'chat',
        },
      };
    case 'breath_practice_group':
      return {
        action: 'open_breath_practices',
        params: {
          groupKey: target.groupKey,
          source: 'chat',
        },
      };
    case 'breath_practice':
      return {
        action: 'open_breath_practice',
        params: {
          practiceId: target.slug,
          groupKey: target.groupKey,
          source: 'chat',
        },
      };
    case 'quick_help':
      return {
        action: 'open_sos',
        params: {
          sosEntry: 'technique_picker',
          source: 'chat',
        },
      };
    case 'quick_help_entry':
      return {
        action: 'open_sos',
        params: {
          sosEntry: target.entry,
          source: 'chat',
        },
      };
    case 'gratitude_diary':
      return {
        action: 'open_gratitude_diary',
        params: { source: 'chat' },
      };
    case 'therapy_list':
      return {
        action: 'open_therapy',
        params: { source: 'chat' },
      };
    case 'therapy_topic':
      return {
        action: 'open_therapy_topic',
        params: {
          topicKey: target.topicKey,
          source: 'chat',
        },
      };
    case 'habits_list':
      return {
        action: 'open_habits',
        params: { source: 'chat' },
      };
    case 'habit':
      return {
        action: 'open_habit',
        params: {
          habitKey: target.habitKey,
          source: 'chat',
        },
      };
    default:
      return null;
  }
}

export function resolveTargetFromLegacyNotificationNavigation(
  navigation: LegacyNotificationNavigation
): AppNavigationTarget {
  switch (navigation.type) {
    case 'meditation_track':
      return {
        type: 'meditation_track',
        trackId: navigation.trackId,
      };
    case 'breath_practices':
      return { type: 'breath_practices_list' };
    case 'breath_practice':
      return {
        type: 'breath_practice',
        slug: navigation.slug,
        groupKey:
          navigation.slug === '4-7-8'
            ? 'sleep'
            : navigation.slug === 'box-breathing'
              ? 'popular'
              : undefined,
      };
    case 'gratitude_diary':
      return { type: 'gratitude_diary' };
    default:
      return { type: 'home' };
  }
}

export function buildLegacyNotificationNavigation(
  target: AppNavigationTarget
): LegacyNotificationNavigation | null {
  switch (target.type) {
    case 'home':
      return { type: 'home' };
    case 'meditation_track':
      return {
        type: 'meditation_track',
        trackId: target.trackId,
      };
    case 'breath_practices_list':
      return { type: 'breath_practices' };
    case 'breath_practice':
      return {
        type: 'breath_practice',
        slug: target.slug,
      };
    case 'breath_practice_group':
      return { type: 'breath_practices' };
    case 'gratitude_diary':
      return { type: 'gratitude_diary' };
    default:
      return null;
  }
}
