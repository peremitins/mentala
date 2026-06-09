<template>
  <div class="achievements-page h-full overflow-y-auto">
    <PageHeader title="Достижения" show-back-button @go-back="goBack" />

    <!-- Skeleton при загрузке -->
    <div v-if="isLoading" class="achievements-page__skeleton glass-deep">
      <div v-for="i in 6" :key="i" class="achievements-page__skeleton-item" />
    </div>

    <template v-else>
      <!-- Прогресс-плашка -->
      <div class="achievements-page__progress glass-deep">
        <p class="achievements-page__progress-text">
          Твои награды за пройденный путь
        </p>
        <p class="achievements-page__progress-count">
          <span class="achievements-page__progress-earned">
            {{ earnedCount }}
          </span>
          <span class="achievements-page__progress-total">
            из {{ totalCount }}</span
          >
        </p>
      </div>

      <!-- Единая сетка -->
      <div class="achievements-page__grid glass-deep">
        <MilestoneCard
          v-for="badge in allBadges"
          :key="badge.id"
          :meta="badge"
          :earned="isEarned(badge.id)"
          :earned-at="getEarnedAt(badge.id)"
          @open-celebration="openBadgeCelebration"
        />
      </div>
    </template>

    <!-- Локальный replay-оверлей: открывается по тапу на полученную награду.
         Не трогает pendingCelebration — это повторный просмотр, а не выдача.
         Глобальные новые достижения по-прежнему показываются через layout. -->
    <MilestoneAchievementOverlay
      v-if="previewBadgeId"
      :show="previewVisible"
      :badge-id="previewBadgeId"
      @continue="previewVisible = false"
      @closed="previewBadgeId = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import MilestoneCard from '@/app/components/milestones/MilestoneCard.vue';
import MilestoneAchievementOverlay from '@/app/components/milestones/MilestoneAchievementOverlay.vue';
import { useMilestoneBadges } from '@/app/composables/useMilestoneBadges';
import {
  ALL_BADGES_TOTAL,
  GARDEN_BADGES,
  MILESTONE_BADGES,
  type MilestoneBadgeMeta,
} from '@/app/lib/milestoneBadges';

const {
  earnedMilestones,
  isLoaded,
  loadMilestones,
  checkMilestones,
  isEarned,
  getEarnedAt,
} = useMilestoneBadges();

const isLoading = ref(true);

// Локальный replay-оверлей при тапе по полученной награде.
const previewBadgeId = ref<string | null>(null);
const previewVisible = ref(false);

onMounted(async () => {
  if (!isLoaded.value) {
    await loadMilestones();
  }
  isLoading.value = false;
  // Полная проверка: бэкфиллит достижения для уже существующих данных.
  // Celebration показывается глобально через MilestoneAchievementOverlay в layout.
  await checkMilestones('full_check');
});

// Все достижения в одной плоской сетке: сначала универсальные, потом все 9 садов.
// Сады всегда видны (locked/earned) — не зависят от того, завершены они или нет.
const allBadges = computed<MilestoneBadgeMeta[]>(() => [
  ...MILESTONE_BADGES,
  ...GARDEN_BADGES,
]);

const earnedCount = computed(() => earnedMilestones.value.length);
const totalCount = ALL_BADGES_TOTAL;

function goBack() {
  void navigateTo('/');
}

function openBadgeCelebration(meta: MilestoneBadgeMeta) {
  // Перезапуск: если оверлей уже открыт — сначала сбрасываем, чтобы анимация
  // проиграла заново для нового бейджа.
  previewBadgeId.value = meta.id;
  previewVisible.value = true;
}
</script>

<style scoped>
.achievements-page {
  /* h-full + overflow-y-auto задаётся в template-классах.
     padding-bottom учитывает BottomNav (~88px) + safe area */
  padding-bottom: max(110px, calc(88px + env(safe-area-inset-bottom, 0px)));
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* Плавный scroll на iOS */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* Skeleton */
.achievements-page__skeleton {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.achievements-page__skeleton-item {
  aspect-ratio: 1;
  border-radius: 50%;
  background: hsl(var(--muted) / 0.4);
  animation: ach-skeleton-pulse 1.6s ease-in-out infinite;
}

@keyframes ach-skeleton-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

/* Прогресс */
.achievements-page__progress {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.achievements-page__progress-text {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  line-height: 1.4;
  flex: 1;
}

.achievements-page__progress-count {
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 0;
}

.achievements-page__progress-earned {
  font-size: 20px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.achievements-page__progress-total {
  color: hsl(var(--muted-foreground));
}

/* Сетка */
.achievements-page__grid {
  padding: 20px 16px 24px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px 8px;
  justify-items: center;
}
</style>
