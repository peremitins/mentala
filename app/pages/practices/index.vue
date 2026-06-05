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
        to="/quick-help"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.1s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-rose-400/35 via-red-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-orange-500/25 via-rose-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <div class="w-[60px]">
            <img
              src="../../assets/images/quick_help.webp"
              loading="lazy"
              alt="icon quick help"
            />
          </div>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">
              Быстрая помощь
            </h2>
            <p class="text-sm text-foreground/80">
              Короткие техники для снятия тревоги и напряжения
            </p>
          </div>
        </div>
      </NuxtLink>

      <NuxtLink
        to="/meditations"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.05s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-16 -bottom-8 h-44 w-44 rounded-full bg-gradient-to-br from-amber-400/35 via-rose-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-14 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/25 via-fuchsia-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <div class="w-[60px]">
            <img
              src="../../assets/images/meditation.webp"
              loading="lazy"
              alt="icon meditation"
            />
          </div>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">Медитации</h2>
            <p class="text-sm text-foreground/80">
              Музыка и звуки для отдыха и концентрации
            </p>
          </div>
        </div>
      </NuxtLink>

      <NuxtLink
        to="/breath-practices"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb tile-orb--slow absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-400/40 via-sky-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/30 via-indigo-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <div class="w-[60px]">
            <img
              src="../../assets/images/breath_practiсes.webp"
              loading="lazy"
              alt="icon breath practiсes"
            />
          </div>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">
              Дыхательные практики
            </h2>
            <p class="text-sm text-foreground/80">
              Готовые упражнения и индивидуальные настройки
            </p>
          </div>
        </div>
      </NuxtLink>

      <NuxtLink
        to="/practices/gratitude-diary"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.15s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-400/35 via-pink-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-violet-500/30 via-rose-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <div class="w-[60px]">
            <img
              src="../../assets/images/gratitude_diary.webp"
              loading="lazy"
              alt="icon gratitude diary"
            />
          </div>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">
              Дневник благодарности
            </h2>
            <p class="text-sm text-foreground/80">
              Записывайте хорошие моменты дня с подсказками
            </p>
          </div>
        </div>
      </NuxtLink>

      <NuxtLink
        to="/practices/assessments"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.2s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb tile-orb--slow absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-emerald-400/35 via-cyan-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-teal-500/25 via-sky-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <div
            class="flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-white/40 bg-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
          >
            <span class="text-2xl font-semibold text-emerald-700">7</span>
          </div>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">
              Оценка состояния
            </h2>
            <p class="text-sm text-foreground/80">
              Короткие опросники, чтобы заметить состояние и выбрать следующий
              шаг
            </p>
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
