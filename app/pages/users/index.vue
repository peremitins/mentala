<template>
  <div class="flex flex-1 relative overflow-hidden p-2">
    <section
      class="flex-auto"
      :style="{ borderRadius: `calc(var(--radius-lg))` }"
    >
      <h2 class="text-lg font-semibold mb-4">Пользователи</h2>

      <!-- Scroll area for list only -->
      <div class="relative" :style="{ height: 'calc(100dvh - 210px)' }">
        <div class="absolute inset-0 overflow-y-auto pr-1 pb-28">
          <div v-if="loading" class="opacity-70 p-2 text-foreground">
            Загрузка…
          </div>
          <div v-else-if="error" class="text-destructive p-2">{{ error }}</div>
          <div v-else>
            <div
              v-if="!users.length"
              class="opacity-70 p-2 text-foreground"
            >
              Пока нет пользователей
            </div>
            <div class="w-full gap-3 space-y-3">
              <div
                v-for="(u, index) in users"
                :key="u.id"
                class="group relative overflow-hidden rounded-xl border-2 border-border bg-card p-4 transition-all duration-200 hover:border-primary-ui/50 hover:-translate-y-0.5 hover:shadow-lg outline-none animate-slide-up cursor-pointer"
                :style="`animation-delay: ${index * 0.05}s; animation-fill-mode: both`"
                :class="{
                  'cursor-pointer': canManageUsers,
                  'cursor-default': !canManageUsers,
                }"
                @click="canManageUsers ? editUser(u.id) : undefined"
              >
                <div class="grid gap-1 z-1">
                  <!-- Верхний блок с 3 столбцами -->
                  <div class="flex items-center gap-3 w-full">
                    <!-- Столбец 1: Имя (фиксированная ширина) -->
                    <span
                      class="text-foreground text-sm font-medium shrink-1 min-w-[50px] truncate"
                      :title="u.name || ''"
                    >
                      {{ u.name || 'Без имени' }}
                    </span>
                    <!-- Столбец 2: Email (занимает оставшееся место) -->
                    <span
                      class="text-foreground text-sm truncate min-w-0 flex-1"
                      :title="u.email || ''"
                    >
                      {{ u.email }}
                    </span>
                    <!-- Столбец 3: Роль (фиксированная ширина) -->
                    <span
                      class="text-foreground text-xs capitalize shrink-0 w-[50px] truncate"
                      :title="String(u.roleId)"
                    >
                      {{ u.roleId }}
                    </span>
                  </div>
                  <!-- Разделитель -->
                  <Separator v-if="canManageUsers" class="mt-2" />
                  <!-- Кнопки внизу (только для admin) -->
                  <div
                    v-if="canManageUsers"
                    class="flex justify-end z-1 mt-2"
                    @click.stop
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="editUser(u.id)"
                      title="Редактировать"
                      class="p-3 min-w-[44px] min-h-[44px]"
                    >
                      <IconEdit class="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="removeUser(u.id)"
                      :disabled="removingId === u.id"
                      title="Удалить"
                      class="p-3 min-w-[44px] min-h-[44px] text-destructive hover:text-destructive/80"
                    >
                      <IconTrash2 class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <!-- Floating add button (только для admin) -->
    <Button
      v-if="canManageUsers"
      as-child
      variant="outline"
      size="icon"
      class="absolute right-5 bottom-5"
      aria-label="Добавить пользователя"
    >
      <NuxtLink to="/users/create">
        <IconCirclePlus class="w-5 h-5" />
      </NuxtLink>
    </Button>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
});
import IconCirclePlus from '~icons/lucide/circle-plus';
import IconEdit from '~icons/lucide/edit';
import IconTrash2 from '~icons/lucide/trash-2';
import { Button } from '@/app/components/ui/button';
import { Separator } from '@/app/components/ui/shadcn/separator';
import { useUserRole } from '@/app/composables/useUserRole';

type UserRow = {
  id: number;
  email: string | null;
  createdAt: string;
  name: string | null;
  roleId?: string | null;
};

const { canManageUsers } = useUserRole();
const users = ref<UserRow[]>([]);
const loading = ref(false);
const error = ref('');

async function fetchUsers() {
  loading.value = true;
  error.value = '';
  try {
    const res = await $fetch<{ users: UserRow[] }>('/api/admin/users');
    users.value = res.users || [];
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Ошибка загрузки';
  } finally {
    loading.value = false;
  }
}

function editUser(id: number) {
  navigateTo(`/users/${id}`);
}

// Delete
const removingId = ref<number | null>(null);
async function removeUser(id: number) {
  removingId.value = id;
  try {
    await useAPI(`/api/users/${id}`, {
      method: 'DELETE',
    });
    users.value = users.value.filter((x) => x.id !== id);
    useToast('Готово', 'Пользователь удалён');
  } catch (e: any) {
    const errorMessage = e?.data?.message || e?.message || 'Ошибка удаления';
    useToast('Ошибка', errorMessage);
    console.error('Failed to delete user:', e);
  } finally {
    removingId.value = null;
  }
}

onMounted(fetchUsers);
</script>
