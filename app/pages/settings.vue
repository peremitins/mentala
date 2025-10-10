<template>
  <div class="p-2 space-y-6">
    <section
      class="glass-deep p-2 space-y-3"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <h2 class="text-lg font-semibold">Настройки</h2>
      <NuxtLink class="underline opacity-90" to="/privacy"
        >Конфиденциальность</NuxtLink
      >
    </section>

    <section
      class="glass-deep p-2 space-y-3"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <h3 class="font-medium">Уведомления (заглушка)</h3>
      <div class="text-sm opacity-80">
        Настройки уведомлений (push/email) появятся здесь.
      </div>
    </section>

    <button @click="auth.logout()">Logout</button>
  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '@/app/stores/chat';
import { useAuthStore } from '@/app/stores/auth';
const auth = useAuthStore();
const chat = useChatStore();

chat.finishAndSave('gpt-4o');
</script>
