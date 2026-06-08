<template>
  <section
    data-tour="home-roadmap"
    class="roadmap-hero glass-deep relative overflow-hidden border border-violet-200/35 p-4 animate-slide-up"
  >
    <!-- Декоративные орбы для «выделенного» сиреневого героя (Вариант A). -->
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div
        class="absolute -right-12 -top-14 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-400/25 via-violet-400/15 to-transparent blur-3xl"
      />
      <div
        class="absolute -left-10 -bottom-12 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-500/25 via-violet-500/15 to-transparent blur-3xl"
      />
    </div>

    <!-- Иконка Roadmap зафиксирована в правом верхнем углу карточки (фикс по
         фидбэку: при flex-выравнивании она вставала по центру высоты). -->
    <div
      class="absolute right-4 top-4 z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-300/45 bg-violet-400/20 text-violet-100"
      aria-hidden="true"
    >
      <IconClock v-if="isDailyLimitReached" class="h-5 w-5" />
      <IconRoute v-else class="h-5 w-5" />
    </div>

    <div class="relative z-10 flex items-start justify-between gap-3">
      <div class="min-w-0 space-y-1.5 pr-12">
        <p
          class="inline-flex rounded-full border border-violet-200/30 bg-violet-200/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-100"
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
    </div>

    <!-- Состояние «лимит на сегодня достигнут»: вместо кнопки "Начать" — счётчик
         до локальной полуночи. Тон-оф-войс: позитивный, без guilt — см.
         retention/retention_long_term_strategy.md -->
    <div
      v-if="isDailyLimitReached"
      class="relative z-10 mt-4 rounded-2xl border border-amber-100/20 bg-amber-100/5 px-3 py-2.5"
    >
      <div
        class="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <IconClock class="h-4 w-4 text-amber-100" />
        <span>Следующий шаг через {{ countdownText }}</span>
      </div>
      <p class="mt-1 text-xs leading-relaxed text-foreground/65">
        {{ dailyLimitDoneText }}
      </p>
    </div>

    <div v-else class="relative z-10 mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="roadmap-cta-btn relative inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.98]"
        @click="openCurrentStep"
      >
        <span
          v-if="!hasRoadmapAccess"
          class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
          aria-hidden="true"
          >{{ getPlanBadgeEmoji(roadmapAccess.requiredPlan) }}</span
        >
        <span>{{ currentCta }}</span>
        <IconArrowRight class="h-4 w-4" />
      </button>
      <span class="text-xs text-foreground/55">
        +{{ currentStep?.energyReward || 5 }} капель
      </span>
    </div>

    <div class="relative z-10 my-4 h-px bg-white/10" />

    <div class="relative z-10 mb-3 flex items-center justify-between gap-2">
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

    <div class="relative z-10 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <button
        v-for="step in steps"
        :key="step.id"
        type="button"
        class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition active:scale-95"
        :class="stepClass(step.status)"
        :aria-label="`Шаг ${step.step}: ${step.title}`"
        @click="handleStepClick(step)"
      >
        <IconCheck
          v-if="step.status === 'completed'"
          class="relative z-10 h-4 w-4"
        />
        <IconPlay
          v-else-if="step.status === 'active'"
          class="relative z-10 h-4 w-4 fill-current"
        />
        <IconLock v-else class="relative z-10 h-3.5 w-3.5" />
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
import { useHaptics } from '@/app/composables/useHaptics';
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
import { useAuthStore } from '@/app/stores/auth';
import { applyGender } from '@/app/utils/genderedText';

const authStore = useAuthStore();
const dailyLimitDoneText = computed(() =>
  applyGender(
    'Ты {прошёл|прошла} свою норму на сегодня. Пауза помогает навыкам закрепиться.',
    authStore.user?.gender
  )
);

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
// window.setTimeout в браузере возвращает number, не NodeJS.Timeout
let resetRefreshTimer: number | null = null;

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
  window.clearTimeout(resetRefreshTimer);
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

// Внутри текущего шага есть пройденные под-этапы — значит шаг уже начат
// и его логичнее «Продолжить», а не «Начать».
// Убрано условие doneCount < totalCount: если все под-этапы выполнены, но
// «Завершить шаг» ещё не нажато — это тоже «в процессе», не «не начато».
const hasStepInProgress = computed(() => {
  const progress = props.program.currentStepProgress;
  if (!progress) return false;
  return progress.doneCount > 0;
});

// Статические конфиги для магических искр на CTA-кнопке.
// Часть внутри кнопки (top 20-80%), часть снаружи (отрицательный top или >100%).

const currentCta = computed(() => {
  if (hasNextGardenAvailable.value) return 'Посадить следующий сад';
  if (currentStep.value?.status === 'completed') return 'Повторить';
  return hasStepInProgress.value ? 'Продолжить' : 'Начать';
});

function stepClass(status: ProgramStepStatus) {
  // Точки-шаги: полупрозрачная заливка + выраженный бордер (стиль макета
  // Варианта A), а не однотонная заливка. Active крупнее и с тёплым акцентом.
  if (status === 'completed') {
    return 'border-2 border-emerald-300/55 bg-emerald-300/20 text-emerald-200 hover:bg-emerald-300/30';
  }
  if (status === 'active') {
    return 'h-11 w-11 border-2 border-amber-200/90 bg-amber-300/25 text-amber-100 hover:bg-amber-300/35';
  }
  // available и locked одинаково — недоступны до сброса лимита.
  return 'border-dashed border-white/20 bg-white/[0.04] text-foreground/35';
}

const limitDialogOpen = ref(false);
const { getFeatureAccess } = useEntitlements();
const { triggerLight, triggerMedium } = useHaptics();
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
    void triggerMedium();
    void navigateTo('/garden');
    return;
  }
  if (!currentStep.value) return;
  if (isDailyLimitReachedNow()) {
    limitDialogOpen.value = true;
    return;
  }
  // Программа полностью пройдена, следующего сада нет — «Повторить» начинает с первого шага.
  if (isProgramFullyCompleted.value) {
    void triggerMedium();
    void navigateTo({
      path: `/programs/${props.program.slug}/steps/1`,
      query: { replay: '1' },
    });
    return;
  }
  void triggerMedium();
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
  void triggerLight();
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

<style scoped>
/* Герой-Roadmap «выделен» более насыщенным сиреневым тоном поверх базового
   glass-deep + мягкое свечение по краю (Вариант A стратегии главного экрана). */
.roadmap-hero {
  /* Глубокий сине-фиолетовый «ночной» тон: блик индиго в правом верхнем углу
     (под иконкой) + насыщенная диагональ с уходом в тёмный индиго. */
  background-image: radial-gradient(
      130% 120% at 85% -15%,
      rgba(129, 140, 248, 0.28),
      transparent 50%
    ),
    linear-gradient(
      155deg,
      rgba(67, 56, 202, 0.5),
      rgba(91, 33, 182, 0.34) 50%,
      rgba(30, 27, 75, 0.55)
    );

  box-shadow:
    0 0 36px rgba(79, 70, 229, 0.26),
    inset 1px 1px 0 rgba(255, 255, 255, 0.14);
}

.roadmap-hero {
  background-image: radial-gradient(
      130% 120% at 85% -15%,
      rgba(129, 140, 248, 0.28),
      transparent 50%
    ),
    linear-gradient(
      155deg,
      rgba(67, 56, 202, 0.5),
      rgba(91, 33, 182, 0.34) 50%,
      rgba(30, 27, 75, 0.55)
    );
  box-shadow:
    0 0 36px rgba(79, 70, 229, 0.26),
    inset 1px 1px 0 rgba(255, 255, 255, 0.14);
}

/* ─── CTA-кнопка: плавное свечение ───────────────────────────────────── */
/*
  Двухслойный glow: внешний — мягкий фиолетовый ореол вокруг кнопки,
  внутренний — тонкое белое свечение самого pill.
  Анимация медленная (3.2s), асимметричная easing — не «дышит» механически,
  а плавно пульсирует как живой источник света.
*/
.roadmap-cta-btn {
  box-shadow:
    0 0 0 0 transparent,
    0 2px 8px rgba(0, 0, 0, 0.2);
  animation: cta-glow 3.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  will-change: box-shadow;
}

@keyframes cta-glow {
  0% {
    box-shadow:
      0 0 6px 0 rgba(167, 139, 250, 0),
      0 0 14px 0 rgba(129, 140, 248, 0),
      0 2px 8px rgba(0, 0, 0, 0.2);
  }
  45% {
    box-shadow:
      0 0 12px 4px rgba(167, 139, 250, 0.45),
      0 0 28px 8px rgba(129, 140, 248, 0.18),
      0 2px 8px rgba(0, 0, 0, 0.2);
  }
  100% {
    box-shadow:
      0 0 6px 0 rgba(167, 139, 250, 0),
      0 0 14px 0 rgba(129, 140, 248, 0),
      0 2px 8px rgba(0, 0, 0, 0.2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .roadmap-cta-btn {
    animation: none;
  }
}
</style>
