<template>
  <div
    v-bind="$attrs"
    class="flex-[0_0_auto] inset-x-0 mt-2 sticky bottom-0"
    :style="isMeditationPlayer ? { backdropFilter: 'blur(1px)' } : undefined"
  >
    <section :class="['glass-deep-bottom px-4 pt-3 pb-4 ']">
      <ul class="grid grid-cols-5 gap-1 text-xs">
        <li class="flex flex-col items-center gap-0 w-full">
          <NuxtLink
            to="/"
            @click="handleChatClick"
            class="group flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/') }"
          >
            <span
              :class="[
                'glass-deep icon-disc w-10 h-10 flex items-center justify-center mb-1',
                { 'icon-disc-active': isActive('/') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconMessageCircleHeart class="w-5 h-5" />
            </span>
            <span
              :class="[
                'w-full text-center text-[10px] transition-all duration-300',
                isActive('/')
                  ? 'text-foreground font-medium opacity-100'
                  : 'text-foreground opacity-60 group-hover:opacity-80',
              ]"
              >Чат</span
            >
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/therapy"
            class="group flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/therapy') }"
          >
            <span
              :class="[
                'glass-deep icon-disc w-10 h-10 flex items-center justify-center mb-1',
                { 'icon-disc-active': isActive('/therapy') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconBrain class="w-5 h-5" />
            </span>
            <span
              :class="[
                'w-full text-center text-[10px] transition-all duration-300',
                isActive('/therapy')
                  ? 'text-foreground font-medium opacity-100'
                  : 'text-foreground opacity-60 group-hover:opacity-80',
              ]"
              >Терапия</span
            >
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/habits"
            class="group flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/habits') }"
          >
            <span
              :class="[
                'glass-deep icon-disc w-10 h-10 flex items-center justify-center mb-1',
                { 'icon-disc-active': isActive('/habits') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconListCheck class="w-5 h-5" />
            </span>
            <span
              :class="[
                'w-full text-center text-[10px] transition-all duration-300',
                isActive('/habits')
                  ? 'text-foreground font-medium opacity-100'
                  : 'text-foreground opacity-60 group-hover:opacity-80',
              ]"
              >Привычки</span
            >
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/practices"
            class="group flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isPracticesActive }"
          >
            <span
              :class="[
                'glass-deep icon-disc w-10 h-10 flex items-center justify-center mb-1',
                { 'icon-disc-active': isPracticesActive },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconActivity class="w-5 h-5" />
            </span>
            <span
              :class="[
                'w-full text-center text-[10px] transition-all duration-300',
                isPracticesActive
                  ? 'text-foreground font-medium opacity-100'
                  : 'text-foreground opacity-60 group-hover:opacity-80',
              ]"
              >Практики</span
            >
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/settings"
            class="group flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/settings') }"
          >
            <span
              :class="[
                'glass-deep icon-disc w-10 h-10 flex items-center justify-center mb-1',
                { 'icon-disc-active': isActive('/settings') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconSettings class="w-5 h-5" />
            </span>
            <span
              :class="[
                'w-full text-center text-[10px] transition-all duration-300',
                isActive('/settings')
                  ? 'text-foreground font-medium opacity-100'
                  : 'text-foreground opacity-60 group-hover:opacity-80',
              ]"
              >Настройки</span
            >
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
import IconActivity from '~icons/lucide/activity';
import IconSettings from '~icons/lucide/settings';

const route = useRoute();
const router = useRouter();

const detailTrackId = computed(() => {
  const raw = route.query.trackId;
  if (Array.isArray(raw)) return raw[0]?.trim() || '';
  if (typeof raw === 'string') return raw.trim();
  return '';
});

// Размываем нижнюю панель только на странице плеера медитации.
const isMeditationPlayer = computed(() => {
  return route.path.startsWith('/meditations') && Boolean(detailTrackId.value);
});

const isActive = (path: string) => {
  if (path === '/') return route.path === '/';
  if (path === '/settings') {
    return (
      route.path === path ||
      route.path.startsWith(`${path}/`) ||
      route.path === '/scene-selection'
    );
  }
  return route.path === path || route.path.startsWith(`${path}/`);
};

const isPracticesActive = computed(() => {
  return (
    route.path.startsWith('/practices') ||
    route.path.startsWith('/meditations') ||
    route.path.startsWith('/breath-practices')
  );
});

// Обработчик клика на кнопку "Чат"
function handleChatClick() {
  // Если уже на странице чата и есть сообщения - очищаем чат и переходим на welcome
  if (isActive('/')) {
    router.push({ path: '/', query: { screen: 'welcome' } });
  }
}
</script>
