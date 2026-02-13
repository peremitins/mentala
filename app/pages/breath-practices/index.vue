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
        :style="
          animationStyle(
            builtInSections.length + (fullCatalogAccess.available ? 0 : 1)
          )
        "
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

        <div
          v-if="customManageAccess.available && customItems.length"
          class="relative"
        >
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

        <div
          v-else-if="customManageAccess.available"
          class="glass-deep p-4 text-sm text-foreground/80 mb-4 mx-4"
        >
          Пока нет сохранённых практик. Собери свою!
        </div>

        <NuxtLink
          v-if="customCreateAccess.available"
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

        <button
          v-else
          type="button"
          class="flex group relative overflow-hidden rounded-lg border border-dashed border-white/20 bg-white/5 p-5 mx-4 mb-4 mt-0 transition hover:-translate-y-0.5 hover:border-white/30 text-left w-[calc(100%-2rem)]"
          @click="openPaywall('breath.custom.create')"
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
              <p class="text-xs text-foreground/80">
                Эта функция доступна в
                {{ getPlanBadgeLabel(customCreateAccess.requiredPlan) }}
              </p>
            </div>
            <span
              class="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px]"
            >
              {{ getPlanBadgeEmoji(customCreateAccess.requiredPlan) }}
            </span>
          </div>
        </button>
      </section>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent
        class="glass-deep max-w-3xl border-white/15 text-foreground sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{{ dialogTitle }}</DialogTitle>
          <DialogDescription class="text-foreground/70">
            Полный список практик раздела.
          </DialogDescription>
        </DialogHeader>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <button
            v-for="item in dialogItems"
            :key="item.practice.slug"
            type="button"
            class="group relative flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
            @click="openPracticeInGroup(dialogSectionKey, item.practice.slug)"
          >
            <span
              v-if="item.locked"
              class="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/45 text-xs leading-none"
            >
              {{ getPlanBadgeEmoji(item.requiredPlan || 'pro') }}
            </span>
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

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import { useToast } from '@/app/composables/useToast';
import { useEntitlements } from '@/app/composables/useEntitlements';

const store = useBreathPracticesStore();
const route = useRoute();
const router = useRouter();
const { getFeatureAccess } = useEntitlements();

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
const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);

const BASIC_FREE_SLUGS = new Set(['4-7-8', 'box-breathing']);

const fullCatalogAccess = computed(() =>
  getFeatureAccess('breath.catalog.full')
);
const customCreateAccess = computed(() =>
  getFeatureAccess('breath.custom.create')
);
const customManageAccess = computed(() =>
  getFeatureAccess('breath.custom.manage')
);
const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);

type BreathPracticeGroupKey = BreathPracticeTag | 'custom';

const builtInSections = computed(() =>
  SECTION_META.map((section) => {
    const visiblePractices = BREATH_PRACTICES.filter((practice) =>
      practice.tags.includes(section.key)
    );

    const items: BreathPracticeCardItem[] = visiblePractices.map(
      (practice) => ({
        practice,
        accentClass: TAG_GRADIENTS[section.key],
        locked:
          !fullCatalogAccess.value.available &&
          !BASIC_FREE_SLUGS.has(practice.slug),
        requiredPlan:
          fullCatalogAccess.value.requiredPlan === 'premium'
            ? 'premium'
            : 'pro',
      })
    );

    return {
      ...section,
      items,
    };
  })
);

const customItems = computed<BreathPracticeCardItem[]>(() =>
  customManageAccess.value.available
    ? store.customPractices.map((practice) => ({
        practice: mapCustomPractice(practice),
        accentClass: CUSTOM_GRADIENT,
        isCustom: true,
        customId: practice.id, // Сохраняем ID для удаления
      }))
    : []
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
      locked:
        !fullCatalogAccess.value.available &&
        !BASIC_FREE_SLUGS.has(practice.slug),
      requiredPlan:
        fullCatalogAccess.value.requiredPlan === 'premium' ? 'premium' : 'pro',
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
  if (slug.startsWith('custom-') && !customManageAccess.value.available) {
    openPaywall('breath.custom.manage');
    return;
  }

  if (!fullCatalogAccess.value.available && !BASIC_FREE_SLUGS.has(slug)) {
    openPaywall('breath.catalog.full');
    return;
  }

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

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}

function getPlanBadgeEmoji(plan: string) {
  return plan === 'premium' ? '💎' : '⭐';
}

function getPlanBadgeLabel(plan: string) {
  return plan === 'premium' ? 'Premium' : 'PRO и Premium';
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
  if (customManageAccess.value.available) {
    await store.load();
  }

  const rawLockedFeature = route.query.lockedFeature;
  const lockedFeature = Array.isArray(rawLockedFeature)
    ? rawLockedFeature[0]
    : rawLockedFeature;

  if (typeof lockedFeature === 'string' && lockedFeature.trim().length > 0) {
    openPaywall(lockedFeature.trim());
    const nextQuery = { ...route.query };
    delete (nextQuery as any).lockedFeature;
    void router.replace({ query: nextQuery });
  }
});

watch(
  () => customManageAccess.value.available,
  async (available, prev) => {
    if (available && !prev) {
      await store.load(true);
    }
  }
);
</script>
