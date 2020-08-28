import Vue from 'vue'

import './plugins'

import App from './App.vue'

Meteor.startup(() => {
  new Vue({
    el: '#app',
    ...App,
  })
})
