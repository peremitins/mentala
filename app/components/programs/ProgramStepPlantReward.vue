<template>
  <div
    class="relative mx-auto mt-5 w-full max-w-xs overflow-hidden rounded-3xl border p-4"
    :class="
      props.isFinalStep
        ? 'plant-reward-final border-emerald-200/35 bg-emerald-300/15'
        : 'border-emerald-200/20 bg-emerald-300/10'
    "
    :style="rewardStyle"
  >
    <!-- Финальный шаг программы: лёгкий цветочный glow вокруг карточки,
         сигналящий «Сад завершён». См. retention/retention_long_term_strategy.md -->
    <div
      v-if="props.isFinalStep"
      class="plant-reward-final__bloom pointer-events-none absolute inset-0"
      aria-hidden="true"
    />
    <div class="pointer-events-none absolute inset-0">
      <span
        v-for="drop in 5"
        :key="drop"
        class="plant-drop absolute h-2 w-2 rounded-full bg-cyan-200/70"
        :style="{
          left: `${18 + drop * 12}%`,
          animationDelay: `${drop * 90}ms`,
        }"
      />
    </div>

    <div class="relative flex items-center gap-3">
      <button
        ref="plantFrameRef"
        type="button"
        class="plant-reward-frame relative h-20 w-20 shrink-0 cursor-zoom-in rounded-3xl transition active:scale-[0.98]"
        :class="{ 'plant-reward-frame--animating': flyout.active }"
        aria-label="Увеличить изображение растения"
        @click.stop="openPlantPreview"
      >
        <img
          :key="plantImageKey"
          :src="miniaturePlantSrc"
          :alt="stageTitle"
          class="plant-reward-current absolute inset-0 h-full w-full rounded-3xl object-contain"
          loading="eager"
          decoding="async"
          @error="handlePlantImageError"
        />
      </button>
      <div class="min-w-0 text-left">
        <p
          class="text-xs font-semibold uppercase tracking-wide text-emerald-100"
        >
          {{ props.rewardGranted ? 'Росток получил воду' : 'Повтор засчитан' }}
        </p>
        <p class="mt-1 text-sm font-semibold text-foreground">
          {{ stageTitle }}
        </p>
        <p class="mt-1 text-xs leading-relaxed text-foreground/65">
          {{ rewardText }}
        </p>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="flyout.active"
      ref="flyoutLayerRef"
      class="plant-flyout-layer"
      :style="flyout.style"
      tabindex="-1"
      role="presentation"
      @click.self="skipPlantFlyout"
    >
      <div class="plant-flyout-backdrop" aria-hidden="true" />
      <div class="plant-flyout" aria-hidden="true">
        <div class="plant-flyout__water" aria-hidden="true">
          <span
            v-for="drop in flyoutDrops"
            :key="drop.id"
            class="plant-flyout__drop"
            :style="drop.style"
          />
          <span
            v-for="ripple in flyoutRipples"
            :key="ripple.id"
            class="plant-flyout__ripple"
            :style="ripple.style"
          />
        </div>
        <div class="plant-flyout__particles" aria-hidden="true">
          <span
            v-for="particle in flyoutParticles"
            :key="particle.id"
            class="plant-flyout__particle"
            :style="particle.style"
          />
        </div>
        <div class="plant-flyout__glow" />
        <div class="plant-flyout__shell">
          <img
            v-if="showStageMorph"
            :src="resolvedPreviousPlantSrc"
            :alt="previousStageTitle"
            class="plant-flyout__image plant-flyout__image--previous"
            decoding="async"
            @error="handlePreviousPlantImageError"
          />
          <img
            :src="resolvedPlantSrc"
            :alt="stageTitle"
            class="plant-flyout__image"
            :class="
              showStageMorph
                ? 'plant-flyout__image--current'
                : 'plant-flyout__image--steady'
            "
            decoding="async"
            @error="handlePlantImageError"
          />
        </div>
      </div>
      <button
        type="button"
        class="plant-flyout-skip"
        @click.stop="skipPlantFlyout"
      >
        Пропустить
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  getRetentionPlantFallbackSrc,
  getRetentionPlantImageSrc,
  getRetentionPlantStateIndex,
  getRetentionPlantTitle,
} from '@/app/utils/retentionPlant';
import { usePhotoSwipe } from '@/app/composables/usePhotoSwipe';
import type { ProgramOverviewDto } from '@/shared/dto/retention';

const props = withDefaults(
  defineProps<{
    program: ProgramOverviewDto;
    rewardAmount: number;
    rewardGranted: boolean;
    /**
     * Финальный шаг программы (Сад завершён). При true:
     *  - PLANT_FLYOUT_DURATION_MS увеличена (медленнее раскрытие финального
     *    bloom'а — пользователь успевает прочувствовать момент);
     *  - вокруг карточки появляется мягкий цветочный glow (см. CSS .plant-reward-final);
     *  - картинка стадии 15 удерживается дольше — без возврата к миниатюре.
     */
    isFinalStep?: boolean;
  }>(),
  { isFinalStep: false }
);

// Сообщаем родителю, что flyout-анимация цветка завершилась (или была
// пропущена/недоступна). Родитель использует это, чтобы показать оверлей
// формирования отчёта только ПОСЛЕ анимации, а не одновременно с ней.
const emit = defineEmits<{ (e: 'flyout-complete'): void }>();

const { openPhotoSwipe } = usePhotoSwipe();
// Финальный шаг — увеличиваем длительность анимации, чтобы дать время
// прочувствовать «Сад завершён» (см. retention/retention_long_term_strategy.md).
const PLANT_FLYOUT_DURATION_MS = props.isFinalStep ? 14000 : 11000;
const PLANT_FLYOUT_START_DELAY_MS = 2600;
const plantFrameRef = ref<HTMLElement | null>(null);
const flyoutLayerRef = ref<HTMLElement | null>(null);
const flyout = ref<{
  active: boolean;
  style: Record<string, string>;
}>({
  active: false,
  style: {},
});
let flyoutTimer: ReturnType<typeof setTimeout> | null = null;
let scrollLockSnapshot: {
  bodyOverflow: string;
  documentOverflow: string;
} | null = null;
let keyboardListenerBound = false;
const rewardStyle = computed(() => ({
  '--plant-reward-flyout-duration': `${PLANT_FLYOUT_DURATION_MS}ms`,
}));

// Капли flyout-полива. Координаты в локальной системе shell (80×80, размер
// исходной миниатюры до scale). Shell внутри Teleport-слоя скейлится в N раз
// до целевого размера, и все absolute-дети визуально растут вместе с ним.
// Поэтому `--plant-drop-fall` нельзя считать в экранных px — это значение
// в локальных px shell, которое после scale × N даёт реальное смещение.
//
// Стартовая позиция drop.top ≈ -2..2% от shell (около верха), а landing
// должен совпасть с линией ripples (FLYOUT_RIPPLE_ROW_TOP = 68% shell).
// fall ≈ 44-50px локальных = 55-63% от 80px локальной shell — landing чуть
// выше FLYOUT_RIPPLE_ROW_TOP (визуально совпадает с горшком после scale,
// ripples остаются точно на земле).
//
// Для каждой капли есть парный ripple ниже с задержкой = `delay + duration`,
// чтобы всплеск появлялся ровно в момент landing'а конкретной капли.
const FLYOUT_RIPPLE_ROW_TOP = 68; // % — линия лужи на горшке
const flyoutDrops = [
  {
    id: 1,
    style: {
      left: '40%',
      top: '-2%',
      '--plant-drop-delay': '3000ms',
      '--plant-drop-drift': '8px',
      '--plant-drop-fall': '46px',
      '--plant-drop-duration': '1100ms',
      '--plant-drop-rotate': '-8deg',
    },
  },
  {
    id: 2,
    style: {
      left: '48%',
      top: '-4%',
      '--plant-drop-delay': '3180ms',
      '--plant-drop-drift': '2px',
      '--plant-drop-fall': '50px',
      '--plant-drop-duration': '1180ms',
      '--plant-drop-rotate': '4deg',
    },
  },
  {
    id: 3,
    style: {
      left: '57%',
      top: '-2%',
      '--plant-drop-delay': '3360ms',
      '--plant-drop-drift': '-6px',
      '--plant-drop-fall': '46px',
      '--plant-drop-duration': '1140ms',
      '--plant-drop-rotate': '9deg',
    },
  },
  {
    id: 4,
    style: {
      left: '44%',
      top: '0%',
      '--plant-drop-delay': '3560ms',
      '--plant-drop-drift': '4px',
      '--plant-drop-fall': '44px',
      '--plant-drop-duration': '1080ms',
      '--plant-drop-rotate': '-4deg',
    },
  },
  {
    id: 5,
    style: {
      left: '53%',
      top: '-1%',
      '--plant-drop-delay': '3740ms',
      '--plant-drop-drift': '-3px',
      '--plant-drop-fall': '48px',
      '--plant-drop-duration': '1120ms',
      '--plant-drop-rotate': '6deg',
    },
  },
  {
    id: 6,
    style: {
      left: '62%',
      top: '1%',
      '--plant-drop-delay': '3920ms',
      '--plant-drop-drift': '-10px',
      '--plant-drop-fall': '44px',
      '--plant-drop-duration': '1040ms',
      '--plant-drop-rotate': '12deg',
    },
  },
  {
    id: 7,
    style: {
      left: '36%',
      top: '2%',
      '--plant-drop-delay': '4100ms',
      '--plant-drop-drift': '10px',
      '--plant-drop-fall': '46px',
      '--plant-drop-duration': '1020ms',
      '--plant-drop-rotate': '-10deg',
    },
  },
] as const;

// Ripples синхронизированы с landing-моментом каждой капли:
// `--plant-ripple-delay` = delay + duration соответствующей капли.
// Позиция левее/правее = drop.left со сдвигом в сторону drift (~1% на 5px).
const flyoutRipples = [
  {
    id: 1,
    style: {
      left: '41%',
      top: `${FLYOUT_RIPPLE_ROW_TOP}%`,
      '--plant-ripple-delay': '4100ms', // drop 1: 3000+1100
    },
  },
  {
    id: 2,
    style: {
      left: '48%',
      top: `${FLYOUT_RIPPLE_ROW_TOP + 1}%`,
      '--plant-ripple-delay': '4360ms', // drop 2: 3180+1180
    },
  },
  {
    id: 3,
    style: {
      left: '56%',
      top: `${FLYOUT_RIPPLE_ROW_TOP}%`,
      '--plant-ripple-delay': '4500ms', // drop 3: 3360+1140
    },
  },
  {
    id: 4,
    style: {
      left: '45%',
      top: `${FLYOUT_RIPPLE_ROW_TOP + 2}%`,
      '--plant-ripple-delay': '4640ms', // drop 4: 3560+1080
    },
  },
  {
    id: 5,
    style: {
      left: '52%',
      top: `${FLYOUT_RIPPLE_ROW_TOP + 1}%`,
      '--plant-ripple-delay': '4860ms', // drop 5: 3740+1120
    },
  },
  {
    id: 6,
    style: {
      left: '60%',
      top: `${FLYOUT_RIPPLE_ROW_TOP + 2}%`,
      '--plant-ripple-delay': '4960ms', // drop 6: 3920+1040
    },
  },
  {
    id: 7,
    style: {
      left: '38%',
      top: `${FLYOUT_RIPPLE_ROW_TOP + 1}%`,
      '--plant-ripple-delay': '5120ms', // drop 7: 4100+1020
    },
  },
] as const;

const flyoutParticles = [
  {
    id: 1,
    style: {
      left: '22%',
      top: '52%',
      '--plant-particle-delay': '7900ms',
      '--plant-particle-size': '1.2px',
      '--plant-particle-x': '-10px',
      '--plant-particle-y': '-18px',
      '--plant-particle-color': 'rgba(255, 219, 235, 0.74)',
    },
  },
  {
    id: 2,
    style: {
      left: '34%',
      top: '34%',
      '--plant-particle-delay': '8020ms',
      '--plant-particle-size': '1px',
      '--plant-particle-x': '-7px',
      '--plant-particle-y': '-21px',
      '--plant-particle-color': 'rgba(224, 242, 254, 0.72)',
    },
  },
  {
    id: 3,
    style: {
      left: '48%',
      top: '26%',
      '--plant-particle-delay': '8140ms',
      '--plant-particle-size': '1.4px',
      '--plant-particle-x': '1px',
      '--plant-particle-y': '-23px',
      '--plant-particle-color': 'rgba(255, 255, 255, 0.78)',
    },
  },
  {
    id: 4,
    style: {
      left: '64%',
      top: '34%',
      '--plant-particle-delay': '8260ms',
      '--plant-particle-size': '1px',
      '--plant-particle-x': '8px',
      '--plant-particle-y': '-20px',
      '--plant-particle-color': 'rgba(204, 251, 241, 0.72)',
    },
  },
  {
    id: 5,
    style: {
      left: '76%',
      top: '52%',
      '--plant-particle-delay': '8380ms',
      '--plant-particle-size': '1.2px',
      '--plant-particle-x': '10px',
      '--plant-particle-y': '-17px',
      '--plant-particle-color': 'rgba(255, 219, 235, 0.68)',
    },
  },
  {
    id: 6,
    style: {
      left: '28%',
      top: '66%',
      '--plant-particle-delay': '8500ms',
      '--plant-particle-size': '0.9px',
      '--plant-particle-x': '-9px',
      '--plant-particle-y': '-12px',
      '--plant-particle-color': 'rgba(224, 242, 254, 0.62)',
    },
  },
  {
    id: 7,
    style: {
      left: '70%',
      top: '68%',
      '--plant-particle-delay': '8620ms',
      '--plant-particle-size': '0.9px',
      '--plant-particle-x': '9px',
      '--plant-particle-y': '-13px',
      '--plant-particle-color': 'rgba(255, 255, 255, 0.7)',
    },
  },
  {
    id: 8,
    style: {
      left: '52%',
      top: '18%',
      '--plant-particle-delay': '8740ms',
      '--plant-particle-size': '1px',
      '--plant-particle-x': '4px',
      '--plant-particle-y': '-24px',
      '--plant-particle-color': 'rgba(255, 219, 235, 0.66)',
    },
  },
] as const;

const previousCompletedSteps = computed(() =>
  props.rewardGranted
    ? Math.max(0, props.program.completedSteps - 1)
    : props.program.completedSteps
);

const previousStageIndex = computed(() =>
  getRetentionPlantStateIndex(
    previousCompletedSteps.value,
    props.program.totalSteps
  )
);

const stageIndex = computed(() =>
  getRetentionPlantStateIndex(
    props.program.completedSteps,
    props.program.totalSteps
  )
);

const plantSrc = computed(() =>
  getRetentionPlantImageSrc(stageIndex.value, props.program.plantSetSlug)
);
const plantFallbackSrc = computed(() =>
  getRetentionPlantFallbackSrc(stageIndex.value)
);
const previousPlantSrc = computed(() =>
  getRetentionPlantImageSrc(
    previousStageIndex.value,
    props.program.plantSetSlug
  )
);
const previousPlantFallbackSrc = computed(() =>
  getRetentionPlantFallbackSrc(previousStageIndex.value)
);
const resolvedPlantSrc = ref(plantSrc.value);
const resolvedPreviousPlantSrc = ref(previousPlantSrc.value);
const plantImageKey = computed(
  () => `${stageIndex.value}-${resolvedPlantSrc.value}`
);
const stageTitle = computed(() =>
  getRetentionPlantTitle(stageIndex.value, props.program.plantSetSlug)
);
const previousStageTitle = computed(() =>
  getRetentionPlantTitle(previousStageIndex.value, props.program.plantSetSlug)
);
const showStageMorph = computed(
  () => props.rewardGranted && previousStageIndex.value !== stageIndex.value
);

// Соблюдаем переходный этап в миниатюре карточки: пока flyout-анимация
// «полива» с морфом previous→current не завершилась, в маленьком кадре
// показываем previous-цветок. После окончания flyout миниатюра плавно
// fade-in'ится в новый кадр через keyframes `plant-reward-current-return`.
//
// Если flyout не запустится (нет rewardGranted, prefers-reduced-motion,
// первый показ при completedSteps=0) — сразу показываем current.
const hasFlyoutCompleted = ref(false);
// Флаг размонтирования: чтобы не эмитить 'flyout-complete', когда компонент
// уничтожается до естественного завершения анимации (например, пользователь
// сам ушёл со success-экрана через «Следующий шаг»).
let isUnmounting = false;
const miniaturePlantSrc = computed(() => {
  if (!showStageMorph.value) return resolvedPlantSrc.value;
  return hasFlyoutCompleted.value
    ? resolvedPlantSrc.value
    : resolvedPreviousPlantSrc.value;
});
const rewardText = computed(() =>
  props.rewardGranted
    ? `+${props.rewardAmount} ${formatDrops(props.rewardAmount)} к недельному прогрессу.`
    : 'Новая награда не начисляется за повтор уже пройденного шага.'
);

function formatDrops(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'капель';
  if (last === 1) return 'капля';
  if (last >= 2 && last <= 4) return 'капли';
  return 'капель';
}

function handlePlantImageError() {
  if (resolvedPlantSrc.value === plantFallbackSrc.value) return;
  void capturePlantAssetWarning(
    'current',
    stageIndex.value,
    resolvedPlantSrc.value
  );
  resolvedPlantSrc.value = plantFallbackSrc.value;
}

function handlePreviousPlantImageError() {
  if (resolvedPreviousPlantSrc.value === previousPlantFallbackSrc.value) return;
  void capturePlantAssetWarning(
    'previous',
    previousStageIndex.value,
    resolvedPreviousPlantSrc.value
  );
  resolvedPreviousPlantSrc.value = previousPlantFallbackSrc.value;
}

function openPlantPreview() {
  void openPhotoSwipe([
    {
      src: resolvedPlantSrc.value,
      width: 1200,
      height: 1200,
      alt: stageTitle.value,
    },
  ]);
}

function clearFlyoutTimer() {
  if (!flyoutTimer) return;
  clearTimeout(flyoutTimer);
  flyoutTimer = null;
}

function lockPageScroll() {
  if (typeof document === 'undefined') return;
  if (!document.body || !document.documentElement) return;
  if (scrollLockSnapshot) return;

  scrollLockSnapshot = {
    bodyOverflow: document.body.style.overflow,
    documentOverflow: document.documentElement.style.overflow,
  };
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
}

function unlockPageScroll() {
  if (typeof document === 'undefined' || !scrollLockSnapshot) return;
  if (!document.body || !document.documentElement) {
    scrollLockSnapshot = null;
    return;
  }

  document.body.style.overflow = scrollLockSnapshot.bodyOverflow;
  document.documentElement.style.overflow = scrollLockSnapshot.documentOverflow;
  scrollLockSnapshot = null;
}

function handleFlyoutKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  skipPlantFlyout();
}

function bindFlyoutKeyboard() {
  if (typeof document === 'undefined') return;
  if (keyboardListenerBound) return;

  document.addEventListener('keydown', handleFlyoutKeydown);
  keyboardListenerBound = true;
}

function unbindFlyoutKeyboard() {
  if (typeof document === 'undefined') return;
  if (!keyboardListenerBound) return;

  document.removeEventListener('keydown', handleFlyoutKeydown);
  keyboardListenerBound = false;
}

function finishPlantFlyout() {
  clearFlyoutTimer();
  flyout.value = { active: false, style: {} };
  unlockPageScroll();
  unbindFlyoutKeyboard();
  // После завершения flyout миниатюра в карточке должна показывать
  // обновлённый цветок (current). До этого момента — previous, чтобы
  // не было визуального диссонанса с морфом во флайауте.
  hasFlyoutCompleted.value = true;
}

function skipPlantFlyout() {
  if (!flyout.value.active) return;
  finishPlantFlyout();
}

async function triggerPlantHaptic() {
  if (typeof window === 'undefined') return;

  try {
    const { Capacitor } = await import('@capacitor/core');
    const isNative =
      typeof Capacitor.isNativePlatform === 'function'
        ? Capacitor.isNativePlatform()
        : Capacitor.getPlatform() === 'ios' ||
          Capacitor.getPlatform() === 'android';

    if (
      !isNative ||
      (typeof Capacitor.isPluginAvailable === 'function' &&
        !Capacitor.isPluginAvailable('Haptics'))
    ) {
      return;
    }

    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({
      style: showStageMorph.value ? ImpactStyle.Medium : ImpactStyle.Light,
    });
  } catch (error) {
    console.error('[RetentionPlant] Не удалось запустить haptic:', error);
  }
}

async function capturePlantAssetWarning(
  role: 'current' | 'previous',
  stateIndex: number,
  src: string
) {
  if (typeof window === 'undefined') return;

  try {
    const Sentry = await import('@sentry/vue');
    Sentry.captureMessage('Retention plant image failed to load', {
      level: 'warning',
      tags: {
        feature: 'retention_plant',
        image_role: role,
      },
      extra: {
        stage: stateIndex + 1,
        src,
      },
    });
  } catch {
    console.warn('[RetentionPlant] Не удалось загрузить изображение:', src);
  }
}

function runPlantFlyout() {
  // Ранние выходы: flyout не запустится — миниатюра должна сразу показывать
  // current, чтобы не зависнуть на previous картинке.
  if (!props.rewardGranted) {
    hasFlyoutCompleted.value = true;
    return;
  }
  if (flyout.value.active) return;
  if (typeof window === 'undefined') {
    hasFlyoutCompleted.value = true;
    return;
  }
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    hasFlyoutCompleted.value = true;
    return;
  }

  const frame = plantFrameRef.value;
  if (!frame) {
    hasFlyoutCompleted.value = true;
    return;
  }

  const rect = frame.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    hasFlyoutCompleted.value = true;
    return;
  }

  const viewportWidth = window.innerWidth || 390;
  const viewportHeight = window.innerHeight || 780;
  const targetCenterX = viewportWidth / 2;
  const targetCenterY = viewportHeight * 0.43;
  const targetSize = Math.min(viewportWidth * 0.78, viewportHeight * 0.56, 460);
  const targetLeft = targetCenterX - targetSize / 2;
  const targetTop = targetCenterY - targetSize / 2;
  const startScale = Math.max(
    0.1,
    Math.min(rect.width, rect.height) / targetSize
  );
  // iOS Safari мылит img, если маленький composited layer потом апскейлится
  // через transform. Поэтому flyout сразу рендерится в целевом размере, а
  // стартовое состояние задаётся обратным scale до размера карточки.
  const startTranslateX = rect.left - targetLeft;
  const startTranslateY = rect.top - targetTop;
  const dropWidth = 6.4;
  const dropHeight = 10.8;
  const dropBorder = 0.7;
  // Лужица: эллипс с пропорцией ~2.4:1 (шире, чем тонкая полоска до этого).
  // Видимая лужица на горшке должна быть «капельной», не просто горизонтальной
  // чертой. Высоту подняли с 5px до 9px, ширину сохранили.
  const rippleWidth = 22;
  const rippleHeight = 9;
  const rippleBorder = 1;

  clearFlyoutTimer();
  lockPageScroll();
  bindFlyoutKeyboard();
  flyout.value = {
    active: true,
    style: {
      '--plant-flyout-duration': `${PLANT_FLYOUT_DURATION_MS}ms`,
      '--plant-flyout-left': `${targetLeft}px`,
      '--plant-flyout-top': `${targetTop}px`,
      '--plant-flyout-width': `${targetSize}px`,
      '--plant-flyout-height': `${targetSize}px`,
      '--plant-flyout-start-x': `${startTranslateX}px`,
      '--plant-flyout-start-y': `${startTranslateY}px`,
      '--plant-flyout-start-scale': `${startScale}`,
      '--plant-drop-width': `${dropWidth}px`,
      '--plant-drop-height': `${dropHeight}px`,
      '--plant-drop-border': `${dropBorder}px`,
      '--plant-ripple-width': `${rippleWidth}px`,
      '--plant-ripple-height': `${rippleHeight}px`,
      '--plant-ripple-border': `${rippleBorder}px`,
    },
  };
  void triggerPlantHaptic();
  void nextTick(() => {
    try {
      flyoutLayerRef.value?.focus({ preventScroll: true });
    } catch {
      flyoutLayerRef.value?.focus();
    }
  });

  flyoutTimer = setTimeout(() => {
    finishPlantFlyout();
  }, PLANT_FLYOUT_DURATION_MS + 120);
}

watch(
  plantSrc,
  (src) => {
    resolvedPlantSrc.value = src;
  },
  { immediate: true }
);

watch(
  previousPlantSrc,
  (src) => {
    resolvedPreviousPlantSrc.value = src;
  },
  { immediate: true }
);

onMounted(() => {
  void nextTick(() => {
    if (typeof window === 'undefined') return;
    window.setTimeout(runPlantFlyout, PLANT_FLYOUT_START_DELAY_MS);
  });
});

// Эмитим завершение анимации один раз — когда hasFlyoutCompleted переходит в
// true. Это покрывает все пути: естественное завершение flyout, ранние выходы
// (нет reward/SSR/нет frame) и prefers-reduced-motion. На размонтировании не
// эмитим (см. isUnmounting).
watch(hasFlyoutCompleted, (done) => {
  if (done && !isUnmounting) emit('flyout-complete');
});

onBeforeUnmount(() => {
  isUnmounting = true;
  finishPlantFlyout();
});
</script>

<style scoped>
.plant-reward-frame {
  transform: translateZ(0);
}

/* Финальный шаг программы: цветочный glow вокруг карточки + мягкая пульсация.
   Эффект «Сад полностью раскрылся» — см. retention/retention_long_term_strategy.md */
.plant-reward-final {
  box-shadow:
    0 0 0 1px rgba(167, 243, 208, 0.18),
    0 12px 32px -8px rgba(167, 243, 208, 0.25),
    0 0 48px -8px rgba(244, 114, 182, 0.15);
}

.plant-reward-final__bloom {
  background: radial-gradient(
      circle at 18% 24%,
      rgba(244, 114, 182, 0.22),
      transparent 32%
    ),
    radial-gradient(
      circle at 84% 28%,
      rgba(167, 243, 208, 0.28),
      transparent 36%
    ),
    radial-gradient(
      circle at 50% 92%,
      rgba(253, 224, 71, 0.18),
      transparent 40%
    );
  filter: blur(6px);
  opacity: 0;
  animation: plant-reward-bloom-pulse 6000ms ease-in-out 2200ms infinite;
}

@keyframes plant-reward-bloom-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.04);
  }
}

.plant-reward-current {
  transform-origin: center;
  transition: opacity 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.plant-reward-frame--animating .plant-reward-current {
  animation: plant-reward-current-return var(--plant-reward-flyout-duration)
    ease both;
}

.plant-drop {
  top: -12px;
  animation: plant-drop 1.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes plant-drop {
  0% {
    opacity: 0;
    transform: translate3d(0, -8px, 0) scale(0.7);
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate3d(0, 76px, 0) scale(1);
  }
}

@keyframes plant-reward-current-return {
  0%,
  78% {
    opacity: 0;
  }
  90%,
  100% {
    opacity: 1;
  }
}

.plant-flyout-layer {
  position: fixed;
  inset: 0;
  z-index: 999980;
  outline: none;
  pointer-events: auto;
  touch-action: manipulation;
}

.plant-flyout-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Затемнение с лёгким цветным glow в центре, чтобы анимация капель и
     цветения была визуально в фокусе. Не полностью чёрный — оставляем
     ощущение прозрачности через rgba ~0.6. Backdrop-blur мягко размывает
     фон под оверлеем. */
  background: radial-gradient(
      circle at 50% 42%,
      rgba(255, 219, 235, 0.22),
      rgba(110, 231, 183, 0.16) 30%,
      transparent 58%
    ),
    rgba(2, 6, 23, 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: plant-flyout-backdrop var(--plant-flyout-duration) ease both;
}

.plant-flyout {
  position: absolute;
  left: var(--plant-flyout-left);
  top: var(--plant-flyout-top);
  z-index: 1;
  width: var(--plant-flyout-width);
  height: var(--plant-flyout-height);
  pointer-events: none;
  transform-origin: top left;
  animation: plant-flyout-travel var(--plant-flyout-duration) both;
  will-change: transform, opacity;
}

.plant-flyout__water,
.plant-flyout__particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}

.plant-flyout__drop {
  position: absolute;
  width: var(--plant-drop-width);
  height: var(--plant-drop-height);
  border: var(--plant-drop-border) solid rgba(255, 255, 255, 0.4);
  border-radius: 52% 48% 58% 42% / 64% 56% 44% 36%;
  background: radial-gradient(
      circle at 34% 26%,
      rgba(255, 255, 255, 0.95) 0 13%,
      transparent 15%
    ),
    linear-gradient(
      150deg,
      rgba(240, 249, 255, 0.92),
      rgba(125, 211, 252, 0.62) 55%,
      rgba(34, 211, 238, 0.36)
    );
  box-shadow: inset -1px -1px 2px rgba(14, 116, 144, 0.18);
  opacity: 0;
  transform: translate3d(0, -18px, 0) rotate(var(--plant-drop-rotate))
    scale(0.64);
  animation: plant-flyout-drop var(--plant-drop-duration)
    cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--plant-drop-delay);
}

.plant-flyout__ripple {
  position: absolute;
  width: var(--plant-ripple-width);
  height: var(--plant-ripple-height);
  border: var(--plant-ripple-border) solid rgba(224, 242, 254, 0.62);
  border-radius: 999px;
  opacity: 0;
  transform: translate3d(-50%, -50%, 0) scale(0.32);
  animation: plant-flyout-ripple 1100ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--plant-ripple-delay);
  /* Внутренний glow + поверхностный highlight, чтобы лужица читалась
     как блик воды, а не как тонкая декоративная линия. */
  box-shadow:
    inset 0 0.4px 0 0.2px rgba(255, 255, 255, 0.55),
    0 0.3px 1.2px rgba(125, 211, 252, 0.4);
}

/* Концентрическое второе кольцо для эффектной «расходящейся волны». */
.plant-flyout__ripple::after {
  content: '';
  position: absolute;
  inset: -10% -8%;
  border: var(--plant-ripple-border) solid rgba(224, 242, 254, 0.32);
  border-radius: 999px;
  opacity: 0;
  animation: plant-flyout-ripple-echo 1100ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--plant-ripple-delay) + 120ms);
  pointer-events: none;
}

.plant-flyout__particle {
  position: absolute;
  width: var(--plant-particle-size);
  height: var(--plant-particle-size);
  border-radius: 999px;
  background: var(--plant-particle-color);
  opacity: 0;
  transform: translate3d(0, 0, 0) scale(0.55);
  animation: plant-flyout-particle 1.75s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--plant-particle-delay);
}

.plant-flyout__glow {
  position: absolute;
  inset: -28%;
  border-radius: 999px;
  background: radial-gradient(
    circle,
    rgba(187, 247, 208, 0.34),
    rgba(103, 232, 249, 0.16) 42%,
    transparent 70%
  );
  filter: blur(16px);
  z-index: 1;
  animation: plant-flyout-glow var(--plant-flyout-duration) ease both;
}

.plant-flyout__shell {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  border-radius: 28px;
}

.plant-flyout__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: contain;
  transform-origin: center;
  will-change: opacity, transform;
}

.plant-flyout__image--previous {
  animation: plant-flyout-previous var(--plant-flyout-duration) ease both;
}

.plant-flyout__image--current {
  animation: plant-flyout-current var(--plant-flyout-duration) ease both;
}

.plant-flyout__image--steady {
  animation: plant-flyout-steady var(--plant-flyout-duration) ease both;
}

.plant-flyout-skip {
  position: fixed;
  left: 50%;
  bottom: calc(26px + env(safe-area-inset-bottom));
  z-index: 2;
  min-height: 40px;
  transform: translate3d(-50%, 8px, 0);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.62);
  padding: 0 18px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  font-weight: 600;
  opacity: 0;
  backdrop-filter: blur(18px);
  animation: plant-flyout-skip var(--plant-flyout-duration)
    cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes plant-flyout-travel {
  0% {
    opacity: 1;
    transform: translate(
        var(--plant-flyout-start-x),
        var(--plant-flyout-start-y)
      )
      scale(var(--plant-flyout-start-scale));
    animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  }
  22% {
    transform: translate(0, 0) scale(1);
    animation-timing-function: linear;
  }
  84% {
    transform: translate(0, 0) scale(1);
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  100% {
    opacity: 1;
    transform: translate(
        var(--plant-flyout-start-x),
        var(--plant-flyout-start-y)
      )
      scale(var(--plant-flyout-start-scale));
  }
}

@keyframes plant-flyout-previous {
  0%,
  50% {
    opacity: 1;
    transform: scale(1);
  }
  60% {
    opacity: 0.52;
    transform: scale(1.006);
  }
  70% {
    opacity: 0;
    transform: scale(0.996);
  }
  100% {
    opacity: 0;
    transform: scale(0.996);
  }
}

@keyframes plant-flyout-current {
  0%,
  50% {
    opacity: 0;
    transform: scale(0.992);
  }
  60% {
    opacity: 0.5;
    transform: scale(1.006);
  }
  70% {
    opacity: 1;
    transform: scale(1.012);
  }
  84% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes plant-flyout-steady {
  0%,
  22% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.012);
  }
  84%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes plant-flyout-backdrop {
  0% {
    opacity: 0;
  }
  10%,
  92% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes plant-flyout-glow {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.78);
  }
  26%,
  86% {
    opacity: 1;
    transform: scale(1.26);
  }
}

@keyframes plant-flyout-drop {
  0% {
    opacity: 0;
    transform: translate3d(0, -18px, 0) rotate(var(--plant-drop-rotate))
      scale(0.64);
  }
  18% {
    opacity: 0.92;
  }
  78% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--plant-drop-drift), var(--plant-drop-fall), 0)
      rotate(var(--plant-drop-rotate)) scale(0.86);
  }
}

@keyframes plant-flyout-ripple {
  0% {
    opacity: 0;
    transform: translate3d(-50%, -50%, 0) scale(0.32);
  }
  22% {
    opacity: 0.85;
    transform: translate3d(-50%, -50%, 0) scale(0.62);
  }
  60% {
    opacity: 0.55;
  }
  100% {
    opacity: 0;
    transform: translate3d(-50%, -50%, 0) scale(1.45);
  }
}

@keyframes plant-flyout-ripple-echo {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  35% {
    opacity: 0.6;
  }
  100% {
    opacity: 0;
    transform: scale(1.8);
  }
}

@keyframes plant-flyout-particle {
  0% {
    opacity: 0;
    transform: translate3d(0, 0, 0) scale(0.55);
  }
  22% {
    opacity: 0.95;
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--plant-particle-x), var(--plant-particle-y), 0)
      scale(1.08);
  }
}

@keyframes plant-flyout-skip {
  0%,
  12%,
  94%,
  100% {
    opacity: 0;
    transform: translate3d(-50%, 8px, 0);
  }
  20%,
  88% {
    opacity: 1;
    transform: translate3d(-50%, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .plant-drop,
  .plant-flyout,
  .plant-flyout-backdrop,
  .plant-flyout__drop,
  .plant-flyout__ripple,
  .plant-flyout__particle,
  .plant-flyout__glow,
  .plant-flyout__image,
  .plant-flyout-skip {
    animation: none;
  }
}
</style>
