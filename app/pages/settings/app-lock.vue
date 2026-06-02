<template>
  <div class="h-dvh overflow-y-auto pb-[100px] xs:space-y-3 space-y-1">
    <PageHeader
      title="Защита входа"
      :show-back-button="true"
      @go-back="goBack"
    />

    <section class="xs:space-y-3 space-y-1">
      <div class="glass-deep p-4 space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium">Статус</p>
            <p class="text-xs text-muted-foreground">
              {{ appLockStatusLabel }}
            </p>
          </div>
          <IconLockKeyhole class="h-4 w-4 text-muted-foreground" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            class="w-full"
            @click="handleChangeAppLockCode"
          >
            Изменить код
          </Button>
          <Button
            type="button"
            variant="outline"
            class="w-full"
            @click="handleManualLock"
          >
            Заблокировать сейчас
          </Button>
        </div>
      </div>

      <div class="glass-deep p-4 xs:space-y-3 space-y-1">
        <p class="text-sm font-medium">Запрашивать повторно</p>
        <p class="text-xs text-muted-foreground">
          Через какое время неактивности снова запросить код.
        </p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-2">
          <button
            v-for="option in appLockRepeatOptions"
            :key="option.value"
            type="button"
            class="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
            :class="
              appLock.lockAfterSeconds === option.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:border-primary/60 hover:text-foreground'
            "
            @click="handleLockAfterChange(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="glass-deep p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">Биометрия</p>
            <p class="text-xs text-muted-foreground">
              {{ appLockBiometryLabel }}
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAppLockStore } from '@/app/stores/appLock';
import { useToast } from '@/app/composables/useToast';
import { Button } from '@/app/components/ui/button';
import type { AppLockAfterSeconds } from '@/app/utils/appLockCrypto';
import IconLockKeyhole from '~icons/lucide/lock-keyhole';

const appLock = useAppLockStore();

const appLockRepeatOptions: Array<{
  value: AppLockAfterSeconds;
  label: string;
}> = [
  { value: 0, label: 'Сразу' },
  { value: 60, label: '1 мин' },
  { value: 300, label: '5 мин' },
  { value: 900, label: '15 мин' },
];

const appLockStatusLabel = computed(() =>
  appLock.record ? 'Код активен на этом устройстве' : 'Код обязателен'
);

const appLockBiometryLabel = computed(() =>
  appLock.biometric.available ? appLock.biometric.label : 'PIN-код'
);

function handleChangeAppLockCode() {
  appLock.startSetup('change');
}

function handleManualLock() {
  appLock.lockNow();
}

async function handleLockAfterChange(value: AppLockAfterSeconds) {
  try {
    await appLock.setLockAfterSeconds(value);
    useToast('Сохранено', 'Период повторной проверки обновлён');
  } catch (error) {
    console.error('Не удалось обновить период блокировки:', error);
    useToast('Ошибка', 'Не удалось сохранить настройку', 'error');
  }
}

function goBack() {
  navigateTo('/settings');
}
</script>
