<script setup lang="ts">
import Booleans from './helpers/Booleans.vue'
import Functions from './helpers/Functions.vue'
import Locus from './helpers/Locus.vue'
import ParamTable from './helpers/ParamTable.vue'
import { useData } from 'vitepress'

import jsdoc from '../data/data.js'
type Jsdoc = typeof jsdoc

type Params = keyof Jsdoc

const props = defineProps<{
    name: Params;
    hasCustomExample?: boolean
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

const link = ui.longname.replace('.', '-').replace('#', '-')
const isInstance = ui.scope === 'instance';
const showName = (longname) => {
    if (isInstance) {
        // what is before # becomes `this`
        return longname.replace(/.*#/, 'this.')
    }

    return longname
}
const isBoolean = ui.type?.names?.at(0) === 'Boolean'

const isFunction = ui.kind === 'function' || ui?.params?.length > 0;


const debug = (name) => {
    if (ui.longname !== name) return
    console.log(ui)
}
// debug('Subscription#ready')
</script>

<template>
    <div>
        <h2 :id="link">
            {{ showName(ui.longname) }}
            <a class="header-anchor" :href="'#' + link" :aria-label="'Permalink to &quot;' + ui.longname + '&quot;'">​</a>
        </h2>

        <div v-html="ui.summary"></div>
        <Locus v-if="ui.locus !== 'Anywhere'" :locus="ui.locus" />
        <ParamTable v-if="isFunction" :params="ui.params" :options="ui.options" />
        <template v-if="!hasCustomExample">
            <Booleans v-if="isBoolean" :memberof="ui.memberof" :from="ui.module" :longname="ui.longname" />
            <Functions v-if="isFunction" :from="ui.module" :longname="ui.longname" :params="ui.params" :fnName="ui.name"
                :memberof="isInstance ? 'this' : ui.memberof" :scope="ui.scope" />
        </template>

    </div>
</template>

<style scoped>
span {
    font-size: 0.8rem;
    color: var(--vp-c-text-2);
}
</style>
