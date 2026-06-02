<template>
  <BottomSheet v-model:open="openModel">
    <div class="celebration-sheet">
      <!-- Частицы-капли -->
      <div class="celebration-sheet__particles" aria-hidden="true">
        <span
          v-for="i in 6"
          :key="i"
          class="celebration-sheet__particle"
          :style="particleStyle(i)"
        />
      </div>

      <!-- Лейбл -->
      <p class="celebration-sheet__eyebrow">Новое достижение</p>

      <!-- Бейдж с анимацией -->
      <div class="celebration-sheet__badge-wrap">
        <div class="celebration-sheet__badge-glow" />
        <div class="celebration-sheet__badge">
          <img
            v-if="badgeImageLoaded"
            :src="badgeMeta.imagePath"
            :alt="badgeMeta.title"
            class="celebration-sheet__badge-img"
            draggable="false"
          />
          <div
            v-else
            class="celebration-sheet__badge-placeholder"
            :style="placeholderStyle"
          >
            <span class="celebration-sheet__badge-letter">{{ titleLetter }}</span>
          </div>
        </div>
      </div>

      <!-- Текст -->
      <div class="celebration-sheet__text">
        <h2 class="celebration-sheet__title">{{ badgeMeta.title }}</h2>
        <p class="celebration-sheet__description">{{ badgeMeta.description }}</p>
      </div>

      <!-- Кнопки -->
      <div class="celebration-sheet__actions">
        <button
          type="button"
          class="celebration-sheet__btn celebration-sheet__btn--secondary"
          @click="handleViewMilestones"
        >
          Все достижения
        </button>
        <button
          type="button"
          class="celebration-sheet__btn celebration-sheet__btn--primary"
          @click="handleContinue"
        >
          Продолжить
        </button>
      </div>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from '#imports';
import BottomSheet from '@/app/components/ui/BottomSheet.vue';
import { getBadgeMeta } from '@/app/lib/milestoneBadges';
import type { MilestoneBadgeMeta } from '@/app/lib/milestoneBadges';

const props = defineProps<{
  open: boolean;
  badgeId: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'continue'): void;
}>();

const router = useRouter();

const openModel = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
});

const badgeMeta = computed<MilestoneBadgeMeta>(
  () =>
    getBadgeMeta(props.badgeId) ?? {
      id: props.badgeId,
      title: 'Веха',
      description: 'Важный момент на твоём пути.',
      category: 'start' as const,
      imagePath: '',
    }
);

const badgeImageLoaded = ref(false);

watch(
  () => props.badgeId,
  () => {
    badgeImageLoaded.value = false;
    if (!badgeMeta.value.imagePath) return;
    const img = new Image();
    img.src = badgeMeta.value.imagePath;
    img.onload = () => (badgeImageLoaded.value = true);
  },
  { immediate: true }
);

const titleLetter = computed(
  () => badgeMeta.value.title[0]?.toUpperCase() ?? '?'
);

const PLACEHOLDER_COLORS: Record<string, string> = {
  start: 'linear-gradient(135deg, #a8e6cf 0%, #56c596 100%)',
  regularity: 'linear-gradient(135deg, #b8d4f0 0%, #6aa8e8 100%)',
  garden: 'linear-gradient(135deg, #d4e8c2 0%, #7ec850 100%)',
  return: 'linear-gradient(135deg, #e0d4f0 0%, #9a78d8 100%)',
};

const placeholderStyle = computed(() => ({
  background:
    PLACEHOLDER_COLORS[badgeMeta.value.category] ?? PLACEHOLDER_COLORS.start,
}));

// Позиции частиц
function particleStyle(index: number) {
  const positions = [
    { left: '20%', delay: '0ms' },
    { left: '35%', delay: '120ms' },
    { left: '50%', delay: '60ms' },
    { left: '65%', delay: '200ms' },
    { left: '78%', delay: '40ms' },
    { left: '10%', delay: '160ms' },
  ];
  const pos = positions[index - 1] ?? { left: '50%', delay: '0ms' };
  return {
    left: pos.left,
    animationDelay: pos.delay,
  };
}

function handleContinue() {
  openModel.value = false;
  emit('continue');
}

function handleViewMilestones() {
  openModel.value = false;
  void router.push('/milestones');
}
</script>

<style scoped>
.celebration-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 24px 32px;
  overflow: hidden;
  min-height: 340px;
}

/* === Частицы-капли === */
.celebration-sheet__particles {
  position: absolute;
  top: 40px;
  left: 0;
  right: 0;
  height: 80px;
  pointer-events: none;
}

.celebration-sheet__particle {
  position: absolute;
  bottom: 0;
  width: 6px;
  height: 9px;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  background: hsl(145 55% 65% / 0.75);
  animation: celebration-drop 1.2s cubic-bezier(0.4, 0, 0.2, 1) both;
}

.celebration-sheet__particle:nth-child(2n) {
  background: hsl(210 60% 72% / 0.7);
  width: 5px;
  height: 7px;
}

.celebration-sheet__particle:nth-child(3n) {
  background: hsl(260 50% 75% / 0.7);
}

@keyframes celebration-drop {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(-72px) scale(0.2);
    opacity: 0;
  }
}

/* === Лейбл === */
.celebration-sheet__eyebrow {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  margin-top: 8px;
  margin-bottom: 24px;
}

/* === Бейдж === */
.celebration-sheet__badge-wrap {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 24px;
  animation: celebration-badge-in 600ms cubic-bezier(0.32, 0.72, 0, 1) both;
}

@keyframes celebration-badge-in {
  from {
    transform: scale(0.88);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.celebration-sheet__badge-glow {
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    hsl(145 55% 65% / 0.35) 0%,
    transparent 70%
  );
  animation: celebration-glow-pulse 2.4s ease-in-out infinite;
}

@keyframes celebration-glow-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}

.celebration-sheet__badge {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.celebration-sheet__badge-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.celebration-sheet__badge-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.celebration-sheet__badge-letter {
  font-size: 44px;
  font-weight: 700;
  color: hsl(0 0% 100% / 0.9);
  line-height: 1;
}

/* === Текст === */
.celebration-sheet__text {
  text-align: center;
  margin-bottom: 28px;
}

.celebration-sheet__title {
  font-size: 22px;
  font-weight: 700;
  color: hsl(var(--foreground));
  margin-bottom: 8px;
  line-height: 1.2;
}

.celebration-sheet__description {
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  line-height: 1.55;
  max-width: 280px;
  margin: 0 auto;
}

/* === Кнопки === */
.celebration-sheet__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.celebration-sheet__btn {
  width: 100%;
  padding: 14px 20px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 200ms ease;
}

.celebration-sheet__btn:active {
  transform: scale(0.97);
  opacity: 0.85;
}

.celebration-sheet__btn--primary {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.celebration-sheet__btn--secondary {
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--foreground));
}
</style>
