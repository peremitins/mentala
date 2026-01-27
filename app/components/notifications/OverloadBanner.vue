<template>
  <div
    :class="[
      'rounded-2xl px-3 py-2 text-sm border transition-all duration-300 ease-in-out overflow-hidden',
      isOver
        ? 'bg-destructive/10 border-destructive/50'
        : 'bg-muted/60 border-border/60',
    ]"
    role="status"
    :aria-live="isOver ? 'assertive' : 'polite'"
  >
    <div class="flex items-start gap-2">
      <span class="" :class="{ 'animate-pulse': isOver }">
        {{ isOver ? '⚠️' : '💡' }}
      </span>
      <div class="flex-1 min-h-0">
        <!-- Счётчик уведомлений -->
        <div
          class="text-sm font-semibold"
          :class="isOver ? 'text-destructive' : 'text-foreground'"
        >
          {{ pluralize(totalPerDay) }}: {{ totalPerDay }}
        </div>
        <!-- Основной текст с плавной сменой -->
        <div class="relative">
          <span
            :key="isOver ? 'over' : 'tip'"
            class="block transition-all duration-300 text-xs text-foreground mt-1"
            :class="{ 'font-medium': isOver }"
          >
            {{
              isOver
                ? t('notifications.banner.over')
                : t('notifications.banner.tip')
            }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

interface Props {
  totalPerDay: number;
  threshold?: number;
}

const props = withDefaults(defineProps<Props>(), { threshold: 10 });
const { t } = useI18n();

const isOver = computed(() => props.totalPerDay > props.threshold);

function pluralize(count: number): string {
  if (count === 1) return 'уведомление в день';
  if (count >= 2 && count <= 4) return 'Всего уведомлений в день';
  return 'Всего уведомлений в день';
}
</script>
