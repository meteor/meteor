<script setup>
import { subscribe, autorun } from 'vue-meteor-tracker'
import { LinksCollection } from '/imports/api/links'

subscribe('links')
const links = autorun(() => LinksCollection.find({}).fetch()).result
</script>

<template>
  <h2 class="text-xl my-6 font-semibold">Learn Meteor!</h2>
  <ul class="list-disc underline">
    <li v-for="link of links" :key="link._id" class="hover:text-green-700">
      <a :href="link.url" target="_blank">{{ link.title }}</a>
    </li>
  </ul>
</template>
