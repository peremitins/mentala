# Инструкция по настройке Google OAuth для Mentala (Web + Mobile, dev + prod)

Ниже — подробная, «с нуля» инструкция как настроить OAuth так, чтобы работало **без костылей** на **Web, iOS, Android**, и чтобы переход в прод прошёл спокойно.

---

## 0. Важная идея (один раз понять и забыть)

Google OAuth **нельзя использовать с приватными IP** (192.168.x.x, 10.x.x.x, localhost) на мобильных. Поэтому:

- **Dev для мобилок** — через **публичный HTTPS-туннель**
- **Prod** — через **реальный домен**

Это не «костыль», это стандартная практика.

---

## 1. Что нужно в Google Cloud Console

### 1.1. Создать проект

1. Перейди на https://console.cloud.google.com/
2. Создай новый проект (например `mentala-auth`)
3. Включи API:
   - **OAuth consent screen** (экран согласия)
   - **Google Identity / OAuth**

### 1.2. Настроить OAuth Consent Screen

1. Тип: **External**
2. Заполни:
   - App name: Mentala
   - User support email
   - Developer contact email
3. Scopes оставь базовые (email, profile)
4. Если приложение **не прошло верификацию**, добавь тестовых пользователей (иначе логин будет работать только у владельца)

### 1.3. Создать OAuth Clients (раздел Credentials)

Тебе нужно **несколько** OAuth-клиентов:

1. **Web client (Dev)**

   - Для работы с dev-туннелем
   - Для локальной разработки на десктопе можно использовать `http://localhost:3000` как redirect URI (Google это разрешает)

2. **Web client (Prod)**

   - Для прод-домена

3. **Android client**

   - Для нативной авторизации в Android
   - Понадобятся: **Package name** и **SHA-1** сертификата (debug и/или release)

4. **iOS client**
   - Для нативной авторизации в iOS
   - Понадобится **Bundle ID** (и при необходимости Apple Team ID)

---

## 2. Настройка DEV (Web + Mobile)

### 2.1. Подними HTTPS-туннель (только если тестируешь web на телефоне)

Пример с `cloudflared`:

```bash
cloudflared tunnel --url http://localhost:3000
```

Ты получишь адрес вида:

```
https://random.trycloudflare.com
```

**Важно:** этот адрес и будет твоим `appUrl` в dev для web на телефоне.
Для десктопа можно работать через `http://localhost:3000` без туннеля.
Для **Capacitor‑приложения** OAuth‑туннель не нужен (используется нативный вход).

### 2.2. Добавь redirect URI в Google Console

Для **Web client (Dev)**:

**Authorized JavaScript origins:**

```
https://random.trycloudflare.com
```

**Authorized redirect URIs:**

```
https://random.trycloudflare.com/api/auth/google/callback
```

Если работаешь **только на десктопе** в dev, можно добавить:

```
http://localhost:3000
http://localhost:3000/api/auth/google/callback
```

### 2.3. Пропиши env в проекте

В `.env.development`:

```bash
NUXT_PUBLIC_APP_URL=https://random.trycloudflare.com
NUXT_OAUTH_GOOGLE_CLIENT_ID=<DEV_WEB_CLIENT_ID>
NUXT_OAUTH_GOOGLE_CLIENT_SECRET=<DEV_WEB_CLIENT_SECRET>
```

### 2.4. Запусти dev

```bash
pnpm dev
```

### 2.5. Проверка на телефоне

1. Открываешь `https://random.trycloudflare.com` на телефоне
2. Нажимаешь Google login
3. Должно отработать без ошибок `device_id/device_name`

---

## 3. Настройка PROD (Web)

Когда появится домен, например `https://mentala.app`:

### 3.1. Google Console (Web client Prod)

**Authorized JavaScript origins:**

```
https://mentala.app
```

**Authorized redirect URIs:**

```
https://mentala.app/api/auth/google/callback
```

### 3.2. Env для production

```bash
NUXT_PUBLIC_APP_URL=https://mentala.app
NUXT_OAUTH_GOOGLE_CLIENT_ID=<PROD_WEB_CLIENT_ID>
NUXT_OAUTH_GOOGLE_CLIENT_SECRET=<PROD_WEB_CLIENT_SECRET>
```

Готово. На Web в проде ничего больше менять не нужно.

---

## 4. Что делать для Android/iOS в проде (магазины)

### Рекомендованный подход: **Нативный Google Sign-In**

**Как работает:**

1. В приложении вызываешь нативный Google Sign-In
2. Получаешь **ID token**
3. Отправляешь его на свой backend
4. Backend валидирует токен и создаёт сессию

**Плюсы:**

- Стабильно в сторах
- Лучший UX
- Не требует редиректов

**Что нужно будет:**

- Android OAuth client (в Google Console)
- iOS OAuth client (в Google Console)
- Плагин `@capgo/capacitor-social-login`
- Backend endpoint `/api/auth/google/native` (уже добавлен)

**Что уже реализовано в проекте:**

- Нативный вход через `@capgo/capacitor-social-login`
- Backend валидация `idToken` в `/api/auth/google/native`
- Автоматический выбор режима: web → redirect, mobile → native

---

## 5. Нужно ли будет “что-то менять обратно” перед релизом?

Да, но **только конфигурацию**, а не авторизацию в целом.

### Что поменяется:

1. `NUXT_PUBLIC_APP_URL`:

   - dev: туннель
   - prod: реальный домен

2. OAuth Client IDs:

   - dev web client → prod web client
   - появятся отдельные **Android/iOS clients**

3. Способ запуска OAuth на мобилке:
   - dev: нативный sign-in (как в проде)
   - prod: нативный sign-in

### Что НЕ нужно переписывать:

- основную логику авторизации
- серверную валидацию профиля
- линковку аккаунтов

---

## 6. Как лучше подготовиться уже сейчас

1. **Разделить OAuth по платформам**

   - Web: `/api/auth/google/start`
   - Mobile: нативный вход → `/api/auth/google/native`

2. **Все значения держать в env**

   - `NUXT_PUBLIC_APP_URL`
   - `NUXT_OAUTH_GOOGLE_CLIENT_ID`
   - `NUXT_OAUTH_GOOGLE_CLIENT_SECRET`
   - `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` (только для iOS)

3. **На фронте сделать единый метод loginWithGoogle()**

   - Web → редирект
   - Mobile → native sign-in

4. **PKCE для web/SPA**
   - Для web в проде используй Authorization Code Flow + **PKCE**
   - Это обязательная современная практика, если клиент не может безопасно хранить secret

---

## 7. FAQ

**Вопрос:** «Можно ли просто добавить device_id/device_name и оставить приватный IP?»

**Ответ:** Нет. Это не решает проблему. Google блокирует приватные IP на уровне OAuth.

**Вопрос:** «Что лучше для dev на мобильном?»

**Ответ:** Нативный Google Sign-In (как в проде). HTTPS‑туннель нужен только для web‑режима.

**Вопрос:** «Нужно ли заводить отдельные Google OAuth клиенты?»

**Ответ:** Да. Минимум два: dev web и prod web. В проде для мобильных нужны Android/iOS клиенты.

---

---

## 8. Как запустить после внедрения (пошагово)

### 8.1. Общие зависимости

```bash
pnpm install
```

### 8.2. ENV (dev)

```bash
NUXT_PUBLIC_APP_URL=http://localhost:3000
NUXT_OAUTH_GOOGLE_CLIENT_ID=<WEB_CLIENT_ID>
NUXT_OAUTH_GOOGLE_CLIENT_SECRET=<WEB_CLIENT_SECRET>
NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID=<IOS_CLIENT_ID> # только для iOS
```

### 8.3. Web (dev)

1. В Google Console добавь redirect URI:

```
http://localhost:3000/api/auth/google/callback
```

2. Запусти dev:

```bash
pnpm dev
```

### 8.4. Android (dev)

0. Если нужен live reload, задай `CAPACITOR_SERVER_URL=http://<IP_ПК>:3000` перед sync.
1. Выполни sync Capacitor:

```bash
pnpm cap:sync
```

2. Убедись, что эмулятор с Google Play Services.
3. Открой Android Studio:

```bash
pnpm cap:open:android
```

4. Запусти приложение → вход через Google будет через нативный SDK.

### 8.5. iOS (dev)

0. Если нужен live reload, задай `CAPACITOR_SERVER_URL=http://<IP_ПК>:3000` перед sync.
1. Выполни sync Capacitor:

```bash
pnpm cap:sync
```

2. В `Info.plist` добавь `CFBundleURLTypes` с reversed client id.
3. Открой Xcode и собери приложение.

---

Если нужно, могу добавить `.env.example` и отдельный checklist для Android/iOS подписи.
