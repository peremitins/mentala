<template>
  <div class="glass-deep p-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-[0.2em] text-foreground">
          Уведомления
        </p>
        <p class="text-lg font-semibold text-foreground">
          {{ statusLabel }}
        </p>
      </div>
      <Switch
        :checked="preference?.enabled ?? false"
        :disabled="loading"
        :loading="toggleLoading"
        @update:checked="$emit('toggle', $event)"
      />
    </div>

    <div class="my-2 border-t border-border" aria-hidden="true" />

    <div class="space-y-2">
      <Skeleton
        v-if="loading"
        type="simple-text"
        :count="1"
        :with-wrapper="false"
      />

      <template v-else>
        <div v-if="preference">
          <p class="text-sm text-foreground">
            Частота:
            <span class="font-medium text-foreground">
              {{ preference.timesPerDay }}
              {{ preference.timesPerDay === 1 ? 'раз' : 'раза' }} в день
            </span>
          </p>
          <p class="text-sm text-foreground">
            Окно:
            <span class="font-medium text-foreground">
              {{ windowText }}
            </span>
          </p>
          <p class="text-sm text-foreground">
            Дни:
            <span class="font-medium text-foreground">
              {{ daysText }}
            </span>
          </p>
        </div>
        <p v-else class="text-sm text-foreground">
          Уведомления ещё не настроены.
        </p>
      </template>
    </div>

    <Button
      size="sm"
      variant="outline"
      class="mt-4 w-full text-[12px] justify-between"
      :disabled="loading"
      @click="$emit('edit')"
    >
      Настройки уведомлений
      <IconChevronRight class="h-4 w-4 text-muted-foreground" />
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@/app/components/ui/button';
import { Switch } from '@/app/components/ui/shadcn/switch';
import type { NotificationPreferencesDto } from '@/shared/dto/notifications';
import { formatMinutesToTime, formatActiveDays } from '@/app/utils/time';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import IconChevronRight from '~icons/lucide/chevron-right';

const props = defineProps<{
  preference: NotificationPreferencesDto | null;
  /** Загрузка контента (скелетон) */
  loading?: boolean;
  /** Загрузка при переключении тумблера (спиннер на кругляше) */
  toggleLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'toggle', value: boolean): void;
}>();

const windowText = computed(() => {
  if (!props.preference) return '—';
  return `${formatMinutesToTime(props.preference.timeRangeStart)} — ${formatMinutesToTime(
    props.preference.timeRangeEnd
  )}`;
});

const daysText = computed(() => {
  if (!props.preference) return '—';
  return formatActiveDays(props.preference.activeDays);
});

const statusLabel = computed(() => {
  if (!props.preference) return 'Не настроено';
  return props.preference.enabled ? 'Включены' : 'Выключены';
});
</script>
