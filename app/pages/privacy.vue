<template>
  <div class="p-2">
    <section
      class="glass-deep p-5 space-y-6"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <h2 class="text-lg font-semibold">Конфиденциальность</h2>

      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="max-w-[70ch]">
          <div class="font-medium">Сохранять историю диалогов</div>
          <div class="text-sm opacity-70">
            Если включено — ваши сообщения и ответы сохраняются, используются
            для контекста и статистики. Можно удалить в любой момент.
          </div>
        </div>
        <SwitchRoot
          :checked="saveHistoryLocal"
          @update:checked="onSwitchChange"
          class="w-14 h-8 rounded-full border border-white/15 bg-white/10 backdrop-blur flex items-center px-1 data-[state=checked]:bg-green-500"
        >
          <SwitchThumb
            class="w-6 h-6 bg-white rounded-full transition-transform translate-x-0 data-[state=checked]:translate-x-6"
          />
        </SwitchRoot>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <SelectField
          v-model="retention"
          :options="retentionOptions"
          :multiple="false"
          placeholder="Выберите срок хранения"
        />
        <button
          class="glass px-4 py-2 inline-flex items-center justify-center"
          @click="saveRetention"
        >
          Сохранить срок
        </button>
      </div>

      <div class="flex flex-wrap gap-3">
        <button
          class="glass px-4 py-2 inline-flex items-center justify-center"
          @click="clearNow"
        >
          Очистить историю
        </button>
        <a
          class="glass px-4 py-2 inline-flex items-center justify-center button-style"
          href="/api/user/export"
          >Скачать архив</a
        >
        <button
          class="glass px-4 py-2 inline-flex items-center justify-center"
          @click="deleteAll"
        >
          Удалить все данные
        </button>
      </div>

      <div>
        <a class="underline opacity-80" href="/docs/privacy" target="_blank"
          >Как мы защищаем данные</a
        >
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SelectField from '~/components/ui/SelectField.vue';

import { SwitchRoot, SwitchThumb } from 'radix-vue';

interface UserResponse {
  uuid: number;
  retentionDays: number;
  saveHistory: boolean;
}

const { data, refresh } = await useAPI<UserResponse>('/api/user/me');

const retention = ref<number>(data.value?.retentionDays ?? 0);

const retentionOptions = [
  { value: 0, label: 'Без лимита' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
  { value: 365, label: '365 дней' },
];

const saveHistoryLocal = ref(false);

watchEffect(() => {
  saveHistoryLocal.value = !!data.value?.saveHistory;
});

async function onSwitchChange(v: boolean) {
  const req = useAPI('/api/user/update', {
    method: 'PATCH',
    body: { saveHistory: v },
    server: false,
    immediate: false,
  });
  await req.execute();
  await refresh();
}

async function saveRetention() {
  const req = useAPI('/api/user/update', {
    method: 'PATCH',
    body: { retentionDays: retention.value },
    server: false,
    immediate: false,
  });
  await req.execute();
  await refresh();
}

async function clearNow() {
  const req = useAPI('/api/ai/history/clear', {
    method: 'POST',
    server: false,
    immediate: false,
  });
  await req.execute();
}

async function deleteAll() {
  const req = useAPI('/api/user/delete', {
    method: 'POST',
    server: false,
    immediate: false,
  });
  await req.execute();
  await refresh();
}
</script>
