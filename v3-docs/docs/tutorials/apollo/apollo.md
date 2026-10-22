# Apollo and GraphQL

This guide covers integrating Apollo and GraphQL with Meteor applications.

After reading this guide, you'll know:

1. What Apollo and GraphQL are and why you might use them
2. How to set up Apollo Server with Meteor
3. How to set up Apollo Client for querying data
4. How to integrate Meteor accounts with Apollo
5. Best practices for using GraphQL in Meteor apps

## Introduction

Apollo is a GraphQL client/server for transporting data. While Meteor's built-in pub/sub system is excellent for real-time reactivity with MongoDB, Apollo provides a way to get data from any database or API using GraphQL's powerful query language.

**When to use Apollo/GraphQL:**

- You need to fetch data from multiple sources (not just MongoDB)
- You want clients to specify exactly what data they need
- You're building a larger application with complex data requirements
- You need to integrate with external GraphQL APIs

**When to stick with Meteor's pub/sub:**

- You need real-time reactivity out of the box
- You're primarily using MongoDB
- You want the simplest possible data layer
- You need optimistic UI with automatic rollback

## Quick start

You can create a new Meteor application with Apollo pre-configured:

```bash
meteor create apollo-app --apollo
```

This sets up both Apollo Server and Client with Meteor integration.

## GraphQL basics

GraphQL is a query language for APIs. Instead of the server deciding what's in a publication, the client uses GraphQL to specify exactly which fields of which objects it wants.

### Schema definition

Define your data types and operations:

```graphql
# imports/apollo/schema.graphql
type User {
  _id: ID!
  username: String
  email: String
  profile: Profile
}

type Profile {
  name: String
  avatar: String
}

type Query {
  me: User
  user(id: ID!): User
  users(limit: Int): [User]
}

type Mutation {
  updateProfile(name: String, avatar: String): User
}
```

### Resolvers

Resolvers are functions that fetch the data for each field:

```js
// server/resolvers.js
export const resolvers = {
  Query: {
    me: async (obj, args, { user }) => {
      if (!user) return null;
      return user;
    },

    user: async (obj, { id }) => {
      return await Meteor.users.findOneAsync(id);
    },

    users: async (obj, { limit = 10 }) => {
      return await Meteor.users.find({}, { limit }).fetchAsync();
    }
  },

  Mutation: {
    updateProfile: async (obj, { name, avatar }, { user }) => {
      if (!user) {
        throw new Error('Not authenticated');
      }

      await Meteor.users.updateAsync(user._id, {
        $set: {
          'profile.name': name,
          'profile.avatar': avatar
        }
      });

      return await Meteor.users.findOneAsync(user._id);
    }
  }
};
```

## Apollo Server setup

### Installation

Install the required packages:

```bash
meteor add apollo
meteor npm install @apollo/server express body-parser graphql
```

### Server configuration

Set up Apollo Server with Meteor:

```js
// server/apollo.js
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { WebApp } from 'meteor/webapp';
import { getUser } from 'meteor/apollo';
import express from 'express';
import { json } from 'body-parser';
import typeDefs from '/imports/apollo/schema.graphql';
import { resolvers } from '/server/resolvers';

const context = async ({ req }) => ({
  user: await getUser(req.headers.authorization)
});

const server = new ApolloServer({
  typeDefs,
  resolvers,
  cache: 'bounded',
});

export async function startApolloServer() {
  await server.start();

  WebApp.connectHandlers.use(
    '/graphql',
    express()
      .disable('etag')
      .disable('x-powered-by')
      .use(json())
      .use(expressMiddleware(server, { context }))
  );

  console.log('Apollo Server ready at /graphql');
}
```

Start the server in your main server file:

```js
// server/main.js
import { startApolloServer } from './apollo';

Meteor.startup(async () => {
  await startApolloServer();
});
```

### Loading GraphQL files

To import `.graphql` files, you may need to configure your build. Alternatively, you can define schemas as strings:

```js
// imports/apollo/schema.js
import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type User {
    _id: ID!
    username: String
    email: String
  }

  type Query {
    me: User
    users: [User]
  }
`;
```

## Apollo Client setup

### Installation

```bash
meteor npm install @apollo/client graphql
```

### Client configuration

```js
// client/apollo.js
import { ApolloClient, InMemoryCache, HttpLink, ApolloLink } from '@apollo/client';
import { Accounts } from 'meteor/accounts-base';

const httpLink = new HttpLink({
  uri: '/graphql',
});

// Add authentication header
const authLink = new ApolloLink((operation, forward) => {
  const token = Accounts._storedLoginToken();

  operation.setContext({
    headers: {
      authorization: token ? `Bearer ${token}` : '',
    },
  });

  return forward(operation);
});

export const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
```

### React integration

Wrap your app with ApolloProvider:

```jsx
// client/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ApolloProvider } from '@apollo/client';
import { Meteor } from 'meteor/meteor';
import { client } from './apollo';
import App from '/imports/ui/App';

Meteor.startup(() => {
  const container = document.getElementById('react-target');
  const root = createRoot(container);

  root.render(
    <ApolloProvider client={client}>
      <App />
    </ApolloProvider>
  );
});
```

## Querying data

### Basic queries

Use the `useQuery` hook to fetch data:

```jsx
import React from 'react';
import { useQuery, gql } from '@apollo/client';

const GET_USERS = gql`
  query GetUsers($limit: Int) {
    users(limit: $limit) {
      _id
      username
      email
    }
  }
`;

function UserList() {
  const { loading, error, data } = useQuery(GET_USERS, {
    variables: { limit: 10 }
  });

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data.users.map(user => (
        <li key={user._id}>{user.username}</li>
      ))}
    </ul>
  );
}
```

### Refetching and polling

```jsx
function UserList() {
  const { loading, error, data, refetch } = useQuery(GET_USERS, {
    // Poll every 30 seconds for updates
    pollInterval: 30000,
  });

  return (
    <>
      <button onClick={() => refetch()}>Refresh</button>
      {/* ... */}
    </>
  );
}
```

## Mutations

### Basic mutations

Use the `useMutation` hook to modify data:

```jsx
import React, { useState } from 'react';
import { useMutation, gql } from '@apollo/client';

const UPDATE_PROFILE = gql`
  mutation UpdateProfile($name: String, $avatar: String) {
    updateProfile(name: $name, avatar: $avatar) {
      _id
      profile {
        name
        avatar
      }
    }
  }
`;

function ProfileEditor() {
  const [name, setName] = useState('');
  const [updateProfile, { loading, error }] = useMutation(UPDATE_PROFILE);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await updateProfile({
        variables: { name }
      });
      // Success!
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save'}
      </button>
      {error && <p>Error: {error.message}</p>}
    </form>
  );
}
```

### Updating the cache

After a mutation, you can update the local cache:

```jsx
const [createUser] = useMutation(CREATE_USER, {
  update(cache, { data: { createUser } }) {
    cache.modify({
      fields: {
        users(existingUsers = []) {
          const newUserRef = cache.writeFragment({
            data: createUser,
            fragment: gql`
              fragment NewUser on User {
                _id
                username
              }
            `
          });
          return [...existingUsers, newUserRef];
        }
      }
    });
  }
});
```

## Meteor accounts integration

The `meteor/apollo` package provides user integration:

### Server context

```js
import { getUser } from 'meteor/apollo';

const context = async ({ req }) => ({
  user: await getUser(req.headers.authorization)
});
```

### Using user in resolvers

```js
const resolvers = {
  Query: {
    myData: async (obj, args, { user }) => {
      if (!user) {
        throw new Error('Authentication required');
      }

      return await MyCollection.find({ userId: user._id }).fetchAsync();
    }
  },

  Mutation: {
    createItem: async (obj, { title }, { user }) => {
      if (!user) {
        throw new Error('Authentication required');
      }

      const itemId = await Items.insertAsync({
        title,
        userId: user._id,
        createdAt: new Date()
      });

      return await Items.findOneAsync(itemId);
    }
  }
};
```

## Subscriptions (Real-time data)

While Apollo supports GraphQL subscriptions, for real-time data in Meteor you might consider:

1. **Polling** - Simple and works well for many use cases
2. **Meteor pub/sub** - Use alongside Apollo for real-time needs
3. **WebSocket subscriptions** - Full GraphQL subscription support

### Setting up subscriptions

```bash
meteor npm install graphql-ws ws
```

```js
// server/apollo.js
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';

const schema = makeExecutableSchema({ typeDefs, resolvers });

// Create WebSocket server
const wsServer = new WebSocketServer({
  server: WebApp.httpServer,
  path: '/graphql-ws',
});

useServer({ schema }, wsServer);
```

## Community packages

Several community packages provide additional features:

- **[quave:graphql](https://atmospherejs.com/quave/graphql)** - Utility package for standard GraphQL setup
- **[cultofcoders:apollo](https://atmospherejs.com/cultofcoders/apollo)** - Comprehensive Meteor & Apollo integration
- **[cultofcoders:graphql-loader](https://atmospherejs.com/cultofcoders/graphql-loader)** - Easy GraphQL schema loading
- **[cultofcoders:apollo-accounts](https://atmospherejs.com/cultofcoders/apollo-accounts)** - Meteor accounts in GraphQL
- **[swydo:blaze-apollo](https://atmospherejs.com/swydo/blaze-apollo)** - Blaze integration for Apollo Client

## Comparing Apollo with Meteor pub/sub

| Feature | Meteor Pub/Sub | Apollo/GraphQL |
|---------|---------------|----------------|
| Real-time updates | Built-in | Requires subscriptions |
| Data sources | MongoDB | Any source |
| Client specifies fields | No | Yes |
| Optimistic UI | Built-in | Manual cache updates |
| Learning curve | Lower | Higher |
| Type safety | Optional | Schema-enforced |
| Latency | Streaming | All-at-once |

## Best practices

1. **Use both when appropriate** - Meteor pub/sub for real-time MongoDB data, Apollo for complex queries or external APIs.

2. **Define schemas clearly** - Good GraphQL schemas document your API automatically.

3. **Handle errors gracefully** - Use Apollo's error handling in resolvers:
   ```js
   import { GraphQLError } from 'graphql';

   throw new GraphQLError('Not authorized', {
     extensions: { code: 'FORBIDDEN' }
   });
   ```

4. **Use DataLoader for batching** - Prevent N+1 query problems:
   ```js
   import DataLoader from 'dataloader';

   const userLoader = new DataLoader(async (ids) => {
     const users = await Meteor.users.find({ _id: { $in: ids } }).fetchAsync();
     return ids.map(id => users.find(user => user._id === id));
   });
   ```

5. **Keep resolvers thin** - Move business logic to separate modules.

6. **Use fragments** - Reuse field selections across queries:
   ```graphql
   fragment UserFields on User {
     _id
     username
     email
   }

   query GetUsers {
     users {
       ...UserFields
     }
   }
   ```

## Further reading

- [Apollo Documentation](https://www.apollographql.com/docs/)
- [GraphQL Official Site](https://graphql.org/)
- [Principled GraphQL](https://principledgraphql.com/)
