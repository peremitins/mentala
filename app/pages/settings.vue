<template>
  <div class="glass-deep px-2 space-y-6 h-full overflow-y-auto">
    <PageHeader title="Настройки" />

    <section
      class="space-y-3"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <Tabs :model-value="tab" @update:model-value="onTabChange" class="w-full">
        <TabsList class="">
          <TabsTrigger class="" value="general">Общие</TabsTrigger>
          <TabsTrigger class="" value="prompts">Промпты</TabsTrigger>
          <TabsTrigger class="" value="notifications">Уведомления</TabsTrigger>
        </TabsList>

        <TabsContent value="general" class="space-y-3">
          <SettingsGeneral />
        </TabsContent>

        <TabsContent value="prompts" class="space-y-4">
          <SettingsPrompts />
        </TabsContent>

        <TabsContent value="notifications" class="space-y-4">
          <SettingsNotifications />
        </TabsContent>
      </Tabs>
    </section>

    <div class="flex items-center gap-3">
      <button @click="auth.logout()">Logout</button>
      <button class="btn btn-outline" @click="goNotificationsTest">
        Открыть тест уведомлений
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/app/stores/auth';
import type { SettingsTab } from '@/app/types/settings';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/components/ui/shadcn/tabs';
import SettingsGeneral from '@/app/components/settings/SettingsGeneral.vue';
import SettingsPrompts from '@/app/components/settings/SettingsPrompts.vue';
import SettingsNotifications from '@/app/components/settings/SettingsNotifications.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const tab = ref<SettingsTab>((route.query.tab as SettingsTab) || 'general');

function onTabChange(newTab: string | number) {
  const tabValue = String(newTab) as SettingsTab;
  tab.value = tabValue;
  router.replace({ query: { ...route.query, tab: tabValue } });
}

function goNotificationsTest() {
  router.push('/notifications-test');
}
</script>
