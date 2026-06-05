<template>
  <div
    class="relative h-full overflow-y-auto xs:space-y-3 space-y-1 pb-[110px] rounded-lg"
  >
    <PageHeader title="Оранжерея" show-back-button @go-back="goBack" />

    <section
      v-if="garden.isLoading.value && !garden.snapshot.value"
      class="xs:space-y-3 space-y-1"
    >
      <div
        v-for="index in 3"
        :key="index"
        class="glass-deep h-40 animate-pulse"
      />
    </section>

    <section
      v-else-if="garden.loadError.value"
      class="glass-deep flex flex-col items-center gap-3 p-6 text-center"
    >
      <p class="text-sm text-foreground/80">Не удалось загрузить оранжерею.</p>
      <button
        type="button"
        class="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
        @click="() => garden.load()"
      >
        Попробовать снова
      </button>
    </section>

    <template v-else>
      <GardenActiveCard
        v-if="garden.activePlant.value"
        :plant="garden.activePlant.value"
        :locked="!hasRoadmapAccess"
        @open-reports="onOpenActiveReports"
      />

      <GardenCompletedCollection
        :plants="garden.completedPlants.value"
        :locked="!hasRoadmapAccess"
        @open-report="openLore"
        @open-map="openMap"
      />

      <!-- Ссылка на достижения — после завершённых садов, перед новыми семенами -->
      <NuxtLink
        to="/milestones"
        class="glass-deep flex items-center justify-between gap-3 px-4 py-3"
      >
        <div class="flex items-center gap-3">
          <div class="garden-achievements-icon">
            <span>✦</span>
          </div>
          <div>
            <p class="text-sm font-medium">Достижения</p>
            <p class="text-xs text-muted-foreground">
              {{ achievementsSubtitle }}
            </p>
          </div>
        </div>
        <IconChevronRight class="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </NuxtLink>

      <GardenAvailableSeeds
        :seeds="garden.availableSeeds.value"
        :starting-slug="startingSlug"
        :locked="!hasRoadmapAccess"
        @start="handleStartProgram"
      />

      <!-- Handoff-модалка между садами: превью ближайшего следующего Сада
           + CTA старта с transition-анимацией. Итог прошлого сада не показываем. -->
      <GardenTransplantHandoff
        v-if="handoffNextProgram"
        v-model:open="handoffOpen"
        :previous-plant="handoffPreviousPlant"
        :next-program="handoffNextProgram"
        @started="onHandoffStarted"
      />

      <GardenLockedSilhouettes
        :silhouettes="garden.lockedSilhouettes.value"
        @select="openLockedProgram"
      />

      <!-- Пустое состояние — у только что зарегистрированного пользователя
           ещё нет ни активного сада, ни завершений. Не должно встречаться
           часто (P1 stub автоматически создаёт active program в onboarding). -->
      <section
        v-if="!garden.hasAnyContent.value"
        class="glass-deep flex flex-col items-center gap-3 p-6 text-center"
      >
        <h1 class="text-lg font-semibold text-foreground">
          Здесь будет твоя оранжерея
        </h1>
        <p class="text-sm text-foreground/70">
          Сделай первый шаг программы — и сад начнёт расти.
        </p>
      </section>
    </template>

    <!-- Премиальный полноэкранный sheet с клиническим разбором завершённого
         сада. Заменил старый GardenPlantLoreCard (короткая модалка). Открывается
         тапом на карточку в GardenCompletedCollection. См. сессия 25. -->
    <GardenPlantReportSheet
      v-model:open="loreOpen"
      :plant="selectedLorePlant"
    />

    <!-- Модалка закрытого Сада: тап по карточке в «Что ждёт впереди».
         Чисто информационная (без paywall) — рассказывает, когда сад
         откроется или что он ещё в разработке. -->
    <GardenLockedProgramModal
      v-model:open="lockedModalOpen"
      :silhouette="selectedLocked"
    />

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      feature-key="programs.roadmap.full"
      :required-plan="roadmapAccess.requiredPlan"
      :paywall="roadmapAccess.paywall"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import PageHeader from '@/app/components/PageHeader.vue';
import GardenActiveCard from '@/app/components/garden/GardenActiveCard.vue';
import GardenCompletedCollection from '@/app/components/garden/GardenCompletedCollection.vue';
import GardenAvailableSeeds from '@/app/components/garden/GardenAvailableSeeds.vue';
import GardenLockedSilhouettes from '@/app/components/garden/GardenLockedSilhouettes.vue';
import GardenLockedProgramModal from '@/app/components/garden/GardenLockedProgramModal.vue';
import GardenPlantReportSheet from '@/app/components/garden/GardenPlantReportSheet.vue';
import GardenTransplantHandoff from '@/app/components/garden/GardenTransplantHandoff.vue';
import { useGarden } from '@/app/composables/useGarden';
import { useToast } from '@/app/composables/useToast';
import { useEntitlements } from '@/app/composables/useEntitlements';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  GardenAvailableProgramDto,
  GardenLockedSilhouetteDto,
  GardenPlantItemDto,
} from '@/shared/dto/garden';
import { useMilestoneBadges } from '@/app/composables/useMilestoneBadges';
import { ALL_BADGES_TOTAL } from '@/app/lib/milestoneBadges';
import IconChevronRight from '~icons/lucide/chevron-right';

const route = useRoute();
const router = useRouter();
const garden = useGarden();
const { earnedMilestones, loadMilestones, isLoaded } = useMilestoneBadges();

const achievementsSubtitle = computed(() => {
  const earned = earnedMilestones.value.length;
  if (earned === 0) return 'Открываются по ходу пути';
  return `${earned} из ${ALL_BADGES_TOTAL} получено`;
});
const startingSlug = ref<string | null>(null);
const { getFeatureAccess } = useEntitlements();
const paywallOpen = ref(false);
const roadmapAccess = computed(() => getFeatureAccess('programs.roadmap.full'));
const hasRoadmapAccess = computed(() => roadmapAccess.value.available);

const loreOpen = ref(false);
const selectedLorePlant = ref<GardenPlantItemDto | null>(null);

// State модалки закрытого Сада.
const lockedModalOpen = ref(false);
const selectedLocked = ref<GardenLockedSilhouetteDto | null>(null);

// State для handoff-модалки между садами.
const handoffOpen = ref(false);
const handoffNextProgram = ref<GardenAvailableProgramDto | null>(null);
const handoffPreviousPlant = ref<GardenPlantItemDto | null>(null);

function goBack() {
  void router.push('/');
}

function openLore(plant: GardenPlantItemDto) {
  if (!hasRoadmapAccess.value) {
    paywallOpen.value = true;
    return;
  }
  selectedLorePlant.value = plant;
  loreOpen.value = true;
}

// Переход к карте пути завершённого сада (повторное прохождение / просмотр шагов).
function openMap(plant: GardenPlantItemDto) {
  if (!hasRoadmapAccess.value) {
    paywallOpen.value = true;
    return;
  }
  void router.push(`/programs/${plant.programSlug}/map`);
}

// Информационная модалка для закрытого/будущего сада. Доступ не проверяем —
// это просто рассказ о том, когда сад откроется.
function openLockedProgram(silhouette: GardenLockedSilhouetteDto) {
  selectedLocked.value = silhouette;
  lockedModalOpen.value = true;
}

// Открытие отчётного sheet'а для активной программы. Сейчас финального
// отчёта ещё нет (программа в процессе), но через timeline-fetch внутри
// GardenPlantReportSheet подгрузятся доступные промежуточные отчёты.
function onOpenActiveReports() {
  if (!hasRoadmapAccess.value) {
    paywallOpen.value = true;
    return;
  }
  const active = garden.activePlant.value;
  if (!active) return;
  selectedLorePlant.value = active;
  loreOpen.value = true;
}

function handleStartProgram(programSlug: string) {
  if (!hasRoadmapAccess.value) {
    paywallOpen.value = true;
    return;
  }
  if (startingSlug.value) return;
  const seed = garden.availableSeeds.value.find(
    (s) => s.programSlug === programSlug
  );
  if (!seed) {
    useToast('Сад не найден', 'Попробуй обновить страницу.', 'warning');
    return;
  }
  // Handoff сейчас показывает только превью ближайшего следующего Сада.
  // Итоги завершённых Садов остаются в lore/report-слое Оранжереи.
  handoffNextProgram.value = seed;
  handoffPreviousPlant.value = garden.completedPlants.value[0] ?? null;
  handoffOpen.value = true;
}

function onHandoffStarted(programSlug: string) {
  useToast('Новый сад открыт', 'Можно делать первый шаг.');
  // Сама навигация на /programs/.../map уходит из handoff-компонента после
  // transition-анимации. Здесь только перезагружаем garden snapshot, чтобы
  // на возврате пользователь видел новый Сад как активный.
  void garden.load();
  void programSlug;
}

onMounted(() => {
  void garden.load();
  if (!isLoaded.value) void loadMilestones();
});

// При навигации с in-app модалки/push'а сюда приходим с query `openReport`
// (id отчёта) и `slug` (программа). Когда garden snapshot загружен —
// находим plant и автоматически открываем sheet с timeline.
async function tryOpenReportFromQuery() {
  const openReport = route.query.openReport;
  const slugQuery = route.query.slug;
  if (!openReport || typeof slugQuery !== 'string') return;

  // Ждём пока snapshot загружен (плэйнтекст activePlant/completedPlants).
  if (!garden.snapshot.value) {
    await garden.load();
  }

  // Сначала смотрим в завершённых (финал), потом активную.
  const completed = garden.completedPlants.value.find(
    (p) => p.programSlug === slugQuery
  );
  const active =
    garden.activePlant.value?.programSlug === slugQuery
      ? garden.activePlant.value
      : null;
  const plant = completed ?? active;
  if (plant) {
    selectedLorePlant.value = plant;
    loreOpen.value = true;
  }

  // Чистим query чтобы при повторной навигации не открывалось снова.
  void router.replace({
    query: {
      ...route.query,
      openReport: undefined,
      step: undefined,
      slug: undefined,
    },
  });
}

watch(
  () => [route.query.openReport, route.query.slug] as const,
  ([openReport]) => {
    if (openReport) {
      void tryOpenReportFromQuery();
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.garden-achievements-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    hsl(145 50% 55% / 0.25) 0%,
    hsl(210 60% 65% / 0.2) 100%
  );
  border: 1px solid hsl(145 50% 65% / 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}
</style>
