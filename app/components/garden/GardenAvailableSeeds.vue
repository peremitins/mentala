<template>
  <section v-if="seeds.length > 0" class="glass-deep p-4 space-y-3">
    <h3 class="text-sm font-semibold text-foreground">Новый сад</h3>
    <ul class="space-y-2">
      <li
        v-for="seed in seeds"
        :key="seed.programSlug"
        class="rounded-2xl border border-white/10 bg-white/5 p-3"
      >
        <p class="text-sm font-semibold text-foreground">
          {{ seed.title }}
        </p>
        <p
          v-if="seed.subtitle"
          class="mt-1 text-xs leading-relaxed text-foreground/65"
        >
          {{ seed.subtitle }}
        </p>
        <div class="mt-2 flex items-center justify-between gap-2">
          <span class="text-[11px] text-foreground/45">
            {{ seed.totalSteps }} шагов
          </span>
          <button
            type="button"
            class="relative inline-flex min-h-9 items-center justify-center rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="startingSlug === seed.programSlug"
            @click="emit('start', seed.programSlug)"
          >
            <span
              v-if="locked"
              class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
              aria-hidden="true"
            >⭐</span>
            <span v-if="startingSlug === seed.programSlug">Стартуем…</span>
            <span v-else>Начать</span>
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { GardenAvailableProgramDto } from '@/shared/dto/garden';

defineProps<{
  seeds: GardenAvailableProgramDto[];
  /** Slug программы, которая прямо сейчас стартуется (для disable + label). */
  startingSlug: string | null;
  locked?: boolean;
}>();

const emit = defineEmits<{ (e: 'start', programSlug: string): void }>();
</script>
