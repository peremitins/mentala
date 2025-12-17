<template>
  <div>
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <div class="h-full flex flex-col z-0">
        <KeepAlive>
          <NuxtPage />
        </KeepAlive>
      </div>
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

    <!-- Глобальный PageLoader -->
    <Transition name="fade">
      <div
        v-if="loaders.isPageLoading"
        class="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      >
        <PageLoader :size="8" />
      </div>
    </Transition>
  </div>
</template>

<script lang="ts" setup>
import { Toaster } from 'vue-sonner';
import { useLoadersStore } from '@/app/stores/loaders';
import PageLoader from '@/app/components/ui/PageLoader.vue';

const loaders = useLoadersStore();
</script>
