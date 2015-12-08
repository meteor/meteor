# Methods

After reading this article, you'll know:

1. What Methods are in Meteor and how they work in detail
2. Best practices for defining and calling Methods
3. How to throw and handle errors with Methods
4. How to call a method from a form

## What is a Method?

Methods are Meteor's remote procedure call (RPC) system, used to save user input events and data that come from the client. If you're familiar with REST APIs or HTTP, you can think of them like POST requests to your server, but with many nice features optimized for building a modern web application. Later on in this article, we'll go into detail about some of the benefits you get from Methods that you wouldn't get from an HTTP endpoint.

At its core, a Method is an API endpoint for your server; you can define a Method on the server and its counterpart on the client, then call it with some data, write to the database, and get the return value in a callback. Meteor Methods are also tightly integrated with the pub/sub and data loading systems of Meteor to allow for [Optimistic UI](http://info.meteor.com/blog/optimistic-ui-with-meteor-latency-compensation) - the ability to simulate server-side actions on the client to make your app feel faster than it actually is.

We'll be calling Meteor Methods "Method" with a capital M to differentiate them from class methods in JavaScript.

### Method call lifecycle

While you can easily use Methods in a simple app by following the Meteor introductory tutorial, it's important to understand exactly how they work to use them effectively in a production app. One of the downsides of using a framework like Meteor that does a lot for you under the hood is that you don't always understand what is going on, so it's good to learn some of the core concepts up front.

#### An example method

Let's look at the lifecycle of a client-side Method call in a Meteor app. We'll be considering a specific Method, that looks like this:

```js
Meteor.methods({
  'Todos.methods.updateText'({ todoId, newText }) {
    new SimpleSchema({
      todoId: { type: String },
      newText: { type: String }
    }).validate({ todoId, newText }),

    const todo = Todos.findOne(todoId);

    if (!todo.editableBy(this.userId)) {
      throw new Meteor.Error('Todos.methods.updateText.unauthorized',
        'Cannot edit todos in a private list that is not yours');
    }

    Todos.update(todoId, {
      $set: { text: newText }
    });
  }
});
```

This Method does a lot of the stuff an API endpoint usually does. It validates the arguments, gets some data from the database, checks permissions and possibly throws an error, and finally updates the database. It doesn't have a return value, but that's okay - we'll still mention what would have happened with a return value in our analysis below.

#### Calling the example method

Using the Meteor core API, we could call the method like this:

```js
Meteor.call('Todos.methods.updateText', { todoId, newText }, (err, res) => {
  if (err) {
    alert(err);
  } else {
    alert('Success!');
  }
});
```

Here's what happens, in order, when the method is called:

1. **Method simulation runs on the client.** If we defined this method in client and server code, as all Methods should be, the first thing Meteor does is it executes the Method code in the client that called it. This is known as a "method simulation" - the client enters a special mode where it tracks all changes made to client-side collections, so that they can be rolled back later. When this step is complete, the user of your app sees their UI update instantly with the new content of the client-side database, but the server hasn't received any data yet.
2. **A `method` message is sent to the server.** The Meteor client constructs a DDP message to send to the server. This includes the Method name, `Todos.methods.updateText`, the arguments, `todoId` and `newText`, and an automatically generated Method ID that represents this particular Method invocation.
3. **Method runs on the server.** When the server receives the message, it executes the Method code again. The client side version was a simulation that will be rolled back later, but this time is the real version that is writing to the actual database. Running the actual Method logic on the server is crucial because the server is a trusted environment where we can know that security-critical code will run the way we expect.
4. **Return value is sent to the client.** Once the Method has finished running on the server, it sends a `result` message to the client with the Method ID generated in step 2, and the return value itself. The client stores this for later use, but _doesn't call the Method callback yet_.
5. **Any DDP publications affected by the method are updated.** If we have any publications on the page that have been affected by the database writes from this Method, the server sends the appropriate updates to the client. In this case, that would be a notification that the `text` property of a todo item changed on the server.
6. **`updated` message sent to the client, Method callback fires.** After the relevant data updates have been sent to the correct client, the server sends back the last message in the Method life cycle - the DDP `updated` message with the relevant Method ID. The client rolls back any changes to client side data made in the Method simulation in step 1. At this point, the callback passed to `Meteor.call` actually fires with the return value from step 4. It's important that the callback waits until the client is up to date, so that your Method callback can assume that the client state reflects any changes done inside the Method.

In the list above, we didn't cover the case when the Method execution on the server throws an error. In that case, there is no return value, and the client gets an error instead. The Method callback is fired instantly with the returned error as the first argument. Read more about error handling in the section about errors below.

### Loading data with Methods

Since Methods can work as general purpose RPCs, they can also be used to fetch data instead of publications. There are some advantages and some disadvantages to this approach compared to loading data through publications, and at the end of the day we recommend always using publications to load data.

Methods can be useful to fetch the result of a complex computation from the server that doesn't need to update when the server data changes. The biggest disadvantage of fetching data through Methods is that the data won't be integrated into Minimongo, Meteor's client-side data cache, so you'll need to manage the lifecycle of that data manually.

XXX how much detail should I go into here?

### Benefits of Methods over REST

We believe Methods provide a much better primitive for building modern applications than REST endpoints built on HTTP. Let's go over some of the things you get for free with Methods that you would have to worry about if using HTTP. The purpose of this section is not to convince you that REST is bad - it's just to remind you that you don't need to handle these things yourself in a Meteor app.

1. **Methods use synchronous-style APIs, but are non-blocking.** You may notice in the example method above, we didn't need to write any callbacks when interacting with MongoDB, but the Method still has the non-blocking properties that people associate with Node.js and callback-style code. Meteor uses a coroutine library called [Fibers](https://github.com/laverdet/node-fibers) to enable you to write code that uses return values and throws errors, and avoid dealing with lots of nested callbacks.
2. **Methods always run and return in order.** When accessing a REST API, you will sometimes run into a situation where you make two requests one after the other, but the results arrive out of order. Meteor's underlying machinery makes sure this never happens with Methods. When multiple Method calls are received _from the same client_, Meteor runs each method to completion before starting the next one. If you need to disable this functionality for one particularly long-running Method, you can use [`this.unblock()`](http://docs.meteor.com/#/full/method_unblock) to allow the next Method to run while the current one is still in progress. Also, since Meteor is based on Websockets instead of HTTP, all Method calls and results are guaranteed to arrive in the order they are sent.
3. **Change tracking for Optimistic UI.** When Method simulations and server-side executions run, Meteor tracks any resulting changes to the database. This is what lets the Meteor data system roll back the changes from the method simulation and replace them with the actual writes from the server. Without this automatic database tracking, it would be very difficult to implement a correct Optimistic UI system.

## Defining a Method

In a basic app, defining a Meteor Method is as simple as defining a function. In a complex app, you want a few extra features to make Methods more powerful and easily testable. First, we're going to go over how to define a Method using the Meteor core API, and then we'll go over how to use a helpful wrapper package we've created to enable a more powerful Method workflow.

### A simple method

Here's how you can use the built-in [`Meteor.methods` API](http://docs.meteor.com/#/full/meteor_methods) to define a Method:

```js
Meteor.methods({
  'Todos.methods.updateText'({ todoId, newText }) {
    new SimpleSchema({
      todoId: { type: String },
      newText: { type: String }
    }).validate({ todoId, newText }),

    const todo = Todos.findOne(todoId);

    if (!todo.editableBy(this.userId)) {
      throw new Meteor.Error('Todos.methods.updateText.unauthorized',
        'Cannot edit todos in a private list that is not yours');
    }

    Todos.update(todoId, {
      $set: { text: newText }
    });
  }
});
```

This method is callable from the client and server using [`Meteor.call`](http://docs.meteor.com/#/full/meteor_call). Note that you should only use a Method in the case where some code needs to be callable from the client; if you just want to modularize code that is only going to be called from the server, use a regular JavaScript function, not a Method.
