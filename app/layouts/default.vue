<template>
  <div class="h-dvh w-full flex flex-col min-h-dvh p-2">
    <div class="flex flex-col flex-[1_1_auto] overflow-hidden">
      <slot class="h-full" />
    </div>
    <BottomNav />
  </div>
</template>
