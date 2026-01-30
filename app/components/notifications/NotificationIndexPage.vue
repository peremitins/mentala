<template>
  <div class="space-y-2 h-full overflow-y-auto rounded-lg">
    <PageHeader :title="title" />

    <div class="glass-deep p-4">
      <p class="text-sm text-white" v-html="description" />
    </div>

    <div v-if="mentaiMode === 'habits'" class="px-2">
      <Tabs
        :model-value="selectedIntent"
        @update:model-value="onIntentChange"
        class="w-full"
      >
        <TabsList class="grid grid-cols-2">
          <TabsTrigger value="build">Приобрести</TabsTrigger>
          <TabsTrigger value="quit">Избавиться</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <!-- Скелетоны при загрузке -->
    <Skeleton v-if="loading" type="list-item" :count="5" />

    <!-- Список элементов -->
    <div v-else class="space-y-2 pb-[100px]">
      <div
        v-for="(item, index) in visibleItems"
        :key="item.id"
        :class="[
          'glass-deep group relative w-full overflow-hidden rounded-xl border border-white/10 bg-card/40 text-left transition-all duration-200 hover:border-white/20 hover:shadow-lg',
          !wasSkeletonShown ? 'animate-slide-up' : '',
        ]"
        :style="
          !wasSkeletonShown
            ? `animation-delay: ${index * 0.05}s; animation-fill-mode: both`
            : ''
        "
      >
        <div
          class="absolute right-0 top-0 h-24 w-24 opacity-10 transition-opacity duration-300 group-hover:opacity-20"
        >
          <div
            class="h-full w-full rounded-full bg-gradient-to-br blur-xl"
            :class="item.gradientClass"
          />
        </div>

        <div class="relative flex flex-col">
          <div
            :class="[
              'flex items-start justify-between gap-3 px-4 pt-4 pb-3 transition-colors duration-200 cursor-pointer active:bg-white/5',
              hasQuickActions(item) ? 'rounded-t-xl' : 'rounded-xl',
            ]"
            role="button"
            tabindex="0"
            @click="handleSelect(item)"
            @keydown.enter.prevent="handleSelect(item)"
            @keydown.space.prevent="handleSelect(item)"
          >
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <div
                class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-sm transition-transform duration-300 group-hover:scale-110"
                :class="item.gradientClass"
              >
                {{ item.emoji }}
              </div>

              <div class="text-elevated flex-1 min-w-0 space-y-0.5">
                <div
                  class="flex items-center justify-between gap-2 text-foreground"
                >
                  <h3
                    class="text-base font-semibold text-card-foreground truncate"
                  >
                    {{ item.name }}
                  </h3>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <!-- Иконка состояния уведомлений: колокольчик вкл / перечёркнутый выкл -->
                    <span
                      v-if="item.notificationsEnabled !== undefined"
                      class="flex items-center justify-center rounded-full p-1 text-foreground/80"
                      :title="
                        item.notificationsEnabled
                          ? 'Уведомления включены'
                          : 'Уведомления выключены'
                      "
                    >
                      <IconBell
                        v-if="item.notificationsEnabled"
                        class="h-4 w-4"
                        aria-hidden="true"
                      />
                      <IconBellOff v-else class="h-4 w-4" aria-hidden="true" />
                    </span>
                    <button
                      v-if="item.canDelete"
                      type="button"
                      class="rounded-full p-1 text-foreground transition hover:text-destructive hover:bg-destructive/10"
                      title="Удалить"
                      @click.stop="handleRemove(item)"
                    >
                      <IconTrash class="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div
                  class="flex items-center justify-between gap-2 text-foreground"
                >
                  <p class="text-sm text-foreground line-clamp-2">
                    {{ item.description }}
                  </p>
                  <IconChevronRight class="h-4 w-4 opacity-50 flex-shrink-0" />
                </div>
              </div>
            </div>

            <!-- <div class="flex items-center gap-2 text-muted-foreground">
              <button
                v-if="item.canDelete"
                type="button"
                    class="rounded-full p-1 text-foreground transition hover:text-destructive hover:bg-destructive/10"
                title="Удалить"
                @click.stop="handleRemove(item)"
              >
                <IconTrash class="h-4 w-4" />
              </button>
              <IconChevronRight class="h-4 w-4 opacity-50" />
            </div> -->
          </div>

          <Separator
            v-if="hasQuickActions(item)"
            class="mx-4 w-auto opacity-60"
          />

          <div
            v-if="hasQuickActions(item)"
            class="flex items-center gap-2 px-4 pb-4 pt-3 transition-colors duration-200 cursor-pointer rounded-b-xl active:bg-white/5"
            @click="handleSelect(item)"
          >
            <Button
              v-if="shouldShowQuickChat(item)"
              variant="outline"
              size="sm"
              class="flex-1 border-white/20 bg-white/5 text-xs text-foreground/80 hover:border-white/40 hover:bg-white/10"
              @click.stop="handleQuickChat(item)"
            >
              <IconMessageCircle class="h-4 w-4" />
              Поговорить
            </Button>

            <Button
              v-if="shouldShowQuickMeditation(item)"
              variant="outline"
              size="sm"
              class="flex-1 border-white/20 bg-white/5 text-xs text-foreground/80 hover:border-white/40 hover:bg-white/10"
              @click.stop="handleQuickMeditation(item)"
            >
              <IconLeaf class="h-4 w-4" />
              Медитация
            </Button>

            <Button
              v-if="shouldShowQuickBreath(item)"
              variant="outline"
              size="sm"
              class="flex-1 border-white/20 bg-white/5 text-xs text-foreground/80 hover:border-white/40 hover:bg-white/10"
              @click.stop="handleQuickBreath(item)"
            >
              <IconWind class="h-4 w-4" />
              Дыхание
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PageHeader from '@/app/components/PageHeader.vue';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/shadcn/tabs';
import { Button } from '@/app/components/ui/button';
import { Separator } from '@/app/components/ui/shadcn/separator';
import IconChevronRight from '~icons/lucide/chevron-right';
import IconLeaf from '~icons/lucide/leaf';
import IconMessageCircle from '~icons/lucide/message-circle';
import IconTrash from '~icons/lucide/trash';
import IconWind from '~icons/lucide/wind';
import IconBell from '~icons/lucide/bell';
import IconBellOff from '~icons/lucide/bell-off';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import { useRoute, useRouter } from 'vue-router';

// Отслеживаем, был ли показан скелетон
const wasSkeletonShown = ref(false);

export interface NotificationIndexItem {
  id: string;
  name: string;
  description: string;
  emoji: string;
  gradientClass: string;
  payload?: unknown;
  canDelete?: boolean;
  /** Включены ли уведомления по этой теме (undefined — не показывать иконку, напр. карточка «Создать») */
  notificationsEnabled?: boolean;
  quickActions?: {
    chat?: boolean;
    meditation?: boolean;
    breath?: boolean;
  };
}

const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    items: NotificationIndexItem[];
    mentaiMode: 'habits' | 'therapy';
    loading?: boolean;
  }>(),
  {
    items: () => [],
    loading: false,
  }
);

const emit = defineEmits<{
  (e: 'select', item: NotificationIndexItem): void;
  (e: 'remove', item: NotificationIndexItem): void;
  (e: 'quick-chat', item: NotificationIndexItem): void;
  (e: 'quick-meditation', item: NotificationIndexItem): void;
  (e: 'quick-breath', item: NotificationIndexItem): void;
}>();

const route = useRoute();
const router = useRouter();
const initialIntent = route.query.intent === 'quit' ? 'quit' : 'build';
const selectedIntent = ref<'build' | 'quit'>(initialIntent);

function onIntentChange(newIntent: string | number) {
  const intentValue = String(newIntent) as 'build' | 'quit';
  selectedIntent.value = intentValue;
  router.replace({ query: { ...route.query, intent: intentValue } });
}

// Отслеживаем показ скелетона
watch(
  () => props.loading,
  (isLoading) => {
    if (isLoading) {
      wasSkeletonShown.value = true;
    }
  },
  { immediate: true }
);

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

type ResolvedQuickActions = {
  chat: boolean;
  meditation: boolean;
  breath: boolean;
};

function resolveQuickActions(
  item: NotificationIndexItem
): ResolvedQuickActions {
  if (item.quickActions) {
    return {
      chat: Boolean(item.quickActions.chat),
      meditation: Boolean(item.quickActions.meditation),
      breath: Boolean(item.quickActions.breath),
    };
  }

  // Фолбэк для старого поведения: показываем только чат, если это не action-карта.
  const payload = item.payload as { action?: string } | undefined;
  const isActionCard = Boolean(payload?.action);
  return {
    chat: !isActionCard,
    meditation: false,
    breath: false,
  };
}

function hasQuickActions(item: NotificationIndexItem) {
  const actions = resolveQuickActions(item);
  return actions.chat || actions.meditation || actions.breath;
}

function shouldShowQuickChat(item: NotificationIndexItem) {
  return resolveQuickActions(item).chat;
}

function shouldShowQuickMeditation(item: NotificationIndexItem) {
  return resolveQuickActions(item).meditation;
}

function shouldShowQuickBreath(item: NotificationIndexItem) {
  return resolveQuickActions(item).breath;
}

function handleQuickChat(item: NotificationIndexItem) {
  emit('quick-chat', item);
}

function handleQuickMeditation(item: NotificationIndexItem) {
  emit('quick-meditation', item);
}

function handleQuickBreath(item: NotificationIndexItem) {
  emit('quick-breath', item);
}
</script>
