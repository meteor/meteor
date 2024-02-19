<script setup lang="ts">
import { Collapse } from 'vue-collapsed'
import { ref } from 'vue'
import Caret from './Caret.vue'
import { types } from 'util'

const copyArray = <T>(arr: T[]): T[] => {
  const newArr: T[] = []
  for (const item of arr) newArr.push(item)
  return newArr
}
const props = defineProps<{
  params: {
    name: string;
    type: { names: string[] };
    description: string;
    optional: boolean;
  }[];
  options?: { description: string, name: string, type: { names: string[] }; optional?: boolean }[]
}>()
const localArr = copyArray(props.params)
const hasOptions = ({ params }: typeof props) => {
  for (const param of params) if (param.name === "options") return true
}

const isOptionsTableOpen = ref(false);

function toggleOptionsTable() {
  isOptionsTableOpen.value = !isOptionsTableOpen.value
}
const showTypes = (types: string[]) => {
  const typesArr = copyArray(types)
  if (typesArr.length === 1) return typesArr[0]

  const last = typesArr.pop()
  return typesArr.join(", ") + " or " + last
}

</script>

<template>
  <div v-if="localArr.length > 0">
    <h4>Arguments:</h4>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Description</th>
          <th>Required</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="param in localArr" :key="param.name">
          <td>{{ param.name }}</td>
          <td>{{ showTypes(param.type.names) }}</td>
          <template v-if="param.name === 'options'">
            <td>
              <span v-html="param.description"></span>
              <button v-if="(props.options?.length || -1) > 0" type="button" @click="toggleOptionsTable">
                {{ isOptionsTableOpen ? "Close" : "Open" }} options table
                <Caret :is-open="isOptionsTableOpen" />
              </button>
            </td>
          </template>
          <template v-else>
            <td v-html="param.description ?? `----`"></td>
          </template>
          <td>{{ param.optional ? "No" : "Yes" }}</td>
        </tr>
      </tbody>
    </table>
    <Collapse v-if="hasOptions(props) && props.options && props.options?.length > 0" :when="isOptionsTableOpen" class="options-table">
      <h4>Options:</h4>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="param in props.options" :key="param.name">
            <td>{{ param.name }}</td>
            <td>{{ param.type.names[0] }}</td>
            <td v-html="param.description ?? ``"></td>
            <td> No </td>
          </tr>
        </tbody>
      </table>
    </Collapse>
  </div>
</template>

<style scoped>
table {
  text-align: center;
}

.options-table {
  --easing-dur: calc(var(--vc-auto-duration) * 1.5) cubic-bezier(0.33, 1, 0.68, 1);

  transition:
    height var(--easing-dur),
    background-color var(--easing-dur),
    border-radius var(--easing-dur);
}

button:hover {
  cursor: pointer;
  color: var(--vp-c-brand-1);
}
</style>
