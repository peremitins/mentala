<template>
  <div class="p-4">
    <h1 class="text-xl mb-4">HeyGen Streaming (Demo)</h1>
    <HeyGenPlayer />
    <div class="mt-6">
      <VoiceInput @send="(t: string) => sendToAvatar(t)" />
    </div>
  </div>
</template>

<script setup lang="ts">
const nuxtApp = useNuxtApp();
function sendToAvatar(t: string) {
  return nuxtApp.$api('heygen/speak', {
    method: 'POST',
    body: {
      sessionId: (globalThis as any).lastHeygenSessionId || '',
      text: t,
      taskMode: 'sync',
      taskType: 'repeat',
    },
  });
}
</script>
