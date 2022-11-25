<template>
  <div>
    <h1>Welcome to Meteor!</h1>
    <hello/>
    <info/>
  </div>
</template>

<script>
import Hello from './components/Hello.vue'
import Info from './components/Info.vue'

export default {
  components: {
    Hello,
    Info,
  },
}
</script>

<style>
  body {
    font-family: sans-serif;
    padding: 10px;
  }
</style>
