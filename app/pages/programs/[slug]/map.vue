<template>
  <div
    class="relative h-full overflow-y-auto xs:space-y-3 space-y-1"
    :class="ctaActiveStep ? 'pb-[180px]' : 'pb-[110px]'"
  >
    <PageHeader title="Карта пути" show-back-button @go-back="goBack">
      <template #trailing>
        <NuxtLink
          to="/garden"
          class="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-foreground/80 transition hover:border-white/25 hover:text-foreground"
          aria-label="Все мои сады"
        >
          <IconLayoutGrid class="h-3.5 w-3.5" aria-hidden="true" />
          Все сады
        </NuxtLink>
      </template>
    </PageHeader>

    <!-- Баннер о достигнутом daily-лимите. Та же информация что в HomeRoadmapCard,
         дублируется здесь, потому что пользователь может попасть прямо на карту
         через deep-link. См. retention/retention_long_term_strategy.md -->
    <section
      v-if="dailyLimit.isReached.value"
      class="glass-deep flex items-center gap-2 border border-amber-100/20 bg-amber-100/[0.04] p-3"
    >
      <IconClock class="h-4 w-4 shrink-0 text-amber-100" />
      <div class="space-y-1">
        <p class="text-sm font-semibold text-foreground">
          На сегодня шаги закончились
        </p>
        <p class="text-xs leading-relaxed text-foreground/65">
          Дальше пауза, чтобы навыки улеглись. Завершённые шаги можно повторять
          без ограничений, если захочется.
        </p>
      </div>
    </section>

    <template v-if="overview">
      <!-- Шапка сада: бейдж статуса, название, прогресс. Заменяет
           accordion-кнопку из старой версии — теперь страница полностью
           посвящена ОДНОМУ саду.
           Sticky: липнет сразу под PageHeader (top-0, высота ~50px), оставляя
           небольшой воздух. z ниже хедера (z-50), но выше тропы, которая
           проскролливается под стеклом. -->
      <section class="glass-deep sticky top-[56px] z-30 px-4 py-3">
        <p
          class="text-[10px] font-semibold uppercase tracking-wide"
          :class="
            overview.completedSteps >= overview.totalSteps
              ? 'text-emerald-200'
              : 'text-violet-200'
          "
        >
          {{
            overview.completedSteps >= overview.totalSteps
              ? 'Завершено'
              : 'Активный сад'
          }}
        </p>
        <h2 class="text-base font-semibold text-foreground">
          {{ overview.title }}
        </h2>
        <p class="mt-1 text-xs text-foreground/55">
          {{ overview.completedSteps }} шагов из {{ overview.totalSteps }} ·
          {{ overview.progressPercent }}%
        </p>
        <div
          class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/12"
          aria-hidden="true"
        >
          <div
            class="h-full rounded-full bg-emerald-300 transition-all duration-500"
            :style="{ width: `${overview.progressPercent}%` }"
          />
        </div>
      </section>

      <!-- ЕДИНАЯ карта пути через все главы. Без отдельных glass-deep
           контейнеров — это была главная визуальная проблема прошлой
           итерации (разрывы между главами ломали ощущение пути).
           Метки глав встроены в ленту самой тропы. -->
      <ProgramRoadmapPath
        ref="roadmapPathRef"
        :steps="allSteps"
        :chapters="overview.chapters"
        @select="openStep"
      />
    </template>

    <div v-else class="xs:space-y-3 space-y-1">
      <section
        v-for="index in 3"
        :key="index"
        class="glass-deep h-32 animate-pulse"
      />
    </div>

    <ProgramStepBottomSheet
      v-model:open="sheetOpen"
      :step="selectedStep"
      :locked="!hasRoadmapAccess"
      :in-progress="isSelectedStepInProgress"
      @start="startStep"
      @paywall="paywallOpen = true"
    />

    <LockedStepBottomSheet
      v-model:open="lockedSheetOpen"
      :step="selectedStep"
    />

    <DailyLimitInfoDialog v-model:open="limitDialogOpen" />

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      feature-key="programs.roadmap.full"
      :required-plan="roadmapAccess.requiredPlan"
      :paywall="roadmapAccess.paywall"
    />

    <!-- Sticky CTA «Сейчас здесь / Продолжить» — появляется когда активный
         узел скроллом ушёл из viewport. Один-тап-возврат + open sheet.
         Анимация slide-in от bottom (та же кривая что у bottom sheets). -->
    <Transition
      enter-from-class="opacity-0 translate-y-full"
      enter-active-class="transition duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]"
      enter-to-class="opacity-100 translate-y-0"
      leave-from-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-300 ease-[cubic-bezier(0.7,0,0.84,0)]"
      leave-to-class="opacity-0 translate-y-full"
    >
      <ProgramRoadmapContinueCTA
        v-if="ctaActiveStep && !ctaActiveVisible"
        :step="ctaActiveStep"
        @continue="continueToActive"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import IconClock from '~icons/lucide/clock';
import IconLayoutGrid from '~icons/lucide/layout-grid';
import PageHeader from '@/app/components/PageHeader.vue';
import ProgramStepBottomSheet from '@/app/components/programs/ProgramStepBottomSheet.vue';
import LockedStepBottomSheet from '@/app/components/programs/LockedStepBottomSheet.vue';
import DailyLimitInfoDialog from '@/app/components/programs/DailyLimitInfoDialog.vue';
import ProgramRoadmapPath from '@/app/components/programs/roadmap/ProgramRoadmapPath.vue';
import ProgramRoadmapContinueCTA from '@/app/components/programs/roadmap/ProgramRoadmapContinueCTA.vue';
import { useAPI } from '@/app/composables/useAPI';
import { useProgramDailyLimit } from '@/app/composables/useProgramDailyLimit';
import { useEntitlements } from '@/app/composables/useEntitlements';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import type {
  ProgramOverviewDto,
  ProgramStepDto,
} from '@/shared/dto/retention';
import type { GardenResponseDto } from '@/shared/dto/garden';

const route = useRoute();
const selectedStep = ref<ProgramStepDto | null>(null);
const sheetOpen = ref(false);
const lockedSheetOpen = ref(false);
const limitDialogOpen = ref(false);
const dailyLimit = useProgramDailyLimit();
const { getFeatureAccess } = useEntitlements();
const paywallOpen = ref(false);
const roadmapAccess = computed(() => getFeatureAccess('programs.roadmap.full'));
const hasRoadmapAccess = computed(() => roadmapAccess.value.available);

// Шаг уже начат (есть пройденные под-этапы), но ещё не завершён — показываем
// «Продолжить» вместо «Начать». Логика совпадает с HomeRoadmapCard.
const isSelectedStepInProgress = computed(() => {
  if (!selectedStep.value || selectedStep.value.status !== 'active') return false;
  const progress = overview.value?.currentStepProgress;
  if (!progress) return false;
  return progress.doneCount > 0 && progress.doneCount < progress.totalCount;
});

const slug = computed(() => String(route.params.slug || '').trim());

// Overview ТЕКУЩЕГО сада из URL slug. Этот файл показывает ровно ОДИН сад —
// обзор всех садов живёт в Оранжерее (/garden).
const overview = ref<ProgramOverviewDto | null>(null);

// Полный список шагов программы (плоский). Передаётся в ProgramRoadmapPath
// одним массивом — карта рисуется как единая непрерывная тропа через все
// главы. Метки глав встроены в ленту самой тропы.
const allSteps = computed<ProgramStepDto[]>(() =>
  (overview.value?.chapters ?? []).flatMap((chapter) => chapter.steps)
);

// Ref на ProgramRoadmapPath. Через defineExpose дочерний компонент
// отдаёт activeStep (ProgramStepDto | null), activeNodeVisible (boolean)
// и метод scrollToActive() — нужны для sticky-CTA и auto-scroll при mount.
const roadmapPathRef = ref<InstanceType<typeof ProgramRoadmapPath> | null>(
  null
);

const ctaActiveStep = computed<ProgramStepDto | null>(() => {
  const exposed = roadmapPathRef.value?.activeStep;
  // exposed это ComputedRef; читаем .value безопасно.
  return exposed && 'value' in exposed ? exposed.value : null;
});

const ctaActiveVisible = computed<boolean>(() => {
  const exposed = roadmapPathRef.value?.activeNodeVisible;
  if (!exposed) return true;
  return 'value' in exposed ? exposed.value : true;
});

function continueToActive() {
  roadmapPathRef.value?.scrollToActive();
  if (ctaActiveStep.value) {
    openStep(ctaActiveStep.value);
  }
}

/**
 * URL slug, который недоступен пользователю — либо locked (в `lockedSilhouettes`),
 * либо available (в `available`, не стартованный). В обоих случаях map.vue
 * не должен показывать его карту: пользователь редиректится либо на активный
 * сад, либо в Оранжерею /garden (единый обзор всех садов).
 */
function classifyLockedAccess(
  garden: GardenResponseDto,
  urlSlug: string
): { kind: 'ok' } | { kind: 'redirect-to'; slug: string | null } {
  if (garden.active?.programSlug === urlSlug) return { kind: 'ok' };
  if (garden.completed.some((p) => p.programSlug === urlSlug))
    return { kind: 'ok' };

  // Любой другой случай — недоступная программа: редиректим на активную;
  // если активной нет — в Оранжерею /garden.
  return { kind: 'redirect-to', slug: garden.active?.programSlug ?? null };
}

async function loadInitial() {
  // Garden snapshot первым: нужен чтобы проверить, не зашёл ли пользователь
  // на URL заблокированного / удалённого сада.
  let garden: GardenResponseDto | null = null;
  try {
    garden = await useAPI<GardenResponseDto>('/api/garden', {
      suppressErrorToast: true,
    });
  } catch (error) {
    console.warn('[map] garden snapshot failed:', error);
  }

  if (garden) {
    const access = classifyLockedAccess(garden, slug.value);
    if (access.kind === 'redirect-to') {
      if (access.slug && access.slug !== slug.value) {
        void navigateTo(`/programs/${access.slug}/map`, { replace: true });
        return;
      }
      // Активного сада нет — ведём в Оранжерею (там виден весь обзор садов).
      void navigateTo('/garden', { replace: true });
      return;
    }
  }

  // Параллельно: overview текущего сада + dailyLimit. Если /api/today ещё
  // не отдал лимит — баннер просто не покажется, поведение совпадает с прежним.
  const [overviewResult] = await Promise.all([
    useAPI<ProgramOverviewDto>(`/api/programs/${slug.value}`, {
      suppressErrorToast: true,
    }).catch((error) => {
      console.warn('[map] overview failed:', slug.value, error);
      return null;
    }),
    dailyLimit.load().catch(() => undefined),
  ]);

  if (overviewResult) {
    overview.value = overviewResult;
  }

  // Если есть ?step=N в URL — откроем sheet для конкретного шага.
  if (!overview.value) return;
  const rawStep = Number(route.query.step);
  if (Number.isInteger(rawStep) && rawStep > 0) {
    const step = overview.value.chapters
      .flatMap((chapter) => chapter.steps)
      .find((item) => item.step === rawStep);
    if (step) openStep(step);
  }
  // Auto-scroll к активному узлу выполняется ВНУТРИ ProgramRoadmapPath,
  // там есть прямой доступ к containerWidth и nodes — это даёт надёжное
  // timing (после useElementSize-update и render узлов с правильными cx/cy).
}

function goBack() {
  void navigateTo('/');
}

function openStep(step: ProgramStepDto) {
  void dailyLimit.refreshIfExpired().catch(() => undefined);
  // available/locked-шаги недоступны.
  if (step.status === 'locked' || step.status === 'available') {
    selectedStep.value = step;
    lockedSheetOpen.value = true;
    return;
  }
  // Для active/completed — открываем sheet; если нет подписки, sheet покажет
  // badge ⭐ и при клике эмитит 'paywall'.
  selectedStep.value = step;
  if (!hasRoadmapAccess.value) {
    sheetOpen.value = true;
    return;
  }
  // Active-шаг при достигнутом лимите — модалка.
  if (step.status === 'active' && dailyLimit.isReachedNow()) {
    limitDialogOpen.value = true;
    return;
  }
  // Sheet для completed (replay) и active без лимита.
  sheetOpen.value = true;
}

function startStep(payload: { step: ProgramStepDto; replay: boolean }) {
  if (!hasRoadmapAccess.value) {
    sheetOpen.value = false;
    paywallOpen.value = true;
    return;
  }
  void dailyLimit.refreshIfExpired().catch(() => undefined);
  if (
    !payload.replay &&
    payload.step.status !== 'completed' &&
    dailyLimit.isReachedNow()
  ) {
    sheetOpen.value = false;
    limitDialogOpen.value = true;
    return;
  }
  sheetOpen.value = false;
  void navigateTo({
    path: `/programs/${slug.value}/steps/${payload.step.step}`,
    query: payload.replay ? { replay: '1' } : undefined,
  });
}

onMounted(() => {
  void loadInitial().catch((error) => {
    console.error('[Programs] Не удалось загрузить карту пути:', error);
  });
});
</script>
