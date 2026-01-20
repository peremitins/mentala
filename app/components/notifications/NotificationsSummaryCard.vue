<template>
  <div class="glass-deep p-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Уведомления
        </p>
        <p class="text-lg font-semibold text-foreground">
          {{ statusLabel }}
        </p>
      </div>
      <Button
        size="sm"
        variant="default"
        class="text-[12px]"
        :disabled="loading"
        @click="$emit('edit')"
      >
        Настроить
      </Button>
    </div>

    <div class="mt-4 space-y-2">
      <Skeleton
        v-if="loading"
        type="simple-text"
        :count="1"
        :with-wrapper="false"
      />

      <template v-else>
        <div v-if="preference">
          <p class="text-sm text-muted-foreground">
            Частота:
            <span class="font-medium text-foreground">
              {{ preference.timesPerDay }}
              {{ preference.timesPerDay === 1 ? 'раз' : 'раза' }} в день
            </span>
          </p>
          <p class="text-sm text-muted-foreground">
            Окно:
            <span class="font-medium text-foreground">
              {{ windowText }}
            </span>
          </p>
          <p class="text-sm text-muted-foreground">
            Дни:
            <span class="font-medium text-foreground">
              {{ daysText }}
            </span>
          </p>
        </div>
        <p v-else class="text-sm text-muted-foreground">
          Уведомления ещё не настроены.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@/app/components/ui/button';
import type { NotificationPreferencesDto } from '@/shared/dto/notifications';
import { formatMinutesToTime, formatActiveDays } from '@/app/utils/time';
import Skeleton from '@/app/components/ui/Skeleton.vue';

const props = defineProps<{
  preference: NotificationPreferencesDto | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
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
