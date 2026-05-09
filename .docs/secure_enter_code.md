# Финальное ТЗ: обязательная локальная защита входа Mentala

## 1. Цель

Добавить обязательную локальную защиту входа, чтобы посторонний человек не мог открыть уже авторизованное приложение Mentala и увидеть личные диалоги, настройки приватности, подписку, практики и другие приватные данные.

Защита не заменяет основную авторизацию по email, Google, Apple или другим провайдерам. Это локальный lock screen поверх активной серверной сессии.

## 2. Принципиальное решение

Защита входа не является пользовательской настройкой и не может быть отключена. Пользователь не выбирает, пользоваться ли кодом или биометрией. После успешной авторизации приложение обязано довести устройство до состояния, где создан локальный 4-значный код.

Запрещённые optional-flow:

- `Позже`;
- `Не сейчас`;
- `Включить/выключить код`;
- `Удалить код`;
- `enabled`;
- предложение включить защиту после onboarding или после чувствительных действий.

Правильный flow:

1. Пользователь успешно авторизовался.
2. Если локального lock-record для этого `userId` нет, приложение показывает обязательный экран создания кода.
3. Пользователь вводит 4 цифры.
4. Пользователь повторяет код.
5. При совпадении код сохраняется локально как hash + salt.
6. Только после этого приложение показывает приватный UI.

Для существующих пользователей после релиза действует тот же контракт: при первом открытии авторизованного приложения без локального lock-record показывается обязательная настройка кода до доступа к приватному контенту.

## 3. Поддерживаемые платформы

- Web/PWA: 4-значный код, hash + salt в `localStorage`, без хранения кода в открытом виде.
- iOS/Android: 4-значный код в secure storage, биометрия доступна как ручное действие на экране разблокировки, если устройство её поддерживает.
- Автоматически запускать biometric prompt нельзя: экран разблокировки первым показывает ввод PIN и кнопку `Биометрия устройства`.

## 4. Выбранный стек

Использовать публичный Capacitor 7-совместимый стек:

- `@capgo/capacitor-native-biometric@7.x` для native biometric prompt.
- `@aparajita/capacitor-secure-storage@7.1.6` для secure storage на iOS/Android.
- `@capacitor/privacy-screen@1.1.x` для защиты app switcher / recents.
- shadcn-vue `Input OTP` для 4-значного ввода.
- Web Crypto API `SubtleCrypto.deriveBits` для PBKDF2.

Capawesome в этом ТЗ не используем: релевантные пакеты требуют private registry/лицензию, а активная документация указывает поддержку Capacitor 8. Проект сейчас на Capacitor 7.

## 5. DB и серверный контракт

Миграция БД не нужна. Отдельной app-lock сущности нет и добавлять её не требуется.

PIN, salt, hash, счётчики попыток и runtime lock-состояние остаются строго локальными. Сервер не получает PIN/hash и не считает пользователя неавторизованным только потому, что локальный lock screen закрыт.

PIN является per-device секретом. Его нельзя синхронизировать через БД как общий 4-значный пароль аккаунта: такой PIN имеет слишком маленькое пространство перебора и при серверной проверке становится слабым централизованным credential. Для повторной проверки пользователя на сервере нужно использовать основной пароль, OAuth/passkey или отдельный полноценный re-auth flow, а не этот app-lock PIN.

## 6. Локальный record

```ts
type AppLockRecord = {
  version: 1;
  userId: number;
  pinHash: string;
  pinSalt: string;
  kdf: 'pbkdf2-sha256';
  iterations: number;
  lockAfterSeconds: 0 | 60 | 300 | 900;
  createdAt: number;
  updatedAt: number;
};
```

Хранение:

- Native: `@aparajita/capacitor-secure-storage@7.1.6`, ключ namespaced по `userId`.
- Web/PWA: `localStorage`, ключ namespaced по `userId`.
- `Preferences` нельзя использовать для PIN/hash.
- Lock-record нельзя переносить между пользователями.
- Обычный logout не удаляет локальный lock-record. При повторной авторизации того же `userId` приложение обязано загрузить существующий record и потребовать unlock, а не создавать новый код.
- Локальный lock-record удаляется только при явном `Забыли код?` / локальном сбросе кода или после удаления аккаунта.
- На переходном этапе старые native-сборки могут не содержать новые plugins. Клиент обязан feature-detect `SecureStorage`/`NativeBiometric`/`PrivacyScreen` и не блокировать вход бесконечной загрузкой. После выката новых iOS/Android build можно закрывать старые build через `minimumSupportedBuild`, если нужен строгий режим без fallback.

## 7. Hashing

Нельзя использовать raw SHA-256.

Требования:

- KDF: PBKDF2-SHA256.
- API: Web Crypto `SubtleCrypto.deriveBits`.
- Salt: `crypto.getRandomValues`.
- Compare: fixed-loop compare без раннего выхода по первому отличию.
- В открытом виде PIN нигде не хранится.
- Перед запуском hash/verify после завершения OTP-ввода нужно дать UI отрисовать последнюю цифру PIN, иначе на mobile возможна видимая задержка клавиатуры.

## 8. UX создания кода

Экран создания кода является блокирующим:

- 4 слота ввода;
- только цифры;
- mobile numeric keyboard;
- первый ввод;
- повтор кода;
- ошибка при несовпадении;
- без кнопок отказа, пропуска или удаления защиты.

Для смены кода из настроек допускается `Отмена`, потому что у пользователя уже есть действующий lock-record. Для первичной обязательной настройки `Отмена` недоступна.

## 9. UX разблокировки

Native:

1. Приложение первым показывает экран ввода PIN.
2. Если биометрия доступна, на этом же экране показывается кнопка `Биометрия устройства`.
3. Biometric prompt запускается только после явного нажатия пользователя.
4. Если пользователь отменил prompt, биометрия недоступна или произошла ошибка, пользователь остаётся на вводе PIN.

Web/PWA:

1. Показывается ввод PIN.
2. Биометрию/WebAuthn в этом релизе не внедряем.

Ошибки:

- после 5 неверных попыток ставится задержка 30 секунд;
- после 10 неверных попыток показывается действие `Выйти из аккаунта`;
- `Забыли код?` ведёт к logout и локальному сбросу lock-record.

## 10. Блокировка и lifecycle

События:

- запуск приложения;
- refresh Web/PWA;
- возврат вкладки;
- возврат iOS/Android из background;
- смена аккаунта;
- ручное действие `Заблокировать сейчас`.

Настройка `lockAfterSeconds` доступна, но без варианта `Никогда`:

- `0` — сразу;
- `60` — через 1 минуту;
- `300` — через 5 минут;
- `900` — через 15 минут.

Значение по умолчанию: `60`.

На публичных auth routes (`/auth`, `/auth/*`, `/forgot`, `/reset-password`) локальный lock screen и lifecycle-lock не запускаются. При logout действует короткое quiet window: поздние `401` от фоновых запросов не показывают toast/redirect, а stale `auth.me` не должен восстанавливать `auth.user`.

## 11. Privacy screen

На iOS/Android включить `@capacitor/privacy-screen`, чтобы приватные данные не попадали в app switcher / recents.

На Web/PWA при `visibilitychange` и `pagehide` мгновенно показывать privacy overlay, чтобы содержимое вкладки не оставалось открытым в превью и при возврате корректно применялась lock-логика.

## 12. Архитектура реализации

Компоненты и слои:

- `appLock` Pinia store/composable: загрузка record, mandatory setup, locked state, failed attempts, timers, lifecycle integration, runtime clear on logout, explicit local record removal only for reset/deletion.
- `app-lock.client.ts`: ранняя client-side инициализация, `visibilitychange/pagehide/pageshow`, Capacitor `appStateChange`, native privacy screen.
- `AppLockGate` в `app/app.vue`: глобальный блокирующий слой поверх приложения.
- Route middleware: вспомогательная защита от навигационных гонок, не основной enforcement.
- Settings: только `Изменить код`, `Запрашивать повторно`, `Заблокировать сейчас`, read-only статус биометрии.

## 13. Регрессии, которые нельзя сломать

- auth middleware и первичный `auth.me`;
- onboarding redirect;
- force update modal;
- paywall/modal layers;
- обычный logout без удаления lock-record;
- deletion logout с удалением lock-record;
- смена аккаунта;
- Web/PWA refresh;
- iOS/Android background/foreground;
- native app switcher privacy screen.

## 14. Test plan

Unit:

- PBKDF2/hash/compare;
- lock timing;
- failed-attempt throttling;
- per-user namespace.

Store/composable:

- setup required для нового и существующего пользователя без record;
- unlock через PIN;
- manual lock;
- account switch;
- обычный logout очищает runtime, но сохраняет lock-record;
- явный reset/удаление аккаунта удаляет lock-record.

Manual:

- Web/PWA: refresh, закрытие/возврат вкладки, `visibilitychange`, очищенный/unavailable `localStorage`.
- iOS: Face ID/Touch ID success, cancel -> PIN, unavailable/not enrolled -> PIN, app switcher privacy screen.
- Android: fingerprint/face success, cancel -> PIN, Android 8+ fallback, recents privacy screen.
