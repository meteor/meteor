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


## Defining a simple route

The basic purpose of a router is to match certain URLs and perform actions as a result. This all happens on the client side, in the app user's browser. Let's take an example from the Todos example app:

```js
FlowRouter.route('/lists/:_id', {
  name: 'listsShow',
  action() {
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

It's useful to access the interesting parts of the current route that you need in your application. Here are some useful reactive functions you can call:

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
Template.appBody.helpers({
  activeListClass(list) {
    const active = ActiveRoute.name('listsShow')
      && FlowRouter.getParam('_id') === list._id;

    return active && 'active';
  }
});
```

## Rendering based on the route

Now we understand how to define routes and access information about the current route, we are in a position to do you usually want to do when a user accesses a route---render a user interface to the screen that represents it.

*In this section, we'll discuss how to render routes using Blaze as the UI engine. If you are building your app with React or Angular, you will end up with similar concepts but the code will not be exactly the same.*

When using Flow Router, the simplest way to display different views on the page for different URLs is to use the complementary Blaze Layout package. First, make sure you have the Blaze Layout package installed:

```bash
meteor add kadira:blaze-layout
```

To use this package, we need to render a "layout" component by default. In the Todos example app, that template is called `appBody`:

```html
<template name="appBody">
  ...
  {{> Template.dynamic template=main}}
  ...
</template>
```

(This is not the entire `appBody` template, but we highlight the most important part here). 
Here, we are using a Blaze feature called `Template.dynamic` to render a template who is attached to the the `main` argument to the template. Using Blaze Layout, we can change that `main` argument when a route is accessed.

We do that by changing the `action` function of our `listShow` route definition:

```js
FlowRouter.route('/lists/:_id', {
  name: 'listsShow',
  action() {
    BlazeLayout.render('appBody', {main: 'listsShowPage'});
  }
});
```

What this means is that whenever a user visits a URL of the form `/lists/X`, the `listShow` route will kick in, triggering the `BlazeLayout` call to set the `main` property of the `appBody` template.

### Templates as pages vs. Templates as reusable components

Notice that we called the template to be rendered `listsShowPage` (rather than `listShow`). This indicates that this template is rendered directly by a Flow Router action and forms the 'top' of the rendering hierarchy for this URL.

The `listShowPage` template will render *without* arguments---it is this template's responsibility to collect information from the current route, and then pass this information down into its child templates. Correspondingly the `listShowPage` template is very tied to it's environment (the route it's rendered under), and so it needs to be a smart component (see the article on {% link_to 'ui-ux' 'UI/UX'} for more about smart and pure components).

It makes sense for a "page" smart component like `listShowPage` to:

1. Collect route information,
2. Subscribe to relevant subscriptions,
3. Fetch the data from those subscriptions, and
4. Pass that data into a sub-component

In this case, the `listShowPage` template simply renders as:

```html
<template name="listsShowPage">
  {{#each list in listArray}}
    {{> listsShow todosReady=Template.subscriptionsReady list=list}}
  {{/each}}
</template>
```

(The `{{#each}}` is a animation technique that we also discuss in the {% link_to 'ui-ux' 'UI/UX Article'}). 

It's the `listShow` template (a pure component) that actually handles the job of rendering the content of the page. As the page component is passing the arguments into the pure component, it is able to be quite mechanical and the concerns of talking to the router and rendering the page have been separated.

### Route related rendering logic

There are examples of rendering logic that seems very related to the route, for which it can be difficult to know where to implement. A classic example is authorization; for instance, you may want to render a login form for some subset of your pages if the user is not yet logged in.

It's best to keep all logic around what to render in the component hierarchy (i.e. the tree of rendered templates). So this authorization should happen inside a template. Suppose we wanted to add this to the `listShowPage` we were looking at above. We could do something like:

```html
<template name="listsShowPage">
  {{#if currentUser}}
    {{#each list in listArray}}
      {{> listsShow todosReady=Template.subscriptionsReady list=list}}
    {{/each}}
  {{else}}
    Please log in to edit posts.
  {{/if}}
</template>
```

Of course, we might start finding that we need to share this functionality between the multiple pages of our app that have access control required. However, we can share functionality between templates---by wrapping them in a wrapper "layout" template which includes the behaviour we want. 

You can create wrapper templates by using the "template as block helper" ability of Blaze (see the {% link_to 'blaze' Blaze Article %}). So we can write an authorization template:

```html
<template name="forceLoggedIn">
  {{#if currentUser}}
    {{> Template.contentBlock}}
  {{else}}
    Please log in to edit posts.
  {{/if}}
</template>
```

Once that template exists, we can simply wrap our `listsShowPage`:

```html
<template name="listsShowPage">
  {{#forceLoggedIn}}
    {{#each list in listArray}}
      {{> listsShow todosReady=Template.subscriptionsReady list=list}}
    {{/each}}
  {{/forceLoggedIn}}
</template>
```

A chief advantage of this approach is that it is immediately clear when viewing the `listShowPage` what behaviour will occur when a user visits the page.

Multiple behaviours of this type can be composed by wrapping a template in multiple wrappers, or wrapping the wrappers themselves.

## Changing Routes

Rendering an updated UI when a user reaches a new route is obviously not that useful without giving the user some way to reach a new route! The simplest way is with the trusty `<a>` tag and a URL. You can generate the URLs yourself using `FlowRouter.pathFor`, but it is more convenient to use the [`arillo:flow-router-helpers`](https://github.com/arillo/meteor-flow-router-helpers/) package that defines some helpers for you:


```
meteor add arillo:flow-router-helpers
```

Now that you have this package, you can use helpers in your templates to display a link to a certain route. For example, in the Todos example app, our nav links look like:


```html
<a href="{{pathFor 'listsShow' _id=list._id}}" title="{{list.name}}"
    class="list-todo {{activeListClass list}}">
```

### Routing programmatically

In some cases you want to change routes based on user action outside of them clicking on a link. For instance, in the example app, when a user creates a new list, we want to route them to the list they just created. We do this by calling `FlowRouter.go()` once we know the id of the new list:

```js
Template.appBody.events({
  'click .js-new-list'() {
    const listId = Lists.methods.insert.call();
    FlowRouter.go('listsShow', { _id: listId });
  }
});
```

You can also simply change part of the URL, using the `FlowRouter.setParams()` and `FlowRouter.setQueryParams()`. For instance, if we were viewing one list and wanted to go to another, we could write:

```js
FlowRouter.setParams({_id: newList._id});
```

Of course, it is more general to call `FlowRouter.go()`, so unless you are being very specific in what you are doing it's usually better to use that.

### Storing data in the URL

As we discussed in the introduction, the URL is really just a serialization of some part of the client-side state the user is looking at. Although parameters can only be strings, it's possible to convert any type of data to a string via serializing it.

In general if you want to store arbitrary serializable data in a URL param, you can use `EJSON.stringify()` to turn it onto a string. You'll need to URL-encode the string as well to remove any characters that have meaning in a URL:

```js
FlowRouter.setQueryParams({data: encodeURIComponent(EJSON.stringify(data))});
```

You can then get the data back out of Flow Router in the opposite way (note that Flow Router unescapes the dat for you automatically):

```js
const data = EJSON.parse(FlowRouter.getQueryParam('data'));
```

## Redirecting

Sometimes, your users will end up on a page that isn't the best place for them to be. Maybe the data they were looking for has moved, maybe they were on an admin panel page and logged out, or maybe they just created a new object and you want them to end up on the page for the thing they just created.

Usually, we can redirect in response to a user's action by calling `FlowRouter.go()` and friends, like in our list creation example above, but if a user browses directly to a URL that doesn't exist, it's useful to know how to redirect immediately.

If a URL is simply out-of-date (sometimes you might change the URL scheme of an application), you can redirect inside the `action` function of the route:

```js
FlowRouter.route('/old-list-route/:_id', {
  action(params) {
    FlowRouter.go('listsShow', params);
  }
});
```

### Redirecting dynamically

If however, you need some data to redirect, you'll need to render part of the component hierarchy, as that is the place where data subscribing happens. For example, in the Todos example app, we want to make the root (`/`) route redirect to the first known list. To achieve this, we need to render a special `rootRedirector` route:

```js
FlowRouter.route('/', {
  name: 'home',
  action() {
    BlazeLayout.render('appBody', {main: 'rootRedirector'});
  }
});
```

Because the `rootRedirector` template is rendered inside the `appBody` layout which takes care of subscribing to the set of lists the user knows about *before* rendering it's sub-template, and we are guaranteed there is at least one such list, we can simply do:

```js
Template.rootRedirector.onCreated(() => {
  // We need to set a timeout here so that we don't redirect from inside a redirection
  //   which is a limitation of the current version of FR.
  Meteor.setTimeout(() => {
    FlowRouter.go('listsShow', Lists.findOne());
  });
});
```

### Redirecting after a user's action

Often, you just want to go to a new route programmatically when a user has completed a certain action. Above we saw a case (creating a new list) when we wanted to do it *optimistically*---i.e. before we hear back from the server that the Method succeeded. We can do this because we reasonably expect that the Method will succeed in almost all cases (see the {% link_to 'ui-ux' 'UI/UX article'} for further discussion of this).

However, if we wanted to wait for the method to return for the server, we can put the redirection in the callback of the method:

```js
Template.appBody.events({
  'click .js-new-list'() {
    Lists.methods.insert.call((err, listId) => {
      if (!err) {
        FlowRouter.go('listsShow', { _id: listId });  
      }
    });
  }
});
```

You will also want to show some kind of status while the method is working so that the user knows there is something going on between them clicking the button and the redirect happening (and show the error some kind of message if the error is there too).

## Advanced Routing

### Missing pages

If a user types an incorrect URL, chances are you want to show them some kind of amusing not found page. There are actually two categories of "not found" pages. The first is when the URL typed in doesn't match any of your route definitions. You can use `FlowRouter.notFound` to handle this:

```js
// the appNotFound template is used for unknown routes and missing lists
FlowRouter.notFound = {
  action() {
    BlazeLayout.render('appBody', {main: 'appNotFound'});
  }
};
```

The second is when the URL is valid, but doesn't actually match any data. In this case, the URL matches a route, but once the route has successfully subscribed, it discovers there is no data. It usually makes sense in this case for the page component (which subscribes and fetches the data) to render a not found template instead of the usual template for the page:

```html
<template name="listsShowPage">
  {{#each list in listArray}}
    {{> listsShow todosReady=Template.subscriptionsReady list=list todos=list.todos}}
  {{else}}
    {{> appNotFound}}
  {{/each}}
</template>
```

### Analytics

It's common to want to know which pages of your app are most commonly visited, and where users are coming from. Read more about analytics in general in the _Analytics/Monitoring guide_, but here's a simple setup that will get you URL tracking using Google Analytics. We'll be using the `okgrow:analytics` package.

```
meteor add okgrow:analytics
```

- [okgrow/analytics on GitHub](https://github.com/okgrow/analytics)

Now, we need to configure the package with our Google Analytics key (the package also supports a large variety of other providers, check out the documentation [on Atmosphere](https://atmospherejs.com/okgrow/analytics)). Pass it in as part of _Meteor settings_:

```js
{
  "public": {
    "analyticsSettings": {
      // Add your analytics tracking id's here
      "Google Analytics" : {"trackingId": "Your tracking ID"}
    }
  }
}
```

That's it! The analytics package hooks into Flow Router and records all of the page events for you.

### Server Side Routing

As we've discussed, Meteor is a framework for client rendered applications, but this doesn't always remove the requirement for server rendered routes. There are two main use cases for server-side routing.

#### Server Routing for API access

Although Meteor allows you to [write low-level connect handlers](http://docs.meteor.com/#/full/webapp) to create any kind of API you like on the server-side, if you all you want to do is create a RESTful version of your Methods and Publications, you can often use the [`simple:rest`](http://atmospherejs.com/simple/rest) package to do this easily. See the {% link_to data-loading 'Data Loading' %} and {% link_to methods 'Methods' %} articles for more information.

#### Server Rendering

The Blaze UI library does not have support for server-side rendering, so it's not possible to render your pages on the server if you are using it. However, the React UI library does. This means it is possible to render HTML on the server if you use React as your rendering framework.

Although Flow Router can be used to render React components more or less exactly as we've described above for Blaze, at of this writing, Flow Router's support for SSR is [still experimental](https://kadira.io/blog/meteor/meteor-ssr-support-using-flow-router-and-react). 

If you want to use SSR and React with Meteor, the best approach probably revolves around using the [React Router package] XXX: fill this out



















