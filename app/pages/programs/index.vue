<script setup lang="ts">
// Экран «Мои сады» объединён с Оранжереей (/garden): теперь это единая точка
// обзора всех садов — активного, завершённых и будущих. Старые внутренние
// ссылки и закладки/deep-link на /programs мягко перенаправляем сюда, чтобы
// ничего не падало в 404.
await navigateTo('/garden', { replace: true });
</script>

<template>
  <div />
</template>
