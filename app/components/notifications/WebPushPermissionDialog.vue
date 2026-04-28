<template>
  <Dialog :open="open" :modal="true" @update:open="emit('update:open', $event)">
    <DialogContent class="glass-deep max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3 px-1 text-sm text-muted-foreground">
        <template v-if="reason === 'unsupported'">
          <div
            v-if="isIos && !isStandaloneMode"
            class="rounded-md border border-amber-500/20 bg-amber-500/10 p-3"
          >
            <p class="mb-1 font-medium text-foreground">
              На iPhone откройте Ментала с экрана Домой
            </p>
            <ol class="list-inside list-decimal space-y-1 text-xs">
              <li>Откройте сайт в Safari.</li>
              <li>Нажмите «Поделиться».</li>
              <li>Выберите «На экран Домой».</li>
              <li>Откройте Ментала с экрана Домой и включите напоминания.</li>
            </ol>
          </div>

          <div v-else>
            <p class="mb-1 font-medium text-foreground">
              В этом режиме уведомления недоступны
            </p>
            <ol class="list-inside list-decimal space-y-1">
              <li>Откройте Ментала в Chrome, Edge или Safari.</li>
              <li>Обновите страницу и включите напоминания снова.</li>
            </ol>
          </div>
        </template>

        <template v-else-if="isAndroid && isStandaloneMode">
          <div
            class="rounded-md border border-amber-500/20 bg-amber-500/10 p-3"
          >
            <p class="mb-1 font-medium text-foreground">
              Android: проверьте разрешение сайта
            </p>
            <p class="mb-2 text-xs">
              Если уведомления уже включены в настройках телефона, но
              напоминания всё равно не включаются, проверьте разрешение в
              Chrome.
            </p>
            <ol class="list-inside list-decimal space-y-1 text-xs">
              <li>Откройте Chrome.</li>
              <li>Перейдите в «Настройки» → «Настройки сайтов».</li>
              <li>Откройте «Уведомления» и найдите этот сайт.</li>
              <li>Выберите «Разрешить» или сбросьте блокировку.</li>
              <li>
                Полностью закройте Ментала и откройте её снова, чтобы настройки
                применились.
              </li>
            </ol>
          </div>
        </template>

        <template v-else-if="isStandaloneMode">
          <div
            class="rounded-md border border-amber-500/20 bg-amber-500/10 p-3"
          >
            <p class="mb-1 font-medium text-foreground">
              Приложение установлено на экран
            </p>
            <p class="mb-2 text-xs">
              Разрешение управляется настройками устройства.
            </p>
            <ol class="list-inside list-decimal space-y-1 text-xs">
              <li>Откройте настройки устройства.</li>
              <li>Найдите Ментала или этот сайт в списке приложений.</li>
              <li>Откройте «Уведомления» и разрешите их.</li>
              <li>
                Полностью закройте Ментала и откройте её снова, чтобы настройки
                применились.
              </li>
            </ol>
          </div>
        </template>

        <template v-else>
          <div v-if="isAndroid">
            <p class="mb-1 font-medium text-foreground">
              Android, браузер Chrome
            </p>
            <ol class="list-inside list-decimal space-y-1">
              <li>Нажмите на значок настроек сайта слева от адреса.</li>
              <li>Откройте раздел «Уведомления».</li>
              <li>Выберите «Сбросить» или «Разрешить».</li>
              <li>Обновите страницу и включите напоминания снова.</li>
            </ol>
          </div>

          <div v-else-if="isIos">
            <p class="mb-1 font-medium text-foreground">iPhone или iPad</p>
            <ol class="list-inside list-decimal space-y-1">
              <li>Добавьте сайт на экран Домой через Safari.</li>
              <li>Откройте установленную Ментала с экрана Домой.</li>
              <li>Включите напоминания внутри приложения.</li>
            </ol>
          </div>

          <div v-else>
            <p class="mb-1 font-medium text-foreground">
              Компьютер, Chrome или Edge
            </p>
            <ol class="list-inside list-decimal space-y-1">
              <li>Нажмите на значок настроек сайта слева от адреса.</li>
              <li>Откройте «Настройки сайта».</li>
              <li>В пункте «Уведомления» выберите «Разрешить».</li>
              <li>Обновите страницу и включите напоминания снова.</li>
            </ol>
          </div>

          <div>
            <p class="mb-1 font-medium text-foreground">Mac, Safari</p>
            <ol class="list-inside list-decimal space-y-1">
              <li>Откройте Safari → «Настройки» → «Веб-сайты».</li>
              <li>Перейдите в раздел «Уведомления».</li>
              <li>Найдите этот сайт и выберите «Разрешить».</li>
              <li>Обновите страницу и включите напоминания снова.</li>
            </ol>
          </div>
        </template>
      </div>

      <DialogFooter>
        <Button @click="emit('update:open', false)">Понятно</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/shadcn/dialog';
import { Button } from '@/app/components/ui/button';
import type { WebPushPermissionDialogReason } from '@/app/composables/usePushPermissionGate';

const props = defineProps<{
  open: boolean;
  reason: WebPushPermissionDialogReason;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const isStandaloneMode = computed(() => {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    navigatorWithStandalone.standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
});

const platformFamily = computed<'ios' | 'android' | 'desktop'>(() => {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) {
    return 'ios';
  }
  if (/android/.test(ua)) return 'android';
  return 'desktop';
});

const isIos = computed(() => platformFamily.value === 'ios');
const isAndroid = computed(() => platformFamily.value === 'android');

const title = computed(() =>
  props.reason === 'unsupported'
    ? 'Уведомления недоступны'
    : 'Уведомления заблокированы'
);

const description = computed(() =>
  props.reason === 'unsupported'
    ? 'В текущем режиме приложение не может включить напоминания. Попробуйте открыть Ментала в поддерживаемом браузере или с экрана Домой.'
    : 'Уведомления запрещены для этого сайта или приложения. Автоматически разблокировать их нельзя.'
);
</script>
