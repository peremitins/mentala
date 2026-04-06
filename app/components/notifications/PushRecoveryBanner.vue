<template>
  <div
    class="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm transition-all duration-300 ease-in-out"
    role="status"
    aria-live="polite"
  >
    <div class="flex items-center gap-2">
      <span class="flex-shrink-0 text-base">🔔</span>
      <div class="min-h-0 flex-1">
        <p class="text-sm font-semibold text-foreground">
          Уведомления отключены
        </p>
        <p class="mt-0.5 text-xs text-foreground/70">
          Напоминания не будут приходить, пока не включены push-уведомления
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        class="flex-shrink-0"
        @click="emit('enable')"
      >
        Включить
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/app/components/ui/button';

const emit = defineEmits<{
  (e: 'enable'): void;
}>();
</script>
