---
title: Vue
description: How to use the Vue frontend rendering library, with Meteor.
---

After reading this guide, you'll know:

1. What Vue is, and why you would consider using it with Meteor.
2. How to install Vue in your Meteor application, and how to use it correctly.
3. [TODO] How to structure your Vue application according to both Meteor's and Vue's style guides
4. How to use Vue's SSR (Serverside Rendering) with Meteor. 
5. [TODO] How to integrate Vue with Meteor's realtime data layer.

Vue already has an excellent guide with many advanced topics already covered. Some of them are [SSR (Serverside Rendering)](https://ssr.vuejs.org/), 
[Routing](https://router.vuejs.org/), [Code Structure and Style Guide](https://vuejs.org/v2/style-guide/) and [State Management with Vuex](https://vuex.vuejs.org/).

This documentation is purely focused on integrating it with Meteor.

<h2 id="introduction">Introduction</h2>
[Vue](https://vuejs.org/v2/guide/) (pronounced /vjuː/, like view) is a progressive framework for building user interfaces. 
Unlike other monolithic frameworks, Vue is designed from the ground up to be incrementally adoptable. 
The core library is focused on the view layer only, and is easy to pick up and integrate with other 
libraries or existing projects. On the other hand, Vue is also perfectly capable of powering sophisticated 
Single-Page Applications when used in combination with 
[modern tooling](https://vuejs.org/v2/guide/single-file-components.html) and [supporting libraries](https://github.com/vuejs/awesome-vue#components--libraries).

Vue has an excellent [guide and documentation](https://vuejs.org/v2/guide/). This guide is about integrating it with Meteor.

<h3 id="why-use-vue-with-meteor">Why use Vue with Meteor</h3>

Vue is—like React, Blaze and Angular—a frontend library. Some really nice frameworks are built around Vue. [Nuxt.js](https://nuxtjs.org) for example, aims to create a framework flexible enough that you can use it as a main project base or in addition to your current project based on Node.js.

Though Nuxt.js is full-stack and very pluggable. It lacks the an API to communicate data from and to the server. Also unlike Meteor, Nuxt still relies on a configuration file. 
Meteor's build tool and Pub/Sub API (or Apollo) provides Vue with this API that you would normally have to integrate yourself, greatly reducing the amount
of boilerplate code you have to write.

<h3 id="integrating-vue-with-meteor">Integrating Vue With Meteor</h3>

To start a new project:  

```sh
meteor create .
```

To install Vue in Meteor 1.8, you should add it as an npm dependency:

```sh
meteor npm install --save vue
```

To support [Vue's Single File Components](https://vuejs.org/v2/guide/single-file-components.html) with the .vue file extensions, install the following Meteor package created by Vue Core developer [Akryum (Guillaume Chau)](https://github.com/meteor-vue/vue-meteor/tree/master/packages/vue-component).

```sh
meteor add akryum:vue-component
```

At time of writing, there is a known bug in the vue-component package which makes the app refresh endlessly. This has to do with the package's own hot reload system. You can however work around it by setting 
the `NO_HMR=1` env var.  E.g. from the commandline run `NO_HMR=1 meteor`

You will end up with at least 3 files: 

- `/client/App.vue` (The root component of your app)
- `/client/main.js` (Initializing the Vue app in Meteor startup)
- `/client/main.html` (containing the body with the #app div)

We need a base HTML document that has the `app` id.  If you created a new project from `meteor create .`, put this in your `/client/main.html`.

```html
<body>
  <div id="app"></div>
</body>
```

You can now start writing .vue files in your app with the following format.  If you created a new project from `meteor create .`, put this in your `/client/App.vue`.

```vuejs
<template>
  <div>
    <p>This is a Vue component and below is the current date:<br />{{date}}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      date: new Date(),
    };
  }
}
</script>

<style scoped>
  p {
    font-size: 2em;
    text-align: center;
  }
</style>
```

You can render the Vue component hierarchy to the DOM by using the below snippet in you client startup file.  If you created a new project from `meteor create .`, put this in your `/client/main.js`.

```javascript
import Vue from 'vue';
import App from './App.vue';
import './main.html';

Meteor.startup(() => {
  new Vue({
    el: '#app',
    ...App,
  });
});
```

Run your new Vue+Meteor app with this command: `NO_HMR=1 meteor`

<h2 id="ssr-code-splitting">SSR and Code Splitting</h2>
Vue has [an excellent guide on how to render your Vue application on the server](https://vuejs.org/v2/guide/ssr.html). It includes code splitting, async data fetching and many other practices that are used in most apps that require this. 

<h3 id="basic-example">Basic example</h3>
Making Vue SSR to work with Meteor is not more complex then for example with [Express](https://expressjs.com/). 
However instead of defining a wildcard route, Meteor uses its own [server-render](https://docs.meteor.com/packages/server-render.html) package that exposes an `onPageLoad` function. Every time a call is made to 
the serverside, this function is triggered. This is where we should put our code like how its described on the [VueJS SSR Guide](https://ssr.vuejs.org/guide/#integrating-with-a-server).

To add the packages, run:

```sh
meteor add server-render
meteor npm install --save vue-server-renderer
```
then connect to Vue in `/server/main.js`:

```javascript
import { Meteor } from 'meteor/meteor';
import Vue from 'vue';
import { onPageLoad } from 'meteor/server-render';
import { createRenderer } from 'vue-server-renderer';

const renderer = createRenderer();

onPageLoad(sink => {
  console.log('onPageLoad');
  
  const url = sink.request.url.path;
  
  const app = new Vue({
    data: {
      url
    },
    template: `<div>The visited URL is: {{ url }}</div>`
  });

  renderer.renderToString(app, (err, html) => {
    if (err) {
      res.status(500).end('Internal Server Error');
      return
    }
    console.log('html', html);
    
    sink.renderIntoElementById('app', html);
  })
})

Meteor.startup(() => {
  // code to run on server at startup
  console.log('startup');
});
```
Please note this isn't a complete example.


