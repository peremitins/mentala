# ТЗ: Единый механизм навигации и редиректов

Версия: 1.0  
Дата: 2026-03-16  
Статус: draft

## 1. Зачем это нужно

Сейчас навигация в Mentala фрагментирована:

- push-уведомления используют `deepLink`, `navigation`, `data.action` и client-side fallback;
- чат использует отдельный формат action-чипов;
- экраны привычек и терапии навигируют напрямую через `navigateTo`;
- для части платных маршрутов middleware молча уводит пользователя на `/`;
- маппинги `контекст -> практика` размазаны по нескольким файлам.

Из-за этого:

- нет одного source of truth для переходов;
- сложно переиспользовать одну и ту же логику между push, chat и UI;
- тяжело валидировать цели перехода;
- аналитика переходов неполная и несогласованная;
- любое изменение роутинга грозит каскадными регрессиями.

Цель этого ТЗ: зафиксировать единый navigation layer, который будет общим для push, chat и внутренних рекомендаций интерфейса.

## 2. Цели v1

В первой версии нужно:

- ввести единый канонический тип цели перехода;
- вынести все разрешённые цели перехода в единый whitelist-registry;
- унифицировать переходы из push, chat, экранов привычек и терапии;
- запретить произвольные URL от модели;
- убрать UX с редиректом на `/` для платных destination-ов;
- ввести обязательную аналитику навигационных действий;
- сохранить совместимость с web, iOS и Android.

## 3. Что не входит в v1

В первую версию не входят:

- автозапуск медитации или практики после открытия экрана;
- свободная генерация URL моделью;
- навигация в модалки, временные UI-состояния, табы и внутренние sub-view;
- backend-driven registry из БД или CMS;
- сложные персонализированные A/B-правила подбора destination;
- silent redirect из чата без явного клика пользователя.

## 4. Scope v1

### 4.1. Обязательные destination-ы

В v1 поддерживаются только ключевые сущности продукта:

- список медитаций;
- категория/подборка медитаций;
- конкретная медитация;
- список дыхательных практик;
- группа дыхательных практик, если она представима в текущем роутинге;
- конкретная дыхательная практика;
- экран быстрых практик / quick-help;
- конкретная быстрая практика, если она существует как самостоятельная сущность;
- дневник благодарности;
- экран терапии;
- конкретная тема терапии, если для неё уже существует отдельный экран;
- экран привычек;
- конкретная привычка, если для неё уже существует отдельный экран.

### 4.2. Что сознательно не поддерживается в v1

- переходы в фильтры, сортировки и временные query-состояния, не являющиеся отдельной сущностью;
- навигация во внутренние шаги сложных мастеров, если для них нет стабильного business-key;
- произвольные внешние ссылки как часть единого navigation layer.

## 5. Архитектурные принципы

### 5.1. Каноническая сущность

Канонической сущностью должен быть не raw URL, а typed-target.

`AppNavigationTarget` является source of truth.

Из него выводятся:

- route path;
- deeplink;
- push payload;
- chat action-chip / CTA;
- аналитические события.

### 5.2. URL не является source of truth

`URL` и `query` рассматриваются как transport detail и adapter-слой.

Это обязательно, потому что raw URL:

- плохо валидируется;
- ломается при изменении роутов;
- неудобен для reuse между server/client;
- плохо подходит для fuzzy/semantic matching;
- смешивает бизнес-смысл и техническую форму перехода.

### 5.3. Whitelist only

Ни модель, ни push payload, ни внутренний UI не должны создавать произвольный путь.

Финальный target всегда выбирается только из разрешённого registry.

### 5.4. Явное действие пользователя

Из чата переход выполняется только по явному клику на chip / CTA.

В v1 запрещены:

- автопереход после ответа модели;
- silent redirect;
- автооткрытие практики без пользовательского действия.

### 5.5. Термины и иерархия понятий

Чтобы терминология не расползалась, в документе фиксируется такая иерархия:

- `target` — каноническая бизнес-цель навигации;
- `route` — техническое клиентское представление target-а в виде маршрута;
- `screen` — пользовательский экран, который открывается после route resolution;
- `destination` — разговорный общий термин для target-а или screen-а, но не отдельная техническая сущность;
- `surface` — источник вызова navigation flow, например chat, push, habits page, therapy page.

При конфликте формулировок приоритет всегда у `target` как канонической сущности и у `route` как её технического представления.

## 6. Канонический контракт

### 6.1. Рекомендуемое разделение

Чтобы не смешивать destination и transport-метаданные, вводятся две сущности:

- `AppNavigationTarget` — что именно хотим открыть;
- `AppNavigationRequest` — в каком контексте и из какого source этот target был получен.

### 6.2. AppNavigationTarget

```ts
export type AppNavigationTarget =
  | { type: 'meditations_list' }
  | { type: 'meditation_collection'; collectionKey: string }
  | { type: 'meditation_track'; trackId: string }
  | { type: 'breath_practices_list' }
  | { type: 'breath_practices_group'; groupKey: string }
  | { type: 'breath_practice'; slug: string }
  | { type: 'quick_help' }
  | { type: 'quick_help_practice'; practiceKey: string }
  | { type: 'gratitude_diary' }
  | { type: 'therapy_list' }
  | { type: 'therapy_topic'; topicKey: string }
  | { type: 'habits_list' }
  | { type: 'habit'; entityKey: string };
```

Примечания:

- `practiceKey` для quick-help должен быть whitelist-ключом бизнес-сущности, а не route/query-строкой;
- `entityKey` для привычки может быть как каталогным ключом, так и custom-id, если такой маршрут уже существует и валидируется системой;
- допускается расширение контракта в следующих версиях, но без ломки существующих типов.

Чтобы не смешивать intent extraction и финальную навигацию, в LLM-assisted сценариях должен существовать промежуточный слой.

### 6.3. NavigationIntentExtraction

```ts
export type NavigationIntentExtraction =
  | {
      intent: 'open_meditation';
      topic: string | null;
      confidence?: number | null;
    }
  | {
      intent: 'open_breath_practice';
      practiceHint: string | null;
      confidence?: number | null;
    }
  | {
      intent: 'open_quick_help';
      reason: string | null;
      confidence?: number | null;
    }
  | {
      intent: 'open_gratitude_diary';
      confidence?: number | null;
    }
  | {
      intent: 'open_therapy_topic';
      topic: string | null;
      confidence?: number | null;
    }
  | {
      intent: 'open_habit';
      habitHint: string | null;
      confidence?: number | null;
    }
  | {
      intent: 'none';
      confidence?: number | null;
    };
```

Назначение этой сущности:

- зафиксировать, что именно понял parser или LLM;
- не путать extraction result с финальным `AppNavigationTarget`;
- дать системе возможность принимать решение по `confidence`;
- явно отделить inference-слой от deterministic resolver-а.

Важно:

- `confidence` относится к extraction result, а не к финальному navigation request;
- конкретный порог `confidence` не фиксируется в этом ТЗ и подбирается на этапе реализации;
- отсутствие высокой уверенности не даёт права фальсифицировать точный target.
- extraction contract должен оставаться грубее и компактнее, чем `AppNavigationTarget`, и не должен разрастаться до зеркала всего navigation registry.
- в `NavigationIntentExtraction` нельзя прокидывать конкретные route fragments, paywall-решения, fallback hints, UI preferences и другие детали финального target/execution слоя.

### 6.4. AppNavigationRequest

```ts
export type AppNavigationSource =
  | 'push'
  | 'chat_chip'
  | 'chat_cta'
  | 'chat_command'
  | 'habit_page'
  | 'therapy_page'
  | 'system_recommendation';

export type AppNavigationResolvedBy =
  | 'exact'
  | 'normalized'
  | 'fuzzy'
  | 'registry_rule'
  | 'user_selected'
  | 'fallback';

export interface AppNavigationRequest {
  target: AppNavigationTarget;
  source: AppNavigationSource;
  entryPoint?: string | null;
  resolvedBy?: AppNavigationResolvedBy | null;
  rawQuery?: string | null;
  sourceMeta?: Record<string, unknown> | null;
}
```

`AppNavigationRequest` описывает уже нормализованный navigation request после extraction и/или deterministic resolution.

Семантика полей:

- `source` — нормализованная категория поверхности, из которой возник navigation flow;
- `entryPoint` — конкретная точка внутри поверхности, например конкретная карточка, конкретная кнопка или конкретный сценарий входа;
- `sourceMeta` — вспомогательный технический контекст, который не должен дублировать смысл `source` и `entryPoint`.

Правила для `rawQuery`:

- `rawQuery` является optional и не считается обязательным полем аналитики;
- по умолчанию не следует сохранять полный чувствительный пользовательский текст;
- если поле всё же используется, предпочтительнее хранить безопасный excerpt, нормализованную форму или ограниченную техническую строку запроса, а не полный chat message;
- использование `rawQuery` должно учитывать требования приватности и минимизации данных.

Правила для `sourceMeta`:

- поле остаётся свободной структурой только на уровне draft-документа;
- на design phase должен быть зафиксирован whitelist допустимых ключей для v1;
- `sourceMeta` не должно становиться складом случайного payload-а, сырых chat message и несогласованных debug-полей.

### 6.5. NavigationResolutionOutcome

Чтобы не смешивать результат резолва с фактом клиентского открытия экрана, вводится отдельная сущность результата server-side resolution.

```ts
export type NavigationResolutionOutcome =
  | { kind: 'none' }
  | {
      kind: 'resolved';
      target: AppNavigationTarget;
      resolvedBy: AppNavigationResolvedBy;
    }
  | {
      kind: 'shortlist';
      candidateTargets: AppNavigationTarget[];
      resolvedBy: Exclude<
        AppNavigationResolvedBy,
        'user_selected' | 'fallback'
      >;
    }
  | {
      kind: 'not_found';
      extraction: NavigationIntentExtraction;
    }
  | {
      kind: 'paywall';
      target: AppNavigationTarget;
    }
  | {
      kind: 'blocked';
      target: AppNavigationTarget;
    }
  | {
      kind: 'fallback';
      requestedTarget: AppNavigationTarget;
      fallbackTarget: AppNavigationTarget;
    };
```

Правила:

- `resolved` используется, когда найден один валидный финальный target;
- `shortlist` используется, когда найдено несколько допустимых candidate target-ов и нужен явный выбор пользователя;
- `none` означает, что extraction слой не распознал navigation intent или уверенность недостаточна;
- `not_found` означает, что intent был, но валидный target в registry не найден;
- `paywall` означает, что target найден, но коммерчески ограничен и должен вести к paywall flow;
- `fallback` означает, что исходный target не открыт, но открыт допустимый родительский target по fallback-цепочке;
- `blocked` означает, что target найден, но доступ к нему ограничен некоммерческим policy/access слоем.

`shortlist` не должен пихаться ad hoc в chat-specific DTO без общей navigation модели.  
Если система работает с несколькими candidate target-ами, это должно проходить через единый resolution contract.

`shortlist` как канонический outcome может требовать отдельного presentation mapping на adapter-слое:

- label;
- CTA title;
- optional subtitle / explanation;
- optional icon kind.

Эти presentation-данные не обязаны жить в базовом `AppNavigationTarget`, но не должны собираться хаотично в каждом UI-сценарии отдельно.

### 6.6. Результат выполнения

```ts
export type AppNavigationResult =
  | 'opened'
  | 'paywall'
  | 'not_found'
  | 'fallback'
  | 'blocked'
  | 'error';
```

`AppNavigationResult` описывает уже клиентский итог исполнения navigation flow, а не server-side resolution.

Семантика client-side результатов:

- `paywall` — ожидаемый коммерческий блок, при котором target найден, но требуется платный доступ;
- `blocked` — иной некоммерческий блок, например policy deny, unsupported platform, invalid state или другой non-paywall restriction.

## 7. Registry как единый source of truth

### 7.1. Общие требования

В v1 registry должен жить в коде, а не в БД.

Обязательные свойства registry:

- единый;
- централизованный;
- типизированный;
- доступный и серверу, и клиенту;
- пригодный для последующего переноса в backend-driven конфигурацию без ломки контракта.

Важно:

- shared registry и shared типы не означают shared business-resolution logic;
- business-level resolution, shortlist selection, fuzzy matching и paywall decision не должны дублироваться на клиенте.

### 7.2. Архитектурное требование

Нельзя разносить mapping по разным несогласованным файлам.

Нужен один центр управления:

- разрешёнными target-ами;
- их стабильными ключами;
- mapping `контекст -> рекомендуемые target-ы`;
- словарём синонимов и fuzzy-правил;
- fallback-цепочками.

Словари синонимов, aliases и fuzzy-правила не должны жить наполовину в prompt, наполовину в коде.  
Source of truth для них должен оставаться в deterministic navigation layer.

### 7.3. Рекомендуемая структура

Рекомендуется выделить отдельный navigation-модуль:

- `shared/navigation/*` — контракты и чистые типы;
- `server/application/navigation/*` — server-side resolution, fuzzy matching, paywall gating, analytics orchestration;
- `app/composables` или `app/services` — client-side execution adapter.

Финальная файловая структура будет уточнена на этапе реализации, но архитектурный принцип фиксируется уже сейчас: один registry, одна каноническая модель, несколько adapter-слоёв.

## 8. Правила резолва target-а

### 8.1. Общая цепочка

Резолв должен работать так:

1. распознать intent пользователя или контекста;
2. подобрать candidate target только из registry;
3. провалидировать target;
4. при необходимости применить paywall-проверку;
5. вернуть:
   - валидный target;
   - либо controlled fallback;
   - либо `not_found`.

### 8.2. Что разрешено в v1

В v1 разрешены:

- точное совпадение;
- нормализованное совпадение;
- ограниченный fuzzy match;
- словарные синонимы;
- registry-based правила по контексту.

### 8.3. Что запрещено

Запрещено:

- генерировать URL напрямую из модели;
- открывать route, которого нет в whitelist;
- обходить registry прямыми `navigateTo('/что-то-собранное-LLM-ом')`.

### 8.4. Примеры допустимого семантического резолва

- `сон` -> подборка медитаций для сна;
- `тревога` -> shortlist медитаций и/или дыхательных практик для тревоги;
- `4-7-8` -> конкретная дыхательная практика `4-7-8`;
- `успокоиться прямо сейчас` -> shortlist практик быстрого эффекта, но только из registry.

### 8.5. Неоднозначность

Если запрос пользователя неоднозначен, система не должна выбирать произвольный target.

Правило v1:

- если есть один очевидный лучший target — можно вернуть 1 action;
- если есть несколько релевантных target-ов разных типов — вернуть shortlist до 3 action-chip / CTA;
- если уверенности недостаточно — не навигировать автоматически и не фальсифицировать точный match.

### 8.5.1. Операционное поведение confidence

Численные пороги confidence в v1 не фиксируются, но поведенческий контракт фиксируется.

Правила:

- высокая уверенность + один валидный target -> можно показывать один CTA;
- средняя уверенность или несколько релевантных валидных target-ов -> нужно показывать shortlist;
- низкая уверенность -> `none`, без фальшивого точного target-а.

### 8.6. Два режима navigation flow

В v1 должны существовать два разных режима работы:

#### Режим A. Deterministic navigation

Используется там, где navigation target уже известен из контекста:

- push payload;
- кнопки и CTA на экранах;
- backend recommendation;
- рекомендации на экранах привычек и терапии;
- любые внутренние сценарии, где target уже получен из registry или business-логики.

В этом режиме модель не нужна и не должна вызываться.

#### Режим B. Intent-based navigation

Используется там, где пользователь формулирует запрос свободным текстом:

- `открой медитацию для сна`;
- `покажи дыхание 4-7-8`;
- `дай быструю практику`;
- `предложи что-то от тревоги`.

В этом режиме допускается parser или LLM extraction, но только как слой распознавания intent, а не как source of truth для маршрутизации.

### 8.7. Deterministic pre-parse перед LLM

Перед вызовом LLM система должна по возможности пробовать дешёвый deterministic pre-parse.

Разрешённые техники v1:

- regex;
- alias lookup;
- dictionary match;
- normalized token match;
- registry-based keyword rules.

LLM допускается вызывать только после неуспешного deterministic pre-parse или в сценариях с реально неоднозначным естественным языком.

### 8.8. Приоритет resolver-а над моделью

В LLM-assisted navigation финальное решение всегда принимает deterministic resolver.

Resolver обязан:

- сопоставить extraction result с whitelist registry;
- провалидировать candidate target;
- проверить feature access / paywall;
- применить fallback-цепочку;
- вернуть финальный `AppNavigationTarget` или controlled `none/not_found`.

Модель может предложить candidate intent, но не может принимать финальное routing-решение.

#### 8.8.1. Единая стратегия resolution

В системе не должно появиться двух независимых business-level resolver-ов:

- одного для chat;
- другого для push/UI.

Каноническая стратегия resolution должна быть одна:

- один deterministic registry;
- один канонический resolver или один общий deterministic resolution layer;
- клиент использует только route adapter и execution logic, а не отдельный второй business-resolver.

### 8.9. Fail-safe при низкой уверенности

Если parser или LLM не могут уверенно определить intent:

- нельзя генерировать произвольный URL;
- нельзя выбирать случайный target;
- нельзя фальсифицировать `exact match`;
- нужно вернуть `none` или shortlist candidate-ов для явного выбора пользователем.

## 9. Поведение в чате

### 9.1. Основной принцип

Чат формирует не URL, а structured payload.

Текст ответа предназначен для человека.  
Навигация предназначена для интерфейса.

### 9.2. Формат поведения v1

В v1:

- parser или модель определяют intent и возвращают `NavigationIntentExtraction`;
- deterministic resolver переводит extraction result в финальный `AppNavigationTarget`;
- UI рендерит chips / CTA;
- переход выполняется только по явному клику пользователя.

### 9.3. Action-chip лимиты

Для одного ответа чата:

- минимум: `0`;
- предпочтительно: `1-2`;
- максимум: `3`.

Если есть один явно лучший target, нужно показывать один action-chip.  
Если есть несколько релевантных вариантов разных типов — показывать до трёх.

### 9.4. Structured payload, а не ссылки в тексте

Основной механизм v1:

`structured payload -> validated target -> resolver -> navigation`

Обычные кликабельные ссылки внутри текста не являются основной архитектурой и могут рассматриваться только как вторичный web-only сценарий в будущем.

### 9.5. Разделение conversational answer и navigation extraction

Навигационный слой не должен раздувать основной conversational prompt.

Для chat navigation допускаются два варианта:

- отдельный короткий extraction step;
- компактный structured payload в рамках основного ответа.

В обоих случаях навигационная часть должна быть максимально короткой, схемной и не превращаться в длинный prompt с описанием всего приложения.

## 10. Поведение для push-уведомлений

### 10.1. Общий принцип

Push должен использовать тот же navigation contract, что и чат.

### 10.2. Требование совместимости

На этапе rollout допускается сохранить существующие transport-поля:

- `deepLink`;
- `navigation`;
- `data.action` + параметры.

Но их семантика должна быть подчинена одному каноническому target-у.

### 10.3. Каноническое правило

Источник истины для push — не raw path, а сериализованный typed-target.

Старые поля нужны только как совместимый adapter до полного перехода на единый контракт.

### 10.4. Поведение на клиенте

Для push в v1 сохраняются правила:

- переход только по системному tap;
- без навигации при `yes/no/later/snooze`;
- без автозапуска практики;
- с сохранением очереди/retry/TTL механики для mobile lifecycle.

## 11. Paywall и заблокированные destination-ы

### 11.1. Что признаётся неправильным

Redirect на `/` для платного target-а считается неправильным поведением и должен быть убран.

### 11.2. Правильное поведение v1

Если target доступен:

- открыть target.

Если target платный и доступа нет:

- не делать redirect на `/`;
- показать paywall в предсказуемом формате;
- сохранить контекст `target` и `source`.

### 11.3. Предпочтительный UX

Приоритетный вариант:

- открыть соответствующий экран или его контекст;
- поверх показать `FeaturePaywallModal`.

Если такой сценарий для конкретного surface слишком сложен в v1:

- допускается dedicated paywall flow;
- но с обязательным сохранением `target`, `source` и причины блокировки.

### 11.4. Что пользователь должен понимать

Пользователь должен видеть:

- что именно он пытался открыть;
- что этот target платный;
- какой тариф требуется;
- из какого действия он пришёл.

## 12. Платформенная модель

Архитектура должна быть общей для:

- web;
- iOS;
- Android.

Правила:

- chat navigation обязателен везде;
- push click navigation обязателен на iOS и Android;
- даже там, где конкретный transport не используется, target contract и resolver остаются общими.

Итог: нельзя делать две разные системы навигации — одну для native, вторую для web.

## 13. Открытие практик

В v1 при переходе в конкретную медитацию или практику нужно:

- открыть нужный экран;
- не запускать воспроизведение автоматически;
- не стартовать упражнение без явного действия пользователя.

Автозапуск можно заложить как будущую опцию через отдельный флаг, но не включать в стандартное поведение v1.

## 14. Аналитика

### 14.1. Аналитика обязательна

Без аналитики система считается неполной.

### 14.2. Минимальный обязательный payload

Для каждого navigation attempt в v1 нужно фиксировать минимум:

- `source`;
- `targetType`;
- `targetId` или `targetKey`;
- `result`;
- `platform`;
- `entryPoint`;
- `timestamp`.

### 14.3. Желательные поля

Желательно также фиксировать:

- `userIntent`, если он был распознан;
- `resolvedBy`;
- `requiredPlan`, если был paywall;
- `fallbackFrom`, если был fallback;
- `errorCode`, если переход завершился ошибкой.

## 15. Fallback-политика

В v1 fallback должен быть контролируемым и иерархическим.

Рекомендуемые цепочки:

- `meditation_track` -> `meditation_collection` -> `meditations_list`;
- `meditation_collection` -> `meditations_list`;
- `breath_practice` -> `breath_practices_group` -> `breath_practices_list`;
- `breath_practices_group` -> `breath_practices_list`;
- `quick_help_practice` -> `quick_help`;
- `therapy_topic` -> `therapy_list`;
- `habit` -> `habits_list`.

Переход на `/` допустим только как последний технический safeguard, а не как основной пользовательский fallback.

Fallback нельзя применять безусловно.

Случаи, где fallback должен быть запрещён или требовать отдельного объяснения:

- если пользователь явно запрашивал конкретную платную сущность и должен увидеть paywall, а не уход на более общий экран;
- если fallback скрывает ошибку данных или рассинхрон registry;
- если fallback превращает осмысленный intent в слишком общий экран без явного объяснения пользователю.

Пример запрещённого silent UX:

- пользователь запросил `дыхание 4-7-8`;
- система не смогла открыть конкретную практику;
- система молча открыла общий список дыхания без объяснения.

Такое поведение не считается качественным fallback и не должно быть стандартом v1.

## 16. Сценарии использования

### 16.1. Push

- уведомление рекомендует конкретную практику;
- payload несёт typed-target;
- пользователь нажимает push;
- клиент открывает экран или показывает paywall;
- событие аналитики фиксирует итог.

### 16.2. Chat command

- пользователь пишет: `открой дыхание 4-7-8`;
- deterministic pre-parse или короткий extraction step формирует intent;
- server-side resolver маппит intent на whitelist-target;
- UI показывает action-chip или CTA;
- переход выполняется только после клика.

### 16.3. Context recommendation

- экран терапии/привычки рекомендует практику;
- вместо прямого `navigateTo` используется единый navigation executor;
- paywall и analytics работают так же, как в чате и push.

## 17. Acceptance criteria для v1

Система считается готовой по ТЗ, если:

- существует единый typed `AppNavigationTarget`;
- существует промежуточный слой `NavigationIntentExtraction` для LLM-assisted сценариев;
- существует явный `NavigationResolutionOutcome` для `resolved` / `shortlist` / `none` / `not_found` / `paywall` / `blocked` / `fallback`;
- существует централизованный whitelist-registry;
- push, chat и внутренние рекомендации используют один и тот же канонический target;
- deterministic surfaces не вызывают модель, если target уже известен;
- chat не делает автопереход без клика пользователя;
- один ответ чата может содержать до 3 action-chip;
- модель не генерирует произвольные URL;
- финальный target выбирается deterministic resolver-ом, а не моделью;
- `none`, `not_found` и `fallback` разведены семантически и не смешиваются в аналитике;
- `paywall` и `blocked` разведены семантически и не используются как взаимозаменяемые состояния;
- navigation prompt не требует передачи полного registry, полного routing map и всех paywall/fallback правил;
- платный target не редиректит на `/`;
- paywall сохраняет контекст target-а;
- web, iOS и Android работают на общем navigation contract;
- client-side слой не дублирует отдельный business-level resolver;
- при низкой уверенности система возвращает `none` или shortlist, а не поддельный exact target;
- аналитика переходов фиксирует минимум обязательных полей;
- переход в практику открывает экран, но не запускает практику автоматически.

## 18. Влияние на текущую кодовую базу

Новая механика в будущем затронет как минимум:

- `app/plugins/push-notifications.client.ts`;
- `server/application/notifications/global-orchestration.service.ts`;
- `server/application/notifications/breath-navigation.utils.ts`;
- `shared/dto/notifications.ts`;
- `shared/dto/index.ts`;
- `server/application/suggested-chips.service.ts`;
- `app/pages/index.vue`;
- `app/middleware/feature-access.global.ts`;
- `app/lib/meditations.ts`;
- `app/lib/practiceActions.ts`.

Также этот документ является более широким и приоритетным по отношению к `.docs/notification_deeplink_tz.md`, потому что описывает не только push deeplink, но и единый navigation layer для всех основных surface-ов продукта.

## 19. Блокирующие вопросы

На момент фиксации этого ТЗ блокирующих вопросов нет.

Следующий шаг после утверждения документа: подготовить технический design и план реализации без немедленного внедрения.

Связанный документ:

- `.docs/unified_navigation_implementation_plan.md`

## 20. Использование LLM и требования к стоимости

### 20.1. Роль модели в navigation flow

В v1 LLM допускается только в сценариях свободного текстового запроса пользователя, где требуется распознать navigation intent.

LLM не является source of truth для:

- финального route;
- whitelist target selection;
- paywall decision;
- fallback chain;
- feature access validation.

Финальный target определяется только resolver-слоем на основе registry.

Shared registry и shared navigation contracts не дают права переносить business-resolution в клиентский слой.

### 20.2. Принцип минимальной роли модели

В navigation flow модель используется только для:

- распознавания намерения пользователя;
- извлечения нормализованного navigation intent;
- формирования ограниченного structured candidate payload.

Модель не должна:

- знать весь каталог через длинный prompt;
- хранить в контексте все маршруты и routing rules;
- принимать финальное решение по paywall;
- управлять fallback-цепочками;
- генерировать финальный path.

### 20.3. Минимизация prompt footprint

Для снижения стоимости и повышения надёжности navigation flow должен использовать минимальный prompt footprint.

Обязательные правила:

- не передавать в модель полный registry navigation target-ов;
- не передавать в модель полные карты маршрутов;
- не описывать в prompt paywall, fallback и routing rules целиком;
- использовать короткую фиксированную инструкцию;
- ограничивать ответ модели строгой structured schema;
- при необходимости передавать только shortlist candidate-ов, а не весь каталог.

### 20.4. Предпочтительная схема v1

Предпочтительный pipeline для chat navigation в v1:

1. пользовательский текст;
2. deterministic pre-parse;
3. при необходимости короткий LLM extraction step;
4. `NavigationIntentExtraction`;
5. resolver по whitelist registry;
6. paywall gating;
7. analytics;
8. UI chip / CTA;
9. переход только по клику пользователя.

### 20.5. Приоритет deterministic logic

Если navigation target уже известен из контекста, модель не должна вызываться.

Это правило обязательно для:

- push payload;
- action-chip из backend recommendation;
- кнопок и CTA в интерфейсе;
- внутренних рекомендаций на экранах терапии и привычек.

### 20.6. Размещение orchestration по слоям

Чтобы логика не расползлась между prompt-ом, клиентом и сервером, в v1 фиксируется такое разделение ответственности:

- LLM extraction — server-side;
- registry resolution — server-side;
- paywall gating — server-side или shared deterministic layer;
- final navigation execution — client-side.

Клиент не должен самостоятельно принимать решение о финальном target-е в LLM-assisted сценариях.  
Клиентская задача — получить уже нормализованный target, отрисовать chip / CTA и выполнить переход.

Канонический business-level resolver не должен дублироваться на клиенте отдельной независимой логикой.  
На клиенте допускаются только transport-адаптеры, route-builder и execution logic.

### 20.7. Fail-safe поведение

Если LLM не может уверенно определить intent:

- не генерировать произвольный URL;
- не выбирать случайный target;
- не фальсифицировать `exact match`;
- вернуть `none` или shortlist candidate-ов для явного выбора пользователем.

### 20.8. Ограничение роста navigation prompt

Navigation prompt должен иметь отдельную, короткую и контролируемую инструкцию.

Обязательные правила масштабирования:

- добавление новых target-type не должно линейно раздувать prompt;
- рост каталога должен масштабироваться через registry и resolver, а не через рост prompt-а;
- изменение navigation prompt должно происходить осознанно и отдельно ревьюиться;
- prompt не должен становиться местом, где живут все aliases, routing rules, fallback-цепочки и paywall-исключения.
