# Mentala — iOS: развёртывание и подготовка (dev + prod)

Версия: 1.0  
Дата: 2026-02-08  
Статус: Draft

## 1. Цель и область

Цель: получить рабочую iOS‑сборку с полным паритетом функционала Android и подготовкой к продакшн‑релизу.

Входит:

- iOS dev на реальном устройстве (live reload).
- Подготовка iOS контейнера Capacitor.
- Push‑уведомления (dev + prod), включая изображения.
- Паритет ключевых нативных функций.

Не входит:

- Изменение кода (это отдельная задача, описана как шаги).

## 2. Что уже есть под Android (фактическое состояние репозитория)

- Сервер шлёт уведомления через Firebase Admin (`server/application/notifications/delivery.service.ts`).
- Для Android реализован кастомный FCM сервис и канал `mentai_high`.
- `android/app/src/main/java/com/mentala/app/MentalaMessagingService.java` — строит нативное уведомление из data‑payload и гарантирует tap‑интент.
- `android/app/src/main/java/com/mentala/app/MainApplication.java` — инициализация Firebase и канал уведомлений.
- `android/app/src/main/AndroidManifest.xml` — channel id, разрешения, сервисы.
- Клиентский обработчик push: `app/plugins/push-notifications.client.ts`.
- Конфиг Capacitor и presentation options: `capacitor.config.ts`.
- CORS и dev‑origin whitelist: `server/middleware/cors.ts`, `.env.development` (переменная `DEV_ALLOWED_ORIGINS`).

## 3. Критичные различия iOS vs Android (обязательные решения)

- Контракт токенов: сервер принимает **только FCM registration token**. На iOS обязателен FCM token (через `@capacitor-community/fcm`). APNs token — только для диагностики, не для отправки.
- На iOS требуется включить Push Notifications capability и добавить обработчики в `AppDelegate.swift`.
- Silent/data‑only push на iOS в `@capacitor/push-notifications` не поддерживается.
- Изображения в push на iOS требуют Notification Service Extension.
- Требование по версии: **iOS 14+** (Capacitor 7).

## 4. Минимальные зависимости и доступы

- macOS.
- Xcode + CocoaPods.
- iPhone с iOS 14+ (реальное устройство) для push.
- Apple Developer Program (для APNs ключей и включения Push Notifications capability).
- Доступ к Firebase Console проекта.

## 5. Apple Developer Program — подробный гайд для новичка

### 5.1. Тип аккаунта

1. Individual — если вы один человек/ИП.
2. Organization — если юрлицо.

Требования для Individual:

- Apple Account с включенной 2FA.
- Легальное имя (без псевдонимов).

Требования для Organization:

- Юрлицо.
- D‑U‑N‑S номер.
- Рабочий email с доменом компании.
- Публичный сайт.
- Право подписания договоров (Account Holder).

### 5.2. D‑U‑N‑S (если Organization)

- Номер бесплатный, получить можно через Dun & Bradstreet.
- Обычно занимает несколько рабочих дней, затем данные синхронизируются с Apple.

### 5.3. Регистрация и оплата

1. Пройти enrollment в Apple Developer Program (через web или Apple Developer app).
2. После верификации принять соглашение и оплатить членство.
3. Стоимость — 99 USD в год (может отличаться по регионам).

### 5.4. Что даёт программа

- Доступ к Certificates, Identifiers & Profiles.
- Возможность создавать APNs ключи и включать Push Notifications capability (роль Account Holder/Admin).
- Без членства push на реальных iPhone не заработает: не получится выпустить App ID с Push и получить APNs ключ.

## 6. Bundle identifier и схемы (dev/prod)

Обязательное решение: **два bundle identifier**.

- prod: `com.mentala.app`
- dev: `com.mentala.app.dev`

Почему так:

- Можно устанавливать dev и prod параллельно на одном iPhone.
- Разделение пуш‑токенов, подписей, профилей, entitlement и Keychain.
- TestFlight не мешает локальной dev‑сборке.

Как отражается в Firebase (один проект):

- Создать два iOS приложения: Mentala iOS (prod) → `com.mentala.app`, Mentala iOS (dev) → `com.mentala.app.dev`.
- Для каждого приложения скачать свой `GoogleService-Info.plist`.

Как отражается в Xcode:

- Две схемы: Dev и Prod.
- Две сборочные конфигурации (например, Debug-Dev и Release-Prod).
- У каждой схемы свой bundle id и свой `GoogleService-Info.plist`.

## 7. Bootstrap iOS‑контейнера (Capacitor v7)

1. Установить iOS платформу:

```bash
pnpm add @capacitor/ios
npx cap add ios
```

2. Синхронизировать платформу:

```bash
npx cap sync ios
```

3. Открыть Xcode:

```bash
npx cap open ios
# или
open ios/App/App.xcworkspace
```

4. Запуск из Xcode или CLI:

```bash
npx cap run ios
```

## 8. Dev на реальном устройстве (live reload)

Важно: **Android Studio не используется**. Для iOS всё делается через Xcode + Capacitor.

1. Запустить dev‑сервер:

```bash
pnpm dev
```

2. Убедиться, что iPhone и Mac находятся в одной сети (без client isolation / guest Wi‑Fi).
3. Узнать локальный IP (LAN) компьютера.

4. Убедиться, что `capacitor.config.ts` читает `CAPACITOR_SERVER_URL` и пишет его в `server.url`.
   В этом репозитории это уже реализовано (см. `capacitor.config.ts`), но если меняли —
   поправить и только после этого делать sync.

5. Установить dev‑URL для Capacitor и выполнить sync:

```bash
CAPACITOR_SERVER_URL=http://<LAN_IP>:3000 npx cap sync ios
```

6. Убедиться, что `DEV_ALLOWED_ORIGINS` в `.env.development` содержит `http://<LAN_IP>:3000`.

7. В Xcode выбрать Team и устройство, запустить приложение.

8. При первом запуске iOS 14+ попросит доступ к Local Network — **разрешить**. Если отказали, включить в Settings → Privacy & Security → Local Network.

9. ATS для dev‑HTTP. В `Info.plist` добавить исключение на локальный IP. В проде это исключение убрать и перейти на HTTPS.

Пример:

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSExceptionDomains</key>
  <dict>
    <key>192.168.0.100</key>
    <dict>
      <key>NSIncludesSubdomains</key>
      <true/>
      <key>NSTemporaryExceptionAllowsInsecureHTTPLoads</key>
      <true/>
    </dict>
  </dict>
</dict>
```

## 9. Push‑уведомления (подробный пошаговый сценарий)

### 9.0. Архитектурное решение по токенам (обязательный контракт)

- Сервер принимает и использует **только FCM registration token**.
- На iOS клиент обязан получать FCM token через `@capacitor-community/fcm` и отправлять его в `/api/notifications/register-token`.
- APNs token можно логировать/хранить отдельно для диагностики, но он **не используется** для отправки пушей в текущей архитектуре.

### 9.1. Apple Developer Portal

1. Создать два App ID: `com.mentala.app` (prod) и `com.mentala.app.dev` (dev).
2. Включить Push Notifications capability для обоих.
3. Создать APNs ключ (p8) через Keys. Ключ бессрочный, работает для dev и prod. Сохранить `Key ID` и `Team ID`.

### 9.2. Firebase Console

1. Открыть Firebase проект.
2. Добавить два iOS‑приложения: `com.mentala.app` (prod) и `com.mentala.app.dev` (dev).
3. Скачать два файла: `GoogleService-Info-Prod.plist` и `GoogleService-Info-Dev.plist`.
4. В Project Settings → Cloud Messaging загрузить APNs key и указать `Key ID`.

### 9.3. Xcode

1. Добавить оба `GoogleService-Info.plist` в проект и настроить копирование нужного файла по схеме (через Build Phases).
2. Включить Capabilities: Push Notifications и Background Modes → Remote notifications.
3. Добавить методы в `AppDelegate.swift` (из документации Capacitor):

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}
func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
  NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

### 9.4. Dev/Prod окружение и разделение токенов

- Dev‑сборка отправляет токен с признаком окружения: `X-App-Env: dev` и `appEnv: dev` в теле.
- Prod‑сборка отправляет `X-App-Env: prod` и `appEnv: prod`.
- На сервере токены сохраняются с `app_env` и используются **только** в своём окружении.
- Это исключает ситуацию, когда dev‑пуш приходит в prod‑приложение и наоборот.
- Dev‑пуши отправляются **через сервер**, без ручных отправок из Firebase Console.

### 9.5. Изображения в пушах (Rich Notifications)

Картинки обязательны уже на dev, значит Notification Service Extension **обязателен сразу**.

Минимальный путь:

1. В Xcode: File → New → Target → Notification Service Extension.
2. Extension делает три шага: перехват push → скачивание изображения → прикрепление `UNNotificationAttachment`.
3. Источник URL в Extension:
   - основной: `data.image` (мы кладём его в data для всех платформ);
   - fallback: `fcm_options.image` (если пришёл пуш из Console/другого источника).
4. Если URL отсутствует или скачивание не удалось — вернуть уведомление **без** картинки
   (не ломаем доставку, просто без rich‑контента).

### 9.6. Токены: важный момент (FCM vs APNs)

- `@capacitor/push-notifications` даёт APNs token на iOS.
- Firebase Admin SDK отправляет сообщения на **FCM registration token**, который приходит из FCM SDK на клиенте.

Вывод: чтобы сохранить текущий сервер (FCM), на iOS нужно получать **FCM token**, а не APNs token. Без этого пуши работать не будут.

Рекомендуемый вариант:

1. Установить зависимость: `pnpm add @capacitor-community/fcm`.
2. Выполнить `npx cap sync ios`.
3. После `PushNotifications.register()` получить FCM token через `FCM.getToken()`.
4. Отправлять этот token в `/api/notifications/register-token`.
5. Если FCM token не получен — **не регистрировать APNs token**, это приведёт к «тихим» отказам доставки.

Плагин специально дополняет Capacitor Push Notifications и возвращает FCM token для iOS/Android.

Альтернатива (сложнее):

- Перевести сервер на прямую отправку через APNs, тогда можно использовать APNs token (требует отдельной реализации и инфраструктуры, не входит в текущий объём).

### 9.7. Payload контракт для rich image

- URL изображения должен быть доступен по **HTTPS** и публичен для устройства.
- На iOS FCM использует поле `fcm_options.image` для передачи картинки и требует `aps["mutable-content"]=1`.
- Для стабильности: URL без редиректов, корректный Content-Type, файл скачивается быстро.
- Картинка может показываться и без Extension в отдельных сценариях, но для **гарантированной**
  поддержки в нашей архитектуре (data payload + кастомная логика) Extension обязателен.
- На Android изображение рендерится нативно из `data.image` (у нас это делает `MentalaMessagingService`).

### 9.8. Контракт deep‑link (основной + fallback)

1. Если есть `data.deepLink`, используем его.
2. Иначе, если есть `data.action` и параметры (`trackId`/`practiceId`), маппим: `open_home` → `/`, `open_meditations` → `/meditations`, `open_meditation_track` + `trackId` → `/meditations?trackId=...`, `open_breath_practices` → `/breath-practices`, `open_breath_practice` + `practiceId` → `/breath-practices/<id>`.
3. Иначе используем `navigation` или `navType/navId` (обратная совместимость).
4. Иначе логируем событие в Sentry (чтобы не терять кейсы).

## 10. Паритет функционала (чек‑лист + как проверить)

1. Push Notifications (dev + prod) + deep‑link.
   Проверка: получить FCM token, увидеть запись в `user_devices`, отправить тест‑push, проверить открытие приложения и корректный deep‑link.
2. Rich push с изображениями.
   Проверка: отправить push с `image`, увидеть картинку в системном уведомлении (требует Extension).
3. Local Notifications (`@capacitor/local-notifications`).
   Проверка: запрос разрешения → запланировать локальное уведомление → получить его на устройстве.
4. Speech Recognition / микрофон (`@capacitor-community/speech-recognition`).
   Проверка: запрос permission микрофона, 5–10 секунд распознавания, корректное поведение при отказе.
5. Haptics (`@capacitor/haptics`).
   Проверка: короткая вибрация на ключевых действиях (например, старт/стоп практики).
6. Preferences (`@capacitor/preferences`).
   Проверка: перезапуск приложения, сохранённые значения остаются.
7. Social Login (Google) через `@capgo/capacitor-social-login`.
   Проверка: вход через Google на iOS, получение сессии, корректная авторизация API.
   Обязательно:
   `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` (iOS OAuth client id, формат `*.apps.googleusercontent.com`).
   В `Info.plist` должен быть `CFBundleURLTypes/CFBundleURLSchemes` с reverse client id
   (пример: `com.googleusercontent.apps.123456-abcdef`).
   В `AppDelegate` должен обрабатываться callback через `GIDSignIn.sharedInstance.handle(url)`.
8. StatusBar / SplashScreen (`@capacitor/status-bar`, `@capacitor/splash-screen`).
   Проверка: корректный цвет/стиль статус‑бара и splash при холодном старте.
9. Разделение dev/prod токенов.
   Проверка: dev‑пуш приходит только в dev‑приложение, prod‑пуш только в prod.

## 11. Если нужен отдельный Firebase‑проект для iOS

### 11.1. Когда это имеет смысл

- Требуется полная изоляция iOS от Android.
- Нужны разные Cloud Messaging ключи/настройки.

### 11.2. Шаги

1. Создать новый Firebase проект.
2. Добавить iOS приложение (bundle id тот же).
3. Скачать `GoogleService-Info.plist`.
4. Загрузить APNs key в Cloud Messaging.
5. Создать новый Service Account JSON.

### 11.3. Важное ограничение текущей архитектуры

- Сервер сейчас использует **один** `NUXT_FIREBASE_SERVICE_ACCOUNT_JSON`.
- FCM registration tokens привязаны к конкретному Firebase проекту.
- Значит сервер не сможет отправлять пуши и Android, и iOS, если они в разных проектах, без доп. доработки.

Варианты решения:

- Отдельные окружения/инстансы сервера на каждый Firebase проект.
- Доработка сервера под multi‑project FCM (несколько Firebase apps + routing по platform).

Рекомендация: пока не заложена multi‑project отправка, использовать **единый Firebase проект** для Android+iOS.

## 12. Подготовка к production (iOS)

- Настроить релизную подпись, provisioning profile.
- Проверить bundle id, версии, иконки.
- Собрать archive и загрузить в App Store Connect.
- Сделать TestFlight сборку в ближайший спринт и проверить пуши в релизной конфигурации.
- Проверить push на релизной сборке.

## 13. Troubleshooting

1. Нет токена. Проверь Permissions, Capabilities и методы в `AppDelegate`. Проверь, что `GoogleService-Info.plist` добавлен в target.
2. Пуши не приходят. Убедись, что на сервер ушёл FCM token (а не APNs token). Проверь, что APNs key загружен в Firebase.
3. Изображения не показываются. Скорее всего нет Notification Service Extension.
4. Dev‑сервер недоступен. Проверь `CAPACITOR_SERVER_URL`, наличие IP в `DEV_ALLOWED_ORIGINS`, и ATS ограничения.
5. Не запускается на iOS 13. Capacitor v7 официально поддерживает iOS 14+.
6. Dev‑сервер виден в браузере, но не в приложении. Проверь доступ Local Network в настройках iOS.
7. Пуш пришёл не в то приложение. Проверь bundle id, выбранную схему, правильный `GoogleService-Info.plist` и `X-App-Env`.
8. Google Login на iOS «ничего не делает». Проверь:
   `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` задан и попал в runtimeConfig;
   `CFBundleURLTypes` содержит reverse client id;
   в логах нет `No provider was initialized`.

## 14. Definition of Done (iOS)

1. iOS устройство регистрирует **FCM token** и он сохраняется в `user_devices` с `platform = ios`.
2. Тест‑push приходит в фоне, по тапу открывает приложение и корректный deep‑link.
3. Rich‑image пуш отображает картинку (если включена Extension).
4. Local Notifications приходят и не ломаются при перезапуске приложения.
5. Speech Recognition корректно работает с разрешениями (granted/denied).
6. TestFlight сборка установлена и пуши работают в релизной конфигурации.
7. Dev и prod пуши не пересекаются (разные bundle id и app_env).
8. Если в payload нет `deepLink` и `action`, событие фиксируется в Sentry.

## 15. Принятые решения

- Поддержка iOS: **14+**.
- iOS токены: только FCM token через `@capacitor-community/fcm`.
- Firebase проект: **один** (Android + iOS).
- TestFlight: готовим в ближайший спринт.
- Bundle id: `com.mentala.app` (prod) и `com.mentala.app.dev` (dev).
- Разделение окружений: `app_env` в `user_devices`, клиент шлёт `X-App-Env`.

## 16. Источники

- https://developer.apple.com/programs/enroll/
- https://developer.apple.com/help/account/membership/program-enrollment
- https://developer.apple.com/support/D-U-N-S/The
- https://developer.apple.com/help/account/identifiers/enable-app-capabilities/
- https://developer.apple.com/help/account/keys/create-a-private-key/
- https://developer.apple.com/help/account/capabilities/communicate-with-apns-using-authentication-tokens
- https://firebase.google.com/docs/cloud-messaging/ios/first-message
- https://firebase.google.com/docs/cloud-messaging/ios/get-started
- https://firebase.google.com/docs/cloud-messaging/send/admin-sdk
- https://firebase.google.com/docs/cloud-messaging/ios/get-started#setup_the_notification_service_extension
- https://firebase.google.com/docs/cloud-messaging/ios/send-image
- https://capacitorjs.com/docs/v7/ios
- https://capacitorjs.com/docs/v7/apis/push-notifications
- https://capacitorjs.jp/docs/v7/main/reference/support-policy
- https://developer.apple.com/videos/play/wwdc2020/10110/
- https://github.com/capacitor-community/fcm
