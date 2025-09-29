# UI-компоненты: Card

- **Назначение**: базовые контейнеры для карточек (`Card`, `CardHeader`, `CardContent`).
- **Расположение**: `app/components/`.
- **Импорт**: для надёжности в `SFC` используется явный импорт в `<script setup>`:

```vue
<script setup lang="ts">
import Card from './Card.vue'
import CardHeader from './CardHeader.vue'
import CardContent from './CardContent.vue'
</script>
```

- **Причина**: авто-регистрация компонентов может отличаться в зависимости от структуры директорий. Явный импорт исключает предупреждения вида "Failed to resolve component".
- **Стили**: глобальные переменные корня определяем через `:root`, не `::root`.
