<template>
  <span
    class="pointer-events-none absolute inset-0 inline-flex items-center justify-center"
  >
    <!-- SVG-спиннер: не зависит от unplugin-icons и стабильно собирается в landing -->
    <svg
      class="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  </span>
</template>
