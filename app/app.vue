<template>
  <div>
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <KeepAlive>
        <NuxtPage />
      </KeepAlive>
    </NuxtLayout>
    <NuxtRouteAnnouncer />
    <Toaster
      theme="dark"
      richColors
      position="top-right"
      :expand="false"
      closeButton
      closeButtonPosition="top-right"
    />
  </div>
</template>

<script lang="ts" setup>
import { Toaster } from 'vue-sonner';
</script>
