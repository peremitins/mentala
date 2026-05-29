# Roadmap Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть доступ к шагам программ, отчётам сада и старту новых программ за paywall (`programs.roadmap.full`, PRO+) — с ⭐ иконкой и модалкой подписки при клике.

**Architecture:** Добавляем backend-политику `programs.roadmap.full`, расширяем route-guard на URL `/programs/[slug]/steps/[step]` через новый тип в shared navigation, затем добавляем component-level проверку доступа в 7 компонентах с локальным `FeaturePaywallModal` (паттерн, принятый в проекте).

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Pinia, Zod (shared/navigation), Vitest

---

## Файлы изменений (10 файлов)

| Файл | Что меняем |
|------|-----------|
| `server/application/subscriptions/entitlements.service.ts` | Новая политика `programs.roadmap.full` |
| `shared/navigation/index.ts` | Новый тип `program_step` в zod union |
| `app/lib/navigation.ts` | Маппинг URL → feature key → fallback route |
| `app/components/programs/ProgramStepBottomSheet.vue` | Prop `locked`, badge ⭐, emit `paywall` |
| `app/pages/programs/[slug]/map.vue` | Проверка доступа в `openStep`/`startStep`, `FeaturePaywallModal` |
| `app/components/home/HomeRoadmapCard.vue` | Проверка доступа, badge ⭐ на кнопке «Начать» |
| `app/components/garden/GardenAvailableSeeds.vue` | Prop `locked`, badge ⭐ на «Начать» |
| `app/components/garden/GardenActiveCard.vue` | Prop `locked`, badge ⭐ на кнопке «Отчёт» |
| `app/components/garden/GardenCompletedCollection.vue` | Prop `locked`, badge ⭐ на карточках |
| `app/pages/garden.vue` | Проверка доступа в 3 хендлерах, `FeaturePaywallModal`, передача `locked` в дочерние |

---

## Task 1: Backend — добавить политику `programs.roadmap.full`

**Files:**
- Modify: `server/application/subscriptions/entitlements.service.ts:66-221`

- [ ] **Step 1.1: Открыть файл и найти массив DEFAULT_FEATURE_ACCESS_POLICIES**

  Файл: `server/application/subscriptions/entitlements.service.ts`  
  Найти строку с `featureKey: 'notifications.custom_prompt_ai'` — это последний элемент массива (строка ~210).  
  После его закрывающей `},` (перед `];`) добавить:

  ```ts
    {
      featureKey: 'programs.roadmap.full',
      requiredPlan: 'pro',
      trialUnlocked: true,
      lockIcon: 'pro',
      paywallTitle: 'Программы и сады доступны в PRO и Premium',
      paywallDescription:
        'Подключи PRO или Premium, чтобы проходить шаги программ и растить сады.',
      paywallCtaText: 'Выбрать тариф',
      paywallTargetPlan: 'pro',
    },
  ```

- [ ] **Step 1.2: Проверить TypeScript**

  ```bash
  cd /Users/peremitin/Desktop/dev/mentai/frontend
  pnpm exec tsc --noEmit 2>&1 | head -30
  ```
  Ожидаем: нет ошибок (или только pre-existing).

- [ ] **Step 1.3: Запустить тесты**

  ```bash
  pnpm test --run 2>&1 | tail -20
  ```
  Ожидаем: все тесты проходят.

- [ ] **Step 1.4: Commit**

  ```bash
  git add server/application/subscriptions/entitlements.service.ts
  git commit -m "feat: добавить политику programs.roadmap.full (PRO+)"
  ```

---

## Task 2: Shared navigation — тип `program_step`

**Files:**
- Modify: `shared/navigation/index.ts`

- [ ] **Step 2.1: Добавить `program_step` в AppNavigationTargetTypeEnum**

  В `shared/navigation/index.ts`, найти `AppNavigationTargetTypeEnum` (строка ~19).  
  Добавить `'program_step'` в массив перед закрывающим `]`:

  ```ts
  export const AppNavigationTargetTypeEnum = z.enum([
    'home',
    'meditations_list',
    'meditation_collection',
    'meditation_track',
    'breath_practices_list',
    'breath_practice_group',
    'breath_practice',
    'quick_help',
    'quick_help_entry',
    'gratitude_diary',
    'therapy_list',
    'therapy_topic',
    'habits_list',
    'habit',
    'program_step',  // ← добавить
  ]);
  ```

- [ ] **Step 2.2: Добавить DTO для `program_step`**

  После `HabitNavigationTargetDto` (строка ~99), перед `AppNavigationTargetDto`, добавить:

  ```ts
  export const ProgramStepNavigationTargetDto = z.object({
    type: z.literal('program_step'),
    slug: z.string().trim().min(1).max(160),
  });
  ```

- [ ] **Step 2.3: Добавить `ProgramStepNavigationTargetDto` в discriminated union**

  Найти `AppNavigationTargetDto` (строка ~102). Добавить в конец массива:

  ```ts
  export const AppNavigationTargetDto = z.discriminatedUnion('type', [
    HomeNavigationTargetDto,
    MeditationsListNavigationTargetDto,
    MeditationCollectionNavigationTargetDto,
    MeditationTrackNavigationTargetDto,
    BreathPracticesListNavigationTargetDto,
    BreathPracticeGroupNavigationTargetDto,
    BreathPracticeNavigationTargetDto,
    QuickHelpNavigationTargetDto,
    QuickHelpEntryNavigationTargetDto,
    GratitudeDiaryNavigationTargetDto,
    TherapyListNavigationTargetDto,
    TherapyTopicNavigationTargetDto,
    HabitsListNavigationTargetDto,
    HabitNavigationTargetDto,
    ProgramStepNavigationTargetDto,  // ← добавить
  ]);
  ```

- [ ] **Step 2.4: Проверить TypeScript (ожидаем ошибки о non-exhaustive switch — исправим в Task 3)**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | grep "program_step" | head -10
  ```

- [ ] **Step 2.5: Commit**

  ```bash
  git add shared/navigation/index.ts
  git commit -m "feat: добавить тип program_step в AppNavigationTarget"
  ```

---

## Task 3: App lib navigation — маппинг URL

**Files:**
- Modify: `app/lib/navigation.ts`

- [ ] **Step 3.1: Добавить маппинг URL → target в `resolveAppNavigationTargetFromRoute`**

  В `app/lib/navigation.ts`, найти функцию `resolveAppNavigationTargetFromRoute` (строка ~29).  
  Перед финальным `return null;` в конце функции добавить:

  ```ts
  if (
    path.startsWith('/programs/') &&
    /^\/programs\/[^/]+\/steps\/\d+/.test(path)
  ) {
    const slug = readStringParam(route.params.slug);
    if (slug) {
      return { type: 'program_step', slug };
    }
    return null;
  }
  ```

  Итоговый конец функции будет:
  ```ts
    // ... предыдущие ветки
  
    if (
      path.startsWith('/programs/') &&
      /^\/programs\/[^/]+\/steps\/\d+/.test(path)
    ) {
      const slug = readStringParam(route.params.slug);
      if (slug) {
        return { type: 'program_step', slug };
      }
      return null;
    }
  
    return null;
  }
  ```

- [ ] **Step 3.2: Добавить feature key в `resolveNavigationFeatureKey`**

  Найти функцию `resolveNavigationFeatureKey` (строка ~131). Добавить кейс перед `default`:

  ```ts
  export function resolveNavigationFeatureKey(
    target: AppNavigationTarget
  ): string | null {
    switch (target.type) {
      case 'meditations_list':
      case 'meditation_collection':
      case 'meditation_track':
        return 'meditations.library.full';
      case 'gratitude_diary':
        return 'gratitude.diary.full';
      case 'breath_practice': {
        // ... существующий код
      }
      case 'breath_practice_group': {
        // ... существующий код
      }
      case 'therapy_topic':
        return CATALOG_THERAPY_KEYS.has(target.topicKey)
          ? null
          : 'therapy.custom.create';
      case 'habit':
        return CATALOG_HABIT_KEYS.has(target.habitKey)
          ? null
          : 'habits.custom.create';
      case 'program_step':           // ← добавить этот case
        return 'programs.roadmap.full';
      default:
        return null;
    }
  }
  ```

- [ ] **Step 3.3: Добавить fallback route в `buildBlockedNavigationFallbackRoute`**

  Найти функцию `buildBlockedNavigationFallbackRoute` (строка ~179). Добавить кейс перед `default`:

  ```ts
  export function buildBlockedNavigationFallbackRoute(
    target: AppNavigationTarget
  ) {
    switch (target.type) {
      case 'meditations_list':
      case 'meditation_collection':
      case 'meditation_track':
        return { path: '/practices' };
      case 'breath_practice':
      case 'breath_practice_group':
        return { path: '/breath-practices' };
      case 'gratitude_diary':
        return { path: '/practices' };
      case 'therapy_topic':
        return { path: '/therapy' };
      case 'habit':
        return { path: '/habits' };
      case 'program_step':           // ← добавить этот case
        return { path: `/programs/${target.slug}/map` };
      default:
        return { path: '/' };
    }
  }
  ```

- [ ] **Step 3.4: Проверить TypeScript — ошибок не должно быть**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | head -30
  ```
  Ожидаем: нет ошибок.

- [ ] **Step 3.5: Commit**

  ```bash
  git add app/lib/navigation.ts
  git commit -m "feat: добавить route-guard для program_step → programs.roadmap.full"
  ```

---

## Task 4: ProgramStepBottomSheet — prop `locked` и badge

**Files:**
- Modify: `app/components/programs/ProgramStepBottomSheet.vue`

- [ ] **Step 4.1: Обновить props и emit**

  В `<script setup>`, заменить текущие `defineProps` и `defineEmits`:

  ```ts
  const props = defineProps<{
    open: boolean;
    step: ProgramStepDto | null;
    locked?: boolean;
  }>();

  const emit = defineEmits<{
    (event: 'update:open', value: boolean): void;
    (event: 'start', payload: { step: ProgramStepDto; replay: boolean }): void;
    (event: 'paywall'): void;
  }>();
  ```

- [ ] **Step 4.2: Обновить кнопку «Начать»/«Повторить» в template**

  Найти кнопку с `v-if="canStart"` в template. Заменить весь блок:

  ```vue
  <button
    v-if="canStart"
    type="button"
    class="relative inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.98]"
    @click="props.locked ? emit('paywall') : emitStart()"
  >
    <span
      v-if="props.locked"
      class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
      aria-hidden="true"
    >⭐</span>
    {{ primaryLabel }}
  </button>
  ```

- [ ] **Step 4.3: Проверить TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```
  Ожидаем: нет ошибок.

- [ ] **Step 4.4: Commit**

  ```bash
  git add app/components/programs/ProgramStepBottomSheet.vue
  git commit -m "feat: добавить locked prop и paywall badge в ProgramStepBottomSheet"
  ```

---

## Task 5: map.vue — проверка доступа

**Files:**
- Modify: `app/pages/programs/[slug]/map.vue`

- [ ] **Step 5.1: Добавить импорты в `<script setup>`**

  После существующих import-строк (например, после `import { useProgramDailyLimit } ...`) добавить:

  ```ts
  import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
  import { useEntitlements } from '@/app/composables/useEntitlements';
  ```

- [ ] **Step 5.2: Добавить entitlements и paywall state**

  После `const dailyLimit = useProgramDailyLimit();` добавить:

  ```ts
  const { getFeatureAccess } = useEntitlements();
  const paywallOpen = ref(false);
  const roadmapAccess = computed(() => getFeatureAccess('programs.roadmap.full'));
  const hasRoadmapAccess = computed(() => roadmapAccess.value.available);
  ```

- [ ] **Step 5.3: Обновить `openStep` — вставить paywall-проверку**

  Заменить функцию `openStep` целиком:

  ```ts
  function openStep(step: ProgramStepDto) {
    void dailyLimit.refreshIfExpired().catch(() => undefined);
    // available/locked-шаги недоступны.
    if (step.status === 'locked' || step.status === 'available') {
      selectedStep.value = step;
      lockedSheetOpen.value = true;
      return;
    }
    // Для active/completed — всегда открываем sheet; если нет доступа,
    // sheet покажет badge, и клик по «Начать» откроет paywall.
    selectedStep.value = step;
    if (!hasRoadmapAccess.value) {
      sheetOpen.value = true;
      return;
    }
    // Active-шаг при достигнутом лимите — модалка.
    if (step.status === 'active' && dailyLimit.isReachedNow()) {
      limitDialogOpen.value = true;
      return;
    }
    sheetOpen.value = true;
  }
  ```

- [ ] **Step 5.4: Обновить `startStep` — добавить safety-net**

  Заменить функцию `startStep` целиком:

  ```ts
  function startStep(payload: { step: ProgramStepDto; replay: boolean }) {
    if (!hasRoadmapAccess.value) {
      sheetOpen.value = false;
      paywallOpen.value = true;
      return;
    }
    void dailyLimit.refreshIfExpired().catch(() => undefined);
    if (
      !payload.replay &&
      payload.step.status !== 'completed' &&
      dailyLimit.isReachedNow()
    ) {
      sheetOpen.value = false;
      limitDialogOpen.value = true;
      return;
    }
    sheetOpen.value = false;
    void navigateTo({
      path: `/programs/${slug.value}/steps/${payload.step.step}`,
      query: payload.replay ? { replay: '1' } : undefined,
    });
  }
  ```

- [ ] **Step 5.5: Обновить template — `ProgramStepBottomSheet` и `FeaturePaywallModal`**

  Найти `<ProgramStepBottomSheet>` в template и добавить props:

  ```vue
  <ProgramStepBottomSheet
    v-model:open="sheetOpen"
    :step="selectedStep"
    :locked="!hasRoadmapAccess"
    @start="startStep"
    @paywall="paywallOpen = true"
  />
  ```

  После `<DailyLimitInfoDialog>` (или перед закрывающим `</div>`) добавить:

  ```vue
  <FeaturePaywallModal
    v-model:open="paywallOpen"
    feature-key="programs.roadmap.full"
    :required-plan="roadmapAccess.requiredPlan"
    :paywall="roadmapAccess.paywall"
  />
  ```

- [ ] **Step 5.6: Проверить TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```
  Ожидаем: нет ошибок.

- [ ] **Step 5.7: Commit**

  ```bash
  git add "app/pages/programs/[slug]/map.vue"
  git commit -m "feat: paywall-проверка доступа к шагам в map.vue"
  ```

---

## Task 6: HomeRoadmapCard — badge и проверка доступа

**Files:**
- Modify: `app/components/home/HomeRoadmapCard.vue`

- [ ] **Step 6.1: Добавить импорты**

  После существующих import-строк в `<script setup>` добавить:

  ```ts
  import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
  import { useEntitlements } from '@/app/composables/useEntitlements';
  ```

- [ ] **Step 6.2: Добавить entitlements state**

  После `const limitDialogOpen = ref(false);` добавить:

  ```ts
  const { getFeatureAccess } = useEntitlements();
  const paywallOpen = ref(false);
  const roadmapAccess = computed(() => getFeatureAccess('programs.roadmap.full'));
  const hasRoadmapAccess = computed(() => roadmapAccess.value.available);

  function getPlanBadgeEmoji(plan: string): string {
    return plan === 'premium' ? '💎' : '⭐';
  }
  ```

- [ ] **Step 6.3: Обновить `openCurrentStep`**

  Заменить функцию `openCurrentStep` целиком:

  ```ts
  function openCurrentStep() {
    if (!hasRoadmapAccess.value) {
      paywallOpen.value = true;
      return;
    }
    if (hasNextGardenAvailable.value) {
      void navigateTo('/garden');
      return;
    }
    if (!currentStep.value) return;
    if (isDailyLimitReachedNow()) {
      limitDialogOpen.value = true;
      return;
    }
    void navigateTo(
      `/programs/${props.program.slug}/steps/${currentStep.value.step}`
    );
  }
  ```

- [ ] **Step 6.4: Обновить `handleStepClick`**

  Заменить функцию `handleStepClick` целиком:

  ```ts
  function handleStepClick(step: ProgramStepDto) {
    if (!hasRoadmapAccess.value) {
      paywallOpen.value = true;
      return;
    }
    if (step.status === 'active' && isDailyLimitReachedNow()) {
      limitDialogOpen.value = true;
      return;
    }
    if (step.status === 'active') {
      void navigateTo(`/programs/${props.program.slug}/steps/${step.step}`);
      return;
    }
    void navigateTo({
      path: `/programs/${props.program.slug}/map`,
      query: { step: String(step.step) },
    });
  }
  ```

- [ ] **Step 6.5: Обновить template — badge на кнопке «Начать»**

  Найти блок с кнопкой `openCurrentStep` в template (div с `v-else class="mt-4 flex flex-wrap..."`). Заменить кнопку:

  ```vue
  <button
    type="button"
    class="relative inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.98]"
    @click="openCurrentStep"
  >
    <span
      v-if="!hasRoadmapAccess"
      class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
      aria-hidden="true"
    >{{ getPlanBadgeEmoji(roadmapAccess.requiredPlan) }}</span>
    <span>{{ currentCta }}</span>
    <IconArrowRight class="h-4 w-4" />
  </button>
  ```

- [ ] **Step 6.6: Добавить `FeaturePaywallModal` в template**

  Перед закрывающим `</section>` (после `<DailyLimitInfoDialog>`) добавить:

  ```vue
  <FeaturePaywallModal
    v-model:open="paywallOpen"
    feature-key="programs.roadmap.full"
    :required-plan="roadmapAccess.requiredPlan"
    :paywall="roadmapAccess.paywall"
  />
  ```

- [ ] **Step 6.7: Проверить TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 6.8: Commit**

  ```bash
  git add app/components/home/HomeRoadmapCard.vue
  git commit -m "feat: paywall-badge и проверка доступа в HomeRoadmapCard"
  ```

---

## Task 7: GardenAvailableSeeds — prop `locked`

**Files:**
- Modify: `app/components/garden/GardenAvailableSeeds.vue`

- [ ] **Step 7.1: Обновить `defineProps`**

  Заменить текущий `defineProps` на:

  ```ts
  defineProps<{
    seeds: GardenAvailableProgramDto[];
    startingSlug: string | null;
    locked?: boolean;
  }>();
  ```

- [ ] **Step 7.2: Обновить кнопку «Начать» в template**

  Найти кнопку с `@click="emit('start', seed.programSlug)"`. Заменить всю кнопку:

  ```vue
  <button
    type="button"
    class="relative inline-flex min-h-9 items-center justify-center rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    :disabled="startingSlug === seed.programSlug"
    @click="emit('start', seed.programSlug)"
  >
    <span
      v-if="locked"
      class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
      aria-hidden="true"
    >⭐</span>
    <span v-if="startingSlug === seed.programSlug">Стартуем…</span>
    <span v-else>Начать</span>
  </button>
  ```

  > Кнопка по-прежнему эмитит `start` — garden.vue перехватит и покажет paywall.

- [ ] **Step 7.3: Проверить TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 7.4: Commit**

  ```bash
  git add app/components/garden/GardenAvailableSeeds.vue
  git commit -m "feat: prop locked и badge в GardenAvailableSeeds"
  ```

---

## Task 8: GardenActiveCard — prop `locked`

**Files:**
- Modify: `app/components/garden/GardenActiveCard.vue`

- [ ] **Step 8.1: Обновить `defineProps`**

  Текущие props (строка ~87):
  ```ts
  const props = defineProps<{
    plant: GardenPlantItemDto;
  }>();
  ```

  Заменить на:
  ```ts
  const props = defineProps<{
    plant: GardenPlantItemDto;
    locked?: boolean;
  }>();
  ```

- [ ] **Step 8.2: Обновить кнопку «Отчёт» в template**

  Найти кнопку с `v-if="readyReportsCount > 0"` и `@click="emit('open-reports')"`. Добавить badge:

  ```vue
  <button
    v-if="readyReportsCount > 0"
    type="button"
    class="relative mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left transition hover:bg-white/[0.07] active:scale-[0.99]"
    @click="emit('open-reports')"
  >
    <span
      v-if="props.locked"
      class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
      aria-hidden="true"
    >⭐</span>
    <div class="flex items-center gap-2.5">
      <span
        class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-200"
      >
        <IconScroll class="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p class="text-[13px] font-semibold text-foreground">
          {{ reportsLabel }}
        </p>
        <p class="text-[11px] text-foreground/55">
          Свежий итог по пройденному отрезку
        </p>
      </div>
    </div>
    <IconArrowRight class="h-4 w-4 text-foreground/55" aria-hidden="true" />
  </button>
  ```

  > Кнопка по-прежнему эмитит `open-reports` — garden.vue перехватит и покажет paywall.

- [ ] **Step 8.3: Проверить TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 8.4: Commit**

  ```bash
  git add app/components/garden/GardenActiveCard.vue
  git commit -m "feat: prop locked и badge на кнопке отчётов в GardenActiveCard"
  ```

---

## Task 9: GardenCompletedCollection — prop `locked`

**Files:**
- Modify: `app/components/garden/GardenCompletedCollection.vue`

- [ ] **Step 9.1: Обновить `defineProps`**

  Текущий `defineProps` (строка ~48):
  ```ts
  defineProps<{
    plants: GardenPlantItemDto[];
  }>();
  ```

  Заменить на:
  ```ts
  defineProps<{
    plants: GardenPlantItemDto[];
    locked?: boolean;
  }>();
  ```

- [ ] **Step 9.2: Обновить кнопки карточек завершённых садов в template**

  Найти кнопку с `@click="emit('select', plant)"`. Заменить всю кнопку:

  ```vue
  <button
    type="button"
    class="relative w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
    :aria-label="`Открыть карточку растения «${plant.title}»`"
    @click="emit('select', plant)"
  >
    <span
      v-if="locked"
      class="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
      aria-hidden="true"
    >⭐</span>
    <div class="flex items-center gap-2.5">
      <img
        :src="getPlantImageSrcSafe(plant.stateIndex, plant.plantSetSlug)"
        :alt="plant.title"
        class="h-10 w-10 shrink-0 rounded-2xl object-contain"
        loading="lazy"
        decoding="async"
        @error="onPlantImageError"
      />
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-foreground">
          {{ plant.title }}
        </p>
        <p
          v-if="plant.completedAt"
          class="truncate text-[11px] text-foreground/55"
        >
          {{ formatDate(plant.completedAt) }}
        </p>
      </div>
    </div>
  </button>
  ```

  > Badge позиционируем `right-2 top-2` (внутри карточки), а не `-right-1 -top-1` (за её пределами) — карточки в grid, соседние элементы перекроют выступающий badge.

- [ ] **Step 9.3: Проверить TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 9.4: Commit**

  ```bash
  git add app/components/garden/GardenCompletedCollection.vue
  git commit -m "feat: prop locked и badge на карточках в GardenCompletedCollection"
  ```

---

## Task 10: garden.vue — paywall checks и передача `locked`

**Files:**
- Modify: `app/pages/garden.vue`

- [ ] **Step 10.1: Добавить импорты**

  После существующих import-строк добавить:

  ```ts
  import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
  import { useEntitlements } from '@/app/composables/useEntitlements';
  ```

- [ ] **Step 10.2: Добавить entitlements state**

  После `const startingSlug = ref<string | null>(null);` добавить:

  ```ts
  const { getFeatureAccess } = useEntitlements();
  const paywallOpen = ref(false);
  const roadmapAccess = computed(() => getFeatureAccess('programs.roadmap.full'));
  const hasRoadmapAccess = computed(() => roadmapAccess.value.available);
  ```

- [ ] **Step 10.3: Обновить `openLore`**

  Заменить функцию `openLore` целиком:

  ```ts
  function openLore(plant: GardenPlantItemDto) {
    if (!hasRoadmapAccess.value) {
      paywallOpen.value = true;
      return;
    }
    selectedLorePlant.value = plant;
    loreOpen.value = true;
  }
  ```

- [ ] **Step 10.4: Обновить `onOpenActiveReports`**

  Заменить функцию `onOpenActiveReports` целиком:

  ```ts
  function onOpenActiveReports() {
    if (!hasRoadmapAccess.value) {
      paywallOpen.value = true;
      return;
    }
    const active = garden.activePlant.value;
    if (!active) return;
    selectedLorePlant.value = active;
    loreOpen.value = true;
  }
  ```

- [ ] **Step 10.5: Обновить `handleStartProgram`**

  Заменить функцию `handleStartProgram` целиком:

  ```ts
  function handleStartProgram(programSlug: string) {
    if (!hasRoadmapAccess.value) {
      paywallOpen.value = true;
      return;
    }
    if (startingSlug.value) return;
    const seed = garden.availableSeeds.value.find(
      (s) => s.programSlug === programSlug
    );
    if (!seed) {
      useToast('Сад не найден', 'Попробуй обновить страницу.', 'warning');
      return;
    }
    handoffNextProgram.value = seed;
    handoffPreviousPlant.value = garden.completedPlants.value[0] ?? null;
    handoffOpen.value = true;
  }
  ```

- [ ] **Step 10.6: Обновить template — передать `locked` дочерним компонентам**

  Найти `<GardenActiveCard>` и добавить prop:
  ```vue
  <GardenActiveCard
    v-if="garden.activePlant.value"
    :plant="garden.activePlant.value"
    :locked="!hasRoadmapAccess"
    @open-reports="onOpenActiveReports"
  />
  ```

  Найти `<GardenCompletedCollection>` и добавить prop:
  ```vue
  <GardenCompletedCollection
    :plants="garden.completedPlants.value"
    :locked="!hasRoadmapAccess"
    @select="openLore"
  />
  ```

  Найти `<GardenAvailableSeeds>` и добавить prop:
  ```vue
  <GardenAvailableSeeds
    :seeds="garden.availableSeeds.value"
    :starting-slug="startingSlug"
    :locked="!hasRoadmapAccess"
    @start="handleStartProgram"
  />
  ```

- [ ] **Step 10.7: Добавить `FeaturePaywallModal` в template**

  После `<GardenPlantReportSheet ... />` в template добавить:

  ```vue
  <FeaturePaywallModal
    v-model:open="paywallOpen"
    feature-key="programs.roadmap.full"
    :required-plan="roadmapAccess.requiredPlan"
    :paywall="roadmapAccess.paywall"
  />
  ```

- [ ] **Step 10.8: Проверить TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | head -30
  ```
  Ожидаем: нет ошибок.

- [ ] **Step 10.9: Запустить все тесты**

  ```bash
  pnpm test --run 2>&1 | tail -20
  ```

- [ ] **Step 10.10: Commit**

  ```bash
  git add app/pages/garden.vue
  git commit -m "feat: paywall-проверки и locked props в garden.vue"
  ```

---

## Task 11: Финальная проверка

- [ ] **Step 11.1: TypeScript — весь проект**

  ```bash
  pnpm exec tsc --noEmit 2>&1
  ```
  Ожидаем: нет новых ошибок.

- [ ] **Step 11.2: Lint**

  ```bash
  pnpm lint 2>&1 | tail -20
  ```
  Ожидаем: нет ошибок.

- [ ] **Step 11.3: Все тесты**

  ```bash
  pnpm test --run 2>&1 | tail -20
  ```

- [ ] **Step 11.4: Ручная проверка — для пользователя без подписки (basic plan)**

  Запустить dev-сервер:
  ```bash
  pnpm dev
  ```

  Сценарии проверки:
  1. **Главная страница** → блок HomeRoadmapCard → кнопка «Начать»/«Повторить» должна иметь ⭐ badge. Клик → paywall модалка.
  2. **Карта пути** `/programs/[slug]/map` → открывается без paywall. Тап на active-шаг → bottom sheet открывается, кнопка «Начать» с ⭐. Клик → paywall.
  3. **Прямой URL** `/programs/[slug]/steps/1` → редиректит на `/programs/[slug]/map` + показывает paywall модалку.
  4. **Оранжерея** `/garden`:
     - «Начать» в GardenAvailableSeeds → ⭐ badge, клик → paywall.
     - Кнопка «Отчёт» в GardenActiveCard (если есть) → ⭐ badge, клик → paywall.
     - Карточки завершённых садов → ⭐ в углу, тап → paywall.
  5. **Для пользователя с PRO**: всё работает как обычно, ни одного paywall, без badge.

- [ ] **Step 11.5: Финальный коммит спека и плана**

  ```bash
  git add docs/superpowers/specs/2026-05-29-roadmap-paywall-design.md
  git add docs/superpowers/plans/2026-05-29-roadmap-paywall.md
  git commit -m "docs: спек и план реализации paywall для Roadmap"
  ```
