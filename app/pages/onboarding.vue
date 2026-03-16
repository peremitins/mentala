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
      class="relative z-10 flex h-full w-full items-center justify-center overflow-y-auto overflow-x-hidden overscroll-none px-4 py-6 sm:px-6"
    >
      <Transition v-bind="contentTransitionProps" mode="out-in" appear>
        <div
          v-if="!loading && currentStep"
          :key="currentStep"
          class="mx-auto flex w-full max-w-2xl flex-col gap-4"
        >
          <div
            v-if="showProgress"
            class="glass-deep rounded-[24px] px-4 py-3 text-sm text-foreground"
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
                  ? 'px-4 py-5 sm:px-6 sm:py-6'
                  : 'px-5 py-7 sm:px-8'
              )
            "
          >
            <div
              class="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/12 via-transparent to-transparent"
            ></div>

            <div
              :class="
                cn('relative', isCompactChoiceStep ? 'space-y-4' : 'space-y-6')
              "
            >
              <button
                v-if="showBack"
                type="button"
                class="inline-flex items-center gap-2 text-xs font-medium text-white/85 transition-colors hover:text-white"
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

              <div v-else-if="currentStep === 'reason'" class="space-y-3.5">
                <div class="space-y-2">
                  <h2 class="text-xl font-semibold text-foreground">
                    Что привело вас в Ментала?
                  </h2>
                </div>

                <div class="grid gap-2.5">
                  <button
                    v-for="option in reasonOptions"
                    :key="option.value"
                    type="button"
                    :aria-pressed="isReasonSelected(option.value)"
                    :class="
                      getCompactChoiceButtonClasses(
                        isReasonSelected(option.value)
                      )
                    "
                    @click="toggleReason(option.value)"
                  >
                    <span
                      class="max-w-full whitespace-normal text-left text-[15px] font-semibold leading-5 text-foreground"
                    >
                      {{ option.label }}
                    </span>
                    <span
                      class="ml-3 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300"
                      :class="
                        isReasonSelected(option.value)
                          ? 'border-white/70 bg-white/[0.16] text-white'
                          : 'border-white/24 bg-transparent text-transparent'
                      "
                    >
                      <IconCheck class="h-3.5 w-3.5" />
                    </span>
                  </button>
                </div>

                <Button
                  size="lg"
                  class="w-full"
                  :disabled="reasons.length === 0"
                  @click="goNext"
                >
                  Продолжить
                </Button>
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
                    @click="ageRange = option.value"
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
                    @click="gender = option.value"
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
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useMediaQuery, useStepper } from '@vueuse/core';
import { Button } from '@/app/components/ui/button';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import AssistantToneGrid from '@/app/components/settings/AssistantToneGrid.vue';
import { useViewportOrientation } from '@/app/composables/useViewportOrientation';
import { useAuthStore } from '@/app/stores/auth';
import { useToast } from '@/app/composables/useToast';
import { cn } from '@/app/lib/utils';
import { getOrientationMediaCandidates } from '@/app/utils/orientationMedia';
import type {
  AgeRange,
  Gender,
  OnboardingReason,
  OnboardingTone,
} from '@/shared/dto/onboarding';
import IconArrowLeft from '~icons/lucide/arrow-left';
import IconCheck from '~icons/lucide/check';

definePageMeta({
  layout: 'blank',
});

type StepKey =
  | 'welcome'
  | 'name'
  | 'reason'
  | 'age'
  | 'gender'
  | 'tone'
  | 'final';

interface StepOption<T> {
  value: T;
  label: string;
}

const INTERACTIVE_STEPS: StepKey[] = [
  'name',
  'reason',
  'age',
  'gender',
  'tone',
];

const BACKGROUND_INDEX_BY_STEP: Record<StepKey, number> = {
  welcome: 1,
  name: 2,
  reason: 3,
  age: 4,
  gender: 5,
  tone: 6,
  final: 1,
};

const auth = useAuthStore();
const { isPortraitMode } = useViewportOrientation();
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

const loading = ref(true);
const completing = ref(false);

const name = ref('');
const nameTouched = ref(false);
const reasons = ref<OnboardingReason[]>([]);
const gender = ref<Gender | null>(null);
const ageRange = ref<AgeRange>('unknown');
const tone = ref<OnboardingTone>('unknown');

const failedBackgrounds = ref<Set<string>>(new Set());

const stepper = useStepper([
  'welcome',
  'name',
  'reason',
  'age',
  'gender',
  'tone',
  'final',
]);

const currentStep = computed(() => stepper.current.value as StepKey);

const reasonOptions: StepOption<OnboardingReason>[] = [
  { value: 'stress', label: 'Справиться со стрессом' },
  { value: 'anxiety', label: 'Снизить тревожность' },
  { value: 'thoughts', label: 'Разобраться в мыслях' },
  { value: 'mood', label: 'Улучшить настроение' },
  { value: 'habits', label: 'Работать с привычками' },
  { value: 'support', label: 'Получить поддержку' },
  { value: 'other', label: 'Другое' },
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
const isCompactChoiceStep = computed(() => currentStep.value === 'reason');
const currentProgressStep = computed(() => {
  const index = INTERACTIVE_STEPS.indexOf(currentStep.value);
  return index >= 0 ? index + 1 : 0;
});
const progressPercent = computed(() => {
  if (!showProgress.value || totalProgressSteps === 0) return 0;
  return Math.round((currentProgressStep.value / totalProgressSteps) * 100);
});
const showBack = computed(() => currentStep.value !== 'welcome');

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

function getCompactChoiceButtonClasses(selected: boolean) {
  return cn(
    'group inline-flex w-full items-center justify-between rounded-[18px] border px-4 py-2.5 transition-colors duration-300',
    selected
      ? 'border-white/60 bg-white/[0.15] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]'
      : 'border-white/24 bg-black/10 hover:border-white/40 hover:bg-white/[0.06]'
  );
}

function isReasonSelected(value: OnboardingReason) {
  return reasons.value.includes(value);
}

function toggleReason(value: OnboardingReason) {
  // Сохраняем порядок выбора: первые ответы считаем более приоритетными для персонализации.
  reasons.value = isReasonSelected(value)
    ? reasons.value.filter((reasonValue) => reasonValue !== value)
    : [...reasons.value, value];
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

function goNext() {
  stepper.goToNext();
}

function goBack() {
  stepper.goToPrevious();
}

function handleNameNext() {
  nameTouched.value = true;

  if (!isNameValid.value) {
    useToast('Ошибка', 'Введите имя', 'error');
    return;
  }

  goNext();
}

async function completeOnboarding() {
  if (completing.value) return;

  if (
    !isNameValid.value ||
    reasons.value.length === 0 ||
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
          reasons: reasons.value,
          gender: gender.value,
          ageRange: ageRange.value,
          tone: tone.value,
        },
      },
    });

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
      await navigateTo('/');
      return;
    }

    name.value = auth.user.name || '';
    gender.value = auth.user.gender || null;
    ageRange.value =
      auth.user.ageRange === 'under_30' ||
      auth.user.ageRange === '30_45' ||
      auth.user.ageRange === '45_plus'
        ? auth.user.ageRange
        : 'unknown';
  } catch (error) {
    console.error('Не удалось загрузить онбординг:', error);
    useToast('Ошибка', 'Не удалось загрузить онбординг', 'error');
  } finally {
    loading.value = false;
  }
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
