---
title: Data Loading and Management
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

In the case of a non-logged in user, we explicitly call `this.ready()`, which indicates to the subscription that we've sent all the data we are initially going to send (in this case none).

The other type of publication argument is a simple named argument:

```js
Meteor.publish('list/todos', function(listId) {
  check(listId, String);

  ...
});
```

When we create a subscription to this piblication on the client, we can provide this argument via the `Meteor.subscribe()` call:

```js
Meteor.subscribe('list/todos', list._id);
```

Also note that we are careful to check the `listId` is a string as we expect, as described in the Security article.

### Organizing Publications

It makes sense to place a publication in a package alongside the feature that it's targeted. For instance, sometimes publications provide very specific data that's only really useful for the view that they are developed for. In that case, placing the publication in the same package as the view code makes perfect sense.

Often, however, a publication is more general. For example in the Todos example application, we create a `list/todos` publication, which publishes all the todos in a list. Although in the application we only use this in one place (in the `listsShow` template), in a larger app, there's a good chance we might need to access all the todos for a list in other places. So putting the publication in the `todos` package is a sensible approach.

## Using publications: Subscriptions

To use publications, you need to create a subscription to it on the client. To do so, you call `Meteor.subscribe()` with the name of the publication. When you do this, it opens up a subscription to that publication, and the server starts sending data down the wire to ensure that your client collections contain up to date copies of the data that's pushed by the publication.

### Organizing Subscriptions

It is best to place the subscription as close as possible to the place where the data from the subscription is needed. This reduces "action at a distance" and makes it easier to understand the flow of data through your application.

What this means in practice is that you should place your subscription calls in *templates*. In Blaze, it's best to do this in the `onCreated()` callback:

```js
Template.listsShowPage.onCreated(function() {
  this.state = new ReactiveDict();
  this.autorun(() => {
    this.state.set('listId', FlowRouter.getParam('_id'));
    this.subscribe('list/todos', this.state.get('listId'));
  });
});
```

In this code snippet we can see two important techniques for subscribing in Blaze templates:

1. Calling `this.subscribe()` (rather than `Meteor.subscribe`) means that the subscription will automatically get torn down when the template is taken off the screen.

2. Calling `this.autorun` sets up a reactive context which will re-initialize the subscription whenever the reactive variable `this.state.get('listId')` changes.

### Fetching subscription data

Once you've subscribed to a set of data, you then need to query the client collections to fetch the data again. There are a few important rules of thumb when doing this.

1. Always use the same query to fetch the data from the collection that you use to publish it. 

  If you don't do this, then you open yourself up to problem if another subscription pushes data into the same collection. Although you may be confident that this is not the case, in an actively developed application, it's impossible to anticipate what may change in the future and this can be a source of hard to understand bugs.

2. Fetch the data as close as possible to where you subscribe to it.

  We do this for the same reason we subscribe in the template in the first place -- to avoid action at a distance and to make it easier to understand where data comes from. A common pattern is to fetch the data in a parent template, and then pass it into a "pure" child template, as we'll see in in the {% post_link ui-ux "UI/UX Article"%}.

  Note that there are some exceptions to this second rule. A common one is `Meteor.user()`---although this is strictly speaking subscribed to (automatically usually), it's typically over-complicated to pass it through the template heirarchy as an argument to each template (although you could do this if you want to be "pure" about everything). 

  A second exception is sometimes in Blaze when you want to be more performant by controlling re-renderings. As an example in the Todos example application, although we subscribe to the `lists/todos` publication in the `listShowPage`, we don't actually fetch the todos further down the template heirarchy, in order to avoid the todos rendering too much when properties of the list change.

### Global subscriptions

One place where you might be tempted to not subscribe to a subscription is when it accesses data that you know you *always* need. For instance, a subscription to extra fields on the user object (see the {% post_link accounts "Accounts Article" %}) that you need on every screen of your app.

However, it's generally a good idea to use a layout template (which you wrap all your templates in) to subscribe to this subscription anyway. It's better to be consistent about such things, and it makes for a more flexible system if you ever decide you have a screen that *doesn't* need that data.


# OUTLINE

1. Publications + Subscriptions
  1. What are they? - compare REST endpoint
  2. How do they work? - talk about bridging data from server-client collections
  3. What's a pub / what's a sub
2. Defining a publication on the server
  1. Rules around what arguments it should take
  2. Where should it go? (which package -- depends on universality)
3. Subscribing on the client
  1. Subscriptions should be initiated by templates/components that need the data
  2. Retrieve the data from the sub at the same point as subscribing, pass down and filter via `cursor-utils`
  3. Global required data should be subscribed by an always there "layout" template
4. Data loading patterns
  4. Monitoring subscription readiness + errors
    1. Using `Template.subscriptionsReady`
    2. Passing subscription readiness into sub-components alongside data (see UI/UX chapter)
  5. Subscriptions + changing inputs, how autoruns can help.
    1. Basic techniques using `this.autorun`/other reactive contexts and `Template.currentData()`/other reactive sources
    2. How it works
      1. The subscription realizes it's called from within a reactive context
      2. When invalidated, subscription marks itself invalid
      3. When re-running, if re-run with the same arguments, the sub is a no-op
      4. Otherwise the new sub starts, *goes ready*, then the old sub is stopped.
  6. Paginating subscription data -- combining the above
    1. A basic paginated publication
    2. A publication that returns a count
    3. Passing pagination info into a template/component
      1. `totalCount`, `requested`, `currentItems`
    4. Passing a `loadMore` callback into a template/component, using it to increment `requested`.
5. Other data -- global client only data # NOTE LIVES SOMEWHERE ELSE I GUESS?
  1. Concept of a "store"
  2. Types of store:
    1. If it's a single dimension, use a reactive var
    2. If it's a few dimensions (or you need HCR), use a named reactive dict
    3. If you need to query it, use a local collection.
  3. How to listen to a store (autorun / helper / getMeteorData / angular version?)
  4. How to update a store:
    1. Built in APIs
    2. Adding APIs to stores via `XStore.foo = () => {}` (they are singletons, so no need to make class)
6. Publishing relational data
  1. Common misconceptions about publication reactivity + naive implementation
    1. There's no reactivity in a publish function apart from:
      1. `userId`
      2. The way that `publishCursor` works.
  2. Using publish-composite to get it done the way you'd expect.
7. Complex authorization in publications
  1. Is kind of impossible to do correctly - https://github.com/meteor/meteor/issues/5529 (unelss we recommend a fully reactive publish solution, which we don't)
8. The low-level publish API
  1. Custom publication patterns - how to decouple your backend data format from your frontend (if you want!)
  2. Be super careful about leaking!! (How to detect this, perf article)
9. Turning pubs into REST endpoints (via `simple:rest`)
10. Turning REST endpoints into pubs via `poll-publish`