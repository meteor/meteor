# Meteor.js 3 + Solid

In this tutorial, we will create a simple To-Do app using [Solid](https://www.solidjs.com/) and Meteor 3.0. Meteor works well with other frameworks like [React](https://react.dev/), [Vue 3](https://vuejs.org/), [Svelte](https://svelte.dev/), and [Blaze](https://www.blazejs.org/).

Solid is a modern UI framework that compiles your reactive code to highly efficient DOM updates at runtime, resulting in smaller bundles and exceptional performance without a virtual DOM. Launched in 2020, it has gained popularity for its fine-grained reactivity, simplicity, and lightweight nature. Compared to older approaches, Solid eliminates much of the boilerplate and runtime overhead found in frameworks like React by using a compiler that optimizes updates precisely where needed. It employs a declarative JSX syntax with built-in primitives like signals for state management, effects, and resources that can be seamlessly integrated with Meteor's reactive data sources like[Tracker](https://docs.meteor.com/api/tracker.html) and [Minimongo](https://docs.meteor.com/api/collections.html). This means your UI updates automatically as data changes, without manual DOM manipulation.

If you're new and not sure what UI framework to use, Solid is a great place to start—it's easy to learn (especially if you're familiar with React-like JSX), highly performant with fine-grained reactivity, and has a growing community. You can still leverage Meteor packages designed for other frameworks, like [accounts-ui](https://docs.meteor.com/packages/accounts-ui), even in a Solid app.

To start building your Solid app, you'll need a code editor. If you're unsure which one to choose, [Visual Studio Code](https://code.visualstudio.com/) is a good option.

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
