<script setup lang="ts">
import { computed } from 'vue';
import NotificationIndexPage, {
  type NotificationIndexItem,
} from '@/app/components/notifications/NotificationIndexPage.vue';
import { HABITS_CATALOG, type HabitCatalogItem } from '@/app/lib/habitsCatalog';

const intentColors = {
  build: 'from-blue-500 to-cyan-500',
  quit: 'from-red-500 to-orange-500',
  custom: 'from-gray-500 to-gray-600',
};

const habitItems = computed<NotificationIndexItem[]>(() =>
  HABITS_CATALOG.map((goal) => ({
    id: goal.habitKey,
    name: goal.name,
    description: goal.description,
    emoji: goal.emoji,
    gradientClass: intentColors[goal.intent],
    payload: goal,
  }))
);

function handleGoalSelect(item: NotificationIndexItem) {
  const goal = item.payload as HabitCatalogItem | undefined;
  if (!goal) return;
  navigateTo(`/habits/${goal.habitKey}?intent=${goal.intent}`);
}
</script>

<template>
  <NotificationIndexPage
    title="Привычки"
    description="Персонализированные напоминания о полезных привычках: медитация, сон, питание, движение и другие."
    mentai-mode="habits"
    :items="habitItems"
    @select="handleGoalSelect"
  />
</template>
