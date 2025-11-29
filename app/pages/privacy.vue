<template>
  <div class="space-y-6 h-dvh overflow-y-auto">
    <PageHeader
      title="🔒&nbsp;&nbsp;Конфиденциальность"
      :show-back-button="true"
      @go-back="goBack"
    />
    <section
      class="space-y-6"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <!-- Настройки памяти AI -->
      <MemorySettings />

      <hr class="border-border/60" />

      <div class="flex flex-wrap gap-3">
        <button
          class="glass px-4 py-2 inline-flex items-center justify-center gap-2 min-h-[44px]"
          @click="deleteAll"
          title="Удалить все данные"
        >
          <IconTrash2 class="w-4 h-4" />
          <span>Удалить все данные</span>
        </button>
      </div>

      <div>
        <a class="underline opacity-80" href="/docs/privacy" target="_blank"
          >Как мы защищаем данные</a
        >
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/app/stores/auth';
import MemorySettings from '@/app/components/settings/MemorySettings.vue';

import IconTrash2 from '~icons/lucide/trash-2';

const auth = useAuthStore();

async function deleteAll() {
  useAPI('/api/user/delete', {
    method: 'POST',
    server: false,
    immediate: false,
  });
  await auth.me();
}

function goBack() {
  navigateTo('/settings');
}
</script>
