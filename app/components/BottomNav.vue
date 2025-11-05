<template>
  <div
    v-bind="$attrs"
    class="flex-[0_0_auto] inset-x-0 pb-2 mt-2 sticky bottom-0"
  >
    <section
      class="glass-deep px-0 py-3"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <ul class="grid grid-cols-4 gap-1 text-xs">
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/"
            class="flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-white': isActive('/') }"
          >
            <span
              :class="[
                'icon-disc w-12 h-12 flex items-center justify-center',
                { 'icon-disc-active': isActive('/') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconHome class="w-5 h-5" />
            </span>
            <span class="w-full text-center">Чат</span>
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/therapy"
            class="flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-white': isActive('/therapy') }"
          >
            <span
              :class="[
                'icon-disc w-12 h-12 flex items-center justify-center',
                { 'icon-disc-active': isActive('/therapy') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconGauge class="w-5 h-5" />
            </span>
            <span class="w-full text-center">Поддержка</span>
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/habits"
            class="flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-white': isActive('/habits') }"
          >
            <span
              :class="[
                'icon-disc w-12 h-12 flex items-center justify-center',
                { 'icon-disc-active': isActive('/habits') },
              ]"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconCheck class="w-5 h-5" />
            </span>
            <span class="w-full text-center">Привычки</span>
          </NuxtLink>
        </li>
        <li class="flex flex-col items-center gap-1 w-full">
          <NuxtLink
            to="/settings"
            class="flex flex-col items-center justify-center icon-disc-wrapper"
            :class="{ 'text-white': isActive('/settings') }"
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
            <span class="w-full text-center">Настройки</span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import IconHome from '~icons/lucide/home';
import IconGauge from '~icons/lucide/gauge';
import IconCheck from '~icons/lucide/check';
import IconSettings from '~icons/lucide/settings';

const route = useRoute();
const isActive = (path: string) => route.path === path;
</script>
