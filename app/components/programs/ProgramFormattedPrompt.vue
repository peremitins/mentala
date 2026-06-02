<template>
  <div>
    <template v-if="formattedItems.length">
      <p v-if="introText" class="whitespace-pre-line">{{ introText }}</p>
      <ol class="mt-2 space-y-1.5">
        <li
          v-for="item in formattedItems"
          :key="`${item.number}-${item.text}`"
          class="grid grid-cols-[auto_1fr] gap-2"
        >
          <span class="text-foreground/55">{{ item.number }}.</span>
          <span class="whitespace-pre-line">{{ item.text }}</span>
        </li>
      </ol>
    </template>
    <!-- whitespace-pre-line сохраняет переносы строк из \n в исходном prompt:
         даёт авторам blueprint простой контроль за абзацами без HTML-разметки. -->
    <p v-else class="whitespace-pre-line">{{ normalizedText }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  text: string;
}>();

const normalizedText = computed(() => props.text.trim());
const numberedMarkers = computed(() =>
  Array.from(normalizedText.value.matchAll(/(?:^|\s)(\d+)[).]\s+/g))
);
const introText = computed(() => {
  const firstMarker = numberedMarkers.value[0];
  if (!firstMarker || typeof firstMarker.index !== 'number') return '';
  return normalizedText.value.slice(0, firstMarker.index).trim();
});
const formattedItems = computed(() => {
  const markers = numberedMarkers.value;
  if (markers.length === 0) return [];

  return markers.map((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const nextMarker = markers[index + 1];
    const end =
      nextMarker && typeof nextMarker.index === 'number'
        ? nextMarker.index
        : normalizedText.value.length;

    return {
      number: marker[1],
      text: normalizedText.value.slice(start, end).trim(),
    };
  });
});
</script>
