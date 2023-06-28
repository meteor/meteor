<template>
  <div>
    <h2>Learn Meteor!</h2>
    <ul>
      <li>
        <form class="info-link-add">
          <input type="text" v-model="title" name="title" placeholder="Title" required>
          <input type="url" v-model="url" name="url" placeholder="Url" required>
          <input type="submit" name="submit" @click="submit($event)" value="Add new link">
        </form>
      </li>

      <li v-for="link in links" v-bind:key="link._id">
        <a :href="link.url" target="_blank">{{ link.title }}</a>
      </li>

    </ul>
  </div>
</template>

<script>
import Links from '../../api/collections/Links'
import { subscribe, autorun } from "vue-meteor-tracker";

export default {
  data() {
    return {
      title: "",
      url: "",
      links: []
    }
  },
  methods: {
    submit(event) {
      event.preventDefault()
      Meteor.call('createLink', this.title, this.url, (error) => {
        if (error) {
          alert(error.error)
        } else {
          this.title = ''
          this.url = ''
        }
      })
    },
  },
  mounted() {
    subscribe('links')
    autorun(() => {
      this.links = Links.find().fetch()
    })
  }
}
</script>

<style scoped>
ul {
  font-family: monospace;
}
</style>
