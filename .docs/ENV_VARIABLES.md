# Переменные окружения для безопасности

## Обзор

Для корректной работы системы безопасности необходимо настроить следующие переменные окружения.

---

## 🔐 Production (обязательно)

### `PUBLIC_APP_ORIGIN` (приоритет 1)

**Описание:** Основной домен приложения в production.

**Формат:** Полный URL с протоколом, доменом и портом (если не стандартный)

**Примеры:**

```bash
PUBLIC_APP_ORIGIN=https://app.mentala.com
PUBLIC_APP_ORIGIN=https://mentala.com
PUBLIC_APP_ORIGIN=https://app.mentala.com:443
```

**Где используется:**

- Origin/Referer проверки для cookie-канала
- Определение разрешенных источников запросов

**Важно:**

- Должен быть точным origin (scheme + host + port)
- Не использовать wildcards или подстановки
- Если не указан, используется `ALLOWED_ORIGINS`

---

### `ALLOWED_ORIGINS` (приоритет 2, если `PUBLIC_APP_ORIGIN` не задан)

**Описание:** Список разрешенных origins для Origin/Referer проверок (через запятую).

**Формат:** Список полных URL через запятую

**Примеры:**

```bash
ALLOWED_ORIGINS=https://app.mentala.com,https://admin.mentala.com
ALLOWED_ORIGINS=https://mentala.com
```

**Где используется:**

- Origin/Referer проверки для cookie-канала
- Альтернатива `PUBLIC_APP_ORIGIN` если нужны несколько доменов

**Важно:**

- Каждый origin должен быть точным (scheme + host + port)
- Разделитель: запятая
- Если не указан ни `PUBLIC_APP_ORIGIN`, ни `ALLOWED_ORIGINS` → ошибка в production

---

## 🛠️ Development (опционально)

### `DEV_ALLOWED_ORIGINS`

**Описание:** Список разрешенных origins для development режима (через запятую).

**Формат:** Список полных URL через запятую

**Примеры:**

```bash
# Для локальной разработки
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Для разработки на LAN (мобильные устройства)
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.100:3000,http://10.0.2.2:3000

# Для Android Studio эмулятора
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://10.0.2.2:3000
```

**Где используется:**

- Origin/Referer проверки в development режиме
- Позволяет тестировать на реальных устройствах через LAN

**Важно:**

- Если не указан, используется дефолтный список: `http://localhost:3000,http://127.0.0.1:3000`
- Каждый origin должен быть точным (scheme + host + port)
- Разделитель: запятая

---

## 📝 Примеры конфигурации

### Локальная разработка (только на компьютере)

```bash
# .env.development
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Разработка с мобильными устройствами (LAN)

```bash
# .env.development
# Замените 192.168.1.100 на IP вашего компьютера в локальной сети
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.100:3000
```

### Android Studio эмулятор

```bash
# .env.development
# 10.0.2.2 - специальный IP для доступа к localhost хоста из эмулятора
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://10.0.2.2:3000
```

### Production

```bash
# .env.production
PUBLIC_APP_ORIGIN=https://app.mentala.com
# ИЛИ
ALLOWED_ORIGINS=https://app.mentala.com,https://admin.mentala.com
```

---

## ⚠️ Важные замечания

1. **Точность origins:** Все origins должны быть точными (scheme + host + port). Не использовать wildcards или подстановки.

2. **Production обязательность:** В production **обязательно** указать либо `PUBLIC_APP_ORIGIN`, либо `ALLOWED_ORIGINS`. Иначе приложение выбросит ошибку при старте.

3. **Development опциональность:** `DEV_ALLOWED_ORIGINS` опционален. Если не указан, используется дефолтный список.

4. **Порты:** Если используете нестандартный порт, обязательно указывайте его в origin:

   - ✅ `http://localhost:3000`
   - ❌ `http://localhost` (может не работать если порт не 80/443)

5. **HTTPS в production:** В production всегда используйте HTTPS:
   - ✅ `https://app.mentala.com`
   - ❌ `http://app.mentala.com` (небезопасно)

---

## 🔍 Где настраивать

### Локальная разработка

Создайте или обновите файл `.env.development`:

```bash
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.100:3000
```

### Production

Настройте переменные окружения на сервере (через ваш deployment инструмент):

```bash
PUBLIC_APP_ORIGIN=https://app.mentala.com
```

Или через `.env.production` (если используете):

```bash
PUBLIC_APP_ORIGIN=https://app.mentala.com
```

---

## 🧪 Проверка конфигурации

После настройки переменных окружения проверьте:

1. **Development:**

   ```bash
   # Запустите приложение
   pnpm dev

   # Проверьте логи - не должно быть ошибок про allowed origins
   ```

2. **Production:**
   ```bash
   # При старте приложения должна быть проверка
   # Если переменные не установлены - будет ошибка
   ```

---

---

## 🔐 Админские права

### `ADMIN_EMAILS` (опционально, для админских функций)

**Описание:** Список email адресов администраторов (через запятую).

**Формат:** Список email адресов через запятую

**Примеры:**

```bash
ADMIN_EMAILS=admin@mentala.com,superadmin@mentala.com
ADMIN_EMAILS=admin1@example.com,admin2@example.com,admin3@example.com
```

**Где используется:**

- Проверка прав доступа к админским endpoints (`/api/users/*`, `/api/db/*`)
- Проверка прав доступа к админским страницам UI (`/users/*`)
- Временное решение до реализации полноценной системы ролей

**Важно:**

- Email адреса сравниваются в нижнем регистре (case-insensitive)
- Если не указан, админские endpoints будут недоступны (requireAdmin выбросит ошибку)
- Это временное решение - в будущем будет заменено на систему ролей из `.docs/roles_and_permissions_tz.md`

**Где настраивать:**

```bash
# .env.development или .env.production
ADMIN_EMAILS=admin@mentala.com,superadmin@mentala.com
```

---

## 📚 Дополнительная информация

Подробнее о реализации см. в `.docs/auth_security_improvements_tz.md`.
