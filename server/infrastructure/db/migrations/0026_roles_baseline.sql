BEGIN;

INSERT INTO roles (id, name, description, is_system)
VALUES
  ('admin', 'Администратор', 'Полный доступ ко всем ресурсам системы', true),
  ('user', 'Пользователь', 'Обычный пользователь с доступом к приложению', true),
  ('moderator', 'Модератор', 'Модераторский доступ к инструментам обзора и отчётности', true),
  ('support', 'Поддержка', 'Операторы поддержки с доступом к административным разделам', true)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_system = EXCLUDED.is_system;

COMMIT;
