<script setup lang="ts">
const props = defineProps<{
  params: {
    name: string;
    type: { names: string[] };
    description: string;
    optional: boolean;
  }[];
}>()

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
          <th>Optional</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="param in props.params" :key="param.name">
          <td>{{ param.name }}</td>
          <td>{{ param.type.names[0] }}</td>
          <td v-html="param.description"></td>
          <td>{{ param.optional ? "✅" : "❌" }}</td>
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
