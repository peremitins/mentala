<template>
  <div class="space-y-4 h-dvh overflow-y-auto">
    <PageHeader title="⚙️&nbsp;&nbsp;Настройки" />

    <section
      class="space-y-3"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <Tabs :model-value="tab" @update:model-value="onTabChange" class="w-full">
        <TabsList class="grid grid-cols-3">
          <TabsTrigger class="" value="general">Общие</TabsTrigger>
          <TabsTrigger class="" value="notifications">Уведомления</TabsTrigger>
          <TabsTrigger class="" value="user">Пользователь</TabsTrigger>
        </TabsList>

        <TabsContent value="general" class="space-y-3">
          <SettingsGeneral />
        </TabsContent>

        <TabsContent value="notifications" class="space-y-4">
          <SettingsNotifications />
        </TabsContent>

        <TabsContent value="user" class="space-y-4">
          <SettingsUser />
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
import SettingsNotifications from '@/app/components/settings/SettingsNotifications.vue';
import SettingsUser from '@/app/components/settings/SettingsUser.vue';

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
