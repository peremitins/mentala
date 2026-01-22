<template>
  <div class="h-dvh overflow-y-auto pb-[100px] space-y-2">
    <PageHeader title="⚙️&nbsp;&nbsp;Настройки" />

    <section class="">
      <Skeleton
        v-if="isLoading"
        type="settings-page"
        :count="1"
        :with-wrapper="false"
      />

      <div v-else class="space-y-2">
        <NuxtLink
          to="/settings/profile"
          class="glass-deep p-4 flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="h-12 w-12 rounded-full bg-primary/15 text-primary-foreground flex items-center justify-center text-sm font-semibold"
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
          </div>
        </div>

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
              to="/docs/privacy"
              target="_blank"
              rel="noopener noreferrer"
              class="px-4 py-3"
              :class="rowClass()"
            >
              <div class="">
                <p class="text-sm font-medium">Политика конфиденциальности</p>
                <p class="text-xs text-muted-foreground">
                  Как мы защищаем данные
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

        <div class="glass-deep">
          <p
            class="text-xs font-semibold text-muted-foreground tracking-wide pt-4 pb-1 px-4"
          >
            СЛУЖЕБНОЕ
          </p>
          <div class="">
            <button
              v-if="isAdmin"
              type="button"
              class="px-4 py-3"
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

            <Separator class="w-auto mx-4" />

            <button
              type="button"
              class="px-4 py-3"
              :class="rowClass()"
              @click="handleLogout"
            >
              <span class="text-sm font-medium">Выйти из аккаунта</span>
            </button>

            <Separator class="w-auto mx-4" />

            <AlertDialog
              :open="showDeleteDialog"
              @update:open="showDeleteDialog = $event"
            >
              <AlertDialogTrigger as-child>
                <button
                  type="button"
                  :class="[
                    rowClass(),
                    'px-4 py-3',
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
                    :class="buttonVariants({ variant: 'destructive' })"
                    :disabled="isDeleting"
                    @click="handleDeleteAccount"
                  >
                    {{ isDeleting ? 'Удаление...' : 'Да, удалить аккаунт' }}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/app/stores/auth';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useCopyToClipboard } from '@/app/composables/useCopyToClipboard';
import { useToast } from '@/app/composables/useToast';
import SubscriptionBlock from '@/app/components/settings/SubscriptionBlock.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
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
  Tone,
  UserPreferencesDto,
} from '@/shared/dto/notifications';
import IconChevronRight from '~icons/lucide/chevron-right';

const auth = useAuthStore();
const { fetchGlobalPreferences } = useNotificationsSettings();
const { copy } = useCopyToClipboard();
const { locale } = useI18n();

const preferences = ref<UserPreferencesDto | null>(null);
const loadingUser = ref(true);
const loadingPreferences = ref(true);
const showDeleteDialog = ref(false);
const isDeleting = ref(false);

const isLoading = computed(() => loadingUser.value || loadingPreferences.value);
const isAdmin = computed(() => auth.user?.role === 'admin');

const displayName = computed(() => auth.user?.name?.trim() || 'Пользователь');
const displayEmail = computed(() => auth.user?.email || 'Не указан');
const userInitials = computed(() => {
  const source = displayName.value || displayEmail.value || '?';
  const parts = source.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length >= 2
      ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
      : (source[0] ?? '?');
  return letters.toUpperCase();
});

const toneLabels: Record<Tone, string> = {
  delicate: 'Деликатный',
  neutral: 'Нейтральный',
  uplifting: 'Воодушевляющий',
  resolute: 'Решительный',
  demanding: 'Требовательный',
  unknown: 'Нейтральный',
};

const addressingLabel = computed(() => {
  const value = preferences.value?.addressing as Addressing | undefined;
  if (value === 'formal') return 'На "Вы"';
  if (value === 'informal') return 'На "ты"';
  return '—';
});

const toneLabel = computed(() => {
  if (!preferences.value) return '—';
  const value = preferences.value.tone;
  return toneLabels[value] || 'Нейтральный';
});

const localeLabel = computed(() => {
  const value = (auth.user?.locale || locale.value || 'ru').toString();
  if (value === 'ru') return 'Русский';
  if (value === 'en') return 'English';
  return value.toUpperCase();
});

const rowBaseClass =
  'group flex w-full items-center justify-between gap-3  text-left text-sm text-foreground transition-all duration-200 hover:bg-white/10 scroll-mt-24';

const rowClass = () => rowBaseClass;

onMounted(async () => {
  loadingUser.value = true;
  try {
    if (!auth.user) {
      await auth.me();
    }
  } catch (error) {
    console.error('Не удалось загрузить пользователя:', error);
    useToast('Ошибка', 'Не удалось загрузить профиль', 'error');
  } finally {
    loadingUser.value = false;
  }

  loadingPreferences.value = true;
  try {
    preferences.value = await fetchGlobalPreferences();
  } catch (error) {
    console.error('Не удалось загрузить настройки ассистента:', error);
  } finally {
    loadingPreferences.value = false;
  }
});

async function copyUserId() {
  if (!auth.user?.id) return;
  await copy(String(auth.user.id));
}

async function handleLogout() {
  await auth.logout();
}

async function handleDeleteAccount() {
  if (isDeleting.value) return;
  isDeleting.value = true;

  try {
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
      await auth.logout();
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
  }
}
</script>
