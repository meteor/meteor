


<script setup lang="ts">
const props = defineProps<{
  from: string;
  isDefaultImport: boolean;
  longname: string;
  memberof: string;
}>();
import ImportStatement from './Import.vue';

</script>

<template>
  <div class="language-js vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">js</span>
    <pre class="shiki shiki-themes github-light github-dark vp-code"><code><ImportStatement :what="props.memberof" :is-default-import="props.isDefaultImport" :from="props.from" :scope="'static'"/>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">/** </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">@type</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> {Boolean}</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"> */</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ({{ props.longname }}) {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // do something</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre>
  </div>
</template>
