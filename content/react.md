---
title: React
order: 23
description: How to use React, Facebook's frontend rendering library, with Meteor.
discourseTopicId: 20192
---

After reading this guide, you'll know:

1. What React is, and why you would consider using it with Meteor.
2. How to install React in your Meteor application, and how to use it correctly.
3. How to integrate React with Meteor's realtime data layer.
4. How to route in a React/Meteor application.

<h2 id="introduction">Introduction</h2>

[React](https://facebook.github.io/react/) is a JavaScript library for building reactive user interfaces developed and distributed by the Facebook team. React is one of the three rendering libraries supported by Meteor; the alternatives are [Blaze](blaze.html) and [Angular](angular.html). [Here's a comparison](ui-ux.html#view-layers) of all three.

React has a vibrant and growing ecosystem and is used widely in production in a variety of combinations with different frameworks.

To learn more about using React in general and coming up to speed with the library, you should check out the [React documentation](https://facebook.github.io/react/docs/getting-started.html), especially the [thinking in React](https://facebook.github.io/react/docs/thinking-in-react.html) post, which explains the React philosophy well.

To get started with React in Meteor, you can follow along the [React tutorial](https://www.meteor.com/tutorials/react/creating-an-app). To see an example of a more complete Meteor application built with React, check out the [`react` branch](https://github.com/meteor/todos/tree/react) of the Todos example application. Where applicable, code examples in this article will reference that app.

<h3 id="using-with-meteor">Installing and using React</h3>

To install React in Meteor 1.3 you should simply add it as an npm dependency:

```sh
npm install --save react react-dom
```

This will install `react` into your project and allow you to access it within your files with `import React from 'react'`. Most React code is written in [JSX](https://facebook.github.io/react/docs/jsx-in-depth.html), which you can use by [default in Meteor](http://guide.meteor.com/build-tool.html#react-jsx) if you include the `ecmascript` package (which is installed in all Meteor apps by default).

```jsx
import React from 'react';

export default class HelloWorld extends React.Component {
  render() {
    return (
      <h1>Hello World</h1>
    );
  }
}
```

You can render a component heirarchy to the DOM using the `react-dom` package:

```jsx
import { Meteor } from 'meteor/meteor';
import React from 'react';
import { render } from 'react-dom';
import HelloWorld from './HelloWorld.js';

Meteor.startup(() => {
  render(<HelloWorld />, document.getElementById('app'));
});
```

You need to include a `<div id="app"></div>` in your body's HTML somewhere of course.

Every new Meteor app includes Blaze, Meteor's default templating system, by default. If you are not planning on [using React and Blaze together](#using-with-blaze), you can remove Blaze from your project by running:

```sh
meteor remove blaze-html-templates
meteor add static-html
```

<h3 id="using-third-party-npm-packages">Using 3rd party packages</h3>

If you'd like to use a third party React component that has been published on npm, you can `npm install --save` them and `import` from within your app.

For example, to use the excellent [Griddle](http://griddlegriddle.github.io/Griddle/) React package for making tables, you could run

```sh
npm install --save griddle-react
```

Then, like with any other [npm package](using-packages.html#npm), you can import the component in your application:

```jsx
import React from 'react';
import Griddle from 'griddle-react';

export default class MyGriddler extends React.Component {
  render() {
    return (<Griddle ..../>);
  }
}
```

If you are looking to write an Atmosphere package that wraps such a component, you need to take some [further steps](#atmosphere-packages).

<span id="using-with-blaze"><!-- don't break old links --></span>
<h3 id="react-in-blaze">React Components in Blaze</h3>

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

To pass a callback to a React component that you are including with this helper, simply make a [template helper that returns a function](http://guide.meteor.com/blaze.html#pass-callbacks), and pass it in as a prop, like so:

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

Just like we can use React components in Blaze templates, we can also use Blaze templates in React components.  This is similarly useful for a gradual transition strategy; but more importantly, it allows us to continue to use the multitude of Atmosphere packages built for Blaze in our React projects, as well as core packages like `accounts-ui`.

One easy way to do this is with the [`gadicc:blaze-react-component`](https://atmospherejs.com/gadicc/blaze-react-component) package.  First run `meteor add gadicc:blaze-react-component`, then import and use it in your components as follows:

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

<h2 id="data">Using Meteor's data system</h2>

React is a front-end rendering library and as such doesn't concern itself with how data gets into and out of components. On the other hand, Meteor has strong opinions about data! Meteor operates in terms of [publications](data-loading.html) and [methods](methods.html), used to subscribe to and modify the data in your application.

To integrate the two systems, we've developed a [`react-meteor-data`](https://atmospherejs.com/meteor/react-meteor-data) package which allows React components to respond to data changes via Meteor's [Tracker](https://www.meteor.com/tracker) reactivity system.

<h3 id="using-createContainer">Using `createContainer`</h3>

Once you've run `meteor add react-meteor-data`, you'll be able to import the `createContainer` function, which allows you to create a [container component](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0#.by86emv9b) which provides data to your presentational components.

> Note that "container components" are analogous to the "smart components" and "presentational components" to the "reusable components" in the pattern we document in the [UI/UX article](http://guide.meteor.com/ui-ux.html#components), if you'd like to read more about how this philosophy relates to Meteor.

For example, in the Todos example app, we have a `ListPage` component, which renders list metadata and the tasks in the list. In order to do so, it needs to [subscribe](data-loading.html#subscriptions) to the `todos.inList` publication, check that subscription's readiness, then fetch the list of todos from the `Todos` collection.

It also needs to be responsive to reactive changes in the state of those actions (for instance if a todo changes due to the action of another user). All this data loading complexity is a typical use-case for a container-presentational component split, and the `createContainer()` function makes it simple to do this.

We simply define the `ListPage` component as a presentational component that expects its data to be passed in using React `props`:

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

Then we create a `ListPageContainer` container component which wraps it and provides a data source:

```js
import { Meteor } from 'meteor/meteor';
import { Lists } from '../../api/lists/lists.js';
import { createContainer } from 'meteor/react-meteor-data';
import ListPage from '../pages/ListPage.js';

export default ListPageContainer = createContainer(({ params }) => {
  const { id } = params;
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

It's a good habit to name your container exactly like the component that it wraps, with the word “Container” tacked onto the end. This way, when you're attempting to track down issues in your code, it makes it much easier to locate the appropriate files/classes.

The container component created by `createContainer()` will reactively rerender the wrapped component in response to any changes to [reactive data sources](https://atmospherejs.com/meteor/tracker) accessed from inside the function provided to it.

Although this `ListPageContainer` container is intended to be instantiated by the React Router (which passes in the props automatically), if we did ever want to create one manually, we would need to pass in the props to the container component (which then get passed into our data function above):

```jsx
<ListPageContainer params={{id: '7'}}/>
```

<h3 id="preventing-rerenders">Preventing re-renders</h3>

Sometimes changes in your data can trigger re-computations which you know won't affect your UI. Although React is in general quite efficient in the face of unnecessary re-renders, if you need to control re-rendering, the above pattern allows you to easily use React's [`shouldComponentUpdate`](https://facebook.github.io/react/docs/component-specs.html#updating-shouldcomponentupdate) on the presentational component to avoid re-renders.

<h2 id="routing">Routing</h2>

There are two main options for routing with Meteor and React. Either way, we recommend consulting our [Routing article](routing.html) for some general principles of routing in Meteor before writing your app.

- [`kadira:flow-router`](https://atmospherejs.com/kadira/flow-router) is a Meteor specific router that can be used both with React and Blaze. It is documented in detail in the [Routing article](routing.html).

- [`react-router`](https://www.npmjs.com/package/react-router) is a React-specific router very popular in the React community. It can also be used easily with Meteor.

<h3 id="using-flow-router">Flow Router</h3>

Using Flow Router with React is very similar to using it with Blaze. The only difference is that in your route actions, you should use the [`react-mounter`](https://www.npmjs.com/package/react-mounter) package to mount components with a layout. Once you `npm install --save react-mounter`, you can do the following:

```js
import React from 'react';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { mount } from 'react-mounter';

import AppContainer from '../../ui/containers/AppContainer.js';
import ListPageContainer from '../../ui/containers/ListPageContainer.js';


FlowRouter.route('/lists/:_id', {
  name: 'Lists.show',
  action() {
    mount(AppContainer, {
      main: <ListPageContainer/>,
    });
  },
});
```

Note that `react-mounter` automatically mounts the layout component on a `#react-root` node, which you can change by using the `withOptions()` function.

In the below example, your `App` component would receive a `main` prop with a instantiated React Element to render:

```js
const App = (props) => (
  <div>
    <section id="menu"><..></section>
    {props.main}
  </div>
);

export default AppContainer = createContainer(props => {
  // props here will have `main`, passed from the router
  // anything we return from this function will be *added* to it
  return {
    user: Meteor.user(),
  };
}, App);
```

<h3 id="using-react-router">React Router</h3>

Using React Router is also straightforward. Once you `npm install --save react-router`, you can simply export a list of nested routes as you would in any other React Router driven React application:

```js
import React from 'react';
import { Router, Route, browserHistory } from 'react-router';

// route components
import AppContainer from '../../ui/containers/AppContainer.js';
import ListPageContainer from '../../ui/containers/ListPageContainer.js';
import AuthPageSignIn from '../../ui/pages/AuthPageSignIn.js';
import AuthPageJoin from '../../ui/pages/AuthPageJoin.js';
import NotFoundPage from '../../ui/pages/NotFoundPage.js';

export const renderRoutes = () => (
  <Router history={browserHistory}>
    <Route path="/" component={AppContainer}>
      <Route path="lists/:id" component={ListPageContainer}/>
      <Route path="signin" component={AuthPageSignIn}/>
      <Route path="join" component={AuthPageJoin}/>
      <Route path="*" component={NotFoundPage}/>
    </Route>
  </Router>
);
```

With React Router, you'll also need to explicity render the exported routes in a startup function:

```js
import { Meteor } from 'meteor/meteor';
import { render } from 'react-dom';
import { renderRoutes } from '../imports/startup/client/routes.js';

Meteor.startup(() => {
  render(renderRoutes(), document.getElementById('app'));
});
```

When using React Router in Meteor, you can follow roughly the [same principles](routing.html) as when using Flow Router, but you should also consider the idioms outlined in React Router's own  [documentation](https://github.com/reactjs/react-router/blob/latest/docs/Introduction.md).

These include some notable differences like:
 - React Router encourages you to couple your URL design and layout hierarchy in the route definition. Flow Router is more flexible, although it can involve much more boilerplate as a result.
 - React Router embraces React-specific functionality like the use of [context](https://facebook.github.io/react/docs/context.html), although you can also explicitly pass your FlowRouter instance around in context if you'd like (in fact this is probably the best thing to do).

<h2 id="meteor-and-react">Meteor and React</h2>

<h3 id="atmosphere-packages">Using React in Atmosphere Packages</h3>

If you are writing an Atmosphere package and want to depend on React or an npm package that itself depends on React, you can't use `Npm.depends()` and `Npm.require()`, as this will result in *2* copies of React being installed into the application (and besides `Npm.require()` only works on the server).

Instead, you need to ask your users to install the correct npm packages in the application itself. This will ensure that only one copy of React is shipped to the client and there are no version conflicts.

In order to check that a user has installed the correct versions of npm packages, you can use the [`tmeasday:check-npm-versions`](https://atmospherejs.com/tmeasday/check-npm-versions) package to check dependency versions at runtime.
