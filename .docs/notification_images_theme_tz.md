# ТЗ: Картинки в уведомлениях по теме (MVP, локально)

## Статус

Draft → готово к реализации

---

## 1. Цель

Добавить поддержку изображений в push‑уведомления, чтобы картинка автоматически подбиралась по теме уведомления (therapy/habit). В MVP изображения храним локально в `public`.

---

## 2. Контекст и источники тем

### 2.1. Темы терапии

Источник: `app/lib/therapyCatalog.ts`

Нужная тема для MVP:

- **therapy/anxiety** → `"Тревога и паника"` (key: `anxiety`)

### 2.2. Привычки

Источник: `app/lib/habitsCatalog.ts`

Нужная тема для MVP:

- **habit/alcohol** → `"Меньше алкоголя"` (key: `alcohol`)

---

## 3. Хранение изображений

### 3.1. Локально в public

Файлы размещаются в:

```
public/notifications/
  therapy/anxiety/
  habits/alcohol/
  common/
```

Доступ по URL:

- `/notifications/therapy/anxiety/<file>`
- `/notifications/habits/alcohol/<file>`
- `/notifications/common/<file>`

---

## 4. Формат и ограничения (рекомендация)

Цель — единый wide‑формат, который нормально смотрится в Web + Android и не ломается на iOS (когда будет включено).

**Рекомендуемые параметры:**

- Формат: `jpg` или `webp`
- Соотношение: **1.91:1**
- Размер: **1200x628**
- Вес файла: ≤ **800 KB**

**Почему так:** это стандартный wide‑формат для карточек/уведомлений, поддерживается FCM image URL и хорошо масштабируется.

---

## 5. Логика выбора изображения

### 5.1. Key‑модель

Формируем ключ темы:

- `therapy:<key>` например `therapy:anxiety`
- `habit:<key>` например `habit:alcohol`

### 5.2. Подбор

1. Находим список изображений по ключу темы.
2. Если есть **явное соответствие по смыслу** (ручной маппинг) — используем его.
3. Если явного соответствия нет — выбираем случайно из набора темы.
4. Если набора темы нет — fallback в `common/`.
5. Если и `common/` пуст — отправляем уведомление без картинки.

> Маппинг «по смыслу» хранится в коде и задаётся вручную (MVP).

---

## 6. Push‑payload (официальная документация)

Для FCM (Firebase Admin Node.js) поддерживается поле `notification.imageUrl`, а также `android.notification.imageUrl`.

**Пример (по документации Firebase Admin SDK):**

```ts
{
  notification: {
    title: '...',
    body: '...',
    imageUrl: 'https://example.com/image.png'
  },
  android: {
    notification: {
      imageUrl: 'https://example.com/image.png'
    }
  }
}
```

> Ссылки: Firebase Admin Node SDK `notification.imageUrl` и `AndroidNotification.imageUrl`.

Для iOS: rich‑уведомления с картинкой потребуют Service Extension на клиенте. Пока **не включаем**, но оставляем совместимый payload (добавление позже).

---

## 7. MVP‑набор изображений

**Тревога и паника (therapy/anxiety)**

- `public/notifications/therapy/anxiety/anxiety_01.jpg`
- `public/notifications/therapy/anxiety/anxiety_02.jpg`
- `public/notifications/therapy/anxiety/anxiety_03.jpg`

**Меньше алкоголя (habits/alcohol)**

- `public/notifications/habits/alcohol/alcohol_01.jpg`
- `public/notifications/habits/alcohol/alcohol_02.jpg`
- `public/notifications/habits/alcohol/alcohol_03.jpg`

**Fallback**

- `public/notifications/common/common_01.jpg`

---

## 8. Acceptance Criteria

1. Уведомления по теме **Тревога и паника** получают картинки из `therapy/anxiety`.
2. Уведомления по теме **Меньше алкоголя** получают картинки из `habits/alcohol`.
3. При отсутствии картинок у темы используется `common`.
4. Если не найдено ничего — отправляется уведомление без картинки.
5. Формат изображений соответствует wide‑рекомендации (1200x628).

---

## 9. Будущие расширения

- Админ‑интерфейс для управления наборами изображений.
- Перенос из `public` в S3/R2 с CDN.
- Включение iOS rich notifications (Service Extension).
