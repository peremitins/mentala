<template>
  <div>
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <NuxtRouteAnnouncer />
    <Toaster
      theme="dark"
      richColors
      position="bottom-right"
      :expand="false"
      closeButton
      closeButtonPosition="top-right"
    />
  </div>
</template>

<script lang="ts" setup>
import { Toaster } from 'vue-sonner'
</script>
