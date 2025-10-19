<template>
  <div class="space-y-6">
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

    <section class="mt-2 flex items-center gap-3 text-xs opacity-80">
      <VoiceInput />
    </section>

    <button @click="auth.logout()">Logout</button>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/app/stores/auth';
const auth = useAuthStore();
</script>
