---
title: "URLs and Routing"
order: 4
description: How to drive your Meteor app's UI using URLs with FlowRouter.
---

After reading this guide, you'll know:

1. The role URLs play in a client-rendered app, and how it's different from a traditional server-rendered app.
2. How to define client and server routes for your app using Flow Router.
3. How to have your app display different content depending on the URL.
4. How to construct links to routes and go to routes programmatically.

<h2 id="client-side">Client-side Routing</h2>

In a web application, _routing_ is the process of using URLs to drive the user interface (UI). URLs are a prominent feature in every single web browser, and have several main functions from the user's point of view:

1. **Bookmarking** - Users can bookmark URLs in their web browser to save content they want to come back to later.
2. **Sharing** - Users can share content with others by sending a link to a certain page.
3. **Navigation** - URLs are used to drive the web browser's back/forward functions.

In a traditional web application stack, where the server renders HTML one page at a time, the URL is the fundamental entry point for the user to access the application. Users navigate an application by clicking through URLs, which are sent to the server via HTTP, and the server responds appropriately via a server-side router.

In contrast, Meteor operates on the principle of _data on the wire_, where the server doesn’t think in terms of URLs or HTML pages. The client application communicates with the server over DDP. Typically as an application loads, it initializes a series of _subscriptions_ which fetch the data required to render the application. As the user interacts with the application, different subscriptions may load, but there’s no technical need for URLs to be involved in this process - you could easily have a Meteor app where the URL never changes.

However, most of the user-facing features of URLs listed above are still relevant for typical Meteor applications. Since the server is not URL-driven, the URL just becomes a useful representation of the client-side state the user is currently looking at. However, unlike in a server-rendered application, it does not need to describe the entirety of the user’s current state; it simply needs to contain the parts that you want to be linkable. For example, the URL should contain any search filters applied on a page, but not necessarily the state of a dropdown menu or popup.

<h2 id="flow-router">Using Flow Router</h2>

To add routing to your app, install the [`kadira:flow-router`](https://atmospherejs.com/kadira/flow-router) package:

```
meteor add kadira:flow-router
```

Flow Router is a community routing package for Meteor. At the time of writing this guide, it is at version 2.x. For detailed information about all of the features Flow Router has to offer, refer to the [Kadira Meteor routing guide](https://kadira.io/academy/meteor-routing-guide).

<h2 id="defining-routes">Defining a simple route</h2>

The basic purpose of a router is to match certain URLs and perform actions as a result. This all happens on the client side, in the app user's browser or mobile app container. Let's take an example from the Todos example app:

```js
FlowRouter.route('/lists/:_id', {
  name: 'Lists.show',
  action(params, queryParams) {
    console.log("Looking at a list?");
  }
});
```

This route handler will run in two situations: if the page loads initially at a URL that matches the URL pattern, or if the URL changes to one that matches the pattern while the page is open. Note that, unlike in a server-side-rendered app, the URL can change without any additional requests to the server.

When the route is matched, the `action` method executes, and you can perform any actions you need to. The `name` property of the route is optional, but will let us refer to this route more conveniently later on.

<h3 id="url-pattern-matching">URL pattern matching</h3>

Consider the following URL pattern, used in the code snippet above:

```js
'/lists/:_id'
```

The above pattern will match certain URLs. You may notice that one segment of the URL is prefixed by `:` - this means that it is a *url parameter*, and will match any string that is present in that segment of the path. Flow Router will make that part of the URL available on the `params` property of the current route.

Additionally, the URL could contain an HTTP [*query string*](https://en.wikipedia.org/wiki/Query_string) (the part after an optional `?`). If so, Flow Router will also split it up into named parameters, which it calls `queryParams`.


Here are some example URLs and the resulting `params` and `queryParams`:

| URL           | matches pattern? | params          | queryParams
| ---- | ---- | ---- | ---- |
| /             | no | | |
| /about        | no | | |
| /lists/        | no | | |
| /lists/eMtGij5AFESbTKfkT | yes | { _id: "eMtGij5AFESbTKfkT"} |  { }
| /lists/1 | yes | { _id: "1"} | { }
| /lists/1?todoSort=top | yes | { _id: "1"} | { todoSort: "top" }


Note that all of the values in `params` and `queryParams` are always strings since URLs don't have any way of encoding data types. For example, if you wanted a parameter to represent a number, you might need to use `parseInt(value, 10)` to convert it when you access it.

<h2 id="accessing-route-info">Accessing Route information</h2>

In addition to passing in the parameters as arguments to the `action` function on the route, Flow Router makes a variety of information available via (reactive and otherwise) functions on the global singleton `FlowRouter`. As the user navigates around your app, the values of these functions will change (reactively in some cases) correspondingly.

Like any other global singleton in your application (see the [data loading](data-loading.html#stores) for info about stores), it's best to limit your access to `FlowRouter`. That way the parts of your app will remain modular and more independent. In the case of `FlowRouter`, it's best to access it solely from the top of your component hierarchy, either in the "page" component, or the layouts that wrap it. Read more about accessing data in the [UI article](ui-ux.html#components).

<h3 id="current-route">The current route</h3>

It's useful to access information about the current route in your code. Here are some reactive functions you can call:

* `FlowRouter.getRouteName()` gets the name of the route
* `FlowRouter.getParam(paramName)` returns the value of a single URL parameter
* `FlowRouter.getQueryParam(paramName)` returns the value of a single URL query parameter

In our example of the list page from the Todos app, we access the current list's id with `FlowRouter.getParam('_id')` (we'll see more on this below).

<h3 id="active-route">Highlighting the active route</h3>

One situation where it is sensible to access the global `FlowRouter` singleton to access the current route's information deeper in the component hierarchy is when rendering links via a navigation component. It's often required to highlight the "active" route in some way (this is the route or section of the site that the user is currently looking at).

A convenient package for this is [`zimme:active-route`](https://atmospherejs.com/zimme/active-route):

```bash
meteor add zimme:active-route
```

In the Todos example app, we link to each list the user knows about in the `App_body` template:

```html
{{#each list in lists}}
  <a class="list-todo {{activeListClass list}}">
    ...

    {{list.name}}
  </a>
{{/each}}
```

We can determine if the user is currently viewing the list with the `activeListClass` helper:

```js
Template.App_body.helpers({
  activeListClass(list) {
    const active = ActiveRoute.name('Lists.show')
      && FlowRouter.getParam('_id') === list._id;

    return active && 'active';
  }
});
```

<h2 id="rendering-routes">Rendering based on the route</h2>

Now we understand how to define routes and access information about the current route, we are in a position to do what you usually want to do when a user accesses a route---render a user interface to the screen that represents it.

*In this section, we'll discuss how to render routes using Blaze as the UI engine. If you are building your app with React or Angular, you will end up with similar concepts but the code will be a bit different.*

When using Flow Router, the simplest way to display different views on the page for different URLs is to use the complementary Blaze Layout package. First, make sure you have the Blaze Layout package installed:

```bash
meteor add kadira:blaze-layout
```

To use this package, we need to define a "layout" component. In the Todos example app, that component is called `App_body`:

```html
<template name="App_body">
  ...
  {{> Template.dynamic template=main}}
  ...
</template>
```

(This is not the entire `App_body` component, but we highlight the most important part here).
Here, we are using a Blaze feature called `Template.dynamic` to render a template which is attached to the `main` property of the data context. Using Blaze Layout, we can change that `main` property when a route is accessed.

We do that in the `action` function of our `Lists.show` route definition:

```js
FlowRouter.route('/lists/:_id', {
  name: 'Lists.show',
  action() {
    BlazeLayout.render('App_body', {main: 'Lists_show_page'});
  }
});
```

What this means is that whenever a user visits a URL of the form `/lists/X`, the `Lists.show` route will kick in, triggering the `BlazeLayout` call to set the `main` property of the `App_body` component.

<h2 id="page-templates">Components as pages</h2>

Notice that we called the component to be rendered `Lists_show_page` (rather than `Lists_show`). This indicates that this template is rendered directly by a Flow Router action and forms the 'top' of the rendering hierarchy for this URL.

The `Lists_show_page` template renders *without* arguments---it is this template's responsibility to collect information from the current route, and then pass this information down into its child templates. Correspondingly the `Lists_show_page` template is very tied to the route that rendered it, and so it needs to be a smart component. See the article on [UI/UX](ui-ux.html) for more about smart and reusable components.

It makes sense for a "page" smart component like `Lists_show_page` to:

1. Collect route information,
2. Subscribe to relevant subscriptions,
3. Fetch the data from those subscriptions, and
4. Pass that data into a sub-component.

In this case, the HTML template for `Lists_show_page` will look very simple, with most of the logic in the JavaScript code:

```html
<template name="Lists_show_page">
  {{#each listId in listIdArray}}
    {{> Lists_show (listArgs listId)}}
  {{else}}
    {{> App_notFound}}
  {{/each}}
</template>
```

(The `{% raw %}{{#each listId in listIdArray}}{% endraw %}}` is an animation technique for [page to page transitions](ui-ux.html#animating-page-changes)).

```js
Template.Lists_show_page.helpers({
  // We use #each on an array of one item so that the "list" template is
  // removed and a new copy is added when changing lists, which is
  // important for animation purposes.
  listIdArray() {
    const instance = Template.instance();
    const listId = instance.getListId();
    return Lists.findOne(listId) ? [listId] : [];
  },
  listArgs(listId) {
    const instance = Template.instance();
    return {
      todosReady: instance.subscriptionsReady(),
      // We pass `list` (which contains the full list, with all fields, as a function
      // because we want to control reactivity. When you check a todo item, the
      // `list.incompleteCount` changes. If we didn't do this the entire list would
      // re-render whenever you checked an item. By isolating the reactiviy on the list
      // to the area that cares about it, we stop it from happening.
      list() {
        return Lists.findOne(listId);
      },
      // By finding the list with only the `_id` field set, we don't create a dependency on the
      // `list.incompleteCount`, and avoid re-rendering the todos when it changes
      todos: Lists.findOne(listId, {fields: {_id: true}}).todos()
    };
  }
});
```

It's the `listShow` component (a reusuable component) that actually handles the job of rendering the content of the page. As the page component is passing the arguments into the reusuable component, it is able to be quite mechanical and the concerns of talking to the router and rendering the page have been separated.

<h3 id="route-rendering-logic">Route related rendering logic</h3>

There are types of rendering logic that appear related to the route but which also seem related to user interface rendering. A classic example is authorization; for instance, you may want to render a login form for some subset of your pages if the user is not yet logged in.

It's best to keep all logic around what to render in the component hierarchy (i.e. the tree of rendered components). So this authorization should happen inside a component. Suppose we wanted to add this to the `Lists_show_page` we were looking at above. We could do something like:

```html
<template name="Lists_show_page">
  {{#if currentUser}}
    {{#each listId in listIdArray}}
      {{> Lists_show (listArgs listId)}}
    {{else}}
      {{> App_notFound}}
    {{/each}}
  {{else}}
    Please log in to edit posts.
  {{/if}}
</template>
```

Of course, we might find that we need to share this functionality between multiple pages of our app that require access control. We can easily share functionality between templates by wrapping them in a wrapper "layout" component which includes the behavior we want.

You can create wrapper components by using the "template as block helper" ability of Blaze (see the [Blaze Article](blaze.html#block-helpers)). Here's how we could write an authorization template:

```html
<template name="App_forceLoggedIn">
  {{#if currentUser}}
    {{> Template.contentBlock}}
  {{else}}
    Please log in see this page.
  {{/if}}
</template>
```

Once that template exists, we can simply wrap our `Lists_show_page`:

```html
<template name="Lists_show_page">
  {{#App_forceLoggedIn}}
    {{#each listId in listIdArray}}
      {{> Lists_show (listArgs listId)}}
    {{else}}
      {{> App_notFound}}
    {{/each}}
  {{/App_forceLoggedIn}}
</template>
```

The main advantage of this approach is that it is immediately clear when viewing the `Lists_show_page` what behavior will occur when a user visits the page.

Multiple behaviors of this type can be composed by wrapping a template in multiple wrappers, or creating a meta-wrapper that combines multiple wrapper templates.

<h2 id="changing-routes">Changing Routes</h2>

Rendering an updated UI when a user reaches a new route is not that useful without giving the user some way to reach a new route! The simplest way is with the trusty `<a>` tag and a URL. You can generate the URLs yourself using `FlowRouter.pathFor`, but it is more convenient to use the [`arillo:flow-router-helpers`](https://github.com/arillo/meteor-flow-router-helpers/) package that defines some helpers for you:


```
meteor add arillo:flow-router-helpers
```

Now that you have this package, you can use helpers in your templates to display a link to a certain route. For example, in the Todos example app, our nav links look like:


```html
<a href="{{pathFor 'Lists.show' _id=list._id}}" title="{{list.name}}"
    class="list-todo {{activeListClass list}}">
```

<h3 id="routing-programmatically">Routing programmatically</h3>

In some cases you want to change routes based on user action outside of them clicking on a link. For instance, in the example app, when a user creates a new list, we want to route them to the list they just created. We do this by calling `FlowRouter.go()` once we know the id of the new list:

```js
Template.App_body.events({
  'click .js-new-list'() {
    const listId = Lists.methods.insert.call();
    FlowRouter.go('Lists.show', { _id: listId });
  }
});
```

You can also change only part of the URL if you want to, using the `FlowRouter.setParams()` and `FlowRouter.setQueryParams()`. For instance, if we were viewing one list and wanted to go to another, we could write:

```js
FlowRouter.setParams({_id: newList._id});
```

Of course, calling `FlowRouter.go()`, will always work, so unless you are trying to optimize for a specific situation it's better to use that.

<h3 id="storing-data-in-the-url">Storing data in the URL</h3>

As we discussed in the introduction, the URL is really just a serialization of some part of the client-side state the user is looking at. Although parameters can only be strings, it's possible to convert any type of data to a string by serializing it.

In general if you want to store arbitrary serializable data in a URL param, you can use [`EJSON.stringify()`](http://docs.meteor.com/#/full/ejson_stringify) to turn it into a string. You'll need to URL-encode the string using [`encodeURIComponent`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent) to remove any characters that have meaning in a URL:

```js
FlowRouter.setQueryParams({data: encodeURIComponent(EJSON.stringify(data))});
```

You can then get the data back out of Flow Router using [`EJSON.parse()`](http://docs.meteor.com/#/full/ejson_parse). Note that Flow Router does the URL decoding for you automatically:

```js
const data = EJSON.parse(FlowRouter.getQueryParam('data'));
```

<h2 id="redirecting">Redirecting</h2>

Sometimes, your users will end up on a page that isn't a good place for them to be. Maybe the data they were looking for has moved, maybe they were on an admin panel page and logged out, or maybe they just created a new object and you want them to end up on the page for the thing they just created.

Usually, we can redirect in response to a user's action by calling `FlowRouter.go()` and friends, like in our list creation example above, but if a user browses directly to a URL that doesn't exist, it's useful to know how to redirect immediately.

If a URL is simply out-of-date (sometimes you might change the URL scheme of an application), you can redirect inside the `action` function of the route:

```js
FlowRouter.route('/old-list-route/:_id', {
  action(params) {
    FlowRouter.go('Lists.show', params);
  }
});
```

<h3 id="redirecting-dynamically">Redirecting dynamically</h3>

The above approach will only work for static redirects. However, sometimes you need to load some data to figure out where to redirect to. In this case you'll need to render part of the component hierarchy to subscribe to the data you need. For example, in the Todos example app, we want to make the root (`/`) route redirect to the first known list. To achieve this, we need to render a special `App_rootRedirector` route:

```js
FlowRouter.route('/', {
  name: 'App.home',
  action() {
    BlazeLayout.render('App_body', {main: 'App_rootRedirector'});
  }
});
```

The `App_rootRedirector` component is rendered inside the `App_body` layout, which takes care of subscribing to the set of lists the user knows about *before* rendering its sub-component, and we are guaranteed there is at least one such list. This means that if the `App_rootRedirector` ends up being created, there'll be a list loaded, so we can simply do:

```js
Template.App_rootRedirector.onCreated(() => {
  // We need to set a timeout here so that we don't redirect from inside a redirection
  //   which is a limitation of the current version of FR.
  Meteor.setTimeout(() => {
    FlowRouter.go('Lists.show', Lists.findOne());
  });
});
```

If you need to wait on specific data that you aren't already subscribed to at creation time, you can use an `autorun` and `subscriptionsReady()` to wait on that subscription:

```js
Template.App_rootRedirector.onCreated(() => {
  // If we needed to open this subscription here
  this.subscribe('Lists.public');

  // Now we need to wait for the above subscription. We'll need the template to
  // render some kind of loading state while we wait, too.
  this.autorun(() => {
    if (this.subscriptionsReady()) {
      FlowRouter.go('Lists.show', Lists.findOne());
    }
  });
});
```

<h3 id="redirecting-after-user-action">Redirecting after a user's action</h3>

Often, you just want to go to a new route programmatically when a user has completed a certain action. Above we saw a case (creating a new list) when we wanted to do it *optimistically*---i.e. before we hear back from the server that the Method succeeded. We can do this because we reasonably expect that the Method will succeed in almost all cases (see the [UI/UX article](ui-ux.html#optimistic-ui) for further discussion of this).

However, if we wanted to wait for the method to return from the server, we can put the redirection in the callback of the method:

```js
Template.App_body.events({
  'click .js-new-list'() {
    Lists.methods.insert.call((err, listId) => {
      if (!err) {
        FlowRouter.go('Lists.show', { _id: listId });  
      }
    });
  }
});
```

You will also want to show some kind of indication that the method is working in between their click of the button and the redirect completing.  Don't forget to provide feedback if the method is returning an error.

<h2 id="advanced">Advanced Routing</h2>

<h3 id="404s">Missing pages</h3>

If a user types an incorrect URL, chances are you want to show them some kind of amusing not found page. There are actually two categories of "not found" pages. The first is when the URL typed in doesn't match any of your route definitions. You can use `FlowRouter.notFound` to handle this:

```js
// the App_notFound template is used for unknown routes and missing lists
FlowRouter.notFound = {
  action() {
    BlazeLayout.render('App_body', {main: 'App_notFound'});
  }
};
```

The second is when the URL is valid, but doesn't actually match any data. In this case, the URL matches a route, but once the route has successfully subscribed, it discovers there is no data. It usually makes sense in this case for the page component (which subscribes and fetches the data) to render a not found template instead of the usual template for the page:

```html
<template name="Lists_show_page">
    {{#each listId in listIdArray}}
    {{> Lists_show (listArgs listId)}}
  {{else}}
    {{> App_notFound}}
  {{/each}}
<template>
```

<h3 id="analytics">Analytics</h3>

It's common to want to know which pages of your app are most commonly visited, and where users are coming from. You can read about how to set up Flow Router based analytics in the [Deployment Guide](deployment.html#analytics).

<h3 id="server-side">Server Side Routing</h3>

As we've discussed, Meteor is a framework for client rendered applications, but this doesn't always remove the requirement for server rendered routes. There are two main use cases for server-side routing.

<h4 id="server-side-apis">Server Routing for API access</h4>

Although Meteor allows you to [write low-level connect handlers](http://docs.meteor.com/#/full/webapp) to create any kind of API you like on the server-side, if you all you want to do is create a RESTful version of your Methods and Publications, you can often use the [`simple:rest`](http://atmospherejs.com/simple/rest) package to do this easily. See the [Data Loading](data-loading.html#publications-as-rest) and [Methods](methods.html) articles for more information.

If you need more control, you can use the comphrensive [`nimble:restivus`](https://atmospherejs.com/nimble/restivus) package to create more or less whatever you need in whatever ontology you require.

<h4 id="server-side-rendering">Server Rendering</h4>

The Blaze UI library does not have support for server-side rendering, so it's not possible to render your pages on the server if you use Blaze. However, the React UI library does. This means it is possible to render HTML on the server if you use React as your rendering framework.

Although Flow Router can be used to render React components more or less as we've described above for Blaze, at the time of this writing Flow Router's support for SSR is [still experimental](https://kadira.io/blog/meteor/meteor-ssr-support-using-flow-router-and-react). However, it's probably the best approach right now if you want to use SSR for Meteor.
