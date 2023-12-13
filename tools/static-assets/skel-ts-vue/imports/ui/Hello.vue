<script setup>
import { ref } from 'vue'

const count = ref(0)

function increment() {
  count.value++
}
</script>

<template>
  <button @click="increment" class="bg-green-700 hover:bg-green-900 text-white py-2 px-4 rounded">Click Me</button>
  <p>
    You've pressed the button <strong>{{ count }}</strong> times.
  </p>
</template>
