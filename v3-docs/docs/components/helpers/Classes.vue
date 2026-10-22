


<script setup lang="ts">
import { makePrimitiveHTML } from '../scripts/make-primitive-html';
import ImportStatement from './Import.vue';

const props = defineProps<{
  from: string;
  isDefaultImport: boolean;
  longname: string;
  params: {
    name: string;
    type: { names: string[] };
    description: string;
    optional?: boolean;
  }[];
}>()

const toCamelCase = (str: string) => {
  if (str.includes(".")) {
    str = str.split(".")[1];
  }
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '');
}

const isOneLiner = props?.params?.length === 0;

</script>

<template>
  <div class="language-js vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">js</span> <pre class="shiki shiki-themes github-light github-dark vp-code"><code><ImportStatement :what="props.longname.split('.')[0]"  :is-default-import="props.isDefaultImport" :from="props.from" :scope="'static'"/>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> {{ toCamelCase(props.longname) }}</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> new</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> {{ props.longname }}</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(<span v-show="isOneLiner">);</span></span>
<span class="line" v-for="(param, index) in props.params" :key="param.name"><span v-html="makePrimitiveHTML({ primitive: [param.type.names[0]], arr: props.params, index, isOptional: param.optional, name: param.name })"/></span>
<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">);</span></span>
</code></pre>
  </div>
</template>
