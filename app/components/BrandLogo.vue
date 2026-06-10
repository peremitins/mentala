<template>
  <img
    :src="src"
    :alt="alt"
    :class="$attrs.class"
    :style="$attrs.style as any"
    draggable="false"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/app/stores/auth';

const auth = useAuthStore();

// Логотип выбирается по locale пользователя из /api/user/me.
// Fallback: если locale не определён — используется ru.
const src = computed(() => {
  const locale = (auth.user?.locale || '').toLowerCase();
  const isEn = locale.startsWith('en');
  return isEn ? '/logo_en.svg' : '/logo_ru.svg';
});

const alt = computed(() => {
  const locale = (auth.user?.locale || '').toLowerCase();
  return locale.startsWith('en') ? 'Mentala' : 'Ментала';
});

defineOptions({ inheritAttrs: false });
</script>
