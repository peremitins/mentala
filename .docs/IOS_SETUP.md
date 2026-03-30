# Mentala — iOS Setup

## Принятые решения

- **iOS 15+** (StoreKit 2 only)
- Bundle ID: `com.mentala.app`
- Токены: только FCM (через `@capacitor-community/fcm`), APNs token не используется сервером
- Firebase: один проект на Android + iOS (сервер поддерживает только один `NUXT_FIREBASE_SERVICE_ACCOUNT_JSON`)
- Разделение dev/prod: серверный `MENTALA_DB_ENV`/`NODE_ENV` → поле `app_env` в `user_devices`

## Bootstrap (Capacitor v7)

```bash
pnpm add @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios          # или: open ios/App/App.xcworkspace
```

## Dev на устройстве (live reload)

```bash
pnpm dev
pnpm cap:sync:device      # определит LAN-IP, выставит CAPACITOR_SERVER_URL, синхронизирует
```

- iPhone и Mac в одной сети (без client isolation)
- `DEV_ALLOWED_ORIGINS` в `.env.development` должен содержать LAN-origin, который реально использует mobile runtime: `http://<LAN_IP>` через Caddy или `http://<LAN_IP>:3000` при прямом входе в Nuxt
- ATS: в `Info.plist` добавить исключение для локального IP (убрать перед релизом):

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSExceptionDomains</key>
  <dict>
    <key>192.168.0.100</key>
    <dict>
      <key>NSIncludesSubdomains</key><true/>
      <key>NSTemporaryExceptionAllowsInsecureHTTPLoads</key><true/>
    </dict>
  </dict>
</dict>
```

- iOS 15+ запросит Local Network access — разрешить
- Перед релизом: `pnpm cap:sync:prod` (убирает `server.url` из конфигов)

## Push-уведомления

### Настройка

1. **Apple Developer Portal**: создать App ID `com.mentala.app` с Push capability, выпустить APNs key (p8)
2. **Firebase Console**: добавить iOS-приложение `com.mentala.app`, загрузить APNs key в Cloud Messaging, скачать `GoogleService-Info.plist`
3. **Xcode**: добавить `GoogleService-Info.plist` в target, включить Push Notifications + Background Modes → Remote notifications
4. **Entitlements**: `Debug` должен использовать `App.entitlements` с `aps-environment=development`, а `Release/TestFlight` — `AppRelease.entitlements` с `aps-environment=production`

Подробности: [Firebase iOS setup](https://firebase.google.com/docs/cloud-messaging/ios/first-message)

### AppDelegate.swift

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}
func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
  NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

### FCM token (критично!)

`@capacitor/push-notifications` на iOS даёт APNs token — он **не подходит** для нашего сервера. Нужен FCM token:

```bash
pnpm add @capacitor-community/fcm
npx cap sync ios
```

После `PushNotifications.register()` → `FCM.getToken()` → отправить в `/api/notifications/register-token`. Если FCM token не получен — не регистрировать APNs token.

### Rich Notifications (изображения)

Требуется Notification Service Extension (Xcode → File → New → Target → Notification Service Extension). Extension скачивает картинку из `data.image` (fallback: `fcm_options.image`) и прикрепляет как `UNNotificationAttachment`. При ошибке — показать push без картинки.

### Deep-link контракт

Приоритет: `data.deepLink` → `data.action` + параметры → `navigation`/`navType/navId` → Sentry event.

## Google Login

- `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` (формат `*.apps.googleusercontent.com`)
- `Info.plist`: `CFBundleURLTypes/CFBundleURLSchemes` с reverse client id
- `AppDelegate`: обработка callback через `GIDSignIn.sharedInstance.handle(url)`
- `pnpm cap:sync` / `pnpm cap:sync:prod` для release/TestFlight используют `.env.production`
- `pnpm cap:sync:device:wireless` — live reload по LAN из `.env.development` без USB; после первой установки/запуска приложение тянет изменения прямо с `pnpm dev`
- Для iOS Realtime Voice в `device:wireless` не гарантируется, пока dev-origin остаётся HTTP LAN, а не `https://...` или `localhost`
- Перед `cap sync` скрипт автоматически синхронизирует iOS Google URL scheme в `Info.plist` из `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- iOS sync выполняется как `cap copy -> patch App.xcodeproj -> cap update`, чтобы CocoaPods 1.16.2 не падал на `objectVersion = 70` из Xcode 26
- Для static mobile сборок используется отдельный `buildDir` (`.nuxt-capacitor-release`), чтобы параллельный `pnpm dev` не перетирал `.nuxt` и не ломал release manifest
- Перед release mobile static generate скрипт очищает только mobile build-артефакты и их кэш, не трогая основной `.nuxt` dev-сервера
- Для static generate используется отдельный флаг `MENTALA_STATIC_GENERATE=true`; подменять `npm_lifecycle_event=generate` нельзя, иначе Nuxt может собрать release `index.html` с `@vite/client` и абсолютными путями в `node_modules`, что даёт белый экран в TestFlight
- Release-сборка теперь падает заранее, если в `.env.production` не заданы `NUXT_PUBLIC_API_SERVER_URL`, `NUXT_PRIVATE_API_BASE`, `NUXT_OAUTH_GOOGLE_CLIENT_ID` или `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`

## Тестирование платёжного flow (Storefront override)

В TestFlight `Storefront.current` возвращает storefront sandbox-аккаунта, а не реального Apple ID.
Для России sandbox-аккаунт может возвращать неожиданный регион, поэтому добавлен URL-scheme override.

### Как установить override

Открой **Safari на iPhone** и введи в адресной строке:

| Цель | URL |
|------|-----|
| RU flow (YooKassa, внешняя ссылка) | `mentala://debug/storefront?code=RU` |
| WW flow (Apple IAP, StoreKit) | `mentala://debug/storefront?code=US` |
| Сброс (реальный StoreKit) | `mentala://debug/storefront?reset` |

После открытия приложение покажет алерт с подтверждением. Затем открой страницу подписки — flow применится.

**Важно:** override работает только в TestFlight и DEBUG-сборках. В App Store production игнорируется.

### Диагностика через Console.app

1. Подключи iPhone к Mac по USB
2. Открой **Console.app** → выбери устройство
3. Фильтр: `[Storefront]`
4. Открой страницу подписки в приложении — в консоли появятся строки вида:
   ```
   [Storefront] SK2 countryCode=POL normalized=PL
   [Storefront] SK1 fallback=nil
   [Storefront] locale fallback=RU
   ```
   Это покажет точно, какой источник сработал и какой код вернул.

### Sandbox-аккаунты для тестирования разных регионов

Создаются в App Store Connect → **Users and Access → Sandbox → Тестовые учётные записи**.
Email должен быть **не зарегистрирован** ни в каком Apple ID (Gmail `+` alias работает: `you+sandbox-ru@gmail.com`).

| Аккаунт | Регион | Тестирует |
|---------|--------|-----------|
| `hello@mentala.app` | Россия | RU flow (YooKassa) |
| любой второй | Польша / США | WW flow (Apple IAP) |

Переключение на устройстве: **Настройки → Основные → VPN и управление устройством → Разработчик → Тестовый аккаунт Apple** (на iOS 16+: Настройки → Developer).

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Нет токена | Capabilities, AppDelegate methods, GoogleService-Info.plist в target |
| Пуши не приходят | Убедиться что отправлен FCM token (не APNs), APNs key загружен в Firebase |
| Локальная iOS-сборка получает push, а TestFlight нет | Проверить release entitlements (`aps-environment=production`), что release-архив не подписан как development, и что APNs production credentials загружены именно в Firebase project из `GoogleService-Info-Prod.plist` |
| Нет картинок в пушах | Notification Service Extension не добавлен |
| Dev-сервер недоступен | `CAPACITOR_SERVER_URL`, `DEV_ALLOWED_ORIGINS`, ATS, Local Network permission |
| Не работает на iOS 14 | Минимум iOS 15+ (StoreKit 2) |
| Google Login молчит | Проверить, что `pnpm cap:sync` собран из `.env.production`, в `.env.production` есть `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`, а `Info.plist` содержит актуальный reverse client id |
| В release bundle попал старый Google Client ID | Очистить Nuxt build cache и пересобрать: `pnpm cap:sync` теперь делает это автоматически перед `nuxt generate` |
| Белый экран сразу после запуска TestFlight | Проверить `ios/App/App/public/index.html`: в корректной release-сборке не должно быть `/_nuxt/@vite/client`, `entry.async.js` и путей вида `node_modules/.pnpm/...`; теперь mobile release использует отдельный `buildDir`, поэтому даже при запущенном `pnpm dev` эта гонка не должна повторяться |
| `pod install` падает на `objectVersion = 70` | Повтори `pnpm cap:sync`: скрипт сам переводит `App.xcodeproj` в совместимый `objectVersion = 77` перед `cap update` |
| Push в не то окружение | Проверить `MENTALA_DB_ENV` бэкенда |
