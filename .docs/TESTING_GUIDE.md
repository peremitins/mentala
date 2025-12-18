# Инструкция по проверке функционала безопасности

## 📋 Обзор

Этот документ описывает пошаговую проверку всех изменений в системе безопасности после внедрения улучшений.

---

## ✅ Шаг 1: Проверка переменных окружения

### Development

1. **Создайте или обновите `.env.development`:**
   ```bash
   DEV_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   ```

2. **Для разработки с мобильными устройствами (LAN):**
   ```bash
   # Узнайте IP вашего компьютера в локальной сети
   # macOS/Linux: ifconfig | grep "inet "
   # Windows: ipconfig
   
   DEV_ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.100:3000
   ```

3. **Для Android Studio эмулятора:**
   ```bash
   DEV_ALLOWED_ORIGINS=http://localhost:3000,http://10.0.2.2:3000
   ```

### Production

1. **Установите переменную окружения:**
   ```bash
   PUBLIC_APP_ORIGIN=https://app.mentala.com
   # ИЛИ
   ALLOWED_ORIGINS=https://app.mentala.com,https://admin.mentala.com
   ```

2. **Проверьте, что приложение запускается без ошибок:**
   - Если переменные не установлены → должна быть ошибка при старте
   - Если установлены → приложение запускается нормально

---

## ✅ Шаг 2: Применение миграций БД

1. **Проверьте, что миграции применены:**
   ```bash
   pnpm db:migrate
   ```

2. **Проверьте структуру БД:**
   - Таблица `security_events` должна существовать
   - В таблице `sessions` должно быть поле `lastExtendedAt`

3. **Если миграции не применены:**
   ```bash
   # Сгенерируйте миграции (если нужно)
   pnpm db:generate
   
   # Примените миграции
   pnpm db:migrate
   ```

---

## ✅ Шаг 3: Проверка Web (cookie-канал)

### 3.1. Логин и получение CSRF токена

1. **Откройте приложение в браузере:**
   ```
   http://localhost:3000
   ```

2. **Войдите в систему:**
   - Email/пароль или OAuth

3. **Проверьте cookies в DevTools (Application → Cookies):**
   - ✅ Должна быть cookie `mentala.sid` (или `__Host-mentala.sid` в production)
   - ✅ Должна быть cookie `mentala.csrf` (или `__Host-mentala.csrf` в production)
   - ✅ CSRF cookie должна быть **не-httpOnly** (доступна для JavaScript)
   - ✅ Session cookie должна быть **httpOnly** (недоступна для JavaScript)

4. **Проверьте, что CSRF токен автоматически отправляется:**
   - Откройте DevTools → Network
   - Выполните любой POST/PUT/PATCH/DELETE запрос
   - Проверьте заголовок `X-CSRF-Token` в запросе
   - ✅ Должен присутствовать и совпадать с CSRF cookie

### 3.2. Проверка CSRF защиты

1. **Попробуйте отправить POST запрос без CSRF токена:**
   ```javascript
   // В консоли браузера
   fetch('/api/user/update', {
     method: 'PATCH',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({})
   })
   ```
   - ✅ Должна быть ошибка 403 "CSRF token required"

2. **Попробуйте отправить POST запрос с неправильным CSRF токеном:**
   ```javascript
   fetch('/api/user/update', {
     method: 'PATCH',
     headers: { 
       'Content-Type': 'application/json',
       'X-CSRF-Token': 'wrong-token'
     },
     body: JSON.stringify({})
   })
   ```
   - ✅ Должна быть ошибка 403 "CSRF token mismatch"

3. **Проверьте, что нормальные запросы работают:**
   - Обновите профиль
   - Создайте привычку
   - Отправьте сообщение в чат
   - ✅ Все должно работать без ошибок

### 3.3. Проверка localStorage

1. **Проверьте, что токен НЕ хранится в localStorage для Web:**
   - Откройте DevTools → Application → Local Storage
   - ✅ Не должно быть ключа `mentai.session.token` (или `mentala.session.token`)

---

## ✅ Шаг 4: Проверка Mobile (Capacitor, header-канал)

### 4.1. iOS/Android приложение

1. **Запустите приложение на устройстве или эмуляторе**

2. **Войдите в систему**

3. **Проверьте, что токен хранится в localStorage:**
   - Используйте Capacitor DevTools или логи
   - ✅ Должен быть ключ `mentai.session.token` (или `mentala.session.token`)

4. **Проверьте, что запросы работают:**
   - Отправьте сообщение в чат
   - Обновите профиль
   - ✅ Все должно работать без ошибок CSRF (CSRF не требуется для header-канала)

5. **Проверьте заголовок `X-Session-Token`:**
   - В DevTools или логах проверьте сетевые запросы
   - ✅ Должен присутствовать заголовок `X-Session-Token` с токеном сессии

---

## ✅ Шаг 5: Проверка Origin/Referer проверок

### 5.1. Development

1. **Проверьте, что запросы с localhost работают:**
   - Откройте `http://localhost:3000`
   - Выполните POST запрос
   - ✅ Должен работать без ошибок

2. **Проверьте, что запросы с LAN IP работают (если настроено):**
   - Откройте приложение с другого устройства в той же сети: `http://192.168.1.100:3000`
   - Выполните POST запрос
   - ✅ Должен работать без ошибок (если IP добавлен в `DEV_ALLOWED_ORIGINS`)

3. **Проверьте, что запросы с неразрешенного origin не работают:**
   - Попробуйте отправить запрос с другого домена (если возможно)
   - ✅ Должно логироваться событие `origin_mismatch` в `security_events`

### 5.2. Production

1. **Проверьте, что запросы с вашего домена работают:**
   - Откройте `https://app.mentala.com`
   - Выполните POST запрос
   - ✅ Должен работать без ошибок

2. **Проверьте, что запросы с других доменов не работают:**
   - Попробуйте отправить запрос с другого домена
   - ✅ Должно логироваться событие `origin_mismatch`

---

## ✅ Шаг 6: Проверка логирования security events

1. **Проверьте таблицу `security_events` в БД:**
   ```sql
   SELECT * FROM security_events ORDER BY created_at DESC LIMIT 10;
   ```

2. **Проверьте, что события логируются:**
   - Попробуйте отправить запрос с неправильным CSRF токеном
   - ✅ Должно появиться событие `csrf_mismatch`

   - Попробуйте отправить запрос с неразрешенного origin
   - ✅ Должно появиться событие `origin_mismatch`

---

## ✅ Шаг 7: Проверка SameSite политики

### 7.1. Development

1. **Проверьте cookies в DevTools:**
   - ✅ Session cookie: `SameSite=Lax`
   - ✅ CSRF cookie: `SameSite=Lax`

### 7.2. Production

1. **Проверьте cookies в DevTools:**
   - ✅ Session cookie: `SameSite=Strict`
   - ✅ CSRF cookie: `SameSite=Strict`
   - ✅ Session cookie: `Secure=true`
   - ✅ CSRF cookie: `Secure=true`
   - ✅ Префикс `__Host-` для обоих cookies (если используется)

---

## ✅ Шаг 8: Проверка обновления всех endpoints

1. **Проверьте, что все endpoints используют новый формат `getSessionUser`:**
   ```bash
   # Проверьте, что нет старых вызовов
   grep -r "const user = await getSessionUser" server/api
   grep -r "const sessUser = await getSessionUser" server/api
   ```
   - ✅ Не должно быть результатов (все обновлены на `sessionResult`)

2. **Проверьте несколько ключевых endpoints:**
   - `/api/user/me` - получение текущего пользователя
   - `/api/user/update` - обновление профиля
   - `/api/habits` - работа с привычками
   - `/api/therapy/session/start` - начало сессии терапии
   - ✅ Все должны работать без ошибок

---

## ✅ Шаг 9: Проверка исключений из CSRF

1. **Проверьте, что публичные endpoints не требуют CSRF:**
   - `/api/auth/email/login` - логин
   - `/api/auth/email/register` - регистрация
   - `/api/auth/google/callback` - OAuth callback
   - `/api/payments/yookassa/webhook` - webhook
   - ✅ Все должны работать без CSRF токена

2. **Проверьте, что защищенные endpoints требуют CSRF:**
   - `/api/user/update` - обновление профиля
   - `/api/auth/logout` - выход
   - `/api/habits` - создание привычки
   - ✅ Все должны требовать CSRF токен для cookie-канала

---

## ✅ Шаг 10: Проверка работы в разных окружениях

### 10.1. Локальная разработка (localhost)

1. **Запустите приложение:**
   ```bash
   pnpm dev
   ```

2. **Проверьте:**
   - ✅ Логин работает
   - ✅ POST запросы работают с CSRF токеном
   - ✅ Cookies имеют `SameSite=Lax`

### 10.2. Разработка на LAN (мобильные устройства)

1. **Настройте `DEV_ALLOWED_ORIGINS` с IP вашего компьютера**

2. **Откройте приложение с мобильного устройства:**
   ```
   http://192.168.1.100:3000
   ```

3. **Проверьте:**
   - ✅ Логин работает
   - ✅ POST запросы работают
   - ✅ Origin проверки проходят

### 10.3. Android Studio эмулятор

1. **Настройте `DEV_ALLOWED_ORIGINS` с `10.0.2.2:3000`**

2. **Запустите приложение в эмуляторе**

3. **Проверьте:**
   - ✅ Логин работает
   - ✅ POST запросы работают
   - ✅ Origin проверки проходят

---

## ⚠️ Возможные проблемы и решения

### Проблема: CSRF токен не отправляется автоматически

**Решение:**
- Проверьте, что `app/plugins/api.ts` обновлен и автоматически добавляет `X-CSRF-Token` заголовок
- Проверьте, что CSRF cookie доступна (не-httpOnly)

### Проблема: Ошибка "CSRF token required" на публичных endpoints

**Решение:**
- Проверьте, что endpoint добавлен в список исключений в `server/middleware/csrf.ts`
- Проверьте, что путь точно совпадает (регистр важен)

### Проблема: Origin проверки не проходят в development

**Решение:**
- Проверьте, что `DEV_ALLOWED_ORIGINS` содержит точный origin (scheme + host + port)
- Проверьте, что origin в запросе точно совпадает с одним из разрешенных

### Проблема: Ошибка при старте в production

**Решение:**
- Проверьте, что установлена переменная `PUBLIC_APP_ORIGIN` или `ALLOWED_ORIGINS`
- Проверьте, что значение точное (scheme + host + port)

---

## 📊 Итоговый чеклист

- [ ] Переменные окружения настроены
- [ ] Миграции БД применены
- [ ] Web (cookie-канал) работает с CSRF
- [ ] Mobile (header-канал) работает без CSRF
- [ ] localStorage используется только для Capacitor
- [ ] Origin/Referer проверки работают
- [ ] Security events логируются
- [ ] SameSite политика корректна
- [ ] Все endpoints обновлены
- [ ] Исключения из CSRF работают
- [ ] Работает в разных окружениях (localhost, LAN, эмулятор)

---

## 📚 Дополнительная информация

- Подробнее о переменных окружения: `.docs/ENV_VARIABLES.md`
- Техническое ТЗ: `.docs/auth_security_improvements_tz.md`

