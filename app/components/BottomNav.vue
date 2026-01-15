<template>
  <div
    v-bind="$attrs"
    class="flex-[0_0_auto] inset-x-0 mt-2 sticky bottom-0"
    :style="isMeditationPlayer ? { backdropFilter: 'blur(1px)' } : undefined"
  >
    <section class="glass-deep px-0 py-3">
      <ul class="grid grid-cols-5 gap-1 text-xs">
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/"
            @click="handleChatClick"
            class="flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/') }"
          >
            <span
              :class="[
                'icon-disc w-12 h-12 flex items-center justify-center',
                { 'icon-disc-active': isActive('/') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconMessageCircleHeart class="w-5 h-5" />
            </span>
            <span class="w-full text-center text-foreground">Чат</span>
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/therapy"
            class="flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/therapy') }"
          >
            <span
              :class="[
                'icon-disc w-12 h-12 flex items-center justify-center',
                { 'icon-disc-active': isActive('/therapy') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconBrain class="w-5 h-5" />
            </span>
            <span class="w-full text-center text-foreground">Терапия</span>
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/habits"
            class="flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/habits') }"
          >
            <span
              :class="[
                'icon-disc w-12 h-12 flex items-center justify-center',
                { 'icon-disc-active': isActive('/habits') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconListCheck class="w-5 h-5" />
            </span>
            <span class="w-full text-center text-foreground">Привычки</span>
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/meditations"
            class="flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/meditations') }"
          >
            <span
              :class="[
                'icon-disc w-12 h-12 flex items-center justify-center',
                { 'icon-disc-active': isActive('/meditations') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconLeaf class="w-5 h-5" />
            </span>
            <span class="w-full text-center text-foreground">Медитации</span>
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/settings"
            class="flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/settings') }"
          >
            <span
              :class="[
                'icon-disc w-12 h-12 flex items-center justify-center',
                { 'icon-disc-active': isActive('/settings') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconSettings class="w-5 h-5" />
            </span>
            <span class="w-full text-center text-foreground">Настройки</span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconMessageCircleHeart from '~icons/lucide/message-circle-heart';
import IconBrain from '~icons/lucide/brain';
import IconListCheck from '~icons/lucide/list-check';
import IconLeaf from '~icons/lucide/leaf';
import IconSettings from '~icons/lucide/settings';

const route = useRoute();
const router = useRouter();

// Размываем нижнюю панель только на странице плеера медитации.
const isMeditationPlayer = computed(() => {
  return route.path.startsWith('/meditations/') && Boolean(route.params?.id);
});

const isActive = (path: string) => {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
};

// Обработчик клика на кнопку "Чат"
function handleChatClick(event: MouseEvent) {
  // Если уже на странице чата и есть сообщения - очищаем чат и переходим на welcome
  if (isActive('/')) {
    router.push({ path: '/', query: { screen: 'welcome' } });
  }
}
</script>
