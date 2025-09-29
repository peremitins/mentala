<template>
  <div>
    <div
      class="m-8 p-8 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,.25)]"
    >
      11111111111111111111
    </div>
    <div
      class="m-8 p-8 rounded-2xl bg-[#1a1a1a] shadow-[8px_8px_16px_#111, -8px_-8px_16px_#232323]"
    >
      22222222222222222222
    </div>
    <Card
      class="m-8 p-8 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md glass text-amber-400"
    >
      <CardHeader>11111111111111111111</CardHeader>
      <CardContent>22222222222222222222</CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import Card from './Card.vue'
import CardHeader from './CardHeader.vue'
import CardContent from './CardContent.vue'
</script>

<style lang="scss" scoped>
::root {
  --glass-bg: 255 255 255; /* rgb */
  --glass-alpha: 0.1;
}
.dark {
  --glass-bg: 17 17 17;
  --glass-alpha: 0.12;
}
</style>
