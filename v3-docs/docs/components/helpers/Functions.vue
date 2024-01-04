


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
    optional: boolean;
  }[];
}>()
const removeTags = (str) => str?.replace(/<[^>]*>?/gm, '')

const primitiveMap = {
  function: '{Function}',
  String: '{string}',
  Number: '{number}',
  Boolean: '{boolean}',
  Object: '{Object}',
  Array: '{Array}',
}
const primitiveDefault = {
  function: () => `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  () </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {}`,
  string: (name) => `<span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  "${name}"`,
  number: () => '<span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  42',
  boolean: () => '<span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  false',
  object: (name) => `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  ${name}`,
  array: () => '<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  []',
  "array.<string>": () => '<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">"string"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]',
  "array.<object>": () => '<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  [</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}]',
  "array.<ejsonable>": () => `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  [${primitiveDefault.ejsonable()}]`,
  // someProp: 'string', num: 42, bool: false, arr: [], obj: {}
  "ejsonable"() {
    return `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  { num:${primitiveDefault.number()}</span>, someProp:${primitiveDefault.string("foo")}</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}`
  },
  promise: () => '<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  Promise {</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}',
  any: () => '<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  any',
}

const comma = `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span>`
const br = `<br/>`;
const comment = `<span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // this param is optional </span>`

const line = ({ html, pre, post } = { pre: '', post: '', html: '' }) => `${pre}<span class="line">${html}</span>${post}`
const tryWith = (fn) => {
  try {
    return [fn(), null]
  } catch (e) {
    return [null, e]
  }
}
const makePrimitiveHTML =
  ({ primitive, arr, index, isOptional, name }) => {
    let n: string = primitive[0],
      primitiveName = n.toLowerCase(),
      value;

    try {
      value = primitiveDefault[primitiveName](name);
    } catch (e) {
      console.error('primitive that we got:', primitive)
      throw new Error(`primitive ${primitiveName} is not registred in the map, here is the error: ${e}`)
    }

    if (arr.length > 1) return line(
      {
        html: value + `${comma}</span>`,
        pre: index === 0 ? '' : br,
        post: isOptional ? comment : '',
      }
    );
    return value + `</span>`;
  }

</script>

<template>
  <div class="language-js vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">js</span>
    <pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { {{ props.memberof }} } </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> "meteor/{{ props.from }}"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{{ props.memberof }}.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">{{ props.fnName }}</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line" v-for="(param, index) in props.params" :key="param.name"><span v-html="makePrimitiveHTML({ primitive: [param.type.names[0]], arr: props.params, index, isOptional: param.optional, name: param.name })"/></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">);</span></span></code></pre>
  </div>
</template>



