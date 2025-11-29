<template>
  <div class="space-y-6">
    <section class="space-y-4">
      <div v-if="loading" class="text-sm text-muted-foreground">
        Загрузка...
      </div>

      <div v-else-if="user" class="space-y-4">
        <!-- ID -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground"> ID </label>
          <Input
            :model-value="String(user.id)"
            disabled
            :show-clear-button="false"
          />
        </div>

        <!-- Email -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground"> Email </label>
          <Input
            :model-value="user.email || 'Не указан'"
            type="email"
            disabled
            :show-clear-button="false"
          />
        </div>

        <!-- Name -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground"> Имя </label>
          <Input
            :model-value="user.name || 'Не указано'"
            type="text"
            disabled
            :show-clear-button="false"
          />
        </div>

        <!-- Locale -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground"> Локаль </label>
          <Input
            :model-value="user.locale || 'Не указана'"
            type="text"
            disabled
            :show-clear-button="false"
          />
        </div>
      </div>

      <div v-else class="text-sm text-destructive">
        Не удалось загрузить информацию о пользователе
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import { Input } from '@/app/components/ui/shadcn/input';

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
