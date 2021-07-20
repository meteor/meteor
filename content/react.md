---
title: React
description: How to use React with Meteor.
discourseTopicId: 20192
---

After reading this guide, you'll know:

1. What React is, and why you would consider using it with Meteor.
2. How to install React in your Meteor application, and how to use it correctly.
3. How to integrate React with Meteor's realtime data layer.
4. How to route in a React/Meteor application.

<h2 id="introduction">Introduction</h2>

[React](https://reactjs.org/) is a JavaScript library for building reactive user interfaces developed and distributed by the Facebook team. 

React has a vibrant and growing ecosystem and is used widely in production in a variety of combinations with different frameworks.

To learn more about using React in general and coming up to speed with the library, you should check out the [React documentation](https://reactjs.org/docs/getting-started.html).

To get started with React in Meteor, you can follow along the [React tutorial](https://react-tutorial.meteor.com).

<h3 id="using-with-meteor">Installing and using React</h3>

To install React in Meteor should add it as a npm dependency:

```sh
meteor npm install --save react react-dom
```

This will install `react` into your project and allow you to access it within your files with `import React from 'react'`.

```jsx
import React from 'react';

export const HelloWorld = () => <h1>Hello World</h1>;
```

You can render a component hierarchy to the DOM using the `react-dom` package:

```jsx
import { Meteor } from 'meteor/meteor';
import React from 'react';
import { render } from 'react-dom';
import { HelloWorld } from './HelloWorld.js';

Meteor.startup(() => {
  render(<HelloWorld />, document.getElementById('app'));
});
```

You need to include a `<div id="app"></div>` in your body's HTML somewhere of course.

By default Meteor already uses React when you create a new app using
`meteor create my-app` then this basic set up will be already ready for you.

<h3 id="using-third-party-npm-packages">Using 3rd party packages</h3>

Meteor does not require any different configuration as Meteor is 100% compatible with NPM, so you can use any React component library.

<h2 id="data">Using Meteor's data system</h2>

React is a front-end rendering library and as such doesn't concern itself with how data gets into and out of components. 

On the other hand, Meteor offers in the core packages [publications](data-loading.html) and [methods](methods.html), used to subscribe to and modify the data in your application.

To integrate the two systems, we've developed a [`react-meteor-data`](https://atmospherejs.com/meteor/react-meteor-data) package which allows React components to respond to data changes via Meteor's [Tracker](https://www.meteor.com/tracker) reactivity system.

<h3 id="using-withTracker">Using `useTracker`</h3>

> The `useTracker` function follows latest best practices of React. Choosing hooks instead of HOCs.

To use data from a Meteor collection inside a React component, install [`react-meteor-data`](https://atmospherejs.com/meteor/react-meteor-data):

```sh
meteor add react-meteor-data
```

Once installed, you'll be able to import the `useTracker` function and others.

You can learn more about them [here](https://github.com/meteor/react-packages/tree/master/packages/react-meteor-data#usetrackerreactivefn-deps-hook)

<h2 id="routing">Routing</h2>

Although there are many solutions for routing with Meteor and React, [react-router](https://reactrouter.com/) is the most popular package right now.

As always Meteor does not require anything different when using React Router so you can follow their [quick-start guide](https://reactrouter.com/web/guides/quick-start) to set up React Router in your Meteor project.

<h2 id="meteor-and-react">Meteor Packages and Blaze</h2>

<h3 id="atmosphere-packages">Using React in Atmosphere Packages</h3>

If you are writing an Atmosphere package and want to depend on React or an npm package that itself depends on React, you can't use `Npm.depends()` and `Npm.require()`, as this will result in *2* copies of React being installed into the application (and besides `Npm.require()` only works on the server).

Instead, you need to ask your users to install the correct npm packages in the application itself. This will ensure that only one copy of React is shipped to the client and there are no version conflicts.

In order to check that a user has installed the correct versions of npm packages, you can use the [`tmeasday:check-npm-versions`](https://atmospherejs.com/tmeasday/check-npm-versions) package to check dependency versions at runtime.

<span id="using-with-blaze"><!-- don't break old links --></span>
<h3 id="react-in-blaze">React Components in Blaze</h3>

If you are not using Blaze with React you can skip this.

If you'd like to use React within a larger app built with [Blaze](#blaze.html) (which is a good strategy if you'd like to incrementally migrate an app from Blaze to React), you can use the [`react-template-helper`](https://atmospherejs.com/meteor/react-template-helper) component which renders a react component inside a Blaze template. First run `meteor add react-template-helper`, then use the `React` helper in your template:

```html
<template name="userDisplay">
  <div>Hello, {{username}}</div>
  <div>{{> React component=UserAvatar userId=_id}}</div>
</template>
```

You will need to pass in the component class with a helper:

```js
import { Template } from 'meteor/templating';

import './userDisplay.html';
import UserAvatar from './UserAvatar.js';

Template.userDisplay.helpers({
  UserAvatar() {
    return UserAvatar;
  }
})
```

The `component` argument is the React component to include, which should be passed in with a helper.

Every other argument is passed as a prop to the component when it is rendered.

Note that there a few caveats:

- React components must be the only thing in the wrapper element. Due to a limitation of React (see facebook/react [#1970](https://github.com/facebook/react/issues/1970), [#2484](https://github.com/facebook/react/issues/2484)), a React component must be rendered as the only child of its parent node, meaning it cannot have any siblings.

- This means a React component also can't be the only thing in a Blaze template, because it's impossible to tell where the template will be used.

<h4 id="passing-callbacks-from-blaze">Passing callbacks to a React component</h4>

To pass a callback to a React component that you are including with this helper, make a [template helper that returns a function](http://blazejs.org/guide/reusable-components.html#Pass-callbacks), and pass it in as a prop, like so:

```js
Template.userDisplay.helpers({
  onClick() {
    const instance = Template.instance();

    // Return a function from this helper, where the template instance is in
    // a closure
    return () => {
      instance.hasBeenClicked.set(true)
    }
  }
});
```

To use it in Blaze:

```html
<template name="userDisplay">
  <div>
    {{> React component=UserAvatar userId=_id onClick=onClick}}
  </div>
</template>
```

<h3 id="blaze-in-react">Blaze Templates in React</h3>

We can also use Blaze templates in React components.  This is similarly useful for a gradual transition strategy; but more importantly, it allows us to continue to use the multitude of Atmosphere packages built for Blaze in our React projects, as well as core packages like `accounts-ui`.

One way to do this is with the [`gadicc:blaze-react-component`](https://atmospherejs.com/gadicc/blaze-react-component) package.  First run `meteor add gadicc:blaze-react-component`, then import and use it in your components as follows:

```jsx
import React from 'react';
import Blaze from 'meteor/gadicc:blaze-react-component';

const App = () => (
  <div>
    <Blaze template="itemsList" items={items} />
  </div>
);
```

The `<Blaze template="itemsList" items={items} />` line is the same as if you had written `{% raw %}{{> itemsList items=items}}{% endraw %}` inside of a Blaze template.  For other options and further information, see the package's [project page](https://github.com/gadicc/meteor-blaze-react-component).
