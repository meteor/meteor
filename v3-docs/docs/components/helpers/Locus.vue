
<template>
  <div class="info custom-block">
    <p class="custom-block-title">Locus:</p>
    <p>{{ props.locus }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  locus: string;
}>()
</script>

