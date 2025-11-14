<script setup lang="ts">
import type { Directness } from '@/app/lib/notificationTemplates';

const modelValue = defineModel<Directness>({ required: true });

const options = [
  {
    value: 'soft' as Directness,
    label: 'Мягко',
    description: 'Поддержка, без давления',
    icon: '🌸',
  },
  {
    value: 'moderate' as Directness,
    label: 'Умеренно',
    description: 'Конкретнее, но корректно',
    icon: '⚖️',
  },
  {
    value: 'hard' as Directness,
    label: 'Жёстко',
    description: 'Максимальная директивность',
    icon: '⚡',
  },
];
</script>

<template>
  <div class="space-y-2">
    <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
      Стиль подачи
    </h3>

    <div class="space-y-2">
      <label
        v-for="option in options"
        :key="option.value"
        class="group relative flex cursor-pointer items-start rounded-xl border-2 p-4 transition-all duration-200 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
        :class="
          modelValue === option.value
            ? 'border-blue-500 bg-blue-50 shadow-sm dark:border-blue-600 dark:bg-blue-950/40'
            : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
        "
      >
        <input
          v-model="modelValue"
          type="radio"
          :value="option.value"
          class="mt-1 h-4 w-4 flex-shrink-0 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-offset-gray-900"
        />

        <div class="ml-3 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ option.icon }}</span>
            <span
              class="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              {{ option.label }}
            </span>
          </div>
          <p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            {{ option.description }}
          </p>
        </div>

        <!-- Галочка при выборе -->
        <div
          v-if="modelValue === option.value"
          class="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm transition-all duration-200 dark:bg-blue-600"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="3"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      </label>
    </div>
  </div>
</template>

