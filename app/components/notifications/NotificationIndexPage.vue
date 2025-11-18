<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PageHeader from '@/app/components/PageHeader.vue';
import PromptsSection from '@/app/components/prompts/PromptsSection.vue';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/components/ui/shadcn/tabs';
import Combobox from '@/app/components/Combobox.vue';
import { INTENT_OPTIONS } from '@/app/constants/select-options';

export interface NotificationIndexItem {
  id: string;
  name: string;
  description: string;
  emoji: string;
  gradientClass: string;
  payload?: unknown;
  canDelete?: boolean;
}

const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    items: NotificationIndexItem[];
    mentaiMode: 'habits' | 'therapy';
  }>(),
  {
    items: () => [],
  }
);

const emit = defineEmits<{
  (e: 'select', item: NotificationIndexItem): void;
  (e: 'remove', item: NotificationIndexItem): void;
}>();

const route = useRoute();
const router = useRouter();
const activeTab = ref<string>((route.query.tab as string) || 'notifications');
const initialIntent = route.query.intent === 'quit' ? 'quit' : 'build';
const selectedIntent = ref<'build' | 'quit'>(initialIntent);

watch(activeTab, (newTab) => {
  router.replace({ query: { ...route.query, tab: newTab } });
});

if (props.mentaiMode === 'habits') {
  watch(selectedIntent, (newIntent) => {
    router.replace({ query: { ...route.query, intent: newIntent } });
  });
}

const hoveredId = ref<string | null>(null);

const visibleItems = computed(() => {
  if (props.mentaiMode !== 'habits') {
    return props.items;
  }

  const intentValue = selectedIntent.value || 'build';
  return props.items.filter((item) => {
    const payload = item.payload as
      | {
          intent?: 'build' | 'quit';
          action?: string;
        }
      | undefined;
    if (payload?.action === 'create-habit') {
      return true;
    }
    return payload?.intent === intentValue;
  });
});

function handleSelect(item: NotificationIndexItem) {
  emit('select', item);
}

function handleRemove(item: NotificationIndexItem) {
  emit('remove', item);
}
</script>

<template>
  <div class="glass-deep px-2 space-y-6 h-full overflow-y-auto">
    <PageHeader :title="title" />

    <Tabs v-model="activeTab" class="w-full">
      <TabsList class="w-full grid grid-cols-2">
        <TabsTrigger value="notifications">Уведомления</TabsTrigger>
        <TabsTrigger value="prompts">Промпты</TabsTrigger>
      </TabsList>

      <TabsContent value="notifications" class="space-y-4 mt-4">
        <div class="px-2">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ description }}
          </p>
        </div>

        <div v-if="mentaiMode === 'habits'" class="px-2">
          <Combobox
            v-model="selectedIntent"
            :options="INTENT_OPTIONS"
            placeholder="Выберите тип"
            class="max-w-[200px]"
          />
        </div>

        <div class="px-2 space-y-2">
          <button
            v-for="item in visibleItems"
            :key="item.id"
            type="button"
            class="group relative w-full overflow-hidden rounded-xl border-2 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-800"
            :class="
              hoveredId === item.id
                ? 'border-blue-500 dark:border-blue-600'
                : 'border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-blue-700'
            "
            @mouseenter="hoveredId = item.id"
            @mouseleave="hoveredId = null"
            @click="handleSelect(item)"
          >
            <div
              class="absolute right-0 top-0 h-24 w-24 opacity-5 transition-opacity duration-300 group-hover:opacity-10"
            >
              <div
                class="h-full w-full rounded-full bg-gradient-to-br blur-xl"
                :class="item.gradientClass"
              />
            </div>

            <div class="relative flex items-center justify-between">
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <div
                  class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-sm transition-transform duration-300 group-hover:scale-110"
                  :class="item.gradientClass"
                >
                  {{ item.emoji }}
                </div>

                <div class="flex-1 min-w-0">
                  <h3
                    class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate"
                  >
                    {{ item.name }}
                  </h3>
                  <p class="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {{ item.description }}
                  </p>
                </div>
              </div>

              <div
                class="flex h-8 w-16 flex-shrink-0 items-center justify-center text-gray-400 transition-all duration-300 group-hover:translate-x-1 group-hover:text-blue-600 dark:group-hover:text-blue-400"
              >
                <button
                  v-if="item.canDelete"
                  type="button"
                  class="rounded-full p-1 text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition z-10"
                  title="Удалить привычку"
                  @click.stop="handleRemove(item)"
                >
                  <svg
                    class="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M3 6h18M9 6V4h6v2m-7 4v8m4-8v8m-7 8h12a2 2 0 002-2V6H5v12a2 2 0 002 2z"
                    />
                  </svg>
                </button>
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
        <PromptsSection :type="mentaiMode" />
      </TabsContent>
    </Tabs>
  </div>
</template>
