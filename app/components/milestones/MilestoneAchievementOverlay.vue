<template>
  <Teleport to="body">
    <Transition name="ach-ov" @after-leave="emit('closed')">
      <div
        v-if="show"
        class="ach-ov"
        :class="{ 'ach-ov--exiting': isExiting }"
        :style="cssVars"
        role="dialog"
        aria-modal="true"
        :aria-label="`Достижение: ${meta.title}`"
        @click="dismiss"
      >
        <!-- Backdrop с цветным сиянием -->
        <div class="ach-ov__backdrop" />

        <!-- Рассеянные частицы -->
        <div class="ach-ov__particles" aria-hidden="true">
          <span
            v-for="p in particles"
            :key="p.id"
            class="ach-ov__particle"
            :style="p.style"
          />
        </div>

        <!-- Центральный блок: кольца + бейдж + текст -->
        <div class="ach-ov__stage" @click.stop>
          <!-- Бейдж -->
          <div class="ach-ov__badge-wrap">
            <!-- Радиальная вспышка при материализации -->
            <div class="ach-ov__flash" aria-hidden="true" />
            <div class="ach-ov__badge-glow" />
            <div class="ach-ov__badge-circle">
              <img
                v-if="imageLoaded"
                :src="meta.imagePath"
                :alt="meta.title"
                class="ach-ov__badge-img"
                loading="eager"
                draggable="false"
              />
              <div
                v-else
                class="ach-ov__badge-placeholder"
                :style="placeholderStyle"
              >
                <span class="ach-ov__badge-letter">{{ titleLetter }}</span>
              </div>
            </div>

            <!-- Искры вокруг бейджа -->
            <div class="ach-ov__sparkles" aria-hidden="true">
              <span
                v-for="s in sparkles"
                :key="s.id"
                class="ach-ov__sparkle"
                :style="s.style"
              />
            </div>
          </div>

          <!-- Тексты -->
          <div class="ach-ov__text">
            <p class="ach-ov__eyebrow">Достижение получено</p>
            <h2 class="ach-ov__title">{{ meta.title }}</h2>
            <p class="ach-ov__desc">{{ meta.description }}</p>
          </div>
        </div>

        <!-- Текстовая ссылка-кнопка для закрытия. Overlay сам по тайм-ауту
             не закрывается — только по явному действию пользователя. -->
        <button type="button" class="ach-ov__hint" @click.stop="dismiss">
          Нажмите, чтобы продолжить
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  getBadgeMeta,
  type MilestoneBadgeMeta,
} from '@/app/lib/milestoneBadges';

const props = defineProps<{
  show: boolean;
  badgeId: string;
}>();

const emit = defineEmits<{
  (e: 'closed'): void;
  (e: 'continue'): void;
}>();

// ─── Мета бейджа ───────────────────────────────────────────────────────────

const meta = computed<MilestoneBadgeMeta>(
  () =>
    getBadgeMeta(props.badgeId) ?? {
      id: props.badgeId,
      title: 'Достижение',
      description: 'Важный момент на твоём пути.',
      category: 'start' as const,
      imagePath: '',
    }
);

const titleLetter = computed(() => meta.value.title[0]?.toUpperCase() ?? '?');

const CATEGORY_HUE: Record<string, number> = {
  start: 145,
  regularity: 215,
  garden: 155,
  return: 265,
};

const themeHue = computed(() => CATEGORY_HUE[meta.value.category] ?? 145);

const cssVars = computed(() => ({
  '--ach-hue': String(themeHue.value),
}));

// ─── Загрузка изображения ──────────────────────────────────────────────────

const imageLoaded = ref(false);

watch(
  () => props.badgeId,
  () => {
    imageLoaded.value = false;
    if (!meta.value.imagePath) return;
    const img = new Image();
    img.src = meta.value.imagePath;
    img.onload = () => (imageLoaded.value = true);
  },
  { immediate: true }
);

const PLACEHOLDER_COLORS: Record<string, string> = {
  start: 'linear-gradient(135deg, #a8e6cf 0%, #4ecb8a 100%)',
  regularity: 'linear-gradient(135deg, #b8d8f8 0%, #5ba8e8 100%)',
  garden: 'linear-gradient(135deg, #d4e8c2 0%, #7ec850 100%)',
  return: 'linear-gradient(135deg, #e8d4f8 0%, #a878e0 100%)',
};

const placeholderStyle = computed(() => ({
  background:
    PLACEHOLDER_COLORS[meta.value.category] ?? PLACEHOLDER_COLORS.start,
}));

// ─── Частицы ──────────────────────────────────────────────────────────────

interface Particle {
  id: number;
  style: Record<string, string>;
}

const particles = ref<Particle[]>([]);
const sparkles = ref<Particle[]>([]);

function buildParticles() {
  const hue = themeHue.value;
  const palette = [
    `hsl(${hue} 70% 68%)`,
    `hsl(${hue + 30} 65% 72%)`,
    `hsl(${hue - 20} 75% 65%)`,
    `hsl(45 90% 68%)`,
    `hsl(${hue + 60} 60% 75%)`,
  ];

  // Тип 1: мелкие быстрые частицы (20 штук)
  particles.value = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 360 + (Math.random() - 0.5) * 15;
    const dist =
      i < 12
        ? 80 + Math.random() * 100 // ближние
        : 150 + Math.random() * 120; // дальние
    const tx = Math.cos((angle * Math.PI) / 180) * dist;
    const ty = Math.sin((angle * Math.PI) / 180) * dist;
    const size = i < 12 ? 3 + Math.random() * 5 : 5 + Math.random() * 9;
    const delay = i * 14 + Math.random() * 50;
    const dur = 600 + Math.random() * 450;
    const color = palette[i % palette.length]!;

    return {
      id: i,
      style: {
        '--tx': `${tx}px`,
        '--ty': `${ty}px`,
        '--delay': `${delay}ms`,
        '--size': `${size}px`,
        '--color': color,
        '--dur': `${dur}ms`,
      },
    };
  });

  sparkles.value = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 360 + 22;
    const r = 104;
    const x = Math.cos((angle * Math.PI) / 180) * r;
    const y = Math.sin((angle * Math.PI) / 180) * r;
    const size = 5 + Math.random() * 6;
    const delay = 380 + i * 90 + Math.random() * 80;
    const dur = 900 + Math.random() * 400;

    return {
      id: i,
      style: {
        '--x': `${x}px`,
        '--y': `${y}px`,
        '--size': `${size}px`,
        '--delay': `${delay}ms`,
        '--dur': `${dur}ms`,
      },
    };
  });
}

watch(() => props.badgeId, buildParticles, { immediate: true });

// ─── Dismiss логика ────────────────────────────────────────────────────────

const isExiting = ref(false);
let exitTimer: ReturnType<typeof setTimeout> | null = null;

function clearExitTimer() {
  if (!exitTimer) return;
  clearTimeout(exitTimer);
  exitTimer = null;
}

// Overlay НЕ закрывается по тайм-ауту: ждём явного действия пользователя
// (тап по подсказке или фону). Это договорённое поведение.
watch(
  () => props.show,
  (v) => {
    if (v) {
      isExiting.value = false;
      buildParticles();
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  clearExitTimer();
});

function dismiss() {
  if (isExiting.value) return;
  clearExitTimer();
  isExiting.value = true;
  // Ждём exit-анимацию, затем эмитируем continue
  exitTimer = setTimeout(() => {
    emit('continue');
    isExiting.value = false;
    exitTimer = null;
  }, 420);
}
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   Overlay root
   ═══════════════════════════════════════════════════════════════════════════ */
.ach-ov {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* CSS-переменная темы */
  --ach-hue: 145;
  --ach-hue-color: hsl(var(--ach-hue) 60% 60%);
  --ach-hue-color-dim: hsl(var(--ach-hue) 55% 55% / 0.35);
}

/* ─── Backdrop ─── */
.ach-ov__backdrop {
  position: absolute;
  inset: 0;
  background: radial-gradient(
      ellipse 60% 50% at 50% 50%,
      hsl(var(--ach-hue) 40% 18% / 0.55) 0%,
      transparent 70%
    ),
    rgba(4, 4, 12, 0.88);
  animation: ach-backdrop-in 320ms cubic-bezier(0.32, 0.72, 0, 1) both;
}

@keyframes ach-backdrop-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ─── Частицы ─── */
.ach-ov__particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ach-ov__particle {
  position: absolute;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: var(--color);
  box-shadow: 0 0 6px var(--color);
  animation: ach-particle-burst var(--dur) cubic-bezier(0.22, 1, 0.36, 1)
    var(--delay) both;
}

@keyframes ach-particle-burst {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  60% {
    opacity: 0.8;
  }
  100% {
    transform: translate(var(--tx), var(--ty)) scale(0.05);
    opacity: 0;
  }
}

/* ─── Центральный stage ─── */
.ach-ov__stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  /* stage не перехватывает тапы снаружи */
}

.ach-ov__ring {
  position: absolute;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  border: 1.5px solid hsl(var(--ach-hue) 60% 65% / 0.7);
  animation: ach-ring-expand 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.ach-ov__ring--1 {
  animation-delay: 200ms;
}
.ach-ov__ring--2 {
  animation-delay: 660ms;
}
.ach-ov__ring--3 {
  animation-delay: 1120ms;
}

@keyframes ach-ring-expand {
  0% {
    transform: scale(1);
    opacity: 0.75;
  }
  100% {
    transform: scale(3.2);
    opacity: 0;
  }
}

@keyframes ach-rays-spin {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

/* ─── Бейдж ─── */
.ach-ov__badge-wrap {
  position: relative;
  display: grid;
  place-items: center;
  width: 160px;
  height: 160px;
  margin-bottom: 28px;
  animation:
    ach-badge-spring 820ms cubic-bezier(0.32, 0.72, 0, 1) 80ms both,
    ach-badge-float 3.2s ease-in-out 1500ms infinite;
}

@keyframes ach-badge-spring {
  0% {
    transform: scale(0.1) rotate(-18deg);
    opacity: 0;
    filter: blur(20px);
  }
  22% {
    filter: blur(0);
  }
  50% {
    transform: scale(1.2) rotate(5deg);
    opacity: 1;
  }
  68% {
    transform: scale(0.92) rotate(-2.5deg);
  }
  82% {
    transform: scale(1.06) rotate(1deg);
  }
  93% {
    transform: scale(0.98) rotate(-0.3deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

@keyframes ach-badge-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-9px);
  }
}

/* Вспышка при материализации бейджа */
.ach-ov__flash {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    hsl(var(--ach-hue) 80% 90% / 0.9) 0%,
    hsl(var(--ach-hue) 70% 70% / 0.4) 35%,
    transparent 65%
  );
  animation: ach-flash-burst 600ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transform-origin: center;
  z-index: 1;
}

@keyframes ach-flash-burst {
  0% {
    transform: translate(-50%, -50%) scale(0.3);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.4);
    opacity: 0;
  }
}

.ach-ov__badge-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    hsl(var(--ach-hue) 70% 65% / 0.45) 0%,
    hsl(var(--ach-hue) 65% 60% / 0.2) 45%,
    transparent 70%
  );
  animation: ach-glow-breathe 2.8s ease-in-out 1s infinite;
  transform: translate(-50%, -50%);
  transform-origin: center;
  z-index: 1;
}

@keyframes ach-glow-breathe {
  0%,
  100% {
    opacity: 0.7;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.12);
  }
}

.ach-ov__badge-circle {
  grid-area: 1 / 1;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  overflow: hidden;
  position: relative;
  z-index: 2;
  /* Отчётливое кольцо вокруг бейджа */
  box-shadow:
    0 0 0 2.5px hsl(var(--ach-hue) 55% 65% / 0.8),
    0 0 0 5px hsl(var(--ach-hue) 55% 65% / 0.25),
    0 12px 40px hsl(var(--ach-hue) 60% 40% / 0.4),
    0 2px 8px rgba(0, 0, 0, 0.5);
}

.ach-ov__badge-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

.ach-ov__badge-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ach-ov__badge-letter {
  font-size: 56px;
  font-weight: 700;
  color: hsl(0 0% 100% / 0.92);
  line-height: 1;
  user-select: none;
}

/* ─── Искры ─── */
.ach-ov__sparkles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ach-ov__sparkle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--size);
  height: var(--size);
  margin-top: calc(var(--size) / -2);
  margin-left: calc(var(--size) / -2);
  border-radius: 1px;
  background: hsl(var(--ach-hue) 80% 80%);
  box-shadow: 0 0 4px hsl(var(--ach-hue) 80% 75% / 0.9);
  /* Форма звезды через clip-path */
  clip-path: polygon(
    50% 0%,
    61% 35%,
    98% 35%,
    68% 57%,
    79% 91%,
    50% 70%,
    21% 91%,
    32% 57%,
    2% 35%,
    39% 35%
  );
  transform: translate(var(--x), var(--y)) scale(0);
  animation: ach-sparkle-twinkle var(--dur) ease-in-out var(--delay) infinite;
}

@keyframes ach-sparkle-twinkle {
  0%,
  100% {
    opacity: 0;
    transform: translate(var(--x), var(--y)) scale(0) rotate(0deg);
  }
  40% {
    opacity: 1;
    transform: translate(var(--x), var(--y)) scale(1) rotate(30deg);
  }
  60% {
    opacity: 1;
    transform: translate(var(--x), var(--y)) scale(0.8) rotate(50deg);
  }
}

/* ─── Тексты ─── */
.ach-ov__text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 0 32px;
  max-width: 340px;
}

.ach-ov__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--ach-hue) 70% 72%);
  animation: ach-text-up 400ms cubic-bezier(0.32, 0.72, 0, 1) 520ms both;
}

.ach-ov__title {
  font-size: 26px;
  font-weight: 700;
  color: hsl(0 0% 98%);
  line-height: 1.15;
  animation: ach-text-up 400ms cubic-bezier(0.32, 0.72, 0, 1) 630ms both;
}

.ach-ov__desc {
  font-size: 14px;
  color: hsl(0 0% 100% / 0.62);
  line-height: 1.55;
  animation: ach-text-up 400ms cubic-bezier(0.32, 0.72, 0, 1) 740ms both;
}

@keyframes ach-text-up {
  from {
    transform: translateY(18px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* ─── Подсказка тапа (кликабельная текстовая ссылка-кнопка) ─── */
.ach-ov__hint {
  position: absolute;
  bottom: max(44px, env(safe-area-inset-bottom, 0px) + 34px);
  padding: 9px 16px;
  border: 1px solid hsl(0 0% 100% / 0.18);
  border-radius: 999px;
  background: hsl(0 0% 100% / 0.1);
  color: hsl(0 0% 100% / 0.78);
  box-shadow: 0 10px 32px hsl(0 0% 0% / 0.24);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0;
  font-family: inherit;
  animation:
    ach-hint-appear 400ms ease 1100ms both,
    ach-hint-pulse 2s ease-in-out 1100ms infinite;
  pointer-events: auto;
  cursor: pointer;
  backdrop-filter: blur(16px);
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.ach-ov__hint:hover,
.ach-ov__hint:active {
  background: hsl(0 0% 100% / 0.18);
  color: hsl(0 0% 100% / 0.95);
}

@keyframes ach-hint-appear {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes ach-hint-pulse {
  0%,
  100% {
    opacity: 0.78;
  }
  50% {
    opacity: 1;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vue Transition
   ═══════════════════════════════════════════════════════════════════════════ */
.ach-ov-enter-active {
  transition: opacity 280ms ease;
}
.ach-ov-enter-from {
  opacity: 0;
}
.ach-ov-leave-active {
  transition: opacity 380ms cubic-bezier(0.4, 0, 1, 1);
}
.ach-ov-leave-to {
  opacity: 0;
}

/* Выходная анимация бейджа */
.ach-ov--exiting .ach-ov__badge-wrap {
  animation: ach-badge-exit 380ms cubic-bezier(0.4, 0, 0.6, 1) both !important;
}

@keyframes ach-badge-exit {
  from {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
  to {
    transform: scale(0.7) translateY(-24px);
    opacity: 0;
  }
}

.ach-ov--exiting .ach-ov__text {
  animation: ach-exit-fade 300ms ease both !important;
}

.ach-ov--exiting .ach-ov__hint {
  animation: ach-exit-fade 200ms ease both !important;
}

@keyframes ach-exit-fade {
  to {
    opacity: 0;
    transform: translateY(8px);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Reduced motion
   ═══════════════════════════════════════════════════════════════════════════ */
@media (prefers-reduced-motion: reduce) {
  .ach-ov__particle,
  .ach-ov__ring,
  .ach-ov__sparkle {
    display: none;
  }

  .ach-ov__badge-wrap {
    animation: ach-simple-appear 300ms ease both;
  }

  .ach-ov__badge-glow {
    animation: none;
  }

  @keyframes ach-simple-appear {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .ach-ov__eyebrow,
  .ach-ov__title,
  .ach-ov__desc {
    animation: ach-simple-appear 300ms ease 200ms both;
  }
}
</style>
