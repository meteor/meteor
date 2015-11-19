---
title: "Meteor Guide: Routing"
---

After reading this guide, you'll know:

1. What role URLs play in a client-rendered app, and how it's different from a traditional server-rendered app
2. How to define client and server routes for your app using Flow Router
3. How to have your app display different content depending on the URL
4. How to construct links to routes and go to routes programmatically
5. How to handle URLs in your app that should only be accessible to certain users

## Routing and the role it plays in a client-rendered app

In a web application, _routing_ is the process of using URLs to drive the user interface (UI). URLs are a prominent feature in every single web browser, and have several main functions from the user's point of view:

1. **Bookmarking** - Users can bookmark URLs in their web browser to save content they want to come back to later
2. **Sharing** - Users can share content with others by sending a link to a certain page
3. **Navigation** - URLs are used to drive the web browser's back/forward functions

In a traditional web application stack, where the server renders HTML one page at a time, the URL is the fundamental entry point for the user to access the application. Users navigate an application by clicking through URLs, which are sent to the server via HTTP, and the server responds appropriately via a server-side router.

In contrast, Meteor operates on the principle of _data on the wire_, where the server doesn’t think in terms of URLs or HTML pages. The client application communicates with the server over DDP. Typically as an application loads, it boots up with a series of _subscriptions_ which fetch the data required to render the application. As the user interacts with the application, different subscriptions may load, but there’s no technical need for URLs to be involved in this process.

However, most of the user-facing features of URLs listed above are still relevant for typical Meteor applications. Now that the server is not URL-driven, the URL just becomes a useful representation of the client-side state the user is currently looking at. However, unlike in a server-rendered application, it does not need to describe the entirety of the user’s current state; it simply needs to contain the parts that you want to be linkable. For example, the URL should contain any search filters applied on a page, but not necessarily the state of a dropdown menu or popup.

## Installing Flow Router

To add routing to your app, install the `kadira:flow-router` package:

```
meteor add kadira:flow-router
```

Flow Router is a community routing package for Meteor. At the time of writing this guide, it is at version 2.x.

- [Flow Router on GitHub](https://github.com/kadirahq/flow-router)
- [Kadira Meteor routing guide](https://kadira.io/academy/meteor-routing-guide)

### Other options for routing

Flow Router is one of several popular routing packages for Meteor. Another is iron:router. You can search for router on Atmosphere to find more. Hopefully, the concepts in this routing guide will be relevant no matter which router you use, as long as it provides basic functions for URL management.

## Defining a simple route

The basic purpose of a router is to match certain URLs and perform actions as a result. This all happens on the client side, in the app user's browser.

```js
FlowRouter.route('/blog/:postId', {
  name: "blog-post",
  action(pathParams, queryParams) {
    console.log("Got the postId from the URL:", pathParams.postId);
    console.log("Query parameters:", queryParams);
  }
});
```

*Snippet: Defining a basic route with Flow Router*

This route handler will run in two situations: if the page loads initially at a URL that matches the URL pattern, and if the URL changes to one that matches the pattern while the page is open. Note that, unlike in a server-side-rendered app, the URL can change without any additional requests to the server.

When the route is matched, the `action` method executes, and you can perform any actions you need to. The `name` property of the route is optional, but will let us refer to this route more conveniently later on.

### URL pattern matching

Consider the following URL pattern, used in the code snippet above:

```js
'/blog/:postId'
```

The above pattern will match certain URLs. You may notice that one of the segments is prefixed by `:` - this means that it is a *url parameter*, and will match any string that is present in that segment of the path. Here are some example URLs and the resulting `pathParams` and `queryParams`:

| URL           | matches pattern? | pathParams	         | queryParams
| ---- | ---- | ---- | ---- |
| /	            | no | | |
| /about	      | no | | |
| /blog/        | no | | |
| /blog/eMtGij5AFESbTKfkT |	yes |	{ postId: "eMtGij5AFESbTKfkT"} |	{ }
| /blog/1	| yes	| { postId: "1"} | { }
| /blog/1?commentSort=top	| yes	| { postId: "1"} | { commentSort: "top" }

*Table: Example URLs and the resulting parameters*

Note that all of the values in `pathParams` and `queryParams` are always strings since URLs don't have any way of encoding data types. You might need to use `parseInt(value, 10)` to convert strings into numbers.

## Displaying different views based on the URL and defining layouts

*This section is UI-framework specific, and is written assuming you are using Blaze as your UI engine. If you are building your app with React or Angular, you will end up with similar concepts but the code will not be exactly the same.*

Now we know how to define a function that is called when we reach a particular URL. But URLs are most often used not to call plain functions, but to display some UI. This is why navigating to a URL is often referred to as “going to a page” - you expect the app to display certain content as if it were a page in a book or magazine.

When using Flow Router, the simplest way to display different views on the page for different URLs is to use the complementary Blaze Layout package. First, make sure you have the Blaze Layout package installed:

```
meteor add kadira:blaze-layout
```

- [Blaze Layout on GitHub](https://github.com/kadirahq/blaze-layout)

To use this package, we need to define a layout template in our HTML:

```html
<template name="layout-main">
  <nav>... some links go here ...</nav>

  <div class="sidebar">
    {{> Template.dynamic template=sidebar}}
  </div>

  <div class="page">
    {{> Template.dynamic template=page}}
  </div>
</template>
```

*Snippet: Defining a layout to use with Blaze Layout*

Here, we are using a Blaze feature called `Template.dynamic` to render a template whose name is passed in from outside. We have defined two *regions* in our layout: `sidebar` and `page`. We have also included a navbar at the top of every page. Let's define some of the templates that will display our actual content:

```html
<template name="sidebar-recent-posts">
  <h3>Recent posts</h3>
  <p>... Recent posts will go here ...</p>
</template>

<template name="page-blog-post">
  <h2>Title</h2>
  <p>Content goes here</p>
</template>

<template name="page-about">
  <h2>About my blog</h2>
  <p>Welcome, this is a cool blog!</p>
</template>
```

*Snippet: Defining some templates that display content*

These are some templates that we will render into the layout from our route action. Notice that these templates don't have any dynamic data. Right now, we are focusing on the layout aspect and we will get to filling in data in a later section.

Now, let's define two routes that actually use our templates and layout to display some content!

```js
FlowRouter.route('/blog/:postId', {
  name: "blog-post",
  action(pathParams, queryParams) {
    BlazeLayout.render('layout-main', {
      sidebar: "sidebar-recent-posts",
      content: "page-blog-post"
    });
  }
});

FlowRouter.route('/about', {
  name: "about",
  action(pathParams, queryParams) {
    BlazeLayout.render('layout-main', {
      sidebar: "sidebar-recent-posts",
      content: "page-about"
    });
  }
});
```

*Snippet: Using our content templates and our layout inside the route action to display content*

Now, if the user navigates to the different URLs, they will see the blog post template or the about page template. You can define as many templates or layouts as you want, and mix and match them inside your route handlers.

### Templates as pages vs. Templates as reusable UI components

In the code samples, we have decided to name the templates after the layout regions they will be rendered into. This is not necessary, but enables us to make it clear that those templates are expecting to be used in a certain place in the layout. It's explicitly stating that these templates are not meant to be reusable in different parts of the app - they are only useful for rendering a “page” of the app.

If you have lots of pages that are similar, it would make sense to split up your app into a collection of reusable components, and a collection of single-purpose pages that mostly just mix-and-match the reusable components. Read more about this distinction in the article on _UI components_.

## Displaying and subscribing to data based on the URL

In the previous section, we looked at how to display different templates based on the URL pattern. However, if we have a `page-blog-post` template that can display different posts, we need to be able to tell it which post to display. We already have the ability to get `pathParams.postId` inside the body of the `action` function on the `blog-post` route, but how do we give it to the template?

### Accessing URL Parameters in JavaScript and Template Helpers

Flow Router has some helpful functions that can be used to access data about the current URL from anywhere. Here are some of the most useful ones:

* `FlowRouter.getRouteName()` gets the name of the route
* `FlowRouter.getParam(paramName)` returns the value of a single URL parameter
* `FlowRouter.getQueryParam(paramName)` returns the value of a single URL query parameter

So let's say we wanted to display a blog post in our `content-blog-post` template based on the current URL. We could define a helper like this:

```js
Template["page-blog-post"].helpers({
  blogPost() {
    return BlogPosts.findOne(FlowRouter.getParam("postId"));
  }
});
```

*Snippet: Defining a helper to pass a blog post object to the blog post page template using a URL parameter*

Now, we can use this helper in our HTML to display the post content:

```html
<template name="page-blog-post">
  <h2>{{blogPost.title}}</h2>

  {{blogPost.content}}

  <div>
    <a href="example.com">Share this post!</a>
  </div>
</template>
```

*Snippet: Using the new helper from the previous snippet to display a blog post's title and content*

As mentioned in section 4.1, the `page-blog-post` template is coupled to a certain route and a certain layout. If you want to render blog posts in many different ways, it could be prudent to factor out the blog post display and formatting logic into a reusable component, in which case the template for the page would become simpler:

```html
<template name="page-blog-post">
  {{> component-blog-post post=blogPost}}

  <div>
    <a href="example.com">Share this post!</a>
  </div>
</template>
```

*Snippet: A page that uses a reusable blog post component to do formatting, and only displays the parts that are page-specific itself*

In this case, the function of the `page-blog-post` component is just to get the correct data using the URL parameter, and to display page-specific UI such as sharing buttons. The important part of rendering the blog post content itself is delegated to a reusable component that can be included on many different pages, independently of the URL logic and post data retrieval.

**Reusable component tip:** be very careful about accessing URL parameters in any component you want to be reusable across different pages.

### Subscribing to data and displaying a loading indicator

If you are experienced in Meteor, you know that in order for `BlogPosts.findOne(...)` in the snippet above to return anything useful, you need to subscribe to that data from the server using `Meteor.subscribe`. The `page-blog-post` template would be a great place to do that:

```js
Template["page-blog-post"].onCreated(function () {
  this.autorun(() => {
    this.subscribe("blog-post", FlowRouter.getParam("postId"));
  });
});
```

*Snippet: Subscribing to data from the onCreated callback of a page template*

Now, when we go to the blog post page in our app, when the `page-blog-post` template is initialized, we will subscribe to the data for this blog post, and the `blogPost` helper will return the post data once it arrives. But this won't happen instantly - it takes time for the data to arrive from the server to the client before it can be displayed. For this reason, Blaze has a helpful built-in helper: `Template.subscriptionsReady`. It works because we used `this.subscribe` instead of `Meteor.subscribe` when loading the data. Let's display a simple loading message:

```html
<template name="page-blog-post">
  {{#if Template.subscriptionsReady}}
    {{> component-blog-post post=blogPost}}
  {{else}}
    <p>Loading...</p>
  {{/if}}

  <div>
    <a href="example.com">Share this post!</a>
  </div>
</template>
```

*Snippet: Displaying a loading indicator while data is loading from the server*

Note that we don't need to block out the entire page while the data is loading! We can just block a small part of the page with a loading indicator.

### Higlighting the active route in the navigation

One more place you might want to access the data from the URL is in your navigation component, to highlight the one that is currently active. A convenient package for this is `zimme:active-route`:

```
meteor add zimme:active-route
```

- [zimme/meteor-active-route on GitHub](https://github.com/zimme/meteor-active-route)

Now, let's create a navbar template that highlights the appropriate item based on the active route:

```html
<template name="layout-navbar">
  <nav>
    <a class="{{isActiveRoute 'home'}}">Home</a>
    <a class="{{isActiveRoute 'about'}}">About</a>
  </nav>
</template>
```

Now, the link that corresponds to the active route (based on the `name` of the route) will get the `active` class, and you can style it differently using CSS. Read more about the different features of `zimme:active-route` in [its README](https://github.com/zimme/meteor-active-route).

## Redirecting

Sometimes, your users will end up on a page that isn't the best place for them to be. Maybe the data they were looking for has moved, maybe they were on an admin panel page and logged out, or maybe they just created a new object and you want them to end up on the page for the thing they just created.

You can go to a new URL programmatically by calling `FlowRouter.go(name, pathParams, queryParams)`. See the [FlowRouter docs](https://github.com/kadirahq/flow-router#flowroutergopathdef-params-queryparams) for more methods that accomplish similar things, like `FlowRouter.setParams` and `FlowRouter.setQueryParams`.

You can also redirect to a different route from a route trigger. We'll discuss them in more detail in the _triggers section_, but here we'll include some example code specifically for redirection.


### Redirecting for convenience

Sometimes, you want to have a route that always redirects somewhere else. Maybe this is so that the user can type less, or bookmark a certain URL, or similar. For example, you may want a URL that always redirects to the most recent blog post published. In Flow Router, you do this using a trigger, which will be covered in more detail later in the guide:

```js
// XXX how do you do this?
```

### Redirecting when an asynchronous operation succeeds

Often, you just want to go to a new route programmatically when a user has completed a certain action. In this case, we'll take the example of deleting a blog post. If you have deleted a blog post from its page, you probably want to leave the page you were on, since that resource no longer exists. Here's how you could do that:

```js
Meteor.call("/blog-posts/delete", (err) => {
  if (err) {
    // Display error message
  } else {
    FlowRouter.go("home");
  }
});
```

You will also want to show some kind of status while the method is working so that the user knows there is something going on between them clicking the button and the redirect happening. It's important that we only redirect if the method call on the server succeeds, because otherwise the redirect will make it look like the item was deleted when it actually wasn't.

### Redirecting when some data has been moved

If some data in your app has been moved, you probably want to redirect people to the new object. For example, if we renamed a document and the name was part of the URL, we would want the user to end up at the new URL so that usage of the old one decreases gradually. Eventually, once our _analytics_ indicate that nobody is visiting the old URL anymore, we can remove the backwards compatibility code.

```js
// XXX how do you do this?
```

### Redirecting when a route has been changed

As you maintain and develop new features for your app, you might discover that you need to change your URL structure. If there are already lots of links and bookmarks to your app floating around in the wild, it might be a good idea to redirect the old URLs for backwards compatibility.

```js
// XXX write this
```

## User permissions and URLs

In a traditional server-side rendered app, it's common to restrict which URLs users are allowed to visit based on their ownership of certain data, or the role they have in the system (admin, moderator, etc). In Meteor, the router is not the correct place to manage permissions. Permissions about which users can read and write data belong in Meteor publications and methods, which deal with actually reading and writing data from the server. However, it's still useful to show people nice messages reminding them to log in to see certain content or reminding them that they don't have the right permissions.

### Displaying a reminder to log in to see a certain page

This is best done inside the page template itself. For example, imagine we had a page in our app to edit a blog post, and the template for that was called `page-blog-post-edit`. Here is what the template's HTML would look like if we wanted to remind people to log in to edit the blog post:

```html
<template name="page-blog-post-edit">
  <h3>Edit post {{blogPost.title}}</h3>

  {{#if currentUser}}
    {{> component-blog-post-editor post=blogPost}}
  {{else}}
    Please log in to edit posts.
  {{/if}}
</template>
```

However, in a multi-user system, this might not be good enough because only certain users are allowed to edit posts.

### Indicating that a logged in user doesn't have permission to be on a certain page

There are several options for what the UI should do if a user is logged in but doesn't have permissions for a certain action. First of all, the app developer should minimize the opportunities for the user to end up on that page in the first place, as a courtesy. For example, don't display a button to edit the blog post if the user doesn't have permissions. But if the user has ended up on the page anyway, possibly by remembering the URL or similar, you should display a message on the page telling the user that they won't be able to accomplish their intended action.

In the below code snippet, we use a helper `userCanEditPost` to check if the user is the owner of the blog post and display a helpful message. This can be a good option if the user's permissions are likely to change - for example, you could arrive at this page, note that you don't have permissions, ask the author to give you the permissions, and then the page will update to show the editor once the permissions are added. This workflow wouldn't be possible if you had instead redirected the user to a different URL entirely.

```html
<template name="page-blog-post-edit">
  <h3>Edit post {{blogPost.title}}</h3>

  {{#if currentUser}}
    {{#if userCanEditPost currentUser blogPost}}
      {{> component-blog-post-editor post=blogPost}}
    {{else}}
      You're not allowed to edit this post.
      Message the author to add you as a collaborator.
    {{/if}}
  {{else}}
    Please log in to edit posts.
  {{/if}}
</template>
```

### Redirecting a user away from a page they shouldn't be on

XXX given that the user's data might not have loaded yet, this might actually be super hard!

## Displaying links to routes using helpers

Once you have some routes defined in your app, you will probably want to add some links to your page to go to the different URLs. You can generate the URLs yourself using `FlowRouter.pathFor`, but it is more convenient to use a package that defines some helpers for you:

```
meteor add arillo:flow-router-helpers
```

- [arillo/meteor-flow-router-helpers on GitHub](https://github.com/arillo/meteor-flow-router-helpers/)

Now that you have this package, you can use helpers in your templates to display a link to a certain route. For example, to link to a blog post:

```html
<a href="{{pathFor 'blog-post' postId=blogPostId}}">Link to a post</a>
```

Or to link to the `about` page which doesn't have any parameters:

```html
<a href="{{pathFor 'about'}}">Link to a post</a>
```

## Analytics

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

## Not done

- Root route
- When to use query parameters; don't encode temporary data in the URL, like `/stuff?alert="thanks for logging in"` because you can just use a variable in JS. If you want something to persist across tabs and actual page reloads, it should be in Mongo or localstorage.
- Displaying not found/404 page

## Further reading

Learn about advanced features of Flow Router:

- [Simple Template-Based Authorization Example](https://github.com/alanning/meteor-roles/tree/master/examples/flow-router)
- [Advanced Authorization with Auth Controllers Example](https://github.com/alanning/meteor-roles/tree/master/examples/flow-router-advanced)
- Nested routes
- XXX

HTTP routing/API

- Link to other guide articles here
