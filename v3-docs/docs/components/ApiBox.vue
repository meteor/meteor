<script setup lang="ts">
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
</script>

<template>
    <div>
        <h1>{{ ui.name }}</h1>
        <div v-html="ui.summary"></div>
    </div>
</template>
