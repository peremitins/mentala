# ТЗ: Система ролей и прав доступа (RBAC)

## 📋 Статус

**Статус:** Готово к реализации  
**Приоритет:** Высокий  
**Оценка:** 2-3 недели разработки  
**Версия ТЗ:** 2.0 (обновлено для 4 ролей: admin, user, moderator, support)

---

## 🎯 Цель

Реализовать систему ролей и прав доступа (Role-Based Access Control, RBAC) для разграничения доступа к ресурсам приложения между администраторами и обычными пользователями.

---

## 🔍 Текущее состояние и проблематика

### Текущие проблемы безопасности

#### 1. Неправильная защита endpoints `/api/users/[id]`

**Проблема:**
Endpoints `GET /api/users/[id]`, `PATCH /api/users/[id]`, `DELETE /api/users/[id]` защищены через `requireAdmin()`, что означает:

- ❌ Обычный пользователь не может получить доступ даже к своим данным через эти endpoints
- ❌ Используется проверка через `ADMIN_EMAILS` env переменную вместо системы ролей
- ❌ Нет разграничения между ролями (admin, moderator, support, user)

**Текущий код:**

```typescript
// server/api/users/[id].get.ts
export default defineEventHandler(async (event) => {
  await requireAdmin(event); // ❌ Требует админа для ЛЮБОГО доступа
  // ...
});
```

**Риски:**

- Пользователь не может получить свои данные через `/api/users/[id]`
- Нет гибкой системы прав для разных ролей
- Зависимость от env переменной вместо БД

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
- Полный доступ к premium функциям (AI + аватар) независимо от подписки

**`user`** — Обычный пользователь (по умолчанию)

- Доступ только к своим данным
- Может просматривать/изменять только свой профиль
- Может управлять только своими подписками
- Не может просматривать список других пользователей
- Не может выполнять административные действия

#### 1.2. Дополнительные роли

**`moderator`** — Модератор

- Может просматривать список всех пользователей (read-only)
- Может просматривать данные любого пользователя (read-only)
- Может блокировать/разблокировать пользователей (через поле `isBlocked` в таблице `users`)
- Полный доступ к premium функциям (AI + аватар) независимо от подписки
- Не может удалять пользователей
- Не может изменять email/пароль других пользователей
- Не может изменять подписки
- Не может изменять роли пользователей
- Не может просматривать статистику и аналитику

**`support`** — Служба поддержки

- Может просматривать данные любого пользователя (read-only)
- Может просматривать подписки любого пользователя (read-only)
- Может просматривать историю подписок пользователя
- Полный доступ к premium функциям (AI + аватар) независимо от подписки
- Не может изменять данные пользователей
- Не может изменять подписки
- Не может удалять пользователей
- Не может блокировать/разблокировать пользователей
- Не может просматривать список всех пользователей (только по ID)
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
  ('user', 'Пользователь', 'Обычный пользователь приложения', true),
  ('moderator', 'Модератор', 'Может просматривать пользователей и блокировать их', true),
  ('support', 'Служба поддержки', 'Может просматривать данные и подписки пользователей', true);
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

**Выбранный вариант:**
Используем простой вариант — одна роль на пользователя (поле `role_id` напрямую в таблице `users`):

```sql
ALTER TABLE users ADD COLUMN role_id varchar(50) DEFAULT 'user' NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_role_id_fk FOREIGN KEY (role_id) REFERENCES roles(id);
```

**Примечание:** Если в будущем понадобятся множественные роли, можно будет мигрировать на таблицу `user_roles` (многие-ко-многим).

#### 2.3. Поле `isBlocked` для блокировки пользователей

Для функционала модератора (блокировка/разблокировка) добавляем поле:

```sql
ALTER TABLE users ADD COLUMN is_blocked boolean DEFAULT false NOT NULL;
```

**Примечание:** Блокированные пользователи не могут авторизоваться (проверка в `getSessionUser`).

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

#### 3.2. Добавить поля `roleId` и `isBlocked` в таблицу `users`

```typescript
// server/infrastructure/db/schema.ts

export const users = pgTable('users', {
  // ... существующие поля
  roleId: varchar('role_id', { length: 50 })
    .default('user')
    .notNull()
    .references(() => roles.id),
  isBlocked: boolean('is_blocked').default(false).notNull(),
  // ... остальные поля
});
```

#### 3.3. Seed скрипт для ролей

```typescript
// server/infrastructure/db/seed-roles.ts

import { db } from './client';
import { roles } from './schema';

async function seedRoles() {
  await db
    .insert(roles)
    .values([
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
      {
        id: 'moderator',
        name: 'Модератор',
        description: 'Может просматривать пользователей и блокировать их',
        isSystem: true,
      },
      {
        id: 'support',
        name: 'Служба поддержки',
        description: 'Может просматривать данные и подписки пользователей',
        isSystem: true,
      },
    ])
    .onConflictDoNothing({ target: roles.id });
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
 * Проверить, может ли пользователь просматривать данные другого пользователя
 */
export async function canViewUser(
  viewerId: number,
  targetUserId: number
): Promise<boolean> {
  const viewerRole = await getUserRole(viewerId);

  // Админ, модератор и support могут просматривать любых пользователей
  if (['admin', 'moderator', 'support'].includes(viewerRole)) {
    return true;
  }

  // Обычный пользователь может просматривать только себя
  return viewerId === targetUserId;
}

/**
 * Проверить, может ли пользователь изменять данные другого пользователя
 */
export async function canEditUser(
  editorId: number,
  targetUserId: number
): Promise<boolean> {
  const editorRole = await getUserRole(editorId);

  // Только админ может изменять других пользователей
  if (editorRole === 'admin') {
    return true;
  }

  // Обычный пользователь может изменять только себя
  return editorId === targetUserId;
}

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
 * Проверить, заблокирован ли пользователь
 */
export async function isUserBlocked(userId: number): Promise<boolean> {
  const user = await db
    .select({ isBlocked: users.isBlocked })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length) {
    return true; // Если пользователь не найден, считаем заблокированным
  }

  return user[0].isBlocked || false;
}

/**
 * Проверить, имеет ли пользователь указанную роль
 */
export async function hasRole(
  userId: number,
  role: UserRole
): Promise<boolean> {
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
 * Проверить, что пользователь может получить доступ к данным другого пользователя
 * Правила:
 * - admin, moderator, support: могут просматривать любых пользователей
 * - user: может просматривать только себя
 */
export async function requireCanViewUser(
  event: any,
  targetUserId: number
): Promise<void> {
  const user = await getSessionUserWithRole(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  // Админ, модератор и support могут просматривать любых пользователей
  if (['admin', 'moderator', 'support'].includes(user.role)) {
    return;
  }

  // Обычный пользователь может просматривать только себя
  if (user.id !== targetUserId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Access denied',
    });
  }
}

/**
 * Проверить, что пользователь может изменять данные другого пользователя
 * Правила:
 * - admin: может изменять любых пользователей
 * - user: может изменять только себя
 * - moderator, support: не могут изменять других пользователей
 */
export async function requireCanEditUser(
  event: any,
  targetUserId: number
): Promise<void> {
  const user = await getSessionUserWithRole(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  // Только админ может изменять других пользователей
  if (user.role === 'admin') {
    return;
  }

  // Обычный пользователь может изменять только себя
  if (user.id !== targetUserId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Only admin can edit other users',
    });
  }
}
```

---

### 5. Исправление существующих endpoints

#### 5.1. `/api/users/[id].get.ts`

**Требования:**

- Admin, moderator, support могут получить данные любого пользователя
- Обычный пользователь может получить только свои данные

**Решение:**

```typescript
import { getSessionUserWithRole } from '@/server/application/auth/roles';
import { requireCanViewUser } from '@/server/middleware/require-role';
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
  await requireCanViewUser(event, id);

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

- Admin может изменить данные любого пользователя
- User может изменить только свои данные
- Moderator и support не могут изменять данные других пользователей
- Только admin может изменить роль пользователя
- **Примечание:** Блокировка/разблокировка пользователей доступна только через отдельный endpoint `PATCH /api/moderator/users/[id]/block`

**Решение:**

```typescript
import { getSessionUserWithRole } from '@/server/application/auth/roles';
import { requireCanEditUser } from '@/server/middleware/require-role';
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

  const body = await readBody<{
    email?: string;
    name?: string;
    password?: string;
    roleId?: string; // Только для админов
    isBlocked?: boolean; // Запрещено - использовать отдельный endpoint
  }>(event);

  // Запрещаем изменение isBlocked через этот endpoint
  if (body?.isBlocked !== undefined) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Use PATCH /api/moderator/users/[id]/block for blocking/unblocking users',
    });
  }

  // Проверка прав доступа (для изменения других пользователей)
  if (user.id !== id) {
    await requireCanEditUser(event, id);
  }

  const patch: any = {};

  // Обычный пользователь может изменять только свои базовые данные
  if (user.id === id) {
    if (body?.email) patch.email = body.email;
    if (body?.name !== undefined) patch.name = body.name;
    if (body?.password && body.password.length >= 6) {
      patch.passwordHash = await argon2.hash(body.password, {
        type: argon2.argon2id,
      });
    }
  } else {
    // Админ может изменять любые данные других пользователей
    if (user.role === 'admin') {
      if (body?.email) patch.email = body.email;
      if (body?.name !== undefined) patch.name = body.name;
      if (body?.password && body.password.length >= 6) {
        patch.passwordHash = await argon2.hash(body.password, {
          type: argon2.argon2id,
        });
      }
    }
  }

  // Только админ может изменить роль
  if (body?.roleId !== undefined) {
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

- Admin может удалить любого пользователя (кроме себя)
- User может удалить только свой аккаунт
- Moderator и support не могут удалять пользователей

**Решение:**

```typescript
import { getSessionUserWithRole } from '@/server/application/auth/roles';
import { requireCanEditUser } from '@/server/middleware/require-role';
import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq, sql } from 'drizzle-orm';

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
  await requireCanEditUser(event, id);

  // Админ не может удалить сам себя (защита от случайного удаления)
  if (user.role === 'admin' && user.id === id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Admin cannot delete own account',
    });
  }

  // Проверка: нельзя удалить последнего админа
  if (user.role === 'admin' && user.id !== id) {
    const targetUser = await db
      .select({ roleId: users.roleId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (targetUser[0]?.roleId === 'admin') {
      const adminCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.roleId, 'admin'));

      const adminCount = Number(adminCountResult[0]?.count || 0);
      if (adminCount <= 1) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Cannot delete last admin',
        });
      }
    }
  }

  const deleted = await db.delete(users).where(eq(users.id, id)).returning();

  if (!deleted.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }

  return { ok: true };
});
```

---

### 6. Новые административные endpoints

#### 6.1. `GET /api/admin/users`

Получить список всех пользователей (для админов и модераторов).

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
import { eq, or, like, desc, and, sql } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'moderator']);

  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const search = query.search as string | undefined;
  const roleId = query.roleId as string | undefined;

  let whereConditions = [];

  if (search) {
    whereConditions.push(
      or(like(users.email, `%${search}%`), like(users.name, `%${search}%`))!
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

**Примечание:** Moderator и support не могут создавать пользователей.

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

**Примечание:** Moderator и support не имеют доступа к статистике.

#### 6.4. Использование существующих endpoints с проверкой прав

**Примечание:** Вместо создания отдельного endpoint для support, используем существующий `/api/subscriptions/current` с проверкой прав доступа.

**Требования:**

- Support может просматривать подписки любого пользователя (через query параметр `?userId=123`)
- Admin может просматривать подписки любого пользователя
- User может просматривать только свои подписки

**Реализация:**

Обновить существующий `GET /api/subscriptions/current` для поддержки `?userId=123` (только для admin/support):

```typescript
// server/api/subscriptions/current.get.ts

import { getSessionUser } from '@/server/application/auth/session';
import { getQuery } from 'h3';
import { requireCanViewUser } from '@/server/middleware/require-role';
// ... остальной код

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    // ... существующая логика для неавторизованных
  }

  const query = getQuery(event);
  const targetUserId = query.userId
    ? Number(query.userId)
    : sessionResult.user.id;

  // Если запрашивается другой пользователь - проверяем права
  if (targetUserId !== sessionResult.user.id) {
    await requireCanViewUser(event, targetUserId);
  }

  // Используем targetUserId вместо sessionResult.user.id для запросов к БД
  // ... остальная логика
});
```

#### 6.5. `PATCH /api/moderator/users/[id]/block`

Блокировать/разблокировать пользователя (для moderator и admin).

**Request:**

```json
{
  "isBlocked": true
}
```

**Реализация:**

```typescript
// server/api/moderator/users/[id]/block.patch.ts

import { requireRole } from '@/server/middleware/require-role';
import { getRouterParam, readBody, createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'moderator']);

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' });
  }

  const body = await readBody<{ isBlocked: boolean }>(event);
  if (typeof body?.isBlocked !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'isBlocked is required',
    });
  }

  const updated = await db
    .update(users)
    .set({ isBlocked: body.isBlocked })
    .where(eq(users.id, id))
    .returning();

  if (!updated.length) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }

  const { passwordHash, roleId, ...safeUser } = updated[0];

  return {
    item: {
      id: safeUser.id,
      email: safeUser.email,
      name: safeUser.name,
      isBlocked: safeUser.isBlocked,
      roleId: safeUser.roleId,
      createdAt: safeUser.createdAt,
      updatedAt: safeUser.updatedAt,
    },
  };
});
```

**Response:**

```json
{
  "item": {
    "id": 123,
    "email": "user@example.com",
    "name": "User Name",
    "isBlocked": true,
    "roleId": "user",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T00:00:00Z"
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

  const isModerator = computed(() => {
    return authStore.user?.role === 'moderator';
  });

  const isSupport = computed(() => {
    return authStore.user?.role === 'support';
  });

  const isUser = computed(() => {
    return authStore.user?.role === 'user' || !authStore.user?.role;
  });

  const hasRole = (role: string | string[]) => {
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(authStore.user?.role || 'user');
  };

  const canViewAllUsers = computed(() => {
    return ['admin', 'moderator'].includes(authStore.user?.role || '');
  });

  const canManageUsers = computed(() => {
    return authStore.user?.role === 'admin';
  });

  return {
    isAdmin,
    isModerator,
    isSupport,
    isUser,
    hasRole,
    canViewAllUsers,
    canManageUsers,
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
ALTER TABLE users ADD COLUMN is_blocked boolean DEFAULT false NOT NULL;
UPDATE users SET role_id = 'user' WHERE role_id IS NULL;
```

#### 8.2. Миграция существующих админов

Создать скрипт для миграции админов из `ADMIN_EMAILS` env переменной:

```typescript
// server/infrastructure/db/migrate-admins.ts

import { config } from 'dotenv';
import { resolve } from 'node:path';

// Загружаем env
const envFile =
  process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
const envPath = resolve(process.cwd(), envFile);
config({ path: envPath });

import { db } from './client';
import { users } from './schema';
import { eq, inArray } from 'drizzle-orm';

async function migrateAdmins() {
  const adminEmails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    console.warn('⚠️  ADMIN_EMAILS is not set, skipping admin migration');
    return;
  }

  console.log(
    `🔄 Migrating ${adminEmails.length} admin(s) from ADMIN_EMAILS...`
  );

  const updated = await db
    .update(users)
    .set({ roleId: 'admin' })
    .where(inArray(users.email, adminEmails))
    .returning();

  console.log(`✅ Migrated ${updated.length} user(s) to admin role:`);
  updated.forEach((u) => console.log(`   - ${u.email}`));

  const notFound = adminEmails.filter(
    (email) => !updated.some((u) => u.email?.toLowerCase() === email)
  );
  if (notFound.length > 0) {
    console.warn(`⚠️  Users not found (emails from ADMIN_EMAILS):`);
    notFound.forEach((email) => console.warn(`   - ${email}`));
  }
}

migrateAdmins()
  .then(() => {
    console.log('✅ Admin migration completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Admin migration failed:', err);
    process.exit(1);
  });
```

**Использование:**

```bash
pnpm tsx server/infrastructure/db/migrate-admins.ts
```

#### 8.3. Назначить роль пользователю вручную

**Описание:** Скрипт для назначения роли существующему пользователю по email.

**Файл:** `server/infrastructure/db/set-role.ts`

**Использование:**

```bash
pnpm tsx server/infrastructure/db/set-role.ts <email> <role>
```

**Параметры:**

- `email` (string, обязательный) — email пользователя
- `role` (string, обязательный) — роль: `admin`, `user`, `moderator`, `support`

**Поведение:**

1. Загружает переменные окружения из `.env` или `.env.development`
2. Проверяет наличие `NUXT_PRIVATE_DB_URL`
3. Ищет пользователя по email (case-insensitive)
4. Если пользователь не найден — выводит ошибку и завершает с кодом 1
5. Если роль невалидна — выводит ошибку и завершает с кодом 1
6. Обновляет `roleId` пользователя
7. Выводит подтверждение и завершает с кодом 0

**Примеры:**

```bash
# Назначить админа
pnpm tsx server/infrastructure/db/set-role.ts admin@example.com admin

# Назначить модератора
pnpm tsx server/infrastructure/db/set-role.ts mod@example.com moderator

# Назначить support
pnpm tsx server/infrastructure/db/set-role.ts support@example.com support

# Вернуть обычного пользователя
pnpm tsx server/infrastructure/db/set-role.ts user@example.com user
```

**Код скрипта:**

```typescript
// server/infrastructure/db/set-role.ts

import { config } from 'dotenv';
import { resolve } from 'node:path';

const envFile =
  process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
const envPath = resolve(process.cwd(), envFile);
config({ path: envPath });

import { db } from './client';
import { users } from './schema';
import { eq } from 'drizzle-orm';

const validRoles = ['admin', 'user', 'moderator', 'support'];

async function setRole(email: string, role: string) {
  if (!validRoles.includes(role)) {
    throw new Error(
      `Invalid role: ${role}. Valid roles: ${validRoles.join(', ')}`
    );
  }

  const [user] = await db
    .update(users)
    .set({ roleId: role })
    .where(eq(users.email, email.toLowerCase().trim()))
    .returning();

  if (!user) {
    throw new Error(`User with email ${email} not found`);
  }

  console.log(`✅ User ${email} is now ${role}`);
}

// Использование: pnpm tsx server/infrastructure/db/set-role.ts <email> <role>
const email = process.argv[2];
const role = process.argv[3];

if (!email || !role) {
  console.error(
    'Usage: pnpm tsx server/infrastructure/db/set-role.ts <email> <role>'
  );
  console.error(`Valid roles: ${validRoles.join(', ')}`);
  process.exit(1);
}

setRole(email, role)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
```

---

### 9. Тестирование

#### 9.1. Unit тесты

- [ ] Проверка функции `getUserRole()`
- [ ] Проверка функции `hasRole()`
- [ ] Проверка функции `isAdmin()`
- [ ] Проверка функции `canViewUser()`
- [ ] Проверка функции `canEditUser()`
- [ ] Проверка middleware `requireRole()`
- [ ] Проверка middleware `requireCanViewUser()`
- [ ] Проверка middleware `requireCanEditUser()`

#### 9.2. Integration тесты

- [ ] Админ может получить данные любого пользователя
- [ ] Обычный пользователь может получить только свои данные
- [ ] Обычный пользователь не может получить список всех пользователей
- [ ] Админ может получить список всех пользователей
- [ ] Обычный пользователь не может изменить роль
- [ ] Админ может изменить роль пользователя
- [ ] Moderator может блокировать/разблокировать пользователей
- [ ] Moderator не может изменять email/пароль других пользователей
- [ ] Support может просматривать подписки пользователей
- [ ] Support не может изменять данные пользователей
- [ ] Блокированные пользователи не могут авторизоваться

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
- ✅ Добавлено поле `isBlocked` в таблицу `users` (значение по умолчанию: `false`)
- ✅ Создана таблица `roles` с 4 ролями: admin, user, moderator, support

### Миграция:

- Существующие пользователи автоматически получат роль `user`
- Админы из `ADMIN_EMAILS` env переменной мигрируются автоматически через скрипт `migrate-admins.ts`
- После миграции `ADMIN_EMAILS` больше не используется (можно удалить из env)

---

## 🔒 Безопасность после реализации

### Ожидаемые улучшения:

- ✅ Защита от несанкционированного доступа к данным других пользователей
- ✅ Разграничение прав между администраторами и пользователями
- ✅ Защита административных функций
- ✅ Возможность управления пользователями для админов

### Метрики безопасности:

- Количество попыток несанкционированного доступа: отслеживать в логах

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

---

## ⚠️ Важные замечания для реализации

### 1. Проверка блокировки в `getSessionUser`

**КРИТИЧНО:** Необходимо добавить проверку `isBlocked` в функцию `getSessionUser`:

```typescript
// server/application/auth/session.ts

const user = await db
  .select()
  .from(users)
  .where(
    and(
      eq(users.id, rows[0].userId),
      eq(users.isBlocked, false) // Блокированные пользователи не могут авторизоваться
    )
  )
  .limit(1);
```

### 2. Миграция существующих админов

Перед применением миграции БД:

1. Убедитесь, что `ADMIN_EMAILS` установлен в env
2. После миграции запустите `pnpm tsx server/infrastructure/db/migrate-admins.ts`
3. После миграции `ADMIN_EMAILS` больше не нужен (можно удалить)

### 3. Защита от удаления последнего админа

При удалении пользователя с ролью `admin` необходимо проверить, что это не последний админ в системе (см. раздел 5.3).

### 4. Обновление `requireAdmin`

После реализации системы ролей, функцию `requireAdmin` в `server/application/auth/admin.ts` нужно заменить на `requireRole(event, 'admin')` или оставить как обертку для обратной совместимости.

### 5. Frontend: Обновление типов

Не забудьте обновить типы пользователя в:

- `app/stores/auth.ts` — добавить `role?: string` и `isBlocked?: boolean`
- `shared/dto/index.ts` — добавить типы для ролей
- `app/composables/useUserRole.ts` — обновить для всех 4 ролей

### 6. Endpoints для moderator и support

Не забудьте создать:

- `GET /api/support/users/[id]/subscriptions` — для просмотра подписок
- `PATCH /api/moderator/users/[id]/block` — для блокировки пользователей

---

**Дата создания:** 2025-01-XX  
**Дата обновления:** 2025-12-19  
**Автор:** AI Assistant  
**Версия:** 2.0 (4 роли: admin, user, moderator, support)
