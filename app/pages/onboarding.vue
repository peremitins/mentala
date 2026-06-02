<template>
  <div class="fixed inset-0 overflow-hidden bg-[#161b4b]">
    <div
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#2d316d_0%,#1c2055_48%,#12153b_100%)]"
    ></div>
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(119,104,255,0.18),transparent_44%),radial-gradient(circle_at_bottom,rgba(52,62,138,0.3),transparent_42%)]"
    ></div>

    <Transition v-bind="backgroundTransitionProps" mode="out-in" appear>
      <div
        v-if="currentBackgroundSrc"
        :key="currentBackgroundSrc"
        class="pointer-events-none absolute inset-0"
      >
        <img
          :src="currentBackgroundSrc"
          alt=""
          aria-hidden="true"
          class="onboarding-bg-media h-full w-full object-cover"
          :class="{ 'onboarding-bg-static': prefersReducedMotion }"
          loading="eager"
          decoding="async"
          @error="handleBackgroundError(currentBackgroundSrc)"
        />
      </div>
    </Transition>

    <div
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,26,0.28)_0%,rgba(7,9,26,0.48)_40%,rgba(4,6,18,0.78)_100%)]"
    ></div>
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_18%,rgba(3,5,18,0.24)_72%,rgba(3,5,18,0.46)_100%)]"
    ></div>

    <div
      :class="
        cn(
          'relative z-10 flex h-full w-full overflow-y-auto overflow-x-hidden overscroll-none px-4 sm:px-6',
          isCompactChoiceStep
            ? 'items-stretch justify-start'
            : 'items-center justify-center py-6'
        )
      "
      :style="compactStepViewportStyle"
    >
      <Transition v-bind="contentTransitionProps" mode="out-in" appear>
        <div
          v-if="!loading && currentStep"
          :key="currentStep"
          :class="
            cn(
              'mx-auto flex w-full max-w-2xl flex-col gap-4',
              isCompactChoiceStep ? 'min-h-0 flex-1' : ''
            )
          "
        >
          <div
            v-if="showProgress"
            class="glass-deep shrink-0 rounded-[24px] px-4 py-3 text-sm text-foreground"
          >
            <div class="flex items-center justify-between font-medium">
              <span
                >Шаг {{ currentProgressStep }} из {{ totalProgressSteps }}</span
              >
              <span>{{ progressPercent }}%</span>
            </div>
            <div
              class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15"
            >
              <div
                class="h-full rounded-full bg-white transition-all duration-500 ease-out"
                :style="{ width: `${progressPercent}%` }"
              ></div>
            </div>
          </div>

          <section
            :class="
              cn(
                'glass-deep relative overflow-hidden rounded-[28px]',
                isCompactChoiceStep
                  ? 'flex min-h-0 flex-1 flex-col px-4 py-5 sm:px-6 sm:py-6'
                  : 'px-5 py-7 sm:px-8'
              )
            "
          >
            <div
              class="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/12 via-transparent to-transparent"
            ></div>

            <div
              :class="
                cn(
                  'relative',
                  isCompactChoiceStep
                    ? 'flex min-h-0 flex-1 flex-col gap-4'
                    : 'space-y-6'
                )
              "
            >
              <button
                v-if="showBack"
                type="button"
                class="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-white/85 transition-colors hover:text-white"
                @click="goBack"
              >
                <IconArrowLeft class="h-4 w-4" />
                Назад
              </button>

              <div v-if="currentStep === 'welcome'" class="space-y-4">
                <div class="space-y-2">
                  <h1 class="text-xl font-semibold text-foreground sm:text-3xl">
                    Добро пожаловать в Ментала
                  </h1>
                  <p class="max-w-xl text-sm leading-6 text-white/88">
                    Место, где можно спокойно разобраться в себе и получить
                    поддержку в любой момент.
                  </p>
                </div>

                <Button size="lg" class="w-full" @click="goNext">Начать</Button>
              </div>

              <div v-else-if="currentStep === 'name'" class="space-y-4">
                <div class="space-y-2">
                  <h2 class="text-xl font-semibold text-foreground">
                    Как к вам обращаться?
                  </h2>
                </div>

                <Input
                  v-model="name"
                  type="text"
                  maxlength="40"
                  placeholder="Введите имя"
                  :show-clear-button="false"
                  @input="nameTouched = true"
                  @keydown.enter="handleNameNext"
                />

                <p
                  v-if="nameTouched && nameError"
                  class="text-xs font-medium text-destructive"
                >
                  {{ nameError }}
                </p>

                <Button
                  size="lg"
                  class="w-full"
                  :disabled="!isNameValid"
                  @click="handleNameNext"
                >
                  Продолжить
                </Button>
              </div>

              <div
                v-else-if="currentStep === 'topics'"
                class="flex min-h-0 flex-1 flex-col gap-4"
              >
                <div class="shrink-0 space-y-2">
                  <div class="flex items-start justify-between gap-3">
                    <h2 class="text-xl font-semibold text-foreground">
                      Что сейчас важно для вас?
                    </h2>
                    <span
                      class="shrink-0 rounded-full border border-white/14 bg-white/[0.08] px-2.5 py-1 text-xs font-semibold text-white/80"
                    >
                      {{ selectedTopics.length }}/{{ MAX_SELECTED_TOPICS }}
                    </span>
                  </div>
                  <p class="max-w-xl text-sm leading-6 text-white/82">
                    Выберите до 5 тем, с которых хотите начать. Это поможет
                    Ментала точнее подбирать поддержку.
                  </p>
                </div>

                <div
                  class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]"
                >
                  <div
                    v-for="group in topicGroups"
                    :key="group.title"
                    class="space-y-2.5"
                  >
                    <p class="text-sm font-semibold text-white/90">
                      {{ group.title }}
                    </p>

                    <div class="grid gap-2 sm:grid-cols-2">
                      <button
                        v-for="option in group.items"
                        :key="getTopicIdentity(option)"
                        type="button"
                        :aria-pressed="isTopicSelected(option)"
                        :class="
                          getTopicChoiceButtonClasses(isTopicSelected(option))
                        "
                        @click="toggleTopic(option)"
                      >
                        <span class="text-xl leading-none">
                          {{ option.emoji }}
                        </span>
                        <span class="min-w-0 flex-1 text-left">
                          <span
                            class="block text-sm font-semibold leading-5 text-foreground"
                          >
                            {{ option.label }}
                          </span>
                          <span
                            class="mt-0.5 line-clamp-2 block text-xs leading-4 text-white/68"
                          >
                            {{ option.description }}
                          </span>
                        </span>
                        <span
                          class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300"
                          :class="
                            isTopicSelected(option)
                              ? 'border-white/70 bg-white/[0.16] text-white'
                              : 'border-white/24 bg-transparent text-transparent'
                          "
                        >
                          <IconCheck class="h-3.5 w-3.5" />
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="shrink-0 border-t border-white/10 pt-3">
                  <Button
                    size="lg"
                    class="w-full"
                    :disabled="!isTopicSelectionValid"
                    @click="goNext"
                  >
                    Продолжить
                  </Button>
                </div>
              </div>

              <div v-else-if="currentStep === 'reminders'" class="space-y-4">
                <div class="space-y-2">
                  <h2 class="text-xl font-semibold text-foreground">
                    Включить поддержку в течение дня?
                  </h2>
                  <p class="max-w-xl text-sm leading-6 text-white/88">
                    Получайте короткие напоминания по выбранным темам. Они
                    помогут закреплять полезные привычки, сохранять фокус и
                    двигаться вперёд.
                  </p>
                </div>

                <div class="grid gap-2.5">
                  <div
                    v-for="topic in selectedTopicSummaries"
                    :key="getTopicIdentity(topic)"
                    class="inline-flex items-center gap-2 rounded-[16px] border border-white/16 bg-black/10 px-3 py-2 text-sm font-medium text-white/86"
                  >
                    <span>{{ topic.emoji }}</span>
                    <span>{{ topic.label }}</span>
                  </div>
                </div>

                <div class="grid gap-2.5">
                  <Button
                    size="lg"
                    class="relative w-full"
                    :disabled="pushPermissionLoading"
                    @click="handleEnableReminders"
                  >
                    <ButtonLoader v-if="pushPermissionLoading" />
                    <span :class="pushPermissionLoading ? 'invisible' : ''">
                      Включить уведомления
                    </span>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    class="w-full"
                    :disabled="pushPermissionLoading"
                    @click="handleSkipReminders"
                  >
                    Не сейчас
                  </Button>
                </div>
              </div>

              <div v-else-if="currentStep === 'age'" class="space-y-4">
                <div class="space-y-2">
                  <h2 class="text-xl font-semibold text-foreground">
                    Сколько вам лет?
                  </h2>
                </div>

                <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <button
                    v-for="option in ageOptions"
                    :key="option.value"
                    type="button"
                    :aria-pressed="ageRange === option.value"
                    :class="
                      getChoiceButtonClasses(ageRange === option.value, {
                        centered: true,
                      })
                    "
                    @click="selectAge(option.value)"
                  >
                    <span class="text-sm font-semibold text-foreground">
                      {{ option.label }}
                    </span>
                  </button>
                </div>

                <Button
                  size="lg"
                  class="w-full"
                  :disabled="ageRange === 'unknown'"
                  @click="goNext"
                >
                  Продолжить
                </Button>
              </div>

              <div v-else-if="currentStep === 'gender'" class="space-y-4">
                <div class="space-y-2">
                  <h2 class="text-xl font-semibold text-foreground">
                    Укажите ваш пол
                  </h2>
                </div>

                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    v-for="option in genderOptions"
                    :key="option.value"
                    type="button"
                    :aria-pressed="gender === option.value"
                    :class="
                      getChoiceButtonClasses(gender === option.value, {
                        centered: true,
                      })
                    "
                    @click="selectGender(option.value)"
                  >
                    <span class="text-sm font-semibold text-foreground">
                      {{ option.label }}
                    </span>
                  </button>
                </div>

                <Button
                  size="lg"
                  class="w-full"
                  :disabled="!gender"
                  @click="goNext"
                >
                  Продолжить
                </Button>
              </div>

              <div v-else-if="currentStep === 'tone'" class="space-y-4">
                <div class="space-y-2">
                  <h2 class="text-xl font-semibold text-foreground">
                    Какой стиль поддержки вам ближе?
                  </h2>
                </div>

                <AssistantToneGrid v-model="tone" label="" />

                <Button
                  size="lg"
                  class="w-full"
                  :disabled="tone === 'unknown'"
                  @click="goNext"
                >
                  Продолжить
                </Button>
              </div>

              <div v-else class="space-y-4">
                <div class="space-y-2">
                  <h2 class="text-xl font-semibold text-foreground">
                    Ментала готова
                  </h2>
                  <p class="max-w-xl text-sm leading-6 text-white/88">
                    Теперь можно перейти в приложение и начать с того, что важно
                    именно вам.
                  </p>
                </div>

                <Button
                  size="lg"
                  class="relative w-full"
                  :disabled="completing"
                  @click="completeOnboarding"
                >
                  <ButtonLoader v-if="completing" />
                  <span :class="completing ? 'invisible' : ''">
                    Перейти в приложение
                  </span>
                </Button>
              </div>
            </div>
          </section>

          <PushPermissionDeniedDialog
            :open="pushPermissionGate.showPushDeniedModal.value"
            @update:open="pushPermissionGate.setPushDeniedModalOpen"
            @open-settings="handleOpenPushSystemSettings"
          />
          <WebPushPermissionDialog
            :open="pushPermissionGate.showWebPushPermissionDialog.value"
            :reason="pushPermissionGate.webPushPermissionDialogReason.value"
            @update:open="pushPermissionGate.setWebPushPermissionDialogOpen"
          />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMediaQuery, useStepper } from '@vueuse/core';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/app/components/ui/button';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import AssistantToneGrid from '@/app/components/settings/AssistantToneGrid.vue';
import PushPermissionDeniedDialog from '@/app/components/notifications/PushPermissionDeniedDialog.vue';
import WebPushPermissionDialog from '@/app/components/notifications/WebPushPermissionDialog.vue';
import { useViewportOrientation } from '@/app/composables/useViewportOrientation';
import { usePushPermissionGate } from '@/app/composables/usePushPermissionGate';
import { usePushRecovery } from '@/app/composables/usePushRecovery';
import { useAuthStore } from '@/app/stores/auth';
import { useToast } from '@/app/composables/useToast';
import { useHaptics } from '@/app/composables/useHaptics';
import { cn } from '@/app/lib/utils';
import { getOrientationMediaCandidates } from '@/app/utils/orientationMedia';
import {
  getPersistentItem,
  removePersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import { HABITS_CATALOG } from '@/app/lib/habitsCatalog';
import {
  getOnboardingTopicIdentity,
  type OnboardingSelectedTopic,
} from '@/shared/constants/onboardingTopics';
import {
  normalizeOnboardingSelectedTopics,
  type AgeRange,
  type Gender,
  type OnboardingTone,
} from '@/shared/dto/onboarding';
import IconArrowLeft from '~icons/lucide/arrow-left';
import IconCheck from '~icons/lucide/check';

definePageMeta({
  layout: 'blank',
});

type StepKey =
  | 'welcome'
  | 'name'
  | 'topics'
  | 'reminders'
  | 'age'
  | 'gender'
  | 'tone'
  | 'final';

interface StepOption<T> {
  value: T;
  label: string;
}

interface TopicOption {
  kind: OnboardingSelectedTopic['kind'];
  entityKey: OnboardingSelectedTopic['entityKey'];
  label: string;
  description: string;
  emoji: string;
}

interface TopicGroup {
  title: string;
  items: TopicOption[];
}

interface OnboardingDraft {
  userId: number;
  step: StepKey;
  name: string;
  selectedTopics: OnboardingSelectedTopic[];
  gender: Gender | null;
  ageRange: AgeRange;
  tone: OnboardingTone;
  updatedAt: number;
}

const MAX_SELECTED_TOPICS = 5;
const ONBOARDING_DRAFT_STORAGE_KEY = 'onboarding.welcome_setup.v1';

const INTERACTIVE_STEPS: StepKey[] = [
  'name',
  'topics',
  'reminders',
  'age',
  'gender',
  'tone',
];
const ONBOARDING_STEPS: StepKey[] = [
  'welcome',
  'name',
  'topics',
  'reminders',
  'age',
  'gender',
  'tone',
  'final',
];

const BACKGROUND_INDEX_BY_STEP: Record<StepKey, number> = {
  welcome: 1,
  name: 2,
  topics: 3,
  reminders: 4,
  age: 5,
  gender: 6,
  tone: 7,
  final: 1,
};

const auth = useAuthStore();
const { isPortraitMode } = useViewportOrientation();
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
const pushPermissionGate = usePushPermissionGate();
const pushRecovery = usePushRecovery();
const { triggerLight } = useHaptics();
const isNativeIos = computed(
  () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
);

const loading = ref(true);
const completing = ref(false);
const pushPermissionLoading = ref(false);

const name = ref('');
const nameTouched = ref(false);
const selectedTopics = ref<OnboardingSelectedTopic[]>([]);
const gender = ref<Gender | null>(null);
const ageRange = ref<AgeRange>('unknown');
const tone = ref<OnboardingTone>('unknown');

const failedBackgrounds = ref<Set<string>>(new Set());
let draftHydrated = false;
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;

const stepper = useStepper(ONBOARDING_STEPS);

const currentStep = computed(() => stepper.current.value as StepKey);

const topicGroups: TopicGroup[] = [
  {
    title: 'Эмоциональное состояние',
    items: THERAPY_TOPICS.map((topic) => ({
      kind: 'therapy' as const,
      entityKey: topic.key,
      label: topic.name,
      description: topic.description,
      emoji: topic.emoji,
    })),
  },
  {
    title: 'Полезные привычки',
    items: HABITS_CATALOG.filter((habit) => habit.intent === 'build').map(
      (habit) => ({
        kind: 'habits' as const,
        entityKey: habit.habitKey,
        label: habit.name,
        description: habit.description,
        emoji: habit.emoji,
      })
    ),
  },
  {
    title: 'От чего хотите отказаться',
    items: HABITS_CATALOG.filter((habit) => habit.intent === 'quit').map(
      (habit) => ({
        kind: 'habits' as const,
        entityKey: habit.habitKey,
        label: habit.name,
        description: habit.description,
        emoji: habit.emoji,
      })
    ),
  },
];

const genderOptions: StepOption<Gender>[] = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
];

const ageOptions: StepOption<AgeRange>[] = [
  { value: 'under_30', label: 'До 30' },
  { value: '30_45', label: '30–45' },
  { value: '45_plus', label: '45+' },
];

const nameError = computed(() => {
  const trimmed = name.value.trim();
  if (!trimmed) return 'Имя не может быть пустым';
  if (trimmed.length > 40) return 'Максимум 40 символов';
  return '';
});

const isNameValid = computed(() => nameError.value === '');
const totalProgressSteps = INTERACTIVE_STEPS.length;
const showProgress = computed(() =>
  INTERACTIVE_STEPS.includes(currentStep.value)
);
const isCompactChoiceStep = computed(() => currentStep.value === 'topics');
const compactStepViewportStyle = computed(() => {
  if (!isCompactChoiceStep.value) {
    return undefined;
  }

  // На iOS WKWebView иногда отдаёт env(safe-area-inset-top)=0, хотя статус-бар
  // визуально наложен поверх WebView. Поэтому для native iOS держим минимальный
  // системный зазор, а для web/Android используем общий CSS inset проекта.
  const topInset = isNativeIos.value
    ? 'max(var(--safe-area-inset-top), 44px)'
    : 'var(--safe-area-inset-top)';

  return {
    paddingTop: `calc(${topInset} + 1rem)`,
    paddingBottom: 'calc(var(--safe-area-inset-bottom) + 1rem)',
  };
});
const currentProgressStep = computed(() => {
  const index = INTERACTIVE_STEPS.indexOf(currentStep.value);
  return index >= 0 ? index + 1 : 0;
});
const progressPercent = computed(() => {
  if (!showProgress.value || totalProgressSteps === 0) return 0;
  return Math.round((currentProgressStep.value / totalProgressSteps) * 100);
});
const showBack = computed(() => currentStep.value !== 'welcome');
const isTopicSelectionValid = computed(
  () =>
    selectedTopics.value.length > 0 &&
    selectedTopics.value.length <= MAX_SELECTED_TOPICS
);
const selectedTopicSummaries = computed(() => {
  const optionByIdentity = new Map<string, TopicOption>();

  for (const group of topicGroups) {
    for (const option of group.items) {
      optionByIdentity.set(getTopicIdentity(option), option);
    }
  }

  return selectedTopics.value
    .map((topic) => optionByIdentity.get(getTopicIdentity(topic)))
    .filter((topic): topic is TopicOption => Boolean(topic));
});

const currentBackgroundBasePath = computed(() => {
  if (!currentStep.value) return '';
  const backgroundIndex = BACKGROUND_INDEX_BY_STEP[currentStep.value];
  return `/onboarding/welcome/${backgroundIndex}.webp`;
});

const currentBackgroundCandidates = computed(() =>
  getOrientationMediaCandidates(currentBackgroundBasePath.value, {
    portraitFirst: isPortraitMode.value,
  })
);

const currentBackgroundSrc = computed(() => {
  return (
    currentBackgroundCandidates.value.find(
      (candidate) => !failedBackgrounds.value.has(candidate)
    ) || ''
  );
});

const backgroundTransitionProps = computed(() => {
  if (prefersReducedMotion.value) {
    return {
      enterActiveClass: 'transition-opacity duration-0',
      enterFromClass: 'opacity-100',
      enterToClass: 'opacity-100',
      leaveActiveClass: 'transition-opacity duration-0',
      leaveFromClass: 'opacity-100',
      leaveToClass: 'opacity-100',
    };
  }

  return {
    enterActiveClass: 'transition-opacity duration-700 ease-out',
    enterFromClass: 'opacity-0',
    enterToClass: 'opacity-100',
    leaveActiveClass: 'transition-opacity duration-500 ease-in',
    leaveFromClass: 'opacity-100',
    leaveToClass: 'opacity-0',
  };
});

// Единый fade для прогресса и карточки убирает рассинхрон между блоками.
const contentTransitionProps = computed(() => {
  if (prefersReducedMotion.value) {
    return {
      enterActiveClass: 'transition-opacity duration-0',
      enterFromClass: 'opacity-100',
      enterToClass: 'opacity-100',
      leaveActiveClass: 'transition-opacity duration-0',
      leaveFromClass: 'opacity-100',
      leaveToClass: 'opacity-100',
    };
  }

  return {
    enterActiveClass: 'transition-opacity duration-700 ease-out',
    enterFromClass: 'opacity-0',
    enterToClass: 'opacity-100',
    leaveActiveClass: 'transition-opacity duration-500 ease-in',
    leaveFromClass: 'opacity-100',
    leaveToClass: 'opacity-0',
  };
});

function getChoiceButtonClasses(
  selected: boolean,
  options: { centered?: boolean } = {}
) {
  return cn(
    'group flex min-h-14 w-full items-center rounded-[22px] border px-4 py-4 transition-all duration-300',
    options.centered ? 'justify-center text-center' : 'justify-start text-left',
    selected
      ? 'border-white/60 bg-white/[0.15] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_20px_44px_rgba(7,10,31,0.25)]'
      : 'border-white/24 bg-black/10 hover:border-white/40 hover:bg-white/[0.06]'
  );
}

function getTopicChoiceButtonClasses(selected: boolean) {
  return cn(
    'group flex min-h-[64px] w-full items-center gap-3 rounded-[18px] border px-3 py-2.5 transition-colors duration-300',
    selected
      ? 'border-white/60 bg-white/[0.15] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]'
      : 'border-white/24 bg-black/10 hover:border-white/40 hover:bg-white/[0.06]'
  );
}

function getTopicIdentity(topic: {
  kind: OnboardingSelectedTopic['kind'];
  entityKey: string;
}) {
  return getOnboardingTopicIdentity(topic);
}

function isTopicSelected(topic: TopicOption | OnboardingSelectedTopic) {
  const identity = getTopicIdentity(topic);
  return selectedTopics.value.some(
    (selectedTopic) => getTopicIdentity(selectedTopic) === identity
  );
}

function toggleTopic(topic: TopicOption) {
  const identity = getTopicIdentity(topic);
  if (isTopicSelected(topic)) {
    void triggerLight();
    selectedTopics.value = selectedTopics.value.filter(
      (selectedTopic) => getTopicIdentity(selectedTopic) !== identity
    );
    return;
  }

  if (selectedTopics.value.length >= MAX_SELECTED_TOPICS) {
    useToast('Лимит выбора', 'Можно выбрать до 5 тем', 'info');
    return;
  }

  void triggerLight();
  selectedTopics.value = [
    ...selectedTopics.value,
    {
      kind: topic.kind,
      entityKey: topic.entityKey,
    } as OnboardingSelectedTopic,
  ];
}

function preloadBackgrounds() {
  if (typeof Image === 'undefined') return;

  const backgroundIndexes = Array.from(
    new Set(Object.values(BACKGROUND_INDEX_BY_STEP))
  );

  for (const backgroundIndex of backgroundIndexes) {
    const basePath = `/onboarding/welcome/${backgroundIndex}.webp`;
    const candidates = getOrientationMediaCandidates(basePath, {
      portraitFirst: isPortraitMode.value,
    });

    for (const candidate of candidates) {
      if (!candidate) continue;

      const image = new Image();
      image.decoding = 'async';
      image.src = candidate;
    }
  }
}

function handleBackgroundError(src: string) {
  if (!src || failedBackgrounds.value.has(src)) return;

  failedBackgrounds.value = new Set([...failedBackgrounds.value, src]);
}

function isStepKey(value: unknown): value is StepKey {
  return (
    typeof value === 'string' && ONBOARDING_STEPS.includes(value as StepKey)
  );
}

function isGender(value: unknown): value is Gender {
  return value === 'male' || value === 'female';
}

function isAgeRange(value: unknown): value is AgeRange {
  return (
    value === 'under_30' ||
    value === '30_45' ||
    value === '45_plus' ||
    value === 'unknown'
  );
}

function isOnboardingTone(value: unknown): value is OnboardingTone {
  return (
    value === 'gentle' ||
    value === 'balanced' ||
    value === 'uplifting' ||
    value === 'direct' ||
    value === 'unknown'
  );
}

function getOnboardingDraftStorageKey() {
  return `${ONBOARDING_DRAFT_STORAGE_KEY}.${auth.user?.id ?? 'anonymous'}`;
}

function resolveRestorableStep(value: unknown): StepKey {
  const requestedStep = isStepKey(value) ? value : 'welcome';
  const requestedIndex = ONBOARDING_STEPS.indexOf(requestedStep);

  if (
    requestedIndex >= ONBOARDING_STEPS.indexOf('topics') &&
    !isNameValid.value
  ) {
    return 'name';
  }

  if (
    requestedIndex >= ONBOARDING_STEPS.indexOf('reminders') &&
    !isTopicSelectionValid.value
  ) {
    return 'topics';
  }

  if (
    requestedIndex >= ONBOARDING_STEPS.indexOf('gender') &&
    ageRange.value === 'unknown'
  ) {
    return 'age';
  }

  if (requestedIndex >= ONBOARDING_STEPS.indexOf('tone') && !gender.value) {
    return 'gender';
  }

  if (
    requestedIndex >= ONBOARDING_STEPS.indexOf('final') &&
    tone.value === 'unknown'
  ) {
    return 'tone';
  }

  return requestedStep;
}

function buildOnboardingDraft(
  step: StepKey = currentStep.value
): OnboardingDraft | null {
  const userId = Number(auth.user?.id);
  if (!Number.isFinite(userId)) {
    return null;
  }

  return {
    userId,
    step,
    name: name.value,
    selectedTopics: selectedTopics.value,
    gender: gender.value,
    ageRange: ageRange.value,
    tone: tone.value,
    updatedAt: Date.now(),
  };
}

async function persistOnboardingDraft(step: StepKey = currentStep.value) {
  if (!draftHydrated || auth.user?.onboarding?.welcome) {
    return;
  }

  const draft = buildOnboardingDraft(step);
  if (!draft) {
    return;
  }

  await setPersistentItem(
    getOnboardingDraftStorageKey(),
    JSON.stringify(draft)
  );
}

function scheduleOnboardingDraftSave() {
  if (!draftHydrated) {
    return;
  }

  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
  }

  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null;
    void persistOnboardingDraft();
  }, 120);
}

async function clearOnboardingDraft() {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }

  await removePersistentItem(getOnboardingDraftStorageKey());
}

async function restoreOnboardingDraft() {
  const rawDraft = await getPersistentItem(getOnboardingDraftStorageKey());
  if (!rawDraft) {
    return;
  }

  let parsedDraft: Partial<OnboardingDraft> | null = null;
  try {
    parsedDraft = JSON.parse(rawDraft);
  } catch {
    await removePersistentItem(getOnboardingDraftStorageKey());
    return;
  }

  if (!parsedDraft || parsedDraft.userId !== auth.user?.id) {
    await removePersistentItem(getOnboardingDraftStorageKey());
    return;
  }

  if (typeof parsedDraft.name === 'string') {
    name.value = parsedDraft.name.slice(0, 40);
  }

  selectedTopics.value = normalizeOnboardingSelectedTopics(
    parsedDraft.selectedTopics
  );
  gender.value = isGender(parsedDraft.gender) ? parsedDraft.gender : null;
  ageRange.value = isAgeRange(parsedDraft.ageRange)
    ? parsedDraft.ageRange
    : 'unknown';
  tone.value = isOnboardingTone(parsedDraft.tone)
    ? parsedDraft.tone
    : 'unknown';

  stepper.goTo(resolveRestorableStep(parsedDraft.step));
}

function goNext(expectedStep?: StepKey) {
  if (typeof expectedStep === 'string' && currentStep.value !== expectedStep) {
    return;
  }

  void triggerLight();
  stepper.goToNext();
}

function goBack() {
  stepper.goToPrevious();
}

function selectAge(value: AgeRange) {
  void triggerLight();
  ageRange.value = value;
}

function selectGender(value: Gender) {
  void triggerLight();
  gender.value = value;
}

function handleNameNext() {
  nameTouched.value = true;

  if (!isNameValid.value) {
    useToast('Ошибка', 'Введите имя', 'error');
    return;
  }

  goNext();
}

function handleSkipReminders() {
  // Откладываем показ recovery-диалога до следующего холодного запуска.
  pushRecovery.deferToNextLaunch();
  goNext();
}

async function handleEnableReminders() {
  if (pushPermissionLoading.value) return;

  pushPermissionLoading.value = true;
  try {
    await persistOnboardingDraft('reminders');
    const enabled = await pushPermissionGate.ensureAppPushEnabled({
      onGrantedFromSettings: async () => {
        goNext('reminders');
      },
    });
    if (enabled) {
      goNext('reminders');
    }
  } finally {
    pushPermissionLoading.value = false;
  }
}

async function handleOpenPushSystemSettings() {
  await pushPermissionGate.openSystemSettings();
}

async function completeOnboarding() {
  if (completing.value) return;

  if (
    !isNameValid.value ||
    !isTopicSelectionValid.value ||
    !gender.value ||
    ageRange.value === 'unknown' ||
    tone.value === 'unknown'
  ) {
    useToast('Ошибка', 'Заполните все шаги онбординга', 'error');
    return;
  }

  completing.value = true;

  try {
    await useAPI('/api/user/onboarding/complete', {
      method: 'POST',
      body: {
        flow: 'welcome_setup',
        data: {
          name: name.value.trim(),
          selectedTopics: selectedTopics.value,
          gender: gender.value,
          ageRange: ageRange.value,
          tone: tone.value,
        },
      },
    });

    draftHydrated = false;
    await clearOnboardingDraft();
    await auth.me();
    await navigateTo('/');
  } catch (error: any) {
    const payload = error?.data || error?.response?._data || {};
    const message = payload?.message || 'Не удалось завершить онбординг';
    useToast('Ошибка', String(message), 'error');
  } finally {
    completing.value = false;
  }
}

watch(
  isPortraitMode,
  () => {
    preloadBackgrounds();
  },
  { immediate: true }
);

watch(currentBackgroundBasePath, () => {
  failedBackgrounds.value = new Set();
});

watch(
  [name, selectedTopics, gender, ageRange, tone, currentStep],
  () => {
    scheduleOnboardingDraftSave();
  },
  { deep: true }
);

onMounted(async () => {
  try {
    if (!auth.user) {
      await auth.me();
    }

    if (!auth.user) {
      await navigateTo('/auth');
      return;
    }

    if (auth.user.onboarding?.welcome) {
      await clearOnboardingDraft();
      await navigateTo('/');
      return;
    }

    name.value = auth.user.name || '';
    gender.value =
      auth.user.gender === 'male' || auth.user.gender === 'female'
        ? auth.user.gender
        : null;
    ageRange.value =
      auth.user.ageRange === 'under_30' ||
      auth.user.ageRange === '30_45' ||
      auth.user.ageRange === '45_plus'
        ? auth.user.ageRange
        : 'unknown';

    await restoreOnboardingDraft();
    draftHydrated = true;
  } catch (error) {
    console.error('Не удалось загрузить онбординг:', error);
    useToast('Ошибка', 'Не удалось загрузить онбординг', 'error');
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }

  void persistOnboardingDraft();
});
</script>

<style scoped>
.onboarding-bg-media {
  animation: onboarding-bg-drift 18s ease-in-out infinite alternate;
}

.onboarding-bg-static {
  animation: none;
}

@keyframes onboarding-bg-drift {
  from {
    transform: scale(1.02) translate3d(0, 0, 0);
  }

  to {
    transform: scale(1.07) translate3d(0, -1.5%, 0);
  }
}
</style>
