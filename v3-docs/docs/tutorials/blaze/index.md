# Meteor.js 3 + Blaze

In this tutorial, we will create a simple To-Do app using [Blaze](https://www.blazejs.org/) and Meteor 3.0. Meteor works well with other frameworks like [React](https://react.dev/), [Vue 3](https://vuejs.org/), [Solid](https://www.solidjs.com/), and [Svelte](https://svelte.dev/).

Blaze was created as part of Meteor when it launched in 2011, React was created by Facebook in 2013. Both have been used successfully by large production apps. Blaze is the easiest to learn and has the most full-stack Meteor packages, but React is more developed and has a larger community. Vue, Solid and Svelte are newer UI frameworks that some teams prefer. Choose what you like but learning Blaze is always a good idea because you may want to use Blaze UI packages with your app even if you are using something like React. The [accounts-ui](https://docs.meteor.com/packages/accounts-ui) package is a good example. 

Blaze is a powerful library for creating user interfaces by writing reactive HTML templates using an easy-to-learn Handlebars-like template syntax. If you are new and not sure what UI framework to use, Blaze is a great place to start. Compared to using a combination of traditional templates and jQuery, Blaze eliminates the need for all the “update logic” in your app that listens for data changes and manipulates the DOM. Instead, familiar template directives like <span v-pre>{{#if}}</span> and <span v-pre>{{#each}}</span> integrates with [Tracker’s](https://docs.meteor.com/api/tracker.html) “transparent reactivity” and [Minimongo’s](https://docs.meteor.com/api/collections.html) database cursors so that the DOM updates automatically.

To start building your Blaze app, you'll need a code editor. If you're unsure which one to choose, [Visual Studio Code](https://code.visualstudio.com/) is a good option.

Let’s begin building your app!

# Table of Contents

[[toc]]

<!-- @include: ./1.creating-the-app.md-->
<!-- @include: ./2.collections.md-->
<!-- @include: ./3.forms-and-events.md-->
<!-- @include: ./4.update-and-remove.md-->
<!-- @include: ./5.styles.md-->
<!-- @include: ./6.filter-tasks.md-->
<!-- @include: ./7.adding-user-accounts.md-->
<!-- @include: ./8.deploying.md-->
<!-- @include: ./9.next-steps.md-->
