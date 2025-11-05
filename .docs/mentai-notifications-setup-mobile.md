# Гайд по настройке уведомлений (iOS, Android, Web) для Mentai

_Версия_: 1.2 • _Дата_: 2025-11-05

Этот документ описывает **практические шаги** для настройки инфраструктуры push‑уведомлений в приложении Mentai на iOS/Android/Web (Firebase FCM + APNs).

---

## 0. Предусловия

- Аккаунт **Firebase** (проект создан).
- Аккаунт **Apple Developer** (для APNs).
- **Android**: пакет `com.company.app` (замените на ваш), **iOS**: bundle id такой же.
- Репозиторий с **Capacitor** (iOS/Android платформы добавлены).

---

## 1. Firebase (FCM) — базовая настройка

1. В Firebase Console создайте проект → добавьте приложение **Android**, **iOS** и при необходимости **Web**.
2. Скачайте конфиги и добавьте в проект:
   - **Android**: `android/app/google-services.json`
   - **iOS**: `ios/App/App/GoogleService-Info.plist`
   - **Web** (если используете web‑pwa): добавьте web‑конфиг в инициализацию FCM.
3. На вкладке **Cloud Messaging** убедитесь, что **Server key (v1) / Legacy key** доступны для бэкенда (для Firebase Admin SDK).

Документация:

- Firebase FCM Overview — https://firebase.google.com/docs/cloud-messaging
- Firebase Admin — https://firebase.google.com/docs/admin/setup

---

## 2. iOS: APNs через FCM

1. В **Apple Developer → Certificates, Identifiers & Profiles**:
   - Создайте **Key** с включённым **Apple Push Notifications service (APNs)**.
   - Сохраните `AuthKey_XXXXXXXX.p8`, а также **Key ID** и **Team ID**.
2. В **Firebase Console → Project Settings → Cloud Messaging → iOS app**:
   - Загрузите `.p8`, укажите **Key ID** и **Team ID**.
3. В Xcode для iOS‑проекта (Capacitor):
   - Включите **Push Notifications** и **Background Modes → Remote notifications**.
   - Проверьте `Bundle Identifier` и соответствие с Firebase.
4. Соберите приложение на устройство, примите разрешение на уведомления.

Docs:

- APNs with FCM — https://firebase.google.com/docs/cloud-messaging/ios/client
- Apple Capabilities — https://developer.apple.com/documentation/usernotifications

---

## 3. Android: FCM

1. В `android/build.gradle` и `android/app/build.gradle` подключите Google Services и зависимости `com.google.firebase:firebase-messaging`.
2. Поместите `google-services.json` в `android/app/`.
3. Убедитесь, что `applicationId` совпадает с тем, что зарегистрирован в Firebase.
4. На Android 8+ создайте **Notification Channels** (Capacitor делает это через Local Notifications API или вручную).

Docs:

- Android client — https://firebase.google.com/docs/cloud-messaging/android/client

---

## 4. Capacitor плагины

Установите:

```bash
npm i @capacitor/push-notifications
npx cap sync
```

Docs:

- Capacitor Push — https://capacitorjs.com/docs/apis/push-notifications

---

## 5. Критичные проблемы при настройке

- **iOS**: не включены Capabilities (Push Notifications / Background Modes → Remote notifications).
- **Несовпадение bundle id / applicationId** с Firebase‑приложением.
- **Неверный APNs Key/Team ID/Key ID** в Firebase.
- **Android 13+**: не запрошено **POST_NOTIFICATIONS** (Capacitor делает через API).
- **Симулятор iOS** не получает push (используйте реальное устройство).

---

## 6. Полезные ссылки (официальные)

- Firebase Cloud Messaging — https://firebase.google.com/docs/cloud-messaging
- Admin SDK — https://firebase.google.com/docs/admin/setup
- iOS client — https://firebase.google.com/docs/cloud-messaging/ios/client
- Android client — https://firebase.google.com/docs/cloud-messaging/android/client
- Capacitor Push — https://capacitorjs.com/docs/apis/push-notifications
- Apple UNUserNotificationCenter — https://developer.apple.com/documentation/usernotifications

---

**Примечание:** Подробности реализации API, примеры кода и архитектуру см. в **mentai-notifications-AI-spec-v2.md**.
