<template>
  <div class="h-full flex flex-col z-0">
    <NotificationIndexPage
      title="🧠&nbsp;&nbsp;Терапия"
      description="Выберите тему, которая сейчас волнует. <br />
Мы поможем через разговор, практики и напоминания, которые можно настроить под себя."
      mentai-mode="therapy"
      :items="topicItems"
      :loading="loadersStore.isSkeletonLoading"
      @select="handleTopicSelect"
      @remove="handleTopicRemove"
      @quick-chat="handleTherapyQuickChat"
      @quick-meditation="handleTherapyQuickMeditation"
      @quick-breath="handleTherapyQuickBreath"
    />

    <CustomEntityModal
      mentai-mode="therapy"
      :open="createModalOpen"
      header-title="Новая тема терапии"
      header-subtitle="Создайте тему под свои запросы: название, описание и эмодзи"
      submit-label="Создать и настроить"
      name-placeholder="Например, «Поддержка перед выступлением»"
      @update:open="createModalOpen = $event"
      @created="handleTopicCreated"
    />

    <ConfirmModal
      ref="deleteModalRef"
      title="Удалить тему?"
      subtitle="Расписание уведомлений по этой теме будет удалено. Продолжить?"
      confirm-label="Удалить"
      cancel-label="Отмена"
      @confirm="confirmDeleteTopic"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useChatStore } from '@/app/stores/chat';
import NotificationIndexPage, {
  type NotificationIndexItem,
} from '@/app/components/notifications/NotificationIndexPage.vue';
import { BREATH_PRACTICES } from '@/app/lib/breathPracticesCatalog';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import CustomEntityModal from '@/app/components/modals/CustomEntityModal.vue';
import ConfirmModal from '@/app/components/ui/ConfirmModal.vue';
import { useTherapyTopicsStore } from '@/app/stores/therapyTopics';
import { useLoadersStore } from '@/app/stores/loaders';
import type { TherapyTopicDto } from '@/shared/dto/notifications';
import { useToast } from '@/app/composables/useToast';
import { useEntryChat } from '@/app/composables/useEntryChat';
import type { ChatEntryContext } from '@/shared/dto';
import type { RouteLocationRaw } from 'vue-router';
import { useRouter, useRoute } from 'vue-router';
import { mapTherapyToMeditationTopic } from '@/app/lib/meditations';
import {
  isTherapyPracticeHidden,
  mapTherapyToBreathGroup,
} from '@/app/lib/practiceActions';

const colorSchemes: Record<string, string> = {
  blue: 'from-blue-500 to-cyan-500',
  gray: 'from-gray-500 to-gray-600',
  yellow: 'from-yellow-500 to-orange-500',
  purple: 'from-purple-500 to-pink-500',
  red: 'from-red-500 to-rose-500',
  pink: 'from-pink-500 to-rose-500',
  green: 'from-green-500 to-emerald-500',
  indigo: 'from-indigo-500 to-purple-500',
  slate: 'from-slate-500 to-gray-500',
  orange: 'from-orange-500 to-red-500',
};

const therapyStore = useTherapyTopicsStore();
const loadersStore = useLoadersStore();
const { topics: userTopics } = storeToRefs(therapyStore);
const router = useRouter();
const route = useRoute();

// Загружаем данные после монтирования компонента (с кэшированием)
// Защита от двойного вызова реализована в store через isSkeletonLoading флаг
onMounted(async () => {
  await therapyStore.fetchAll();
});

function buildTherapyQuickActions(topicKey: string, isCustom: boolean) {
  if (isCustom) {
    return { chat: true };
  }

  if (isTherapyPracticeHidden(topicKey)) {
    return { chat: true };
  }

  return {
    chat: true,
    meditation: Boolean(mapTherapyToMeditationTopic(topicKey)),
    breath: Boolean(mapTherapyToBreathGroup(topicKey)),
  };
}

const customTopicItems = computed<NotificationIndexItem[]>(() =>
  userTopics.value.map((topic) => {
    return {
      id: topic.id, // Используем ID
      name: topic.name,
      description: topic.description || 'Персональная тема',
      emoji: topic.emoji || '💬',
      gradientClass: 'from-gray-500 to-gray-700',
      payload: { ...topic, type: 'custom' },
      canDelete: true,
      // Показываем только чат для кастомных тем.
      quickActions: buildTherapyQuickActions(topic.id, true),
    };
  })
);

const baseTopicItems = computed<NotificationIndexItem[]>(() =>
  THERAPY_TOPICS.map((topic) => ({
    id: topic.key,
    name: topic.name,
    description: topic.description,
    emoji: topic.emoji,
    gradientClass: colorSchemes[topic.color] ?? 'from-blue-500 to-cyan-500',
    payload: { type: 'catalog', topicKey: topic.key, topicName: topic.name },
    quickActions: buildTherapyQuickActions(topic.key, false),
  }))
);

const createCard: NotificationIndexItem = {
  id: '__create_topic',
  name: 'Создать свою терапию',
  description: 'Сформулируйте собственный запрос и настройте тексты под себя',
  emoji: '✨',
  gradientClass: 'from-gray-500 to-gray-700',
  payload: { action: 'create-topic' },
  quickActions: {},
};

const topicItems = computed<NotificationIndexItem[]>(() => [
  ...customTopicItems.value,
  ...baseTopicItems.value,
  createCard,
]);

const createModalOpen = ref(false);
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const pendingDeleteItem = ref<NotificationIndexItem | null>(null);
const { startEntryChat } = useEntryChat();

async function safeNavigate(target: RouteLocationRaw) {
  try {
    await router.push(target);
    await nextTick();
    const resolvedPath =
      typeof target === 'string' ? target : router.resolve(target).fullPath;
    if (router.currentRoute.value.fullPath === resolvedPath) return;
  } catch (error) {
    console.error('[Therapy] Router navigation failed:', error);
  }

  if (typeof window !== 'undefined' && window.location) {
    // Фолбэк на прямой переход, если роутер не сработал.
    const fallbackHref =
      typeof target === 'string' ? target : router.resolve(target).href;
    window.location.href = fallbackHref;
  }
}

function handleTopicSelect(item: NotificationIndexItem) {
  const payload = item.payload as
    | { action?: string; type?: string }
    | undefined;
  if (payload?.action === 'create-topic') {
    createModalOpen.value = true;
    return;
  }
  // Используем ID для навигации
  safeNavigate(`/therapy/${item.id}`);
}

function handleTopicCreated(topic: TherapyTopicDto) {
  createModalOpen.value = false;
  // Используем ID для навигации
  safeNavigate(`/therapy/${topic.id}`);
}

function handleTopicRemove(item: NotificationIndexItem) {
  pendingDeleteItem.value = item;
  deleteModalRef.value?.open();
}

async function confirmDeleteTopic() {
  const item = pendingDeleteItem.value;
  if (!item) return;
  // Ищем тему по ID
  const topic = userTopics.value.find((t) => t.id === item.id);
  if (!topic) {
    console.error('[Therapy] Topic not found for deletion:', item.id);
    useToast('Тема не найдена');
    pendingDeleteItem.value = null;
    return;
  }
  try {
    await therapyStore.remove(topic.id);
    useToast('Тема удалена');
    // Проверяем, находимся ли мы на странице удаленной темы
    if (route.params.key === item.id) {
      navigateTo('/therapy');
    }
  } catch (error: any) {
    console.error('[Therapy] Failed to delete topic:', error);
    useToast(error?.message || 'Не удалось удалить тему');
  } finally {
    pendingDeleteItem.value = null;
  }
}

function buildTherapyEntryContext(
  item: NotificationIndexItem
): ChatEntryContext | null {
  const payload = item.payload as
    | (TherapyTopicDto & { action?: string })
    | { action?: string; topicKey?: string; topicName?: string }
    | undefined;

  if (!payload || payload.action) return null;

  // Проверяем наличие id для определения типа (TherapyTopicDto имеет id, каталог - topicKey)
  const topicId = 'id' in payload ? payload.id : payload.topicKey || item.id;
  if (!topicId) return null;

  return {
    type: 'therapy_topic',
    topic_id: topicId,
    topic_name: item.name,
    topic_description:
      'description' in payload ? payload.description || undefined : undefined,
  };
}

async function handleTherapyQuickChat(item: NotificationIndexItem) {
  const chat = useChatStore();
  chat.entryContext = buildTherapyEntryContext(item);

  try {
    startEntryChat();
  } catch {
    // useEntryChat уже показал toast
  }
}

function resolveTherapyTopicKey(item: NotificationIndexItem): string | null {
  // Достаём ключ системной темы, чтобы маппить практики.
  const payload = item.payload as
    | { action?: string; type?: string; topicKey?: string }
    | undefined;
  if (payload?.action) return null;
  return payload?.topicKey || (payload?.type === 'catalog' ? item.id : null);
}

async function handleTherapyQuickMeditation(item: NotificationIndexItem) {
  const topicKey = resolveTherapyTopicKey(item);
  if (!topicKey) return;
  const meditationTopicKey = mapTherapyToMeditationTopic(topicKey);
  if (!meditationTopicKey) {
    useToast('Подборка медитаций пока недоступна');
    return;
  }

  await safeNavigate({
    path: '/meditations',
    query: { topic: meditationTopicKey },
  });
}

async function handleTherapyQuickBreath(item: NotificationIndexItem) {
  const topicKey = resolveTherapyTopicKey(item);
  if (!topicKey) return;
  const groupKey = mapTherapyToBreathGroup(topicKey);
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
