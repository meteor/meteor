


<script setup lang="ts">
import { makePrimitiveHTML } from '../scripts/make-primitive-html';
const props = defineProps<{
  from: string;
  longname: string;
  memberof: string;
  fnName: string;
  params: {
    name: string;
    type: { names: string[] };
    description: string;
    optional: boolean;
  }[];
  scope: string;
}>()
const isOneLiner = props.params.length === 0;

function trimFnName(str: string) {
  if (str.startsWith('.')) {
    return str.slice(1);
  }

  return str;
}

</script>

<template>
  <div class="language-js vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">js</span>
    <pre
      class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line" v-if="props.scope !== 'instance'"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { {{ props.memberof.split(".")[0] }} } </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> "meteor/{{ props.from }}"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{{ props.memberof }}.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">{{ trimFnName(props.fnName) }}</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(<span v-show="isOneLiner">);</span></span></span>
<span class="line" v-for="(param, index) in props.params" :key="param.name"><span v-html="makePrimitiveHTML({ primitive: [param.type.names[0]], arr: props.params, index, isOptional: param.optional, name: param.name })"/></span>
<span v-show="!isOneLiner" class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">);</span></span></code></pre>
  </div>
</template>



