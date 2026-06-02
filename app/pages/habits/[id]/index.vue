<template>
  <div
    class="xs:space-y-3 space-y-1 h-full overflow-y-auto rounded-lg pb-[100px]"
  >
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
      <PushRecoveryBanner
        v-if="preference?.enabled && pushRecovery.showRecoveryBanner.value"
        @enable="pushRecovery.attemptRecovery()"
      />

      <div class="glass-deep p-5" :class="heroGradient">
        <div class="space-y-3">
          <p class="text-sm text-foreground">
            {{ entityDescription }}
          </p>
        </div>

        <div class="mt-3 flex flex-col gap-2">
          <Button
            class="relative flex-1 flex-none justify-center !py-3 text-base font-semibold"
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
            v-if="isGratitudeHabit"
            class="relative flex-1 flex-none justify-center !py-3 text-base font-semibold"
            variant="outline"
            size="lg"
            @click="goToGratitudeDiary"
          >
            <IconSquarePen class="mr-2 h-5 w-5" />
            Дневник
            <span
              v-if="!gratitudeDiaryAccess.available"
              class="absolute right-3 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black/35 text-[10px] leading-none"
            >
              {{ getPlanBadgeEmoji(gratitudeDiaryAccess.requiredPlan) }}
            </span>
          </Button>
        </div>

        <Button
          v-if="meditationTopicKey"
          class="relative mt-3 w-full justify-center !py-3 text-base font-semibold"
          variant="outline"
          size="lg"
          @click="goToMeditations"
        >
          <IconLeaf class="mr-2 h-5 w-5" />
          Открыть медитации
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
    <WebPushPermissionDialog
      :open="pushPermissionGate.showWebPushPermissionDialog.value"
      :reason="pushPermissionGate.webPushPermissionDialogReason.value"
      @update:open="pushPermissionGate.setWebPushPermissionDialogOpen"
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
import { useRoute } from 'vue-router';
import PageHeader from '@/app/components/PageHeader.vue';
import StateBlock from '@/app/components/StateBlock.vue';
import NotificationsSummaryCard from '@/app/components/notifications/NotificationsSummaryCard.vue';
import PushRecoveryBanner from '@/app/components/notifications/PushRecoveryBanner.vue';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/shadcn/input';
import InputComponent from '@/app/components/ui/shadcn/input/Input.vue';
import PushPermissionDeniedDialog from '@/app/components/notifications/PushPermissionDeniedDialog.vue';
import WebPushPermissionDialog from '@/app/components/notifications/WebPushPermissionDialog.vue';
import IconMessageCircle from '~icons/lucide/message-circle';
import IconLeaf from '~icons/lucide/leaf';
import IconWind from '~icons/lucide/wind';
import IconSquarePen from '~icons/lucide/square-pen';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { usePushPermissionGate } from '@/app/composables/usePushPermissionGate';
import { usePushRecovery } from '@/app/composables/usePushRecovery';
import { useChatStore } from '@/app/stores/chat';
import { useToast } from '@/app/composables/useToast';
import { useNuxtApp, navigateTo } from '#app';
import type { HabitDto, HabitIntent } from '@/shared/dto/notifications';
import { findHabitByKey } from '@/app/lib/habitsCatalog';
import type { NotificationPreferencesDto } from '@/shared/dto/notifications';
import type { ChatEntryContext } from '@/shared/dto';
import { useEntryChat } from '@/app/composables/useEntryChat';
import { onClickOutside } from '@vueuse/core';
import { useUserHabitsStore } from '@/app/stores/userHabits';
import { useLoadersStore } from '@/app/stores/loaders';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import {
  extractFeaturePlanRequiredError,
  useEntitlements,
} from '@/app/composables/useEntitlements';
import { mapHabitToMeditationTopic } from '@/app/lib/meditations';
import { mapHabitToBreathGroup } from '@/app/lib/practiceActions';
import type { BreathPracticeTag } from '@/app/lib/breathPracticesCatalog';
import { useAppNavigation } from '@/app/composables/useAppNavigation';

const route = useRoute();
const chat = useChatStore();
const { startEntryChat } = useEntryChat();
const { navigateToTarget } = useAppNavigation();
const userHabitsStore = useUserHabitsStore();
const loaders = useLoadersStore();
const { getFeatureAccess, refreshEntitlements } = useEntitlements();
const { fetchNotificationPreferences, updateNotificationPreferences } =
  useNotificationsSettings();

const entityKey = computed(() => String(route.params.id || ''));

const catalogHabit = computed(() => findHabitByKey(entityKey.value));
const customHabit = ref<HabitDto | null>(null);
const entityLoading = ref(false);
const entityError = ref<string | null>(null);
const { $api } = useNuxtApp();
const pushPermissionGate = usePushPermissionGate();
const pushRecovery = usePushRecovery();

const preference = ref<NotificationPreferencesDto | null>(null);
const prefLoading = ref(true);
const prefToggleLoading = ref(false);
const notificationError = ref<string | null>(null);
const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);

const habitGradients: Record<string, string> = {
  build: 'from-blue-500 to-cyan-500',
  quit: 'from-red-500 to-orange-500',
  custom: 'from-violet-500 to-pink-500',
};

const entityData = computed(() => catalogHabit.value || customHabit.value);
const isCustom = computed(() => !!customHabit.value && !catalogHabit.value);
const meditationTopicKey = computed(() => {
  const habitKey = catalogHabit.value?.habitKey;
  if (!habitKey) return null;
  return mapHabitToMeditationTopic(habitKey);
});
const breathGroupKey = computed<BreathPracticeTag | null>(() => {
  const habitKey = catalogHabit.value?.habitKey;
  if (!habitKey) return null;
  return mapHabitToBreathGroup(habitKey);
});
const isGratitudeHabit = computed(
  () => catalogHabit.value?.habitKey === 'gratitude'
);
const meditationsAccess = computed(() =>
  getFeatureAccess('meditations.library.full')
);
const breathCatalogAccess = computed(() =>
  getFeatureAccess('breath.catalog.full')
);
const gratitudeDiaryAccess = computed(() =>
  getFeatureAccess('gratitude.diary.full')
);
const chatAssistantAccess = computed(() => getFeatureAccess('chat.assistant'));
const customHabitsAccess = computed(() =>
  getFeatureAccess('habits.custom.create')
);
const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
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
  return entityData.value?.name || 'Привычка';
});
const entityEmoji = computed(() => entityData.value?.emoji || '✏️');
const entityIntent = computed<HabitIntent>(() => {
  if (!entityData.value) return 'build';
  return (entityData.value.intent || 'build') as HabitIntent;
});

const entityDescription = computed(
  () =>
    entityData.value?.description ||
    'Персонализируйте тему, чтобы ИИ чётче включался в разговор.'
);

const gradientClass = computed(() => {
  const key = isCustom.value ? 'custom' : entityIntent.value;
  return habitGradients[key] ?? habitGradients.build;
});

const heroGradient = computed(() => `${gradientClass.value} text-white`);

const resolvedIntentForFilters = computed(() =>
  entityIntent.value === 'custom' ? 'build' : entityIntent.value
);

const canEditCustomEntity = computed(
  () =>
    isCustom.value && !!customHabit.value && customHabitsAccess.value.available
);
const isCustomLocked = computed(
  () => isCustom.value && !customHabitsAccess.value.available
);

function goBack() {
  const intentFromQuery = route.query.intent as
    | 'build'
    | 'quit'
    | 'custom'
    | undefined;
  const intent = intentFromQuery || resolvedIntentForFilters.value || 'build';
  navigateTo(`/habits?intent=${intent}`);
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
      source: 'habit_page',
      entryPoint: 'habit_practice_cta',
    }
  );
}

function goToGratitudeDiary() {
  void navigateToTarget(
    {
      type: 'gratitude_diary',
    },
    {
      source: 'habit_page',
      entryPoint: 'habit_gratitude_cta',
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
      source: 'habit_page',
      entryPoint: 'habit_breath_cta',
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
  if (!nextTitle || nextTitle === (customHabit.value?.name || '')) {
    titleDraft.value = customHabit.value?.name || entityName.value;
    isEditingTitle.value = false;
    return;
  }
  if (!customHabit.value || titleSaving.value) {
    isEditingTitle.value = false;
    return;
  }

  titleSaving.value = true;
  try {
    const updated = await $api<HabitDto>(
      `/api/habits/${customHabit.value.id}`,
      {
        method: 'PUT',
        body: { name: nextTitle },
      }
    );
    customHabit.value = updated;
    userHabitsStore.updateLocal(updated);
    useToast('Название обновлено');
  } catch (error: any) {
    const featureError = extractFeaturePlanRequiredError(error);
    if (featureError) {
      openPaywall(featureError.featureKey);
      await navigateTo('/', { replace: true });
      return;
    }

    console.error('[HabitDetail] Failed to update title:', error);
    useToast(error?.message || 'Не удалось сохранить название');
    titleDraft.value = customHabit.value?.name || entityName.value;
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
function goToNotifications() {
  if (isCustomLocked.value) {
    openPaywall('habits.custom.create');
    return;
  }

  const intentQuery = route.query.intent as string | undefined;
  const query = intentQuery ? `?intent=${intentQuery}` : '';
  navigateTo(`/habits/${entityKey.value}/notifications${query}`);
}

async function loadCustomHabit() {
  if (catalogHabit.value) {
    customHabit.value = null;
    entityError.value = null;
    return;
  }

  if (!entityKey.value) {
    entityError.value = 'Неверный идентификатор привычки';
    return;
  }

  entityLoading.value = true;
  entityError.value = null;
  try {
    const data = await $api<HabitDto>(`/api/habits/${entityKey.value}`);
    customHabit.value = data;
  } catch (error: any) {
    const featureError = extractFeaturePlanRequiredError(error);
    if (featureError) {
      openPaywall(featureError.featureKey);
      await navigateTo('/', { replace: true });
      return;
    }

    console.error('[HabitDetail] Failed to load habit:', error);
    entityError.value = error?.message || 'Привычка не найдена';
  } finally {
    entityLoading.value = false;
  }
}

async function loadPreference() {
  prefLoading.value = true;
  notificationError.value = null;
  try {
    const data = await fetchNotificationPreferences('habits', {
      entityKey: entityKey.value,
    });
    preference.value = data;
  } catch (error: any) {
    console.error('[HabitDetail] Preference load failed:', error);
    notificationError.value =
      error?.message || 'Не удалось загрузить настройки напоминаний';
  } finally {
    prefLoading.value = false;
  }
}

async function updateNotificationsPreference(enabled: boolean) {
  try {
    const data = await updateNotificationPreferences('habits', {
      enabled,
      entityKey: entityKey.value,
    });
    if (data) preference.value = data;
  } catch (error: any) {
    console.error('[HabitDetail] Toggle notifications failed:', error);
    notificationError.value =
      error?.message || 'Не удалось обновить настройки напоминаний';
    throw error;
  }
}

/** Обновление включено/выключено уведомлений по переключателю на карточке */
async function onToggleNotifications(enabled: boolean) {
  if (!entityKey.value) return;
  if (isCustomLocked.value) {
    openPaywall('habits.custom.create');
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
  type: 'habit',
  habit_id: entityKey.value,
  habit_name: entityName.value,
  habit_intent: resolvedIntentForFilters.value,
}));

async function startConversation() {
  if (isCustomLocked.value) {
    openPaywall('habits.custom.create');
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
    console.error('[HabitDetail] Failed to start conversation:', error);
    useToast(error?.message || 'Не удалось открыть чат');
  }
}

async function refreshEntitlementsSafely() {
  try {
    await refreshEntitlements();
  } catch (error) {
    console.warn('[HabitDetail] Failed to refresh entitlements:', error);
  }
}

async function refresh() {
  await refreshEntitlementsSafely();
  await Promise.all([loadCustomHabit(), loadPreference()]);
}

onMounted(refresh);
watch(() => route.params.id, refresh);
</script>
