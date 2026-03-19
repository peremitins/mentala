# Implementation Plan: Единый navigation layer

Версия: 1.0  
Дата: 2026-03-16  
Статус: draft  
Основание: `.docs/unified_navigation_tz.md`

## 1. Цель implementation plan

Этот документ переводит `.docs/unified_navigation_tz.md` в практический план внедрения:

- по этапам;
- по модулям;
- по файлам;
- по порядку интеграции;
- по тестам и рискам.

Документ не описывает финальную реализацию в коде построчно. Его задача — зафиксировать безопасный порядок внедрения без big bang rewrite.

## 2. Общая стратегия внедрения

### 2.1. Принцип rollout

Внедрение должно идти не одним большим рефакторингом, а по совместимым этапам.

Обязательные правила rollout:

- сначала ввести канонические типы и registry;
- затем ввести deterministic resolver;
- затем подключать отдельные surface-ы по одному;
- legacy transport поля сохранять на переходный период;
- не удалять старые `deepLink` / `data.action` / legacy chip actions до завершения миграции всех потребителей.

### 2.2. Приоритет внедрения

Порядок внедрения:

1. shared contracts и registry;
2. server-side deterministic resolver;
3. chat navigation;
4. client-side navigation executor + paywall flow;
5. push integration;
6. analytics;
7. cleanup legacy adapters.

### 2.3. Архитектурный принцип

Ключевое разделение ответственности:

- extraction — server-side;
- resolution — server-side;
- execution — client-side;
- paywall gating — deterministic layer;
- transport compatibility — adapter-слой.

## 3. Целевое распределение по слоям

### 3.1. Shared layer

Назначение:

- типы `AppNavigationTarget`, `NavigationIntentExtraction`, `AppNavigationRequest`;
- тип `NavigationResolutionOutcome`;
- registry разрешённых target-ов;
- aliases и normalization metadata;
- route-builder контракты;
- DTO для analytics payload.

### 3.2. Server layer

Назначение:

- deterministic pre-parse;
- optional LLM extraction;
- resolver по whitelist registry;
- shortlist selection и ordering;
- paywall/access validation;
- fallback chain;
- сборка structured navigation payload для chat/push.

### 3.3. Client layer

Назначение:

- execution финального target-а;
- route resolution;
- presentation mapping для shortlist / CTA;
- UI paywall orchestration;
- analytics dispatch;
- adapter-слой для push и action-chip.

## 4. Предлагаемые новые модули

### 4.1. Shared

Новые файлы:

- `shared/navigation/types.ts`
- `shared/navigation/intent.ts`
- `shared/navigation/registry.ts`
- `shared/navigation/aliases.ts`
- `shared/navigation/routes.ts`
- `shared/navigation/analytics.ts`
- `shared/navigation/index.ts`

### 4.2. Server

Новые файлы:

- `server/application/navigation/navigation-preparse.service.ts`
- `server/application/navigation/navigation-intent-extraction.service.ts`
- `server/application/navigation/navigation-resolver.service.ts`
- `server/application/navigation/navigation-paywall.service.ts`
- `server/application/navigation/navigation-fallback.service.ts`
- `server/application/navigation/navigation-analytics.service.ts`
- `server/application/navigation/navigation-targets-from-context.service.ts`

### 4.3. Client

Новые файлы:

- `app/services/navigation/navigation-route-resolver.ts`
- `app/services/navigation/navigation-executor.ts`
- `app/services/navigation/navigation-analytics.ts`
- `app/composables/useAppNavigation.ts`
- `app/stores/navigation.ts`

Примечание:

- названия файлов можно уточнить на этапе реализации;
- важно сохранить единый navigation namespace, а не разносить логику по случайным helper-файлам.

## 5. Existing files, которые почти точно будут изменяться

### 5.1. Shared / DTO

- `shared/dto/index.ts`
- `shared/dto/notifications.ts`
- `shared/dto/meditations.ts`

### 5.2. Chat

- `server/application/suggested-chips.service.ts`
- `server/application/prompts/index.ts`
- `server/interface/api/chat.post.ts`
- `server/api/chat/stream.post.ts`
- `app/components/chat/SuggestedChips.vue`
- `app/pages/index.vue`
- `app/stores/chat.ts`

### 5.3. Push / notifications

- `server/application/notifications/global-orchestration.service.ts`
- `server/application/notifications/breath-navigation.utils.ts`
- `server/application/notifications/delivery.service.ts`
- `app/plugins/push-notifications.client.ts`

### 5.4. Internal recommendations

- `app/lib/meditations.ts`
- `app/lib/practiceActions.ts`
- `app/pages/habits/[id]/index.vue`
- `app/pages/therapy/[key]/index.vue`

### 5.5. Access / paywall

- `app/middleware/feature-access.global.ts`
- `app/composables/useEntitlements.ts`
- `app/components/subscription/FeaturePaywallModal.vue`

## 6. Этап 0. Design freeze и инвентаризация

### 6.1. Цель

Перед началом кода зафиксировать перечень реальных destination-ов и их stable keys.

### 6.2. Что сделать

- подтвердить финальный список target type для v1;
- подтвердить stable keys для:
  - meditation collections;
  - meditation tracks;
  - breath groups;
  - breath practices;
  - quick-help practices;
  - therapy topics;
  - habits;
- подтвердить, какие target-ы бесплатные, а какие gated;
- подтвердить fallback chain для каждого type;
- подтвердить семантическую границу между `paywall` и `blocked`;
- подтвердить whitelist ключей для `sourceMeta`;
- подтвердить правила `source` vs `entryPoint`;
- подтвердить, где и как строится presentation mapping для shortlist;
- подтвердить rollout-политику по legacy fields.

### 6.3. Артефакт

Результат этапа:

- frozen version `.docs/unified_navigation_tz.md`;
- frozen version этого implementation plan;
- список stable target keys без серых зон.

## 7. Этап 1. Shared contracts и registry

### 7.1. Цель

Ввести канонический navigation contract без интеграции в runtime surface-ы.

### 7.2. Новые файлы

- `shared/navigation/types.ts`
- `shared/navigation/intent.ts`
- `shared/navigation/registry.ts`
- `shared/navigation/aliases.ts`
- `shared/navigation/routes.ts`
- `shared/navigation/index.ts`

### 7.3. Изменяемые файлы

- `shared/dto/index.ts`
- `shared/dto/notifications.ts`

### 7.4. Что реализовать

- тип `AppNavigationTarget`;
- тип `NavigationIntentExtraction`;
- тип `AppNavigationRequest`;
- тип `NavigationResolutionOutcome`;
- тип `AppNavigationResult`;
- registry разрешённых target-ов;
- aliases / normalization metadata;
- чистую функцию `target -> route descriptor`;
- DTO для analytics event payload.

### 7.5. Важное решение для миграции

На этом этапе не ломать существующие `SuggestedChip` и push payload.

Рекомендуемый путь:

- добавить новый optional `target` рядом с legacy `action/params`;
- добавить новый optional `navigationTarget` или эквивалент в notification payload;
- legacy поля оставить рабочими до конца миграции.

### 7.6. Acceptance criteria

- shared navigation типы компилируются независимо от app/server;
- registry покрывает все target-ы из scope v1;
- функция route-building не зависит от UI;
- можно написать unit tests без поднятия Nuxt runtime.

### 7.7. Тесты

Новые тесты:

- `tests/navigation-types.dto.test.ts`
- `tests/navigation-registry.test.ts`
- `tests/navigation-routes.test.ts`

## 8. Этап 2. Server-side deterministic resolver

### 8.1. Цель

Построить финальный brain navigation flow в коде, а не в UI и не в prompt.

### 8.2. Новые файлы

- `server/application/navigation/navigation-preparse.service.ts`
- `server/application/navigation/navigation-resolver.service.ts`
- `server/application/navigation/navigation-paywall.service.ts`
- `server/application/navigation/navigation-fallback.service.ts`
- `server/application/navigation/navigation-targets-from-context.service.ts`

### 8.3. Что реализовать

- deterministic pre-parse:
  - regex;
  - alias lookup;
  - dictionary match;
  - normalized token match;
- resolution `NavigationIntentExtraction -> AppNavigationTarget`;
- resolution `context -> recommended targets`;
- fallback chain;
- access/paywall gating на deterministic слое.

### 8.4. Что не делать на этом этапе

- не вызывать LLM;
- не интегрировать yet в chat и push;
- не трогать клиентскую навигацию.

### 8.5. Используемые существующие данные

Resolver должен переиспользовать текущие каталоги и маппинги, а не дублировать их:

- `app/lib/meditations.ts`
- `app/lib/breathPracticesCatalog.ts`
- `app/lib/practiceActions.ts`
- `app/lib/habitsCatalog.ts`
- `app/lib/therapyCatalog.ts`
- `server/infrastructure/db/seed-meditations.ts` при необходимости сверки stable ids

### 8.6. Acceptance criteria

- resolver может принять extraction result и вернуть:
  - final target;
  - paywall result;
  - fallback result;
  - none/not_found;
- deterministic pre-parse закрывает простые кейсы без LLM;
- paywall и fallback не зависят от chat UI.

### 8.7. Тесты

Новые тесты:

- `tests/navigation-preparse.service.test.ts`
- `tests/navigation-resolver.service.test.ts`
- `tests/navigation-paywall.service.test.ts`
- `tests/navigation-fallback.service.test.ts`

## 9. Этап 3. LLM extraction для chat navigation

### 9.1. Цель

Добавить LLM-assisted слой только для свободного текста пользователя, не превращая модель в routing truth.

### 9.2. Новые файлы

- `server/application/navigation/navigation-intent-extraction.service.ts`

### 9.3. Изменяемые файлы

- `server/application/prompts/index.ts`
- `server/application/suggested-chips.service.ts`
- `server/interface/api/chat.post.ts`
- `server/api/chat/stream.post.ts`
- `shared/dto/index.ts`

### 9.4. Что реализовать

- короткий navigation extraction prompt;
- строгую JSON schema для extraction result;
- pipeline:
  - сначала deterministic pre-parse;
  - если не сработало — короткий LLM extraction;
  - затем resolver;
- ограничение до 3 action-chip;
- генерацию chip/CTA через final target, а не через raw route.

### 9.5. Обязательные guardrails

- не передавать в LLM полный registry;
- не передавать полный routing map;
- не передавать paywall/fallback rules;
- при необходимости передавать только shortlist candidate-ов;
- при низкой уверенности возвращать `none` или shortlist.

### 9.6. Важное решение совместимости

Для минимального риска рекомендуется временно поддерживать оба формата чипов:

- legacy `action/params`;
- новый `target`.

UI вначале может читать новый `target`, а при его отсутствии продолжать работать через legacy action.

### 9.7. Acceptance criteria

- LLM вызывается только в intent-based сценариях;
- navigation prompt остаётся коротким;
- final target всегда выбирает resolver;
- chat не делает автопереход;
- один ответ чата отдаёт до 3 action-chip.

### 9.8. Тесты

Новые тесты:

- `tests/navigation-intent-extraction.service.test.ts`
- `tests/suggested-chips-navigation.test.ts`

## 10. Этап 4. Client-side navigation executor

### 10.1. Цель

Сделать один клиентский executor, через который идут переходы из chat, push и внутренних CTA.

### 10.2. Новые файлы

- `app/services/navigation/navigation-route-resolver.ts`
- `app/services/navigation/navigation-executor.ts`
- `app/services/navigation/navigation-analytics.ts`
- `app/composables/useAppNavigation.ts`
- `app/stores/navigation.ts`

### 10.3. Что реализовать

- приём `AppNavigationRequest` или `AppNavigationTarget`;
- route execution;
- pre-navigation access check;
- paywall open logic;
- analytics dispatch;
- unified result contract для UI.

### 10.4. Зачем нужен `app/stores/navigation.ts`

Store нужен, чтобы не размазывать cross-surface состояние:

- pending target;
- blocked target;
- paywall context;
- last navigation result;
- dedup / retry metadata для client-side flow.

### 10.5. Изменяемые файлы

- `app/pages/index.vue`
- `app/components/chat/SuggestedChips.vue`
- `app/stores/chat.ts`
- `app/pages/habits/[id]/index.vue`
- `app/pages/therapy/[key]/index.vue`

### 10.6. Acceptance criteria

- chat, therapy и habits page больше не делают прямой business-level `navigateTo` в обход executor-а;
- paywall можно открыть без редиректа на `/`;
- UI может получить structured result: `opened`, `paywall`, `fallback`, `blocked`, `error`.

### 10.7. Тесты

Новые тесты:

- `tests/navigation-route-resolver.test.ts`
- `tests/navigation-executor.test.ts`

## 11. Этап 5. Paywall flow и прямой route-entry

### 11.1. Цель

Убрать текущую стратегию “молча увести на `/`”.

### 11.2. Изменяемые файлы

- `app/middleware/feature-access.global.ts`
- `app/composables/useEntitlements.ts`
- `app/components/subscription/FeaturePaywallModal.vue`
- `app/stores/navigation.ts`

### 11.3. Что реализовать

- новый blocked-target flow;
- сохранение `target`, `source`, `requiredPlan`;
- paywall поверх текущего контекста там, где это возможно;
- controlled fallback для прямого входа по URL.

### 11.4. Практический rollout

Рекомендуется разделить на два подэтапа:

#### 5A. Programmatic navigation

Сначала перевести все программные переходы на executor + paywall modal.

#### 5B. Direct URL entry

Затем заменить middleware redirect на route-aware blocked flow.

Это уменьшит риск регрессий и позволит сначала стабилизировать основной navigation path.

### 11.5. Acceptance criteria

- programmatic navigation больше не редиректит на `/`;
- direct route-entry не теряет target context;
- paywall знает, что именно пользователь пытался открыть.

## 12. Этап 6. Push migration

### 12.1. Цель

Подчинить push тому же каноническому target contract, не ломая доставку.

### 12.2. Изменяемые файлы

- `shared/dto/notifications.ts`
- `server/application/notifications/global-orchestration.service.ts`
- `server/application/notifications/breath-navigation.utils.ts`
- `server/application/notifications/delivery.service.ts`
- `app/plugins/push-notifications.client.ts`

### 12.3. Что реализовать

- добавление typed target в payload;
- сериализацию target в push transport;
- adapter `target -> legacy deepLink/action`;
- client-side consumption через `useAppNavigation`;
- сохранение очереди, dedup и retry логики.

### 12.4. Совместимость

До завершения rollout оставить:

- `deepLink`;
- `navigation`;
- `data.action`.

Новый typed target должен стать source of truth, а legacy поля — compatibility adapter.

### 12.5. Acceptance criteria

- push tap использует тот же navigation executor, что и chat/internal CTA;
- typed target сериализуется и читается корректно;
- legacy payload продолжает открываться на переходном периоде.

### 12.6. Тесты

Новые тесты:

- `tests/notification-navigation-payload.test.ts`
- `tests/push-navigation-adapter.test.ts`

## 13. Этап 7. Analytics

### 13.1. Цель

Сделать наблюдаемой всю цепочку navigation attempt -> resolution -> UI result.

### 13.2. Новые файлы

- `server/application/navigation/navigation-analytics.service.ts`
- опционально `server/api/navigation/track.post.ts`, если выбирается server event ingestion path

### 13.3. Что реализовать

- единый analytics payload;
- dispatch с client executor-а;
- tracking result states:
  - `opened`;
  - `paywall`;
  - `not_found`;
  - `fallback`;
  - `blocked`;
  - `error`;
- platform/source/entryPoint/resolvedBy metadata.

### 13.4. Минимальный rollout v1

Минимально допустимый вариант:

- structured logs;
- Sentry breadcrumbs / events;
- единый client analytics helper.

Если продукту нужна долговременная продуктовая аналитика, это должно быть отдельным решением поверх этого слоя.

### 13.5. Acceptance criteria

- каждый navigation attempt создаёт единое telemetry event;
- данные одинаково выглядят для chat, push и internal CTA;
- результат paywall и fallback не теряется.

## 14. Этап 8. Cleanup legacy adapters

### 14.1. Цель

После успешной миграции удалить временные дублирующие форматы.

### 14.2. Что удалять только в конце

- legacy chip actions, если новый `target` полностью заменил их;
- legacy push-only mapping logic, если typed target стабилен;
- scattered direct navigation helpers, если они заменены executor-ом;
- fallback-ветки, которые больше не нужны.

### 14.3. Условие начала cleanup

Cleanup допустим только если:

- все surface-ы используют единый executor;
- analytics показывает стабильную работу;
- нет критичных unknown/legacy path fallback;
- paywall flow работает без редиректа на `/`.

## 15. Порядок merge по PR

Рекомендуемый порядок PR:

1. shared navigation contracts + tests;
2. server deterministic resolver + tests;
3. navigation intent extraction + chat backend integration;
4. client navigation executor + internal CTA migration;
5. paywall flow migration;
6. push migration;
7. analytics;
8. cleanup legacy.

Такой порядок позволяет держать PR небольшими и проверяемыми.

## 16. Риски и контрольные точки

### 16.1. Риск: расползание registry

Симптом:

- часть mapping остаётся в старых helper-файлах, часть уходит в новый registry.

Контроль:

- любой новый navigation mapping добавляется только через единый registry;
- старые helper-файлы либо становятся thin-adapter, либо выводятся из обращения.

### 16.2. Риск: LLM prompt распухает

Симптом:

- в prompt уходит весь каталог;
- появляются paywall/fallback rules внутри prompt;
- цена и нестабильность растут.

Контроль:

- deterministic pre-parse first;
- extraction schema only;
- shortlist instead of full catalog;
- code resolver as final authority.

### 16.3. Риск: paywall остаётся фрагментированным

Симптом:

- часть переходов открывает modal;
- часть редиректит на `/`;
- часть уходит на `/subscription`.

Контроль:

- все programmatic navigation flow переводятся на executor;
- middleware migration выполняется отдельным этапом;
- blocked target context хранится централизованно.

### 16.4. Риск: push и chat расходятся по контракту

Симптом:

- chat использует новый target;
- push живёт на старых `deepLink/action`;
- логика начинает дублироваться.

Контроль:

- push adapter строится от того же `AppNavigationTarget`;
- resolver и executor общие;
- legacy transport используется только как compatibility layer.

## 17. Что можно не делать в первой реализации

Чтобы не перегрузить первый rollout, можно сознательно отложить:

- backend-driven registry;
- persistent analytics storage в БД;
- полнотекстовый semantic search по каталогу;
- сложные confidence threshold experiments;
- автоматическое восстановление незавершённого navigation flow между сессиями beyond current push queue behavior.

## 18. Definition of Done для implementation plan

План считается завершённым, если команда может по нему:

- разбить работу на PR;
- понимать, какие файлы создаются и меняются;
- понимать, где живёт extraction, где resolution, где execution;
- внедрять navigation layer поэтапно без big bang rewrite;
- не тащить routing truth в prompt и не раздувать стоимость токенов.
