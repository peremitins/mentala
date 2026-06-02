<template>
  <div class="share-landing">
    <div class="share-landing__inner">
      <div v-if="loading" class="share-landing__skeleton" aria-hidden="true">
        <div class="share-landing__skeleton-line" style="width: 60%" />
        <div class="share-landing__skeleton-line" style="width: 90%" />
        <div class="share-landing__skeleton-line" style="width: 75%" />
      </div>

      <template v-else-if="program">
        <div class="share-landing__plant" aria-hidden="true">
          <img
            v-if="plantImageSrc"
            :src="plantImageSrc"
            :alt="program.title"
            class="share-landing__plant-img"
            loading="eager"
            decoding="async"
          />
        </div>

        <p class="share-landing__eyebrow">Сад в Mentala</p>
        <h1 class="share-landing__title">{{ program.title }}</h1>
        <p v-if="program.subtitle" class="share-landing__subtitle">
          {{ program.subtitle }}
        </p>
        <p v-if="program.summaryText" class="share-landing__summary">
          {{ program.summaryText }}
        </p>

        <div class="share-landing__cta">
          <a
            v-if="primaryAppLink"
            :href="primaryAppLink.href"
            class="share-landing__cta-primary"
          >
            {{ primaryAppLink.label }}
          </a>
          <a
            v-if="secondaryAppLink"
            :href="secondaryAppLink.href"
            class="share-landing__cta-secondary"
          >
            {{ secondaryAppLink.label }}
          </a>
        </div>

        <p class="share-landing__note">
          Сад — это путь из коротких ежедневных шагов с практиками и
          разбором в финале.
        </p>
      </template>

      <template v-else>
        <p class="share-landing__error">Не удалось загрузить программу.</p>
        <NuxtLink to="/" class="share-landing__cta-secondary">
          На главную Mentala
        </NuxtLink>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAPI } from '@/app/composables/useAPI';
import { getRetentionPlantImageSrc } from '@/app/utils/retentionPlant';

// Публичная landing-страница для шеренной ссылки — никакого default layout
// (без BottomNav, promos и pin-gate). Любой посетитель должен видеть только
// контент о саде и кнопки скачивания приложения.
definePageMeta({
  layout: false,
  // Не требуем авторизацию — это публичная страница для получателей ссылки.
  auth: false,
});

/**
 * Landing-страница для шеренной ссылки на сад.
 *
 * URL: /share/garden/[slug] (например, /share/garden/calm_anxiety_30)
 *
 * Что делает:
 *   1. Загружает метаданные программы через публичный endpoint.
 *   2. Показывает: растение + название + краткое описание + CTA.
 *   3. CTA адаптируются под платформу пользователя:
 *      - iOS → App Store (или Universal Link на установленное приложение);
 *      - Android → Google Play (или App Link);
 *      - desktop → «Открыть в приложении на телефоне» / Web-версия.
 *   4. useHead OG-метатеги для красивого превью в мессенджерах и соцсетях.
 *
 * Privacy: НЕ показываем личный отчёт юзера, только общую информацию
 * о программе. Сама ссылка — это «приглашение посмотреть, что я прошёл».
 *
 * Если пользователь уже залогинен в Mentala (есть session cookie) — мы
 * могли бы сразу редиректнуть в /garden, но это нарушит ожидание UX
 * для тех, кто открывает ссылку «посмотреть»; оставляем landing.
 */

type ProgramPublicMeta = {
  slug: string;
  title: string;
  subtitle: string | null;
  summaryText: string | null;
  plantSetSlug: string | null;
};

const route = useRoute();
const router = useRouter();
const slug = computed(() => String(route.params.slug || ''));

const loading = ref(true);
const program = ref<ProgramPublicMeta | null>(null);

async function loadProgram() {
  if (!slug.value) return;
  try {
    const result = await useAPI<{ program: ProgramPublicMeta | null }>(
      `/api/share/garden/${encodeURIComponent(slug.value)}`,
      { method: 'GET', suppressErrorToast: true }
    );
    program.value = result.program;
  } catch (error) {
    console.warn('[share-landing] load failed:', error);
    program.value = null;
  } finally {
    loading.value = false;
  }
}

const plantImageSrc = computed(() => {
  if (!program.value) return '';
  // Финальная стадия — 15 (0-based 14).
  return getRetentionPlantImageSrc(14, program.value.plantSetSlug ?? 'orchid');
});

// Определяем платформу по User-Agent для подбора CTA.
type Platform = 'ios' | 'android' | 'desktop';
const platform = ref<Platform>('desktop');

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

// Реальные store ID Mentala (см. android/app/build.gradle:applicationId
// + migration 0077 в _journal). Bundle iOS: id6738029498, Android
// package: com.mentala.app.
const APP_STORE_URL = 'https://apps.apple.com/app/id6738029498';
const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.mentala.app';

// Базовый URL лендинга. Используется в secondary-CTA «Узнать про Mentala» —
// чтобы получатель ссылки мог перейти на полное описание продукта без
// дублирования контента у нас.
const LANDING_URL = 'https://mentala.app';

const primaryAppLink = computed(() => {
  if (platform.value === 'ios') {
    return { label: 'Открыть в App Store', href: APP_STORE_URL };
  }
  if (platform.value === 'android') {
    return { label: 'Открыть в Google Play', href: GOOGLE_PLAY_URL };
  }
  // На desktop основное действие — открыть веб-приложение.
  return { label: 'Открыть Mentala в браузере', href: '/' };
});

// На любой платформе показываем «Узнать про Mentala» → ведёт на основной
// лендинг с полным описанием продукта (Hero, Features, Pricing, FAQ).
const secondaryAppLink = computed(() => ({
  label: 'Узнать про Mentala',
  href: LANDING_URL,
}));

// OG-теги для соцсетей. Title/description обновляются после загрузки.
useHead(() => ({
  title: program.value
    ? `${program.value.title} · Mentala`
    : 'Mentala — программы для ментального здоровья',
  meta: [
    {
      property: 'og:title',
      content: program.value
        ? `${program.value.title} · Mentala`
        : 'Mentala',
    },
    {
      property: 'og:description',
      content:
        program.value?.summaryText ??
        'Персональные программы для ментального здоровья: тревога, отношения, привычки.',
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      property: 'og:image',
      content: plantImageSrc.value || '/icon-512.png',
    },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: program.value?.title ?? 'Mentala' },
    {
      name: 'twitter:description',
      content:
        program.value?.summaryText ??
        'Mentala — программы для ментального здоровья.',
    },
    { name: 'twitter:image', content: plantImageSrc.value || '/icon-512.png' },
  ],
}));

onMounted(() => {
  platform.value = detectPlatform();
  void loadProgram();
  void router; // подавляем неиспользуемое предупреждение
});
</script>

<style scoped>
.share-landing {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  /* Палитра как у основного лендинга mentala.app — тёмно-синий с тёплыми
     emerald/cyan/amber акцентами через radial gradients. Это убирает
     ощущение «слишком синего плоского фона». */
  background:
    radial-gradient(
      900px 560px at 88% -8%,
      rgba(103, 232, 249, 0.18),
      transparent 62%
    ),
    radial-gradient(
      700px 520px at 0% 18%,
      rgba(52, 211, 153, 0.16),
      transparent 60%
    ),
    radial-gradient(
      600px 320px at 50% -10%,
      rgba(242, 199, 143, 0.1),
      transparent 68%
    ),
    linear-gradient(180deg, #0c1425 0%, #101a2f 34%, #0f1a2b 100%);
  color: #e9f0ff;
  overflow-y: auto;
}

/* Тонкая сетка-glow поверх фона — копия `landing-grid-glow` из лендинга. */
.share-landing::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.016) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.016) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: radial-gradient(circle at center, black 35%, transparent 85%);
  -webkit-mask-image: radial-gradient(circle at center, black 35%, transparent 85%);
}

.share-landing__inner {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  text-align: center;
}

.share-landing__skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.share-landing__skeleton-line {
  height: 16px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.09) 50%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 200% 100%;
  border-radius: 8px;
  animation: share-landing-skel 1.5s ease-in-out infinite;
}

@keyframes share-landing-skel {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.share-landing__plant {
  width: clamp(120px, 36vw, 180px);
  aspect-ratio: 1 / 1;
  margin: 0 auto 16px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 28px;
  border: 1px solid rgba(167, 243, 208, 0.18);
}

.share-landing__plant-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.5));
}

.share-landing__eyebrow {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(167, 243, 208, 0.85);
}

.share-landing__title {
  margin-top: 6px;
  font-size: clamp(20px, 5.5vw, 26px);
  font-weight: 600;
  line-height: 1.2;
}

.share-landing__subtitle {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.75);
}

.share-landing__summary {
  margin-top: 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.7);
}

.share-landing__cta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
}

.share-landing__cta-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #0a0e16;
  background: #ffffff;
  border-radius: 999px;
  text-decoration: none;
  transition: all 200ms ease;
}
.share-landing__cta-primary:hover {
  background: rgba(255, 255, 255, 0.9);
}

.share-landing__cta-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  text-decoration: none;
  transition: all 200ms ease;
}
.share-landing__cta-secondary:hover {
  background: rgba(255, 255, 255, 0.08);
}

.share-landing__note {
  margin-top: 14px;
  font-size: 11.5px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.5);
}

.share-landing__error {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: 16px;
}

/* На очень маленьких экранах (короткие телефоны типа iPhone SE)
   ещё ужимаем, чтобы всё помещалось. Центрирование оставляем — выглядит
   приятнее чем прижатый сверху контент. Если высоты не хватит — сработает
   overflow-y:auto на корневом блоке. */
@media (max-height: 700px) {
  .share-landing {
    padding: 16px 14px;
  }
  .share-landing__plant {
    width: clamp(100px, 28vw, 140px);
    margin-bottom: 10px;
  }
  .share-landing__title {
    font-size: clamp(18px, 5vw, 22px);
  }
  .share-landing__summary {
    margin-top: 8px;
    font-size: 12px;
  }
  .share-landing__cta {
    margin-top: 14px;
  }
  .share-landing__note {
    margin-top: 10px;
  }
}

/* На больших экранах (desktop) — увеличиваем для визуального центра. */
@media (min-width: 640px) and (min-height: 720px) {
  .share-landing {
    padding: 40px 24px;
  }
  .share-landing__plant {
    width: 200px;
    border-radius: 36px;
    padding: 12px;
  }
  .share-landing__title {
    font-size: 28px;
  }
}
</style>
