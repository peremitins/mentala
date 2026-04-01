<template>
  <div class="space-y-3">
    <div>
      <h3 class="text-sm font-medium text-foreground">
        Время получения напоминаний
      </h3>
      <p class="mt-1 text-xs text-foreground">
        Напоминания будут приходить только в выбранный промежуток времени и
        равномерно распределяться внутри него
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <!-- Start Time Picker -->
      <TimePicker v-model="startTime" label="Начало" />

      <!-- End Time Picker -->
      <TimePicker v-model="endTime" label="Конец" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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
</script>
