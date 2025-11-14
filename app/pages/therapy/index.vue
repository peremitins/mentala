<script setup lang="ts">
import { ref } from 'vue';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/app/components/ui/shadcn/tabs';
import PromptsSection from '@/app/components/prompts/PromptsSection.vue';

const route = useRoute();
const router = useRouter();

// Текущий активный таб (из query params или по умолчанию 'notifications')
const activeTab = ref<string>((route.query.tab as string) || 'notifications');

// Обновление query params при смене таба
watch(activeTab, (newTab) => {
  router.replace({ query: { ...route.query, tab: newTab } });
});

const hoveredTopic = ref<string | null>(null);

// Цветовые схемы для тем
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

// Переход на настройку темы
function handleTopicSelect(topicKey: string) {
  navigateTo(`/therapy/${topicKey}`);
}
</script>

<template>
  <div class="glass-deep px-2 space-y-6 h-full overflow-y-auto">
    <PageHeader title="Терапия" />

    <Tabs v-model="activeTab" class="w-full">
      <TabsList class="w-full grid grid-cols-2">
        <TabsTrigger value="notifications">Уведомления</TabsTrigger>
        <TabsTrigger value="prompts">Промпты</TabsTrigger>
      </TabsList>

      <TabsContent value="notifications" class="space-y-4 mt-4">
        <!-- Описание -->
        <div class="px-2">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Персонализированные напоминания о дыхательных практиках, заземлении
            и других техниках поддержки.
          </p>
        </div>

        <!-- Список доступных тем -->
        <div class="px-2 space-y-2">
          <button
            v-for="topic in THERAPY_TOPICS"
            :key="topic.key"
            type="button"
            class="group relative w-full overflow-hidden rounded-xl border-2 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-800"
            :class="
              hoveredTopic === topic.key
                ? 'border-blue-500 dark:border-blue-600'
                : 'border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-blue-700'
            "
            @mouseenter="hoveredTopic = topic.key"
            @mouseleave="hoveredTopic = null"
            @click="handleTopicSelect(topic.key)"
          >
            <!-- Фоновый градиент -->
            <div
              class="absolute right-0 top-0 h-24 w-24 opacity-5 transition-opacity duration-300 group-hover:opacity-10"
            >
              <div
                class="h-full w-full rounded-full bg-gradient-to-br blur-xl"
                :class="colorSchemes[topic.color]"
              />
            </div>

            <div class="relative flex items-center justify-between">
              <!-- Иконка и текст -->
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <div
                  class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-sm transition-transform duration-300 group-hover:scale-110"
                  :class="colorSchemes[topic.color]"
                >
                  {{ topic.emoji }}
                </div>

                <div class="flex-1 min-w-0">
                  <h3
                    class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate"
                  >
                    {{ topic.name }}
                  </h3>
                  <p
                    class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2"
                  >
                    {{ topic.description }}
                  </p>
                </div>
              </div>

              <!-- Стрелка -->
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center text-gray-400 transition-all duration-300 group-hover:translate-x-1 group-hover:text-blue-600 dark:group-hover:text-blue-400"
              >
                <svg
                  class="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </button>
        </div>
      </TabsContent>

      <TabsContent value="prompts" class="space-y-4 mt-4 px-2">
        <PromptsSection type="therapy" />
      </TabsContent>
    </Tabs>
  </div>
</template>
