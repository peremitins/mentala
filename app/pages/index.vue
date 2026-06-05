<template>
  <div
    class="relative h-full overflow-y-auto xs:space-y-2 space-y-1 pb-[100px] rounded-lg"
  >
    <!-- Шапка с брендовым логотипом -->
    <PageHeader title="Mentala">
      <template #custom>
        <div class="flex items-center px-4">
          <BrandLogo class="h-7 w-auto select-none" />
        </div>
      </template>
    </PageHeader>

    <!-- Приветствие по локальному времени пользователя (Доброе утро/день/
         вечер/ночи) + дата. -->
    <HomeGreeting />

    <!-- Порядок блоков соответствует Варианту A стратегии главного экрана:
         серия → настроение → герой-Roadmap → росток → компактный ИИ → мысль. -->
    <template v-if="today">
      <HomeStreakCard
        :current="today.streak.current"
        :best="today.streak.best"
        :week="today.streak.week"
        :status="today.streak.status"
        :repair="today.streak.repair"
        :paused-since="today.streak.pausedSince"
        :notice="today.streak.notice"
        :week-details="today.streak.weekDetails"
        style="animation-delay: 0.06s; animation-fill-mode: both"
      />
      <HomeMoodCheckin
        :selected-mood="today.mood?.mood || null"
        :pending="isMoodPending"
        style="animation-delay: 0.1s; animation-fill-mode: both"
        @select="handleMoodSelect"
      />
      <HomeRoadmapCard
        :program="today.program"
        :daily-limit="today.programDailyLimit"
        :available-seeds="gardenSnapshot?.available ?? []"
        style="animation-delay: 0.14s; animation-fill-mode: both"
        @daily-limit-reset="handleDailyLimitReset"
      />
      <HomeEnergyPlantCard
        :energy="today.energy"
        :program="today.program"
        :water-signal="plantWaterSignal"
        :water-intensity="plantWaterIntensity"
        style="animation-delay: 0.18s; animation-fill-mode: both"
      />
      <HomeAssistantCompact
        style="animation-delay: 0.22s; animation-fill-mode: both"
        @paywall="openPaywall"
      />
      <HomeThoughtCard
        :thought="today.thought"
        style="animation-delay: 0.26s; animation-fill-mode: both"
        @saved-change="handleThoughtSavedChange"
      />
    </template>

    <div v-else class="xs:space-y-3 space-y-1">
      <section
        v-for="height in [42, 118, 196, 132, 110, 88]"
        :key="height"
        class="glass-deep animate-pulse"
        :style="{ height: `${height}px` }"
      />
    </div>

    <!-- Paywall-модалка для карточек -->
    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />

    <!-- Модалка непросмотренного итога сессии -->
    <UnseenSummaryModal />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import PageHeader from '@/app/components/PageHeader.vue';
import BrandLogo from '@/app/components/BrandLogo.vue';
import HomeGreeting from '@/app/components/home/HomeGreeting.vue';
import HomeMoodCheckin from '@/app/components/home/HomeMoodCheckin.vue';
import HomeEnergyPlantCard from '@/app/components/home/HomeEnergyPlantCard.vue';
import HomeRoadmapCard from '@/app/components/home/HomeRoadmapCard.vue';
import HomeStreakCard from '@/app/components/home/HomeStreakCard.vue';
import HomeThoughtCard from '@/app/components/home/HomeThoughtCard.vue';
import HomeAssistantCompact from '@/app/components/home/HomeAssistantCompact.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import UnseenSummaryModal from '@/app/components/sessionSummaries/UnseenSummaryModal.vue';
import { useAPI } from '@/app/composables/useAPI';
import { useEntitlements } from '@/app/composables/useEntitlements';
import {
  notifyPlantWater,
  setPlantWaterSnapshot,
} from '@/app/composables/usePlantWaterFeedback';
import { useUnseenSessionSummary } from '@/app/composables/useUnseenSessionSummary';
import type {
  MoodCheckinMood,
  MoodCheckinResponseDto,
  ThoughtOfTheDaySaveResponseDto,
  TodayResponseDto,
} from '@/shared/dto/retention';
import type { GardenResponseDto } from '@/shared/dto/garden';

const { getFeatureAccess } = useEntitlements();
const { loadUnseenSummary } = useUnseenSessionSummary();

const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);
const today = ref<TodayResponseDto | null>(null);
const gardenSnapshot = ref<GardenResponseDto | null>(null);
const isMoodPending = ref(false);
const plantWaterSignal = ref(0);
const plantWaterIntensity = ref<'small' | 'medium' | 'large'>('medium');

const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}

function triggerPlantWater(intensity: 'small' | 'medium' | 'large') {
  plantWaterIntensity.value = intensity;
  plantWaterSignal.value += 1;
  notifyPlantWater({
    intensity,
    source: 'thought_of_the_day',
    energyToday: today.value?.energy.today,
    energyWeekly: today.value?.energy.weekly,
  });
}

async function loadToday() {
  await refreshTodayOnly();
  // Параллельно подтягиваем garden snapshot — нужен для CTA «Посадить
  // следующий сад» на HomeRoadmapCard, когда активная программа завершена,
  // а в Оранжерее есть доступные семена.
  try {
    gardenSnapshot.value = await useAPI<GardenResponseDto>('/api/garden', {
      suppressErrorToast: true,
    });
  } catch (error) {
    // Garden snapshot не критичен для главной — если упал, продолжаем без него.
    console.warn('[Home] garden snapshot fetch failed (non-blocking):', error);
  }
}

async function refreshTodayOnly() {
  today.value = await useAPI<TodayResponseDto>('/api/today', {
    suppressErrorToast: true,
  });
  setPlantWaterSnapshot({
    completedSteps: today.value.program.completedSteps,
    totalSteps: today.value.program.totalSteps,
    plantSetSlug: today.value.program.plantSetSlug,
  });
}

async function handleDailyLimitReset() {
  try {
    await refreshTodayOnly();
  } catch (error) {
    console.warn('[Home] daily-limit refresh failed (non-blocking):', error);
  }
}

async function handleMoodSelect(mood: MoodCheckinMood) {
  if (isMoodPending.value) return;
  isMoodPending.value = true;

  try {
    const response = await useAPI<MoodCheckinResponseDto>('/api/mood/checkin', {
      method: 'POST',
      body: { mood, source: 'home' },
      suppressErrorToast: true,
    });

    if (response.rewardGranted) {
      plantWaterIntensity.value = 'medium';
      plantWaterSignal.value += 1;
      notifyPlantWater({
        intensity: 'medium',
        source: 'mood_checkin',
        energyToday: response.energyToday,
        energyWeekly: today.value?.energy.weekly,
      });
    }

    if (today.value) {
      today.value = {
        ...today.value,
        mood: response.item,
        energy: {
          ...today.value.energy,
          today: response.energyToday,
        },
      };
    }

    await loadToday();
  } catch (error) {
    console.error('[Home] Не удалось сохранить mood check-in:', error);
  } finally {
    isMoodPending.value = false;
  }
}

function handleThoughtSavedChange(response: ThoughtOfTheDaySaveResponseDto) {
  if (!today.value) return;
  if (response.rewardGranted) {
    triggerPlantWater('small');
  }
  today.value = {
    ...today.value,
    thought: response.item,
    energy: {
      ...today.value.energy,
      today: response.energyToday,
      weekly: response.energyWeekly,
    },
  };
}

onMounted(() => {
  void loadUnseenSummary(true).catch(() => {});
  void loadToday().catch((error) => {
    console.error('[Home] Не удалось загрузить retention-сводку:', error);
  });
});
</script>

<style scoped>
@keyframes floaty {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -10px, 0);
  }
}

.tile-orb {
  animation: floaty 10s ease-in-out infinite;
}
.tile-orb--delay {
  animation-delay: -4s;
}
.tile-orb--slow {
  animation-duration: 14s;
}
</style>
