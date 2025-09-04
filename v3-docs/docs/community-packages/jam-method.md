# Jam Method

- `Who maintains the package` – [Jam](https://github.com/jamauro)

[[toc]]

## What is this package?

Method is an easy way to create Meteor methods with Optimistic UI. It's built with Meteor 3 in mind and is compatible with Meteor 2 to make migration easy. It's meant to be a drop in replacement for Validated Method and comes with additional features:

* Before and after hooks
* Global before and after hooks for all methods
* Pipe a series of functions
* Authed by default (can be overriden)
* Easily configure a rate limit
* Optionally run a method on the server only
* Attach the methods to Collections (optional)
* Validate with one of the supported schema packages or a custom validate function
* No need to use .call to invoke the method as with Validated Method

## How to download it?

Add the package to your app by running the following in your Meteor project:

```bash
meteor add jam:method
```
### Sources

* [GitHub repository](https://github.com/jamauro/method)

## How to use it?

### Create a method
`name` is required and will be how Meteor's internals identifies it.

`schema` will automatically validate using a [supported schema](#supported-schemas).

`run` will be executed when the method is called.

```js
import { createMethod } from 'meteor/jam:method'; // can import { Methods } from 'meteor/jam:method' instead and use Methods.create if you prefer

export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema, // using jam:easy-schema in this example
  async run({ text }) {
    const todo = {
      text,
      done: false,
      createdAt: new Date(),
      authorId: Meteor.userId(), // can also use this.userId instead of Meteor.userId()
    }
    const todoId = await Todos.insertAsync(todo);
    return todoId;
  }
});
```

#### Supported schemas
Currently, these schemas are supported:
* [jam:easy-schema](https://github.com/jamauro/easy-schema)
* [check](https://docs.meteor.com/api/check.html)
* [zod](https://github.com/colinhacks/zod)
* [simpl-schema](https://github.com/longshotlabs/simpl-schema)

If you're using `jam:easy-schema`, be sure to check out [Using with jam:easy-schema](#using-with-jameasy-schema) below for details on a way to write methods with less boilerplate.

Here's a quick example of each one's syntax. They vary in features so pick the one that best fits your needs.
```js
// jam:easy-schema. you'll attach to a Collection so you can reference one {Collection}.schema in your methods
const schema = {text: String, isPrivate: Optional(Boolean)}
// check
const schema = {text: String, isPrivate: Match.Maybe(Boolean)}
// zod
const schema = z.object({text: z.string(), isPrivate: z.boolean().optional()})
// simpl-schema
const schema = new SimpleSchema({text: String, isPrivate: {type: Boolean, optional: true}})
```

#### Custom validate function
If you're not using one of the supported schemas, you can use `validate` to pass in a custom validation function.
**`Note`**: `validate` can be an async function if needed.

```js
// import your schema from somewhere
// import your validator function from somewhere

export const create = createMethod({
  name: 'todos.create',
  validate(args) {
    validator(args, schema)
  },
  async run({ text }) {
    const todo = {
      text,
      done: false,
      createdAt: new Date(),
      authorId: Meteor.userId() // can also use this.userId instead of Meteor.userId()
    }
    const todoId = await Todos.insertAsync(todo);
    return todoId;
  }
});
```

### Import on the client and use
```js
import { create } from '/imports/api/todos/methods';

async function submit() {
  try {
    await create({text: 'book flight to Hawaii'})
  } catch(error) {
    alert(error)
  }
}
```

### Before and after hooks
You can execute functions `before` and / or `after` the method's `run` function. `before` and `after` accept a single function or an array of functions.

When using `before`, the original input passed into the method will be available. The original input will be returned automatically from a `before` function so that `run` receives what was originally passed into the method.

A great use case for using `before` is to verify the user has permission. For example:

```js
async function checkOwnership({ _id }) { // the original input passed into the method is available here. destructuring for _id since that's all we need for this function
  const todo = await Todos.findOneAsync(_id);
  if (todo.authorId !== Meteor.userId()) {
    throw new Meteor.Error('not-authorized')
  }

  return true; // any code executed as a before function will automatically return the original input passed into the method so that they are available in the run function
}

export const markDone = createMethod({
  name: 'todos.markDone',
  schema: Todos.schema,
  before: checkOwnership,
  async run({ _id, done }) {
    return await Todos.updateAsync(_id, {$set: {done}});
  }
});
```

When using `after`, the result of the `run` function will be available as the first argument and the second argument will contain the original input that was passed into the method. The result of the `run` function will be automatically returned from an `after` function.

```js
function exampleAfter(result, context) {
  const { originalInput } = context; // the name of the method is also available here
  // do stuff

  return 'success'; // any code executed as an after function will automatically return the result of the run function
}

export const markDone = createMethod({
  name: 'todos.markDone',
  schema: Todos.schema,
  before: checkOwnership,
  async run({ _id, done }) {
    return await Todos.updateAsync(_id, {$set: {done}});
  },
  after: exampleAfter
});
```

**`Note`**: If you use arrow functions for `before`, `run`, or `after`, you'll lose access to `this` – the methodInvocation. You may be willing to sacrifice that because `this.userId` can be replaced by `Meteor.userId()` and `this.isSimulation` can be replaced by `Meteor.isClient` but it's worth noting.


### Pipe a series of functions
Instead of using `run`, you can compose functions using `.pipe`. Each function's output will be available as an input for the next function.

```js
// you'd define the functions in the pipe and then place them in the order you'd like them to execute within .pipe
// be sure that each function in the pipe returns what the next one expects, otherwise you can add an arrow function to the pipe to massage the data, e.g. (input) => manipulate(input)

export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema
}).pipe(
  checkOwnership,
  createTodo,
  sendNotification
)
```

### Attach methods to its Collection (optional)
Instead of importing each method, you can attach them to the Collection. If you're using [jam:easy-schema](https://github.com/jamauro/easy-schema) be sure to attach the schema before attaching the methods.

```js
// /imports/api/todos/collection
import { Mongo } from 'meteor/mongo';
import { schema } from './schema';

export const Todos = new Mongo.Collection('todos');

Todos.attachSchema(schema); // if you're using jam:easy-schema

const attach = async () => {
  const methods = await import('./methods.js') // dynamic import is recommended
  return Todos.attachMethods(methods); // if you prefer not to use dynamic import, you can simply call attachMethods synchronously
};

attach().catch(error => console.error('Error attaching methods', error))
```
`attachMethods` accepts the method `options` as an optional second parameter. See [Configuring](#configuring-optional) for a list of the `options`.

With the methods attached you'll use them like this on the client:
```js
import { Todos } from '/imports/api/todos/collection';
// no need to import each method individually

async function submit() {
  try {
    await Todos.create({text: 'book flight to Hawaii'})
  } catch(error) {
    alert(error)
  }
}
```

### Executing code on the server only
By default, methods are optimistic meaning they will execute on the client and then on the server. If there's only part of the method that should execute on the server and not on the client, then simply wrap that piece of code in a `if (Meteor.isServer)` block. This way you can still maintain the benefits of Optimistic UI. For example:

```js
export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema,
  async run(args) {
    // rest of your function
    // code running on both client and server
    if (Meteor.isServer) {
      // code running on the server only
      import { secretCode } from '/server/secretCode'; // since it's in a /server folder the code will not be shipped to the client
      // do something with secretCode
    }

    // code running on both client and server
    return Todos.insertAsync(todo)
  }
});
```

If you prefer, you can force the entire method to execute on the server only by setting `serverOnly: true`. It can be used with `run` or `.pipe`. Here's an example with `run`:

```js
export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema,
  serverOnly: true,
  async run(args) {
    // all code here will execute only on the server
  }
});
```

You can also set all methods to be `serverOnly`. See [Configuring](#configuring-optional) below.

#### Security note
**`Important`**: Since Meteor does not currently support tree shaking, the contents of the code inside `run` function or `.pipe` could still be visible to the client even if you use `if (Meteor.isServer)` or `serverOnly: true`. To prevent this, you have these options:

1. Attach methods to its Collection with a dynamic import as shown above [Attach methods to its Collection (optional)](#attach-methods-to-its-collection-optional)

2. Import function(s) from a file within a `/server` folder. Any code imported from a `/server` folder will not be shipped to the client. The `/server` folder can be located anywhere within your project's file structure and you can have multiple `/server` folders. For example, you can co-locate with your collection folder, e.g. `/imports/api/todos/server/`, or it can be at the root of your project. See [Secret server code](https://guide.meteor.com/security.html#secret-code) for more info.

```js
export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema,
  serverOnly: true,
  async run(args) {
    import { serverFunction } from '/server/serverFunction';

    serverFunction(args);
  }
});
```

3. Dynamically import function(s). These do not have to be inside a `/server` folder. This will prevent the code being inspectable via the browser console.

```js
export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema,
  serverOnly: true,
  async run(args) {
    const { serviceFunction } = await import('./services');

    serviceFunction(args);
  }
});
```

### Changing authentication rules
By default, all methods will be protected by authentication, meaning they will throw an error if there is *not* a logged-in user. You can change this for an individual method by setting `open: true`. See [Configuring](#configuring-optional) below to change it for all methods.

```js
export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema,
  open: true,
  async run({ text }) {
    // ... //
  }
});
```

### Rate limiting
Easily rate limit a method by setting its max number of requests – the `limit` – within a given time period (milliseconds) – the `interval`.

```js
export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema,
  rateLimit: { // rate limit to a max of 5 requests every second
    limit: 5,
    interval: 1000
  },
  async run({ text }) {
    // ... //
  }
});
```

### Validate without executing the method
There may be occassions where you want to validate without executing the method. In these cases, you can use `.validate`. If you want to validate against only part of the schema, use `.validate.only`.

```js
export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema,
  async run({ text }) {
    // ... //
  }
});

// validate against the schema without executing the method
create.validate({...})

// validate against only the relevant part of the schema based on the data passed in without executing the method
create.validate.only({...})
```

If you're using a custom validate function instead of one of the supported schemas and you'd like to use `.validate.only`, you can simply append an `only` function onto the `validate` function that you supply.

### Options for Meteor.applyAsync
When called, the method uses [Meteor.applyAsync](https://docs.meteor.com/api/methods#Meteor-applyAsync) under the hood to execute your `run` function or `.pipe` function(s). `Meteor.applyAsync` takes a few options which can be used to alter the way Meteor handles the method. If you want to change the defaults or include other supported options, pass in `options` when creating the method.

```js
export const create = createMethod({
  name: 'todos.create',
  schema: Todos.schema,
  options: {
    // ... //
  },
  async run({ text }) {
    // ... //
  }
});
```

By default, this package uses the following `options`:
```js
{
  // Make it possible to get the ID of an inserted item
  returnStubValue: true,

  // Don't call the server method if the client stub throws an error, so that we don't end
  // up doing validations twice
  throwStubExceptions: true,
};
```
See [Configuring](#configuring-optional) below to set `options` for all methods.

### Working with the stub result (Meteor 3.0+)
In Meteor 3.0+, you can optionally take action with the stub result, i.e. the result when the method simulation is run on the client, before the server has returned with the final result or error. This can come in handy when you want to make your app feel instant for the user and you're relatively sure the action will succeed, e.g. when inserting new documents into the database.

```js
  const { stubPromise, serverPromise } = create();
  const _id = await stubPromise.catch(error => {
    // optionally handle a stub error
  });

  // take action with the _id stub result, for example, route to a new page
  router.go(`/detail/${_id}`)

  await serverPromise.catch(error => {
    // handle server error, rollback changes as needed, for example route to home
    router.go('/')
    alert('sorry, could not create')
  });
```

### Mocking the method context
You can mock the method invocation context, aka the `this` value inside the method, by invoking the method with `.call(context, args)`. This is particularly useful for unit testing to mock the `this.userId`:

```js
const context = {
  userId: 'fakeUserId',
  // ... //
}

await create.call(context, {...})
```

## Configuring (optional)
If you like the defaults, then you won't need to configure anything. But there is some flexibility in how you use this package.

Here are the global defaults:
```js
const config = {
  before: [], // global before function(s) that will run before all methods
  after: [], // global after function(s) that will run after all methods
  serverOnly: false, // globally make all methods serverOnly, aka disable Optimistic UI, by setting to true
  open: false, // by default all methods will be protected by authentication, override it for all methods by setting this to true
  loggedOutError: new Meteor.Error('logged-out', 'You must be logged in'), // customize the logged out error
  options: {
    returnStubValue: true, // make it possible to get the ID of an inserted item on the client before the server finishes
    throwStubExceptions: true,  // don't call the server method if the client stub throws an error, so that we don't end up doing validations twice
  }
};
````

To change the global defaults, use:
```js
// put this in a file that's imported on both the client and server
import { Methods } from 'meteor/jam:method';

Methods.configure({
  // ... change the defaults here ... //
});
```

### Global before and after hooks
You can create before and/or after functions to run before / after all methods. Both `before` and `after` accept a single function or an array of functions.

```js
import { Methods } from 'meteor/jam:method';

const hello = () => { console.log('hello') }
const there = () => { console.log('there') }
const world = () => { console.log('world') }

Methods.configure({
  before: [hello, there],
  after: world
});
```

### Helpful utility function to log your methods
Here's a helpful utility function - `log` - that you might consider adding. It isn't included in this package but you can copy and paste it into your codebase where you see fit.

```js
// log will simply console.log or console.error when the Method finishes
function log(input, pipeline) {
  pipeline.onResult((result) => {
    console.log(`Method ${pipeline.name} finished`, input);
    console.log('Result', result);
  });

  pipeline.onError((err) => {
    console.error(`Method ${pipeline.name} failed`);
    console.error('Error', err);
  });
};
```

Then you could use it like this:
```js
import { Methods, server } from 'meteor/jam:method';

Methods.configure({
  after: server(log)
});
```

## Alternative functional-style syntax
You can use a functional-style syntax to compose your methods if you prefer. Here's an example.

```js
const fetchGifs = async({ searchTerm, limit }) => {...}

export const getGifs = createMethod(server(schema({ searchTerm: String, limit: Number })(fetchGifs)))
```
`getGifs` is callable from the client but will only run on the server. Internally it will be identified as `fetchGifs`

**`Note`**: if you pass in a named function into `createMethod`, then that will be used to identify the method internally. Otherwise if you pass in an anonymous function, `jam:method` generates a unique name based on its schema to identify it internally.

### Customizing methods when using functional-style syntax
There are a few functions available when you need to customize the method: `schema`, `server`, `open`, `close`. These can be composed when needed.

#### schema
Specify the schema to validate against.

```js
import { schema } from 'meteor/jam:method';

export const doSomething = schema({thing: String, num: Number})(async ({ thing, num }) => {
  // ... //
});
```

#### server
Make the method run on the server only.

```js
import { server } from 'meteor/jam:method';

export const aServerOnlyMethod = server(async data => {
  // ... //
});
```

#### open
Make the method publically available so that a logged-in user isn't required.

```js
import { open } from 'meteor/jam:method';

export const aPublicMethod = open(async data => {
  // ... //
});
```

#### close
Make the method check for a logged-in user.

**`Note`**: by default, all methods require a logged-in user so if you stick with that default, then you won't need to use this function. See [Configuring](#configuring-optional).

```js
import { close } from 'meteor/jam:method';

export const closedMethod = close(async data => {
  // ... //
});
```

## Using with `jam:easy-schema`
`jam:method` integrates with `jam:easy-schema` and offers a way to reduce boilerplate and make your methods even easier to write (though you can still use `createMethod` if you prefer).

For example, instead of writing this:
```js
export const setDone = createMethod({
  name: 'todos.setDone',
  schema: Todos.schema,
  before: checkOwnership,
  async run({ _id, done }) {
    return Todos.updateAsync({ _id }, { $set: { done } });
  }
});
```

You can write:
```js
export const setDone = async ({ _id, done }) => {
  await checkOwnership({ _id });
  return Todos.updateAsync({ _id }, { $set: { done } });
};
```

**`Note`**: This assumes that you're attaching your methods to its collection. See [Attach methods to its Collection](#attach-methods-to-its-collection-optional).

When you call `Todos.setDone` from the client, the arguments will be automatically checked against the `Todos.schema`. The method will automatically be named `todos.setDone` internally to identify it for app performance monitoring (APM) purposes.

You can also compose with the functions available in the [function-style syntax](#alternative-functional-style-syntax). For example:
```js
export const setDone = server(async ({ _id, done }) => {
  await checkOwnership({ _id });
  return Todos.updateAsync({ _id }, { $set: { done } });
});
```
Now when you call `Todos.setDone` from the client it will only run on the server.

## Using with `jam:offline`
`jam:method` integrates with `jam:offline` to automatically queue methods when a user is offline. You don't need to configure anything in `jam:method` for this. 🎉 `jam:offline` will then replay them when the user reconnects. See [jam:offline](https://github.com/jamauro/offline) for more details.

## Coming from `Validated Method`?
You may be familiar with `mixins` and wondering where they are. With the features of this package - authenticated by default, `before` / `after` hooks, `.pipe` - your mixin code may no longer be needed or can be simplified. If you have another use case where your mixin doesn't translate, I'd love to hear it. Open a new discussion and let's chat.
