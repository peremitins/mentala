<template>
  <div
    class="relative h-full overflow-y-auto xs:space-y-3 space-y-1 pb-[100px] rounded-lg"
  >
    <PageHeader title="Практики" />

    <!-- Геро-блок ИИ-ассистента первым рядом (перенесён с главного экрана,
         см. стратегию главного экрана, Вариант A). -->
    <PracticesAssistantHero @paywall="openPaywall" />

    <div class="grid xs:gap-2 gap-1 grid-cols-1 xxs:grid-cols-2">
      <NuxtLink
        v-for="(card, index) in cards"
        :key="card.to"
        :to="card.to"
        class="glass-deep xs:p-5 p-4 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        :style="{
          animationDelay: `${index * 0.04}s`,
          animationFillMode: 'both',
        }"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-14 -top-10 h-40 w-40 rounded-full blur-2xl"
            :class="card.orb"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-12 bottom-0 h-32 w-32 rounded-full blur-2xl"
            :class="card.orbAlt"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <img
            v-if="card.image"
            :src="card.image"
            loading="eager"
            :alt="card.title"
            class="w-[60px]"
          />
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">
              {{ card.title }}
            </h2>
            <p class="text-sm text-foreground/80">{{ card.subtitle }}</p>
          </div>
        </div>
      </NuxtLink>
    </div>

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import PageHeader from '@/app/components/PageHeader.vue';
import PracticesAssistantHero from '@/app/components/practices/PracticesAssistantHero.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import { useEntitlements } from '@/app/composables/useEntitlements';
import meditationImg from '@/app/assets/images/meditation.webp';
import breathImg from '@/app/assets/images/breath_practiсes.webp';
import gratitudeImg from '@/app/assets/images/gratitude_diary.webp';
import toolkitImg from '@/app/assets/images/toolkit.webp';
import assessmentsImg from '@/app/assets/images/assessments.webp';
import panicImg from '@/app/assets/images/panic.webp';
import tensionImg from '@/app/assets/images/tension.webp';
import thoughtDumpImg from '@/app/assets/images/thought-dump.webp';

interface PracticeCard {
  to: string;
  title: string;
  subtitle: string;
  orb: string;
  orbAlt: string;
  image?: string;
}

// Структура раздела «Практики» после редизайна (ТЗ §12): «Быстрая помощь» как
// отдельный раздел убрана, её уникальные техники вынесены отдельными карточками,
// добавлен персональный «Мой набор». Маршруты /quick-help* остаются рабочими.
const cards: PracticeCard[] = [
  {
    to: '/practices/toolkit',
    title: 'Мой набор',
    subtitle: 'Практики, фразы и действия для личной поддержки',
    image: toolkitImg,
    orb: 'bg-gradient-to-br from-violet-400/35 via-fuchsia-400/20 to-transparent',
    orbAlt:
      'bg-gradient-to-br from-indigo-500/25 via-purple-500/20 to-transparent',
  },
  {
    to: '/practices/assessments',
    title: 'Оценка состояния',
    subtitle: 'Короткие оценки, чтобы заметить состояние и выбрать шаг',
    image: assessmentsImg,
    orb: 'tile-orb--slow bg-gradient-to-br from-emerald-400/35 via-cyan-400/20 to-transparent',
    orbAlt: 'bg-gradient-to-br from-teal-500/25 via-sky-500/20 to-transparent',
  },
  {
    to: '/breath-practices',
    title: 'Дыхательные практики',
    subtitle: 'Готовые упражнения и индивидуальные настройки',
    image: breathImg,
    orb: 'tile-orb--slow bg-gradient-to-br from-cyan-400/40 via-sky-400/20 to-transparent',
    orbAlt:
      'bg-gradient-to-br from-blue-500/30 via-indigo-500/20 to-transparent',
  },
  {
    to: '/meditations',
    title: 'Медитации',
    subtitle: 'Музыка и звуки для отдыха и концентрации',
    image: meditationImg,
    orb: 'bg-gradient-to-br from-amber-400/35 via-rose-400/20 to-transparent',
    orbAlt:
      'bg-gradient-to-br from-purple-500/25 via-fuchsia-500/20 to-transparent',
  },
  {
    to: '/quick-help?entry=panic',
    title: 'Заземление',
    subtitle: 'Быстро вернуться в настоящий момент через ощущения',
    image: panicImg,
    orb: 'bg-gradient-to-br from-emerald-400/35 via-teal-400/20 to-transparent',
    orbAlt:
      'bg-gradient-to-br from-green-500/25 via-emerald-500/20 to-transparent',
  },
  {
    to: '/quick-help?entry=tension',
    title: 'Снятие напряжения',
    subtitle: 'Короткая практика для тела и расслабления',
    image: tensionImg,
    orb: 'bg-gradient-to-br from-rose-400/35 via-red-400/20 to-transparent',
    orbAlt:
      'bg-gradient-to-br from-orange-500/25 via-rose-500/20 to-transparent',
  },
  {
    to: '/quick-help/thought-dump',
    title: 'Выгрузка мыслей',
    subtitle: 'Записать мысли и немного освободить голову',
    image: thoughtDumpImg,
    orb: 'bg-gradient-to-br from-sky-400/35 via-blue-400/20 to-transparent',
    orbAlt:
      'bg-gradient-to-br from-indigo-500/25 via-sky-500/20 to-transparent',
  },
  {
    to: '/practices/gratitude-diary',
    title: 'Дневник благодарности',
    subtitle: 'Записывайте хорошие моменты дня с подсказками',
    image: gratitudeImg,
    orb: 'bg-gradient-to-br from-fuchsia-400/35 via-pink-400/20 to-transparent',
    orbAlt:
      'bg-gradient-to-br from-violet-500/30 via-rose-500/20 to-transparent',
  },
];

const { getFeatureAccess } = useEntitlements();

const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);

const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}
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
