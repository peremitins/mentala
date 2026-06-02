# Удаление публичного Basic и full paywall

**Статус:** реализуется как production-совместимое изменение без удаления legacy `basic` из контрактов.

## Продуктовое правило

Публичная тарифная модель Mentala состоит из двух платных тарифов:

- `pro`
- `premium`

После 7-дневного trial пользователь без оплаты:

- не видит Basic как тариф на landing, `/subscription`, checkout и pricing surfaces;
- может открыть витрины практик, но запуск платных действий открывает `FeaturePaywallModal`;
- может настраивать и получать template push-уведомления;
- не может включить AI-уведомления (`notifications.text_source_ai`) без PRO/Premium;
- не может использовать custom AI prompt (`notifications.custom_prompt_ai`) без Premium.

Template push-уведомления остаются бесплатным retention-механизмом, потому что не создают AI-cost.

## Compatibility

`basic` остаётся внутренним `legacy/no-paid-access` состоянием:

- не удаляется из `subscription_plans`;
- не удаляется из `user_subscriptions.planId`;
- остаётся в DTO union `basic | pro | premium`;
- может возвращаться старым mobile/web клиентам в `GET /api/subscriptions/current` и `GET /api/user/me`;
- используется для rollback/grace/trial billing совместимости.

Полное удаление `basic` из контрактов возможно только отдельной cleanup-задачей после mobile rollout и повышения `minimumSupportedBuild`.

## Runtime правила доступа

- `GET /api/subscriptions/plans` возвращает только `pro` и `premium`.
- `POST /api/subscriptions/start-checkout` отклоняет `planId=basic`.
- `getFeatureAccessOrDefault()` и frontend `DEFAULT_ACCESS` больше не открывают неизвестный feature key бесплатно: неизвестный ключ считается PRO-level locked.
- `quick_help.practice` закрывает быстрые практики после trial.
- `breath.catalog.full` закрывает все built-in дыхательные практики после trial; старые исключения `4-7-8` и `box-breathing` удалены.
- `programs.roadmap.full` проверяется не только в UI, но и server-side в Roadmap action endpoints.
- Template notification preferences, scheduler и delivery не требуют paid plan.

## Публичные интерфейсы

- `GET /api/subscriptions/plans`
  - response shape прежний;
  - список планов: только `pro`, `premium`.
- `GET /api/subscriptions/current`
  - `plan`, `planId`, `currentEntitlementsPlan` сохраняют union `basic | pro | premium`.
- `GET /api/user/me`
  - `billing.requiredPlan` и `billing.planId` сохраняют union `basic | pro | premium`.
- Feature keys:
  - `quick_help.practice` — PRO;
  - `programs.roadmap.full` — PRO;
  - `notifications.text_source_ai` — PRO;
  - `notifications.custom_prompt_ai` — Premium.

## Verification

Минимальная проверка для этого изменения:

- `pnpm exec vitest run tests/remove-basic-plan-access.test.ts`
- `pnpm exec vitest run tests/subscription-usage-reset.test.ts tests/promo.shared.test.ts`
- `pnpm lint`
- `pnpm build`
- `pnpm landing:build`

После изменения docs нужно выполнить `pnpm wiki:sync-docs`.
