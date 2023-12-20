
<template>
  <div class="warning custom-block">
    <p class="custom-block-title">WARNING</p>
    <p>{{ props.locus }} only.</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  locus: string;
}>()
</script>

