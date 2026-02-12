<template>
  <div class="flex flex-col items-center gap-2 justify-center">
    <div class="relative flex items-center justify-center">
      <div class="breath-orb" :class="phaseClass" :style="sphereStyle">
        <div class="breath-orb__glow" />
      </div>
    </div>

    <div v-if="isRunning" class="absolute text-center">
      <div class="text-4xl font-semibold text-white">
        {{ phaseRemainingLabel }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BreathPhase } from '@/app/lib/breathPracticesCatalog';

const props = withDefaults(
  defineProps<{
    currentPhase: BreathPhase | null;
    phaseRemainingSeconds: number;
    isRunning: boolean;
    prepCountdown: number;
  }>(),
  {}
);

const phaseLabel = computed(() => props.currentPhase?.label || 'Готовимся');
const phaseRemainingLabel = computed(() =>
  String(props.phaseRemainingSeconds || 0)
);

const phaseClass = computed(() => {
  const type = props.currentPhase?.type || 'inhale';
  return `breath-orb--${type}`;
});

const sphereStyle = computed(() => {
  const duration = props.currentPhase?.seconds || 0;
  const type = props.currentPhase?.type || 'inhale';
  // Держим сферу компактной до старта, а затем увеличиваем на вдохе/задержке.
  const isPhaseActive = props.isRunning && props.prepCountdown === 0;
  const scale = !isPhaseActive
    ? 0.4
    : type === 'inhale' || type === 'hold'
      ? 1
      : 0.4;

  return {
    transform: `scale(${scale})`,
    transitionDuration: `${Math.max(0.6, duration)}s`,
  };
});
</script>

<style scoped>
.breath-orb {
  position: relative;
  width: 240px;
  height: 240px;
  border-radius: 9999px;
  background: radial-gradient(
    circle at 30% 20%,
    rgba(56, 189, 248, 0.7),
    rgba(79, 70, 229, 0.45),
    rgba(15, 23, 42, 0.6)
  );
  box-shadow:
    0 0 40px rgba(56, 189, 248, 0.35),
    inset 0 0 40px rgba(255, 255, 255, 0.12);
  transition-property: transform, box-shadow, filter;
  transition-timing-function: ease-in-out;
}

.breath-orb__glow {
  position: absolute;
  inset: -20%;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.3), transparent 70%);
  filter: blur(12px);
  animation: orb-float 8s ease-in-out infinite;
}

.breath-orb--inhale {
  filter: saturate(1.25) brightness(1.08);
  box-shadow:
    0 0 60px rgba(56, 189, 248, 0.5),
    inset 0 0 50px rgba(255, 255, 255, 0.18);
}

.breath-orb--exhale {
  filter: saturate(0.7) brightness(0.9);
  box-shadow:
    0 0 26px rgba(56, 189, 248, 0.25),
    inset 0 0 28px rgba(255, 255, 255, 0.08);
}

.breath-orb--hold,
.breath-orb--pause {
  filter: saturate(0.9) brightness(0.98);
  box-shadow:
    0 0 36px rgba(56, 189, 248, 0.35),
    inset 0 0 36px rgba(255, 255, 255, 0.12);
}

@keyframes orb-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -12px, 0);
  }
}
</style>
