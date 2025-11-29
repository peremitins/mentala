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
import IconTrash from '~icons/lucide/trash';

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
  <div class="space-y-6 h-full overflow-y-auto rounded-sm">
    <PageHeader :title="title" />

    <Tabs v-model="activeTab" class="w-full pb-[100px]">
      <TabsList class="w-full grid grid-cols-2">
        <TabsTrigger value="notifications">Уведомления</TabsTrigger>
        <TabsTrigger value="prompts">Промпты</TabsTrigger>
      </TabsList>

      <TabsContent value="notifications" class="space-y-4 mt-4">
        <div class="px-2">
          <p class="text-sm text-muted-foreground">
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

        <div class="space-y-2">
          <button
            v-for="item in visibleItems"
            :key="item.id"
            type="button"
            class="group relative w-full overflow-hidden rounded-xl border-2 border-border bg-card p-4 text-left transition-all duration-200 hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-lg"
            @mouseenter="hoveredId = item.id"
            @mouseleave="hoveredId = null"
            @click="handleSelect(item)"
          >
            <div
              class="absolute right-0 top-0 h-24 w-24 opacity-10 transition-opacity duration-300 group-hover:opacity-20"
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
                    class="text-base font-semibold text-card-foreground truncate"
                  >
                    {{ item.name }}
                  </h3>
                  <p class="text-xs text-muted-foreground truncate">
                    {{ item.description }}
                  </p>
                </div>
              </div>

              <div
                class="flex h-8 w-16 flex-shrink-0 items-center justify-end text-muted-foreground transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary group-hover:border-primary"
              >
                <button
                  v-if="item.canDelete"
                  type="button"
                  class="rounded-full p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition z-10"
                  title="Удалить привычку"
                  @click.stop="handleRemove(item)"
                >
                  <IconTrash class="h-4 w-4" />
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
