


<script setup lang="ts">
import { useData } from "vitepress";
const props = defineProps<{
  from: string;
  longname: string;
  memberof: string;
  fnName: string;
  params: {
    name: string;
    type: { names: string[] };
    description: string;
  }[];
}>()
const removeTags = (str) => str.replace(/<[^>]*>?/gm, '')

const primitiveMap = {
  function: 'Function',
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Object: 'Object',
}
const primitiveDefault = {
  function: `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  () </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {}`,
  String: '<span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  ""',
  Number: '<span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  42',
  Boolean: '<span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  false',
  Object: '<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  {}',
}

const makePrimitiveHTML = (primitive, index) => {
  if (index === 0) {
    return primitiveDefault[primitive]+ `</span>`;
  }
  return primitiveDefault[primitive]+ `,</span>`;
}
</script>

<template>
  <div class="language-js vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">js</span>
    <pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { {{ props.memberof }} } </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> "meteor/{{ props.from }}"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">/**</span></span>
<span class="line" v-for="(param) in props.params" :key="param.name"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"> * </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> @param </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> {{ primitiveMap[param.type.names[0]] }}</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {{ param.name }}</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"> {{ removeTags(param.description) }}</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"> */</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{{ props.memberof }}.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">{{ props.fnName }}</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line" v-for="(param, index) in props.params" :key="param.name"><span v-html="makePrimitiveHTML([param.type.names[0]], index)"/></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">);</span></span></code></pre></div>
</template>



