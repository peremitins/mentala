<template>
  <div class="space-y-4 h-full overflow-y-auto rounded-lg pb-[100px]">
    <PageHeader :title="entityName" :show-back-button="true" @go-back="goBack">
      <template #custom>
        <div class="flex items-center gap-2 flex-1 overflow-hidden">
          <div class="flex flex-shrink-0 items-center justify-center text-2xl">
            {{ entityEmoji }}
          </div>
          <div class="flex-1 min-w-0 space-y-1.5">
            <div ref="titleInputContainerRef" class="flex items-center gap-2">
              <template v-if="isEditingTitle">
                <Input
                  ref="titleInputRef"
                  v-model="titleDraft"
                  type="text"
                  class="flex-1 h-8"
                  :maxlength="120"
                  :show-clear-button="true"
                  @keydown.esc.prevent="finishTitleEdit"
                />
              </template>
              <template v-else>
                <h1 class="text-xl font-bold text-foreground w-full truncate">
                  {{ entityName }}
                </h1>
                <button
                  v-if="canEditCustomEntity"
                  type="button"
                  class="text-muted-foreground hover:text-foreground transition"
                  @click="startEditTitle"
                  aria-label="Редактировать название"
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
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 013.536 3.536L6.5 20.5 3 21l.5-3.5L16.732 3.732z"
                    />
                  </svg>
                </button>
              </template>
            </div>
          </div>
        </div>
      </template>
    </PageHeader>

    <div v-if="entityLoading" class="flex flex-1 items-center justify-center">
      <StateBlock state="loading" />
    </div>

    <div
      v-else-if="entityError"
      class="flex flex-1 items-center justify-center px-4"
    >
      <StateBlock state="error">
        <p class="text-sm text-center">{{ entityError }}</p>
      </StateBlock>
    </div>

    <div v-else class="flex-1 overflow-y-auto space-y-4">
      <div class="glass-deep p-5" :class="heroGradient">
        <div class="space-y-3">
          <p class="text-sm text-muted-foreground">
            {{ entityDescription }}
          </p>
        </div>

        <Button
          class="mt-5 w-full justify-center !py-3 text-base font-semibold"
          variant="default"
          size="lg"
          :loading="loaders.isPageLoading"
          @click="startConversation"
        >
          <IconMessageCircle class="mr-2 h-5 w-5" />
          Поговорить об этом
        </Button>

        <Button
          v-if="meditationTopicKey"
          class="mt-3 w-full justify-center !py-3 text-base font-semibold"
          variant="outline"
          size="lg"
          @click="goToMeditations"
        >
          <IconLeaf class="mr-2 h-5 w-5" />
          Попробовать практику
        </Button>
      </div>

      <NotificationsSummaryCard
        :preference="preference"
        :loading="prefLoading"
        @edit="goToNotifications"
      />

      <StateBlock v-if="notificationError" state="error" class="mt-2">
        <p class="text-sm text-center">{{ notificationError }}</p>
      </StateBlock>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import PageHeader from '@/app/components/PageHeader.vue';
import StateBlock from '@/app/components/StateBlock.vue';
import NotificationsSummaryCard from '@/app/components/notifications/NotificationsSummaryCard.vue';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/shadcn/input';
import InputComponent from '@/app/components/ui/shadcn/input/Input.vue';
import IconMessageCircle from '~icons/lucide/message-circle';
import IconLeaf from '~icons/lucide/leaf';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useChatStore } from '@/app/stores/chat';
import { useLoadersStore } from '@/app/stores/loaders';
import { useToast } from '@/app/composables/useToast';
import { useNuxtApp, navigateTo } from '#app';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import { useRoute } from 'vue-router';
import type {
  NotificationPreferencesDto,
  TherapyTopicDto,
} from '@/shared/dto/notifications';
import type { ChatEntryContext } from '@/shared/dto';
import { onClickOutside } from '@vueuse/core';
import { useTherapyTopicsStore } from '@/app/stores/therapyTopics';
import { mapTherapyToMeditationTopic } from '@/app/lib/meditations';

const route = useRoute();
const chat = useChatStore();
const loaders = useLoadersStore();
const therapyTopicsStore = useTherapyTopicsStore();
const { fetchNotificationPreferences } = useNotificationsSettings();
const { $api } = useNuxtApp();

const entityKey = computed(() => String(route.params.key || ''));
const catalogTopic = computed(() =>
  THERAPY_TOPICS.find((topic) => topic.key === entityKey.value)
);
const customTopic = ref<TherapyTopicDto | null>(null);
const entityLoading = ref(false);
const entityError = ref<string | null>(null);

const preference = ref<NotificationPreferencesDto | null>(null);
const prefLoading = ref(true);
const notificationError = ref<string | null>(null);

const entityData = computed(() => catalogTopic.value || customTopic.value);
const isCustom = computed(() => !!customTopic.value && !catalogTopic.value);
const meditationTopicKey = computed(() =>
  mapTherapyToMeditationTopic(entityKey.value)
);

const isEditingTitle = ref(false);
const titleDraft = ref('');
const titleInputRef = ref<InstanceType<typeof InputComponent> | null>(null);
const titleInputContainerRef = ref<HTMLElement | null>(null);
const titleSaving = ref(false);

const entityName = computed(() => {
  if (isEditingTitle.value && titleDraft.value) {
    return titleDraft.value.trim();
  }
  return entityData.value?.name || 'Тема поддержки';
});
const entityDescription = computed(
  () =>
    entityData.value?.description ||
    'Выберите фокус и получайте поддержку, когда вам нужна опора.'
);
const entityEmoji = computed(() => entityData.value?.emoji || '💬');

const colorSchemes: Record<string, string> = {
  blue: 'from-blue-500 to-cyan-500',
  gray: 'from-gray-500 to-indigo-500',
  yellow: 'from-yellow-500 to-orange-500',
  purple: 'from-purple-500 to-rose-500',
  red: 'from-red-500 to-orange-500',
  pink: 'from-pink-500 to-amber-500',
  green: 'from-green-500 to-emerald-500',
  indigo: 'from-indigo-500 to-sky-500',
  slate: 'from-slate-500 to-gray-500',
  orange: 'from-orange-500 to-amber-500',
};

const heroGradient = computed(() => {
  const color = (entityData.value as any)?.color ?? 'purple';
  return `${colorSchemes[color] ?? colorSchemes.purple} text-white`;
});

const canEditCustomEntity = computed(
  () => isCustom.value && !!customTopic.value
);

function goBack() {
  navigateTo('/therapy');
}

function goToNotifications() {
  navigateTo(`/therapy/${entityKey.value}/notifications`);
}

function goToMeditations() {
  if (!meditationTopicKey.value) return;
  navigateTo(`/meditations?topic=${meditationTopicKey.value}`);
}

function startEditTitle() {
  if (!canEditCustomEntity.value) return;
  titleDraft.value = entityName.value;
  isEditingTitle.value = true;
  nextTick(() => {
    titleInputRef.value?.focus();
  });
}

async function finishTitleEdit() {
  if (!isEditingTitle.value) return;
  const nextTitle = titleDraft.value.trim();
  if (!nextTitle || nextTitle === (customTopic.value?.name || '')) {
    titleDraft.value = customTopic.value?.name || entityName.value;
    isEditingTitle.value = false;
    return;
  }
  if (!customTopic.value || titleSaving.value) {
    isEditingTitle.value = false;
    return;
  }

  titleSaving.value = true;
  try {
    const updated = await $api<TherapyTopicDto>(
      `/api/therapy/custom/${customTopic.value.id}`,
      {
        method: 'PUT',
        body: { name: nextTitle },
      }
    );
    customTopic.value = updated;
    therapyTopicsStore.updateLocal(updated);
    useToast('Название обновлено');
  } catch (error: any) {
    console.error('[TherapyDetail] Failed to update title:', error);
    useToast(error?.message || 'Не удалось сохранить название');
    titleDraft.value = customTopic.value?.name || entityName.value;
  } finally {
    titleSaving.value = false;
    isEditingTitle.value = false;
  }
}

onClickOutside(titleInputContainerRef, () => {
  if (isEditingTitle.value) {
    void finishTitleEdit();
  }
});

async function loadCustomTopic() {
  if (catalogTopic.value) {
    customTopic.value = null;
    entityError.value = null;
    return;
  }

  if (!entityKey.value) {
    entityError.value = 'Неверный идентификатор темы';
    return;
  }

  entityLoading.value = true;
  entityError.value = null;
  try {
    const data = await $api<TherapyTopicDto>(
      `/api/therapy/custom/${entityKey.value}`
    );
    customTopic.value = data;
  } catch (error: any) {
    console.error('[TherapyDetail] Failed to load topic:', error);
    entityError.value = error?.message || 'Тема не найдена';
  } finally {
    entityLoading.value = false;
  }
}

async function loadPreference() {
  prefLoading.value = true;
  notificationError.value = null;
  try {
    const data = await fetchNotificationPreferences('therapy', {
      entityKey: entityKey.value,
    });
    preference.value = data;
  } catch (error: any) {
    console.error('[TherapyDetail] Preference load failed:', error);
    notificationError.value =
      error?.message || 'Не удалось загрузить настройки уведомлений';
  } finally {
    prefLoading.value = false;
  }
}

const entryContext = computed<ChatEntryContext>(() => ({
  type: 'therapy_topic',
  topic_id: entityKey.value,
  topic_name: entityName.value,
}));

async function startConversation() {
  try {
    // Устанавливаем entryContext перед запуском разговора
    chat.entryContext = entryContext.value;
    chat.startSession();

    // Запускаем разговор с правильным режимом
    chat.startConversation({
      mode: 'therapy',
    });

    // Переходим на главную страницу с правильными query параметрами
    navigateTo({
      path: '/',
      query: {
        screen: 'chat',
        mode: 'therapy',
      },
    });
  } catch (error: any) {
    console.error('[TherapyDetail] Failed to start conversation:', error);
    useToast(error?.message || 'Не удалось открыть чат');
  }
}

const refresh = async () => {
  await Promise.all([loadCustomTopic(), loadPreference()]);
};

onMounted(refresh);
watch(() => route.params.key, refresh);
</script>
