# Using packages

1. Npm vs Atmosphere
  1. Npm packages:
    - Originally designed for server-side
    - Systems like webpack and browserify let you bundle them for the client
    - Meteor's module system seamlessly lets you `import` them from the client.
    - You can find them at npmjs.org
  1. Atmosphere packages are custom built for Meteor
    - The Meteor package system has some advantages
    - Code can be targeted at client *or* server
    - Packages can be run through the build tool (e.g. coffeescript, less packages)
    - Packages can define build plugins!
    - Packages are namespaced to the author
    - Binary stuff?
    - You can find them atmospherejs.com
2. Installing and using Atmosphere packages
  1. Install with `meteor add X:Y`
  2. Installed to `.meteor/packages` -- resolved in `.meteor/versions`
    - Actual files are at `~/.meteor/packages`
  3. `.meteor/versions` means repeatable builds (?)
  4. Atmosphere packages can include npm dependencies, managed for you.
3. Installing and using Npm packages
  1. You should install NPM 2.
  2. You should create a `package.json` -- `npm init`
  3. Install with `npm install --save package-name`
  4. Then run `npm-shinkwrap`
    - So that you can maintain repeatable builds.
  6. Add `node_modules/` to `.gitignore` (don't ignore `node_shrinkpacks`).
  7. Node modules installed at the app level can be `import`-ed from at the app or package level.
    - Some packages may rely on you installing a certain version of a node module in your app.
    - https://paper.dropbox.com/doc/node_modules-guidespec-HoFTXTb77FlFR287yYZYW
4. Advanced Package use:
  1. Dealing w/ callbacks in NPM packages (content from http://guide.meteor.com/build-tool.html#npm-callbacks)
  2. Overriding core/3rd party Atmosphere packages (content from http://guide.meteor.com/build-tool.html#atmosphere
  3. Overriding npm packages? (actually I don't know how to do this)
  4. Using `shrinkpack` to avoid depending on npm for deployments etc.


  

### Converting between callbacks and Fibers

Many NPM packages rely on an asynchronous, callback or promise-based coding style. For several reasons, Meteor is currently built around a synchronous-looking but still non-blocking style using [Fibers](https://github.com/laverdet/node-fibers).

The global Meteor server context and every method and publication initialize a new fiber so that they can run concurrently. Many Meteor APIs, for example collections, rely on running inside a fiber. They also rely on an internal Meteor mechanism that tracks server "environment" state, like the currently executing method. This means you need to initialize your own fiber and environment to use asynchronous Node code inside a Meteor app. Let's look at an example of some code that won't work, using the code example from the [node-github repository](https://github.com/mikedeboer/node-github):

```js
// Inside a Meteor method definition
updateGitHubFollowers() {
  github.user.getFollowingFromUser({
    user: 'stubailo'
  }, (err, res) => {
    // Using a collection here will throw an error
    // because the asynchronous code is not in a fiber
    Followers.insert(res);
  });
}
```

Let's look at a few ways to resolve this issue.

#### Option 1: Meteor.bindEnvironment

In most cases, simply wrapping the callback in `Meteor.bindEnvironment` will do the trick. This function both wraps the callback in a fiber, and does some work to maintain Meteor's server-side environment tracking. Here's the same code with `Meteor.bindEnvironment`:

```js
// Inside a Meteor method definition
updateGitHubFollowers() {
  github.user.getFollowingFromUser({
    user: 'stubailo'
  }, Meteor.bindEnvironment((err, res) => {
    // Everything is good now
    Followers.insert(res);
  }));
}
```

However, this won't work in all cases - since the code runs asynchronously, we can't use anything we got from an API in the method return value. We need a different approach that will convert the async API to a synchronous-looking one that will allow us to return a value.

#### Option 2: Meteor.wrapAsync

Many NPM packages adopt the convention of taking a callback that accepts `(err, res)` arguments. If your asynchronous function fits this description, like the one above, you can use `Meteor.wrapAsync` to convert to a fiberized API that uses return values and exceptions instead of callbacks, like so:

```js
// Setup sync API
const getFollowingFromUser =
  Meteor.wrapAsync(github.user.getFollowingFromUser, github.user);

// Inside a Meteor method definition
updateGitHubFollowers() {
  const res = getFollowingFromUserFiber({
    user: 'stubailo'
  });

  Followers.insert(res);

  // Return how many followers we have
  return res.length;
}
```

If you wanted to refactor this and create a completely fiber-wrapper GitHub client, you could write some logic to loop over all of the methods available and call `Meteor.wrapAsync` on them, creating a new object with the same shape but with a more Meteor-compatible API.

#### Option 3: Promises

Recently, a lot of NPM packages have been moving to Promises instead of callbacks for their API. This means you actually get a return value from the asynchronous function, but it's just an empty shell where the real value is filled in later. If you are using a package that has a promise-based API, you can convert it to synchronous-looking code very easily.

First, add the Meteor promise package:

```sh
meteor add promise
```

Now, you can use `Promise.await` to get a return value from a promise-returning function. For example, here is how you could send a text message using the Node Twilio API:

```js
sendTextMessage() {
  const promise = client.sendMessage({
    to:'+16515556677',
    from: '+14506667788',
    body: 'Hello world!'
  });

  // Wait for and return the result
  return Promise.await(promise);
}
```

Using the new `async`/`await` API for the above in the newest versions of JavaScript, the above code becomes even simpler: XXX does this work right now? What about in Meteor 1.3?

```js
// Mark the method as async
async sendTextMessage() {
  // Wait for the promise using the await keyword
  return await client.sendMessage({
    to:'+16515556677',
    from: '+14506667788',
    body: 'Hello world!'
  });
}
```
