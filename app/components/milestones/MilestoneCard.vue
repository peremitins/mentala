<template>
  <div
    class="mc"
    :class="{ 'mc--locked': !earned, 'mc--earned': earned }"
    :role="earned ? 'button' : undefined"
    :tabindex="earned ? 0 : -1"
    :aria-label="
      earned ? `${meta.title}, получено ${earnedDateLabel}` : meta.title
    "
    @click="handleClick"
    @keydown.enter="handleClick"
  >
    <!-- Обёртка: нет overflow:hidden — искры выходят за пределы кружка -->
    <div class="mc__wrap">
      <!-- Круглый контейнер — только он режет изображение -->
      <div class="mc__circle">
        <img
          v-if="imageVisible"
          :src="resolvedImagePath"
          :alt="meta.title"
          class="mc__img"
          draggable="false"
        />
        <div v-else class="mc__placeholder" :style="placeholderStyle">
          <span class="mc__placeholder-letter">{{ titleLetter }}</span>
        </div>
      </div>

      <!-- Звёзды-искры вокруг earned-бейджа -->
      <span
        v-for="(s, i) in sparkleList"
        :key="i"
        class="mc__sparkle"
        :style="s"
        aria-hidden="true"
      />
    </div>

    <!-- Название -->
    <p class="mc__title">{{ meta.title }}</p>

    <!-- Дата (только для earned) -->
    <p v-if="earned && earnedAt" class="mc__date">{{ earnedDateLabel }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { MilestoneBadgeMeta } from '@/app/lib/milestoneBadges';

const PEONY_FALLBACK = '/badges/badge_garden_self_kindness_21.webp';

const props = defineProps<{
  meta: MilestoneBadgeMeta;
  earned: boolean;
  earnedAt?: string | null;
}>();

const emit = defineEmits<{
  // Клик по полученной награде → показать оверлей с анимацией получения.
  (e: 'open-celebration', meta: MilestoneBadgeMeta): void;
}>();

// ─── Загрузка с auto-fallback ──────────────────────────────────────────────

const imageVisible = ref(false);
const naturalW = ref(1024);
const naturalH = ref(1024);
const resolvedImagePath = ref(props.meta.imagePath);

function loadSrc(src: string) {
  const img = new Image();
  img.src = src;
  img.onload = () => {
    naturalW.value = img.naturalWidth || 1024;
    naturalH.value = img.naturalHeight || 1024;
    resolvedImagePath.value = src;
    imageVisible.value = true;
  };
  img.onerror = () => {
    if (src !== PEONY_FALLBACK) loadSrc(PEONY_FALLBACK);
  };
}

onMounted(() => loadSrc(props.meta.imagePath || PEONY_FALLBACK));
watch(
  () => props.meta.imagePath,
  (s) => {
    imageVisible.value = false;
    loadSrc(s || PEONY_FALLBACK);
  }
);

// ─── Placeholder ──────────────────────────────────────────────────────────

const titleLetter = computed(() => props.meta.title[0]?.toUpperCase() ?? '?');

const PLACEHOLDER_COLORS: Record<string, string> = {
  start: 'linear-gradient(135deg, #a8e6cf 0%, #4ecb8a 100%)',
  regularity: 'linear-gradient(135deg, #b8d8f8 0%, #5ba8e8 100%)',
  garden: 'linear-gradient(135deg, #d4e8c2 0%, #7ec850 100%)',
  return: 'linear-gradient(135deg, #e8d4f8 0%, #a878e0 100%)',
};

const placeholderStyle = computed(() => ({
  background:
    PLACEHOLDER_COLORS[props.meta.category] ?? PLACEHOLDER_COLORS.start,
}));

// ─── Искры-звёздочки (14 штук: на бейдже + по краю) ──────────────────────
//
// Радиус кружка = 36px. Искры расставлены в двух слоях:
//   inner (6шт): radius 10–24px — мерцают прямо НА бейдже
//   edge  (6шт): radius 28–36px — вспыхивают у края кружка
//   outer (2шт): radius 38–40px — лёгкий выход за пределы для глубины
//
// Длительность 1.2–1.9s даёт быстрое живое мерцание.
// Цвета: белый + золотой + холодно-голубой для "магии".

const sparkleList = computed(() => {
  if (!props.earned) return [];

  const configs: Array<{
    angle: number;
    radius: number;
    size: number;
    delay: number;
    dur: number;
    color: string;
  }> = [
    // Слой 1: НА бейдже
    {
      angle: 20,
      radius: 13,
      size: 4.0,
      delay: 0.0,
      dur: 1.3,
      color: 'rgba(255,255,255,0.95)',
    },
    {
      angle: 80,
      radius: 20,
      size: 3.0,
      delay: 0.28,
      dur: 1.5,
      color: 'rgba(255,215,110,0.92)',
    },
    {
      angle: 140,
      radius: 16,
      size: 4.5,
      delay: 0.55,
      dur: 1.2,
      color: 'rgba(255,255,255,0.95)',
    },
    {
      angle: 200,
      radius: 22,
      size: 3.5,
      delay: 0.14,
      dur: 1.6,
      color: 'rgba(185,225,255,0.90)',
    },
    {
      angle: 260,
      radius: 14,
      size: 4.0,
      delay: 0.42,
      dur: 1.4,
      color: 'rgba(255,210,140,0.90)',
    },
    {
      angle: 320,
      radius: 24,
      size: 3.0,
      delay: 0.72,
      dur: 1.3,
      color: 'rgba(255,255,255,0.95)',
    },
    // Слой 2: у КРАЯ кружка
    {
      angle: 45,
      radius: 32,
      size: 4.5,
      delay: 0.08,
      dur: 1.7,
      color: 'rgba(255,218,120,0.88)',
    },
    {
      angle: 105,
      radius: 34,
      size: 3.5,
      delay: 0.38,
      dur: 1.5,
      color: 'rgba(255,255,255,0.92)',
    },
    {
      angle: 165,
      radius: 31,
      size: 5.0,
      delay: 0.65,
      dur: 1.9,
      color: 'rgba(185,225,255,0.88)',
    },
    {
      angle: 225,
      radius: 33,
      size: 3.0,
      delay: 0.22,
      dur: 1.4,
      color: 'rgba(255,235,170,0.90)',
    },
    {
      angle: 285,
      radius: 35,
      size: 4.0,
      delay: 0.52,
      dur: 1.6,
      color: 'rgba(255,255,255,0.95)',
    },
    {
      angle: 345,
      radius: 30,
      size: 3.5,
      delay: 0.88,
      dur: 1.3,
      color: 'rgba(255,215,110,0.88)',
    },
    // Слой 3: акцентные — чуть за краем
    {
      angle: 0,
      radius: 39,
      size: 4.0,
      delay: 0.32,
      dur: 2.0,
      color: 'rgba(255,230,130,0.80)',
    },
    {
      angle: 180,
      radius: 38,
      size: 3.5,
      delay: 0.62,
      dur: 1.8,
      color: 'rgba(255,255,255,0.85)',
    },
  ];

  return configs.map(({ angle, radius, size, delay, dur, color }) => ({
    '--angle': `${angle}deg`,
    '--delay': `${delay}s`,
    '--size': `${size}px`,
    '--radius': `${radius}px`,
    '--duration': `${dur}s`,
    '--color': color,
  }));
});

// ─── Дата ─────────────────────────────────────────────────────────────────

const earnedDateLabel = computed(() => {
  if (!props.earnedAt) return '';
  return new Date(props.earnedAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
});

// ─── Клик ─────────────────────────────────────────────────────────────────

function handleClick() {
  if (!props.earned) return;
  emit('open-celebration', props.meta);
}
</script>

<style scoped>
/* ─── Карточка ─────────────────────────────────────────────────────────── */
.mc {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 2px;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
}

.mc--earned {
  cursor: pointer;
}
.mc--locked {
  cursor: default;
}

.mc--earned:active {
  transform: scale(0.92);
}

/* ─── Обёртка (overflow: visible — искры видны снаружи кружка) ─────────── */
.mc__wrap {
  position: relative;
  width: 72px;
  height: 72px;
}

/* ─── Круглый контейнер ────────────────────────────────────────────────── */
.mc__circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  position: relative;
}

/* Earned: пульсирующий золотой ореол вокруг бейджа */
.mc--earned .mc__circle {
  will-change: box-shadow;
}

@keyframes mc-badge-glow {
  0%,
  100% {
    box-shadow:
      0 0 0 1.5px rgba(255, 210, 90, 0.4),
      0 0 10px 3px rgba(255, 185, 60, 0.22),
      0 0 22px 6px rgba(255, 150, 30, 0.09);
  }
  50% {
    box-shadow:
      0 0 0 2px rgba(255, 215, 100, 0.7),
      0 0 14px 5px rgba(255, 185, 60, 0.42),
      0 0 30px 10px rgba(255, 150, 30, 0.18);
  }
}

/* Locked: серый фильтр на весь wrap */
.mc--locked .mc__wrap {
  filter: grayscale(1) opacity(0.38);
}

/* ─── Изображение ──────────────────────────────────────────────────────── */
.mc__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

/* ─── Placeholder ──────────────────────────────────────────────────────── */
.mc__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mc__placeholder-letter {
  font-size: 26px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1;
  user-select: none;
}

/* ─── Звёзды-искры ─────────────────────────────────────────────────────── */
/*
  Каждая искра позиционируется от центра wrap (50%/50%),
  разворачивается на свой --angle и уходит на --radius.
  mc__wrap НЕ имеет overflow:hidden — искры на внутренних радиусах
  перекрывают изображение сверху, создавая эффект "магии на бейдже".
*/
.mc__sparkle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--size, 4px);
  height: var(--size, 4px);
  /* Четырёхлучевая звезда */
  clip-path: polygon(
    50% 0%,
    56% 44%,
    100% 50%,
    56% 56%,
    50% 100%,
    44% 56%,
    0% 50%,
    44% 44%
  );
  background: var(--color, rgba(255, 255, 255, 0.92));
  filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.95))
    drop-shadow(0 0 5px rgba(255, 210, 120, 0.75));
  pointer-events: none;
  will-change: transform, opacity;
  animation: mc-sparkle var(--duration, 1.5s) cubic-bezier(0.22, 1, 0.36, 1)
    var(--delay, 0s) infinite;
}

@keyframes mc-sparkle {
  0% {
    transform: translate(-50%, -50%) rotate(var(--angle, 0deg))
      translateX(calc(var(--radius, 24px) * 0.65)) scale(0) rotate(0deg);
    opacity: 0;
  }
  14% {
    transform: translate(-50%, -50%) rotate(var(--angle, 0deg))
      translateX(var(--radius, 24px)) scale(1.35) rotate(18deg);
    opacity: 1;
  }
  32% {
    transform: translate(-50%, -50%) rotate(var(--angle, 0deg))
      translateX(var(--radius, 24px)) scale(1) rotate(32deg);
    opacity: 0.92;
  }
  62% {
    transform: translate(-50%, -50%) rotate(var(--angle, 0deg))
      translateX(calc(var(--radius, 24px) * 1.08)) scale(0.55) rotate(52deg);
    opacity: 0.38;
  }
  100% {
    transform: translate(-50%, -50%) rotate(var(--angle, 0deg))
      translateX(calc(var(--radius, 24px) * 1.18)) scale(0) rotate(75deg);
    opacity: 0;
  }
}

/* ─── Текст ────────────────────────────────────────────────────────────── */
.mc__title {
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  color: hsl(var(--foreground));
  line-height: 1.3;
  max-width: 84px;
}

.mc--locked .mc__title {
  color: hsl(var(--muted-foreground));
}

.mc__date {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

/* ─── Reduced motion ───────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .mc__sparkle {
    display: none;
  }
  .mc--earned .mc__circle {
    animation: none;
  }
}
</style>
