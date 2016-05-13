---
title: Apollo
order: 15
description: The Apollo data stack for Reactive GraphQL
discourseTopicId: TODO
---

<h2 id="introduction">Introduction</h2>

Apollo is Meteor's next-generation data stack, built with GraphQL. While it doesn't yet have all the features that Meteor's pub/sub system has, it provides a way to get data from any database – not just MongoDB.

- [Apollo docs](http://docs.apollostack.com/)
- [Including Apollo in Meteor](http://docs.apollostack.com/apollo-client/meteor.html#Using-Express-with-WebApp)
- Using Meteor Accounts with Apollo: [on the client](http://docs.apollostack.com/apollo-client/meteor.html#Using-with-Meteor-Accounts) and [on the server](http://docs.apollostack.com/apollo-client/meteor.html#Getting-the-current-user)

<h3 id="client">Apollo Client</h3>

[Apollo client docs](http://docs.apollostack.com/apollo-client/index.html)

<h4 id="getting-data">Getting data</h4>

Instead of calling `Meteor.subscribe`, you have two choices:

- [`query`](http://docs.apollostack.com/apollo-client/core.html#query): fetches data a single time
- [`watchQuery`](http://docs.apollostack.com/apollo-client/core.html#watchQuery): fetches data and then keeps it up-to-date

Both functions store the results in a client-side cache called [Redux](http://redux.js.org/) (the pub/sub parallel is [Minimongo](http://guide.meteor.com/collections.html#client-collections)).

These functions also take the place of client-side `Collection` queries like `Meteor.users.find()`. With `query`, the results are returned to you, and with `watchQuery`, you provide a function that's called when there's new data.

Currently `watchQuery` is implemented with polling, which isn't as instant as a Oplog-backed websocket subscription. However, pushing changes instantly from the server is in the plans.

<h4 id="changing-data">Changing data</h4>

Instead of calling a Meteor method with `Meteor.call`, you use a function called [`mutate`](http://docs.apollostack.com/apollo-client/core.html#mutate) to run a *mutator*, which is GraphQL's equivalent to a method.

Currently mutators are only run on the server, but running them client-side on the cache (as Meteor methods are) is in the plans.

<h4 id="view-layers">View layers</h4>

Apollo currently has integrations with [React](http://docs.apollostack.com/apollo-client/react.html) and [Angular](http://docs.apollostack.com/apollo-client/angular2.html), and an integration with Blaze is planned.

<h3 id="server">Apollo Server</h3>

[Apollo server docs](http://docs.apollostack.com/apollo-server/index.html)

<h4 id="getting-data-server">Getting data</h4>

Instead of using `Meteor.publish` to define publications, you write [resolve functions](http://docs.apollostack.com/apollo-server/resolvers.html) – called *resolvers* – that fetch different types of data in the query.

<h4 id="changing-data-server">Changing data</h4>

Instead of using `Meteor.methods` to define methods, you write [mutators](TODO) – functions that *mutate* (change) data.

<h3 id="graphql">GraphQL</h3>

GraphQL is a query language for apps to get the data they want. Instead of the server deciding what's in a publication, the client uses GraphQL to say exactly which fields of which objects it wants. 

- [Intro to GraphQL](https://medium.com/apollo-stack/the-basics-of-graphql-in-5-links-9e1dc4cac055)
- [GraphQL coming from REST](https://medium.com/apollo-stack/how-do-i-graphql-2fcabfc94a01#.pfdj5bxxj)

<h3 id="advanced">Advanced<h3>

<h4></h4>

section on being more transparent and configurable?

<h4 id="performance">Performance<h4>

Lower CPU and memory usage on app servers because instead of mergebox and diffing and oplog handling, much work is offloaded to the invalidation server and the client, which knows it's own state (which versions of what data)?

<h4 id="hydration">Hydration<h4>

Easy b/c Redux

<h4></h4>

Anything else?
