<script setup lang="ts">
import Booleans from './helpers/Booleans.vue'
import Locus from './helpers/Locus.vue'
import { useData } from 'vitepress'

import jsdoc from '../data/data.js'
type Jsdoc = typeof jsdoc

type Params = keyof Jsdoc

const props = defineProps<{
    name: Params
}>()

function getJsdoc<T extends Params>(key: T): Jsdoc[T] {
    if (!jsdoc[key]) {
        const { page } = useData()
        throw new Error(`
                jsdoc key: "${key}" not found.
                Refer to data/data.js for available keys.
                Error come from ${page.value.filePath}
                `)
    }

    return jsdoc[key]
}

const ui = getJsdoc(props.name)
console.log(ui)

// <div class="api {{bare}} new-api-box">
//   <div class="api-heading">
//     <div class="locus">
//       {{locus}}
//     </div>

//     <{{hTag}} title="{{{title}}}" class="title-api selflink" id={{id}}>
//       <a href="#{{id}}" class="link primary">{{{signature}}}</a>
//     </{{hTag}}>

//     <div class="subtext-api">
//       {{#if importName}}
//         <div class="code">import { {{importName}} } from 'meteor/{{module}}'</div>
//       {{/if}}

//       {{#if filepath}}
//         <a class="src-code link secondary" href="https://github.com/meteor/meteor/blob/master/packages/{{filepath}}#L{{lineno}}" target="_blank">
//           ({{filepath}}, line {{lineno}})
//         </a>
//       {{/if}}
//     </div>
//   </div>

//   <div class="api-body">
//     <div class="desc">
//       {{{markdown summary}}}
//     </div>

//     {{#if paramsNoOptions}}
//       <h4 class="subheading">Arguments</h4>
//       <dl class="args">
//         {{#each paramsNoOptions}}
//           <dt>
//             <span class="name">{{name}}</span>
//             <span class="type">{{{typeNames type.names}}}</span>
//           </dt>
//           <dd>
//             {{{description}}}
//           </dd>
//         {{/each}}
//       </dl>
//     {{/if}}

//     {{#if options}}
//       <h4 class="subheading">Options</h4>
//       <dl class="args">
//         {{#each options}}
//           <dt>
//             <span class="name">{{name}}</span>
//             <span class="type">{{{typeNames type.names}}}</span>
//           </dt>
//           <dd>
//             {{{description}}}
//           </dd>
//         {{/each}}
//       </dl>
//     {{/if}}

//     {{#if UI.contentBlock}}
//     {{#markdown}}{{> UI.contentBlock}}{{/markdown}}
//     {{/if}}
//   </div>
// </div>
const link = ui.longname.replace('.', '-').replace('#', '-')
const isBoolean = ui.type.names.at(0) === 'Boolean'
</script>

<template>
    <div>
        <h2 :id="link">
            {{ ui.longname }}
            <a class="header-anchor" :href="'#' + link" :aria-label="'Permalink to &quot;' + ui.longname + '&quot;'">​</a>
        </h2>

        <div v-html="ui.summary"></div>
        <Locus :locus="ui.locus" />
        <div v-if="isBoolean">
            <Booleans :from="ui.module" :longname="ui.longname" />
        </div>
    </div>
</template>

<style scoped>
span {
    font-size: 0.8rem;
    color: var(--vp-c-text-2);
}
</style>
