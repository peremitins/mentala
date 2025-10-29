<template>
  <div class="sticky top-0 z-50 bg-background/95 backdrop-blur-md">
    <div class="flex items-center mb-2 h-10">
      <Button
        v-if="props.showBackButton"
        variant="ghost"
        size="icon"
        @click="goBack"
      >
        <IconArroeLeft />
      </Button>
      <h1 class="text-lg font-bold">
        {{ props.title }}
      </h1>
    </div>

    <Separator />
  </div>
</template>

<script lang="ts" setup>
import IconArroeLeft from '~icons/lucide/arrow-left';

interface Props {
  title: string;
  showBackButton?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showBackButton: false,
});

const router = useRouter();

const goBack = () => {
  router.back();
};
</script>
