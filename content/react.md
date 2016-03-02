---
title: React
order: 8
description: How to use React, the frontend rendering library with Meteor.
---

After reading this guide, you'll know:

1. What React is, and why you would consider using it with Meteor.
2. How to install React in your Meteor application, and how to use it correctly.
3. How to integrate React with Livedata, Meteor's realtime data layer.
4. How to route in a React/Meteor application.

<h2 id="introduction">Introduction</h2>

[React](https://facebook.github.io/react/) is a JavaScript library for building reactive user interfaces developed and distributed by the Facebook team. React is one of the three rendering libraries supported by Meteor; it is an alterative to [Blaze](blaze.html) and [Angular](angular.html).

React is has a vibrant and growing ecosystem and is used widely in production in a variety of combinations with different frameworks.

To learn more about using React in general and coming up to speed with the library, you should check out the [React documentation](https://facebook.github.io/react/docs/getting-started.html), especially the [thinking in React](https://facebook.github.io/react/docs/thinking-in-react.html) post, which explains the React philosophy well.

To get started with React in Meteor, you can follow along the [React tutorial](https://www.meteor.com/tutorials/react/creating-an-app). To see an example of a more complete Meteor application built with React, check out the [`react` branch](https://github.com/meteor/todos/tree/react) of the Todos exmaple application. Where applicable, code examples in this article will reference that app.

<h3 id="using-with-meteor">Installing and using React</h3>

To install React in Meteor 1.3 you should simply add it as an NPM dependency:

```
npm install --save react react-dom
```

This will install `react` into your project and allow you to access it within your files with `import React from 'react'`. Most React code is written in [JSX](https://facebook.github.io/react/docs/jsx-in-depth.html), which you can use by [default in Meteor](http://guide.meteor.com/build-tool.html#react-jsx) if you include the `ecmascript` package (which is installed in all Meteor apps by default).

```js
import React from 'react';

export default class HelloWorld extends React.Component {
  render() {
    return <h1>Hello World</h1>;
  }
}
```

You can render a component heirarchy to the DOM using the `react-dom` package:

```js
import { Meteor } from 'meteor/meteor';
import { render } from 'react-dom';
import HelloWorld from './HelloWorld.jsx';

Meteor.startup(() => {
  render(HelloWorld, document.getElementById('app'));
});
```

XXX: should we be getting rid of `blaze-html-templates` and replacing with `static-html`? The tutorial doesn't sem to do it..

<h3 id="using-third-party-npm-packages">Using 3rd party packages</h3>

If you'd like to use a third party React component that has been published on NPM (such as the ones you find on the [React Components site](http://react-components.com)), you can simple `npm install --save` them and `import` from within your app.

If you are looking to write a Atmosphere package that wraps such a component, you need to take some [further steps](#atmosphere-packages).

<h3 id="using-with-blaze">Using Blaze with React</h3>

If you'd like to use React within a larger app built with [Blaze](#blaze.html), you can use the [`react-template-helper`](https://atmospherejs.com/meteor/react-template-helper) component which renders a react component inside a Blaze template. First run `meteor add react-template-helper`, then user the `React` helper in your template:

```html
<template name="userDisplay">
  <div>Hello, {{username}}</div>
  <div>{{> React component=UserAvatar userId=_id}}</div>
</template>
```

You will need to pass in the component class with a helper:

```js
import { Template } from 'meteor/templating';

import 'userDisplay.html';
import UserAvatar from './UserAvatar.jsx';

Template.userDisplay.helpers({
  UserAvatar() {
    return UserAvatar;
  }
})
```

The `component` argument is the React component to include, which should be passed in with a helper.

Every other argument is passed as a prop to the component when it is rendered.

Note that there a few caveats:

 - React components must be the only thing in the wrapper element, due to a limitation of React (see facebook/react [#1970](https://github.com/facebook/react/issues/1970), [#2484](https://github.com/facebook/react/issues/2484)), a React component must be rendered as the only child of its parent node, meaning it cannot have any siblings.

 - This means a component also can't be the only thing in a template, because it's impossible to tell where the template will be used.

<h4 id="passing-callbacks-from-blaze">Passing callbacks to a React component</h4>

To pass a callback to a React component that you are including with this helper, simply make a [template helper that returns a function](http://guide.meteor.com/blaze.html#pass-callbacks), and pass it in as a prop, like so:

```js
Template.userDisplay.helpers({
  onClick() {
    var self = Template.instance();

    // Return a function from this helper, where the template instance is in
    // a closure
    return function () {
      self.hasBeenClicked.set(true)
    }
  }
});
```

To use it in Blaze:

```js
<template name="userDisplay">
  <div>{{> React component=UserAvatar userId=_id onClick=onClick}}</div>
</template>
```

<h2 id="livedata">Using data</h2>

React is a front-end rendering library and as such doesn't concern itself with how data gets into and out of the component heirarchy. Meteor has strong opinions about data of course! Meteor's Livedata system defines a system [publications](data-loading.html) and [methods](methods.html) to subscribe to and modify the data in your application. 

To combine the two systems, we've developed a [`react-meteor-data`](https://atmospherejs.com/meteor/react-meteor-data) package which allows React components to respond to data changes via Meteor's [Tracker](https://www.meteor.com/tracker) reactivity system.

<h3 id="using-createContainer">Using `createContainer`</h3>

Once you've run `meteor add react-meteor-data`, you'll be able to import the `createContainer` function, which allows you to create a [container component](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0#.by86emv9b) which provides data to your presentational components.

(Note that "container components" are analogous to the "smart components" and "presentational components" to the "reusable components" in the pattern we document in the [UI/UX article](http://guide.meteor.com/ui-ux.html#components), if you'd like to read more about how this philosophy marries with Meteor).

For example, in the Todos example app, we have a `ListPage` component, which renders the metadata about a list alongside the todos that are within it. In order to do so, it needs to [subscribe](data-loading.html#subscriptions) to the `todos.inList` publication, check that subscription's readiness, then fetch the list of todos from the `Todos` collection.

It also needs to be responsive to reactive changes in the state of those actions (for instance if a todo changes due to the action of another user). All this data loading complexity is a typical use-case for a container-presentational component split, and the `createContainer()` function makes it simple to do this.

We simply define the `ListPage` component to be a presentational component that expects it's data to be passed in as a property:

```jsx
import React from 'react';

export default class ListPage extends React.Component {
  ...
}

ListPage.propTypes = {
  list: React.PropTypes.object,
  todos: React.PropTypes.array,
  loading: React.PropTypes.bool,
  listExists: React.PropTypes.bool,
};
```

Then we create a `ListContainer` component which wraps it and provides a data source:

```jsx
import { Meteor } from 'meteor/meteor';
import { Lists } from '../../api/lists/lists.js';
import createContainer from 'meteor/react-meteor-data';
import ListPage from '../pages/ListPage.jsx';

export default createContainer(({ params: { id } }) => {
  const todosHandle = Meteor.subscribe('todos.inList', id);
  const loading = !todosHandle.ready();
  const list = Lists.findOne(id);
  const listExists = !loading && !!list;
  return {
    loading,
    list,
    listExists,
    todos: listExists ? list.todos().fetch() : [],
  };
}, ListPage);
```

Note that the `MeteorDataContainer` container created by `createContainer()` will be fully reactive to any changes to [reactive data sources](https://atmospherejs.com/meteor/tracker) call from inside the function provided to it.

<h3 id="preventing-rerenders">Preventing re-renders</h3>

Sometimes the Tracker system can lead to unnecessary re-computations, which when combined with `react-meteor-data` leads to unnecessary re-renders. Although React is in general quite efficient in such cases, if you need to control re-rendering, the above pattern allows you to easily use React's [`shouldComponentUpdate`](https://facebook.github.io/react/docs/component-specs.html#updating-shouldcomponentupdate) on the presentational component wrapped and avoid re-renders.

<h2 id="routing">Routing</h2>

To route in React there are two main choices: 

  - [`kadira:flow-router`](https://atmospherejs.com/kadira/flow-router) is a Meteor specific Router that can be used to render to React and that we document in the [Routing article](routing.html).

  - [`react-router`](https://www.npmjs.com/package/react-router) is a pure-React Router that is very popular and which can also be used easily with Meteor.

<h3 id="using-flow-router">Flow Router</h3>

Using Flow Router with React is almost exactly analogous to using it with Blaze. The only difference is that in your route actions, you should use the [`react-mounter`](https://www.npmjs.com/package/react-mounter) package to mount components into your layout. Once you `npm install --save react-mounter`, you can:

```jsx
import { FlowRouter } from 'meteor/kadira:flow-router';
import { mount } from 'react-mounter';

import AppContainer from '../../ui/containers/AppContainer.jsx';
import ListContainer from '../../ui/containers/ListContainer.jsx';


FlowRouter.route('/lists/:_id', {
  name: 'Lists.show',
  action() {
    mount(AppCountainer, {
      main: () => <ListContainer/>,
    });
  },
});
```

Note that `react-mounter` automatically mounts the layout component on a `#react-root` node, which you can change by using the `withOptions()` function.

<h3 id="using-react-router">React Router</h3>

Using React Router is also straightforward. Once you `npm install --save react-router`, you can simply export a list of nested routes as you would in any other React Router driven React application:

```jsx
import React from 'react';
import { Router, Route, browserHistory } from 'react-router';

// route components
import AppContainer from '../../ui/containers/AppContainer.jsx';
import ListContainer from '../../ui/containers/ListContainer.jsx';
import AuthPageSignIn from '../../ui/pages/AuthPageSignIn.jsx';
import AuthPageJoin from '../../ui/pages/AuthPageJoin.jsx';
import NotFoundPage from '../../ui/pages/NotFoundPage.jsx';

export const renderRoutes = () => (
  <Router history={browserHistory}>
    <Route path="/" component={AppContainer}>
      <Route path="lists/:id" component={ListContainer}/>
      <Route path="signin" component={AuthPageSignIn}/>
      <Route path="join" component={AuthPageJoin}/>
      <Route path="*" component={NotFoundPage}/>
    </Route>
  </Router>
);
```

With React Router, you'll need to render the exported routes in a startup function:

```jsx
import { Meteor } from 'meteor/meteor';
import { render } from 'react-dom';
import { renderRoutes } from '../imports/startup/client/routes.jsx';

Meteor.startup(() => {
  render(renderRoutes(), document.getElementById('app'));
});
```

In general routing with React Router in Meteor follows generally the [same principles](routing.html) as using Flow Router, however you'll need to follow some of the idioms outlined in the [documentation](https://github.com/reactjs/react-router/blob/latest/docs/Introduction.md).

<h2 id="meteor-and-react">Meteor and React</h2>

<h3 id="atmosphere-packages">Using React in Atmosphere Packages</h3>

If you are writing an Atmosphere package and want to depend on React or an NPM package that itself depends on React, you can't use `Npm.depends()` and `Npm.require()`, as this will result in *2* copies of React being installed into the application (and besides `Npm.require()` only works on the server).

Instead, you need to ensure that users of your package have installed the correct packages at the application level. This will ensure a *single* copy of React is shipped to the client and all versions line up. 

In order to check that a user has installed the correct versions of NPM packages, you can use the [`tmeasday:check-npm-versions`](https://atmospherejs.com/tmeasday/check-npm-versions`) to check versions.

XXX: not putting in code samples here as they may change and I don't want to have to remember to do it in two places.

