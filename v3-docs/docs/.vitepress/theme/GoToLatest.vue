<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vitepress";
const router = useRouter();
let url = ref(`https://docs.meteor.com${router.route.path}`);

if (typeof window !== 'undefined') watch(() => router.route.path, (path) =>
  url.value = `https://docs.meteor.com${path}`
  , { immediate: true })
</script>

<template>
  <div class="warning custom-block">
    <p class="custom-block-title">Warning</p>
    <p>You are viewing an old version of the Meteor documentation. Click <a v-bind:href="url">here</a> to
      go to the latest version.</p>
  </div>
  <br />
</template>