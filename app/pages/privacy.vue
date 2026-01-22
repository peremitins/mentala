<template>
  <div class="space-y-2 h-dvh overflow-y-auto">
    <PageHeader
      title="🔒&nbsp;&nbsp;Конфиденциальность"
      :show-back-button="true"
      @go-back="goBack"
    />
    <section
      class="space-y-2"
      :style="{ borderRadius: `calc(var(--radius-lg))` }"
    >
      <!-- Настройки памяти AI -->
      <div class="scroll-mt-24 rounded-lg glass-deep p-4">
        <MemorySettings />
      </div>

      <div class="glass-deep p-3">
        <a class="underline opacity-80" href="/docs/privacy" target="_blank"
          >Как мы защищаем данные</a
        >
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import MemorySettings from '@/app/components/settings/MemorySettings.vue';

function goBack() {
  navigateTo('/settings');
}
</script>
