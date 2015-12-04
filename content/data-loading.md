---
title: Publications and Data Loading
---

After reading this guide, you'll know:

1. What publications and subscriptions are in the Meteor framework
2. How to define a publication on the server
3. Where to subscribe on the client and in which template
4. Useful patterns to follow to subscribe sensibly and help users understand the state of subscriptions.
5. How to create publish sets of related data in a reactive way.
6. How to ensure your publication is properly authorized in a reactive way.
7. How to use the low-level publish API to publish anything.
8. How to turn a 3rd-party REST endpoint into a publication.
9. How to turn a publication into your app into a REST endpoint.

## Publications and Subscriptions

Unlike in Meteor, a traditional web application communicates between client and server in a "request-response" fashion. Typically the client makes RESTful HTTP requests to the server and receives data (either in pre-rendered HTML, or perhaps some on-the-wire data format) in response. However there's no way for the server to "push" data to the client when changes happen at the backend.

Meteor however is built from the ground up on the Distributed Data Protocol (DDP) to allow data transfer in both directions. So (although you can), building a Meteor app doesn't require fashion REST endpoints to serialize and send data. Instead you create *publication* endpoints to push data from server to client.

In Meteor a **publication** is a named API on the server that constructs a set of data to send to a client. A client creates a **subscription** which connects to a publication, and receives that data. That set of data consists of an initial stream of data as it stands at subscription-time, and then,over time a set of updates as that data set changes.

So a subscription is a set of data that changes over time. Typically, the net result of this is that a subscription "bridges" a server collection (which as described in the "Collections" article, corresponds closely with a Mongo collection), and the client side Minimongo cache of that data. You can think of a subscription a pipe that connects a subset of the true collection with the clients version, but that constantly keeps it up to date with the latest information on the server.

## Defining a publication

A publication should be defined in a server-only file. For instance, in the Todos example app, we want to publish the set of public lists to all users:

```js
Meteor.publish('lists/public', function() {
  return Lists.find({userId: {$exists: false}});
});
```

There are a few things to understand about this code block. Firstly, we've named the publication `lists/public`, and that will be how we access it from the client. Secondly, we are simply returning a Mongo *cursor* from the publication function.

What that means is that the publication will simply ensure the set of data matching that query is available to any client that subscribes to it. In this case, all lists that do not have a `userId` setting. So the collection named `'Lists'` on the client (which we called `Lists` of course) will have all of the public lists that are available in the server collection named `'Lists'` whilst that subscription is open (which is all the time in our example app).

There are two types of parameters of a publish function. Firstly, a publication always has the current user's `id` available at `this.userId` (this is why we use the `function() {}` form for publications rather than the ecmascript `() => {}`. You can disable the linting rule for publication files with `eslint-disable prefer-arrow-callback`).

```js
Meteor.publish('lists/private', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Lists.find({userId: this.userId});
});
```

What this means is that the above publication can be confident (thanks to Meteor's accounts system) that it will only ever publish private lists to the user that they belong to. Note also that the publication will re-run if the user logs out (or back in again), which means that the published set of private lists will reflect this.

In the case of a non-logged in user, we explicitly call `this.ready()`, which indicates to the subscription that we've sent all the data we are initially going to send (in this case none). It's important to know that if you don't return a cursor from the publication or call `this.ready()`, the user's subscription will never become ready, and they will likely see a loading state forever.

The other type of publication argument is a simple named argument:

```js
Meteor.publish('list/todos', function(listId) {
  // We always need to check the `listId` is the type we expect
  check(listId, String);

  ...
});
```

When we create a subscription to this piblication on the client, we can provide this argument via the `Meteor.subscribe()` call:

```js
Meteor.subscribe('list/todos', list._id);
```

### Organizing Publications

It makes sense to place a publication in a package alongside the feature that it's targeted. For instance, sometimes publications provide very specific data that's only really useful for the view that they are developed for. In that case, placing the publication in the same package as the view code makes perfect sense.

Often, however, a publication is more general. For example in the Todos example application, we create a `list/todos` publication, which publishes all the todos in a list. Although in the application we only use this in one place (in the `listsShow` template), in a larger app, there's a good chance we might need to access all the todos for a list in other places. So putting the publication in the `todos` package is a sensible approach.

## Using publications: Subscriptions

To use publications, you need to create a subscription to it on the client. To do so, you call `Meteor.subscribe()` with the name of the publication. When you do this, it opens up a subscription to that publication, and the server starts sending data down the wire to ensure that your client collections contain up to date copies of the data that's pushed by the publication.

Also, `Meteor.subscribe()` returns a "subscription handle", with a property called `.ready()` defined -- a reactive function that returns `true` when the publication becomes ready (either you call `this.ready()` explicitly, or the current contents of a returned cursor are sent over).


### Organizing Subscriptions

It is best to place the subscription as close as possible to the place where the data from the subscription is needed. This reduces "action at a distance" and makes it easier to understand the flow of data through your application. If the subscription and fetch are separated, then it's not always clear how and why changes to the subscriptions (such as changing arguments), will affect the contents of the cursor.

What this means in practice is that you should place your subscription calls in *templates*. In Blaze, it's best to do this in the `onCreated()` callback:

```js
Template.listsShowPage.onCreated(function() {
  this.state = new ReactiveDict();
  this.autorun(() => {
    const listId = FlowRouter.getParam('_id');
    this.state.set({listId});
    this.subscribe('list/todos', listId);
  });
});
```

In this code snippet we can see two important techniques for subscribing in Blaze templates:

1. Calling `this.subscribe()` (rather than `Meteor.subscribe`), which attaches a special `this.subscriptionsReady()` function to the template instance, which is true when this and other subscriptions are ready.

2. Calling `this.autorun` sets up a reactive context which will re-initialize the subscription whenever the reactive variable `this.state.get('listId')` changes.

### Fetching subscription data

Subscribing to data puts it in your client-side collections. To use the data in your templates, you need to query those collections for that data. There are a few important rules of thumb when doing this.

1. Always use the same query to fetch the data from the collection that you use to publish it.

  If you don't do this, then you open yourself up to problem if another subscription pushes data into the same collection. Although you may be confident that this is not the case, in an actively developed application, it's impossible to anticipate what may change in the future and this can be a source of hard to understand bugs.

  Also, when changing subscriptions, there is a brief period where both subscriptions are loaded (see "Publication behaviour when changing arguments" below), so when doing thing like pagination, it's exceedingly likely that this will be the case.

2. Fetch the data as close as possible to where you subscribe to it.

  We do this for the same reason we subscribe in the template in the first place -- to avoid action at a distance and to make it easier to understand where data comes from. A common pattern is to fetch the data in a parent template, and then pass it into a "pure" child template, as we'll see in in the {% post_link ui-ux "UI/UX Article"%}.

  Note that there are some exceptions to this second rule. A common one is `Meteor.user()`---although this is strictly speaking subscribed to (automatically usually), it's typically over-complicated to pass it through the template heirarchy as an argument to each template. Although you could do this if you want to be "pure" about everything, and it's best not to use it in too many places as it makes templates harder to test.

### Global subscriptions

One place where you might be tempted to not subscribe inside a template is when it accesses data that you know you *always* need. For instance, a subscription to extra fields on the user object (see the {% post_link accounts "Accounts Article" %}) that you need on every screen of your app.

However, it's generally a good idea to use a layout template (which you wrap all your templates in) to subscribe to this subscription anyway. It's better to be consistent about such things, and it makes for a more flexible system if you ever decide you have a screen that *doesn't* need that data.


## Patterns for data loading

Across Meteor applications, there are some common patterns of data loading and and management on the client side that are worth knowing. We'll go into more detail about some of these in the {% post_link ui-ux "UI/UX Article" %}.

### Subscription readiness

A key thing to keep in mind is that a subscription will not instantly provide it's data. There'll be a latency between subscribing to the data on the client and it arriving from the publication on the server (and keep in that this time may be a lot longer for your users in production that for you locally in development!)

Although the Tracker system means you often don't *need* to think too much about this in building your apps, usually if you want to get the user experience right, you'll need to know when the data is ready.

To find that out, `Meteor.subscribe()` and (`this.subscribe()` in templates) returns a "subscription handle", which contains a reactive data source called `.ready()`:

```js
const handle = Meteor.subscribe('lists/public');
Tracker.autorun(() => {
  console.log(`Handle is ${handle.ready() ? 'ready' : 'not ready'}`);  
});
```

We can use this information to be more subtle about when we try and show data to users, and when we show a loading screen.

### Reactively changing subscription arguments

We've seen an example already of using an `autorun` to re-subscribe when the (reactive) arguments to a subscription change. It's worth digging in a little more detail to understand what happens in this scenario.

```js
Template.listsShowPage.onCreated(function() {
  this.state = new ReactiveDict();
  this.autorun(() => {
    this.state.set('listId', FlowRouter.getParam('_id'));
    this.subscribe('list/todos', this.state.get('listId'));
  });
});
```

In our example, the `autorun` will re-run whenever `this.state.get('listId')` changes, (ultimately because `FlowRouter.getParam('_id')` changes), although other common reactive data sources are:

1. Template data contexts (which you can access reactively with `Template.currentData()`)
2. The current user status (`Meteor.user()` and `Meteor.loggingIn()`)
3. The contents of other application specific client data stores.

Technically, what happens when one of these reactive sources changes is the following:

1. The reactive data source *invalidates* the autorun computation (marks it so that it re-runs in the next Tracker flush cycle).
2. The subscription detects this, and given that anything is possible in next computation run, marks itself for destruction.
3. The computation re-runs, with `.subscribe()` being re-called either with new or different arguments.
4. If the subscription is run with the *same arguments* then the "new" subscription discovers the old "marked for destruction" subscription that sitting around, with the same data already ready, and simply reuses that.
5. If the subscription is run with *different arguments*, then a new subscription is created, which connects to the publication on the server
6. At the end of the flush cycle (i.e. after the computation is done re-running), the old subscription checks to see if it was re-used, and if not, sends a message to the server to tell the server to shut it down.

The important detail in the above is in 4---that they system cleverly knows not to re-subscribe if the autorun re-runs and subscribes with the exact same arguments. This holds true even if the new subscription is set up somewhere else in the template heirarchy.

For instance if a user navigates between two pages that both subscribe to the exact same subscription, the same mechanism will kick in and no unnecessarily subscribing will happen.

### Publication behaviour when changing arguments

It's also worth knowing a little about what happens on the server when the new subscription is started and the old one is stopped.

The server *explicitly* waits until all the data is sent down (the new subscription is ready) for the new subscription before removing the data from the old subscription. The idea here is to avoid flicker -- you can, if desired, continue to show the old subscription's data until the new data is ready, then instantly switch over to the new subscription's complete data set.

What this means is in general, when changing subscriptions, there'll be a period where you are *over-subscribed* and there is more data on the client than you strictly asked for. This is one very important reason why you should always fetch the same data that you have subscribed to (don't "over-fetch").

### Paginating subscriptions

A very common pattern of data access is pagination. This refers to the practice of fetching a ordered list of data one "page" at a time --- typically some number of items, say twenty.

There are two styles of pagination that are commonly used, a "page-by-page" style---where you show only one page of results at a time, starting at some offset (which the user can control), and "infinite-scroll" style, where you show and increasing number of pages of items, as the user moves through the list (this is the typical "feed" style user interface).

Let's consider a publication/subscription technique for the second (the first technique is a little tricker to handle, due to it being difficult to calculate the offset on the client. If you need to do so, you can follow many of the same techniques that we use here and use the [`percolate:find-from-publication`](https://atmospherejs.com/percolate/find-from-publication) package to keep track of which records have come from your publication).

In an infinite scroll publication, we simply need to add a new argument to our publication controlling how many items to load. Suppose we wanted to paginate the todo items in our Todos example app:

```js
const MAX_TODOS = 1000;

Meteor.publish('list/todos', function(listId, limit) {
  check(listId, String);
  check(limit, Number);

  const options = {
    sort: {createdAt: -1},
    limit: Math.min(limit, MAX_TODOS)
  };

  ...
});
```

It's important that we set a `sort` parameter on our query (after, which first `limit` todos do we want?), and that we set an absolute maximum on the number of items a user can request (at least in the case where lists can grow without bound).

Then on the client side, we'd some kind of reactive state variable to control how many items to request:

```js
Template.listsShowPage.onCreated(function() {
  this.state = new ReactiveDict();
  this.autorun(() => {
    this.state.set('listId', FlowRouter.getParam('_id'));
    this.subscribe('list/todos', this.state.get('listId'), this.state.get('requestedTodos'));
  });
});
```

We'd increment that `requestedTodos` variable when the user clicks "load more" (or perhaps just when they scroll to the bottom of the page).

Once piece of information that's very useful to know when paginating data is the *total number of items* that you could see. The `[tmeasday:publish-counts](https://atmospherejs.com/tmeasday/publish-counts)` can be useful to publish this. We could add a `/list/todoCount` publication like so

```js
Meteor.publish('list/todoCount', function(listId) {
  check(listId, String);

  Counts.publish(this, `list/todoCount${listId}`, Todos.find({listId}));
});
```

Then on the client, after subscribing to that publication, we can access the count with `Counts.get(`list/todoCount${listId}`)`.

## Client-side data management: Stores

In Meteor, persistent or shared data comes over the wire on publications. However, there are some types of data which doesn't need to be persistent or shared between users. For instance, the "logged-in-ness" of the current user, or the route they are currently viewing.

Although client-side state is often best contained as state of an individual template (and passed down the template heirarchy as arguments where necessary), sometimes you have a need for "global" state that is shared between unrelated sections of the template heirarchy.

Usually such state is stored in a *global singleton* object which we can call a store. A singleton is a data structure of which only a single copy logically exists. The current user and the router from above are typical examples of such global singletons.

### Types of stores

In Meteor, it's best to make stores *reactive data* sources, as that way they tie most naturally into the rest of the ecosystem. There are a few different packages you can use for stores.

If the store is single-dimensional, you can probably use a `ReactiveVar` to store it (provided by the `reactive-var` package). A `ReactiveVar` has two properties, `get()` and `set()`:

```js
DocumentHidden = new ReactiveVar(document.hidden);
$(window).on('visibilitychange', (event) => {
  DocumentHidden.set(document.hidden);
});
```

If the store is multi-dimensional, you may want to use a `ReactiveDict` (from the `reactive-dict` package):

```js
const $window = $(window);
function getDimensions() {
  return {
    width: $window.width(),
    height: $window.height()
  };
};

WindowSize = new ReactiveDict(getDimensions());
$window.on('resize', () => {
  WindowSize.set(getDimensions());
});
```

The advantage of a `ReactiveDict` is you can access each property individually (`WindowSize.get('width')`), and the dict will diff the field and track changes on it individually (so your template will re-render less often for instance).

If you need to query the store, or store many related items, it's probably a good idea to use a Local Collection (see the {% page_link collections "Collections Article" %}.

### Accessing stores

You should access stores in the same way you'd access other reactive data in your templates---that means centralizing your store access, much like you centralize your subscribing and data fetch. For a Blaze template, that's either in a helper, or from within a `this.autorun()` inside an `onCreated()` callback.

This way you get the full reactive power of the store.

### Updating stores

If you need to update a store from as a result of user action, you'd update the store from an event handler, just like you call Methods.

If you need to perform complex logic in the update (i.e. not just call `.set()` etc), it's a good idea to define a mutator on the store. As the store is a singleton, you can just attach a function to the object directly:

```js
WindowSize.simulateMobile = (device) => {
  if (device === 'iphone6s') {
    this.set({width: 750, height: 1334});
  }
}
```

## Publishing Relational Data

It's common to need a related sets of data from multiple collections on a given page. For instance, in the Todos app, when we render a todo list, we want the list itself, as well as the set of todos that belong to that list.

One way you might do this is to return more than one cursor from your publication function:

```js
Meteor.publish('list/todos', function(listId) {
  check(listId, String);

  const list = List.findOne(listId);

  if (list && (!list.userId || list.userId === this.userId)) {
    return [
      Lists.find(listId),
      Todos.find({listId});
    ];
  } else {
    // The list doesn't exist, or the user isn't allowed to see it. In either case,
    //   make it appear like there is no list.
    return this.ready();
  }
});
```

However, this example will not work as you might expect. The reason is that reactivity doesn't work in the same way on the server as it does on the client. On the client, if *anything* in a reactive function changes, the whole function will re-run, and the results are fairly intuitive.

On the server however, the reactivity is limited to the behaviour of the cursors you return from your publish functions. You'll see any changes to the data that matches their queries, but *their queries will never change*.

So in the case above, if a user subscribes to a list that is later made private by another user, although the `list.userId` will change to a value that no longer passes the condition, the body of the publication will not re-run, and so the query to the `Todos` collection (`{listId}`) will not change. So the first user will continue to see items they shouldn't.

However, we can write publications that are properly reactive to changes across collections. To do this, we use the [`reywood:publish-composite`](https://atmospherejs.com/reywood/publish-composite) package.

The way this package works is to first establish a cursor on one collection, and then explicitly set up a second level of cursors on a second collection with the results of the first cursor.

```js
Meteor.publishComposite('list/todos', function(listId) {
  check(listId, String);

  const userId = this.userId;
  return {
    find() {
      const query = {
        _id: listId,
        $or: [{userId: {$exists: false}}, {userId}]
      };

      return Lists.find(query);
    },
    children: [{
      find(list) {
        return Todos.find({listId: list._id});
      }
    }]
  };
});
```

In this example, we write a complicated query to make sure that we only ever find a list if we are allowed to see it, then, once per list we find (which can be one or zero times depending on access), we publish the todos for that list. Publish Composite takes care of stopping and starting the dependent cursors if the list stops matching the original query or otherwise.

## Complex Authorization in publications

We can also use `publish-composite` to perform complex authorization in publications. For instance, consider if we had a `admin/list/todos` publication that allowed an admin to bypass default publication's security for users with an `admin` flag set.

We might want to write:

```js
Meteor.publish('admin/list/todos', function(listId) {
  check(listId, String);

  const user = Meteor.users.findOne(this.userId);

  if (user && user.admin) {
    return [
      Lists.find(listId),
      Todos.find({listId});
    ];
  } else {
    return this.ready();
  }
});
```

However, due to the same reasons discussed above, the publication *will not re-run* if the user's `admin` status changes. If this is something that is likely to happen and reactive changes are needed, then we'll need to make the publication reactive. We can do this via the same technique as above however:

```js
Meteor.publishComposite('admin/list/todos', function(listId) {
  check(listId, String);

  const userId = this.userId;
  return {
    find() {
      return Meteor.users.find({userId, admin: true});
    },
    children: [{
      find() {
        return [
          Lists.find(listId),
          Todos.find({listId});
        ];
      }  
    }]
  };
});
```

## Writing custom publications with the low level publish API

In all of our examples so far (outside of using`Meteor.publishComposite()`) we've returned a cursor from our `Meteor.publish()` handlers. Doing this ensures Meteor takes care of the job of keeping the contents of that cursor in sync between the server and the client. However, there's another API you can use for publish functions which is closer to the way the underlying Distributed Data Protocol (DDP) works.

DDP uses three main messages to communicate changes in the data for a publication: the `added`, `updated` and `removed` messages. So, we can simiarly do the same for a publication:

```js
Meteor.publish('custom-publication', function() {
  // We can add documents one at a time
  this.added('collection-name', 'id', {field: 'values'});

  // We can call ready to indicate to the client that the initial document sent has been sent
  this.ready();

  // We may respond to some 3rd party event and want to send notifications
  Meteor.setTimeout(() => {
    // If we want to modify a document that we've already added
    this.updated('collection-name', 'id', {field: 'new-value'});

    // Or if we don't want the client to see it any more
    this.removed('collection-name', 'id');
  });

  // It's very important to clean up things in the subscription's onStop handler
  this.onStop(() => {
    // Perhaps kill the connection with the 3rd party server
  });
});
```

Data published like this, from the client's perspective doesn't look any different -- there's actually no way for the client to know the difference as the DDP messages are the same. So even if you are connecting to, and mirroring, some esoteric data source, on the client it'll appear like any other Mongo collection.

One point to be aware of is that if you allow the user to *modify* data in the "psuedo-collection" you are publishing in this fashion, you'll want to be sure to re-publish the modifications to them via the publication.


## Turning a REST endpoint into a publication

As a concrete example of using the low-level API, consider the situation where you have some 3rd party REST endpoint which provides a changing set of data that's valuable to your users. How do you make that data available to your users?

One option would be to provide a Method that simply proxies through to the endpoint, for which it's the client's responsibility to poll and deal with the changing data as it comes in. So then it's the clients problem to deal with keeping a local data cache of the data, updating the UI when changes happen, etc etc. Although this is possible (you could use a Local Collection to store the polled data in, for instance), it's simpler, and more natural to create a publication that does this polling for the client.

A pattern for turning a polled REST endpoint looks something like this:

```js
const POLL_INTERVAL = 5000;

Meteor.publish('polled-publication', function() {
  const publishedKeys = {};

  const poll = () => {
    // Let's assume the data comes back as an array of JSON documents, with an _id field, for simplicity
    const data = HTTP.get(REST_URL, REST_OPTIONS);

    _.each(data, (doc) => {
      if (publishedKeys(doc._id)) {
        this.updated(COLLECTION_NAME, doc._id, doc);
      } else {
        publishedKeys[doc._id] = true;
        if (publishedKeys(doc._id)) {
          this.added(COLLECTION_NAME, doc._id, doc);
        }
      }
    });
  };

  poll();
  this.ready();

  const interval = Meteor.setInterval(poll, POLL_INTERVAL);

  this.onStop(() => {
    Meteor.clearInterval(interval);
  });
});
```

Things can get more complicated; for instance you may want to deal with documents being removed, or share the polling between multiple users (in a case where the data being polled isn't private to that user).


## Turning a publication into a REST endpoint

The alternate scenario occurs when you want to publish data to be consumed by a 3rd party, typically over REST. If the data we want to publish is the same as what we already publish via a publication, then we can use the [simple:rest](https://atmospherejs.com/simple/rest) package to do this really easily.

In the Todos example app, we have done this, and you can now access our publications over HTTP:

```bash
$ curl localhost:3000/publications/lists/public
{
  "Lists": [
    {
      "_id": "rBt5iZQnDpRxypu68",
      "name": "Meteor Principles",
      "incompleteCount": 7
    },
    {
      "_id": "Qzc2FjjcfzDy3GdsG",
      "name": "Languages",
      "incompleteCount": 9
    },
    {
      "_id": "TXfWkSkoMy6NByGNL",
      "name": "Favorite Scientists",
      "incompleteCount": 6
    }
  ]
}
```

You can also access authenticated publications (such as `lists/private`). Suppose we've signed up (via the web UI) as `user@example.com`, with the password `password`, and created a private list. Then we can access it as follows:

```bash
# First, we need to "login" on the commandline to get an access token
$ curl localhost:3000/users/login  -H "Content-Type: application/json" --data '{"email": "user@example.com", "password": "password"}'
{
  "id": "wq5oLMLi2KMHy5rR6",
  "token": "6PN4EIlwxuVua9PFoaImEP9qzysY64zM6AfpBJCE6bs",
  "tokenExpires": "2016-02-21T02:27:19.425Z"
}

# Then, we can make an authenticated API call
$ curl localhost:3000/publications/lists/private -H "Authorization: Bearer 6PN4EIlwxuVua9PFoaImEP9qzysY64zM6AfpBJCE6bs"
{
  "Lists": [
    {
      "_id": "92XAn3rWhjmPEga4P",
      "name": "My Private List",
      "incompleteCount": 5,
      "userId": "wq5oLMLi2KMHy5rR6"
    }
  ]
}
```
