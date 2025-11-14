<script setup lang="ts">
import { ref, computed } from 'vue';
import TimePicker from '@/app/components/TimePicker.vue';

interface Props {
  modelValue: {
    start: number; // минуты от начала дня (0-1439)
    end: number; // минуты от начала дня (0-1439)
  };
}

interface Emits {
  (e: 'update:modelValue', value: { start: number; end: number }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Локальные значения
const startTime = computed({
  get: () => props.modelValue.start,
  set: (value: number) => {
    emit('update:modelValue', { start: value, end: props.modelValue.end });
  },
});

const endTime = computed({
  get: () => props.modelValue.end,
  set: (value: number) => {
    emit('update:modelValue', { start: props.modelValue.start, end: value });
  },
});

// Вычисляем длительность окна
const duration = computed(() => {
  const start = props.modelValue.start;
  const end = props.modelValue.end;

  let durationMinutes: number;
  if (start <= end) {
    // Обычный диапазон внутри суток
    durationMinutes = end - start;
  } else {
    // Диапазон через полночь
    durationMinutes = 1440 - start + end;
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (minutes === 0) {
    return `${hours} ч`;
  }
  return `${hours} ч ${minutes} мин`;
});

// Проверяем, переходит ли диапазон через полночь
const crossesMidnight = computed(() => {
  return props.modelValue.start > props.modelValue.end;
});

// Форматируем время для отображения
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
        Время получения уведомлений
      </h3>
      <p class="mt-1 text-xs text-gray-600 dark:text-gray-400">
        Уведомления будут приходить только в выбранный промежуток времени и
        равномерно распределяться внутри него
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <!-- Start Time Picker -->
      <TimePicker v-model="startTime" label="Начало" />

      <!-- End Time Picker -->
      <TimePicker v-model="endTime" label="Конец" />
    </div>

    <!-- Информация о диапазоне -->
    <div
      class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex items-center gap-2">
        <span class="font-medium text-gray-900 dark:text-gray-100">
          {{ formatTime(modelValue.start) }} — {{ formatTime(modelValue.end) }}
        </span>
        <span
          v-if="crossesMidnight"
          class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300"
        >
          через полночь
        </span>
      </div>
      <span class="text-gray-600 dark:text-gray-400">
        {{ duration }}
      </span>
    </div>
  </div>
</template>
