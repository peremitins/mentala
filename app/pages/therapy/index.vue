<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import NotificationIndexPage, {
  type NotificationIndexItem,
} from '@/app/components/notifications/NotificationIndexPage.vue';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import CustomEntityModal from '@/app/components/modals/CustomEntityModal.vue';
import ConfirmModal from '@/app/components/ui/ConfirmModal.vue';
import { useTherapyTopicsStore } from '@/app/stores/therapyTopics';
import type { TherapyTopicDto } from '@/shared/dto/notifications';
import { useToast } from '@/app/composables/useToast';

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
if (!therapyStore.topics.length) {
  await therapyStore.fetchAll();
}
const { topics: userTopics } = storeToRefs(therapyStore);

const customTopicItems = computed<NotificationIndexItem[]>(() =>
  userTopics.value.map((topic) => ({
    id: topic.id,
    name: topic.name,
    description: topic.description || 'Персональная тема',
    emoji: topic.emoji || '💬',
    gradientClass: 'from-gray-500 to-gray-700',
    payload: { ...topic, type: 'custom' },
    canDelete: true,
  }))
);

const baseTopicItems = computed<NotificationIndexItem[]>(() =>
  THERAPY_TOPICS.map((topic) => ({
    id: topic.key,
    name: topic.name,
    description: topic.description,
    emoji: topic.emoji,
    gradientClass: colorSchemes[topic.color] ?? 'from-blue-500 to-cyan-500',
    payload: { type: 'catalog' },
  }))
);

const createCard: NotificationIndexItem = {
  id: '__create_topic',
  name: 'Создать свою терапию',
  description: 'Сформулируйте собственный запрос и настройте тексты под себя',
  emoji: '✨',
  gradientClass: 'from-gray-500 to-gray-700',
  payload: { action: 'create-topic' },
};

const topicItems = computed<NotificationIndexItem[]>(() => [
  ...customTopicItems.value,
  ...baseTopicItems.value,
  createCard,
]);

const createModalOpen = ref(false);
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const pendingDeleteItem = ref<NotificationIndexItem | null>(null);

function handleTopicSelect(item: NotificationIndexItem) {
  const payload = item.payload as
    | { action?: string; type?: string }
    | undefined;
  if (payload?.action === 'create-topic') {
    createModalOpen.value = true;
    return;
  }
  navigateTo(`/therapy/${item.id}`);
}

function handleTopicCreated(topic: TherapyTopicDto) {
  createModalOpen.value = false;
  navigateTo(`/therapy/${topic.id}`);
}

function handleTopicRemove(item: NotificationIndexItem) {
  pendingDeleteItem.value = item;
  deleteModalRef.value?.open();
}

async function confirmDeleteTopic() {
  const item = pendingDeleteItem.value;
  if (!item) return;
  const topic = userTopics.value.find((t) => t.id === item.id);
  if (!topic) return;
  try {
    await therapyStore.remove(topic.id);
    useToast('Тема удалена', 'success');
    if (pendingDeleteItem.value?.id === topic.id) {
      navigateTo('/therapy');
    }
  } catch (error: any) {
    console.error('[Therapy] Failed to delete topic:', error);
    useToast(error?.message || 'Не удалось удалить тему', 'error');
  } finally {
    pendingDeleteItem.value = null;
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <NotificationIndexPage
      title="Терапия"
      description="Здесь вы найдёте готовые темы поддержки и сможете добавить свои, чтобы получать именно те уведомления, которые вам подходят"
      mentai-mode="therapy"
      :items="topicItems"
      @select="handleTopicSelect"
      @remove="handleTopicRemove"
    />

    <CustomEntityModal
      mentai-mode="therapy"
      :open="createModalOpen"
      header-title="Новая тема терапии"
      header-subtitle="Создайте тему под свои запросы: название, описание и эмодзи"
      hero-title="Персонализируйте тему"
      hero-subtitle="Эмодзи поможет быстрее находить её в списке"
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
