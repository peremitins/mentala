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
- `DEV_ALLOWED_ORIGINS` в `.env.development` должен содержать `http://<LAN_IP>:3000`
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
- `pnpm cap:sync:device:standalone` — dev bundle из `.env.development`
- Перед `cap sync` скрипт автоматически синхронизирует iOS Google URL scheme в `Info.plist` из `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- iOS sync выполняется как `cap copy -> patch App.xcodeproj -> cap update`, чтобы CocoaPods 1.16.2 не падал на `objectVersion = 70` из Xcode 26
- Для static mobile сборок используется отдельный `buildDir` (`.nuxt-capacitor-release` / `.nuxt-capacitor-standalone`), чтобы параллельный `pnpm dev` не перетирал `.nuxt` и не ломал release manifest
- Перед mobile static generate скрипт очищает только mobile build-артефакты и их кэш, не трогая основной `.nuxt` dev-сервера
- Для static generate используется отдельный флаг `MENTALA_STATIC_GENERATE=true`; подменять `npm_lifecycle_event=generate` нельзя, иначе Nuxt может собрать release `index.html` с `@vite/client` и абсолютными путями в `node_modules`, что даёт белый экран в TestFlight
- Release-сборка теперь падает заранее, если в `.env.production` не заданы `NUXT_PUBLIC_API_SERVER_URL`, `NUXT_PRIVATE_API_BASE`, `NUXT_OAUTH_GOOGLE_CLIENT_ID` или `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Нет токена | Capabilities, AppDelegate methods, GoogleService-Info.plist в target |
| Пуши не приходят | Убедиться что отправлен FCM token (не APNs), APNs key загружен в Firebase |
| Нет картинок в пушах | Notification Service Extension не добавлен |
| Dev-сервер недоступен | `CAPACITOR_SERVER_URL`, `DEV_ALLOWED_ORIGINS`, ATS, Local Network permission |
| Не работает на iOS 14 | Минимум iOS 15+ (StoreKit 2) |
| Google Login молчит | Проверить, что `pnpm cap:sync` собран из `.env.production`, в `.env.production` есть `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`, а `Info.plist` содержит актуальный reverse client id |
| В release bundle попал старый Google Client ID | Очистить Nuxt build cache и пересобрать: `pnpm cap:sync` теперь делает это автоматически перед `nuxt generate` |
| Белый экран сразу после запуска TestFlight | Проверить `ios/App/App/public/index.html`: в корректной release-сборке не должно быть `/_nuxt/@vite/client`, `entry.async.js` и путей вида `node_modules/.pnpm/...`; теперь mobile release использует отдельный `buildDir`, поэтому даже при запущенном `pnpm dev` эта гонка не должна повторяться |
| `pod install` падает на `objectVersion = 70` | Повтори `pnpm cap:sync`: скрипт сам переводит `App.xcodeproj` в совместимый `objectVersion = 77` перед `cap update` |
| Push в не то окружение | Проверить `MENTALA_DB_ENV` бэкенда |
