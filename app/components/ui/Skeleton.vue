<template>
  <div class="space-y-3">
    <div
      v-for="i in count"
      :key="i"
      :class="[
        'animate-pulse animate-slide-up',
        roundedClass,
        !withWrapper
          ? ''
          : type === 'prompt'
            ? 'border-2 border-border bg-transparent p-4'
            : 'border border-border bg-transparent p-3',
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

      <!-- Скелетон для страниц медитаций и дыхательных практик -->
      <div v-else-if="type === 'practice-page'" class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div class="space-y-2">
            <div class="h-3 bg-skeleton rounded w-40"></div>
            <div class="h-5 bg-skeleton rounded w-28"></div>
          </div>
        </div>

        <div class="flex gap-4">
          <div class="flex-1 space-y-3">
            <div class="h-24 bg-skeleton rounded-2xl"></div>
          </div>
          <div class="flex-1 space-y-3">
            <div class="h-24 bg-skeleton rounded-2xl"></div>
          </div>
        </div>
      </div>

      <!-- Скелетон для статуса подписки -->
      <div v-else-if="type === 'subscription-status'" class="space-y-3">
        <!-- Заголовок -->
        <div class="h-4 bg-skeleton rounded w-1/3"></div>

        <!-- Текущий план -->
        <div class="space-y-2">
          <div class="h-5 bg-skeleton rounded w-2/3"></div>
          <div class="h-4 bg-skeleton rounded w-1/2"></div>
        </div>

        <!-- Дополнительная информация -->
        <div class="h-3 bg-skeleton rounded w-3/4"></div>
      </div>

      <!-- Скелетон для карточки плана -->
      <div v-else-if="type === 'plan-card'" class="space-y-4">
        <!-- Заголовок и бейджи -->
        <div class="flex items-center justify-between">
          <div class="h-6 bg-skeleton rounded w-24"></div>
          <div class="flex items-center gap-2">
            <div class="h-5 bg-skeleton rounded w-20"></div>
          </div>
        </div>

        <!-- Переключатель месяц/год -->
        <div class="flex items-center gap-1.5">
          <div class="h-7 bg-skeleton rounded-md w-16"></div>
          <div class="h-7 bg-skeleton rounded-md w-16"></div>
        </div>

        <!-- Цена -->
        <div class="space-y-1">
          <div class="h-8 bg-skeleton rounded w-32"></div>
          <div class="h-4 bg-skeleton rounded w-24"></div>
        </div>

        <!-- Описание -->
        <div class="space-y-2">
          <div class="h-4 bg-skeleton rounded w-full"></div>
          <div class="h-4 bg-skeleton rounded w-4/5"></div>
        </div>

        <!-- Кнопка -->
        <div class="h-10 bg-skeleton rounded-md w-full"></div>
      </div>

      <div v-else-if="type === 'simple-text'" class="space-y-3">
        <div class="h-3 bg-skeleton rounded w-full" />
        <div class="h-3 bg-skeleton rounded w-full" />
        <div class="h-3 bg-skeleton rounded w-3/4" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    type?:
      | 'prompt'
      | 'notification-text'
      | 'list-item'
      | 'subscription-status'
      | 'plan-card'
      | 'simple-text'
      | 'practice-page';
    count?: number;
    roundedSize?: 'sm' | 'md' | 'lg' | 'xl';
    withWrapper?: boolean;
  }>(),
  {
    type: 'list-item',
    count: 3,
    roundedSize: 'xl',
    withWrapper: true,
  }
);

// Маппинг roundedSize на фиксированные классы Tailwind
const roundedClass = computed(() => {
  const roundedMap: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
  };
  return roundedMap[props.roundedSize];
});
</script>
