<template>
  <div class="min-h-dvh px-4 py-6 sm:px-6 flex items-center justify-center">
    <Transition
      mode="out-in"
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-3"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div
          class="glass-deep rounded-2xl px-4 py-3 text-sm text-foreground transition-all duration-300 ease-out"
          :class="
            showProgress
              ? 'opacity-100 translate-y-0'
              : 'invisible pointer-events-none opacity-0 -translate-y-2'
          "
        >
          <div class="flex items-center justify-between">
            <span
              >Шаг {{ currentProgressStep }} из {{ totalProgressSteps }}</span
            >
            <span>{{ progressPercent }}%</span>
          </div>
          <div
            class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40"
          >
            <div
              class="h-full rounded-full bg-primary-ui transition-all duration-500"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
        </div>

        <section
          :key="currentStep"
          class="glass-deep relative overflow-hidden rounded-3xl px-6 py-8 sm:px-10"
        >
          <div
            class="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent"
          ></div>

          <div class="relative space-y-6">
            <button
              v-if="showBack"
              type="button"
              class="inline-flex items-center gap-2 text-xs text-foreground transition-colors hover:text-foreground"
              @click="goBack"
            >
              <IconArrowLeft class="h-4 w-4" />
              Назад
            </button>

            <div v-if="currentStep === 'welcome'" class="space-y-4">
              <div class="space-y-2">
                <h1 class="text-2xl font-semibold text-foreground sm:text-3xl">
                  Добро пожаловать в Mentala
                </h1>
                <p class="text-sm text-foreground">
                  Давай быстро настроим приложение под тебя. Это займёт меньше
                  минуты.
                </p>
              </div>
              <Button size="lg" class="w-full" @click="goNext"> Начать </Button>
            </div>

            <div v-else-if="currentStep === 'name'" class="space-y-4">
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-foreground">
                  Как к вам обращаться?
                </h2>
                <p class="text-sm text-foreground">
                  Можно имя или никнейм. Как вам комфортно.
                </p>
              </div>
              <Input
                v-model="name"
                type="text"
                maxlength="40"
                placeholder="Имя или никнейм"
                :show-clear-button="false"
                @input="nameTouched = true"
                @keydown.enter="handleNameNext"
              />
              <p
                v-if="nameTouched && nameError"
                class="text-xs text-destructive"
              >
                {{ nameError }}
              </p>
              <Button
                size="lg"
                class="w-full"
                :disabled="!isNameValid"
                @click="handleNameNext"
              >
                Далее
              </Button>
            </div>

            <div v-else-if="currentStep === 'gender'" class="space-y-4">
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-foreground">
                  Укажите ваш пол
                </h2>
                <p class="text-sm text-foreground">
                  Это нужно для корректных обращений в текстах.
                </p>
              </div>
              <ToggleButtonGroup
                v-model="gender"
                :options="genderOptions"
                layout="flex"
                size="lg"
                variant="outline"
                item-max-width="200px"
              />
              <Button
                size="lg"
                class="w-full"
                :disabled="!gender"
                @click="goNext"
              >
                Далее
              </Button>
            </div>

            <div v-else-if="currentStep === 'age'" class="space-y-4">
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-foreground">
                  Сколько вам лет?
                </h2>
                <p class="text-sm text-foreground">
                  Это поможет тоньше настроить рекомендации.
                </p>
              </div>
              <ToggleButtonGroup
                v-model="ageRange"
                :options="ageOptions"
                layout="grid"
                :grid-cols="3"
                size="md"
                variant="outline"
                full-width
              />
              <div class="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="lg"
                  class="w-full"
                  :disabled="ageRange === 'unknown'"
                  @click="goNext"
                >
                  Далее
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  class="w-full"
                  @click="skipAge"
                >
                  Пропустить
                </Button>
              </div>
            </div>

            <div v-else-if="currentStep === 'tone'" class="space-y-4">
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-foreground">
                  Какой тон общения вам ближе?
                </h2>
                <p class="text-sm text-foreground">
                  Этот тон применяется к ассистенту и уведомлениям.
                </p>
              </div>
              <ToggleButtonGroup
                v-model="tone"
                :options="toneOptions"
                layout="grid"
                :grid-cols="2"
                size="md"
                variant="outline"
                full-width
              />
              <div class="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="lg"
                  class="w-full"
                  :disabled="tone === 'unknown'"
                  @click="goNext"
                >
                  Далее
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  class="w-full"
                  @click="skipTone"
                >
                  Пропустить
                </Button>
              </div>
            </div>

            <div v-else class="space-y-4">
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-foreground">
                  Готово, {{ finalName }}
                </h2>
                <p class="text-sm text-foreground">
                  Mentala настроена под вас. Можно начинать.
                </p>
              </div>
              <Button
                size="lg"
                class="w-full"
                :disabled="completing"
                @click="completeOnboarding"
              >
                {{ completing ? 'Сохраняем...' : 'Перейти в приложение' }}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useStepper } from '@vueuse/core';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/shadcn/input';
import ToggleButtonGroup from '@/app/components/ui/ToggleButtonGroup.vue';
import PageLoader from '@/app/components/ui/PageLoader.vue';
import { useAuthStore } from '@/app/stores/auth';
import { useToast } from '@/app/composables/useToast';
import type { AgeRange, Gender, OnboardingTone } from '@/shared/dto/onboarding';
import IconArrowLeft from '~icons/lucide/arrow-left';

definePageMeta({
  layout: 'blank',
});

type StepKey = 'welcome' | 'name' | 'gender' | 'age' | 'tone' | 'final';

const auth = useAuthStore();
const loading = ref(true);
const completing = ref(false);

const name = ref('');
const nameTouched = ref(false);
const gender = ref<Gender | null>(null);
const ageRange = ref<AgeRange>('unknown');
const tone = ref<OnboardingTone>('unknown');

const stepper = useStepper([
  'welcome',
  'name',
  'gender',
  'age',
  'tone',
  'final',
]);

const currentStep = computed(() => stepper.current.value as StepKey);
const optionalSteps: StepKey[] = ['age', 'tone'];
const skippedSteps = ref<Set<StepKey>>(new Set());

const genderOptions = [
  { value: 'male' as Gender, label: 'Мужской' },
  { value: 'female' as Gender, label: 'Женский' },
];

const ageOptions = [
  { value: 'under_30' as AgeRange, label: 'До 30' },
  { value: '30_45' as AgeRange, label: '30–45' },
  { value: '45_plus' as AgeRange, label: '45+' },
];

const toneOptions = [
  { value: 'delicate' as OnboardingTone, label: 'Деликатный' },
  { value: 'neutral' as OnboardingTone, label: 'Нейтральный' },
  { value: 'uplifting' as OnboardingTone, label: 'Воодушевляющий' },
  { value: 'resolute' as OnboardingTone, label: 'Решительный' },
  { value: 'demanding' as OnboardingTone, label: 'Требовательный' },
];

const nameError = computed(() => {
  const trimmed = name.value.trim();
  if (!trimmed) return 'Имя не может быть пустым';
  if (trimmed.length > 40) return 'Максимум 40 символов';
  return '';
});
const isNameValid = computed(() => nameError.value === '');
const finalName = computed(() => name.value.trim() || 'друг');

const progressSteps = computed(() => {
  const optional = optionalSteps.filter(
    (step) => !skippedSteps.value.has(step) || step === currentStep.value
  );
  return ['name', 'gender', ...optional] as StepKey[];
});

const showProgress = computed(() =>
  progressSteps.value.includes(currentStep.value)
);
const currentProgressStep = computed(() => {
  const index = progressSteps.value.indexOf(currentStep.value);
  return index >= 0 ? index + 1 : 0;
});
const totalProgressSteps = computed(() => progressSteps.value.length);
const progressPercent = computed(() => {
  if (!showProgress.value || totalProgressSteps.value === 0) return 0;
  return Math.round(
    (currentProgressStep.value / totalProgressSteps.value) * 100
  );
});

const showBack = computed(() => currentStep.value !== 'welcome');

function goNext() {
  stepper.goToNext();
}

function goBack() {
  stepper.goToPrevious();
}

function markSkipped(step: StepKey) {
  if (skippedSteps.value.has(step)) return;
  skippedSteps.value = new Set([...skippedSteps.value, step]);
}

function unskip(step: StepKey) {
  if (!skippedSteps.value.has(step)) return;
  const next = new Set(skippedSteps.value);
  next.delete(step);
  skippedSteps.value = next;
}

function handleNameNext() {
  nameTouched.value = true;
  if (!isNameValid.value) {
    useToast('Ошибка', 'Введите имя', 'error');
    return;
  }
  goNext();
}

function skipAge() {
  ageRange.value = 'unknown';
  markSkipped('age');
  goNext();
}

function skipTone() {
  tone.value = 'unknown';
  markSkipped('tone');
  goNext();
}

watch(ageRange, (value) => {
  if (value !== 'unknown') {
    unskip('age');
  }
});

watch(tone, (value) => {
  if (value !== 'unknown') {
    unskip('tone');
  }
});

async function completeOnboarding() {
  if (completing.value) return;
  if (!isNameValid.value || !gender.value) {
    useToast('Ошибка', 'Заполните имя и выберите пол', 'error');
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
      (auth.user as any)?.ageRange === 'under_30' ||
      (auth.user as any)?.ageRange === '30_45' ||
      (auth.user as any)?.ageRange === '45_plus'
        ? ((auth.user as any)?.ageRange as AgeRange)
        : 'unknown';
  } catch (error) {
    console.error('Не удалось загрузить онбординг:', error);
    useToast('Ошибка', 'Не удалось загрузить онбординг', 'error');
  } finally {
    loading.value = false;
  }
});
</script>
