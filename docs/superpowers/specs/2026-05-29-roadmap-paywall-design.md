# Paywall для Roadmap/Programs — Дизайн

**Дата:** 2026-05-29  
**Фича-ключ:** `programs.roadmap.full`  
**Тариф:** PRO (requiredPlan: `pro`) + Premium  
**Trial:** разблокировано (`trialUnlocked: true`)

---

## Требования

### Разрешено (без подписки)
- Просмотр `/programs` — список всех садов пользователя
- Просмотр `/programs/[slug]/map` — карта пути со статусами шагов
- Просмотр `/garden` — Оранжерея: активный сад, завершённые, доступные семена

### Заблокировано (badge ⭐ + paywall при клике)
- Запуск или повтор любого шага программы
- Старт новой программы (кнопка «Начать» в `GardenAvailableSeeds`)
- Просмотр отчётов активного сада (кнопка «Отчёт» в `GardenActiveCard`)
- Просмотр отчётов завершённых садов (тап на карточку в `GardenCompletedCollection`)
- Прямой переход по URL `/programs/[slug]/steps/[step]` (роут-гард → редирект на map + paywall)

---

## Архитектура

### UX-паттерн (соответствует существующей системе)
1. Вычисляем: `const access = getFeatureAccess('programs.roadmap.full')`
2. На заблокированных кнопках: badge `getPlanBadgeEmoji(access.requiredPlan)` (⭐ для PRO)
3. При клике на заблокированный элемент: `navigationStore.openPaywall('programs.roadmap.full')`
4. `GlobalNavigationPaywall.vue` (уже в layout) показывает `FeaturePaywallModal`

### Роут-гард
Используем существующий `feature-access.global.ts` middleware.  
Добавляем тип `program_step` в `shared/navigation/index.ts` и маппинг в `app/lib/navigation.ts`.  
Fallback при блокировке: `/programs/[slug]/map` (map доступна, только шаги нет).

---

## Изменяемые файлы (10)

### Бэкенд
1. `server/application/subscriptions/entitlements.service.ts`  
   Добавить в `DEFAULT_FEATURE_ACCESS_POLICIES`:
   ```ts
   {
     featureKey: 'programs.roadmap.full',
     requiredPlan: 'pro',
     trialUnlocked: true,
     lockIcon: 'pro',
     paywallTitle: 'Программы и сады доступны в PRO и Premium',
     paywallDescription: 'Подключи PRO или Premium, чтобы проходить шаги программ и растить сады.',
     paywallCtaText: 'Выбрать тариф',
     paywallTargetPlan: 'pro',
   }
   ```

### Shared navigation (для роут-гарда)
2. `shared/navigation/index.ts`  
   Добавить `'program_step'` в `AppNavigationTargetTypeEnum` и новый `ProgramStepNavigationTargetDto` в дискриминированный union.

3. `app/lib/navigation.ts`  
   - `resolveAppNavigationTargetFromRoute`: добавить case для `/programs/[slug]/steps/[step]` → `{ type: 'program_step', slug }`  
   - `resolveNavigationFeatureKey`: добавить case `program_step` → `'programs.roadmap.full'`  
   - `buildBlockedNavigationFallbackRoute`: добавить case `program_step` → `{ path: '/programs/${slug}/map' }`

### Компоненты
4. `app/components/programs/ProgramStepBottomSheet.vue`  
   Prop `locked?: boolean`. При `locked && canStart`: badge ⭐ на кнопке + emit `'paywall'` вместо `'start'`.

5. `app/pages/programs/[slug]/map.vue`  
   - `openStep()`: до показа bottom sheet для active/completed — проверить access. Нет access → `openPaywall()`.  
   - `startStep()`: дублирующая проверка (safety net).  
   - Передавать `:locked="!hasRoadmapAccess"` в `ProgramStepBottomSheet`.  
   - Слушать `@paywall="openPaywall('programs.roadmap.full')"` от sheet.

6. `app/components/home/HomeRoadmapCard.vue`  
   - `openCurrentStep()` и `handleStepClick()`: проверка access → `openPaywall()`.  
   - Badge ⭐ на кнопке «Начать»/«Повторить» и на мини-кнопках шагов при `!hasRoadmapAccess`.

7. `app/components/garden/GardenAvailableSeeds.vue`  
   Prop `locked?: boolean`. При `locked`: badge ⭐ на каждой кнопке «Начать».

8. `app/components/garden/GardenActiveCard.vue`  
   Prop `locked?: boolean`. При `locked`: badge ⭐ на кнопке «Отчёт».

9. `app/components/garden/GardenCompletedCollection.vue`  
   Prop `locked?: boolean`. При `locked`: badge ⭐ на каждой карточке.

10. `app/pages/garden.vue`  
    - Вычислить `hasRoadmapAccess = getFeatureAccess('programs.roadmap.full').available`  
    - `handleStartProgram()`: нет access → `openPaywall()`  
    - `onOpenActiveReports()`: нет access → `openPaywall()`  
    - `openLore()`: нет access → `openPaywall()`  
    - Передавать `:locked="!hasRoadmapAccess"` в `GardenAvailableSeeds`, `GardenActiveCard`, `GardenCompletedCollection`

---

## Обратная совместимость

- Добавление нового типа `program_step` в zod-union не ломает существующий код (switch-case имеют `default`).
- `DEFAULT_FEATURE_ACCESS_POLICIES` — additive change, не трогает существующие ключи.
- Новые props в child-компонентах — все optional, существующий код не ломается.
- Если бэкенд ещё не вернул фича-ключ (старый клиент) — `DEFAULT_ACCESS.available = true`, paywall не показывается.
