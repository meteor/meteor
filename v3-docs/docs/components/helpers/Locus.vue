
<template>
  <div class="warning custom-block">
    <p>{{ props.locus }} only</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  locus: string;
}>()
</script>

<style scoped>
div {
  margin: 0 !important;
  padding: 5px;
}
</style>
