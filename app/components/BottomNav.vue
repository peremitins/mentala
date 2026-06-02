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
            class="group flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/') }"
            @click="handleNavTap"
          >
            <span
              :class="[
                'glass-deep icon-disc w-10 h-10 flex items-center justify-center mb-1',
                { 'icon-disc-active': isActive('/') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconHome class="w-5 h-5" />
            </span>
            <span
              :class="[
                'w-full text-center text-[9px] transition-all duration-300',
                isActive('/')
                  ? 'text-foreground font-medium opacity-100'
                  : 'text-foreground opacity-60 group-hover:opacity-80',
              ]"
              >Главная</span
            >
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/practices"
            class="group flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/practices') }"
            @click="handleNavTap"
          >
            <span
              :class="[
                'glass-deep icon-disc w-10 h-10 flex items-center justify-center mb-1',
                { 'icon-disc-active': isActive('/practices') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconLeaf class="w-5 h-5" />
            </span>
            <span
              :class="[
                'w-full text-center text-[9px] transition-all duration-300',
                isActive('/practices')
                  ? 'text-foreground font-medium opacity-100'
                  : 'text-foreground opacity-60 group-hover:opacity-80',
              ]"
              >Практики</span
            >
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/therapy"
            class="group flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/therapy') }"
            @click="handleNavTap"
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
                'w-full text-center text-[9px] transition-all duration-300',
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
            @click="handleNavTap"
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
                'w-full text-center text-[9px] transition-all duration-300',
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
            to="/settings"
            class="group flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-foreground': isActive('/settings') }"
            @click="handleNavTap"
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
                'w-full text-center text-[9px] transition-all duration-300',
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
import IconHome from '~icons/lucide/home';
import IconBrain from '~icons/lucide/brain';
import IconLeaf from '~icons/lucide/leaf';
import IconListCheck from '~icons/lucide/list-check';
import IconSettings from '~icons/lucide/settings';
import { useHaptics } from '@/app/composables/useHaptics';

const { triggerLight } = useHaptics();
function handleNavTap() {
  void triggerLight();
}

const route = useRoute();

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
</script>
