<script setup lang="ts">
import { computed } from 'vue';
import NotificationIndexPage, {
  type NotificationIndexItem,
} from '@/app/components/notifications/NotificationIndexPage.vue';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';

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

const topicItems = computed<NotificationIndexItem[]>(() =>
  THERAPY_TOPICS.map((topic) => ({
    id: topic.key,
    name: topic.name,
    description: topic.description,
    emoji: topic.emoji,
    gradientClass: colorSchemes[topic.color] ?? 'from-blue-500 to-cyan-500',
  }))
);

function handleTopicSelect(item: NotificationIndexItem) {
  navigateTo(`/therapy/${item.id}`);
}
</script>

<template>
  <NotificationIndexPage
    title="Терапия"
    description="Персонализированные напоминания о дыхательных практиках, заземлении и других техниках поддержки."
    mentai-mode="therapy"
    :items="topicItems"
    @select="handleTopicSelect"
  />
</template>
