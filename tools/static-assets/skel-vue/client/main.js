import Vue from 'vue'

import '../imports/ui/plugins'

import App from '../imports/ui/App.vue'

Meteor.startup(() => {
  new Vue({
    el: '#app',
    ...App,
  })
})
