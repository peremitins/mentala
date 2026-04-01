<template>
  <div class="space-y-2 h-full overflow-y-auto rounded-lg pb-[100px]">
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
                  class="text-foreground hover:text-foreground transition"
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

    <div v-else class="flex-1 overflow-y-auto space-y-2">
      <div class="glass-deep p-5" :class="heroGradient">
        <div class="space-y-3">
          <p class="text-sm text-foreground">
            {{ entityDescription }}
          </p>
        </div>

        <Button
          class="relative mt-3 w-full justify-center !py-3 text-base font-semibold"
          variant="outline"
          size="lg"
          :loading="loaders.isPageLoading"
          @click="startConversation"
        >
          <IconMessageCircle class="mr-2 h-5 w-5" />
          Поговорить об этом
          <span
            v-if="!chatAssistantAccess.available"
            class="absolute right-3 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black/35 text-[10px] leading-none"
          >
            {{ getPlanBadgeEmoji(chatAssistantAccess.requiredPlan) }}
          </span>
        </Button>

        <Button
          v-if="meditationTopicKey"
          class="relative mt-3 w-full justify-center !py-3 text-base font-semibold"
          variant="outline"
          size="lg"
          @click="goToMeditations"
        >
          <IconLeaf class="mr-2 h-5 w-5" />
          Открыть медитацию
          <span
            v-if="!meditationsAccess.available"
            class="absolute right-3 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black/35 text-[10px] leading-none"
          >
            {{ getPlanBadgeEmoji(meditationsAccess.requiredPlan) }}
          </span>
        </Button>

        <Button
          v-if="breathGroupKey"
          class="relative mt-3 w-full justify-center !py-3 text-base font-semibold"
          variant="outline"
          size="lg"
          @click="goToBreathPractices"
        >
          <IconWind class="mr-2 h-5 w-5" />
          Открыть дыхание
          <span
            v-if="!breathCatalogAccess.available"
            class="absolute right-3 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black/35 text-[10px] leading-none"
          >
            {{ getPlanBadgeEmoji(breathCatalogAccess.requiredPlan) }}
          </span>
        </Button>
      </div>

      <NotificationsSummaryCard
        :preference="preference"
        :loading="prefLoading"
        :toggle-loading="prefToggleLoading"
        @edit="goToNotifications"
        @toggle="onToggleNotifications"
      />

      <StateBlock v-if="notificationError" state="error" class="mt-2">
        <p class="text-sm text-center">{{ notificationError }}</p>
      </StateBlock>
    </div>

    <PushPermissionDeniedDialog
      :open="pushPermissionGate.showPushDeniedModal.value"
      @update:open="pushPermissionGate.setPushDeniedModalOpen"
      @open-settings="handleOpenPushSystemSettings"
    />

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />
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
import PushPermissionDeniedDialog from '@/app/components/notifications/PushPermissionDeniedDialog.vue';
import IconMessageCircle from '~icons/lucide/message-circle';
import IconLeaf from '~icons/lucide/leaf';
import IconWind from '~icons/lucide/wind';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { usePushPermissionGate } from '@/app/composables/usePushPermissionGate';
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
import { useEntryChat } from '@/app/composables/useEntryChat';
import { getAddressingCopy } from '@/app/lib/addressingCopy';
import { onClickOutside } from '@vueuse/core';
import { useAuthStore } from '@/app/stores/auth';
import { useTherapyTopicsStore } from '@/app/stores/therapyTopics';
import { mapTherapyToMeditationTopic } from '@/app/lib/meditations';
import { mapTherapyToBreathGroup } from '@/app/lib/practiceActions';
import type { BreathPracticeTag } from '@/app/lib/breathPracticesCatalog';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import {
  extractFeaturePlanRequiredError,
  useEntitlements,
} from '@/app/composables/useEntitlements';
import { useTherapyAnalytics } from '@/app/composables/useTherapyAnalytics';
import { useAppNavigation } from '@/app/composables/useAppNavigation';
import { resolveAddressing } from '@/shared/utils/addressing';

const route = useRoute();
const chat = useChatStore();
const auth = useAuthStore();
const { startEntryChat } = useEntryChat();
const { navigateToTarget } = useAppNavigation();
const loaders = useLoadersStore();
const therapyTopicsStore = useTherapyTopicsStore();
const { getFeatureAccess, refreshEntitlements } = useEntitlements();
const { trackTopicOpen } = useTherapyAnalytics();
const { fetchNotificationPreferences, updateNotificationPreferences } =
  useNotificationsSettings();
const { $api } = useNuxtApp();
const pushPermissionGate = usePushPermissionGate();

const entityKey = computed(() => String(route.params.key || ''));
const catalogTopic = computed(() =>
  THERAPY_TOPICS.find((topic) => topic.key === entityKey.value)
);
const customTopic = ref<TherapyTopicDto | null>(null);
const entityLoading = ref(false);
const entityError = ref<string | null>(null);

const preference = ref<NotificationPreferencesDto | null>(null);
const prefLoading = ref(true);
const prefToggleLoading = ref(false);
const notificationError = ref<string | null>(null);
const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);

const entityData = computed(() => catalogTopic.value || customTopic.value);
const isCustom = computed(() => !!customTopic.value && !catalogTopic.value);
const meditationTopicKey = computed(() =>
  mapTherapyToMeditationTopic(entityKey.value)
);
const breathGroupKey = computed<BreathPracticeTag | null>(() =>
  mapTherapyToBreathGroup(entityKey.value)
);
const meditationsAccess = computed(() =>
  getFeatureAccess('meditations.library.full')
);
const breathCatalogAccess = computed(() =>
  getFeatureAccess('breath.catalog.full')
);
const chatAssistantAccess = computed(() => getFeatureAccess('chat.assistant'));
const customTherapyAccess = computed(() =>
  getFeatureAccess('therapy.custom.create')
);
const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);
const addressing = computed(() => resolveAddressing(auth.user?.addressing));

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
    getAddressingCopy('therapyDetailDescription', addressing.value)
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
  () =>
    isCustom.value && !!customTopic.value && customTherapyAccess.value.available
);
const isCustomLocked = computed(
  () => isCustom.value && !customTherapyAccess.value.available
);

function goBack() {
  navigateTo('/therapy');
}

function goToNotifications() {
  if (isCustomLocked.value) {
    openPaywall('therapy.custom.create');
    return;
  }

  navigateTo(`/therapy/${entityKey.value}/notifications`);
}

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}

function getPlanBadgeEmoji(plan: string) {
  return plan === 'premium' ? '💎' : '⭐';
}

async function goToMeditations() {
  if (!meditationTopicKey.value) return;
  await navigateToTarget(
    {
      type: 'meditation_collection',
      topicKey: meditationTopicKey.value,
    },
    {
      source: 'therapy_page',
      entryPoint: 'therapy_meditation_cta',
    }
  );
}

async function goToBreathPractices() {
  const groupKey = breathGroupKey.value;
  if (!groupKey) return;
  await navigateToTarget(
    {
      type: 'breath_practice_group',
      groupKey,
    },
    {
      source: 'therapy_page',
      entryPoint: 'therapy_breath_cta',
    }
  );
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
    const featureError = extractFeaturePlanRequiredError(error);
    if (featureError) {
      openPaywall(featureError.featureKey);
      await navigateTo('/', { replace: true });
      return;
    }

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
    const featureError = extractFeaturePlanRequiredError(error);
    if (featureError) {
      openPaywall(featureError.featureKey);
      await navigateTo('/', { replace: true });
      return;
    }

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
      error?.message || 'Не удалось загрузить настройки напоминаний';
  } finally {
    prefLoading.value = false;
  }
}

async function updateNotificationsPreference(enabled: boolean) {
  try {
    const data = await updateNotificationPreferences('therapy', {
      enabled,
      entityKey: entityKey.value,
    });
    if (data) preference.value = data;
  } catch (error: any) {
    console.error('[TherapyDetail] Toggle notifications failed:', error);
    notificationError.value =
      error?.message || 'Не удалось обновить настройки напоминаний';
    throw error;
  }
}

/** Обновление включено/выключено уведомлений по переключателю на карточке */
async function onToggleNotifications(enabled: boolean) {
  if (!entityKey.value) return;
  if (isCustomLocked.value) {
    openPaywall('therapy.custom.create');
    return;
  }

  notificationError.value = null;
  prefToggleLoading.value = true;
  try {
    if (enabled) {
      const canEnable = await pushPermissionGate.ensureAppPushEnabled({
        onGrantedFromSettings: async () => {
          prefToggleLoading.value = true;
          try {
            await updateNotificationsPreference(true);
          } finally {
            prefToggleLoading.value = false;
          }
        },
      });

      if (!canEnable) {
        return;
      }
    }

    await updateNotificationsPreference(enabled);
  } finally {
    prefToggleLoading.value = false;
  }
}

async function handleOpenPushSystemSettings() {
  await pushPermissionGate.openSystemSettings();
}

const entryContext = computed<ChatEntryContext>(() => ({
  type: 'therapy_topic',
  topic_id: entityKey.value,
  topic_name: entityName.value,
}));

async function startConversation() {
  if (isCustomLocked.value) {
    openPaywall('therapy.custom.create');
    return;
  }

  if (!chatAssistantAccess.value.available) {
    openPaywall('chat.assistant');
    return;
  }

  try {
    // Устанавливаем entryContext перед запуском разговора
    chat.entryContext = entryContext.value;
    await startEntryChat();
  } catch (error: any) {
    console.error('[TherapyDetail] Failed to start conversation:', error);
    useToast(error?.message || 'Не удалось открыть чат');
  }
}

async function refreshEntitlementsSafely() {
  try {
    await refreshEntitlements();
  } catch (error) {
    console.warn('[TherapyDetail] Failed to refresh entitlements:', error);
  }
}

const refresh = async () => {
  await refreshEntitlementsSafely();
  await Promise.all([loadCustomTopic(), loadPreference()]);
};

onMounted(refresh);
watch(() => route.params.key, refresh);
watch(
  entityKey,
  (nextKey, previousKey) => {
    if (nextKey === 'phobias' && nextKey !== previousKey) {
      trackTopicOpen(nextKey);
    }
  },
  { immediate: true }
);
</script>
