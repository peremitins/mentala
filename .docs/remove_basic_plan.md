# Удаление Basic и Full Paywall Implementation Plan

> Целевой файл: `.docs/remove-basic-plan-and-full-paywall.md`

**Goal:** убрать Basic из публичного продукта, оставить только Pro/Premium, но сохранить бесплатные шаблонные push-уведомления для retention.

**Architecture:** `basic` остаётся внутренним legacy/no-paid-access состоянием для обратной совместимости API, FK и старых mobile-клиентов. В UI, landing и checkout Basic исчезает полностью. Все бесплатные практики закрываются paywall, кроме шаблонных уведомлений.

**Tech Stack:** Nuxt 4, Vue 3, Pinia, Nitro API, Drizzle, Zod DTO, Tailwind, shadcn-vue.

---

## 1. Продуктовое Решение

После 7-дневного trial без оплаты пользователь:

- не видит Basic как тариф;
- не может запускать быстрые/дыхательные/медитационные/AI/садовые/дневниковые функции;
- может получать и настраивать push-уведомления, но только из готовых шаблонов;
- не может включать AI-генерацию уведомлений и Premium custom prompt.

Важно: шаблонные уведомления остаются бесплатным retention-механизмом, потому что не создают AI-cost.

## 2. Текущие Бесплатные Поверхности

Сейчас Basic даёт бесплатный доступ к:

- `/quick-help`: 5-4-3-2-1, box breathing, снятие напряжения, выгрузка мыслей.
- `/breath-practices`: `4-7-8` и `box-breathing` через `BASIC_FREE_SLUGS`.
- Шаблонным notification preferences и доставке push-уведомлений.
- Catalog habits/therapy страницам и стандартным карточкам.
- Техническому default-open поведению:
  - frontend `DEFAULT_ACCESS`;
  - backend `getFeatureAccessOrDefault()`.

После изменения бесплатными остаются только template notifications.

## 3. Backend Changes

- В `server/infrastructure/db/seed-subscription-plans.ts` скрыть или не сидировать Basic как публичный тариф; `pro` и `premium` остаются видимыми.
- В `server/api/subscriptions/plans.get.ts` явно отдавать только `pro` и `premium`.
- В checkout/start-change flow запретить выбор `basic` как target plan.
- В DTO временно оставить `basic | pro | premium`, чтобы не сломать старые клиенты.
- В entitlements:
  - убрать free fallback для неизвестных feature keys;
  - оставить `basic` как no-paid-access state;
  - trial продолжает давать Premium-level доступ.
- Добавить policies:
  - `quick_help.practice` или granular keys для быстрых практик, `requiredPlan: pro`;
  - не добавлять paywall на `notifications.settings.manage`, если речь о шаблонных уведомлениях;
  - оставить `notifications.text_source_ai` = Pro;
  - оставить `notifications.custom_prompt_ai` = Premium.
- Notification backend:
  - `PUT /api/notifications/prefs/:kind` должен разрешать сохранение template-настроек без подписки;
  - при отсутствии доступа к AI принудительно нормализовать `textSource` в `templates`;
  - scheduler/delivery должны отправлять шаблонные уведомления без подписки;
  - AI text generation jobs не должны создаваться без `notifications.text_source_ai`.

## 4. Frontend And Landing Changes

- `/subscription`:
  - убрать Basic card;
  - сетка тарифов: 2 карточки;
  - состояние без оплаты показывать как “нет активной подписки”;
  - trial показывать как “Пробный Premium-доступ до даты”.
- `PlanCard.vue`:
  - удалить Basic-ветки;
  - в Pro убрать “Всё из Basic”;
  - Premium оставить “Всё из Pro”.
- `/breath-practices`:
  - удалить `BASIC_FREE_SLUGS`;
  - все built-in практики без Pro/Premium показывать с `⭐`;
  - по клику открывать `FeaturePaywallModal`.
- `/quick-help`:
  - карточки практик остаются видимыми;
  - без подписки показывают `⭐`;
  - клик открывает paywall, не запускает практику.
- `/quick-help/thought-dump`:
  - прямой route без подписки должен открывать paywall и возвращать на `/quick-help`.
- Notifications UI:
  - настройки шаблонных уведомлений остаются доступными;
  - `✨ ИИ` option остаётся paywalled;
  - custom prompt остаётся paywalled Premium;
  - при потере доступа UI показывает `templates`.
- Landing:
  - `apps/landing/pages/index.vue`: `PricingPlan.id` только `pro | premium`;
  - удалить Basic pricing card;
  - обновить RU/EN pricing copy;
  - убрать все обещания бесплатного базового функционала;
  - написать: “7 дней Premium-доступа, дальше Pro или Premium”.

## 5. Compatibility And Migration

- Не удалять `basic` из DB schema, FK, DTO и старых API-ответов в этой итерации.
- Не удалять существующие `user_subscriptions.planId = basic`.
- Не ломать старые mobile builds: старый клиент может продолжать получить `plan: basic`.
- Полное удаление `basic` из контрактов возможно отдельной cleanup-задачей после mobile rollout и повышения `minimumSupportedBuild`.
- Если меняется `.docs/*`, выполнить `pnpm wiki:sync-docs` и точечно обновить релевантные wiki-страницы.

## 6. Test Plan

- Entitlements:
  - expired trial + no paid subscription не имеет доступа к quick help, breath, meditations, gratitude, chat, programs;
  - active trial имеет Premium-level доступ;
  - template notifications доступны без подписки;
  - AI notifications недоступны без Pro/Premium.
- API:
  - `GET /api/subscriptions/plans` возвращает только `pro`, `premium`;
  - checkout с `basic` возвращает ошибку;
  - notification prefs с `textSource=ai` без подписки сохраняются/нормализуются как `templates`.
- UI:
  - `/subscription` не показывает Basic;
  - `/quick-help` и `/breath-practices` показывают badges и paywall;
  - notification settings позволяют templates без оплаты.
- Landing:
  - pricing содержит только Pro/Premium в RU и EN.
- Verification:
  - `pnpm test`;
  - `pnpm lint`;
  - `pnpm build`;
  - `pnpm landing:build` или `pnpm landing:generate`.

## 7. Assumptions

- Все ранее бесплатные практики становятся Pro-level.
- Шаблонные push-уведомления остаются бесплатными намеренно.
- AI-уведомления остаются Pro/Premium-only.
- Premium-only различия не меняются.
- `basic` в первой итерации скрывается, но не удаляется физически из контрактов.
