<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import NotificationIndexPage, {
  type NotificationIndexItem,
} from '@/app/components/notifications/NotificationIndexPage.vue';
import { HABITS_CATALOG, type HabitCatalogItem } from '@/app/lib/habitsCatalog';
import { useUserHabitsStore } from '@/app/stores/userHabits';
import type { HabitDto, TherapyTopicDto } from '@/shared/dto/notifications';
import CustomEntityModal from '@/app/components/modals/CustomEntityModal.vue';
import { useToast } from '@/app/composables/useToast';
import ConfirmModal from '@/app/components/ui/ConfirmModal.vue';

const intentColors: Record<string, string> = {
  build: 'from-blue-500 to-cyan-500',
  quit: 'from-red-500 to-orange-500',
  custom: 'from-gray-500 to-slate-500',
};

const userHabitsStore = useUserHabitsStore();
if (!userHabitsStore.habits.length) {
  await userHabitsStore.fetchAll();
}
const { habits: userHabits } = storeToRefs(userHabitsStore);

const baseHabitItems = computed(() =>
  HABITS_CATALOG.map((goal) => ({
    id: goal.habitKey,
    name: goal.name,
    description: goal.description,
    emoji: goal.emoji,
    gradientClass:
      intentColors[goal.intent] ||
      intentColors.custom ||
      'from-gray-500 to-slate-500',
    payload: { ...goal, intent: goal.intent },
  }))
);

const customHabitItems = computed(() =>
  userHabits.value.map((habit) => {
    const normalizedIntent = habit.intent === 'quit' ? 'quit' : 'build';
    return {
      id: habit.id, // Используем ID
      name: habit.name,
      description: habit.description || 'Персональная привычка',
      emoji: habit.emoji || '✨',
      gradientClass:
        intentColors[habit.intent] ||
        intentColors[normalizedIntent] ||
        intentColors.custom ||
        'from-gray-500 to-slate-500',
      payload: { ...habit, type: 'user', intent: normalizedIntent },
      canDelete: true,
    };
  })
);

const createCard: NotificationIndexItem = {
  id: '__create_habit',
  name: 'Создать свою привычку',
  description: 'Настройте свои напоминания под себя: название, текст и частоту',
  emoji: '🛠️',
  gradientClass: 'from-gray-500 to-gray-700',
  payload: {
    action: 'create-habit',
  },
};

const habitItems = computed(() => [
  ...customHabitItems.value,
  ...baseHabitItems.value,
  createCard,
]);

const createModalOpen = ref(false);
const deletingId = ref<string | null>(null);
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const pendingDeleteItem = ref<NotificationIndexItem | null>(null);
const route = useRoute();
const defaultIntent = computed<'build' | 'quit'>(() =>
  (route.query.intent as 'build' | 'quit') === 'quit' ? 'quit' : 'build'
);

function handleGoalSelect(item: NotificationIndexItem) {
  const payload = item.payload as
    | (HabitCatalogItem & { type?: string })
    | (HabitDto & { type?: string; action?: string })
    | undefined;

  if (payload && 'action' in payload && payload.action === 'create-habit') {
    createModalOpen.value = true;
    return;
  }

  if (!payload) return;

  if ('habitKey' in payload && payload.habitKey) {
    navigateTo(`/habits/${payload.habitKey}?intent=${payload.intent}`);
    return;
  }

  if ('id' in payload) {
    // Используем ID для навигации
    navigateTo(`/habits/${payload.id}?intent=${payload.intent || 'build'}`);
  }
}

function handleHabitCreated(payload: HabitDto | TherapyTopicDto) {
  const habit = payload as HabitDto;
  createModalOpen.value = false;
  // Используем ID для навигации
  navigateTo(`/habits/${habit.id}?intent=${habit.intent || 'build'}`);
}

function handleHabitDelete(item: NotificationIndexItem) {
  const habit = item.payload as HabitDto | undefined;
  if (!habit) return;
  pendingDeleteItem.value = item;
  deleteModalRef.value?.open();
}

async function confirmDeleteHabit() {
  const item = pendingDeleteItem.value;
  if (!item) return;
  const habit = item.payload as HabitDto | undefined;
  if (!habit) return;
  deletingId.value = habit.id;
  try {
    await userHabitsStore.remove(habit.id);
    useToast('Привычка удалена');
    if (route.params.id === habit.id) {
      navigateTo('/habits');
    }
  } catch (error: any) {
    console.error('[Habits] Failed to delete habit:', error);
    useToast(error?.message || 'Не удалось удалить привычку');
  } finally {
    deletingId.value = null;
    pendingDeleteItem.value = null;
  }
}
</script>

<template>
  <div class="h-full flex flex-col z-0">
    <NotificationIndexPage
      title="📋&nbsp;&nbsp;Привычки"
      description="Здесь вы найдёте готовые привычки и сможете добавить свои, чтобы получать именно те уведомления, которые вам подходят"
      mentai-mode="habits"
      :items="habitItems"
      @select="handleGoalSelect"
      @remove="handleHabitDelete"
    />

    <CustomEntityModal
      mentai-mode="habits"
      :open="createModalOpen"
      :default-intent="defaultIntent"
      header-title="Новая привычка"
      header-subtitle="Настройте свою привычку: выберите цель, добавьте описание и сохраните"
      hero-title="Персонализируйте тему"
      hero-subtitle="Эмодзи поможет быстрее находить её в списке"
      submit-label="Создать и настроить"
      @update:open="createModalOpen = $event"
      @created="handleHabitCreated"
    />

    <ConfirmModal
      ref="deleteModalRef"
      title="Удалить привычку?"
      subtitle="Настройка уведомлений и расписание будут удалены. Это действие необратимо."
      confirm-label="Удалить"
      cancel-label="Отмена"
      @confirm="confirmDeleteHabit"
    />
  </div>
</template>
