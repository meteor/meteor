# Publications and Data Loading

After reading this guide, you'll know:

1. What publications and subscriptions are in Meteor.
2. How to define a publication on the server.
3. Where to subscribe on the client and in which components.
4. Useful patterns for managing subscriptions.
5. How to reactively publish related data.
6. How to ensure your publication is secure.
7. How to use the low-level publish API.

## Publications and subscriptions

In a traditional, HTTP-based web application, the client and server communicate in a "request-response" fashion. Typically the client makes RESTful HTTP requests to the server and receives HTML or JSON data in response, and there's no way for the server to "push" data to the client when changes happen at the backend.

Meteor is built from the ground up on the Distributed Data Protocol (DDP) to allow data transfer in both directions. Instead of setting up REST endpoints, you create *publication* endpoints that can push data from server to client.

In Meteor a **publication** is a named API on the server that constructs a set of data to send to a client. A client initiates a **subscription** which connects to a publication, and receives that data. That data consists of a first batch sent when the subscription is initialized and then incremental updates as the published data changes.

A subscription "bridges" a server-side MongoDB collection and the client-side Minimongo cache of that collection. You can think of a subscription as a pipe that connects a subset of the "real" collection with the client's version, and constantly keeps it up to date with the latest information on the server.

## Defining a publication

A publication should be defined in a server-only file. For instance, in the Todos example app, we want to publish the set of public lists to all users:

```js
import { Meteor } from 'meteor/meteor';
import { Lists } from '/imports/api/lists/lists';

Meteor.publish('lists.public', function() {
  return Lists.find({
    userId: { $exists: false }
  }, {
    fields: Lists.publicFields
  });
});
```

There are a few things to understand about this code block. First, we've named the publication with the unique string `lists.public`, and that will be how we access it from the client. Second, we are returning a Mongo *cursor* from the publication function. Note that the cursor is filtered to only return certain fields from the collection.

What that means is that the publication will ensure the set of data matching that query is available to any client that subscribes to it.

Every publication takes two types of parameters:

1. The `this` context, which has information about the current DDP connection. For example, you can access the current user's `_id` with `this.userId`.
2. The arguments to the publication, which can be passed in when calling `Meteor.subscribe`.

::: info
Since we need to access context on `this` we need to use the `function() {}` form for publications rather than the ES2015 `() => {}` arrow function.
:::

Here's a publication that loads private lists for the current user:

```js
Meteor.publish('lists.private', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Lists.find({
    userId: this.userId
  }, {
    fields: Lists.publicFields
  });
});
```

Thanks to the guarantees provided by DDP and Meteor's accounts system, this publication will only ever publish private lists to the user that they belong to. The publication will re-run if the user logs out (or back in again), which means that the published set of private lists will change as the active user changes.

In the case of a logged-out user, we explicitly call `this.ready()`, which indicates to the subscription that we've sent all the data we are initially going to send. It's important to know that if you don't return a cursor from the publication or call `this.ready()`, the user's subscription will never become ready.

### Publications with arguments

Here's an example of a publication which takes a named argument:

```js
import SimpleSchema from 'simpl-schema';

Meteor.publish('todos.inList', function(listId) {
  // Validate the argument
  new SimpleSchema({
    listId: { type: String }
  }).validate({ listId });

  if (!this.userId) {
    return this.ready();
  }

  return Todos.find({ listId });
});
```

When we subscribe to this publication on the client, we can provide this argument:

```js
Meteor.subscribe('todos.inList', list._id);
```

## Subscribing to data

To use publications, you need to create a subscription to it on the client. To do so, you call `Meteor.subscribe()` with the name of the publication:

```js
const handle = Meteor.subscribe('lists.public');
```

`Meteor.subscribe()` returns a "subscription handle" with these important properties:

- `.ready()` - A reactive function that returns `true` when the publication is marked ready
- `.stop()` - Stops the subscription and clears the data from the client cache

### Stopping subscriptions

When you are subscribing, it is very important to ensure that you always call `.stop()` on the subscription when you are done with it. This ensures that the documents sent by the subscription are cleared from your local Minimongo cache and the server stops doing the work required to service your subscription.

*However*, if you call `Meteor.subscribe()` inside a reactive context (such as a `Tracker.autorun`), then Meteor's reactive system will automatically call `.stop()` for you at the appropriate time.

### Subscribe in React components

Here's how to subscribe in a React component using the `useSubscribe` hook from `react-meteor-data`:

```jsx
import { useSubscribe, useFind } from 'meteor/react-meteor-data';
import { Lists } from '/imports/api/lists/lists';

function ListsPage() {
  const isLoading = useSubscribe('lists.public');
  const lists = useFind(() => Lists.find(), []);

  if (isLoading()) {
    return <div>Loading...</div>;
  }

  return (
    <ul>
      {lists.map(list => (
        <li key={list._id}>{list.name}</li>
      ))}
    </ul>
  );
}
```

For subscriptions with arguments:

```jsx
function TodosPage({ listId }) {
  const isLoading = useSubscribe('todos.inList', listId);
  const todos = useFind(() => Todos.find({ listId }), [listId]);

  if (isLoading()) {
    return <div>Loading...</div>;
  }

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo._id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

### Subscribe in Blaze templates

In Blaze, it's best to subscribe in the `onCreated()` callback:

```js
Template.Lists_show_page.onCreated(function() {
  this.getListId = () => FlowRouter.getParam('_id');

  this.autorun(() => {
    this.subscribe('todos.inList', this.getListId());
  });
});
```

Calling `this.subscribe()` (rather than `Meteor.subscribe`) attaches a special `subscriptionsReady()` function to the template instance, which is true when all subscriptions made inside this template are ready.

## Fetching data

Subscribing to data puts it in your client-side collection. To use the data in your user interface, you need to query your client-side collection.

### Always use specific queries

If you're publishing a subset of your data, always re-specify the query when fetching data on the client:

```js
// Good - specific query
const publicLists = Lists.find({ userId: { $exists: false } });

// Avoid - too broad, might include data from other subscriptions
const allLists = Lists.find();
```

### Fetch near where you subscribed

Place the fetch logic close to where you subscribe to avoid action at a distance and make data flow easier to understand:

```jsx
function TodoList({ listId }) {
  const isLoading = useSubscribe('todos.inList', listId);
  const todos = useFind(() => Todos.find({ listId }), [listId]);

  // Both subscription and fetch are in the same component
  if (isLoading()) return <Loading />;
  return <TodoItems todos={todos} />;
}
```

## Patterns for data loading

### Subscription readiness

It is key to understand that a subscription will not instantly provide its data. There will be a latency between subscribing to the data on the client and it arriving from the publication on the server.

```js
const handle = Meteor.subscribe('lists.public');

Tracker.autorun(() => {
  const isReady = handle.ready();
  console.log(`Handle is ${isReady ? 'ready' : 'not ready'}`);
});
```

For multiple subscriptions:

```js
const handles = [
  Meteor.subscribe('lists.public'),
  Meteor.subscribe('todos.inList', listId),
];

Tracker.autorun(() => {
  const areReady = handles.every(handle => handle.ready());
  console.log(`Handles are ${areReady ? 'ready' : 'not ready'}`);
});
```

### Reactively changing subscription arguments

When using React hooks or Blaze autoruns, subscriptions will automatically re-run when their reactive dependencies change:

```jsx
function TodoList({ listId }) {
  // Subscription will automatically re-run when listId changes
  const isLoading = useSubscribe('todos.inList', listId);
  // ...
}
```

### Pagination

Here's a pattern for paginated subscriptions:

```js
const PAGE_SIZE = 20;

Meteor.publish('todos.paginated', function(listId, page = 1) {
  new SimpleSchema({
    listId: { type: String },
    page: { type: Number, min: 1 }
  }).validate({ listId, page });

  const skip = (page - 1) * PAGE_SIZE;

  return Todos.find({ listId }, {
    sort: { createdAt: -1 },
    skip,
    limit: PAGE_SIZE
  });
});
```

And on the client:

```jsx
function PaginatedTodos({ listId }) {
  const [page, setPage] = useState(1);
  const isLoading = useSubscribe('todos.paginated', listId, page);

  // ...
}
```

## Publishing related data

Sometimes you need to publish data from multiple collections that are related. There are two main approaches:

### Multiple cursors

You can return an array of cursors from a publication:

```js
Meteor.publish('lists.withTodos', function(listId) {
  return [
    Lists.find({ _id: listId }),
    Todos.find({ listId })
  ];
});
```

### Reactive joins with reywood:publish-composite

For more complex relationships, use the `reywood:publish-composite` package:

```bash
meteor add reywood:publish-composite
```

```js
import { publishComposite } from 'meteor/reywood:publish-composite';

publishComposite('lists.withTodosAndAuthors', function(listId) {
  return {
    find() {
      return Lists.find({ _id: listId });
    },
    children: [{
      find(list) {
        return Todos.find({ listId: list._id });
      },
      children: [{
        find(todo) {
          return Meteor.users.find({ _id: todo.authorId }, {
            fields: { profile: 1, username: 1 }
          });
        }
      }]
    }]
  };
});
```

## Low-level publish API

For more control over what gets published, you can use the low-level publish API:

```js
Meteor.publish('custom.publication', function() {
  const self = this;

  // Add a document
  self.added('collection-name', 'document-id', { field: 'value' });

  // Change a document
  self.changed('collection-name', 'document-id', { field: 'new-value' });

  // Remove a document
  self.removed('collection-name', 'document-id');

  // Signal that initial data has been sent
  self.ready();

  // Clean up on stop
  self.onStop(() => {
    // cleanup code
  });
});
```

This is useful for:
- Publishing data from external sources
- Custom aggregation results
- Real-time data from non-MongoDB sources

## Security considerations

### Always validate arguments

```js
Meteor.publish('todos.inList', function(listId) {
  // Always validate
  check(listId, String);
  // or use SimpleSchema
  new SimpleSchema({
    listId: { type: String }
  }).validate({ listId });

  // ...
});
```

### Filter fields

Don't publish sensitive fields:

```js
Meteor.publish('users.public', function() {
  return Meteor.users.find({}, {
    fields: {
      username: 1,
      profile: 1
      // Don't include emails, services, etc.
    }
  });
});
```

### Check authorization

Make sure users can only access data they're authorized to see:

```js
Meteor.publish('lists.private', function() {
  if (!this.userId) {
    return this.ready();
  }

  // Only publish lists the user owns
  return Lists.find({ userId: this.userId });
});
```

See the [Security article](/tutorials/security/security) for more details on securing publications.
