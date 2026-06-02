<template>
  <div
    class="h-dvh overflow-y-auto pb-[100px] xs:space-y-3 space-y-1 rounded-lg"
  >
    <PageHeader title="⚙️&nbsp;&nbsp;Настройки" />

    <section class="">
      <Skeleton
        v-if="isLoading"
        type="settings-page"
        :count="1"
        :with-wrapper="false"
      />

      <div v-else class="xs:space-y-3 space-y-1">
        <div v-if="isAdmin" class="glass-deep p-4">
          <button
            type="button"
            class=""
            :class="rowClass()"
            @click="copyUserId"
          >
            <div class="">
              <p class="text-sm font-medium">ID пользователя</p>
              <p class="text-xs text-muted-foreground">
                Нажмите, чтобы скопировать
              </p>
            </div>
            <span class="text-xs text-muted-foreground">
              {{ auth.user?.id }}
            </span>
          </button>

          <Separator class="my-3" />

          <NuxtLink
            to="/admin/promo-codes"
            class="flex items-center justify-between gap-3"
            :class="rowClass()"
          >
            <div>
              <p class="text-sm font-medium">Промокоды и referral</p>
              <p class="text-xs text-muted-foreground">
                Управление кодами, скидками и реферальной программой
              </p>
            </div>
            <IconChevronRight class="h-4 w-4 text-muted-foreground" />
          </NuxtLink>
        </div>

        <NuxtLink
          to="/settings/profile"
          class="glass-deep p-4 flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold"
            >
              {{ userInitials }}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-foreground truncate">
                {{ displayName }}
              </p>
              <p class="text-xs text-muted-foreground truncate">
                {{ displayEmail }}
              </p>
            </div>
          </div>
          <IconChevronRight class="h-4 w-4 text-muted-foreground" />
        </NuxtLink>

        <div class="transition-all rounded-lg scroll-mt-24">
          <SubscriptionBlock />
        </div>

        <ReferralShareCompactCard
          v-if="!shouldHideIosReviewBillingUi"
          :visible="shouldShowReferralShare"
          :refresh-key="referralPanelRefreshKey"
        />

        <div class="glass-deep">
          <p
            class="text-xs font-semibold text-muted-foreground tracking-wide pt-4 pb-1 px-4"
          >
            НАСТРОЙКИ АССИСТЕНТА
          </p>
          <div class="">
            <NuxtLink
              to="/settings/assistant"
              class="px-4 py-3"
              :class="rowClass()"
            >
              <div class="">
                <p class="text-sm font-medium">Стиль общения</p>
                <p class="text-xs text-muted-foreground">
                  {{ toneLabel }}
                </p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </NuxtLink>

            <Separator class="w-auto mx-4" />

            <NuxtLink
              to="/settings/assistant"
              class="px-4 py-3"
              :class="rowClass()"
            >
              <div class="">
                <p class="text-sm font-medium">Обращение</p>
                <p class="text-xs text-muted-foreground">
                  {{ addressingLabel }}
                </p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </NuxtLink>

            <Separator class="w-auto mx-4" />

            <NuxtLink
              to="/settings/assistant"
              class="px-4 py-3"
              :class="rowClass()"
            >
              <div class="">
                <p class="text-sm font-medium">Голос ассистента</p>
                <p class="text-xs text-muted-foreground">
                  {{ assistantVoiceSummary }}
                </p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </NuxtLink>
          </div>
        </div>

        <!-- Блок "Внешний вид": выбор шрифта -->
        <div class="glass-deep">
          <p
            class="text-xs font-semibold text-muted-foreground tracking-wide pt-4 pb-1 px-4"
          >
            ВНЕШНИЙ ВИД
          </p>
          <div class="px-4 py-3">
            <p class="text-sm font-medium mb-3">Шрифт</p>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="font in fontOptions"
                :key="font.id"
                type="button"
                class="flex flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-colors"
                :class="
                  uiSettings.fontFamily === font.id
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground'
                "
                :style="{ fontFamily: `'${font.id}', sans-serif` }"
                @click="uiSettings.updateFontFamily(font.id)"
              >
                <span class="text-base font-semibold leading-tight">{{
                  font.label
                }}</span>
                <span class="text-[10px] opacity-60">{{
                  font.description
                }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Блок "Уведомления": Push + Маркетинговые сообщения -->
        <div class="glass-deep">
          <p
            class="text-xs font-semibold text-muted-foreground tracking-wide pt-4 pb-1 px-4"
          >
            УВЕДОМЛЕНИЯ
          </p>
          <div class="">
            <!-- Push-уведомления (native и web) -->
            <div v-if="showPushRow" class="px-4 py-3" :class="rowClass()">
              <div class="">
                <p class="text-sm font-medium">Push-уведомления</p>
                <p
                  class="text-xs"
                  :class="
                    !isPushSupported
                      ? 'text-muted-foreground'
                      : unifiedPushChecked
                        ? 'text-muted-foreground'
                        : 'text-amber-400'
                  "
                >
                  {{
                    !isPushSupported
                      ? 'Добавьте сайт на экран Домой для уведомлений'
                      : unifiedPushChecked
                        ? 'Напоминания и сообщения'
                        : 'Уведомления отключены'
                  }}
                </p>
              </div>
              <Switch
                :checked="unifiedPushChecked"
                class="flex-shrink-0"
                :disabled="isPushNative && !isPushSupported"
                :loading="unifiedPushLoading"
                @update:checked="handleUnifiedPushToggle"
              />
            </div>

            <Separator v-if="showPushRow" class="w-auto mx-4" />

            <!-- Маркетинговые сообщения -->
            <div class="px-4 py-3" :class="rowClass()">
              <div class="">
                <p class="text-sm font-medium">Маркетинговые сообщения</p>
                <p class="text-xs text-muted-foreground">
                  Новости, обновления и предложения
                </p>
              </div>
              <Switch
                :checked="marketingConsent"
                class="flex-shrink-0"
                :loading="marketingConsentLoading"
                @update:checked="handleMarketingConsentChange"
              />
            </div>
          </div>
        </div>

        <!-- Блок "Конфиденциальность": память, данные и обязательная локальная защита -->
        <div class="glass-deep">
          <p
            class="text-xs font-semibold text-muted-foreground tracking-wide pt-4 pb-1 px-4"
          >
            КОНФИДЕНЦИАЛЬНОСТЬ
          </p>
          <div class="">
            <NuxtLink to="/privacy" class="px-4 py-3" :class="rowClass()">
              <div class="">
                <p class="text-sm font-medium">Память и данные</p>
                <p class="text-xs text-muted-foreground">
                  Управление памятью ассистента
                </p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </NuxtLink>

            <Separator class="w-auto mx-4" />

            <NuxtLink
              to="/settings/app-lock"
              class="px-4 py-3"
              :class="rowClass()"
            >
              <div class="">
                <p class="text-sm font-medium">Защита входа</p>
                <p class="text-xs text-muted-foreground">
                  {{ appLockStatusLabel }}
                </p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </NuxtLink>
          </div>
        </div>

        <div class="glass-deep">
          <p
            class="text-xs font-semibold text-muted-foreground tracking-wide pt-4 pb-1 px-4"
          >
            ОБУЧЕНИЕ
          </p>
          <div class="">
            <button
              type="button"
              class="w-full px-4 py-3"
              :class="rowClass()"
              @click="handleReplayAppTour"
            >
              <div class="">
                <p class="text-sm font-medium">
                  Пройти обзор интерфейса заново
                </p>
                <p class="text-xs text-muted-foreground">
                  Покажем, где что находится и как пользоваться приложением
                </p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div class="glass-deep">
          <p
            class="text-xs font-semibold text-muted-foreground tracking-wide pt-4 pb-1 px-4"
          >
            ПОДДЕРЖКА
          </p>
          <div class="">
            <NuxtLink to="/support" class="px-4 py-3" :class="rowClass()">
              <div class="">
                <p class="text-sm font-medium">Поддержка</p>
                <p class="text-xs text-muted-foreground">
                  {{ supportDescription }}
                </p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </NuxtLink>
          </div>
        </div>

        <div class="glass-deep">
          <p
            class="text-xs font-semibold text-muted-foreground tracking-wide pt-4 pb-1 px-4"
          >
            ДОКУМЕНТЫ
          </p>
          <div class="">
            <!-- Ссылки на каноничные HTML-документы из public/legal -->
            <button
              type="button"
              class="px-4 py-3"
              :class="rowClass()"
              @click="openLegalDocument(termsOfServiceUrl)"
            >
              <div class="">
                <p class="text-sm font-medium">Условия использования</p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </button>

            <Separator class="w-auto mx-4" />

            <button
              type="button"
              class="px-4 py-3"
              :class="rowClass()"
              @click="openLegalDocument(privacyPolicyUrl)"
            >
              <div class="">
                <p class="text-sm font-medium">Политика конфиденциальности</p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div v-if="isAdmin" class="glass-deep">
          <p
            class="text-xs font-semibold text-muted-foreground tracking-wide pt-4 pb-1 px-4"
          >
            ПРИЛОЖЕНИЕ
          </p>
          <div class="">
            <NuxtLink
              to="/settings/language"
              class="px-4 py-3"
              :class="rowClass()"
            >
              <div class="">
                <p class="text-sm font-medium">Язык</p>
                <p class="text-xs text-muted-foreground">
                  {{ localeLabel }}
                </p>
              </div>
              <IconChevronRight class="h-4 w-4 text-muted-foreground" />
            </NuxtLink>
          </div>
        </div>

        <!-- Диалог для native push (permission denied в системных настройках) -->
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

        <Dialog v-model:open="showPushDisableConfirmModal" :modal="true">
          <DialogContent class="glass-deep max-w-sm">
            <DialogHeader>
              <DialogTitle>Отключить Push-уведомления?</DialogTitle>
              <DialogDescription>
                Напоминания перестанут приходить.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                @click="showPushDisableConfirmModal = false"
              >
                Отмена
              </Button>
              <Button
                class="mb-2"
                variant="destructive"
                @click="confirmDisablePush"
              >
                Отключить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div class="glass-deep p-4">
          <div class="flex justify-between">
            <AlertDialog
              :open="showDeleteDialog"
              @update:open="showDeleteDialog = $event"
            >
              <AlertDialogTrigger as-child>
                <button
                  type="button"
                  :class="[
                    'text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30',
                  ]"
                >
                  <span class="text-sm font-medium text-destructive"
                    >Удалить аккаунт</span
                  >
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent class="glass-deep">
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить аккаунт?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Вы уверены, что хотите удалить свой аккаунт?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel :disabled="isDeleting">
                    Отмена
                  </AlertDialogCancel>
                  <AlertDialogAction
                    :class="[
                      buttonVariants({ variant: 'destructive' }),
                      'relative',
                    ]"
                    @click="openDeleteConfirmDialog"
                  >
                    Да, удалить аккаунт
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <!-- Вторая модалка: детальное подтверждение удаления -->
            <AlertDialog
              :open="showDeleteConfirmDialog"
              @update:open="showDeleteConfirmDialog = $event"
            >
              <AlertDialogContent class="glass-deep">
                <AlertDialogHeader>
                  <AlertDialogTitle>Это действие необратимо</AlertDialogTitle>
                  <AlertDialogDescription>
                    Все данные вашего аккаунта будут удалены безвозвратно.
                    Восстановить их после удаления невозможно.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel :disabled="isDeleting">
                    Отмена
                  </AlertDialogCancel>
                  <Button
                    :class="[
                      buttonVariants({ variant: 'destructive' }),
                      'relative',
                    ]"
                    :disabled="isDeleting"
                    @click="handleDeleteAccount"
                  >
                    <ButtonLoader v-if="isDeleting" />
                    <span :class="isDeleting ? 'invisible' : ''">
                      Удалить навсегда
                    </span>
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <!-- Модалка подтверждения выхода -->
            <AlertDialog
              :open="showLogoutDialog"
              @update:open="showLogoutDialog = $event"
            >
              <AlertDialogContent class="glass-deep">
                <AlertDialogHeader>
                  <AlertDialogTitle>Выйти из аккаунта?</AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    :class="buttonVariants({ variant: 'secondary' })"
                    @click="handleLogout"
                  >
                    Выйти
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <button
              type="button"
              class="whitespace-nowrap"
              @click="showLogoutDialog = true"
            >
              <span class="text-sm font-medium">Выйти из аккаунта</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRuntimeConfig } from '#imports';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/app/stores/auth';
import { useUiSettingsStore, FONT_OPTIONS } from '@/app/stores/uiSettings';
import { useAppLockStore } from '@/app/stores/appLock';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useSubscriptionStore } from '@/app/stores/subscription';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useCopyToClipboard } from '@/app/composables/useCopyToClipboard';
import { useIosReviewBillingUi } from '@/app/composables/useIosReviewBillingUi';
import { useToast } from '@/app/composables/useToast';
import { usePushPermissionGate } from '@/app/composables/usePushPermissionGate';
import { useWebPush } from '@/app/composables/useWebPush';
import { useSettingsAnalytics } from '@/app/composables/useSettingsAnalytics';
import { useAppTour } from '@/app/composables/useAppTour';
import SubscriptionBlock from '@/app/components/settings/SubscriptionBlock.vue';
import ReferralShareCompactCard from '@/app/components/subscription/ReferralShareCompactCard.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import PushPermissionDeniedDialog from '@/app/components/notifications/PushPermissionDeniedDialog.vue';
import WebPushPermissionDialog from '@/app/components/notifications/WebPushPermissionDialog.vue';
import { Switch } from '@/app/components/ui/shadcn/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/shadcn/dialog';
import { Button } from '@/app/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { buttonVariants } from '@/app/components/ui/button';
import type {
  Addressing,
  UserPreferencesDto,
} from '@/shared/dto/notifications';
import {
  DEFAULT_ASSISTANT_TONE,
  getAssistantToneLabel,
} from '@/shared/constants/assistantTone';
import {
  getAssistantVoicePresentation,
  resolveAssistantVoiceCatalogItem,
} from '@/shared/constants/assistantVoiceCatalog';
import { openExternalBrowser } from '@/app/utils/openExternalBrowser';
import IconChevronRight from '~icons/lucide/chevron-right';

const auth = useAuthStore();
const uiSettings = useUiSettingsStore();
const fontOptions = FONT_OPTIONS;
const appLock = useAppLockStore();
const chatSettings = useChatSettingsStore();
const subscriptionStore = useSubscriptionStore();
const { fetchGlobalPreferences } = useNotificationsSettings();
const { copy } = useCopyToClipboard();
const { locale } = useI18n();
const { shouldHideIosReviewBillingUi } = useIosReviewBillingUi();
const runtimeConfig = useRuntimeConfig();

const preferences = ref<UserPreferencesDto | null>(null);
const loadingUser = ref(true);
const loadingPreferences = ref(true);
const showDeleteDialog = ref(false);
const showDeleteConfirmDialog = ref(false);
const showLogoutDialog = ref(false);
const isDeleting = ref(false);
const referralPanelRefreshKey = ref(0);
const marketingConsent = ref(false);
const marketingConsentLoading = ref(false);
const showPushDisableConfirmModal = ref(false);

const pushPermissionGate = usePushPermissionGate();
const pushSettings = pushPermissionGate.pushSettings;
const settingsAnalytics = useSettingsAnalytics();
const appTour = useAppTour();

/** Состояние свитчера Push берём из composable */
const pushSwitchChecked = computed(
  () => pushSettings.toggleChecked?.value ?? false
);

/** Лоадер Push — состояние из composable */
const pushLoading = computed(() => pushSettings.isToggling?.value ?? false);

/** На native ли платформа (для v-if и проверок) */
const isPushNative = computed(() => Boolean(pushSettings.isNative?.value));

// ==========================================
// Web push (desktop / PWA)
// ==========================================
const webPush = useWebPush();
const webPushAvailable = ref(false);
const webPushChecked = ref(false);
const webPushLoading = ref(false);

onMounted(() => {
  // Показываем строку если браузер умеет Web Push — независимо от Firebase конфига
  webPushAvailable.value = webPush.isBrowserCapable();
  // Состояние тоггла = пользователь явно включил + браузер дал разрешение.
  // Нельзя полагаться только на Notification.permission — оно остаётся 'granted'
  // даже после деактивации токена (например, при выключении в настройках).
  const permissionGranted =
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted';
  webPushChecked.value = permissionGranted && webPush.isUserActivated();
  // Если разрешение есть и пользователь был активирован — запускаем foreground listener
  if (permissionGranted && webPush.isUserActivated()) {
    webPush.setupForegroundListener();
  }
});

/** Показываем строку Push всегда — обработка несовместимых браузеров внутри */
const showPushRow = computed(() => true);

/** Push полностью поддерживается на этой платформе */
const isPushSupported = computed(
  () => isPushNative.value || webPushAvailable.value
);

/** Единое состояние свитчера */
const unifiedPushChecked = computed(() =>
  isPushNative.value ? pushSwitchChecked.value : webPushChecked.value
);

/** Единый лоадер */
const unifiedPushLoading = computed(() =>
  isPushNative.value ? pushLoading.value : webPushLoading.value
);

/** Единый обработчик переключения Push */
async function handleUnifiedPushToggle(checked: boolean) {
  if (isPushNative.value) {
    await handlePushToggle(checked);
    return;
  }
  // Web push (desktop / PWA)

  if (!checked) {
    // Выключение — async операция, user gesture не нужен
    webPushLoading.value = true;
    try {
      await webPush.deactivateOnLogout();
      webPushChecked.value = false;
    } finally {
      webPushLoading.value = false;
    }
    return;
  }

  webPushLoading.value = true;
  try {
    const success = await pushPermissionGate.ensureAppPushEnabled();
    webPushChecked.value = success;
  } finally {
    webPushLoading.value = false;
  }
}

const isLoading = computed(() => loadingUser.value || loadingPreferences.value);
const isAdmin = computed(() => auth.user?.role === 'admin');
const shouldShowReferralShare = computed(() => {
  return (
    !shouldHideIosReviewBillingUi.value &&
    subscriptionStore.subscriptionData?.billingProviderHint === 'yookassa'
  );
});
const supportDescription = computed(() => {
  if (shouldHideIosReviewBillingUi.value) {
    return 'Помощь, ответы на вопросы и обратная связь';
  }

  return 'Вопросы, отмена подписки и возвраты';
});

const displayName = computed(() => auth.user?.name?.trim() || 'Пользователь');
const displayEmail = computed(
  () => auth.user?.emailOriginal || auth.user?.email || 'Не указан'
);
const userInitials = computed(() => {
  const source = displayName.value || displayEmail.value || '?';
  const parts = source.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length >= 2
      ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
      : (source[0] ?? '?');
  return letters.toUpperCase();
});

const addressingLabel = computed(() => {
  const value = preferences.value?.addressing as Addressing | undefined;
  if (value === 'formal') return 'На "вы"';
  if (value === 'informal') return 'На "ты"';
  return '—';
});

const toneLabel = computed(() => {
  if (!preferences.value) return '—';
  const value = preferences.value.tone;
  return value === 'unknown'
    ? getAssistantToneLabel(DEFAULT_ASSISTANT_TONE)
    : getAssistantToneLabel(value);
});

const assistantVoiceSummary = computed(() => {
  const fallbackVoice = auth.user?.assistantSettings?.voice;
  const currentVoice = chatSettings.assistantVoice || fallbackVoice;
  const meta = resolveAssistantVoiceCatalogItem(currentVoice);
  const presentation = getAssistantVoicePresentation(
    meta,
    auth.user?.locale || locale.value
  );
  if (!meta) {
    return '—';
  }

  const genderLabel = meta.gender === 'female' ? 'Женский' : 'Мужской';
  return `${genderLabel} • ${presentation.label}`;
});

const localeLabel = computed(() => {
  const value = (auth.user?.locale || locale.value || 'ru').toString();
  if (value === 'ru') return 'Русский';
  if (value === 'en') return 'English';
  return value.toUpperCase();
});

const appLockStatusLabel = computed(() =>
  appLock.record ? 'Код активен на этом устройстве' : 'Код обязателен'
);

const legalLocale = computed(() => {
  const value = (auth.user?.locale || locale.value || 'ru').toString();
  return value.toLowerCase().startsWith('en') ? 'en' : 'ru';
});
const publicAppUrl = computed(() =>
  String(runtimeConfig.public.appUrl || 'https://my.mentala.app').replace(
    /\/$/,
    ''
  )
);

const termsOfServiceUrl = computed(
  () => `${publicAppUrl.value}/legal/terms-of-service-${legalLocale.value}.html`
);
const privacyPolicyUrl = computed(
  () => `${publicAppUrl.value}/legal/privacy-policy-${legalLocale.value}.html`
);

const rowBaseClass =
  'group flex w-full items-center justify-between gap-3  text-left text-sm text-foreground transition-all duration-200 hover:bg-white/10 scroll-mt-24';

const rowClass = () => rowBaseClass;

async function openLegalDocument(url: string) {
  await openExternalBrowser(url);
}

onMounted(async () => {
  loadingUser.value = true;
  try {
    if (!auth.user) {
      await auth.me();
    }
  } catch (error) {
    if (auth._isLogoutQuietPeriod()) return;
    console.error('Не удалось загрузить пользователя:', error);
    useToast('Ошибка', 'Не удалось загрузить профиль', 'error');
  } finally {
    loadingUser.value = false;
  }

  marketingConsent.value = Boolean(auth.user?.marketingConsent);
  if (auth._isLogoutQuietPeriod()) return;

  if (isPushNative.value) {
    void pushSettings.refreshPermissionStatus();
  }

  loadingPreferences.value = true;
  try {
    const [loadedPreferences] = await Promise.all([
      fetchGlobalPreferences(),
      chatSettings.getChatSettings().catch((error) => {
        console.error('Не удалось загрузить chat settings:', error);
        return null;
      }),
    ]);
    preferences.value = loadedPreferences;
  } catch (error) {
    console.error('Не удалось загрузить настройки ассистента:', error);
  } finally {
    loadingPreferences.value = false;
  }
});

async function handleMarketingConsentChange(value: boolean) {
  marketingConsentLoading.value = true;
  try {
    await useAPI('/api/user/me', {
      method: 'PATCH',
      body: {
        marketingConsent: value,
      },
    });
    marketingConsent.value = value;
    if (auth.user) {
      auth.user.marketingConsent = value;
    }
    settingsAnalytics.trackMarketingToggle(value);
    useToast(
      value ? 'Маркетинг включён' : 'Маркетинг выключен',
      value
        ? 'Вы будете получать новости и предложения'
        : 'Мы не будем отправлять промо‑сообщения'
    );
  } catch (error) {
    console.error('Не удалось обновить маркетинговое согласие:', error);
    marketingConsent.value = !value;
    useToast('Ошибка', 'Не удалось сохранить настройку', 'error');
  } finally {
    marketingConsentLoading.value = false;
  }
}

/** Обработка переключения Push-уведомлений (как handleMarketingConsentChange) */
async function handlePushToggle(checked: boolean) {
  if (!isPushNative.value) return;

  if (checked) {
    const enabled = await pushPermissionGate.ensureAppPushEnabled();
    const permission = pushSettings.pushPermissionStatus?.value ?? 'denied';
    settingsAnalytics.trackPushToggle(
      enabled,
      permission === 'granted' ? 'granted' : 'denied'
    );
  } else {
    showPushDisableConfirmModal.value = true;
  }
}

/** Подтверждение отключения Push */
async function confirmDisablePush() {
  showPushDisableConfirmModal.value = false;
  await pushSettings.disablePushInApp();
  settingsAnalytics.trackPushToggle(false);
}

/** Открыть системные настройки и обновить UI при возврате (best practice: re-check permission) */
async function handleOpenPushSystemSettings() {
  settingsAnalytics.trackOpenSystemSettings();
  await pushPermissionGate.openSystemSettings();
}

async function copyUserId() {
  if (!auth.user?.id) return;
  await copy(String(auth.user.id));
}

function openDeleteConfirmDialog() {
  showDeleteDialog.value = false;
  showDeleteConfirmDialog.value = true;
}

async function handleLogout() {
  await auth.logout();
}

/**
 * Запустить обзор интерфейса заново. Бэкенд не дёргаем (флаг appTour
 * уже стоит, менять его незачем). startReplay сам навигирует на нужную
 * страницу первого шага и ждёт появления target-селектора в DOM перед
 * активацией overlay — иначе тур закрылся бы сразу из-за пустого DOM.
 */
async function handleReplayAppTour() {
  await appTour.startReplay();
}

async function handleDeleteAccount() {
  if (isDeleting.value) return;
  isDeleting.value = true;

  try {
    // Останавливаем медиа и закрываем therapy-сессию ДО удаления,
    // пока сессия ещё валидна — иначе эти запросы вернут 401.
    await auth.prepareForAccountDeletion();

    const response = await useAPI<{
      ok?: boolean;
      error?: boolean;
      message?: string;
      loggedOut?: boolean;
    }>('/api/user/delete', {
      method: 'POST',
    });

    if (response.error) {
      useToast('Ошибка', response.message || 'Не удалось удалить аккаунт');
      return;
    }

    if (response.ok && response.loggedOut) {
      useToast('Аккаунт удалён');
      await auth.logoutAfterDeletion();
    }
  } catch (error: any) {
    const message =
      error?.response?.data?.message ||
      error?.message ||
      'Не удалось удалить аккаунт';
    useToast('Ошибка', String(message));
  } finally {
    isDeleting.value = false;
    showDeleteDialog.value = false;
    showDeleteConfirmDialog.value = false;
  }
}
</script>
