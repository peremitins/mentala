<template>
  <div
    class="space-y-2 h-dvh overflow-y-auto no-scrollbar pb-[100px] rounded-lg"
  >
    <div
      class="flex h-full flex-col justify-between space-y-2 overflow-y-auto no-scrollbar"
    >
      <PageHeader
        :title="headerTitle"
        :show-back-button="true"
        @go-back="goBack"
      />

      <div v-if="isBuilder" class="flex flex-col space-y-2 h-full">
        <div class="glass-deep relative p-4">
          <div class="flex space-x-2 relative z-10 space-y-3">
            <div class="text-xl">✨</div>
            <div class="space-y-1">
              <h2 class="text-xl font-semibold text-foreground">
                Своя дыхательная практика
              </h2>
              <p class="text-sm text-foreground/70">
                Выбери 2–4 фазы, укажи секунды и сохрани. Практика всегда будет
                под рукой.
              </p>
            </div>
          </div>
        </div>

        <div class="glass-deep space-y-4 p-4">
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.08em] text-white/60">
              Название практики
            </p>
            <Input
              v-model="customName"
              type="text"
              class="h-10"
              :maxlength="60"
              placeholder="Например, «Спокойствие перед сном»"
            />
          </div>

          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.08em] text-white/60">
              Количество фаз
            </p>
            <ToggleGroup
              type="single"
              :model-value="String(phaseCount)"
              class="grid grid-cols-3 gap-2"
              @update:model-value="handlePhaseCount"
            >
              <ToggleGroupItem value="2" class="h-9">2 фазы</ToggleGroupItem>
              <ToggleGroupItem value="3" class="h-9">3 фазы</ToggleGroupItem>
              <ToggleGroupItem value="4" class="h-9">4 фазы</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div class="space-y-3">
            <p class="text-xs uppercase tracking-[0.08em] text-white/60">
              Тайминг фаз
            </p>
            <div class="space-y-3">
              <div
                v-for="(phase, index) in customPhases"
                :key="`${phase.type}-${index}`"
                class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div class="space-y-1">
                  <p class="text-sm font-semibold text-white">
                    {{ phase.label }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="h-8 w-8 flex-shrink-0 justify-center items-center rounded-full border border-white/20 text-white/70 transition hover:border-white/40 hover:text-white"
                    @click="adjustPhase(index, -1)"
                  >
                    -
                  </button>
                  <Input
                    v-model.number="customPhases[index]!.seconds"
                    type="number"
                    :min="1"
                    :max="MAX_CUSTOM_SECONDS"
                    @change="clampPhase(index)"
                  />
                  <button
                    type="button"
                    class="h-8 w-8 flex-shrink-0 justify-center items-center rounded-full border border-white/20 text-white/70 transition hover:border-white/40 hover:text-white"
                    @click="adjustPhase(index, 1)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <p v-if="showHoldWarning" class="text-xs text-amber-200/80">
              Если чувствуешь дискомфорт — уменьши задержку или паузу.
            </p>
          </div>
          <Button class="w-full" size="lg" @click="saveCustom">
            Сохранить практику
          </Button>
        </div>
      </div>

      <BreathPracticePlayer
        v-else-if="practice"
        :practice="practice"
        :show-navigation="canNavigateGroup"
        @navigate-prev="goToPrevPractice"
        @navigate-next="goToNextPractice"
        @start="onPracticeStart"
        @pause="onPracticePause"
        @stop="onPracticeStop"
        @complete="onPracticeComplete"
      />

      <div v-else class="px-4">
        <StateBlock state="error" class="px-4">
          <p class="text-sm text-center">Практика не найдена</p>
        </StateBlock>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BreathPracticePlayer from '@/app/components/breath-practices/BreathPracticePlayer.vue';
import PageHeader from '@/app/components/PageHeader.vue';
import StateBlock from '@/app/components/StateBlock.vue';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/shadcn/input';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { useToast } from '@/app/composables/useToast';
import { useFreeTimedPracticeRecovery } from '@/app/composables/useFreeTimedPracticeRecovery';
import { useBreathPracticesStore } from '@/app/stores/breathPractices';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useAppReviewPrompt } from '@/app/composables/useAppReviewPrompt';
import {
  BREATH_PRACTICES,
  buildCustomPhases,
  findBreathPractice,
  mapCustomPractice,
  type BreathPracticeTag,
  type BreathPhase,
} from '@/app/lib/breathPracticesCatalog';
import { navigateTo } from '#app';

const MAX_CUSTOM_SECONDS = 30;
type TimedPracticeStartPayload = { requiredSeconds?: number };

const route = useRoute();
const store = useBreathPracticesStore();
const { getFeatureAccess } = useEntitlements();
const { recordPracticeCompleted, checkAndShow } = useAppReviewPrompt();

const fullCatalogAccess = computed(() =>
  getFeatureAccess('breath.catalog.full')
);
const customCreateAccess = computed(() =>
  getFeatureAccess('breath.custom.create')
);
const customManageAccess = computed(() =>
  getFeatureAccess('breath.custom.manage')
);

const slug = computed(() => String(route.params.slug || ''));
const isBuilder = computed(() => slug.value === 'custom');
const customId = computed(() =>
  slug.value.startsWith('custom-') ? slug.value.slice('custom-'.length) : null
);

type BreathPracticeGroupKey = BreathPracticeTag | 'custom';

const groupKey = computed<BreathPracticeGroupKey | null>(() => {
  const raw = route.query.group;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized === 'custom') return 'custom';
  if (['popular', 'sleep', 'anxiety', 'focus'].includes(normalized)) {
    return normalized as BreathPracticeTag;
  }
  return null;
});

const groupSlugs = computed(() => {
  const key = groupKey.value;
  if (!key) return [];
  if (key === 'custom') {
    return store.customPractices.map((practice) => `custom-${practice.id}`);
  }
  // Здесь key уже строго BreathPracticeTag.
  return BREATH_PRACTICES.filter((practice) => practice.tags.includes(key)).map(
    (practice) => practice.slug
  );
});

const groupIndex = computed(() => groupSlugs.value.indexOf(slug.value));
const canNavigateGroup = computed(
  () => !isBuilder.value && groupSlugs.value.length > 1 && groupIndex.value >= 0
);

const builtInPractice = computed(() =>
  isBuilder.value ? null : findBreathPractice(slug.value)
);

const customPractice = computed(() =>
  customId.value ? store.customById(customId.value) : null
);

const lockFeatureKey = computed<string | null>(() => {
  if (isBuilder.value && !customCreateAccess.value.available) {
    return 'breath.custom.create';
  }

  if (customId.value && !customManageAccess.value.available) {
    return 'breath.custom.manage';
  }

  if (builtInPractice.value && !fullCatalogAccess.value.available) {
    return 'breath.catalog.full';
  }

  return null;
});

const practice = computed(() => {
  if (builtInPractice.value) return builtInPractice.value;
  if (customPractice.value) return mapCustomPractice(customPractice.value);
  return null;
});

const headerTitle = computed(() => {
  if (isBuilder.value) return 'Своя практика';
  return practice.value?.title || 'Практика';
});

const phaseCount = ref<2 | 3 | 4>(3);
const customPhases = ref<BreathPhase[]>(buildCustomPhases(3));
const customName = ref('');
const freeTimedRecovery = useFreeTimedPracticeRecovery({
  persistOnUnmount: false,
});

const showHoldWarning = computed(() =>
  customPhases.value.some(
    (phase) =>
      (phase.type === 'hold' || phase.type === 'pause') && phase.seconds >= 20
  )
);

function goBack() {
  navigateTo('/breath-practices');
}

// Перелистываем практики внутри выбранной группы без выхода из плеера.
async function goToGroupSibling(direction: 1 | -1) {
  if (!canNavigateGroup.value) return;
  const list = groupSlugs.value;
  const currentIndex = groupIndex.value;
  if (!list.length || currentIndex < 0) return;
  const nextIndex = (currentIndex + direction + list.length) % list.length;
  const nextSlug = list[nextIndex];
  const query = groupKey.value ? { group: groupKey.value } : undefined;
  await navigateTo({ path: `/breath-practices/${nextSlug}`, query });
}

function formatLocalDateKey(date = new Date()) {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getBreathPracticeSourceId() {
  const practiceId = practice.value?.slug || customId.value;
  if (!practiceId) return null;
  return `breath:${practiceId}:${formatLocalDateKey()}`;
}

function buildBreathRecoveryStart(payload?: TimedPracticeStartPayload) {
  const sourceId = getBreathPracticeSourceId();
  const requiredSeconds = Number(payload?.requiredSeconds);
  if (!sourceId || !Number.isFinite(requiredSeconds)) return null;

  return {
    type: 'breath_practice',
    source: 'breath_practice_completed' as const,
    sourceId,
    requiredSeconds,
  };
}

function onPracticeStart(payload?: TimedPracticeStartPayload) {
  const record = buildBreathRecoveryStart(payload);
  if (!record) return;
  void freeTimedRecovery.start(record);
}

function onPracticePause() {
  void freeTimedRecovery.pause();
}

function onPracticeStop() {
  void freeTimedRecovery.stop();
}

function onPracticeComplete() {
  // Свободная дыхательная практика завершена — начисляем 1 каплю
  // (rate-limit 3/день из свободных). См. retention/retention_long_term_strategy.md
  // Если практика была пройдена внутри Roadmap-шага, ProgramBreathPracticeAction
  // не использует этот handler, и здесь мы не дублируемся.
  // sourceId включает локальную дату — за один календарный день одно sourceId,
  // повторное прохождение той же практики на следующий день начислит каплю
  // снова (если в этот день ещё есть слот в rate-limit'е).
  const requiredSeconds =
    freeTimedRecovery.activeRecord.value?.requiredSeconds ?? 1;
  const record = buildBreathRecoveryStart({ requiredSeconds });
  if (!record) return;
  void freeTimedRecovery.complete(record);
  void recordPracticeCompleted().then(() => checkAndShow());
}

function goToPrevPractice() {
  void goToGroupSibling(-1);
}

function goToNextPractice() {
  void goToGroupSibling(1);
}

function handlePhaseCount(value?: string | string[]) {
  const nextValue = Array.isArray(value) ? value[0] : value;
  if (!nextValue) return;
  const parsed = Number(nextValue) as 2 | 3 | 4;
  if (![2, 3, 4].includes(parsed)) return;

  phaseCount.value = parsed;
  const next = buildCustomPhases(parsed);

  // Сохраняем секунды из уже заполненных фаз.
  customPhases.value = next.map((phase) => {
    const existing = customPhases.value.find(
      (item) => item.type === phase.type
    );
    return existing ? { ...phase, seconds: existing.seconds } : phase;
  });
}

function clampPhase(index: number) {
  const phase = customPhases.value[index];
  if (!phase) return;
  const numeric = Number(phase.seconds);
  const safe = clampNumber(numeric, 1, MAX_CUSTOM_SECONDS);
  customPhases.value[index] = { ...phase, seconds: safe };
}

function adjustPhase(index: number, delta: number) {
  const phase = customPhases.value[index];
  if (!phase) return;
  const numeric = Number(phase.seconds);
  const safe = clampNumber(numeric + delta, 1, MAX_CUSTOM_SECONDS);
  customPhases.value[index] = { ...phase, seconds: safe };
}

function clampNumber(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.floor(safe)));
}

async function saveCustom() {
  const trimmed = customName.value.trim();
  if (!trimmed) {
    useToast('Нужно название практики', 'Напиши короткое имя.', 'warning');
    return;
  }

  const normalizedPhases = customPhases.value.map((phase) => ({
    ...phase,
    seconds: clampNumber(Number(phase.seconds), 1, MAX_CUSTOM_SECONDS),
  }));

  const created = await store.addCustom(trimmed, normalizedPhases);
  useToast('Практика сохранена', 'Можно запускать сразу.');
  navigateTo(`/breath-practices/custom-${created.id}`);
}

async function redirectToLockedPaywall(featureKey: string) {
  await navigateTo(
    {
      path: '/breath-practices',
      query: {
        lockedFeature: featureKey,
      },
    },
    { replace: true }
  );
}

onMounted(async () => {
  if (lockFeatureKey.value) {
    await redirectToLockedPaywall(lockFeatureKey.value);
    return;
  }

  // Загружаем пользовательские практики только когда они реально нужны.
  if (customId.value && customManageAccess.value.available) {
    await store.load();
  }
});

watch(
  () => practice.value?.slug ?? null,
  async (nextSlug, previousSlug) => {
    if (!previousSlug || nextSlug === previousSlug) return;
    await onPracticeStop();
  }
);

watch(
  () => lockFeatureKey.value,
  async (featureKey) => {
    if (!featureKey) return;
    await redirectToLockedPaywall(featureKey);
  }
);
</script>
