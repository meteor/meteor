# Breaking changes

## MongoDB Methods in the server

As mentioned in the [Frequently Asked Questions](../frequently-asked-questions/index.md#mongo-methods-server), `insert`, `update`,
 `remove`, `find`, `findOne`, `upsert` methods no longer work in the server.

You should migrate to use their `Async` counterparts.


```js
const docs = MyCollection.find({ _id: '123' }).fetch(); // [!code error] This will not work in the server
const doc = MyCollection.findOne({ _id: '123' }); // [!code error] This will not work in the server


// in Meteor 3.x you should use the Async methods

const docs = await MyCollection.find({ _id: '123' }).fetchAsync(); // [!code highlight] This will work in the server
const doc = await MyCollection.findOneAsync({ _id: '123' }); // [!code highlight] This will work in the server

```

## CLI

The `--vue2` flag is no longer available. We droped support for vue2.
You can see more information in this [PR](https://github.com/meteor/meteor/pull/13065).

#### Why?

This was decided because vue2 reached its [end of life](https://v2.vuejs.org/lts/#:~:text=Vue%202%20will%20reach%20End%20of%20Life%20(EOL)%20on%20December%2031st%2C%202023.%20After%20that%20date%2C%20Vue%202%20will%20continue%20to%20be%20available%20in%20all%20existing%20distribution%20channels%20(CDNs%20and%20package%20managers)%2C%20but%20will%20no%20longer%20receive%20updates%2C%20including%20security%20and%20browser%20compatibility%20fixes.)
on 2023-12-31, the team decided to drop support for it.


## Node v20

Meteor 3.0 is now using Node v20. This means that if you have any dependencies or usages
of Node v14, you will need to update them to be compatible with Node v20.


## NPM Installer

The npm installer has been updated. Use the following command to install Meteor:

```bash
npx meteor
```

or

```bash
npx meteor@<version>
```

You should be using a node version >= 20.0.0, if you use in your CI/CD you should update it to use the latest version of Node.


## Call x CallAsync

::: tip

You can check [call x callAsync](./call-x-callAsync.md) page for a full overview.

:::

Due to how meteor now works with `async/await`, you should use `callAsync` instead of `call` in your methods.

In Meteor 2.x this was a common pattern:

```js
import { Meteor } from 'meteor/meteor'

Meteor.methods({
  async getAllData() {
    return await MyCollection.find().fetch(); //  [!code error]
  },
  async otherMethod() {
    return await MyCollection.find().fetch(); //  [!code error]
  }
});


Meteor.call('getAllData') // [!code error]
Meteor.call('otherMethod') // [!code error]


```

Now in Meteor 3.x it should become:

```js
import { Meteor } from 'meteor/meteor'

Meteor.methods({
  async getAllData() {
    return await MyCollection.find().fetchAsync(); //  [!code highlight]
  },
  async otherMethod() {
    return await MyCollection.find().fetchAsync(); //  [!code highlight]
  }
});

await Meteor.callAsync('getAllData') // [!code highlight]
await Meteor.callAsync('otherMethod') // [!code highlight]

```

## Changes in Webapp

::: tip

Webapp now uses Express under the hood. This means that you can use all the express features in your Meteor app.

But if you did any customizations in the `WebApp` package, you should check if they are compatible with Express.

:::


The `webapp` package now exports this new properties:

```ts
type ExpressModule = {
  (): express.Application;
  json: typeof express.json;
  raw: typeof express.raw;
  Router: typeof express.Router;
  static: typeof express.static;
  text: typeof express.text;
  urlencoded: typeof express.urlencoded;
};

export declare module WebApp {
  // ...
  /**
   * @deprecated use handlers instead
   */
  var connectHandlers: express.Application;
  var handlers: express.Application; // [!code highlight]
  /**
   * @deprecated use rawHandlers instead
   */
  var rawConnectHandlers: express.Application;
  var rawHandlers: express.Application;
  var httpServer: http.Server;
  var expressApp: express.Application;
  var express: ExpressModule; // [!code highlight]
  // ...
}

// import { WebApp } from 'meteor/webapp';
```

If you want to use express in your app, you can do it like this:

```js
import { WebApp } from 'meteor/webapp';

const app = WebApp.express(); // [!code highlight] you can use as a normal express app

app.get('/hello', (req, res) => {
  res.send('Hello World');
});

WebApp.handlers.use(express);

```

The code below is an example of how you can use the `handlers` property to create a route in your app:

```js
import { WebApp } from 'meteor/webapp';

WebApp.handlers.get('/hello', (req, res) => {
  res.send('Hello World');
});

```
Changed engine from connect to express and changed api naming to match express. See below:
  - `WebApp.connectHandlers.use(middleware)` is now `WebApp.handlers.use(middleware)`
  - `WebApp.rawConnectHandlers.use(middleware)` is now `WebApp.rawHandlers.use(middleware)`
  - `WebApp.connectApp` is now `WebApp.expressApp`


A few methods from WebApp internals are now async:

  - `WebAppInternals.reloadClientPrograms()`
  - `WebAppInternals.pauseClient()`
  - `WebAppInternals.generateClientProgram()`
  - `WebAppInternals.generateBoilerplate()`
  - `WebAppInternals.setInlineScriptsAllowed()`
  - `WebAppInternals.enableSubresourceIntegrity()`
  - `WebAppInternals.setBundledJsCssUrlRewriteHook()`
  - `WebAppInternals.setBundledJsCssPrefix()`
  - `WebAppInternals.getBoilerplate`

## Meteor.userAsync

You should use `Meteor.userAsync` instead of `Meteor.user` in your code, especially if you
want isomorphism or want to get your user in the server.

```js
// Before
const user = Meteor.user(); // [!code error]
// After
const user = await Meteor.userAsync(); // [!code highlight]

```

