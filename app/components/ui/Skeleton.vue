<template>
  <div class="space-y-3">
    <div
      v-for="i in count"
      :key="i"
      :class="[
        'animate-pulse animate-slide-up',
        type === 'prompt'
          ? 'rounded-xl border-2 border-border bg-card p-4'
          : 'rounded-xl border border-border bg-card p-3',
      ]"
      :style="`animation-delay: ${(i - 1) * 0.05}s; animation-fill-mode: both`"
    >
      <!-- Скелетон для промпта -->
      <div v-if="type === 'prompt'" class="space-y-3">
        <div class="flex gap-2 w-full">
          <div
            class="size-5 bg-skeleton rounded-full flex-shrink-0 mt-0.5"
          ></div>
          <div class="flex-1 space-y-2">
            <div class="h-5 bg-skeleton rounded w-2/3"></div>
            <div class="h-4 bg-skeleton rounded w-full"></div>
            <div class="h-4 bg-skeleton rounded w-4/5"></div>
          </div>
        </div>
        <div class="h-px bg-skeleton"></div>
        <div class="flex justify-end gap-2">
          <div class="w-11 h-11 bg-skeleton rounded"></div>
          <div class="w-11 h-11 bg-skeleton rounded"></div>
        </div>
      </div>

      <!-- Скелетон для текста уведомления -->
      <div v-else-if="type === 'notification-text'" class="space-y-2">
        <div class="h-4 bg-skeleton rounded w-3/4"></div>
        <div class="h-4 bg-skeleton rounded w-1/2"></div>
      </div>

      <!-- Скелетон для элемента списка -->
      <div v-else-if="type === 'list-item'" class="space-y-2">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-skeleton rounded-xl flex-shrink-0"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 bg-skeleton rounded w-2/3"></div>
            <div class="h-3 bg-skeleton rounded w-1/2"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'prompt' | 'notification-text' | 'list-item';
    count?: number;
  }>(),
  {
    type: 'list-item',
    count: 3,
  }
);
</script>
