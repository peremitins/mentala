<template>
  <div class="flex px-4 z-10">
    <PopoverRoot v-model:open="settingsOpen">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="w-7 h-7 text-foreground/80 transition hover:text-foreground"
          aria-label="Открыть настройки"
        >
          <IconSettings class="w-full h-full" />
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          side="bottom"
          align="end"
          :side-offset="8"
          class="z-50 min-w-[260px] rounded-3xl glass-deep p-3 space-y-4"
        >
          <div class="flex items-center justify-between gap-0.5 h-10">
            <div class="text-sm text-foreground">Режим</div>
            <Combobox
              class="max-w-[170px]"
              v-model="displayMode"
              :options="AI_WORK_MODE_OPTIONS"
              placeholder="Выберите режим"
            />
          </div>

          <div class="flex items-center justify-between gap-0.5 h-10">
            <div class="text-sm text-foreground">Тема</div>
            <Combobox
              class="max-w-[170px]"
              v-model="colorMode.preference"
              :options="THEME_OPTIONS"
              placeholder="Тема"
            />
          </div>

          <NuxtLink
            to="/scene-selection"
            class="flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm text-foreground transition hover:bg-white/10"
            @click="settingsOpen = false"
          >
            <div class="flex items-center gap-2">
              <IconSparkles class="h-4 w-4" />
              <span>Атмосфера</span>
            </div>
            <span class="text-xs text-foreground/60">Открыть</span>
          </NuxtLink>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useColorMode } from '#imports';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'radix-vue';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import {
  AI_WORK_MODE_OPTIONS,
  THEME_OPTIONS,
} from '@/app/constants/select-options';
import Combobox from '@/app/components/Combobox.vue';
import IconSettings from '~icons/lucide/settings';
import IconSparkles from '~icons/lucide/sparkles';

const settingsOpen = ref(false);
const chatSettings = useChatSettingsStore();
const colorMode = useColorMode();

const displayMode = computed({
  get: () => (chatSettings.mode === 'talk' ? 'therapy' : chatSettings.mode),
  set: (value: string) => {
    if (value === 'therapy' || value === 'habits') {
      chatSettings.mode = value;
    }
  },
});

</script>
