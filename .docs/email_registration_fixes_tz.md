# ТЗ: Исправление проблем с отправкой email при регистрации

## 1. Обзор проблемы

При регистрации пользователя с email `peremitinns@mail.ru` (или любым другим) не приходят письма с кодом подтверждения. Обнаружены следующие критические проблемы:

### 1.1. Проблема с уже существующим подтвержденным email

**Текущая логика в `server/api/auth/email/register.post.ts` (строки 71-112):**

```typescript
if (existing.length) {
  if (!existing[0].emailVerifiedAt) {
    // Отправка кода только если email НЕ подтвержден
    await issueVerificationCode(getEmailVerificationKey(email), email);
  }
  // ❌ ПРОБЛЕМА: Если email УЖЕ подтвержден, код НЕ отправляется,
  // но возвращается сообщение "Если аккаунт существует, мы отправили письмо"
  return {
    message:
      'Мы отправили письмо с кодом подтверждения.\nЕсли вы уже использовали Mentala ранее, вы сможете войти или восстановить доступ',
  };
}
```

**Проблема:**

- Если пользователь с таким email уже существует и `emailVerifiedAt != null` (email подтвержден), код НЕ отправляется
- Но пользователю возвращается сообщение "Мы отправили письмо с кодом подтверждения.\nЕсли вы уже использовали Mentala ранее, вы сможете войти или восстановить доступ"
- Пользователь ждет письмо, которое никогда не придет

**Решение:**

- **Не раскрываем наличие аккаунта.** Всегда возвращаем нейтральный ответ:
  “Если аккаунт существует, мы отправили письмо с кодом подтверждения”.
- Подсказку “Если вы уже регистрировались — войдите или восстановите пароль”
  показываем **только в UI**, не в API.

### 1.2. Отсутствие обработки ошибок отправки email

**Текущая реализация в `server/application/auth/email-sender.ts`:**

```typescript
export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  // ... настройка SMTP ...
  await transporter.sendMail({ ... });
  // ❌ ПРОБЛЕМА: Нет try-catch, ошибки не логируются
  // Если SMTP недоступен или неверные credentials, ошибка пробрасывается без контекста
}
```

**Проблемы:**

- Ошибки отправки email не логируются
- Нет информации о причинах неудачной отправки (SMTP недоступен, неверные credentials, блокировка провайдером и т.д.)
- Пользователь не получает понятное сообщение об ошибке

**Решение:**

- Добавить try-catch с детальным логированием
- Логировать все ошибки отправки email с контекстом **без утечки PII**
  (email маскировать через `maskEmail`)
- Возвращать **нейтральное понятное** сообщение пользователю

### 1.3. Возможные причины неполучения писем

**Технические причины:**

1. **SMTP конфигурация неверна или отсутствует:**

   - Отсутствуют переменные окружения `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
   - Неверные credentials для SMTP сервера
   - Неверный порт или настройки безопасности

2. **SMTP сервер недоступен:**

   - Проблемы с сетью
   - SMTP сервер временно недоступен
   - Firewall блокирует соединение

3. **Провайдер email блокирует письма:**

   - Mail.ru может блокировать письма от определенных отправителей
   - Письма попадают в спам
   - Проблемы с репутацией отправителя (SPF, DKIM, DMARC)

4. **Ошибки в коде:**
   - Исключения при отправке не обрабатываются
   - Ошибки "проглатываются" без логирования

## 2. Требования к исправлению

### 2.1. Обработка существующего подтвержденного email (без утечки)

**Изменения в `server/api/auth/email/register.post.ts`:**

```typescript
if (existing.length) {
  // Если email не подтвержден → отправляем код
  if (!existing[0].emailVerifiedAt) {
    // ... существующая логика ...
    await issueVerificationCode(getEmailVerificationKey(email), email);
  }

  // В любом случае возвращаем нейтральный ответ (без утечки)
  return {
    message:
      'Мы отправили письмо с кодом подтверждения.\nЕсли вы уже использовали Mentala ранее, вы сможете войти или восстановить доступ',
  };
}
```

**Важно:**

- Не различаем существующий/несуществующий аккаунт в ответе
- Любые подсказки о существовании аккаунта — **только в UI**, не в API

### 2.2. Обработка ошибок отправки email

**Изменения в `server/application/auth/email-sender.ts`:**

```typescript
export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<void> {
  const smtp = getSmtpConfig();
  const transporter = getTransporter();

  const subject = 'Подтвердите ваш email — Mentala';
  const text = `Ваш код подтверждения: ${code}. Код действителен 15 минут.`;
  const html = `...`;

  try {
    await transporter.sendMail({
      from: `${smtp.fromName} <${smtp.from}>`,
      to,
      subject,
      text,
      html,
    });

    // Логируем успешную отправку (опционально, для мониторинга)
    console.log(`[Email] ✅ Verification code sent to ${maskEmail(to)}`);
  } catch (error: any) {
    // Детальное логирование ошибки
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'UNKNOWN';

    console.error(
      `[Email] ❌ Failed to send verification code to ${maskEmail(to)}:`,
      {
        error: errorMessage,
        code: errorCode,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        // НЕ логируем пароль или другие чувствительные данные
      }
    );

    // Пробрасываем ошибку с понятным сообщением
    throw createError({
      statusCode: 500,
      statusMessage:
        'Не удалось отправить письмо. Попробуйте позже или обратитесь в поддержку.',
      // В development можно добавить больше деталей
      data:
        process.env.NODE_ENV === 'development'
          ? { originalError: errorMessage }
          : undefined,
    });
    // В контроллере регистрации эту ошибку перехватываем и возвращаем нейтральный ответ
  }
}
```

**Важно:**

- Все ошибки отправки должны логироваться с контекстом
- В ответе API не раскрываем деталей; наружу — нейтральное сообщение
- В development режиме можно показывать больше информации для отладки
- Email получателя в логах **маскировать**

### 2.3. Проверка SMTP конфигурации при старте

**Добавить валидацию SMTP конфигурации:**

```typescript
// В server/application/auth/email-sender.ts
export function validateSmtpConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const cfg = useRuntimeConfig();

  if (!cfg.smtpHost && !process.env.SMTP_HOST) {
    errors.push('SMTP_HOST не настроен');
  }
  if (!cfg.smtpUser && !process.env.SMTP_USER) {
    errors.push('SMTP_USER не настроен');
  }
  if (!cfg.smtpPassword && !process.env.SMTP_PASSWORD) {
    errors.push('SMTP_PASSWORD не настроен');
  }
  if (!cfg.smtpFrom && !process.env.SMTP_FROM) {
    errors.push('SMTP_FROM не настроен');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

**Вызывать при старте сервера:**

- В `server/plugins/` или при инициализации приложения
- Логировать предупреждение, если конфигурация неполная
- НЕ блокировать старт, но предупредить о проблемах

### 2.4. Улучшение обработки ошибок в `issueVerificationCode`

**Изменения в `server/application/auth/email-verification.service.ts`:**

```typescript
export async function issueVerificationCode(
  redisKey: string,
  email: string
): Promise<void> {
  const code = generateVerificationCode();
  const secret = getAuthSecrets()[0];

  try {
    await storeVerificationRecord(
      redisKey,
      hashVerificationCode(code, secret),
      AUTH_CODE_TTL_SECONDS
    );

    // Отправка email с обработкой ошибок
    await sendVerificationEmail(email, code);
  } catch (error: any) {
    // Если отправка не удалась, удаляем код из Redis
    // чтобы не оставлять "висячие" коды
    try {
      await deleteVerificationRecord(redisKey);
    } catch (cleanupError) {
      console.error(
        `[Email] Failed to cleanup verification code for ${maskEmail(email)}:`,
        cleanupError
      );
    }

    // Пробрасываем ошибку дальше
    throw error;
  }
}
```

## 3. Изменения в API

### 3.1. `POST /api/auth/email/register`

**Поведение:**

- Всегда возвращать нейтральный ответ, **не раскрывая** существование аккаунта.
- Любые ошибки отправки — логируем, но пользователю возвращаем нейтральное сообщение.
- Сообщения уровня UI (про вход/восстановление пароля) — **только во фронте**.
- Ошибка отправки **не должна** менять ответ (чтобы не было утечки).
- В контроллере регистрации — `try/catch` и нейтральный ответ даже при ошибке SMTP.

**Рекомендуемый ответ (200/202):**

```json
{
  "message": "Мы отправили письмо с кодом подтверждения.\nЕсли вы уже использовали Mentala ранее, вы сможете войти или восстановить доступ"
}
```

**Ограничение частоты (429):**

- Ограничиваем **по IP/устройству**, а не по email.
- Возвращаем `Retry-After` (секунды) и нейтральное сообщение.
- Сам текст ответа не должен подтверждать наличие аккаунта.

```json
{
  "statusCode": 429,
  "statusMessage": "Слишком много запросов. Попробуйте позже."
}
```

### 3.2. UI-поведение без утечки

**Требования к интерфейсу:**

- После нажатия “Отправить код” **всегда** показываем нейтральный успех:
  “Если аккаунт существует, мы отправили письмо…”.
- Дополнительные подсказки:
  - “Если вы уже регистрировались — войдите”
  - “Если забыли пароль — восстановите”
    Эти подсказки **не зависят** от ответа сервера.
- Кнопка повторной отправки — с таймером ожидания.
- При 429 используем `Retry-After` для блокировки кнопки и текста “Подождите N сек”.

### 3.3. Обработка ошибок на фронтенде

**Изменения в `app/pages/auth/index.vue`:**

```typescript
async function submit() {
  // ...
  try {
    const response: any = await auth.registerEmail({ ... });
    // ...
  } catch (e: any) {
    const statusCode = e?.statusCode || e?.response?.status || 500;
    const retryAfter =
      Number(e?.response?.headers?.['retry-after']) || undefined;
    const message =
      e?.statusMessage ||
      e?.message ||
      'Мы отправили письмо с кодом подтверждения.\nЕсли вы уже использовали Mentala ранее, вы сможете войти или восстановить доступ';

    if (statusCode === 429) {
      // Rate limit — показать нейтральное сообщение и подсказку про ожидание
      useToast('Слишком много запросов', message, 'warning');
      if (retryAfter) {
        startCooldown(retryAfter); // локальный таймер блокировки кнопки
      }
    } else {
      // Все остальные ошибки — нейтральный ответ без раскрытия
      useToast('Проверьте почту', message, 'info');
    }

    console.error('[Auth] Register error:', e);
  }
}
```

## 4. Диагностика проблем

### 4.1. Чеклист для проверки SMTP

1. **Проверить переменные окружения:**

   ```bash
   echo $SMTP_HOST
   echo $SMTP_PORT
   echo $SMTP_USER
   echo $SMTP_FROM
   # SMTP_PASSWORD не выводить в консоль!
   ```

2. **Проверить логи при регистрации:**

   - Искать `[Email] ✅ Verification code sent` - успешная отправка
   - Искать `[Email] ❌ Failed to send` - ошибки отправки

3. **Проверить SMTP соединение:**

   - Использовать тестовый скрипт для проверки подключения к SMTP
   - Проверить, что порт не заблокирован firewall

4. **Проверить репутацию отправителя:**
   - SPF записи в DNS
   - DKIM подписи
   - DMARC политика

### 4.2. Логирование для диагностики

**Добавить структурированное логирование:**

```typescript
console.log(`[Email] 📧 Sending verification code`, {
  to: maskEmail(email),
  smtpHost: smtp.host,
  smtpPort: smtp.port,
  timestamp: new Date().toISOString(),
});
```

**При ошибках:**

```typescript
console.error(`[Email] ❌ Failed to send verification code`, {
  to: maskEmail(email),
  error: errorMessage,
  errorCode: errorCode,
  smtpHost: smtp.host,
  smtpPort: smtp.port,
  stack: error?.stack,
  timestamp: new Date().toISOString(),
});
```

## 5. План реализации

### Этап 1: Исправление логики регистрации (КРИТИЧНО)

1. ✅ Добавить проверку на существующий подтвержденный email
2. ✅ Всегда возвращать нейтральный ответ без утечки
3. ✅ UI: нейтральные тексты + ссылки “Войти/Восстановить”
4. ✅ Обновить обработку ошибок на фронтенде (без 409)

### Этап 2: Обработка ошибок отправки email

1. ✅ Добавить try-catch в `sendVerificationEmail`
2. ✅ Добавить детальное логирование ошибок
3. ✅ Улучшить обработку ошибок в `issueVerificationCode`
4. ✅ Обновить обработку ошибок на фронтенде

### Этап 3: Валидация конфигурации

1. ✅ Добавить функцию `validateSmtpConfig`
2. ✅ Вызывать при старте сервера
3. ✅ Логировать предупреждения о неполной конфигурации

### Этап 4: Улучшение логирования

1. ✅ Добавить структурированное логирование
2. ✅ Логировать успешные отправки (опционально)
3. ✅ Логировать все ошибки с контекстом

### Этап 5: Rate limit без утечки

1. ✅ Ограничение по IP/устройству
2. ✅ `Retry-After` и таймер ожидания в UI

## 6. Тестирование

### 6.1. Сценарии для проверки

1. **Регистрация с новым email:**

   - ✅ Письмо должно прийти
   - ✅ Код должен работать

2. **Регистрация с существующим неподтвержденным email:**

   - ✅ Письмо должно прийти
   - ✅ Код должен работать

3. **Регистрация с существующим подтвержденным email:**

   - ✅ Ответ **нейтральный** (как и для других кейсов)
   - ✅ Пользователь не получает подсказку о существовании аккаунта
   - ✅ Письмо НЕ должно отправляться

4. **Ошибка отправки email (неверные SMTP credentials):**

   - ✅ Ошибка должна логироваться
   - ✅ Пользователь видит нейтральное сообщение без деталей
   - ✅ Код не должен сохраняться в Redis

5. **SMTP недоступен:**

   - ✅ Ошибка должна логироваться
   - ✅ Пользователь видит нейтральное сообщение без деталей

6. **Rate limit (429):**
   - ✅ Нейтральный ответ
   - ✅ `Retry-After` передан
   - ✅ UI показывает ожидание

## 7. Связанные улучшения из основного ТЗ

Это ТЗ дополняет основное ТЗ `auth_improvements_tz.md` следующими исправлениями:

- ✅ Обработка существующего подтвержденного email (не описано в основном ТЗ)
- ✅ Детальная обработка ошибок отправки email (частично описано, но не реализовано)
- ✅ Валидация SMTP конфигурации (не описано в основном ТЗ)
- ✅ Улучшенное логирование для диагностики (частично описано)

**Важно:** Все изменения должны быть обратно совместимы и не ломать существующую функциональность.
