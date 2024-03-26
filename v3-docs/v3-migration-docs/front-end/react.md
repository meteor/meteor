# React changes

:::tip

It is important to note that migrating your front-end code to async is unnecessary.
You can still use the sync MongoDB methods on the client side,
for example: `Collection.fetch`/`Collection.findOne`.

:::

But to maintain isomorphic code, you can use the async methods on the client side.

In those cases, we have implemented `suspense` version of hooks so that you can use the async methods.

For example:

```jsx

// you can write like this:

import { useTracker, useSubscribe } from 'meteor/react-meteor-data'
function Tasks() {
  const isLoading = useSubscribe("tasks");
  const { username } = useTracker(() => Meteor.user())
  const tasksByUser = useTracker(() =>
          TasksCollection.find({username}, { sort: { createdAt: -1 } }).fetch()
  );


  if (isLoading()) {
    return <Loading />
  }

  // render the tasks
}

```

In Meteor 3.x you can write like this:

```jsx

import { useTracker, useSubscribe } from 'meteor/react-meteor-data/suspense'
function Tasks() { // this component will suspend
  useSubscribe("tasks");
  const { username } = useTracker("user", () => Meteor.userAsync())
  const tasksByUser = useTracker("tasksByUser", () =>
          TasksCollection.find({username}, { sort: { createdAt: -1 } }).fetchAsync()
  );


  // render the tasks
}

```

`useFind` in the client will remain the same.

You can check the [react-meteor-data docs](https://github.com/meteor/react-packages/tree/master/packages/react-meteor-data) for more information
and these blog posts [part 1](https://dev.to/grubba/making-promises-suspendable-452f) [part 2](https://dev.to/grubba/new-suspense-hooks-for-meteor-3ddg) for a in-depth look on how we made those changes.

