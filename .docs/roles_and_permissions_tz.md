# ТЗ: Система ролей и прав доступа (RBAC)

## 📋 Статус
**Статус:** Планирование  
**Приоритет:** Высокий  
**Оценка:** 2-3 недели разработки

---

## 🎯 Цель

Реализовать систему ролей и прав доступа (Role-Based Access Control, RBAC) для разграничения доступа к ресурсам приложения между администраторами и обычными пользователями.

---

## 🔍 Текущее состояние и проблематика

### Текущие проблемы безопасности

#### 1. Незащищенные endpoints `/api/users/[id]`

**Проблема:**
Endpoints `GET /api/users/[id]`, `PATCH /api/users/[id]`, `DELETE /api/users/[id]` не имеют проверки авторизации и прав доступа.

**Текущий код:**
```typescript
// server/api/users/[id].get.ts
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  // ❌ Нет проверки авторизации
  // ❌ Нет проверки прав доступа
  const rows = await db.select().from(users).where(eq(users.id, id))
  return { item: rows[0] } // Может вернуть данные любого пользователя
})
```

**Риски:**
- Любой пользователь может получить данные другого пользователя
- Любой пользователь может изменить email/пароль другого пользователя
- Любой пользователь может удалить чужой аккаунт
- Нет разграничения между администраторами и обычными пользователями

#### 2. Отсутствие системы ролей

**Проблема:**
- Нет таблицы ролей в БД
- Нет связи пользователей с ролями
- Нет middleware для проверки прав доступа
- Нет разграничения доступа к административным функциям

#### 3. Отсутствие административных endpoints

**Проблема:**
- Нет endpoint для получения списка всех пользователей (только для админов)
- Нет endpoint для управления пользователями (только для админов)
- Нет endpoint для просмотра статистики (только для админов)

---

## 🎯 Требования

### 1. Роли в системе

#### 1.1. Базовые роли

**`admin`** — Администратор
- Полный доступ ко всем ресурсам
- Может просматривать список всех пользователей
- Может создавать, изменять, удалять пользователей
- Может просматривать статистику и аналитику
- Может управлять подписками других пользователей
- Может просматривать логи и события безопасности

**`user`** — Обычный пользователь (по умолчанию)
- Доступ только к своим данным
- Может просматривать/изменять только свой профиль
- Может управлять только своими подписками
- Не может просматривать список других пользователей
- Не может выполнять административные действия

#### 1.2. Будущие роли (опционально)

**`moderator`** — Модератор (для будущего)
- Может просматривать список пользователей (read-only)
- Может блокировать/разблокировать пользователей
- Не может удалять пользователей
- Не может изменять подписки

**`support`** — Служба поддержки (для будущего)
- Может просматривать данные пользователей (read-only)
- Может просматривать подписки пользователей
- Не может изменять данные пользователей
- Не может выполнять административные действия

---

### 2. Структура БД

#### 2.1. Таблица `roles`

```sql
CREATE TABLE roles (
  id varchar(50) PRIMARY KEY NOT NULL, -- 'admin', 'user', 'moderator', 'support'
  name varchar(100) NOT NULL, -- 'Администратор', 'Пользователь', 'Модератор', 'Поддержка'
  description text,
  is_system boolean DEFAULT false NOT NULL, -- системные роли нельзя удалить
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
```

**Начальные данные:**
```sql
INSERT INTO roles (id, name, description, is_system) VALUES
  ('admin', 'Администратор', 'Полный доступ ко всем ресурсам системы', true),
  ('user', 'Пользователь', 'Обычный пользователь приложения', true);
```

#### 2.2. Таблица `user_roles`

Связь многие-ко-многим (на случай, если пользователь может иметь несколько ролей в будущем):

```sql
CREATE TABLE user_roles (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id varchar(50) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
```

**Альтернативный вариант (проще):**
Если пользователь может иметь только одну роль, можно добавить поле `role_id` напрямую в таблицу `users`:

```sql
ALTER TABLE users ADD COLUMN role_id varchar(50) DEFAULT 'user' NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_role_id_fk FOREIGN KEY (role_id) REFERENCES roles(id);
```

**Рекомендация:** Начать с простого варианта (одна роль на пользователя), в будущем можно расширить до многих ролей.

#### 2.3. Таблица `permissions` (опционально, для будущего)

Для более гибкой системы прав можно добавить таблицу разрешений:

```sql
CREATE TABLE permissions (
  id varchar(100) PRIMARY KEY NOT NULL, -- 'users.read', 'users.write', 'subscriptions.manage'
  name varchar(200) NOT NULL,
  resource varchar(100) NOT NULL, -- 'users', 'subscriptions', 'analytics'
  action varchar(50) NOT NULL, -- 'read', 'write', 'delete', 'manage'
  description text
);
```

#### 2.4. Таблица `role_permissions` (опционально, для будущего)

```sql
CREATE TABLE role_permissions (
  role_id varchar(50) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id varchar(100) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
```

**Примечание:** Для MVP достаточно простой системы с ролями. Систему permissions можно добавить позже, если потребуется более гибкое управление правами.

---

### 3. Изменения в схеме БД (Drizzle)

#### 3.1. Добавить таблицу `roles`

```typescript
// server/infrastructure/db/schema.ts

export const roles = pgTable('roles', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

#### 3.2. Добавить поле `roleId` в таблицу `users`

```typescript
// server/infrastructure/db/schema.ts

export const users = pgTable('users', {
  // ... существующие поля
  roleId: varchar('role_id', { length: 50 })
    .default('user')
    .notNull()
    .references(() => roles.id),
  // ... остальные поля
});
```

#### 3.3. Seed скрипт для ролей

```typescript
// server/infrastructure/db/seed-roles.ts

import { db } from './client';
import { roles } from './schema';

async function seedRoles() {
  await db.insert(roles).values([
    {
      id: 'admin',
      name: 'Администратор',
      description: 'Полный доступ ко всем ресурсам системы',
      isSystem: true,
    },
    {
      id: 'user',
      name: 'Пользователь',
      description: 'Обычный пользователь приложения',
      isSystem: true,
    },
  ]).onConflictDoNothing({ target: roles.id });
}

seedRoles();
```

---

### 4. Backend: Middleware и утилиты

#### 4.1. Функция проверки роли

```typescript
// server/application/auth/roles.ts

import { getSessionUser } from './session';
import { db } from '@/server/infrastructure/db/client';
import { users, roles } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

export type UserRole = 'admin' | 'user' | 'moderator' | 'support';

/**
 * Получить роль пользователя
 */
export async function getUserRole(userId: number): Promise<UserRole> {
  const user = await db
    .select({ roleId: users.roleId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length) {
    throw new Error(`User ${userId} not found`);
  }

  return (user[0].roleId || 'user') as UserRole;
}

/**
 * Проверить, имеет ли пользователь указанную роль
 */
export async function hasRole(userId: number, role: UserRole): Promise<boolean> {
  const userRole = await getUserRole(userId);
  return userRole === role;
}

/**
 * Проверить, является ли пользователь администратором
 */
export async function isAdmin(userId: number): Promise<boolean> {
  return hasRole(userId, 'admin');
}

/**
 * Получить пользователя с проверкой роли из сессии
 */
export async function getSessionUserWithRole(event: any) {
  const user = await getSessionUser(event);
  if (!user?.id) {
    return null;
  }

  const role = await getUserRole(user.id);
  return {
    ...user,
    role,
  };
}
```

#### 4.2. Middleware для проверки роли

```typescript
// server/middleware/require-role.ts

import { createError } from 'h3';
import { getSessionUserWithRole } from '@/server/application/auth/roles';
import type { UserRole } from '@/server/application/auth/roles';

/**
 * Middleware для проверки роли пользователя
 * Использование: requireRole(event, 'admin')
 */
export async function requireRole(
  event: any,
  requiredRole: UserRole | UserRole[]
): Promise<void> {
  const user = await getSessionUserWithRole(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const hasRequiredRole = roles.includes(user.role);

  if (!hasRequiredRole) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Insufficient permissions',
    });
  }
}

/**
 * Проверить, что пользователь может получить доступ только к своим данным
 * или является администратором
 */
export async function requireOwnershipOrAdmin(
  event: any,
  resourceUserId: number
): Promise<void> {
  const user = await getSessionUserWithRole(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  // Админ может получить доступ к любым данным
  if (user.role === 'admin') {
    return;
  }

  // Обычный пользователь может получить доступ только к своим данным
  if (user.id !== resourceUserId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Access denied',
    });
  }
}
```

---

### 5. Исправление существующих endpoints

#### 5.1. `/api/users/[id].get.ts`

**Требования:**
- Админ может получить данные любого пользователя
- Обычный пользователь может получить только свои данные

**Решение:**
```typescript
import { getSessionUserWithRole } from '@/server/application/auth/roles';
import { requireOwnershipOrAdmin } from '@/server/middleware/require-role';
import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' });
  }

  // Проверка прав доступа
  await requireOwnershipOrAdmin(event, id);

  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }

  // Не возвращаем чувствительные данные (passwordHash)
  const { passwordHash, ...safeUser } = rows[0];
  return { item: safeUser };
});
```

#### 5.2. `/api/users/[id].patch.ts`

**Требования:**
- Админ может изменить данные любого пользователя
- Обычный пользователь может изменить только свои данные
- Обычный пользователь не может изменить свою роль

**Решение:**
```typescript
import { getSessionUserWithRole } from '@/server/application/auth/roles';
import { requireOwnershipOrAdmin } from '@/server/middleware/require-role';
import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';

export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' });
  }

  // Проверка прав доступа
  await requireOwnershipOrAdmin(event, id);

  const body = await readBody<{
    email?: string;
    name?: string;
    password?: string;
    roleId?: string; // Только для админов
  }>(event);

  const patch: any = {};

  if (body?.email) patch.email = body.email;
  if (body?.name !== undefined) patch.name = body.name;
  if (body?.password && body.password.length >= 6) {
    patch.passwordHash = await argon2.hash(body.password, {
      type: argon2.argon2id,
    });
  }

  // Только админ может изменить роль
  if (body?.roleId) {
    if (user.role !== 'admin') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden: Only admin can change user role',
      });
    }
    patch.roleId = body.roleId;
  }

  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to update' });
  }

  const updated = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, id))
    .returning();

  if (!updated.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }

  const { passwordHash, ...safeUser } = updated[0];
  return { item: safeUser };
});
```

#### 5.3. `/api/users/[id].delete.ts`

**Требования:**
- Админ может удалить любого пользователя
- Обычный пользователь может удалить только свой аккаунт

**Решение:**
```typescript
import { getSessionUserWithRole } from '@/server/application/auth/roles';
import { requireOwnershipOrAdmin } from '@/server/middleware/require-role';
import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' });
  }

  // Проверка прав доступа
  await requireOwnershipOrAdmin(event, id);

  // Админ не может удалить сам себя (защита от случайного удаления)
  if (user.role === 'admin' && user.id === id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Admin cannot delete own account',
    });
  }

  const deleted = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning();

  if (!deleted.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }

  return { ok: true };
});
```

---

### 6. Новые административные endpoints

#### 6.1. `GET /api/admin/users`

Получить список всех пользователей (только для админов).

**Query параметры:**
- `page` (number, default: 1) — номер страницы
- `limit` (number, default: 50, max: 100) — количество на странице
- `search` (string, optional) — поиск по email/name
- `roleId` (string, optional) — фильтр по роли

**Response:**
```json
{
  "users": [
    {
      "id": 1,
      "email": "user@example.com",
      "name": "User Name",
      "roleId": "user",
      "createdAt": "2024-01-01T00:00:00Z",
      "lastLoginAt": "2024-01-15T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

**Реализация:**
```typescript
// server/api/admin/users.get.ts

import { requireRole } from '@/server/middleware/require-role';
import { getQuery } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq, or, like, desc } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const search = query.search as string | undefined;
  const roleId = query.roleId as string | undefined;

  let whereConditions = [];

  if (search) {
    whereConditions.push(
      or(
        like(users.email, `%${search}%`),
        like(users.name, `%${search}%`)
      )!
    );
  }

  if (roleId) {
    whereConditions.push(eq(users.roleId, roleId));
  }

  const [usersList, totalResult] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        roleId: users.roleId,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined),
  ]);

  const total = Number(totalResult[0]?.count || 0);

  return {
    users: usersList,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
});
```

#### 6.2. `POST /api/admin/users`

Создать нового пользователя (только для админов).

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "name": "New User",
  "roleId": "user"
}
```

**Response:**
```json
{
  "user": {
    "id": 123,
    "email": "newuser@example.com",
    "name": "New User",
    "roleId": "user",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

#### 6.3. `GET /api/admin/stats`

Получить статистику (только для админов).

**Response:**
```json
{
  "totalUsers": 1000,
  "activeUsers": 500,
  "totalSubscriptions": 300,
  "activeSubscriptions": 250,
  "revenue": {
    "monthly": 50000,
    "yearly": 600000
  }
}
```

---

### 7. Frontend: Отображение ролей

#### 7.1. Определение роли пользователя

```typescript
// app/composables/useUserRole.ts

import { useAuthStore } from '@/app/stores/auth';

export function useUserRole() {
  const authStore = useAuthStore();

  const isAdmin = computed(() => {
    return authStore.user?.role === 'admin';
  });

  const isUser = computed(() => {
    return authStore.user?.role === 'user' || !authStore.user?.role;
  });

  const hasRole = (role: string) => {
    return authStore.user?.role === role;
  };

  return {
    isAdmin,
    isUser,
    hasRole,
  };
}
```

#### 7.2. Обновление auth store

```typescript
// app/stores/auth.ts

// Добавить поле role в state
state: () => ({
  user: null as { id: number; email: string; name: string; role?: string } | null,
  // ...
}),

// Обновить метод me() для получения роли
async me() {
  const response = await useAPI('/api/user/me', { method: 'GET' });
  this.user = response?.user ?? null;
  // role будет включен в ответ
}
```

#### 7.3. Административная панель

Создать страницу `/admin/users` для управления пользователями (только для админов).

```vue
<!-- app/pages/admin/users.vue -->

<template>
  <div v-if="isAdmin">
    <h1>Управление пользователями</h1>
    <!-- Список пользователей, поиск, фильтры -->
  </div>
  <div v-else>
    <p>Доступ запрещен</p>
  </div>
</template>

<script setup lang="ts">
import { useUserRole } from '@/app/composables/useUserRole';

const { isAdmin } = useUserRole();

// Загрузить список пользователей
const { data: usersData } = await useAPI('/api/admin/users', {
  method: 'GET',
});
</script>
```

---

### 8. Миграция существующих пользователей

#### 8.1. Установить роль по умолчанию

При применении миграции все существующие пользователи получат роль `user` по умолчанию:

```sql
-- В миграции
ALTER TABLE users ADD COLUMN role_id varchar(50) DEFAULT 'user' NOT NULL;
UPDATE users SET role_id = 'user' WHERE role_id IS NULL;
```

#### 8.2. Назначить первого админа

Создать скрипт для назначения первого администратора:

```typescript
// server/infrastructure/db/set-admin.ts

import { db } from './client';
import { users } from './schema';
import { eq } from 'drizzle-orm';

async function setAdmin(email: string) {
  const [user] = await db
    .update(users)
    .set({ roleId: 'admin' })
    .where(eq(users.email, email))
    .returning();

  if (!user) {
    throw new Error(`User with email ${email} not found`);
  }

  console.log(`✅ User ${email} is now admin`);
}

// Использование: node -r tsx server/infrastructure/db/set-admin.ts admin@example.com
const email = process.argv[2];
if (!email) {
  console.error('Usage: node set-admin.ts <email>');
  process.exit(1);
}

setAdmin(email)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

---

### 9. Тестирование

#### 9.1. Unit тесты

- [ ] Проверка функции `getUserRole()`
- [ ] Проверка функции `hasRole()`
- [ ] Проверка функции `isAdmin()`
- [ ] Проверка middleware `requireRole()`
- [ ] Проверка middleware `requireOwnershipOrAdmin()`

#### 9.2. Integration тесты

- [ ] Админ может получить данные любого пользователя
- [ ] Обычный пользователь может получить только свои данные
- [ ] Обычный пользователь не может получить список всех пользователей
- [ ] Админ может получить список всех пользователей
- [ ] Обычный пользователь не может изменить роль
- [ ] Админ может изменить роль пользователя

#### 9.3. E2E тесты

- [ ] Полный флоу: логин как админ → просмотр списка пользователей
- [ ] Полный флоу: логин как пользователь → попытка доступа к админ-панели → отказ
- [ ] Полный флоу: админ изменяет роль пользователя

---

### 10. Документация

#### 10.1. API документация

- [ ] Описать новые административные endpoints
- [ ] Описать изменения в существующих endpoints
- [ ] Добавить примеры запросов с разными ролями

#### 10.2. Документация для разработчиков

- [ ] Описать систему ролей
- [ ] Описать как использовать middleware для проверки прав
- [ ] Примеры использования в новых endpoints

---

## 📊 План реализации

### Фаза 1: Базовая структура (1 неделя)
1. ✅ Создать таблицу `roles` в БД
2. ✅ Добавить поле `roleId` в таблицу `users`
3. ✅ Создать seed скрипт для ролей
4. ✅ Применить миграцию
5. ✅ Назначить первого админа

### Фаза 2: Backend логика (1 неделя)
6. ✅ Создать функции для работы с ролями
7. ✅ Создать middleware для проверки прав
8. ✅ Исправить существующие endpoints `/api/users/[id]`
9. ✅ Создать административные endpoints
10. ✅ Написать unit и integration тесты

### Фаза 3: Frontend интеграция (1 неделя)
11. ✅ Обновить auth store для работы с ролями
12. ✅ Создать composable `useUserRole`
13. ✅ Создать административную панель
14. ✅ Обновить существующие компоненты
15. ✅ Написать E2E тесты

---

## ⚠️ Breaking Changes

### Для API:
- ❌ Endpoints `/api/users/[id]` теперь требуют авторизации
- ✅ Новые административные endpoints требуют роль `admin`

### Для БД:
- ✅ Добавлено поле `roleId` в таблицу `users` (значение по умолчанию: `'user'`)
- ✅ Создана таблица `roles`

### Миграция:
- Существующие пользователи автоматически получат роль `user`
- Первого админа нужно назначить вручную через скрипт

---

## 🔒 Безопасность после реализации

### Ожидаемые улучшения:
- ✅ Защита от несанкционированного доступа к данным других пользователей
- ✅ Разграничение прав между администраторами и пользователями
- ✅ Защита административных функций
- ✅ Возможность управления пользователями для админов

### Метрики безопасности:
- Количество попыток несанкционированного доступа: отслеживать в логах
- Количество административных действий: логировать в `admin_actions` таблицу

---

## 📅 Timeline

- **Неделя 1:** Фаза 1 (базовая структура)
- **Неделя 2:** Фаза 2 (backend логика)
- **Неделя 3:** Фаза 3 (frontend интеграция) + тестирование

---

## ✅ Критерии готовности

Система считается готовой, когда:
- [ ] Все задачи из Фазы 1 выполнены
- [ ] Все задачи из Фазы 2 выполнены
- [ ] Все задачи из Фазы 3 выполнены
- [ ] Все unit тесты проходят
- [ ] Все integration тесты проходят
- [ ] E2E тесты проходят
- [ ] Документация обновлена
- [ ] Code review пройден
- [ ] Security audit пройден (опционально)

---

## 🔗 Связанные документы

- `.docs/auth_security_improvements_tz.md` — улучшения безопасности авторизации
- `.docs/security_requirements.md` — общие требования безопасности
- `server/application/auth/session.ts` — текущая реализация сессий

---

**Дата создания:** 2025-01-XX  
**Автор:** AI Assistant  
**Версия:** 1.0

