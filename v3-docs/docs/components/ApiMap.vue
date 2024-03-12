<script setup>
import { useData } from "vitepress";
import { ref, computed, watchEffect } from 'vue'
import names from "../data/names.json";
import { createMap, filterMap } from "./scripts/map-maker.js";

const apiList = createMap(names)
const listRef = ref(apiList);
const search = ref("");

watchEffect(() => {
  listRef.value = filterMap(search.value, apiList);
})

const shouldRedirect = (list, api) => {
  if (list?.shouldGoTo) {
    return `${list.shouldGoTo}`;
  }
  return api;
}

</script>

<template>
  <main>
    <label for="search">Search</label>
    <br />
    <input class="search" type="text" v-model="search" />
    <div v-for="(list, api, index) in listRef" :key="index">
      <h2 style="text-transform:capitalize;">
        <a :href="shouldRedirect(list, api)" style="text-decoration: none;">
          {{ api }}
        </a>
      </h2>

      <div v-for="(links, key) in list" :key="key">
        <!-- Should not render the shouldGoTo section  -->
        <div v-if="key !== 'shouldGoTo'">
          <h5 v-for="(link) in links" :key="link">
            <a :href="shouldRedirect(list, api) + '#' + link.replace('#', '-').replace('.', '-')">
              {{ link }}
            </a>
          </h5>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.search {
  width: 100%;
  height: 2rem;
  border-radius: 0.5rem;
  border: 1px solid #ccc;
  padding: 0.5rem;
  margin-bottom: 1rem;
}

a {
  color: var(--vp-c-text-1);
}

a:hover {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}
</style>

