<template>
  <div class="h-dvh overflow-y-auto pb-[100px] space-y-2">
    <PageHeader
      title="Настройки ассистента"
      :show-back-button="true"
      @go-back="goBack"
    />

    <section class="">
      <SettingsGeneral />
    </section>
  </div>
</template>

<script setup lang="ts">
import SettingsGeneral from '@/app/components/settings/SettingsGeneral.vue';

function goBack() {
  navigateTo('/settings');
}
</script>
