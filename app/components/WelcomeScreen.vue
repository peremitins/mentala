<template>
  <div
    class="glass-deep h-auto w-full m-auto flex flex-none flex-col items-center justify-center px-5 py-5 space-y-4"
  >
    <!-- Приветственный блок -->
    <div class="text-center space-y-2 animate-fade-in">
      <h1 class="text-3xl font-bold text-foreground">{{ titleText }}</h1>
      <p class="text-lg text-white/80">{{ subtitleText }}</p>
    </div>

    <!-- Основное действие -->
    <div class="w-full max-w-md space-y-4">
      <Button
        @click="handleSelect"
        variant="outline"
        class="relative w-full rounded-xl p-4 flex items-center gap-4 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group animate-slide-up bg-transparent"
        :class="{ 'pr-12': locked }"
        style="animation-delay: 0.2s; animation-fill-mode: both"
      >
        <span
          v-if="locked"
          class="absolute right-3 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-sm leading-none"
        >
          {{ requiredPlan === 'premium' ? '💎' : '⭐' }}
        </span>
        Начать
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getAddressingCopy } from '@/app/lib/addressingCopy';
import { useAuthStore } from '@/app/stores/auth';
import { resolveAddressing } from '@/shared/utils/addressing';

defineProps<{
  locked?: boolean;
  requiredPlan?: 'basic' | 'pro' | 'premium' | null;
}>();

const emit = defineEmits<{
  (e: 'select'): void;
}>();

const auth = useAuthStore();
const addressing = computed(() => resolveAddressing(auth.user?.addressing));

const titleText = computed(() =>
  getAddressingCopy('welcomeTitle', addressing.value)
);
const subtitleText = computed(() =>
  getAddressingCopy('welcomeSubtitle', addressing.value)
);

function handleSelect() {
  emit('select');
}
</script>
