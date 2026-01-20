<template>
  <div class="h-full flex flex-col z-0">
    <NotificationIndexPage
      title="📋&nbsp;&nbsp;Привычки"
      description="Выберите тему, которая сейчас волнует. <br />
Мы поможем через разговор, практики и напоминания, которые можно настроить под себя."
      mentai-mode="habits"
      :items="habitItems"
      :loading="loadersStore.isSkeletonLoading"
      @select="handleGoalSelect"
      @remove="handleHabitDelete"
      @quick-chat="handleHabitQuickChat"
      @quick-meditation="handleHabitQuickMeditation"
      @quick-breath="handleHabitQuickBreath"
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

<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import NotificationIndexPage, {
  type NotificationIndexItem,
} from '@/app/components/notifications/NotificationIndexPage.vue';
import { BREATH_PRACTICES } from '@/app/lib/breathPracticesCatalog';
import { HABITS_CATALOG, type HabitCatalogItem } from '@/app/lib/habitsCatalog';
import { useUserHabitsStore } from '@/app/stores/userHabits';
import { useLoadersStore } from '@/app/stores/loaders';
import { useChatStore } from '@/app/stores/chat';
import type { HabitDto, TherapyTopicDto } from '@/shared/dto/notifications';
import CustomEntityModal from '@/app/components/modals/CustomEntityModal.vue';
import { useToast } from '@/app/composables/useToast';
import ConfirmModal from '@/app/components/ui/ConfirmModal.vue';
import type { ChatEntryContext } from '@/shared/dto';
import { useEntryChat } from '@/app/composables/useEntryChat';
import type { RouteLocationRaw } from 'vue-router';
import { useRoute, useRouter } from 'vue-router';
import { mapHabitToMeditationTopic } from '@/app/lib/meditations';
import {
  isHabitPracticeHidden,
  mapHabitToBreathGroup,
} from '@/app/lib/practiceActions';

const intentColors: Record<string, string> = {
  build: 'from-blue-500 to-cyan-500',
  quit: 'from-red-500 to-orange-500',
  custom: 'from-gray-500 to-slate-500',
};

const userHabitsStore = useUserHabitsStore();
const chat = useChatStore();
const loadersStore = useLoadersStore();
const { habits: userHabits } = storeToRefs(userHabitsStore);

// Загружаем данные после монтирования компонента (с кэшированием)
// Защита от двойного вызова реализована в store через isSkeletonLoading флаг
onMounted(async () => {
  await userHabitsStore.fetchAll();
});

function buildHabitQuickActions(habitKey: string, isCustom: boolean) {
  if (isCustom) {
    return { chat: true };
  }

  if (isHabitPracticeHidden(habitKey)) {
    return { chat: true };
  }

  return {
    chat: true,
    meditation: Boolean(mapHabitToMeditationTopic(habitKey)),
    breath: Boolean(mapHabitToBreathGroup(habitKey)),
  };
}

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
    quickActions: buildHabitQuickActions(goal.habitKey, false),
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
      // Кастомные привычки — только чат.
      quickActions: buildHabitQuickActions(habit.id, true),
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
  quickActions: {},
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
const router = useRouter();
const defaultIntent = computed<'build' | 'quit'>(() =>
  (route.query.intent as 'build' | 'quit') === 'quit' ? 'quit' : 'build'
);

const { startEntryChat } = useEntryChat();

async function safeNavigate(target: RouteLocationRaw) {
  try {
    await router.push(target);
    await nextTick();
    const resolvedPath =
      typeof target === 'string' ? target : router.resolve(target).fullPath;
    if (router.currentRoute.value.fullPath === resolvedPath) return;
  } catch (error) {
    console.error('[Habits] Router navigation failed:', error);
  }

  if (typeof window !== 'undefined' && window.location) {
    // Фолбэк на прямой переход, если роутер не сработал.
    const fallbackHref =
      typeof target === 'string' ? target : router.resolve(target).href;
    window.location.href = fallbackHref;
  }
}

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
    safeNavigate(`/habits/${payload.habitKey}?intent=${payload.intent}`);
    return;
  }

  if ('id' in payload) {
    // Используем ID для навигации
    safeNavigate(`/habits/${payload.id}?intent=${payload.intent || 'build'}`);
  }
}

function handleHabitCreated(payload: HabitDto | TherapyTopicDto) {
  const habit = payload as HabitDto;
  createModalOpen.value = false;
  // Используем ID для навигации
  safeNavigate(`/habits/${habit.id}?intent=${habit.intent || 'build'}`);
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

function buildHabitEntryContext(
  item: NotificationIndexItem
): ChatEntryContext | null {
  const payload = item.payload as
    | (HabitCatalogItem & { action?: string; intent?: 'build' | 'quit' })
    | (HabitDto & { action?: string; intent?: 'build' | 'quit' })
    | undefined;
  if (!payload || payload.action) return null;

  // Проверяем наличие id для определения типа (HabitDto имеет id, HabitCatalogItem - habitKey)
  const habitId = 'id' in payload ? payload.id : payload.habitKey;
  if (!habitId) return null;
  return {
    type: 'habit',
    habit_id: habitId,
    habit_name: item.name,
    habit_intent: payload.intent || 'build',
    habit_description:
      'description' in payload ? payload.description || undefined : undefined,
  };
}

async function handleHabitQuickChat(item: NotificationIndexItem) {
  chat.entryContext = buildHabitEntryContext(item);

  try {
    await startEntryChat({ mode: 'habits' });
  } catch {
    // useEntryChat уже показал toast
  }
}

function resolveHabitKey(item: NotificationIndexItem): string | null {
  // Достаём ключ системной привычки, чтобы маппить практики.
  const payload = item.payload as
    | { action?: string; habitKey?: string; type?: string }
    | undefined;
  if (payload?.action) return null;
  return payload?.habitKey || (payload?.type === 'catalog' ? item.id : null);
}

async function handleHabitQuickMeditation(item: NotificationIndexItem) {
  const habitKey = resolveHabitKey(item);
  if (!habitKey) return;
  const meditationTopicKey = mapHabitToMeditationTopic(habitKey);
  if (!meditationTopicKey) {
    useToast('Подборка медитаций пока недоступна');
    return;
  }

  await safeNavigate({
    path: '/meditations',
    query: { topic: meditationTopicKey },
  });
}

async function handleHabitQuickBreath(item: NotificationIndexItem) {
  const habitKey = resolveHabitKey(item);
  if (!habitKey) return;
  const groupKey = mapHabitToBreathGroup(habitKey);
  if (!groupKey) {
    useToast('Подборка дыхательных практик пока недоступна');
    return;
  }

  const firstPractice = BREATH_PRACTICES.find((practice) =>
    practice.tags.includes(groupKey)
  );
  if (!firstPractice) {
    useToast('Практика не найдена');
    return;
  }

  await safeNavigate({
    path: `/breath-practices/${firstPractice.slug}`,
    query: { group: groupKey },
  });
}
</script>
