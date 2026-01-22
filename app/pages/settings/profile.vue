<template>
  <div class="h-dvh overflow-y-auto pb-[100px] space-y-2">
    <PageHeader title="Профиль" :show-back-button="true" @go-back="goBack" />

    <section class="">
      <SettingsUser />
    </section>
  </div>
</template>

<script setup lang="ts">
import SettingsUser from '@/app/components/settings/SettingsUser.vue';

function goBack() {
  navigateTo('/settings');
}
</script>
