<script setup lang="ts">
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
  options?: { description: string, name: string, type: { names: string[] } }[]
}>()
const localArr = copyArray(props.params)
const hasOptions = ({ params }: typeof props) => {
  for (const param of params) if (param.name === "options") return true
}

if (hasOptions(props) && props.options) {
  for (const opt of props.options) {
    const { name, type, description } = opt
    localArr.push({ name: `options.${name}`, type, description, optional: true })
  }
}
</script>

<template>
  <div>
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
          <td>{{ param.type.names[0] }}</td>
          <td v-html="param.description ?? ``"></td>
          <td>{{ param.optional ? "❌" : "✅" }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
table {
  text-align: center;
}
</style>
