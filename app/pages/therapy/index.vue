<template>
  <div class="h-full flex flex-col z-0">
    <NotificationIndexPage
      title="🧠&nbsp;&nbsp;Терапия"
      :description="pageDescription"
      mentai-mode="therapy"
      :items="topicItems"
      :loading="loadersStore.isSkeletonLoading"
      @select="handleTopicSelect"
      @remove="handleTopicRemove"
      @quick-chat="handleTherapyQuickChat"
      @quick-meditation="handleTherapyQuickMeditation"
      @quick-breath="handleTherapyQuickBreath"
    />

    <CustomEntityModal
      mentai-mode="therapy"
      :open="createModalOpen"
      header-title="Новая тема терапии"
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

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useChatStore } from '@/app/stores/chat';
import NotificationIndexPage, {
  type NotificationIndexItem,
} from '@/app/components/notifications/NotificationIndexPage.vue';
import { BREATH_PRACTICES } from '@/app/lib/breathPracticesCatalog';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import CustomEntityModal from '@/app/components/modals/CustomEntityModal.vue';
import ConfirmModal from '@/app/components/ui/ConfirmModal.vue';
import { useAuthStore } from '@/app/stores/auth';
import { useTherapyTopicsStore } from '@/app/stores/therapyTopics';
import { useLoadersStore } from '@/app/stores/loaders';
import { useNotificationsStore } from '@/app/stores/notifications';
import type { TherapyTopicDto } from '@/shared/dto/notifications';
import { useToast } from '@/app/composables/useToast';
import { useEntryChat } from '@/app/composables/useEntryChat';
import type { ChatEntryContext } from '@/shared/dto';
import type { RouteLocationRaw } from 'vue-router';
import { useRouter, useRoute } from 'vue-router';
import { mapTherapyToMeditationTopic } from '@/app/lib/meditations';
import {
  isTherapyPracticeHidden,
  mapTherapyToBreathGroup,
} from '@/app/lib/practiceActions';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import {
  extractFeaturePlanRequiredError,
  useEntitlements,
} from '@/app/composables/useEntitlements';
import { useTherapyAnalytics } from '@/app/composables/useTherapyAnalytics';
import { getLocalizedPlanName } from '@/app/utils/planI18n';
import { getAddressingCopy } from '@/app/lib/addressingCopy';
import { resolveAddressing } from '@/shared/utils/addressing';

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
const auth = useAuthStore();
const loadersStore = useLoadersStore();
const notificationsStore = useNotificationsStore();
const { t } = useI18n();
const { topics: userTopics } = storeToRefs(therapyStore);
const router = useRouter();
const route = useRoute();
const { getFeatureAccess, refreshEntitlements } = useEntitlements();
const { trackQuickChatClick } = useTherapyAnalytics();
const addressing = computed(() => resolveAddressing(auth.user?.addressing));
const premiumPlanLabel = computed(() => getLocalizedPlanName('premium', t));
const pageDescription = computed(() =>
  getAddressingCopy('therapyPageDescription', addressing.value)
);

// Загружаем данные после монтирования компонента (с кэшированием)
// Защита от двойного вызова реализована в store через isSkeletonLoading флаг
onMounted(async () => {
  await Promise.all([therapyStore.fetchAll(), notificationsStore.fetchAll()]);
});

function buildTherapyQuickActions(topicKey: string, isCustom: boolean) {
  if (isCustom) {
    return { chat: true };
  }

  if (isTherapyPracticeHidden(topicKey)) {
    return { chat: true };
  }

  return {
    chat: true,
    meditation: Boolean(mapTherapyToMeditationTopic(topicKey)),
    breath: Boolean(mapTherapyToBreathGroup(topicKey)),
  };
}

const customTopicItems = computed<NotificationIndexItem[]>(() =>
  userTopics.value.map((topic) => {
    const pref = notificationsStore.getPreference('therapy', {
      entityKey: topic.id,
    });
    return {
      id: topic.id, // Используем ID
      name: topic.name,
      description: topic.description || 'Персональная тема',
      emoji: topic.emoji || '💬',
      gradientClass: 'from-gray-500 to-gray-700',
      payload: { ...topic, type: 'custom' },
      canDelete: true,
      notificationsEnabled: pref?.enabled ?? false,
      quickActions: buildTherapyQuickActions(topic.id, true),
      lockBadgeEmoji: customTherapyAccess.value.available
        ? undefined
        : getPlanBadgeEmoji(customTherapyAccess.value.requiredPlan),
      lockBadgeTitle: customTherapyAccess.value.available
        ? undefined
        : t('PLANS.PERSONAL_THERAPY_AVAILABLE', {
            plan: premiumPlanLabel.value,
          }),
    };
  })
);

const baseTopicItems = computed<NotificationIndexItem[]>(() =>
  THERAPY_TOPICS.map((topic) => {
    const pref = notificationsStore.getPreference('therapy', {
      entityKey: topic.key,
    });
    return {
      id: topic.key,
      name: topic.name,
      description: topic.description,
      emoji: topic.emoji,
      gradientClass: colorSchemes[topic.color] ?? 'from-blue-500 to-cyan-500',
      payload: { type: 'catalog', topicKey: topic.key, topicName: topic.name },
      notificationsEnabled: pref?.enabled ?? false,
      quickActions: buildTherapyQuickActions(topic.key, false),
    };
  })
);

const createCard = computed<NotificationIndexItem>(() => ({
  id: '__create_topic',
  name: 'Создать свою терапию',
  description: customTherapyAccess.value.available
    ? getAddressingCopy('therapyCreateCardDescription', addressing.value)
    : t('PLANS.PERSONAL_THERAPY_CREATE_AVAILABLE', {
        plan: premiumPlanLabel.value,
      }),
  emoji: '✏️',
  gradientClass: 'from-gray-500 to-gray-700',
  payload: { action: 'create-topic' },
  quickActions: {},
  lockBadgeEmoji: customTherapyAccess.value.available
    ? undefined
    : getPlanBadgeEmoji(customTherapyAccess.value.requiredPlan),
  lockBadgeTitle: customTherapyAccess.value.available
    ? undefined
    : t('PLANS.PERSONAL_THERAPY_CREATE_AVAILABLE', {
        plan: premiumPlanLabel.value,
      }),
}));

const topicItems = computed<NotificationIndexItem[]>(() => [
  ...customTopicItems.value,
  ...baseTopicItems.value,
  createCard.value,
]);

const createModalOpen = ref(false);
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const pendingDeleteItem = ref<NotificationIndexItem | null>(null);
const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);
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
const { startEntryChat } = useEntryChat();

async function safeNavigate(target: RouteLocationRaw) {
  try {
    await router.push(target);
    await nextTick();
    const resolvedPath =
      typeof target === 'string' ? target : router.resolve(target).fullPath;
    if (router.currentRoute.value.fullPath === resolvedPath) return;
  } catch (error) {
    console.error('[Therapy] Router navigation failed:', error);
  }

  if (typeof window !== 'undefined' && window.location) {
    // Фолбэк на прямой переход, если роутер не сработал.
    const fallbackHref =
      typeof target === 'string' ? target : router.resolve(target).href;
    window.location.href = fallbackHref;
  }
}

async function refreshEntitlementsForAction() {
  try {
    await refreshEntitlements();
  } catch (error) {
    console.warn('[Therapy] Failed to refresh entitlements on action:', error);
  }
}

async function handleTopicSelect(item: NotificationIndexItem) {
  await refreshEntitlementsForAction();

  const payload = item.payload as
    | { action?: string; type?: string }
    | undefined;
  if (payload?.action === 'create-topic') {
    if (!customTherapyAccess.value.available) {
      openPaywall('therapy.custom.create');
      return;
    }
    createModalOpen.value = true;
    return;
  }

  if (isCustomTherapyItem(item) && !customTherapyAccess.value.available) {
    openPaywall('therapy.custom.create');
    return;
  }

  // Используем ID для навигации
  safeNavigate(`/therapy/${item.id}`);
}

function handleTopicCreated(topic: TherapyTopicDto) {
  createModalOpen.value = false;
  // Используем ID для навигации
  safeNavigate(`/therapy/${topic.id}`);
}

async function handleTopicRemove(item: NotificationIndexItem) {
  await refreshEntitlementsForAction();

  pendingDeleteItem.value = item;
  deleteModalRef.value?.open();
}

async function confirmDeleteTopic() {
  const item = pendingDeleteItem.value;
  if (!item) return;
  // Ищем тему по ID
  const topic = userTopics.value.find((t) => t.id === item.id);
  if (!topic) {
    console.error('[Therapy] Topic not found for deletion:', item.id);
    useToast('Тема не найдена');
    pendingDeleteItem.value = null;
    return;
  }
  try {
    await therapyStore.remove(topic.id);
    useToast('Тема удалена');
    // Проверяем, находимся ли мы на странице удаленной темы
    if (route.params.key === item.id) {
      navigateTo('/therapy');
    }
  } catch (error: any) {
    const featureError = extractFeaturePlanRequiredError(error);
    if (featureError) {
      openPaywall(featureError.featureKey);
      return;
    }

    console.error('[Therapy] Failed to delete topic:', error);
    useToast(error?.message || 'Не удалось удалить тему');
  } finally {
    pendingDeleteItem.value = null;
  }
}

function buildTherapyEntryContext(
  item: NotificationIndexItem
): ChatEntryContext | null {
  const payload = item.payload as
    | (TherapyTopicDto & { action?: string })
    | { action?: string; topicKey?: string; topicName?: string }
    | undefined;

  if (!payload || payload.action) return null;

  // Проверяем наличие id для определения типа (TherapyTopicDto имеет id, каталог - topicKey)
  const topicId = 'id' in payload ? payload.id : payload.topicKey || item.id;
  if (!topicId) return null;

  return {
    type: 'therapy_topic',
    topic_id: topicId,
    topic_name: item.name,
    topic_description:
      'description' in payload ? payload.description || undefined : undefined,
  };
}

async function handleTherapyQuickChat(item: NotificationIndexItem) {
  await refreshEntitlementsForAction();

  if (isCustomTherapyItem(item) && !customTherapyAccess.value.available) {
    openPaywall('therapy.custom.create');
    return;
  }

  if (!chatAssistantAccess.value.available) {
    openPaywall('chat.assistant');
    return;
  }

  const topicKey = resolveTherapyTopicKey(item);
  if (topicKey === 'phobias') {
    trackQuickChatClick(topicKey);
  }

  const chat = useChatStore();
  chat.entryContext = buildTherapyEntryContext(item);

  try {
    await startEntryChat();
  } catch {
    // useEntryChat уже показал toast
  }
}

function resolveTherapyTopicKey(item: NotificationIndexItem): string | null {
  // Достаём ключ системной темы, чтобы маппить практики.
  const payload = item.payload as
    | { action?: string; type?: string; topicKey?: string }
    | undefined;
  if (payload?.action) return null;
  return payload?.topicKey || (payload?.type === 'catalog' ? item.id : null);
}

async function handleTherapyQuickMeditation(item: NotificationIndexItem) {
  if (!meditationsAccess.value.available) {
    openPaywall('meditations.library.full');
    return;
  }

  const topicKey = resolveTherapyTopicKey(item);
  if (!topicKey) return;
  const meditationTopicKey = mapTherapyToMeditationTopic(topicKey);
  if (!meditationTopicKey) {
    useToast('Подборка медитаций пока недоступна');
    return;
  }

  await safeNavigate({
    path: '/meditations',
    query: { topic: meditationTopicKey },
  });
}

async function handleTherapyQuickBreath(item: NotificationIndexItem) {
  if (!breathCatalogAccess.value.available) {
    openPaywall('breath.catalog.full');
    return;
  }

  const topicKey = resolveTherapyTopicKey(item);
  if (!topicKey) return;
  const groupKey = mapTherapyToBreathGroup(topicKey);
  if (!groupKey) {
    useToast('Подборка дыхательных практик пока недоступна');
    return;
  }

  const firstPractice = BREATH_PRACTICES.find((practice) =>
    practice.tags.includes(groupKey)
  );

  if (!firstPractice) {
    useToast('Практика не найдена');
    return;
  }

  await safeNavigate({
    path: `/breath-practices/${firstPractice.slug}`,
    query: { group: groupKey },
  });
}

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}

function isCustomTherapyItem(item: NotificationIndexItem): boolean {
  const payload = item.payload as
    | { type?: string; action?: string }
    | undefined;
  return payload?.type === 'custom' && payload?.action !== 'create-topic';
}

function getPlanBadgeEmoji(plan: string) {
  return plan === 'premium' ? '💎' : '⭐';
}

onMounted(async () => {
  try {
    await refreshEntitlements();
  } catch (error) {
    console.warn('[Therapy] Failed to refresh entitlements:', error);
  }
});
</script>
