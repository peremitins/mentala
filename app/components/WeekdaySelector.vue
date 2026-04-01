<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <label class="text-sm font-medium text-foreground"> Дни недели </label>
      <span class="text-xs font-medium text-foreground">
        {{ selectedDaysText }}
      </span>
    </div>

    <div class="grid grid-cols-7 gap-1.5">
      <button
        v-for="day in weekdays"
        :key="day.value"
        type="button"
        :aria-label="`Выбрать ${day.fullLabel}`"
        :class="[
          'flex h-8 items-center justify-center rounded-lg border text-sm font-medium transition-all',
          props.modelValue.includes(day.value)
            ? 'border-primary-ui bg-primary-ui/20 text-surface-raised-foreground hover:opacity-75'
            : 'border-border text-surface-inactive-foreground hover:border-primary-ui hover:text-surface-raised-foreground',
          // Если это последний выбранный день - не даем его отключить
          props.modelValue.includes(day.value) && props.modelValue.length === 1
            ? 'cursor-not-allowed opacity-75'
            : 'cursor-pointer',
        ]"
        :disabled="
          props.modelValue.includes(day.value) && props.modelValue.length === 1
        "
        @click="handleDayToggle(String(day.value))"
      >
        {{ day.label }}
      </button>
    </div>

    <p class="text-xs text-foreground">
      Выберите дни для получения напоминаний
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  modelValue: number[];
}

interface Emits {
  (e: 'update:modelValue', value: number[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Дни недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
// Но для удобства UI отображаем с Понедельника
const weekdays = [
  { value: 1, label: 'Пн', fullLabel: 'Понедельник' },
  { value: 2, label: 'Вт', fullLabel: 'Вторник' },
  { value: 3, label: 'Ср', fullLabel: 'Среда' },
  { value: 4, label: 'Чт', fullLabel: 'Четверг' },
  { value: 5, label: 'Пт', fullLabel: 'Пятница' },
  { value: 6, label: 'Сб', fullLabel: 'Суббота' },
  { value: 0, label: 'Вс', fullLabel: 'Воскресенье' },
];

// Обработчик клика по дню - проверяем, можно ли его отключить
function handleDayToggle(dayValue: string) {
  const dayNum = Number(dayValue);
  const isCurrentlySelected = props.modelValue.includes(dayNum);

  // Если день уже выбран и это последний выбранный день - не позволяем отключить
  if (isCurrentlySelected && props.modelValue.length === 1) {
    return; // Не делаем ничего
  }

  // Иначе обрабатываем нормально
  const newSelected = isCurrentlySelected
    ? props.modelValue.filter((d) => d !== dayNum)
    : [...props.modelValue, dayNum].sort((a, b) => a - b);

  emit('update:modelValue', newSelected);
}

// Вычисляем текст для отображения выбранных дней
const selectedDaysText = computed(() => {
  const count = props.modelValue.length;
  if (count === 7) return 'Каждый день';
  if (count === 0) return 'Не выбрано';

  // Проверяем рабочие дни (Пн-Пт)
  const workdays = [1, 2, 3, 4, 5];
  const isWorkdays =
    workdays.every((day) => props.modelValue.includes(day)) &&
    !props.modelValue.includes(0) &&
    !props.modelValue.includes(6);
  if (isWorkdays) return 'Рабочие дни (Пн-Пт)';

  // Проверяем выходные (Сб-Вс)
  const weekends = [0, 6];
  const isWeekends =
    weekends.every((day) => props.modelValue.includes(day)) &&
    props.modelValue.length === 2;
  if (isWeekends) return 'Выходные (Сб-Вс)';

  // Иначе перечисляем дни
  const sorted = [...props.modelValue].sort((a, b) => {
    // Сортируем с понедельника
    const orderA = a === 0 ? 7 : a;
    const orderB = b === 0 ? 7 : b;
    return orderA - orderB;
  });

  return sorted
    .map((day) => weekdays.find((wd) => wd.value === day)?.label)
    .join(', ');
});
</script>
