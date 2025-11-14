<script setup lang="ts">
const modelValue = defineModel<boolean>({ required: true });
</script>

<template>
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Уведомления
      </h3>
      <p class="text-xs text-gray-600 dark:text-gray-400">
        {{
          modelValue
            ? 'Уведомления включены'
            : 'Включите для получения напоминаний'
        }}
      </p>
    </div>

    <!-- Тогглер -->
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      class="group relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      :class="
        modelValue
          ? 'bg-blue-600 dark:bg-blue-500'
          : 'bg-gray-200 dark:bg-gray-700'
      "
      @click="modelValue = !modelValue"
    >
      <span
        class="pointer-events-none absolute left-1 inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200"
        :class="modelValue ? 'translate-x-5' : 'translate-x-0'"
      />
    </button>
  </div>
</template>

