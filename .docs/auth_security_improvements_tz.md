# ТЗ: Улучшение безопасности системы авторизации

## 📋 Статус

**Статус:** ✅ Реализовано  
**Приоритет:** Высокий  
**Оценка:** 2-3 недели разработки

---

## 🎯 Цель

Улучшить безопасность системы авторизации, устранив выявленные уязвимости и внедрив современные практики безопасности для защиты от XSS, CSRF и других атак.

---

## 🛡️ Модель угроз

**Важно:** Понимание ограничений и компромиссов системы безопасности.

### CSRF защита

- **CSRF защищает от:** внешних сайтов, которые заставляют браузер автоматически отправлять cookie с запросами
- **CSRF НЕ защищает от:** XSS-атак. Если злоумышленник может выполнить JavaScript на нашем сайте, он может украсть CSRF токен и обойти CSRF защиту
- **CSRF cookie "не-httpOnly":** это осознанный компромисс для Double Submit Cookie паттерна. Параллельно необходимо усиливать защиту от XSS через CSP и санитайзинг

### Разделение каналов аутентификации

- **Web (cookie):** автоматически прикрепляется браузером → требует CSRF защиту
- **Mobile (X-Session-Token header):** не прикрепляется автоматически → CSRF не требуется, но нужны другие меры (origin checks, rate limit, session binding)

### Ограничения SameSite=Strict

- Защищает от cross-site запросов, но может ломать интеграции с разными поддоменами
- Требует проверки доменной схемы (same-site правила браузеров)

---

## 🔍 Текущее состояние

### Что работает хорошо:

- ✅ HttpOnly cookie для защиты от XSS
- ✅ Secure flag в production
- ✅ Проверка истечения сессий (30 дней)
- ✅ Проверка отзыва сессий
- ✅ Хранение сессий в БД
- ✅ Rate limiting middleware
- ✅ Security headers (X-Frame-Options, X-Content-Type-Options)

### Выявленные проблемы:

1. **Токен в localStorage** (Критично)

   - Токен хранится в localStorage и передается через заголовок
   - Уязвимость к XSS-атакам
   - Риск кражи токена через JavaScript

2. **Нет CSRF защиты** (Высокий приоритет)

   - Отсутствуют CSRF токены
   - Уязвимость к CSRF-атакам
   - Особенно критично для state-changing операций

3. **SameSite=Lax** (Средний приоритет)

   - Менее строгая защита, чем SameSite=Strict
   - Потенциальная уязвимость к некоторым CSRF-атакам

4. **Долгий срок жизни сессии** (Средний приоритет)

   - 30 дней — слишком долго
   - Увеличивает риск компрометации

5. **Нет проверки IP/User-Agent** (Низкий приоритет)
   - Сессия может быть использована с другого устройства/IP
   - Нет защиты от кражи сессии

---

## 🎯 Требования

### 1. Убрать localStorage для Web (Критично)

**Проблема:**  
Токен сессии хранится в localStorage и передается через заголовок `X-Session-Token`, что делает его уязвимым к XSS-атакам.

**Решение:**

- Использовать **только httpOnly cookie** для web-приложения
- Заголовок `X-Session-Token` использовать **только для Capacitor** (мобильные приложения)
- Убрать сохранение токена в localStorage для web

**Требования:**

- [ ] Убрать сохранение `sessionToken` в localStorage в `app/stores/auth.ts` для web
  - Проверять платформу через `Capacitor.isNativePlatform()`
  - Сохранять токен в localStorage **только для Capacitor**
- [ ] Обновить `app/plugins/api.ts`:
  - Отправлять `X-Session-Token` **только для Capacitor** (проверка через `Capacitor.isNativePlatform()`)
  - Для web полагаться только на cookie (credentials: 'include' уже установлен)
- [ ] Обновить `server/application/auth/session.ts`:
  - Приоритет cookie над заголовком (уже реализовано)
  - Определять канал аутентификации (cookie vs header) и логировать в `security_events`
  - При использовании заголовка на web-запросе:
    - Логировать событие `auth_header_used_on_web` в `security_events`
    - Отправлять метрику/алерт (Sentry/Prometheus)
  - **Безопасное поведение при наличии обоих (cookie и X-Session-Token):**
    - Если пришли оба и они разные → это подозрительно
    - Логировать событие `auth_dual_channel_mismatch` в `security_events`
    - Выбирать cookie (приоритет cookie над header)
    - **Опционально (жёстче, но безопаснее):** возвращать 400/401 при несовпадении
- [ ] Обновить документацию для Postman (использовать cookie вместо заголовка)

**Критерии приемки:**

- Web-приложение использует только httpOnly cookie (проверка через DevTools)
- Capacitor использует заголовок `X-Session-Token` (проверка через логи)
- Токен не хранится в localStorage для web (проверка через DevTools)
- Все тесты проходят
- E2E тесты для web и мобильных платформ проходят отдельно
- Протестировано в режиме разработки:
  - ✅ Web (localhost:3000)
  - ✅ Capacitor Dev (физическое устройство)
  - ✅ Android Studio эмулятор

---

### 2. Добавить CSRF защиту (Высокий приоритет)

**Проблема:**  
Отсутствует защита от CSRF-атак. Злоумышленник может выполнить действия от имени пользователя.

**Решение:**  
Реализовать **Double Submit Cookie** паттерн:

- При логине генерировать CSRF токен и сохранять в **не-httpOnly cookie** (для Double Submit Cookie паттерна)
- Требовать CSRF токен в заголовке для state-changing операций (POST, PUT, DELETE, PATCH)
- Проверять совпадение токена из cookie и заголовка

**Требования:**

#### 2.1. Генерация CSRF токена

- [ ] Создать функцию `generateCSRFToken()` в `server/application/auth/csrf.ts`
- [ ] При создании сессии генерировать CSRF токен
- [ ] Сохранять CSRF токен в **не-httpOnly cookie** `mentala.csrf` (для Double Submit Cookie паттерна)
  - **Важно:** Cookie НЕ должна быть httpOnly, чтобы JavaScript мог прочитать её для отправки в заголовке
  - Cookie должна быть `secure: isProd` (false в development, true в production)
  - Cookie должна быть `sameSite: 'strict'` в production, `sameSite: 'lax'` в development (особенно для localhost)
  - См. раздел "Особенности режима разработки" для деталей
- [ ] Срок жизни CSRF токена = срок жизни сессии
- [ ] **Важно:** `maxAge` для CSRF cookie выставляется динамически = текущий `maxAge` сессии (не зашивать в константу)
- [ ] Использовать константу `SESSION_MAX_AGE_SECONDS` или вычислять из `expiresAt - createdAt` сессии

#### 2.2. Проверка CSRF токена

- [ ] Создать middleware `server/middleware/csrf.ts`
- [ ] **Важно:** CSRF проверка применяется **только для cookie-аутентификации**
  - Если аутентификация через cookie → требуем CSRF токен
  - Если аутентификация через `X-Session-Token` → CSRF не требуем (это не автоматически прикрепляемый credential)
- [ ] **Порядок выполнения (критично):**
  1. Попытка аутентификации (cookie/header) — определить канал и валидировать сессию
  2. Если выбрана cookie-сессия (сессия валидна) и метод state-changing → CSRF check
  3. Затем обработчик endpoint
- [ ] Определять канал аутентификации по факту выбранной стратегии:
  - Если валидировали сессию из cookie (сессия валидна) → cookie-канал и требуем CSRF
  - Если валидировали по `X-Session-Token` (сессия валидна) → header-канал и CSRF не нужен
  - **Не определять канал только по наличию cookie** (cookie может быть просрочена/ревокнута/мусорная)
- [ ] Для cookie-канала проверять CSRF токен для state-changing операций:
  - Методы: POST, PUT, DELETE, PATCH
  - **Правило:** CSRF обязателен независимо от Content-Type (включая случаи, когда Content-Type отсутствует)
  - **Особенно критично для "простых форм":** application/x-www-form-urlencoded, multipart/form-data, text/plain (это любимая дорожка для CSRF-атак)
  - Content-Type список (`application/json`, `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) — это пояснение/тест-кейсы, а не условие проверки
- [ ] Исключить из проверки (публичные endpoints):
  - `/api/auth/email/login` (публичный логин)
  - `/api/auth/email/register` (публичная регистрация)
  - `/api/auth/*/callback` (OAuth callbacks: `/api/auth/google/callback`, `/api/auth/vk/callback` и т.д.)
  - `/api/payments/yookassa/webhook` (webhook от внешних сервисов)
  - Публичные webhooks (все endpoints, принимающие webhook от внешних сервисов)
  - Публичные health/status endpoints (если есть)
  - GET/HEAD/OPTIONS методы (по определению не state-changing)
- [ ] **Правило исключений:** Исключения применяются только для публичных endpoints и не должны включать ничего, что меняет состояние при наличии cookie-auth пользователя
- [ ] **Важно:** Аутентифицированные endpoints под `/api/auth/*` (logout, logout-everywhere, change-password и т.д.) **должны** проходить CSRF проверку
- [ ] Сравнивать токен из cookie `CSRF_COOKIE_NAME` с заголовком `X-CSRF-Token` (см. раздел "Константы cookie")
- [ ] При несовпадении возвращать 403 с понятным сообщением
- [ ] Логировать CSRF failures в `security_events` (event_type: 'csrf_mismatch')

#### 2.3. Frontend интеграция

- [ ] Создать composable `app/composables/useCSRF.ts`
- [ ] **Только для Web:** При каждом запросе (POST, PUT, DELETE, PATCH) читать CSRF токен из cookie через `document.cookie` или `useCookie()`
- [ ] **Только для Web:** Добавлять CSRF токен в заголовок `X-CSRF-Token`
- [ ] Обрабатывать ошибку 403 (CSRF token mismatch) с понятным сообщением пользователю
- [ ] **Для Capacitor:** CSRF токен не требуется, так как используется заголовок `X-Session-Token` (не автоматически прикрепляемый credential)

#### 2.4. Обновление API клиента

- [ ] Обновить `app/plugins/api.ts` для автоматической отправки CSRF токена
- [ ] Обрабатывать ошибки CSRF (403) с понятным сообщением

**Критерии приемки:**

- CSRF токен генерируется при логине
- CSRF токен проверяется для всех state-changing операций
- CSRF токен автоматически отправляется с фронтенда
- Тесты на CSRF защиту проходят
- Postman документация обновлена
- Протестировано в режиме разработки:
  - ✅ Web (localhost:3000) - CSRF токен читается из cookie
  - ✅ Capacitor Dev - fallback на заголовок `X-Session-Token` работает
  - ✅ Android Studio эмулятор - все работает корректно

---

### 3. Улучшить SameSite политику (Средний приоритет)

**Проблема:**  
Используется `sameSite: 'lax'`, что менее строго, чем `strict`.

**Решение:**

- Использовать `sameSite: 'strict'` для cookie сессии и CSRF cookie **где возможно**
- Для OAuth callback использовать `sameSite: 'lax'` (OAuth требует cross-site cookie)

**Требования:**

- [ ] Обновить `server/application/auth/session.ts`:
  - Использовать константы `SESSION_COOKIE_NAME` и `CSRF_COOKIE_NAME` (см. раздел "Константы cookie")
  - `sameSite: 'strict'` для cookie сессии в production
  - `sameSite: 'lax'` для cookie сессии в development (всегда, включая LAN)
  - `sameSite: 'strict'` для CSRF cookie в production
  - `sameSite: 'lax'` для CSRF cookie в development (всегда, включая LAN)
  - Использовать `secure: isProd` для всех cookies
  - **Проверить доменную схему:** если API и фронтенд на разных поддоменах (например app.example.com и api.example.com), убедиться, что они считаются same-site браузером
  - **Cookie префикс `__Host-` (чеклист требований):**
    - ✅ `path: '/'` обязателен
    - ✅ `domain` не задавать в prod при `__Host-` (domain: undefined)
    - ✅ `secure: true` обязательно (только HTTPS)
    - ✅ Использовать только на HTTPS (production)
    - ✅ Иначе браузер игнорирует cookie
  - См. раздел "Особенности режима разработки" для деталей
- [ ] Обновить `server/application/auth/oauth.ts`:
  - Использовать константы `OAUTH_STATE_COOKIE_NAME` и `OAUTH_REDIRECT_COOKIE_NAME` (см. раздел "Константы cookie")
  - Для OAuth state cookie использовать `sameSite: 'lax'` (OAuth callback требует cross-site)
  - Для OAuth redirect cookie использовать `sameSite: 'lax'`
- [ ] Протестировать работу с OAuth (Google, VK):
  - ✅ OAuth callback должен работать корректно
  - ✅ Сессия должна создаваться после OAuth callback
  - ✅ CSRF токен должен быть доступен после OAuth логина
- [ ] Протестировать на staging домене (если отличается от production):
  - Проверить работу cookies между поддоменами
  - Убедиться, что SameSite политика работает корректно

**Критерии приемки:**

- Cookie сессии и CSRF используют `sameSite: 'strict'` в production (кроме OAuth cookies)
- Cookie сессии и CSRF используют `sameSite: 'lax'` в development (для совместимости с localhost)
- OAuth работает корректно с `sameSite: 'lax'` для state/redirect cookies (всегда)
- Все тесты проходят
- E2E тесты OAuth флоу проходят
- Протестировано на всех платформах разработки (Web, Capacitor Dev, Android Studio)

---

### 4. Сократить срок жизни сессии (Средний приоритет)

**Проблема:**  
Срок жизни сессии 30 дней — слишком долго, увеличивает риск компрометации.

**Решение:**

- Сократить срок жизни сессии до **7 дней**
- Добавить механизм **автоматического продления** при активности пользователя
- Добавить **refresh tokens** для долгоживущих сессий (опционально, для будущего)

**Требования:**

#### 4.1. Сократить срок жизни

- [ ] Обновить `server/application/auth/session.ts`:
  - Изменить срок жизни с 30 дней на 7 дней
  - Обновить `maxAge` в cookie

#### 4.2. Автоматическое продление

- [ ] Добавить поле `lastExtendedAt` в таблицу `sessions` для отслеживания последнего продления
- [ ] При каждом успешном запросе проверять:
  - Истекает ли сессия в течение 1 дня
  - Прошло ли более 12 часов с последнего продления (`lastExtendedAt`)
- [ ] Если условия выполнены — автоматически продлевать на 7 дней
- [ ] Обновлять `expiresAt` и `lastExtendedAt` в БД и `maxAge` в cookie
- [ ] **Абсолютный максимум:** Добавить поле `createdAt` и проверять, что сессия не старше 30-60 дней (настраиваемый параметр)
- [ ] Если сессия достигла абсолютного максимума — требовать ре-логин

#### 4.3. Refresh tokens (опционально, для будущего)

- [ ] Создать таблицу `refresh_tokens` в БД
- [ ] При логине создавать refresh token (срок жизни 30 дней)
- [ ] Endpoint `/api/auth/refresh` для обновления access token
- [ ] Использовать refresh token для автоматического обновления сессии
- [ ] **Важно для web:** Refresh token хранить только в httpOnly cookie, **не в localStorage** (защита от XSS)
- [ ] Для Capacitor refresh token может передаваться через заголовок (аналогично session token)

**Критерии приемки:**

- Срок жизни сессии = 7 дней
- Сессия автоматически продлевается при активности
- Пользователь не замечает изменений (seamless experience)
- Все тесты проходят

---

### 5. Добавить проверку IP/User-Agent (Низкий приоритет)

**Проблема:**  
Сессия может быть использована с другого устройства/IP, нет защиты от кражи сессии.

**Решение:**

- Сохранять IP и User-Agent при создании сессии
- При критичных операциях проверять совпадение IP/User-Agent
- Показывать предупреждение при несовпадении

**Требования:**

#### 5.1. Сохранение IP/User-Agent

- [ ] Уже реализовано в `server/application/auth/session.ts` (проверить)
- [ ] Убедиться, что IP и User-Agent сохраняются при создании сессии

#### 5.2. Проверка при критичных операциях (Soft Check)

- [ ] Определить список критичных операций:
  - Изменение пароля
  - Изменение email
  - Удаление аккаунта
  - Изменение подписки
  - Изменение платежных данных
- [ ] Создать функцию `verifySessionOrigin(sessionId, currentIP, currentUA)` с мягкой проверкой:
  - **User-Agent:** сравнивать "грубо" (семейство браузера/платформа), не точное совпадение
  - **IP:** не банить, а:
    - Логировать событие в `security_events` (event_type: 'ip_mismatch' или 'ua_mismatch')
    - Показывать предупреждение пользователю
    - Требовать повторный ввод пароля для критичных операций
    - **Будущее:** учитывать подсеть/ASN для более умной проверки
- [ ] При несовпадении:
  - Показывать предупреждение пользователю (не блокировать)
  - Требовать подтверждение (например, повторный ввод пароля) для критичных операций
  - Логировать событие в `security_events` таблицу

#### 5.3. Уведомления о подозрительной активности

- [ ] Создать таблицу `security_events` для логирования подозрительных событий
- [ ] При несовпадении IP/User-Agent логировать событие
- [ ] Отправлять email-уведомление пользователю (опционально)

**Критерии приемки:**

- IP и User-Agent сохраняются при создании сессии
- Проверка выполняется для критичных операций
- Пользователь получает предупреждение при несовпадении
- События логируются
- Все тесты проходят

---

## 📊 План реализации

### Фаза 1: Критичные исправления (1 неделя) ✅

1. ✅ Убрать localStorage для Web
2. ✅ Добавить CSRF защиту
3. ✅ Обновить документацию
4. ✅ Защитить платные API endpoints (TTS, STT, HeyGen)
5. ✅ Исправить утечки в логах (токены, OAuth codes)
6. ✅ Закрыть админские API (requireAdmin)

### Фаза 2: Улучшения безопасности (1 неделя) ✅

4. ✅ Улучшить SameSite политику
5. ✅ Сократить срок жизни сессии
6. ✅ Добавить автоматическое продление
7. ✅ Добавить Origin/Referer checks для cookie-канала
8. ✅ Исправить определение канала аутентификации (приоритет header для Capacitor)
9. ✅ Убрать sessionToken из web-ответов login/register

### Фаза 3: Дополнительные меры (1 неделя) ✅

10. ✅ Добавить проверку IP/User-Agent (soft check)
11. ✅ Добавить обработчик unhandled rejections
12. ✅ Добавить логирование security events
13. ✅ Rotate session ID при логине и критичных операциях
14. ✅ Endpoint для logout everywhere (ревокация всех сессий)
15. ✅ Исправить баг смены пароля админом (revokeAllUserSessions вместо rotateSessionId)
16. ✅ Убрать passwordHash из ответов API
17. ✅ Реализовать admin middleware через серверный API

---

## 🗄️ Изменения в БД

### Процесс миграций

В проекте используется **Drizzle ORM** с **Drizzle Kit** для управления миграциями:

1. **Изменения схемы:** Все изменения структуры БД выполняются в файле `server/infrastructure/db/schema.ts`
2. **Генерация миграций:** После изменения schema.ts выполнить:
   ```bash
   pnpm db:generate
   ```
   Это создаст SQL-файлы миграций в `server/infrastructure/db/migrations/`
3. **Применение миграций:** После генерации выполнить:
   ```bash
   pnpm db:migrate
   ```
   Это применит миграции к базе данных

**Важно:**

- Файлы миграций вручную больше не создавать (только если об этом не попросят явно)
- Все изменения через schema.ts → db:generate → db:migrate
- SQL-файлы хранятся для совместимости с будущими системами (см. `.docs/architecture.md`)

### Новая таблица: `security_events`

Добавить в `server/infrastructure/db/schema.ts`:

```typescript
export const securityEvents = pgTable(
  'security_events',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }), // nullable: события могут логироваться до определения user
    eventType: varchar('event_type', { length: 50 }).notNull(), // 'csrf_mismatch', 'ip_mismatch', 'ua_mismatch', 'suspicious_login', 'origin_mismatch'
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'), // может содержать sessionId, requestId, anonymousSession для расследования инцидентов
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userCreatedIdx: index('idx_security_events_user_created').on(
      table.userId,
      table.createdAt
    ),
    // Индекс для поиска событий без userId (для расследования)
    eventTypeCreatedIdx: index('idx_security_events_type_created').on(
      table.eventType,
      table.createdAt
    ),
  })
);
```

После добавления выполнить:

- `pnpm db:generate`
- `pnpm db:migrate`

### Новая таблица: `refresh_tokens` (опционально, для будущего)

Добавить в `server/infrastructure/db/schema.ts`:

```typescript
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index('idx_refresh_tokens_user').on(table.userId),
    tokenIdx: index('idx_refresh_tokens_token').on(table.token),
  })
);
```

После добавления выполнить:

- `pnpm db:generate`
- `pnpm db:migrate`

### Обновление таблицы: `sessions`

Добавить поле `lastExtendedAt` в существующую таблицу `sessions`:

```typescript
// В server/infrastructure/db/schema.ts обновить sessions:
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: integer('user_id').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastExtendedAt: timestamp('last_extended_at', { withTimezone: true }), // НОВОЕ ПОЛЕ
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
});
```

После добавления выполнить:

- `pnpm db:generate`
- `pnpm db:migrate`

---

## 🔧 Технические детали

### Константы cookie

**Важно:** Использовать константы для имен cookie во всех местах кода, чтобы избежать несостыковок при использовании префикса `__Host-`.

- [ ] Создать константы в `server/application/auth/session.ts`:
  ```typescript
  const SESSION_COOKIE_NAME = 'mentala.sid';
  const CSRF_COOKIE_NAME = 'mentala.csrf';
  ```
- [ ] Создать константы для OAuth cookies в `server/application/auth/oauth.ts`:
  ```typescript
  const OAUTH_STATE_COOKIE_NAME = 'mentala.oauth.state';
  const OAUTH_REDIRECT_COOKIE_NAME = 'mentala.oauth.redirect';
  ```
- [ ] **Правило:** Все cookie-имена должны быть через константы (включая OAuth cookies), чтобы избежать рассинхронизации
- [ ] Использовать эти константы везде:
  - При установке cookies
  - При чтении cookies
  - В middleware для определения канала аутентификации
  - При проверке CSRF токена
  - При работе с OAuth cookies
- [ ] В production использовать префикс `__Host-`:
  ```typescript
  const sessionCookieName = isProd
    ? `__Host-${SESSION_COOKIE_NAME}`
    : SESSION_COOKIE_NAME;
  const csrfCookieName = isProd
    ? `__Host-${CSRF_COOKIE_NAME}`
    : CSRF_COOKIE_NAME;
  ```
- [ ] **Чеклист для `__Host-` префикса (обязательно):**
  - ✅ `path: '/'` обязателен
  - ✅ `domain` не задавать (domain: undefined)
  - ✅ `secure: true` обязательно (только HTTPS)
  - ✅ Использовать только на HTTPS (production)

### CSRF токен

- **Длина:** 32 символа (hex)
- **Формат:** `[a-f0-9]{32}`
- **Генерация:** `crypto.randomBytes(16).toString('hex')`
- **Хранение:** **не-httpOnly cookie** `CSRF_COOKIE_NAME` (для Double Submit Cookie паттерна, см. раздел "Константы cookie")
  - Cookie доступна для JavaScript через `document.cookie` или `useCookie()`
  - Cookie должна быть `secure: true` в production, `secure: false` в development
  - Cookie должна быть `sameSite: 'strict'` в production
  - **Важно для разработки:** В development на localhost некоторые браузеры могут требовать `sameSite: 'lax'` (см. раздел "Особенности режима разработки")
- **Передача:** заголовок `X-CSRF-Token`

### Проверка IP

- **Источники IP (в порядке приоритета):**
  1. `X-Forwarded-For` (первый IP, если несколько)
  2. `X-Real-IP`
  3. `req.socket.remoteAddress`
- **Динамическое определение IP:** Использовать функцию `getClientIp()` из `server/api/payments/yookassa/webhook.post.ts` (уже реализована в проекте)
  - Функция нормализует IP (убирает `::ffff:` префикс для IPv4)
  - Обрабатывает все источники IP в правильном порядке
- **Сравнение:** мягкая проверка (soft check)
  - Не блокировать при несовпадении
  - Логировать и требовать дополнительное подтверждение для критичных операций
  - Учитывать, что на мобильных сетях и ноутбуках IP может меняться (динамический IP, смена Wi-Fi сетей)
- **Будущее:** можно добавить проверку по подсети (например, /24) или ASN

### Проверка User-Agent

- **Сравнение:** "грубое" сравнение (семейство браузера/платформа)
  - Не точное совпадение, а сравнение основных характеристик
  - Учитывать, что User-Agent может меняться при обновлении браузера
- **Нормализация:** убрать версию браузера и сравнивать только платформу/семейство

### Особенности режима разработки

**Важно:** Все изменения должны работать в следующих сценариях разработки:

1. **Локальная разработка (Web):**

   - Сервер: `http://localhost:3000` или `http://0.0.0.0:3000`
   - Браузер: Chrome, Firefox, Safari (Desktop)
   - **Особенности:**
     - `secure: false` (так как нет HTTPS)
     - `sameSite: 'lax'` в development (всегда, включая localhost и LAN)
     - Cookies должны работать через `credentials: 'include'`

2. **Capacitor Dev (физическое устройство):**

   - Сервер: `http://<local-ip>:3000` (например, `http://192.168.1.100:3000`)
   - Устройство: iOS/Android через Capacitor
   - **Особенности:**
     - Используется заголовок `X-Session-Token` (cookies могут не работать)
     - CSRF токен может быть недоступен через cookie
     - Fallback на заголовок `X-Session-Token` для идентификации
     - `secure: false` в development

3. **Android Studio эмулятор:**
   - Сервер: `http://10.0.2.2:3000` (специальный IP для эмулятора) или `http://<local-ip>:3000`
   - Эмулятор: Android через Capacitor
   - **Особенности:**
     - Аналогично физическому устройству
     - Проверить работу cookies в эмуляторе
     - Убедиться, что заголовки передаются корректно

**Требования к реализации:**

- [ ] Использовать `const isProd = process.env.NODE_ENV === 'production'` для определения окружения
- [ ] Для всех cookies устанавливать:
  - `secure: isProd` (false в dev, true в prod)
  - `sameSite: isProd ? 'strict' : 'lax'` для сессии и CSRF (всегда 'lax' в dev, включая LAN)
- [ ] Для OAuth cookies всегда использовать `sameSite: 'lax'` (даже в production)
- [ ] Протестировать на всех платформах:
  - ✅ Web (localhost:3000)
  - ✅ Capacitor Dev (физическое устройство)
  - ✅ Android Studio эмулятор
  - ✅ iOS Simulator (если доступен)
- [ ] Добавить логирование для отладки в development:
  - Логировать установку cookies
  - Логировать чтение CSRF токена
  - Логировать проверку CSRF в middleware

**Пример реализации для cookies:**

```typescript
const isProd = process.env.NODE_ENV === 'production';

// Константы имен cookie
const SESSION_COOKIE_NAME = 'mentala.sid';
const CSRF_COOKIE_NAME = 'mentala.csrf';

// Для сессии и CSRF: strict в prod, lax в dev (всегда, включая LAN)
const sameSitePolicy = isProd ? 'strict' : 'lax';

// Использовать __Host- префикс только на HTTPS (production)
const csrfCookieName = isProd ? `__Host-${CSRF_COOKIE_NAME}` : CSRF_COOKIE_NAME;
const sessionCookieName = isProd
  ? `__Host-${SESSION_COOKIE_NAME}`
  : SESSION_COOKIE_NAME;

// maxAge для CSRF cookie = maxAge сессии (динамически)
const sessionMaxAge = sessionExpiresAt
  ? Math.floor((sessionExpiresAt.getTime() - Date.now()) / 1000)
  : SESSION_MAX_AGE_SECONDS; // fallback на константу

setCookie(event, csrfCookieName, csrfToken, {
  httpOnly: false, // для CSRF
  secure: isProd,
  sameSite: sameSitePolicy,
  path: '/', // обязательно для __Host- префикса
  // Для __Host- префикса не указывать domain
  ...(isProd ? {} : { domain: undefined }),
  maxAge: sessionMaxAge, // динамически = срок жизни сессии
});
```

### Origin/Referer checks (дополнительный слой защиты)

- [ ] Добавить проверку Origin/Referer для cookie-канала на state-changing запросах
- [ ] Если запрос cookie-auth и state-changing → Origin должен совпадать с нашим доменом
- [ ] **Важно:** Allowed origins должны быть точными origin (scheme + host + port), а не `startsWith("http://192.168")` без ограничений
- [ ] В development использовать whitelist из env: `DEV_ALLOWED_ORIGINS="http://localhost:3000,http://192.168.1.100:3000,http://10.0.2.2:3000"`
- [ ] В production брать allowed origins из env: `PUBLIC_APP_ORIGIN` или `ALLOWED_ORIGINS` (ровно твой домен/домены, не захардкодивать и не расширять "на всякий случай")
- [ ] Использовать Referer как fallback, если Origin отсутствует
- [ ] Логировать несовпадение Origin в `security_events` (event_type: 'origin_mismatch')
- [ ] **Важно:** Это дополнительный слой, не заменяет CSRF, но снижает риск ошибок внедрения

**Пример реализации:**

```typescript
function verifyOrigin(event: any, allowedOrigins: string[]): boolean {
  const origin = getHeader(event, 'origin');
  const referer = getHeader(event, 'referer');

  // Точное совпадение origin (scheme + host + port)
  if (origin) {
    return allowedOrigins.includes(origin);
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return allowedOrigins.includes(refererUrl.origin);
    } catch {
      return false;
    }
  }

  return false; // Нет Origin и Referer
}

// В development:
const devOrigins = process.env.DEV_ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

// В production: брать из env, не захардкодивать
const prodOrigins = process.env.PUBLIC_APP_ORIGIN
  ? [process.env.PUBLIC_APP_ORIGIN]
  : process.env.ALLOWED_ORIGINS?.split(',') || [];

if (isProd && prodOrigins.length === 0) {
  throw new Error(
    'PUBLIC_APP_ORIGIN or ALLOWED_ORIGINS must be set in production'
  );
}

const allowedOrigins = isProd ? prodOrigins : devOrigins;
```

### CSP и защита от XSS

- [ ] Включить Content-Security-Policy (CSP) без `unsafe-inline` насколько возможно
- [ ] Добавить санитайзинг/экранирование для контента, который может быть показан как HTML
- [ ] Использовать библиотеки для санитайзинга (например, DOMPurify для клиента)
- [ ] Trusted Types (опционально, для будущего)
- [ ] Логировать CSP violations для мониторинга

### Rotate session ID

- [ ] При логине генерировать новый session ID (защита от session fixation)
- [ ] При критичных операциях (изменение пароля, email) генерировать новый session ID
- [ ] Обновлять cookie с новым session ID
- [ ] Старый session ID помечать как revoked
- [ ] **При ротации сессии пересоздавать CSRF токен и перевыставлять CSRF cookie** (чтобы не тащить старые токены)

### Logout everywhere

- [ ] Создать endpoint `/api/auth/logout-everywhere` для ревокации всех сессий пользователя
- [ ] Позже: добавить "device list" для просмотра активных сессий
- [ ] Логировать событие в `security_events` (event_type: 'logout_everywhere')

---

## 📝 API изменения

### Новые endpoints

#### `POST /api/auth/refresh` (опционально)

Обновление access token через refresh token.

**Request (для web):**

Refresh token передается через httpOnly cookie (не в body, не в localStorage).

**Request (для Capacitor):**

```json
{
  "refreshToken": "string"
}
```

**Response:**

```json
{
  "sessionToken": "uuid",
  "expiresAt": "2024-01-01T00:00:00Z"
}
```

**Примечания:**

- CSRF токен не возвращается в JSON, так как используется Double Submit Cookie паттерн. Сервер автоматически выставляет/обновляет CSRF cookie при обновлении сессии.
- Для web refresh token хранится только в httpOnly cookie (защита от XSS).
- Для Capacitor refresh token может передаваться в body запроса.

### Изменения в существующих endpoints

#### Все POST/PUT/DELETE/PATCH endpoints

**Важно:** Требование `X-CSRF-Token` применяется только когда запрос аутентифицирован через cookie (web). Для Capacitor (`X-Session-Token`) CSRF не требуется.

**Request Headers (для web, cookie-аутентификация):**

**Development:**

```
X-CSRF-Token: <csrf-token>
Cookie: mentala.csrf=<csrf-token>
```

**Production:**

```
X-CSRF-Token: <csrf-token>
Cookie: __Host-mentala.csrf=<csrf-token>
```

**Примечание:** Имена cookie определяются константами `CSRF_COOKIE_NAME` и `SESSION_COOKIE_NAME`, в production используется префикс `__Host-`.

**Response (при ошибке):**

```json
{
  "error": "CSRF token mismatch",
  "statusCode": 403
}
```

---

## 🧪 Тестирование

### Unit тесты

- [ ] Генерация CSRF токена
- [ ] Проверка CSRF токена
- [ ] Проверка IP/User-Agent
- [ ] Автоматическое продление сессии

### Integration тесты

- [ ] Логин с созданием CSRF токена
- [ ] Запрос с валидным CSRF токеном
- [ ] Запрос с невалидным CSRF токеном
- [ ] Запрос без CSRF токена
- [ ] Автоматическое продление сессии
- [ ] Проверка IP/User-Agent при критичных операциях

### E2E тесты

- [ ] Полный флоу авторизации
- [ ] CSRF защита работает
- [ ] Сессия продлевается автоматически
- [ ] Предупреждение при несовпадении IP/User-Agent

---

## 📚 Документация

### Обновить документацию:

- [ ] `README.md` — описание новой системы авторизации
- [ ] `.docs/subscription_setup_guide.md` — обновить раздел про Postman
- [ ] API документация — описать CSRF защиту
- [ ] Postman коллекция — добавить примеры с CSRF токеном

### Примеры для Postman:

#### Получение CSRF токена

1. Выполнить логин: `POST /api/auth/email/login`
2. Получить CSRF токен из cookie:
   - Development: `mentala.csrf` (или `CSRF_COOKIE_NAME`)
   - Production: `__Host-mentala.csrf` (или `__Host-${CSRF_COOKIE_NAME}`)
3. Использовать в заголовке `X-CSRF-Token`

#### Запрос с CSRF токеном

**Development:**

```
POST /api/subscriptions/start-checkout
Cookie: mentala.sid=<session-id>; mentala.csrf=<csrf-token>
X-CSRF-Token: <csrf-token>
Content-Type: application/json
```

**Production:**

```
POST /api/subscriptions/start-checkout
Cookie: __Host-mentala.sid=<session-id>; __Host-mentala.csrf=<csrf-token>
X-CSRF-Token: <csrf-token>
Content-Type: application/json
```

**Примечание:** Имена cookie определяются константами `SESSION_COOKIE_NAME` и `CSRF_COOKIE_NAME`, в production используется префикс `__Host-`.

---

## ⚠️ Breaking Changes

### Для фронтенда:

- ❌ Убрано сохранение `sessionToken` в localStorage для web
- ✅ Добавлена обязательная отправка CSRF токена для POST/PUT/DELETE/PATCH

### Для API:

- ✅ Все state-changing операции требуют CSRF токен
- ✅ Срок жизни сессии сокращен с 30 до 7 дней

### Миграция:

- Существующие сессии продолжат работать до истечения (30 дней)
- Новые сессии будут иметь срок жизни 7 дней
- CSRF токены будут генерироваться для новых сессий

---

## 🔒 Безопасность после реализации

### Ожидаемые улучшения:

- ✅ Защита от XSS (только httpOnly cookie для web)
- ✅ Защита от CSRF (Double Submit Cookie)
- ✅ Строгая SameSite политика
- ✅ Короткий срок жизни сессий
- ✅ Защита от кражи сессий (проверка IP/User-Agent)

### Метрики безопасности:

- Количество срабатываний CSP violation report (мониторинг XSS попыток)
- Количество событий `csrf_mismatch` в `security_events`
- Количество событий `origin_mismatch` в `security_events`
- Количество событий `ip_mismatch` и `ua_mismatch` в `security_events`
- Средний срок жизни сессии: 7 дней
- Процент сессий с несовпадением IP/User-Agent: < 1%
- Доля успешных логинов после подозрительных событий (если нужно)

---

## 📅 Timeline

- **Неделя 1:** Фаза 1 (критичные исправления)
- **Неделя 2:** Фаза 2 (улучшения безопасности)
- **Неделя 3:** Фаза 3 (дополнительные меры) + тестирование

---

## ✅ Критерии готовности

Система считается готовой, когда:

- [ ] Все задачи из Фазы 1 выполнены
- [ ] Все задачи из Фазы 2 выполнены
- [ ] Все unit тесты проходят
- [ ] Все integration тесты проходят
- [ ] E2E тесты проходят
- [ ] Документация обновлена
- [ ] Code review пройден
- [ ] Security audit пройден (опционально)

---

## 🔗 Связанные документы

- `.docs/subscription_system_spec.md` — спецификация системы подписок
- `.docs/security_requirements.md` — общие требования безопасности
- `server/application/auth/session.ts` — текущая реализация сессий

---

**Дата создания:** 2025-01-XX  
**Автор:** AI Assistant  
**Версия:** 1.0
