<template>
  <div class="space-y-6">
    <section class="space-y-4">
      <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">
        Загрузка...
      </div>

      <div v-else-if="user" class="space-y-4">
        <!-- ID -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
            ID
          </label>
          <div
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {{ user.id }}
          </div>
        </div>

        <!-- Email -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>
          <div
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {{ user.email || 'Не указан' }}
          </div>
        </div>

        <!-- Name -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Имя
          </label>
          <div
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {{ user.name || 'Не указано' }}
          </div>
        </div>

        <!-- Locale -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Локаль
          </label>
          <div
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {{ user.locale || 'Не указана' }}
          </div>
        </div>
      </div>

      <div v-else class="text-sm text-red-500 dark:text-red-400">
        Не удалось загрузить информацию о пользователе
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/app/stores/auth';

const auth = useAuthStore();
const user = ref<any>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    // Загружаем данные пользователя, если их нет в store
    if (!auth.user) {
      await auth.me();
    }
    user.value = auth.user;
  } catch (error) {
    console.error('Failed to load user data:', error);
  } finally {
    loading.value = false;
  }
});
</script>
