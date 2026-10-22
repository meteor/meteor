<script setup lang="ts">
const props = defineProps<{
  scope: string;
  what: string;
  from: string;
  isDefaultImport: boolean;
}>()

const exportName = (what: string) => props.isDefaultImport ? ` ${what} ` : ` { ${what} } `
</script>


<template>
  <span class="line" v-if="props.scope !== 'instance' && props.from">
    <span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span>
    <span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {{ exportName(what) }} </span>
    <span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span>
    <span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> "meteor/{{ props.from }}"</span>
    <span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span>
  </span>
</template>