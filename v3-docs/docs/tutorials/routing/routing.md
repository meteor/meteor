# URLs and Routing

After reading this guide, you'll know:

1. The role URLs play in a client-rendered Meteor application.
2. How to define routes and render Blaze layouts and pages with `ostrio:flow-router-extra`.
3. How to read URL parameters reactively and drive Meteor subscriptions from a route.
4. How to build navigation links, highlight the active route, and navigate programmatically.
5. How to protect routes with authentication, split code with dynamic `import()`, and handle 404 pages.
6. How to define server-side HTTP routes with `WebApp.handlers` and Express 5.

[[toc]]

## Client-Side Routing in Meteor

In a web application, _routing_ is the process of using URLs to drive the user interface (UI). URLs serve three main purposes for users:

1. **Bookmarking** — Users can bookmark URLs in their browser to return to a specific view later.
2. **Sharing** — Users can share a link that opens a specific page or resource.
3. **Navigation** — URLs drive the browser's back and forward history buttons.

In a traditional server-rendered application, every click sends an HTTP request to the server, which matches the URL and returns a freshly rendered HTML page.

By contrast, Meteor operates on the principle of _data on the wire_: the server publishes data over DDP rather than HTML pages. As the user navigates, the client router intercepts URL changes via the browser's History API (`pushState` and `popstate`), swaps the active template in the DOM without a full page reload, and updates reactive data subscriptions as needed.

Since the server is not URL-driven, the URL acts as a clean serialization of the linkable state of the client UI — such as which page or document ID is open, or which search filter is active — while transient UI state (such as whether a dropdown is open) stays in component state like a `ReactiveVar` or `ReactiveDict`.

## Using Flow Router Extra with Blaze

When you create a Blaze app with `meteor create --blaze` or `meteor create --full`, [`ostrio:flow-router-extra`](https://atmospherejs.com/ostrio/flow-router-extra) is already included and configured.

To add it to an existing project, run:

```shell
meteor add ostrio:flow-router-extra
```

`ostrio:flow-router-extra` is the actively maintained router for Blaze in Meteor 3. It extends the original Flow Router design with:

- Built-in Blaze template rendering via `this.render()` and <code v-pre>{{> yield}}</code> (no external layout package needed)
- Built-in Spacebars helpers (`pathFor`, `urlFor`, `param`, `queryParam`, `currentRouteName`, `isSubReady`, `isActiveRoute`, `isActivePath`)
- Support for dynamic `import()` promises and reactive subscriptions in `waitOn`
- Automatic `ROOT_URL` path prefix handling

## Defining Routes and Rendering Layouts

In a Blaze application, routes typically render a shared **layout template** (containing navigation bars, footers, or notifications) and inject a **page template** into its <code v-pre>{{> yield}}</code> region.

### 1. Create a layout and page templates

Define a layout template that includes <code v-pre>{{> yield}}</code> where the active page should appear:

```html [client/main.html]
<head>
  <title>My Meteor App</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>

<template name="App_body">
  <nav>
    <a href="{{pathFor 'App.home'}}">Home</a>
    <a href="{{pathFor 'App.about'}}">About</a>
  </nav>

  <main>
    {{> yield}}
  </main>
</template>

<template name="App_home">
  <h1>Welcome to Meteor!</h1>
  <p>This is the home page.</p>
</template>

<template name="App_about">
  <h1>About</h1>
  <p>This is the about page.</p>
</template>
```

> [!TIP]
> Because `FlowRouter` renders the layout directly into `document.body` by default, you don't need a static `<body>` tag when using a top-level layout template.

### 2. Register routes

Call `FlowRouter.route(path, options)` on the client. Inside the route's `action()` callback, call `this.render(layoutName, pageTemplateName)`:

```js [imports/startup/client/routes.js]
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

import '../../ui/layouts/body/body.js';
import '../../ui/pages/home/home.js';
import '../../ui/pages/about/about.js';

FlowRouter.route('/', {
  name: 'App.home',
  action() {
    this.render('App_body', 'App_home');
  },
});

FlowRouter.route('/about', {
  name: 'App.about',
  action() {
    this.render('App_body', 'App_about');
  },
});
```

Import this file from your client entry point (`client/main.js`) so the routes are registered at startup.

## URL Parameters and Query Strings

Routes often contain dynamic segments prefixed with `:` (such as `/lists/:_id`) and optional HTTP query strings (such as `?sort=top`).

```js
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

FlowRouter.route('/lists/:_id', {
  name: 'Lists.show',
  action(params, queryParams) {
    this.render('App_body', 'Lists_show_page');
  },
});
```

Here are example URLs matched against the pattern `'/lists/:_id'` and the resulting `params` and `queryParams`:

| URL | Matches? | `params` | `queryParams` |
| :--- | :--- | :--- | :--- |
| `/` | no | — | — |
| `/about` | no | — | — |
| `/lists/` | no | — | — |
| `/lists/eMtGij5AFESbTKfkT` | yes | <code v-pre>{ _id: "eMtGij5AFESbTKfkT" }</code> | <code v-pre>{}</code> |
| `/lists/1` | yes | <code v-pre>{ _id: "1" }</code> | <code v-pre>{}</code> |
| `/lists/1?todoSort=top` | yes | <code v-pre>{ _id: "1" }</code> | <code v-pre>{ todoSort: "top" }</code> |

Note that values in `params` and `queryParams` are always strings. If a parameter represents a number, convert it with `Number(value)` or `parseInt(value, 10)`.

### Reading route information reactively

In addition to the arguments passed to `action(params, queryParams)`, `FlowRouter` exposes reactive getters that automatically trigger a Tracker recomputation whenever their value changes:

- `FlowRouter.getRouteName()` — returns the name of the active route
- `FlowRouter.getParam(paramName)` — returns the value of a single URL parameter
- `FlowRouter.getQueryParam(key)` — returns the value of a single query string parameter
- `FlowRouter.watchPathChange()` — reactively tracks any path change

In Blaze templates, you can also read route values directly with the built-in Spacebars helpers:

```html
<p>Current route: {{currentRouteName}}</p>
<p>List ID: {{param '_id'}}</p>
<p>Sort order: {{queryParam 'todoSort'}}</p>
```

## Reactive Subscriptions and Smart Page Components

To keep your UI modular, avoid reading `FlowRouter` deep inside reusable child components. Instead, have each route render a top-level **page component** (such as `Lists_show_page`) that:

1. Reads the current route parameters reactively
2. Subscribes to the required Meteor publications inside `this.autorun()`
3. Fetches the data from Minimongo and passes it down to presentational templates

```html [imports/ui/pages/lists-show/lists-show.html]
<template name="Lists_show_page">
  {{#if Template.subscriptionsReady}}
    {{#if list}}
      {{> Lists_show list=list todos=todos}}
    {{else}}
      {{> App_notFound}}
    {{/if}}
  {{else}}
    <p>Loading list...</p>
  {{/if}}
</template>
```

```js [imports/ui/pages/lists-show/lists-show.js]
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Lists } from '../../../api/lists/lists.js';
import { Todos } from '../../../api/todos/todos.js';
import './lists-show.html';

Template.Lists_show_page.onCreated(function listsShowPageOnCreated() {
  this.getListId = () => FlowRouter.getParam('_id');

  this.autorun(() => {
    const listId = this.getListId();
    if (listId) {
      this.subscribe('lists.single', listId);
      this.subscribe('todos.inList', listId);
    }
  });
});

Template.Lists_show_page.helpers({
  list() {
    const listId = Template.instance().getListId();
    return Lists.findOne(listId);
  },
  todos() {
    const listId = Template.instance().getListId();
    return Todos.find({ listId }, { sort: { createdAt: -1 } });
  },
});
```

Because `FlowRouter.getParam('_id')` is reactive, navigating from `/lists/abc` to `/lists/xyz` automatically re-runs the `autorun` block, stops the previous subscription, subscribes to the new list ID, and updates the helpers without unmounting the layout.

## Navigating Between Routes

### Links and active route helpers in templates

`ostrio:flow-router-extra` automatically intercepts clicks on internal `<a>` tags. Use the built-in `pathFor` Spacebars helper to build URLs from a route name and parameters, and `isActiveRoute` to style the currently active link:

```html
<nav>
  <a href="{{pathFor 'App.home'}}" class="{{isActiveRoute 'App.home'}}">
    Home
  </a>
  {{#each list in lists}}
    <a
      href="{{pathFor 'Lists.show' _id=list._id}}"
      class="list-link {{isActiveRoute name='Lists.show'}}"
    >
      {{list.name}}
    </a>
  {{/each}}
</nav>
```

You can also pass query parameters or hash fragments to `pathFor`:

```html
<a href="{{pathFor 'Lists.show' _id=list._id query='todoSort=top' hash='header'}}">
  Top tasks
</a>
```

### Navigating programmatically

When you need to change routes in response to an event or after a Meteor method completes, call `FlowRouter.go()`:

```js
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

Template.App_body.events({
  async 'click .js-new-list'() {
    try {
      const listId = await Meteor.callAsync('lists.insert');
      FlowRouter.go('Lists.show', { _id: listId });
    } catch (error) {
      console.error('Failed to create list:', error);
    }
  },
});
```

To update only the current route's parameters or query parameters without changing the route name, use `FlowRouter.setParams()` or `FlowRouter.setQueryParams()`:

```js
// Set or update ?todoSort=top
FlowRouter.setQueryParams({ todoSort: 'top' });

// Remove a query parameter by setting it to null
FlowRouter.setQueryParams({ todoSort: null });
```

### Storing complex data in the URL

If you need to store structured data (such as dates or nested filter objects) in a query parameter, serialize it with `EJSON`:

```js
import { EJSON } from 'meteor/ejson';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

// Write to the URL
FlowRouter.setQueryParams({
  filter: EJSON.stringify(filterObject),
});

// Read back from the URL
const raw = FlowRouter.getQueryParam('filter');
const filter = raw ? EJSON.parse(raw) : null;
```

## Authentication and Protected Routes

There are two common ways to restrict access to authenticated users in Blaze.

### Option 1: Route enter triggers (`triggersEnter`)

Use a `triggersEnter` function on protected routes (or route groups) to redirect unauthenticated users to `/login`:

```js
import { Meteor } from 'meteor/meteor';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

const requireLogin = (context, redirect) => {
  if (!Meteor.userId() && !Meteor.loggingIn()) {
    redirect('/login');
  }
};

FlowRouter.route('/settings', {
  name: 'App.settings',
  triggersEnter: [requireLogin],
  action() {
    this.render('App_body', 'App_settings');
  },
});
```

You can also apply a trigger to a group of routes with `FlowRouter.group()`:

```js
const adminRoutes = FlowRouter.group({
  prefix: '/admin',
  name: 'admin',
  triggersEnter: [requireLogin],
});

adminRoutes.route('/users', {
  name: 'Admin.users',
  action() {
    this.render('App_body', 'Admin_users');
  },
});
```

### Option 2: Blaze block helper wrapper

Because authentication state (`Meteor.userId()` and `Meteor.loggingIn()`) is reactive, handling auth inside the template hierarchy ensures the view updates immediately if a user logs out in another tab:

```html
<template name="App_forceLoggedIn">
  {{#if loggingIn}}
    <p>Checking session...</p>
  {{else}}
    {{#if currentUser}}
      {{> Template.contentBlock}}
    {{else}}
      {{> App_login}}
    {{/if}}
  {{/if}}
</template>

<template name="App_settings">
  {{#App_forceLoggedIn}}
    <h1>Account Settings</h1>
    <!-- Protected content -->
  {{/App_forceLoggedIn}}
</template>
```

For handling password reset, email verification, and enrollment links with a client-side router, see [Accounts Router Integration](/api/accounts#router-integration).

## Advanced Routing

### Code splitting with dynamic `import()` and `waitOn`

To keep your initial client bundle small, load heavy page templates and their npm dependencies on demand inside the route's `waitOn()` hook:

```js
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

FlowRouter.route('/analytics', {
  name: 'App.analytics',
  waitOn() {
    return import('../../ui/pages/analytics/analytics.js');
  },
  whileWaiting() {
    this.render('App_body', 'App_loading');
  },
  action() {
    this.render('App_body', 'App_analytics');
  },
});
```

`FlowRouter` waits for the dynamic `import()` promise to resolve before calling `action()`, and renders `whileWaiting()` in the meantime.

### Missing pages (404)

Register a catch-all wildcard route (`'*'`) to render a 404 page whenever a URL does not match any declared route:

```js
FlowRouter.route('*', {
  name: 'App.notFound',
  action() {
    this.render('App_body', 'App_notFound');
  },
});
```

> [!WARNING]
> Always use `FlowRouter.route('*', ...)` for catch-all 404 routes. The legacy `FlowRouter.notFound = { ... }` property is deprecated in `ostrio:flow-router-extra`.

## Server-Side HTTP Routing

While client routes render Blaze templates in the browser, you may also need server-side HTTP endpoints for webhooks, file downloads, or REST APIs.

In Meteor 3, the [`webapp`](/packages/webapp) package embeds **Express 5** directly via `WebApp.handlers` and `WebApp.express`:

```js [server/http-routes.js]
import { WebApp } from 'meteor/webapp';

const apiRouter = WebApp.express.Router();
apiRouter.use(WebApp.express.json());

apiRouter.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

apiRouter.post('/webhooks/stripe', async (req, res) => {
  // Process webhook payload
  res.sendStatus(200);
});

WebApp.handlers.use('/api', apiRouter);
```

To authenticate HTTP routes with Meteor user accounts, see the [`accounts-express`](/packages/accounts-express) package.

> [!NOTE]
> Any HTTP request that is not answered by a `WebApp.handlers` route falls through to Meteor's client app shell, where `FlowRouter` takes over in the browser and matches the URL against your client-side routes.
