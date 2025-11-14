<script setup lang="ts">
import { computed } from 'vue';

const modelValue = defineModel<number>({ required: true });

const min = 1;
const max = 5;

// Прогресс для визуализации (0-100%)
const progress = computed(() => {
  return ((modelValue.value - min) / (max - min)) * 100;
});

// Метки частоты
const frequencyLabels = computed(() => {
  if (modelValue.value === 1) return 'раз в день';
  if (modelValue.value >= 2 && modelValue.value <= 4) return 'раза в день';
  return 'раз в день';
});
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Частота уведомлений
      </h3>
      <div class="flex items-baseline gap-1">
        <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{
          modelValue
        }}</span>
        <span class="text-sm text-gray-600 dark:text-gray-400">{{
          frequencyLabels
        }}</span>
      </div>
    </div>

    <!-- Слайдер -->
    <div class="relative py-4">
      <!-- Трек -->
      <div class="relative h-2 rounded-full bg-gray-200 dark:bg-gray-700">
        <!-- Заполненная часть -->
        <div
          class="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
          :style="{ width: `${progress}%` }"
        />
      </div>

      <!-- Инпут слайдера -->
      <input
        v-model.number="modelValue"
        type="range"
        :min="min"
        :max="max"
        step="1"
        class="absolute inset-0 w-full cursor-pointer opacity-0"
      />

      <!-- Маркеры -->
      <div class="absolute inset-x-0 top-0 flex justify-between px-0.5">
        <div
          v-for="i in max"
          :key="i"
          class="relative flex flex-col items-center"
        >
          <!-- Точка маркера -->
          <div
            class="h-2 w-2 rounded-full transition-all duration-300"
            :class="
              i <= modelValue
                ? 'scale-125 bg-white shadow-sm'
                : 'bg-gray-300 dark:bg-gray-600'
            "
          />

          <!-- Метка снизу -->
          <span
            class="mt-3 text-xs font-medium transition-all duration-300"
            :class="
              i === modelValue
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-400 dark:text-gray-600'
            "
          >
            {{ i }}
          </span>
        </div>
      </div>
    </div>

    <!-- Описание -->
    <p class="text-xs text-gray-600 dark:text-gray-400">
      Уведомления будут равномерно распределены в течение дня с учётом вашего
      часового пояса
    </p>
  </div>
</template>

