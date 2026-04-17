<template>
  <Dialog :open="open" :modal="true" @update:open="emit('update:open', $event)">
    <DialogContent class="glass-deep max-w-sm">
      <DialogHeader>
        <DialogTitle>Нет доступа к микрофону</DialogTitle>
        <DialogDescription v-if="mode === 'native'">
          Доступ к микрофону запрещён в системных настройках. Разрешите его,
          чтобы использовать диктовку.
        </DialogDescription>
        <DialogDescription v-else>
          Доступ к микрофону заблокирован для Mentala. Его нужно снова разрешить
          в настройках браузера или устройства.
        </DialogDescription>
      </DialogHeader>

      <div
        v-if="mode === 'browser'"
        class="space-y-3 px-1 text-sm text-muted-foreground"
      >
        <div
          v-if="isStandalonePwa"
          class="rounded-md border border-amber-500/20 bg-amber-500/10 p-3"
        >
          <p class="mb-1 font-medium text-foreground">
            Приложение открыто с главного экрана
          </p>
          <ol class="list-decimal space-y-1 pl-4 text-xs">
            <li>Открой системные настройки устройства</li>
            <li>Найди приложение Mentala</li>
            <li>В разделе «Разрешения» включи микрофон</li>
            <li>Вернись в приложение и нажми на микрофон снова</li>
          </ol>
        </div>

        <div>
          <p class="mb-1 font-medium text-foreground">
            Если сайт открыт в браузере:
          </p>
          <ol class="list-decimal space-y-1 pl-4 text-xs">
            <li>Нажми на иконку слева от адреса сайта</li>
            <li>Открой раздел «Разрешения»</li>
            <li>Для микрофона выбери «Разрешить» или «Спросить»</li>
            <li>Обнови страницу и повтори попытку</li>
          </ol>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">
          {{ mode === 'native' ? 'Отмена' : 'Понятно' }}
        </Button>
        <Button
          v-if="mode === 'native'"
          class="mb-2"
          @click="emit('open-settings')"
        >
          Открыть настройки
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/shadcn/dialog';
import { Button } from '@/app/components/ui/button';

defineProps<{
  open: boolean;
  mode: 'native' | 'browser';
  isStandalonePwa?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'open-settings'): void;
}>();
</script>
