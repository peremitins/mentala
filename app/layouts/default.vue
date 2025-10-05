<template>
  <div class="min-h-dvh grid place-items-center">
    <div class="h-dvh w-full flex flex-col min-h-dvh">
      <main class="flex flex-col flex-1 basis-auto overflow-auto">
        <slot />
      </main>
      <BottomNav />
    </div>
  </div>
</template>
