<template>
  <div class="relative h-full overflow-y-auto space-y-4 pb-[100px]">
    <PageHeader title="Практики" />

    <div class="grid gap-4 grid-cols-1 xxs:grid-cols-2">
      <NuxtLink
        to="/breath-practices"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb tile-orb--slow absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-400/40 via-sky-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/30 via-indigo-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <span class="text-3xl">🌬️</span>
          <div class="space-y-1">
            <h2 class="text-xl font-semibold text-foreground">
              Дыхательные практики
            </h2>
            <p class="text-sm text-foreground/70">
              Готовые практики + настройка под себя
            </p>
          </div>
        </div>
      </NuxtLink>

      <NuxtLink
        to="/meditations"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.05s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-16 -bottom-8 h-44 w-44 rounded-full bg-gradient-to-br from-amber-400/35 via-rose-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-14 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/25 via-fuchsia-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <span class="text-3xl">🧘‍♀️</span>
          <div class="space-y-1">
            <h2 class="text-xl font-semibold text-foreground">Медитации</h2>
            <p class="text-sm text-foreground/70">
              Музыка и звуки для отдыха и концентрации
            </p>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/app/components/PageHeader.vue';
import IconArrowRight from '~icons/lucide/arrow-right';
</script>

<style scoped>
@keyframes floaty {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -10px, 0);
  }
}

.tile-orb {
  animation: floaty 10s ease-in-out infinite;
}

.tile-orb--delay {
  animation-delay: -4s;
}

.tile-orb--slow {
  animation-duration: 14s;
}
</style>
