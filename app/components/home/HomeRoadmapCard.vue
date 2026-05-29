<template>
  <section
    class="glass-deep overflow-hidden border border-violet-200/25 bg-violet-300/10 p-4 animate-slide-up"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 space-y-1.5">
        <p
          class="inline-flex rounded-full border border-violet-200/20 bg-violet-200/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-100"
        >
          Шаг {{ currentStep?.step || props.program.currentStep }} из
          {{ props.program.totalSteps }} · {{ props.program.title }}
        </p>
        <h2 class="text-lg font-semibold leading-tight text-foreground">
          {{ currentStep?.title || 'Карта пути' }}
        </h2>
        <p class="text-xs leading-relaxed text-foreground/70">
          {{ currentStep?.subtitle || props.program.subtitle }}
        </p>
      </div>

      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-foreground"
        aria-hidden="true"
      >
        <IconClock v-if="isDailyLimitReached" class="h-5 w-5" />
        <IconRoute v-else class="h-5 w-5" />
      </div>
    </div>

    <!-- Состояние «лимит на сегодня достигнут»: вместо кнопки "Начать" — счётчик
         до локальной полуночи. Тон-оф-войс: позитивный, без guilt — см.
         retention_long_term_strategy.md §2.4. -->
    <div
      v-if="isDailyLimitReached"
      class="mt-4 rounded-2xl border border-amber-100/20 bg-amber-100/5 px-3 py-2.5"
    >
      <div
        class="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <IconClock class="h-4 w-4 text-amber-100" />
        <span>Следующий шаг через {{ countdownText }}</span>
      </div>
      <p class="mt-1 text-xs leading-relaxed text-foreground/65">
        Ты прошёл свою норму на сегодня. Пауза помогает навыкам закрепиться.
      </p>
    </div>

    <div v-else class="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="relative inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.98]"
        @click="openCurrentStep"
      >
        <span
          v-if="!hasRoadmapAccess"
          class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
          aria-hidden="true"
        >{{ getPlanBadgeEmoji(roadmapAccess.requiredPlan) }}</span>
        <span>{{ currentCta }}</span>
        <IconArrowRight class="h-4 w-4" />
      </button>
      <span class="text-xs text-foreground/55">
        +{{ currentStep?.energyReward || 5 }} капель
      </span>
    </div>

    <div class="my-4 h-px bg-white/10" />

    <div class="mb-3 flex items-center justify-between gap-2">
      <p
        class="text-[11px] font-semibold uppercase tracking-wide text-foreground/55"
      >
        Карта пути
      </p>
      <NuxtLink
        :to="`/programs/${props.program.slug}/map`"
        class="text-xs font-medium text-emerald-200 transition hover:text-emerald-100"
      >
        Все шаги →
      </NuxtLink>
    </div>

    <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <button
        v-for="step in steps"
        :key="step.id"
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition active:scale-95"
        :class="stepClass(step.status)"
        :aria-label="`Шаг ${step.step}: ${step.title}`"
        @click="handleStepClick(step)"
      >
        <IconCheck v-if="step.status === 'completed'" class="h-4 w-4" />
        <IconPlay
          v-else-if="step.status === 'active'"
          class="h-4 w-4 fill-current"
        />
        <IconLock v-else class="h-3.5 w-3.5" />
      </button>
    </div>

    <DailyLimitInfoDialog v-model:open="limitDialogOpen" />

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      feature-key="programs.roadmap.full"
      :required-plan="roadmapAccess.requiredPlan"
      :paywall="roadmapAccess.paywall"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import IconArrowRight from '~icons/lucide/arrow-right';
import IconCheck from '~icons/lucide/check';
import IconClock from '~icons/lucide/clock';
import IconLock from '~icons/lucide/lock';
import IconPlay from '~icons/lucide/play';
import IconRoute from '~icons/lucide/route';
import DailyLimitInfoDialog from '@/app/components/programs/DailyLimitInfoDialog.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import { useEntitlements } from '@/app/composables/useEntitlements';
import {
  getProgramDailyLimitRefreshDelayMs,
  isProgramDailyLimitReachedAt,
} from '@/app/composables/useProgramDailyLimit';
import type {
  ProgramDailyLimitDto,
  ProgramOverviewDto,
  ProgramStepDto,
  ProgramStepStatus,
} from '@/shared/dto/retention';
import type { GardenAvailableProgramDto } from '@/shared/dto/garden';

const props = withDefaults(
  defineProps<{
    program: ProgramOverviewDto;
    // programDailyLimit отдаёт /api/today. Если поле отсутствует (старая сборка
    // сервера) — счётчик не показываем, поведение совпадает с прежним.
    dailyLimit?: ProgramDailyLimitDto;
    /**
     * Available seeds из /api/garden. Когда активная программа завершена,
     * используем для CTA «Посадить следующий сад» — если доступные есть,
     * замещаем «Повторить» более полезным действием (ссылка в Оранжерею
     * на handoff-модалку).
     */
    availableSeeds?: GardenAvailableProgramDto[];
  }>(),
  { availableSeeds: () => [] }
);

const emit = defineEmits<{
  (event: 'daily-limit-reset'): void;
}>();

// Тикер для обновления countdown'а раз в 30 секунд — секундная точность излишня
// для «через 8ч 23м», а короткий интервал нужен dev-режиму с минутным cooldown.
const nowMs = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let resetRefreshTimer: ReturnType<typeof setTimeout> | null = null;

const isDailyLimitReached = computed(() => {
  return isProgramDailyLimitReachedAt(props.dailyLimit ?? null, nowMs.value);
});

function startCountdown() {
  if (countdownTimer) return;
  countdownTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 30_000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function clearResetRefreshTimer() {
  if (!resetRefreshTimer) return;
  clearTimeout(resetRefreshTimer);
  resetRefreshTimer = null;
}

function scheduleDailyLimitResetRefresh() {
  clearResetRefreshTimer();
  if (typeof window === 'undefined') return;

  const delayMs = getProgramDailyLimitRefreshDelayMs(
    props.dailyLimit ?? null,
    Date.now()
  );
  if (delayMs === null) return;

  resetRefreshTimer = window.setTimeout(() => {
    resetRefreshTimer = null;
    nowMs.value = Date.now();
    // Родитель делает один лёгкий `/api/today`, без полной перезагрузки главной.
    emit('daily-limit-reset');
  }, delayMs);
}

function handleDailyLimitForegroundCheck() {
  nowMs.value = Date.now();
  const delayMs = getProgramDailyLimitRefreshDelayMs(
    props.dailyLimit ?? null,
    nowMs.value
  );
  if (delayMs === 0) {
    emit('daily-limit-reset');
    return;
  }
  scheduleDailyLimitResetRefresh();
}

const handleVisibilityChange = () => {
  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible'
  ) {
    handleDailyLimitForegroundCheck();
  }
};

function isDailyLimitReachedNow() {
  nowMs.value = Date.now();
  return isProgramDailyLimitReachedAt(props.dailyLimit ?? null, nowMs.value);
}

onMounted(() => {
  startCountdown();
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleDailyLimitForegroundCheck);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
});
onBeforeUnmount(() => {
  stopCountdown();
  clearResetRefreshTimer();
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleDailyLimitForegroundCheck);
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
});

watch(
  [
    () => props.dailyLimit?.nextResetAt ?? null,
    () => props.dailyLimit?.stepsDoneToday ?? 0,
    () => props.dailyLimit?.dailyStepLimit ?? 0,
  ],
  scheduleDailyLimitResetRefresh,
  { immediate: true }
);

const countdownText = computed(() => {
  const dl = props.dailyLimit;
  if (!dl?.nextResetAt) return '';
  const targetMs = new Date(dl.nextResetAt).getTime();
  const deltaMs = Math.max(0, targetMs - nowMs.value);
  const totalMinutes = Math.ceil(deltaMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  }
  if (minutes > 1) return `${minutes} мин`;
  // Меньше минуты: следующий шаг уже почти открыт.
  return 'минуту';
});

const steps = computed(() =>
  props.program.chapters.flatMap((chapter) => chapter.steps)
);

const currentStep = computed(
  () =>
    props.program.currentStepItem ||
    steps.value.find((step) => step.status === 'active') ||
    steps.value[0] ||
    null
);

// Программа полностью пройдена, если все шаги в статусе completed
// (currentStep упёрся в totalSteps + последний шаг в статусе completed).
const isProgramFullyCompleted = computed(() => {
  return props.program.completedSteps >= props.program.totalSteps;
});

// Если программа закончена и в Оранжерее есть доступный следующий сад —
// показываем CTA «Посадить следующий сад» (переход в /garden, где открывается
// handoff-модалка). Иначе классическое «Повторить» / «Начать».
const hasNextGardenAvailable = computed(
  () => isProgramFullyCompleted.value && props.availableSeeds.length > 0
);

const currentCta = computed(() => {
  if (hasNextGardenAvailable.value) return 'Посадить следующий сад';
  return currentStep.value?.status === 'completed' ? 'Повторить' : 'Начать';
});

function stepClass(status: ProgramStepStatus) {
  if (status === 'completed') {
    return 'border-emerald-200/35 bg-emerald-300/70 text-background hover:bg-emerald-200';
  }
  if (status === 'active') {
    return 'h-11 w-11 border-amber-100/80 bg-amber-300 text-background hover:bg-amber-200';
  }
  // available и locked одинаково — недоступны до сброса лимита.
  return 'border-dashed border-white/20 bg-white/5 text-foreground/35';
}

const limitDialogOpen = ref(false);
const { getFeatureAccess } = useEntitlements();
const paywallOpen = ref(false);
const roadmapAccess = computed(() => getFeatureAccess('programs.roadmap.full'));
const hasRoadmapAccess = computed(() => roadmapAccess.value.available);

function getPlanBadgeEmoji(plan: string): string {
  return plan === 'premium' ? '💎' : '⭐';
}

function openCurrentStep() {
  if (!hasRoadmapAccess.value) {
    paywallOpen.value = true;
    return;
  }
  // Программа завершена + есть следующий сад — отправляем в Оранжерею,
  // там GardenTransplantHandoff подхватит и покажет AI-итог + CTA.
  if (hasNextGardenAvailable.value) {
    void navigateTo('/garden');
    return;
  }
  if (!currentStep.value) return;
  if (isDailyLimitReachedNow()) {
    limitDialogOpen.value = true;
    return;
  }
  void navigateTo(
    `/programs/${props.program.slug}/steps/${currentStep.value.step}`
  );
}

function handleStepClick(step: ProgramStepDto) {
  if (!hasRoadmapAccess.value) {
    paywallOpen.value = true;
    return;
  }
  // active-шаг = «следующий новый шаг для пользователя». Если daily-лимит достигнут,
  // backend всё равно вернёт 409 E_DAILY_LIMIT. Чтобы не давать пользователю
  // упереться в редирект из step runner'а, перехватываем тут.
  // completed-шаг (replay) проходит без блокировки — лимит на replay не действует.
  if (step.status === 'active' && isDailyLimitReachedNow()) {
    limitDialogOpen.value = true;
    return;
  }
  if (step.status === 'active') {
    void navigateTo(`/programs/${props.program.slug}/steps/${step.step}`);
    return;
  }

  void navigateTo({
    path: `/programs/${props.program.slug}/map`,
    query: { step: String(step.step) },
  });
}
</script>
