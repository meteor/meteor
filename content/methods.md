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
