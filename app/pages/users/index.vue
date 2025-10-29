<template>
  <div class="flex flex-1 relative overflow-hidden p-2">
    <section
      class="flex-auto glass-deep p-2"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <h2 class="text-lg font-semibold mb-4">Пользователи</h2>

      <!-- Scroll area for list only -->
      <div class="relative" :style="{ height: 'calc(100dvh - 210px)' }">
        <div class="absolute inset-0 overflow-y-auto pr-1 pb-28">
          <div v-if="loading" class="opacity-70 p-2">Загрузка…</div>
          <div v-else-if="error" class="text-red-400 p-2">{{ error }}</div>
          <div v-else>
            <div v-if="!users.length" class="opacity-70 p-2">
              Пока нет пользователей
            </div>
            <ul class="space-y-2">
              <li
                v-for="u in users"
                @click="editUser(u.id)"
                :key="u.id"
                class="flex items-center gap-2 justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2"
              >
                <div class="flex items-center gap-3 min-w-0 w-full">
                  <span class="text-white/70 text-xs sm:text-sm shrink-0">
                    {{ u.name }}
                  </span>
                  <span class="truncate">{{ u.email }}</span>
                </div>
                <div class="flex items-center shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="min-w-[44px] min-h-[44px]"
                    @click="editUser(u.id)"
                    title="Редактировать"
                  >
                    <IconEdit class="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="min-w-[44px] min-h-[44px]"
                    @click="removeUser(u.id)"
                    :disabled="removingId === u.id"
                    title="Удалить"
                  >
                    <IconTrash2 class="w-4 h-4" />
                  </Button>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
    <!-- Floating add button -->
    <NuxtLink
      to="/users/create"
      class="absolute right-5 bottom-5 grid place-items-center"
      aria-label="Добавить пользователя"
    >
      <IconCirclePlus class="w-5 h-5" />
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import IconCirclePlus from '~icons/lucide/circle-plus';
import IconEdit from '~icons/lucide/edit';
import IconTrash2 from '~icons/lucide/trash-2';

type UserRow = {
  id: number;
  email: string | null;
  createdAt: string;
  name: string | null;
};

const users = ref<UserRow[]>([]);
const loading = ref(false);
const error = ref('');

async function fetchUsers() {
  loading.value = true;
  error.value = '';
  try {
    const res = await $fetch<{ items: UserRow[] }>('/api/users');
    users.value = res.items || [];
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
    useToast('Готово', 'Пользователь удалён', 'success');
  } catch (e) {
  } finally {
    removingId.value = null;
  }
}

onMounted(fetchUsers);
</script>
