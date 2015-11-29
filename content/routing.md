---
title: "Meteor Guide: Routing"
---

After reading this guide, you'll know:

1. What role URLs play in a client-rendered app, and how it's different from a traditional server-rendered app
2. How to define client and server routes for your app using Flow Router
3. How to have your app display different content depending on the URL
4. How to construct links to routes and go to routes programmatically

## Client-side Routing

In a web application, _routing_ is the process of using URLs to drive the user interface (UI). URLs are a prominent feature in every single web browser, and have several main functions from the user's point of view:

1. **Bookmarking** - Users can bookmark URLs in their web browser to save content they want to come back to later
2. **Sharing** - Users can share content with others by sending a link to a certain page
3. **Navigation** - URLs are used to drive the web browser's back/forward functions

In a traditional web application stack, where the server renders HTML one page at a time, the URL is the fundamental entry point for the user to access the application. Users navigate an application by clicking through URLs, which are sent to the server via HTTP, and the server responds appropriately via a server-side router.

In contrast, Meteor operates on the principle of _data on the wire_, where the server doesn’t think in terms of URLs or HTML pages. The client application communicates with the server over DDP. Typically as an application loads, it boots up with a series of _subscriptions_ which fetch the data required to render the application. As the user interacts with the application, different subscriptions may load, but there’s no technical need for URLs to be involved in this process.

However, most of the user-facing features of URLs listed above are still relevant for typical Meteor applications. Now that the server is not URL-driven, the URL just becomes a useful representation of the client-side state the user is currently looking at. However, unlike in a server-rendered application, it does not need to describe the entirety of the user’s current state; it simply needs to contain the parts that you want to be linkable. For example, the URL should contain any search filters applied on a page, but not necessarily the state of a dropdown menu or popup.

## Using Flow Router

To add routing to your app, install the [`kadira:flow-router`](https://atmospherejs.com/kadira/flow-router) package:

```
meteor add kadira:flow-router
```

Flow Router is a community routing package for Meteor. At the time of writing this guide, it is at version 2.x.

- [Flow Router on GitHub](https://github.com/kadirahq/flow-router)
- [Kadira Meteor routing guide](https://kadira.io/academy/meteor-routing-guide)

### Other options for routing

Flow Router is one of several popular routing packages for Meteor. Another is iron:router. You can search for router on Atmosphere to find more. Hopefully, the concepts in this routing guide will be relevant no matter which router you use, as long as it provides basic functions for URL management.

## Defining a simple route

The basic purpose of a router is to match certain URLs and perform actions as a result. This all happens on the client side, in the app user's browser. Let's take an example from the Todos example app:

```js
FlowRouter.route('/lists/:_id', {
  name: 'listsShow',
  action: () => {
    console.log("Looking at a list?")
  }
});
```

This route handler will run in two situations: if the page loads initially at a URL that matches the URL pattern, and if the URL changes to one that matches the pattern while the page is open. Note that, unlike in a server-side-rendered app, the URL can change without any additional requests to the server.

When the route is matched, the `action` method executes, and you can perform any actions you need to. The `name` property of the route is optional, but will let us refer to this route more conveniently later on.

### URL pattern matching

Consider the following URL pattern, used in the code snippet above:

```js
'/lists/:_id'
```

The above pattern will match certain URLs. You may notice that part of the URL is prefixed by `:` - this means that it is a *url parameter*, and will match any string that is present in that segment of the path. Flow Router will make that part of the URL available as a `param` of the current URL match.

Additionally, the URL could contain an HTTP [**query string**](https://en.wikipedia.org/wiki/Query_string) (the part after an optional `?`). If so, Flow Router will also split it up into named parameters, which it calls `queryParams`.


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

## Accessing Route information

Flow Router makes a variety of information available via (reactive and otherwise) functions on the global singleton `FlowRouter` (this is the same object that we attached routes to above). As the user navigates around your app, the values of these functions will change (reactively in some cases) correspondingly.

Like any other global singleton in your application (see the X article for info about stores), it's best to limit your access to `FlowRouter`. That way the parts of your app with remain modular and more independent. In the case of `FlowRouter`, it's best to access it solely from the top of your component hierarchy, either in the "page" component, or the layouts that wrap it (see below).

### The current route

To access the current route, you can use `FlowRouter.current()`. This is a object representing all aspects of the route, and as it changes often it is not reactive. 

Often it's more useful to access just exactly what parts of the route you care about. Here are some useful reactive functions you can call:

* `FlowRouter.getRouteName()` gets the name of the route
* `FlowRouter.getParam(paramName)` returns the value of a single URL parameter
* `FlowRouter.getQueryParam(paramName)` returns the value of a single URL query parameter

So in our example of the list page form the Todos app, we access the current list's id with `FlowRouter.getParam('_id')` (we'll see more on this below).

### Highlighting the active route

One situation where it is sensible to access the global `FlowRouter` singleton to access the current route's information deeper in the component hierarchy is when rendering links via a navigation component. It's often required to highlight the "active" route in some way (this is the route or section of the site that the user is currently looking at).

A convenient package for this is [`zimme:active-route`](https://github.com/zimme/meteor-active-route):

```bash
meteor add zimme:active-route
```

In the Todos example app, we link to each list the user knows about in the `appBody` template:

```blaze
{{#each list in lists}}
  <a class="list-todo {{activeListClass list}}">
    ...

    {{list.name}}
  </a>
{{/each}}
```

We can determine if the user is currently viewing the list with the `activeListClass` helper:

```js
Template.appBody.helpers({
  activeListClass(list) {
    const active = ActiveRoute.name('listsShow')
      && FlowRouter.getParam('_id') === list._id;

    return active && 'active';
  }
});
```


## Rendering based on the route

```js
FlowRouter.route('/lists/:_id', {
  name: 'listsShow',
  action: () => {
    BlazeLayout.render('appBody', {main: 'listsShowPage'});
  }
});
```





* Getting information about the current route
    * Be careful about where you do this, the best way is to have the page component and layouts responsible for this
        * Otherwise, complications can arise when doing transitions between pages, since the parameters are changing
    * Getting the currently active route
    * Getting the parameters
    * Highlighting the currently active route







# Routing

* What is routing, and how it's different in a client-rendered app
    * Uses for the URL
        * Bookmarking
        * Sharing
        * Back/forward
    * It's a useful serialization of some share-able, bookmarkable client-side state
        * Not everything needs to be a route - consider that you can just store JavaScript variables, or use local storage for temporary information
    * Routing is not related to data loading or authorization in a client-side app. For those, go see the security and data loading chapters
* Flow Router intro
* Creating routes
    * How to define a basic route
    * How to accept route parameters and URL pattern matching
    * When to use query parameters vs. path parameters
* Getting information about the current route
    * Be careful about where you do this, the best way is to have the page component and layouts responsible for this
        * Otherwise, complications can arise when doing transitions between pages, since the parameters are changing
    * Getting the currently active route
    * Getting the parameters
    * Highlighting the currently active route
* Using the router to display templates/pages
    * Layouts
    * Using Blaze Layout
    * Most of the logic is inside a template which represents a page
        * The template is the place to do business logic, for example, showing people a screen that tells them to log in to see this content
        * Sometimes, you might want to abstract this into a layout
        * See more of these patterns in the data loading and Blaze chapters
* Changing routes
    * Getting the URL for a target route
    * Displaying a link
    * Going to a route programmatically
    * Setting individual parameters with Flow Router
    * Setting a parameter with serialized JSON data
* Redirects
    * Redirecting when a page has been moved to a different URL
    * Redirecting when data has been moved
    * Redirecting when user is not allowed to see this page
    * Redirecting a default route to a specific one
    * Redirecting after an asynchronous operation
        * Should you do this optimistically? See the UX chapter
        * Redirecting after an insert to go to the newly inserted item
        * Redirecting after a delete to go to a different page
* Special cases
    * What to do when data on this URL has been deleted - 404
* Analytics for URLs
    * Link to the production guide about analytics, not in this article
* Server-side routing
    * Blaze doesn't currently support server side rendering, but React does - link to article
    * HTTP API routes not in this article
