<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/app/components/ui/shadcn/tabs';
import PromptsSection from '@/app/components/prompts/PromptsSection.vue';
import Combobox from '@/app/components/Combobox.vue';
import { INTENT_OPTIONS } from '@/app/constants/select-options';
import {
  HABITS_CATALOG,
  type HabitCatalogItem,
  getHabitsByIntent,
} from '@/app/lib/habitsCatalog';

const route = useRoute();
const router = useRouter();

// Текущий активный таб (из query params или по умолчанию 'notifications')
const activeTab = ref<string>((route.query.tab as string) || 'notifications');

// Обновление query params при смене таба
watch(activeTab, (newTab) => {
  router.replace({ query: { ...route.query, tab: newTab } });
});

// Выбранный intent (из query params или по умолчанию 'build')
const selectedIntent = ref<'build' | 'quit' | 'custom'>(
  (route.query.intent as 'build' | 'quit' | 'custom') || 'build'
);

// Обновление query params при смене intent
watch(selectedIntent, (newIntent) => {
  router.replace({ query: { ...route.query, intent: newIntent } });
});

// Используем каталог из отдельного файла
const habitsCatalog = HABITS_CATALOG;

// Фильтруем привычки по выбранному intent
const filteredHabits = computed(() => {
  // Используем дефолтное значение если selectedIntent пустой или custom
  const intentValue = selectedIntent.value || 'build';
  if (intentValue === 'custom') {
    return []; // Custom пока не реализован
  }
  const intent = intentValue as 'build' | 'quit';
  return getHabitsByIntent(intent);
});

const hoveredGoal = ref<string | null>(null);

// Цвет по intent
const intentColors = {
  build: 'from-blue-500 to-cyan-500',
  quit: 'from-red-500 to-orange-500',
  custom: 'from-gray-500 to-gray-600',
};

// Переход на настройку привычки
function handleGoalSelect(goal: HabitCatalogItem) {
  // Переходим на специальную страницу для настройки этой привычки
  // Сохраняем intent в query для возврата назад
  navigateTo(`/habits/${goal.habitKey}?intent=${goal.intent}`);
}
</script>

<template>
  <div class="glass-deep px-2 space-y-6 h-full overflow-y-auto">
    <PageHeader title="Привычки" />

    <Tabs v-model="activeTab" class="w-full">
      <TabsList class="w-full grid grid-cols-2">
        <TabsTrigger value="notifications">Уведомления</TabsTrigger>
        <TabsTrigger value="prompts">Промпты</TabsTrigger>
      </TabsList>

      <TabsContent value="notifications" class="space-y-4 mt-4">
        <!-- Описание -->
        <div class="px-2">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Персонализированные напоминания о полезных привычках: медитация,
            сон, питание, движение и другие.
          </p>
        </div>

        <!-- Селект типа привычки (intent) -->
        <div class="px-2">
          <Combobox
            v-model="selectedIntent"
            :options="INTENT_OPTIONS"
            placeholder="Выберите тип"
            class="max-w-[200px]"
          />
        </div>

        <!-- Список доступных привычек -->
        <div class="px-2 space-y-2">
          <button
            v-for="goal in filteredHabits"
            :key="goal.habitKey"
            type="button"
            class="group relative w-full overflow-hidden rounded-xl border-2 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-800"
            :class="
              hoveredGoal === goal.habitKey
                ? 'border-blue-500 dark:border-blue-600'
                : 'border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-blue-700'
            "
            @mouseenter="hoveredGoal = goal.habitKey"
            @mouseleave="hoveredGoal = null"
            @click="handleGoalSelect(goal)"
          >
            <!-- Фоновый градиент -->
            <div
              class="absolute right-0 top-0 h-24 w-24 opacity-5 transition-opacity duration-300 group-hover:opacity-10"
            >
              <div
                class="h-full w-full rounded-full bg-gradient-to-br blur-xl"
                :class="intentColors[goal.intent]"
              />
            </div>

            <div class="relative flex items-center justify-between">
              <!-- Иконка и текст -->
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <div
                  class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-sm transition-transform duration-300 group-hover:scale-110"
                  :class="intentColors[goal.intent]"
                >
                  {{ goal.emoji }}
                </div>

                <div class="flex-1 min-w-0">
                  <h3
                    class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate"
                  >
                    {{ goal.name }}
                  </h3>
                  <p class="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {{ goal.description }}
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
        <PromptsSection type="habits" />
      </TabsContent>
    </Tabs>
  </div>
</template>
