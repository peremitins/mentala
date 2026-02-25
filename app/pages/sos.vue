<template>
  <div
    class="flex flex-col space-y-2 h-dvh overflow-y-auto pb-[100px] rounded-lg"
  >
    <PageHeader title="SOS" :show-back-button="true" @go-back="handleGoBack">
    </PageHeader>

    <SosPageContent />
  </div>
</template>

<script setup lang="ts">
import IconHeartPulse from '~icons/lucide/heart-pulse';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/app/components/PageHeader.vue';
import SosPageContent from '@/app/components/sos/SosPageContent.vue';
import { useSos, type SosOpenEntry } from '@/app/composables/useSos';

const route = useRoute();
const router = useRouter();
const sos = useSos();
const { step, setStep } = sos;

function handleGoBack() {
  if (step.value === 'select') {
    router.back();
    return;
  }
  if (step.value === 'panic-techniques') {
    setStep('select');
    return;
  }
  if (step.value === 'panic-grounding' || step.value === 'panic-breathing') {
    setStep('panic-techniques');
    return;
  }
  if (step.value === 'tension-practice' || step.value === 'finish') {
    setStep('select');
  }
}

onMounted(() => {
  const entry = route.query.entry;
  const entryStr = Array.isArray(entry) ? entry[0] : entry;
  sos.open(entryStr as SosOpenEntry | undefined);
});

onBeforeUnmount(() => {
  sos.close();
});
</script>
