<template>
  <div class="h-dvh overflow-y-auto pb-[100px] space-y-2">
    <PageHeader title="Язык" :show-back-button="true" @go-back="goBack" />

    <section class="space-y-4">
      <div class="rounded-lg glass-deep p-4 space-y-3">
        <ToggleButtonGroup
          v-model="selectedLocale"
          :options="languageOptions"
          label="Язык интерфейса"
          layout="flex"
          size="sm"
          variant="outline"
          item-max-width="200px"
        />
        <p class="text-xs text-muted-foreground">
          Язык влияет на интерфейс и тексты ассистента.
        </p>
      </div>

      <section class="glass-deep p-3">
        <Button
          class="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSave"
          @click="saveLocale"
        >
          {{ saving ? 'Сохранение...' : 'Сохранить' }}
        </Button>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/app/stores/auth';
import { useToast } from '@/app/composables/useToast';
import ToggleButtonGroup from '@/app/components/ui/ToggleButtonGroup.vue';
import { Button } from '@/app/components/ui/button';

type SupportedLocale = 'ru' | 'en';

const auth = useAuthStore();
const { locale } = useI18n();
const langCookie = useCookie<string | null>('mentai.lang', {
  maxAge: 365 * 24 * 3600,
  path: '/',
});

const selectedLocale = ref<SupportedLocale>('ru');
const initialLocale = ref<SupportedLocale>('ru');
const saving = ref(false);

const languageOptions = [
  { value: 'ru' as SupportedLocale, label: 'Русский' },
  { value: 'en' as SupportedLocale, label: 'English' },
];

const canSave = computed(() => {
  return selectedLocale.value !== initialLocale.value && !saving.value;
});

onMounted(async () => {
  try {
    if (!auth.user) {
      await auth.me();
    }
  } catch (error) {
    console.error('Не удалось загрузить пользователя:', error);
  } finally {
    const current =
      (auth.user?.locale as SupportedLocale) ||
      (langCookie.value as SupportedLocale) ||
      (locale.value as SupportedLocale) ||
      'ru';
    selectedLocale.value = current;
    initialLocale.value = current;
  }
});

async function saveLocale() {
  if (!auth.user || saving.value) return;
  if (!canSave.value) return;

  saving.value = true;
  try {
    const response = await useAPI<{ item?: { locale?: string } }>(
      `/api/users/${auth.user.id}`,
      {
        method: 'PATCH',
        body: {
          locale: selectedLocale.value,
        },
      }
    );

    if (response?.item?.locale) {
      auth.user.locale = response.item.locale;
    } else {
      auth.user.locale = selectedLocale.value;
    }

    locale.value = selectedLocale.value;
    langCookie.value = selectedLocale.value;
    initialLocale.value = selectedLocale.value;

    useToast('Язык обновлён');
  } catch (error: any) {
    const payload = error?.data || error?.response?._data || {};
    const message = payload?.message || 'Не удалось обновить язык';
    useToast('Ошибка', String(message), 'error');
  } finally {
    saving.value = false;
  }
}

function goBack() {
  navigateTo('/settings');
}
</script>
