<template>
  <div class="space-y-2 relative h-full overflow-y-auto rounded-lg pb-[100px]">
    <PageHeader
      title="🌬️&nbsp;Дыхательные практики"
      :show-back-button="true"
      @go-back="goBack"
    />

    <div class="glass-deep">
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
        @open="openPracticeInGroup(section.key, $event)"
        @view-all="openViewAll(section.key)"
      />

      <section
        class="animate-slide-up"
        :style="animationStyle(builtInSections.length)"
      >
        <div class="flex items-center justify-between gap-3 pb-2 pt-4 px-4">
          <div>
            <p class="text-[10px] uppercase tracking-[0.08em] text-foreground">
              Персональные
            </p>
            <h3 class="text-lg font-semibold text-foreground">
              Мои практики &nbsp;<span class="mr-2">✨</span>
            </h3>
          </div>
        </div>

        <div v-if="customItems.length" class="relative">
          <div
            class="flex gap-4 overflow-x-auto pb-4 pl-4 pr-6 no-scrollbar"
            data-lenis-prevent
            style="touch-action: pan-y pan-x"
          >
            <BreathPracticeCard
              v-for="item in customItems"
              :key="item.practice.slug"
              :practice="item.practice"
              :accent-class="item.accentClass"
              :is-custom="item.isCustom"
              :custom-id="item.customId"
              @open="openPracticeInGroup('custom', $event)"
              @delete="handleDeletePractice"
            />
          </div>
        </div>

        <div v-else class="glass-deep p-4 text-sm text-foreground/80 mb-4 mx-4">
          Пока нет сохранённых практик. Собери свою!
        </div>

        <NuxtLink
          to="/breath-practices/custom"
          class="flex group relative overflow-hidden rounded-lg border border-dashed border-white/20 bg-white/5 p-5 m-4 transition hover:-translate-y-0.5 hover:border-white/30"
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
              <p class="text-xs text-foreground/80">2–4 фазы, 1–30 секунд</p>
            </div>
            <div class="flex items-center gap-2 text-xs text-foreground/80">
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
            @click="openPracticeInGroup(dialogSectionKey, item.practice.slug)"
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

    <!-- Модальное окно подтверждения удаления -->
    <ConfirmModal
      ref="deleteModalRef"
      title="Удалить практику?"
      confirm-label="Удалить"
      cancel-label="Отмена"
      @confirm="confirmDeletePractice"
    />
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
import ConfirmModal from '@/app/components/ui/ConfirmModal.vue';
import { useToast } from '@/app/composables/useToast';

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
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const pendingDeleteId = ref<string | null>(null);

type BreathPracticeGroupKey = BreathPracticeTag | 'custom';

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
    customId: practice.id, // Сохраняем ID для удаления
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

function openPracticeInGroup(
  groupKey: BreathPracticeGroupKey | null | undefined,
  slug: string
) {
  dialogOpen.value = false;
  // Передаём группу, чтобы в плеере работали кнопки назад/вперёд.
  const query = groupKey ? { group: groupKey } : undefined;
  navigateTo({ path: `/breath-practices/${slug}`, query });
}

function openViewAll(key: BreathPracticeTag) {
  dialogSectionKey.value = key;
  dialogOpen.value = true;
}

function goBack() {
  navigateTo('/practices');
}

function handleDeletePractice(id: string) {
  pendingDeleteId.value = id;
  deleteModalRef.value?.open();
}

async function confirmDeletePractice() {
  const id = pendingDeleteId.value;
  if (!id) return;

  try {
    await store.removeCustom(id);
    useToast('Практика удалена');
  } catch (error: any) {
    console.error('[BreathPractices] Failed to delete practice:', error);
    useToast(error?.message || 'Не удалось удалить практику');
  } finally {
    pendingDeleteId.value = null;
  }
}

onMounted(async () => {
  await store.load();
});
</script>
