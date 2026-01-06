<template>
  <canvas
    ref="canvasRef"
    :class="
      cn(
        'absolute inset-0 w-full h-full pointer-events-none',
        colorMode.value === 'dark' ? 'opacity-35' : 'opacity-35',
        props.class
      )
    "
  />
</template>

<script setup lang="ts">
import {
  ref,
  onMounted,
  onUnmounted,
  watch,
  computed,
  nextTick,
  type HTMLAttributes,
} from 'vue';
import { Renderer, Camera, Transform, Program, Mesh, Plane } from 'ogl';
import { cn } from '~/lib/utils';
import { useColorMode } from '#imports';

interface Props {
  hue?: number;
  saturation?: number;
  chroma?: number;
  animationSpeed?: number;
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<Props>(), {
  hue: undefined, // Автоматически определяется по теме
  saturation: undefined, // Автоматически определяется по теме
  chroma: undefined, // Автоматически определяется по теме
  animationSpeed: 1.0, // Скорость анимации (0.1 - 2.0)
});

const colorMode = useColorMode();

// Определяем цвета в зависимости от темы
const themeColors = computed(() => {
  const isDark = colorMode.value === 'dark';

  if (isDark) {
    // Для тёмной темы: более приглушённые цвета
    return {
      hue: props.hue ?? 200, // Синий оттенок
      saturation: props.saturation ?? 0.7, // Меньше насыщенность
      chroma: props.chroma ?? 0.4, // Меньше яркость
    };
  } else {
    // Для светлой темы: очень нейтральные, почти незаметные цвета (не желтые!)
    return {
      hue: props.hue ?? 220, // Холодный синий (не желтый)
      saturation: props.saturation ?? 0.15, // Очень низкая насыщенность
      chroma: props.chroma ?? 0.15, // Очень низкая яркость
    };
  }
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const animationRef = ref<number | null>(null);
const rendererRef = ref<Renderer | null>(null);
const sceneRef = ref<Transform | null>(null);
const meshRef = ref<Mesh | null>(null);
const cameraRef = ref<Camera | null>(null);

const pointerRef = ref({
  x: 0,
  y: 0,
  tX: 0,
  tY: 0,
});

const vertexShader = `
  precision mediump float;

  attribute vec2 position;
  attribute vec2 uv;

  varying vec2 vUv;

  void main() {
      vUv = uv;
      gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision mediump float;

  varying vec2 vUv;
  uniform float u_time;
  uniform float u_ratio;
  uniform vec2 u_pointer_position;
  uniform float u_scroll_progress;
  uniform float u_hue;
  uniform float u_saturation;
  uniform float u_chroma;
  uniform float u_animation_speed;

  vec2 rotate(vec2 uv, float th) {
      return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
  }

  float neuro_shape(vec2 uv, float t, float p) {
      vec2 sine_acc = vec2(0.);
      vec2 res = vec2(0.);
      float scale = 8.;

      for (int j = 0; j < 15; j++) {
          uv = rotate(uv, 1.);
          sine_acc = rotate(sine_acc, 1.);
          vec2 layer = uv * scale + float(j) + sine_acc - t;
          sine_acc += sin(layer) + 2.4 * p;
          res += (.5 + .5 * cos(layer)) / scale;
          scale *= (1.2);
      }
      return res.x + res.y;
  }

  // HSL to RGB conversion
  vec3 hsl2rgb(vec3 c) {
      vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
      return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
      vec2 uv = .5 * vUv;
      uv.x *= u_ratio;

      vec2 pointer = vUv - u_pointer_position;
      pointer.x *= u_ratio;
      float p = clamp(length(pointer), 0., 1.);
      p = .5 * pow(1. - p, 2.);

      float t = .001 * u_time * u_animation_speed;
      vec3 color = vec3(0.);

      float noise = neuro_shape(uv, t, p);

      noise = 1.2 * pow(noise, 3.);
      noise += pow(noise, 10.);
      noise = max(.0, noise - .5);
      noise *= (1. - length(vUv - .5));

      // Convert hue from degrees to 0-1 range
      float normalizedHue = u_hue / 360.0;
      
      // Create HSL color with animation
      vec3 hsl = vec3(
          normalizedHue + 0.1 * sin(3.0 * u_scroll_progress + 1.5),
          u_saturation,
          u_chroma * 0.5 + 0.2 * sin(2.0 * u_scroll_progress)
      );

      // Convert to RGB
      color = hsl2rgb(hsl);
      color = color * noise;

      gl_FragColor = vec4(color, noise);
  }
`;

function initOGL() {
  const canvas = canvasRef.value;
  if (!canvas) return false;

  try {
    const renderer = new Renderer({
      canvas,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      dpr: Math.min(window.devicePixelRatio, 2),
    });

    const camera = new Camera(renderer.gl);
    const scene = new Transform();

    const geometry = new Plane(renderer.gl, {
      width: 2,
      height: 2,
    });

    const program = new Program(renderer.gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_ratio: { value: window.innerWidth / window.innerHeight },
        u_pointer_position: { value: [0, 0] },
        u_scroll_progress: { value: 0 },
        u_hue: { value: themeColors.value.hue },
        u_saturation: { value: themeColors.value.saturation },
        u_chroma: { value: themeColors.value.chroma },
        u_animation_speed: { value: props.animationSpeed },
      },
    });

    const mesh = new Mesh(renderer.gl, {
      geometry,
      program,
    });

    mesh.setParent(scene);

    rendererRef.value = renderer;
    cameraRef.value = camera;
    sceneRef.value = scene;
    meshRef.value = mesh;

    return true;
  } catch (error) {
    console.error('Error initializing OGL:', error);
    return false;
  }
}

function resizeCanvas() {
  const renderer = rendererRef.value;
  const mesh = meshRef.value;
  const canvas = canvasRef.value;

  if (!canvas) return;

  if (!renderer || !mesh) return;

  // Получаем размеры canvas (он должен занимать весь родительский контейнер)
  // Используем getBoundingClientRect для более точных размеров
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.clientWidth || window.innerWidth;
  const height = rect.height || canvas.clientHeight || window.innerHeight;

  // Проверяем, что размеры валидные
  if (width <= 0 || height <= 0) {
    // Если размеры не определены, используем размеры окна
    const fallbackWidth = window.innerWidth;
    const fallbackHeight = window.innerHeight;
    renderer.setSize(fallbackWidth, fallbackHeight);
    if (mesh.program && mesh.program.uniforms.u_ratio) {
      mesh.program.uniforms.u_ratio.value = fallbackWidth / fallbackHeight;
    }
    return;
  }

  // Обновляем размер рендерера (OGL автоматически обновит размер canvas)
  renderer.setSize(width, height);

  // Update ratio uniform
  if (mesh.program && mesh.program.uniforms.u_ratio) {
    mesh.program.uniforms.u_ratio.value = width / height;
  }
}

function render() {
  const renderer = rendererRef.value;
  const scene = sceneRef.value;
  const camera = cameraRef.value;
  const mesh = meshRef.value;
  const pointer = pointerRef.value;

  if (!renderer || !scene || !camera || !mesh) return;

  const currentTime = performance.now();

  // Smooth pointer interpolation
  pointer.x += (pointer.tX - pointer.x) * 0.2;
  pointer.y += (pointer.tY - pointer.y) * 0.2;

  // Update uniforms
  if (mesh.program && mesh.program.uniforms) {
    const uniforms = mesh.program.uniforms;

    if (uniforms.u_time) uniforms.u_time.value = currentTime;
    if (uniforms.u_pointer_position) {
      uniforms.u_pointer_position.value = [
        pointer.x / window.innerWidth,
        1 - pointer.y / window.innerHeight,
      ];
    }
    if (uniforms.u_scroll_progress) {
      uniforms.u_scroll_progress.value =
        window.pageYOffset / (2 * window.innerHeight);
    }
  }

  renderer.render({ scene, camera });
  animationRef.value = requestAnimationFrame(render);
}

function updateMousePosition(x: number, y: number) {
  pointerRef.value.tX = x;
  pointerRef.value.tY = y;
}

function handlePointerMove(e: PointerEvent) {
  updateMousePosition(e.clientX, e.clientY);
}

function handleTouchMove(e: TouchEvent) {
  const touch = e.touches?.[0];
  if (touch) {
    updateMousePosition(touch.clientX, touch.clientY);
  }
}

function handleClick(e: MouseEvent) {
  updateMousePosition(e.clientX, e.clientY);
}

// Watch for prop changes and update uniforms
watch(
  () => themeColors.value.hue,
  (newHue) => {
    const mesh = meshRef.value;
    if (mesh && mesh.program && mesh.program.uniforms.u_hue) {
      mesh.program.uniforms.u_hue.value = newHue;
    }
  }
);

watch(
  () => themeColors.value.saturation,
  (newSaturation) => {
    const mesh = meshRef.value;
    if (mesh && mesh.program && mesh.program.uniforms.u_saturation) {
      mesh.program.uniforms.u_saturation.value = newSaturation;
    }
  }
);

watch(
  () => themeColors.value.chroma,
  (newChroma) => {
    const mesh = meshRef.value;
    if (mesh && mesh.program && mesh.program.uniforms.u_chroma) {
      mesh.program.uniforms.u_chroma.value = newChroma;
    }
  }
);

watch(
  () => props.animationSpeed,
  (newSpeed) => {
    const mesh = meshRef.value;
    if (mesh && mesh.program && mesh.program.uniforms.u_animation_speed) {
      mesh.program.uniforms.u_animation_speed.value = newSpeed;
    }
  }
);

// Watch for theme changes
watch(
  () => colorMode.value,
  () => {
    const mesh = meshRef.value;
    if (mesh && mesh.program && mesh.program.uniforms) {
      const colors = themeColors.value;
      if (mesh.program.uniforms.u_hue) {
        mesh.program.uniforms.u_hue.value = colors.hue;
      }
      if (mesh.program.uniforms.u_saturation) {
        mesh.program.uniforms.u_saturation.value = colors.saturation;
      }
      if (mesh.program.uniforms.u_chroma) {
        mesh.program.uniforms.u_chroma.value = colors.chroma;
      }
    }
  }
);

// Используем ResizeObserver для отслеживания изменений размера
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  await nextTick();

  if (initOGL()) {
    const canvas = canvasRef.value;
    if (!canvas) return;

    resizeCanvas();

    // Используем ResizeObserver для отслеживания изменений размера контейнера
    const container = canvas.parentElement || document.body;

    resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });

    resizeObserver.observe(container);

    // Также слушаем изменения размера окна для подстраховки
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => {
      setTimeout(resizeCanvas, 100);
    });

    render();

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('click', handleClick);
  }
});

onUnmounted(() => {
  if (animationRef.value) {
    cancelAnimationFrame(animationRef.value);
  }

  // Отключаем ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  window.removeEventListener('resize', resizeCanvas);
  window.removeEventListener('orientationchange', resizeCanvas);
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('touchmove', handleTouchMove);
  window.removeEventListener('click', handleClick);

  // Clean up OGL resources
  if (rendererRef.value) {
    rendererRef.value = null;
  }
});
</script>
