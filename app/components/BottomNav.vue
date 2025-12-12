<template>
  <div v-bind="$attrs" class="flex-[0_0_auto] inset-x-0 mt-2 sticky bottom-0">
    <section
      class="glass-deep px-0 py-3"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <ul class="grid grid-cols-4 gap-1 text-xs">
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
import IconMessageCircleHeart from '~icons/lucide/message-circle-heart';
import IconBrain from '~icons/lucide/brain';
import IconListCheck from '~icons/lucide/list-check';
import IconSettings from '~icons/lucide/settings';
import { useChatStore } from '@/app/stores/chat';

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();

const isActive = (path: string) => route.path === path;

// Обработчик клика на кнопку "Чат"
function handleChatClick(event: MouseEvent) {
  // Если уже на странице чата и есть сообщения - очищаем чат
  if (isActive('/') && chatStore.messages.length > 0) {
    event.preventDefault(); // Предотвращаем переход по ссылке
    chatStore.clearMessages();
  }
  // Если на другой странице или на главной без сообщений - позволяем NuxtLink обработать переход
}
</script>
