# Meteor Methods

After reading this article, you'll know:

1. What Methods are in Meteor and how they work in detail.
2. Best practices for defining and calling Methods.
3. How to throw and handle errors with Methods.
4. How to call a Method from a form.

## What is a Method?

Methods are Meteor's remote procedure call (RPC) system, used to save user input events and data that come from the client. If you're familiar with REST APIs or HTTP, you can think of them like POST requests to your server, but with many nice features optimized for building a modern web application.

At its core, a Method is an API endpoint for your server; you can define a Method on the server and its counterpart on the client, then call it with some data, write to the database, and get the return value. Meteor Methods are also tightly integrated with the pub/sub and data loading systems of Meteor to allow for **Optimistic UI**—the ability to simulate server-side actions on the client to make your app feel faster than it actually is.

We'll be referring to Meteor Methods with a capital M to differentiate them from class methods in JavaScript.

## Defining and calling Methods

### Basic Method

In a basic app, defining a Meteor Method is as simple as defining a function. Note that Methods should always be defined in common code loaded on the client and the server to enable Optimistic UI.

This example uses the [simpl-schema](https://www.npmjs.com/package/simpl-schema) npm package to validate the Method arguments:

```js
import { Meteor } from 'meteor/meteor';
import SimpleSchema from 'simpl-schema';
import { Todos } from '/imports/api/todos/todos';

Meteor.methods({
  async 'todos.updateText'({ todoId, newText }) {
    new SimpleSchema({
      todoId: { type: String },
      newText: { type: String }
    }).validate({ todoId, newText });

    const todo = await Todos.findOneAsync(todoId);

    if (!todo.editableBy(this.userId)) {
      throw new Meteor.Error('todos.updateText.unauthorized',
        'Cannot edit todos in a private list that is not yours');
    }

    await Todos.updateAsync(todoId, {
      $set: { text: newText }
    });
  }
});
```

### Calling a Method

This Method is callable from the client and server using `Meteor.callAsync`. Note that you should only use a Method in the case where some code needs to be callable from the client; if you just want to modularize code that is only going to be called from the server, use a regular JavaScript function, not a Method.

Here's how you can call this Method from the client:

```js
try {
  await Meteor.callAsync('todos.updateText', {
    todoId: '12345',
    newText: 'This is a todo item.'
  });
  // success!
} catch (err) {
  console.error('Error updating todo:', err);
}
```

If the Method throws an error, it will be caught in the catch block. If the Method succeeds, the promise resolves with the return value.

### Advanced Method with jam:method

To reduce boilerplate and gain additional features, we recommend using the [`jam:method`](/community-packages/jam-method) package:

```bash
meteor add jam:method
```

Here's the same Method defined with the package:

```js
import { createMethod } from 'meteor/jam:method';
import SimpleSchema from 'simpl-schema';
import { Todos } from '/imports/api/todos/todos';

export const updateText = createMethod({
  name: 'todos.updateText',
  schema: new SimpleSchema({
    todoId: { type: String },
    newText: { type: String }
  }),
  async run({ todoId, newText }) {
    const todo = await Todos.findOneAsync(todoId);

    if (!todo.editableBy(this.userId)) {
      throw new Meteor.Error('todos.updateText.unauthorized',
        'Cannot edit todos in a private list that is not yours');
    }

    await Todos.updateAsync(todoId, {
      $set: { text: newText }
    });
  }
});
```

Calling this Method is simple and provides better error handling:

```js
import { updateText } from '/imports/api/todos/methods';

try {
  await updateText({ todoId: '12345', newText: 'This is a todo item.' });
  // success!
} catch (err) {
  console.error('Error updating todo:', err);
}
```

The benefits of `jam:method` include:

1. Run validation code by itself without running the Method body.
2. Override the Method for testing.
3. Call the Method with a custom user ID, especially in tests.
4. Refer to the Method via JS module rather than a magic string.
5. Get the Method simulation return value to get IDs of inserted documents.
6. Avoid calling the server-side Method if the client-side validation failed.

## Error handling

In regular JavaScript functions, you indicate errors by throwing an `Error` object. Throwing errors from Meteor Methods works almost the same way, but a bit of complexity is introduced by the fact that in some cases the error object will be sent over a websocket back to the client.

### Throwing errors from a Method

Meteor introduces two new types of JavaScript errors: [`Meteor.Error`](/api/meteor#Meteor-Error) and `ValidationError`. These and the regular JavaScript `Error` type should be used in different situations:

#### Regular `Error` for internal server errors

When you have an error that doesn't need to be reported to the client, but is internal to the server, throw a regular JavaScript error object. This will be reported to the client as a totally opaque internal server error with no details.

```js
throw new Error('Something went wrong on the server');
```

#### Meteor.Error for general runtime errors

When the server was not able to complete the user's desired action because of a known condition, you should throw a descriptive `Meteor.Error` object to the client:

```js
throw new Meteor.Error('todos.updateText.unauthorized',
  'Cannot edit todos in a private list that is not yours');
```

`Meteor.Error` takes three arguments: `error`, `reason`, and `details`.

1. `error` should be a short, unique, machine-readable error code string that the client can interpret to understand what happened. It's good to prefix this with the name of the Method for easy internationalization, for example: `'todos.updateText.unauthorized'`.

2. `reason` should be a short description of the error for the developer. It should give your coworker enough information to be able to debug the error.

3. `details` is optional, and can be used where extra data will help the client understand what is wrong.

#### ValidationError for argument validation errors

When a Method call fails because the arguments are of the wrong type, it's good to throw a `ValidationError`. This works like `Meteor.Error`, but is a custom constructor that enforces a standard error format that can be read by different form and validation libraries.

### Handling errors

When you call a Method, any errors thrown by it will be caught. At this point, you should identify which error type it is and display the appropriate message to the user:

```js
import { updateText } from '/imports/api/todos/methods';

try {
  await updateText({
    todoId: '12345',
    newText: 'This is a todo item.'
  });
  // success!
} catch (err) {
  if (err.error === 'todos.updateText.unauthorized') {
    // Display a user-friendly message
    alert("You aren't allowed to edit this todo item");
  } else if (err.error === 'validation-error') {
    // Handle validation errors
    err.details.forEach((fieldError) => {
      console.log(`Field ${fieldError.name}: ${fieldError.type}`);
    });
  } else {
    // Unexpected error
    console.error('Unexpected error:', err);
  }
}
```

### Errors in Method simulation

When a Method is called, it usually runs twice—once on the client to simulate the result for Optimistic UI, and again on the server to make the actual change to the database. This means that if your Method throws an error, it will likely fail on the client _and_ the server.

If you have code that should only run on the server (and not in the simulation), wrap it in a block that checks for simulation:

```js
if (!this.isSimulation) {
  // Logic that depends on server environment here
}
```

## Calling a Method from a form

The main thing enabled by the `ValidationError` convention is integration between Methods and the forms that call them. Let's define a Method for creating an invoice:

```js
import { createMethod } from 'meteor/jam:method';
import SimpleSchema from 'simpl-schema';

// Define validation regex patterns
const emailRegEx = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/g;
const amountRegEx = /^\d*\.(\d\d)?$/;

export const insertInvoice = createMethod({
  name: 'Invoices.methods.insert',
  schema: new SimpleSchema({
    email: { type: String, regEx: emailRegEx },
    description: { type: String, min: 5 },
    amount: { type: String, regEx: amountRegEx }
  }),
  async run(newInvoice) {
    if (!this.userId) {
      throw new Meteor.Error('Invoices.methods.insert.not-logged-in',
        'Must be logged in to create an invoice.');
    }

    return await Invoices.insertAsync(newInvoice);
  }
});
```

Here's how to handle the form in React:

```jsx
import React, { useState } from 'react';
import { insertInvoice } from '/imports/api/invoices/methods';

function NewInvoiceForm() {
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setErrors({});

    const formData = new FormData(event.target);
    const data = {
      email: formData.get('email'),
      description: formData.get('description'),
      amount: formData.get('amount')
    };

    try {
      await insertInvoice(data);
      // Success - redirect or show success message
    } catch (err) {
      if (err.error === 'validation-error') {
        const newErrors = {};
        err.details.forEach((fieldError) => {
          newErrors[fieldError.name] = fieldError.type;
        });
        setErrors(newErrors);
      } else {
        // Handle other errors
        console.error('Error creating invoice:', err);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Recipient email
        <input type="email" name="email" />
        {errors.email && <div className="form-error">{errors.email}</div>}
      </label>

      <label>
        Item description
        <input type="text" name="description" />
        {errors.description && <div className="form-error">{errors.description}</div>}
      </label>

      <label>
        Amount owed
        <input type="text" name="amount" />
        {errors.amount && <div className="form-error">{errors.amount}</div>}
      </label>

      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Invoice'}
      </button>
    </form>
  );
}
```

## Loading data with Methods

Since Methods can work as general purpose RPCs, they can also be used to fetch data instead of publications. There are some advantages and some disadvantages to this approach compared with loading data through publications.

Methods can be useful to fetch the result of a complex computation from the server that doesn't need to update when the server data changes. The biggest disadvantage of fetching data through Methods is that the data won't be automatically loaded into Minimongo, Meteor's client-side data cache, so you'll need to manage the lifecycle of that data manually.

### Using a local collection to store Method data

Collections are a convenient way of storing data on the client side. You can create a _local collection_ that exists only on the client:

```js
// In client-side code, declare a local collection
const ScoreAverages = new Mongo.Collection(null);
```

Now, if you fetch data using a Method, you can put it into this collection:

```js
import { calculateAverages } from '/imports/api/games/methods';

async function updateAverages() {
  // Clean out result cache
  await ScoreAverages.removeAsync({});

  // Call a Method that does an expensive computation
  const results = await calculateAverages();

  for (const item of results) {
    await ScoreAverages.insertAsync(item);
  }
}
```

You can now use the data from the local collection `ScoreAverages` inside a UI component exactly the same way you would use a regular MongoDB collection.

## Advanced concepts

### Method call lifecycle

Here's exactly what happens, in order, when a Method is called:

#### 1. Method simulation runs on the client

If we defined this Method in client and server code, as all Methods should be, a Method simulation is executed in the client that called it.

The client enters a special mode where it tracks all changes made to client-side collections, so that they can be rolled back later. When this step is complete, the user sees their UI update instantly with the new content of the client-side database, but the server hasn't received any data yet.

#### 2. A `method` DDP message is sent to the server

The Meteor client constructs a DDP message to send to the server. This includes the Method name, arguments, and an automatically generated Method ID.

#### 3. Method runs on the server

When the server receives the message, it executes the Method code again on the server. The client side version was a simulation that will be rolled back later, but this time it's the real version that is writing to the actual database.

#### 4. Return value is sent to the client

Once the Method has finished running on the server, it sends a `result` message to the client with the Method ID and the return value.

#### 5. Any DDP publications affected by the Method are updated

If we have any publications on the page that have been affected by the database writes from this Method, the server sends the appropriate updates to the client.

#### 6. `updated` message sent, data replaced, callback fires

After the relevant data updates have been sent to the client, the server sends back the `updated` message. The client rolls back any changes from the Method simulation and replaces them with the actual changes sent from the server.

Lastly, the Method promise resolves with the return value. It's important that this waits until the client is up to date, so that your Method callback can assume that the client state reflects any changes done inside the Method.

### Benefits of Methods over REST

Methods provide many benefits over REST endpoints:

#### Methods use async/await, but are non-blocking

You can write code that uses return values and throws errors using async/await syntax, and avoid dealing with lots of nested callbacks.

#### Methods always run and return in order

When multiple Method calls are received from the same client, Meteor runs each Method to completion before starting the next one. If you need to disable this functionality for one particularly long-running Method, you can use `this.unblock()` to allow the next Method to run while the current one is still in progress.

#### Change tracking for Optimistic UI

When Method simulations and server-side executions run, Meteor tracks any resulting changes to the database. This is what lets the Meteor data system roll back the changes from the Method simulation and replace them with the actual writes from the server.

### Calling a Method from another Method

Sometimes, you'll want to call a Method from another Method. This is a totally fine pattern:

1. Inside a client-side Method simulation, calling another Method doesn't fire off an extra request to the server—it runs the simulation of the called Method.
2. Inside a Method execution on the server, calling another Method runs that Method as if it were called by the same client, with the same context (`userId`, `connection`, etc).

### Consistent ID generation and Optimistic UI

When you insert documents into Minimongo from the client-side simulation of a Method, the `_id` field of each document is a random string. Each Meteor Method invocation shares a random generator seed with the client that called the Method, so any IDs generated by the client and server Methods are guaranteed to be the same.

This means you can safely use the IDs generated on the client to do things while the Method is being sent to the server. For example, you can create a new document and immediately redirect to a URL that contains that document's ID.

### Method retries

If you call a Method from the client, and the user's Internet connection disconnects before the result is received, Meteor assumes that the Method didn't actually run. When the connection is re-established, the Method call will be sent again.

This means that, in certain situations, Methods can be sent more than once. For this reason, you should try to make Methods idempotent—calling them multiple times doesn't result in additional changes to the database.

Many Method operations are idempotent by default:
- Inserts will throw an error if they happen twice because the generated ID will conflict
- Removes on collections won't do anything the second time
- Most update operators like `$set` will have the same result if run again

The places you need to be careful are MongoDB update operators that stack, like `$inc` and `$push`, and calls to external APIs.
