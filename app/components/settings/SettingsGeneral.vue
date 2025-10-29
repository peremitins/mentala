<template>
  <div class="space-y-3">
    <NuxtLink class="underline opacity-90" to="/privacy">
      Конфиденциальность
    </NuxtLink>
    <VoiceInput />
  </div>
</template>

<script setup lang="ts">
import VoiceInput from '@/app/components/VoiceInput.vue';
</script>
