<template>
  <div class="space-y-4 relative h-full overflow-y-auto rounded-lg pb-[100px]">
    <PageHeader
      title="🌬️&nbsp;Дыхательные практики"
      :show-back-button="true"
      @go-back="goBack"
    />

    <div class="space-y-6">
      <BreathPracticeSection
        v-for="(section, index) in builtInSections"
        :key="section.key"
        :title="section.title"
        :subtitle="section.subtitle"
        :emoji="section.emoji"
        :items="section.items"
        :show-view-all="section.items.length > 4"
        class="animate-slide-up"
        :style="animationStyle(index)"
        @open="openPractice"
        @view-all="openViewAll(section.key)"
      />

      <section
        class="space-y-3 animate-slide-up"
        :style="animationStyle(builtInSections.length)"
      >
        <div class="flex items-center justify-between gap-3 px-1">
          <div>
            <p class="text-xs uppercase tracking-[0.08em] text-white/50">
              Персональные
            </p>
            <h3 class="text-xl font-semibold text-white">
              Мои практики &nbsp;<span class="mr-2">✨</span>
            </h3>
          </div>
        </div>

        <div v-if="customItems.length" class="relative">
          <div
            class="flex gap-4 overflow-x-auto pb-4 pl-2 pr-6 no-scrollbar"
            data-lenis-prevent
            style="touch-action: pan-y pan-x"
          >
            <BreathPracticeCard
              v-for="item in customItems"
              :key="item.practice.slug"
              :practice="item.practice"
              :accent-class="item.accentClass"
              :is-custom="item.isCustom"
              @open="openPractice"
            />
          </div>
        </div>

        <div v-else class="glass-deep p-4 text-sm text-foreground/70">
          Пока нет сохранённых практик. Собери свою — она появится здесь.
        </div>

        <NuxtLink
          to="/breath-practices/custom"
          class="flex group relative overflow-hidden rounded-lg border border-dashed border-white/20 bg-white/5 p-5 transition hover:-translate-y-0.5 hover:border-white/30"
        >
          <div class="pointer-events-none absolute inset-0">
            <div
              class="absolute -right-8 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-fuchsia-500/25 via-purple-500/10 to-transparent blur-2xl"
            />
          </div>
          <div
            class="relative w-full z-10 flex items-center justify-between gap-4"
          >
            <div class="space-y-1">
              <p class="text-base font-semibold text-foreground">
                Создать свою практику
              </p>
              <p class="text-xs text-foreground/60">2–4 фазы, 1–30 секунд</p>
            </div>
            <div class="flex items-center gap-2 text-xs text-foreground/70">
              <span class="rounded-full bg-white/10 px-2 py-1">Открыть</span>
              <IconPlus class="h-3.5 w-3.5" />
            </div>
          </div>
        </NuxtLink>
      </section>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent
        class="max-w-3xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 text-white border-white/10"
      >
        <DialogHeader>
          <DialogTitle>{{ dialogTitle }}</DialogTitle>
          <DialogDescription class="text-white/70">
            Полный список практик раздела.
          </DialogDescription>
        </DialogHeader>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <button
            v-for="item in dialogItems"
            :key="item.practice.slug"
            type="button"
            class="group flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 text-left transition hover:bg-white/10"
            @click="openPractice(item.practice.slug)"
          >
            <div
              class="relative h-16 w-16 overflow-hidden rounded-2xl bg-gradient-to-br"
              :class="item.accentClass"
            >
              <div
                class="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-black/0"
              />
              <div
                class="relative z-10 flex h-full w-full items-center justify-center text-2xl"
              >
                {{ item.practice.emoji }}
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-xs text-white/60">{{ item.practice.goal }}</p>
              <p class="truncate text-sm font-semibold text-white">
                {{ item.practice.title }}
              </p>
              <p class="line-clamp-2 text-xs text-white/70">
                {{ item.practice.description }}
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import PageHeader from '@/app/components/PageHeader.vue';
import IconPlus from '~icons/lucide/plus';
import { navigateTo } from '#app';
import {
  BREATH_PRACTICES,
  mapCustomPractice,
  type BreathPracticeTag,
} from '@/app/lib/breathPracticesCatalog';
import BreathPracticeSection, {
  type BreathPracticeCardItem,
} from '@/app/components/breath-practices/BreathPracticeSection.vue';
import BreathPracticeCard from '@/app/components/breath-practices/BreathPracticeCard.vue';
import { useBreathPracticesStore } from '@/app/stores/breathPractices';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';

const store = useBreathPracticesStore();

// Подбираем акцентный градиент под характер практики.
const TAG_GRADIENTS: Record<BreathPracticeTag, string> = {
  popular: 'from-sky-500 via-indigo-500 to-blue-600',
  sleep: 'from-indigo-500 via-slate-500 to-blue-700',
  anxiety: 'from-emerald-500 via-teal-500 to-cyan-600',
  focus: 'from-amber-400 via-orange-500 to-rose-500',
};

const CUSTOM_GRADIENT = 'from-white/25 via-white/10 to-transparent';

const SECTION_META = [
  {
    key: 'popular',
    title: 'Популярные',
    subtitle: 'Выбор большинства',
    emoji: '✨',
  },
  {
    key: 'sleep',
    title: 'Сон',
    subtitle: 'Успокоение и мягкое замедление',
    emoji: '🌙',
  },
  {
    key: 'anxiety',
    title: 'Снятие тревоги',
    subtitle: 'Ровное дыхание и стабилизация',
    emoji: '💨',
  },
  {
    key: 'focus',
    title: 'Фокус',
    subtitle: 'Собранность и ясность внимания',
    emoji: '🎯',
  },
] as const;

const dialogOpen = ref(false);
const dialogSectionKey = ref<BreathPracticeTag | null>(null);

const builtInSections = computed(() =>
  SECTION_META.map((section) => {
    const items: BreathPracticeCardItem[] = BREATH_PRACTICES.filter(
      (practice) => practice.tags.includes(section.key)
    ).map((practice) => ({
      practice,
      accentClass: TAG_GRADIENTS[section.key],
    }));

    return {
      ...section,
      items,
    };
  }).filter((section) => section.items.length)
);

const customItems = computed<BreathPracticeCardItem[]>(() =>
  store.customPractices.map((practice) => ({
    practice: mapCustomPractice(practice),
    accentClass: CUSTOM_GRADIENT,
    isCustom: true,
  }))
);

function animationStyle(index: number) {
  return `animation-delay: ${index * 0.05}s; animation-fill-mode: both`;
}

const dialogItems = computed<BreathPracticeCardItem[]>(() => {
  if (!dialogSectionKey.value) return [];
  const key = dialogSectionKey.value;
  return BREATH_PRACTICES.filter((practice) => practice.tags.includes(key)).map(
    (practice) => ({
      practice,
      accentClass: TAG_GRADIENTS[key],
    })
  );
});

const dialogTitle = computed(() => {
  if (!dialogSectionKey.value) return 'Подборка';
  const section = SECTION_META.find(
    (item) => item.key === dialogSectionKey.value
  );
  return section?.title || 'Подборка';
});

function openPractice(slug: string) {
  dialogOpen.value = false;
  navigateTo(`/breath-practices/${slug}`);
}

function openViewAll(key: BreathPracticeTag) {
  dialogSectionKey.value = key;
  dialogOpen.value = true;
}

function goBack() {
  navigateTo('/practices');
}

onMounted(async () => {
  await store.load();
});
</script>
