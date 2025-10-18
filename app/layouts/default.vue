<template>
  <div v-if="auth.isLoggedIn" class="h-dvh w-full flex flex-col min-h-dvh p-2">
    <main class="flex flex-col flex-[1_1_auto]">
      <slot />
    </main>
    <BottomNav />
  </div>
</template>
<script setup lang="ts">
import { useAuthStore } from '@/app/stores/auth';

const auth = useAuthStore();
</script>
