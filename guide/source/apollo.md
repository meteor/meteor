---
title: Apollo
order: 15
description: The Apollo data stack for Reactive GraphQL
discourseTopicId: TODO
---

<h2 id="introduction">Introduction</h2>

Apollo is a GraphQL client/server for transporting data. While it doesn't yet have all the features that Meteor's pub/sub system has, it provides a way to get data from any database – not just MongoDB.

- [Apollo docs](https://www.apollographql.com/docs/)

You can get started with Apollo and Meteor by creating a new Meteor application with the Apollo skeleton:
```shell
meteor create apollo-app --apollo
```

<h3 id="client">Apollo Client</h3>

[Apollo client docs](https://www.apollographql.com/docs/react/)

<h4 id="getting-data">Getting data</h4>

Instead of calling `Meteor.subscribe`, you will use [queries](https://www.apollographql.com/docs/react/data/queries/) to get data.

The main difference with subscriptions is that queries get called only once (by default) and don't get updated data like a subscription would. This is great for data that doesn't change often and where you don't need reactivity. 

<h4 id="changing-data">Changing data</h4>

Instead of calling a Meteor method with `Meteor.call`, you use a function called [`mutate`](https://www.apollographql.com/docs/react/data/mutations/) to run a *mutator*, which is GraphQL's equivalent to a method.

Mutators are only run on the server, but they can return an object which then can update the local cache without the need to call a query again.

<h3 id="server">Apollo Server</h3>

[Apollo server docs](https://www.apollographql.com/docs/apollo-server/)

<h4 id="getting-data-server">Getting data</h4>

Instead of using `Meteor.publish` to define publications, you write [resolve functions](https://www.apollographql.com/docs/apollo-server/data/resolvers/) – called *resolvers* – that fetch different types of data in the query.

<h4 id="changing-data-server">Changing data</h4>

Instead of using `Meteor.methods` to define methods, you write [mutators](https://www.apollographql.com/docs/tutorial/mutation-resolvers/) – functions that *mutate* (change) data.

These are part of the resolver functions under `Mutation` key.

<h3 id="graphql">GraphQL</h3>

GraphQL is a query language for apps to get the data they want. Instead of the server deciding what's in a publication, the client uses GraphQL to say exactly which fields of which objects it wants. 

- [About GraphQL](https://graphql.org/)
- [Intro to GraphQL](https://medium.com/apollo-stack/the-basics-of-graphql-in-5-links-9e1dc4cac055)
- [GraphQL coming from REST](https://medium.com/apollo-stack/how-do-i-graphql-2fcabfc94a01#.pfdj5bxxj)

<h3 id="advanced">Advanced<h3>

[Principled GraphQL](https://principledgraphql.com/)

<h4 id="latency">Latency</h4>

Meteor publications are blocking by default, whereas multiple GraphQL queries are executed in parallel. Publications stream data to the client as it arrives, whereas all the resolvers in a GraphQL query have to return before the data is sent to the client. (Although GraphQL is discussing adding the ability to stream results to the client as they come in.)

<h3>Meteor specific</h3>

Meteor has a specific Apollo package which includes user object into the context of a query.

```shell
meteor add apollo
```

On server you import `getUser` function and include it into the context option when setting up Apollo server:

```javascript
import { ApolloServer } from '@apollo/server';
import { WebApp } from 'meteor/webapp';
import { getUser } from 'meteor/apollo';
import typeDefs from '/imports/apollo/schema.graphql';
import { resolvers } from '/server/resolvers';
import express from 'express';
import { expressMiddleware } from '@apollo/server/express4';
import { json } from 'body-parser'

const context = async ({ req }) => ({
  user: await getUser(req.headers.authorization)
})

const server = new ApolloServer({
  cache: 'bounded',
  typeDefs,
  resolvers,
});

export async function startApolloServer() {
  await server.start();

  WebApp.connectHandlers.use(
    '/graphql',                                     // Configure the path as you want.
    express()                                       // Create new Express router.
      .disable('etag')                     // We don't server GET requests, so there's no need for that.
      .disable('x-powered-by')             // A small safety measure.
      .use(json())                                  // From `body-parser`.
      .use(expressMiddleware(server, { context })), // From `@apollo/server/express4`.
  )
}
```

This will make user data available (if user is logged in) as the option in the query:
```javascript
{
  Query: {
    userUniverses: async (obj, { hideOrgs }, { user }) => {
      if (!user) return null
      const selector = { userId: user._id, }
      if (hideOrgs) selector.organizationId = { $exists: false }
      return UniversesCollection.find(selector).fetch()
    }
  }
}
```

There are many other community packages that provide additional features or makes the initial setup easier, here is an incomplete list of some of them:

* [quave:graphql](https://atmospherejs.com/quave/graphql) - Utility package to create GraphQL setup in a standard way.
* [cultofcoders:apollo](https://atmospherejs.com/cultofcoders/apollo) - Meteor & Apollo integration.
* [cultofcoders:graphql-loader](https://atmospherejs.com/cultofcoders/graphql-loader) - Easily load your GraphQL schema in your Meteor app!
* [cultofcoders:apollo-accounts](https://atmospherejs.com/cultofcoders/apollo-accounts) - Meteor accounts in GraphQL
* [swydo:blaze-apollo](https://atmospherejs.com/swydo/blaze-apollo) - Blaze integration for the Apollo Client
* [swydo:ddp-apollo](https://atmospherejs.com/swydo/ddp-apollo) - DDP link and server for Apollo. 
