---
title: Using Packages
---

After reading this article, you'll know:

1. The third party packages systems you can use with Meteor, NPM and Atmosphere
2. How to use NPM packages and deal with asyncronous APIs in synchronous contexts
3. How to use Atmosphere packages in your Meteor application

The Meteor framework supports two packaging systems: the [NPM](https://www.npmjs.com) package system---a repository of general JavaScript modules, both for node and increasingly, for the client---and the [Atmosphere](https://atmospherejs.com) package system---which is a repository of packages written solely for the Meteor framework.

<h2 id="npm">NPM Packages</h2>

NPM is a repository of general JavaScript packages originally intended solely for the node (i.e. server) environment. As the JavaScript ecosystem has matured, and solutions arisen to enable the use of NPM packages in other environments such as browser clients, increasingly NPM is used for all types of JavaScript packages.

Tools like [browserify](http://browserify.org) and [webpack](https://webpack.github.io) are designed to provide a node-like environment on the client so that many NPM packages can run unmodified when bundled correctly. Luckily, Meteor's ES2015 module system works in a similar way, and in many cases, you can simply import NPM dependencies from a client file, just as you would on the server.

You can search for NPM packages at the [NPM website](https://www.npmjs.com).

<h3 id="installing-npm">Installing NPM Packages</h3>

NPM Packages are configured inside a project by the `package.json` control file. If you create a new Meteor project, you will have such a file created for you; if not you can run `meteor npm init` to create one.

To install a package into your app, you can run the `npm install` command with the `--save` flag:

```bash
meteor npm install --save moment
```

This will both update your `package.json` with information about the dependency, and download the package into your app's local `node_modules/` directory. Typically, you would not check the `node_modules/` directory into source control, and your team mates would run `meteor npm install` to get up to date:

```bash
meteor npm install
```

For more information about `npm install`, check out the [official documentation](https://docs.npmjs.com/getting-started/installing-npm-packages-locally).

<h3 id="using-npm">Using NPM Packages</h3>

To use an NPM package from a file in your application, you simple `import` the name of the package:

```js
import moment from 'moment';

// this is equivalent to the standard node require:
const moment = require('moment');
```

This imports the full exports from the package into the symbol `moment`.

You can also import sub-properties of the exports using the destructuring API:

```js
import { now } from 'moment';
```

You can also import other files or JS entrypoints from the package:

```js
import { name } from 'moment/package.json';
```

<h3 id="npm-shrinkwrap">NPM Shrinkwrap</h3>

In order to ensure that you and the rest of your team is using the same exact same version of each package that you depend on (`package.json` typically encodes a version range, and so each `npm install` command can sometimes lead to a different result if new versions have been published in the meantime), it's a good idea to use `npm shrinkwrap` after making any dependency changes to `package.json`:

```bash
# after installing
meteor npm install --save moment
meteor npm shrinkwrap
```

This will create an `npm-shrinkwrap.json` file containing the exact versions of each depedency, and you should check this file into source control. For even more precision (the contents of a given version of a package *can* change), and to avoid a reliance on the NPM server during deployment, you can consider using [`npm shrinkpack`](#npm-shrinkpack) also. We'll cover that in the advanced section.

<h2 id="atmosphere">Atmosphere Packages</h2>

Atmosphere Packages are packages written directly for Meteor. Aside from being the only way to depend on core Meteor packages, such as `ddp` and `blaze`, there are good reasons why packages have been written for the Atmosphere system:

 - Atmosphere packages can include other file, including CSS, and static assets.
 - Atmosphere packages can take advantage of Meteor's [build system](build-tool.html) and be written in different languages such as CoffeeScript.
 - Atmosphere packages have a well defined way to set out different entrypoints for client and server code, enabling different behaviour in each context (and shipping client-only code).
 - Atmosphere packages can themselves be build plugins for Meteor's build system.
 - Atmosphere packages can include pre-built binary code for the different server architectures Meteor runs on.

 You can search for Atmosphere Packages at the [Atmosphere website](https://atmospherejs.com).

<h3 id="installing-atmosphere">Installing Atmosphere Packages</h3>

To install an Atmosphere package, you simply run `meteor add`:

```bash
meteor add aldeed:simple-schema
```

This will add an entry in your `.meteor/packages` file, and when the Meteor tool runs, dependencies will be resolved and written to the `.meteor/versions` file. You should check both files into source control. This will ensure all members of the team use the same versions.

The actual files for a given version of an Atmosphere package are stored in you `~/.meteor/versions` directory.

<h3 id="using-atmosphere">Using Atmosphere Packages</h3>

To use an Atmosphere Package, you can import it with the `meteor/` prefix:

```js
import { SimpleSchema } from 'meteor/aldeed:simple-schema';
```

Typically a package will export one or more symbols which you'll need to grab with the descructuring syntax. Sometimes a package will have no exports and simply have side effects when included in your app. In such cases you don't need to import the package at all.

<h3 id="peer-npm-dependencies">Peer NPM Dependencies</h3>

Atmosphere Packages can ship with contained [NPM dependencies](writing-packages.html#npm-dependencies), in which case you don't need to take any extra steps. However, some Atmosphere packages will expect that you have installed certain "peer" NPM dependencies in your application.

Typically the package will warn you if you have not done so. For example, if you install the [`react-meteor-data`](https://atmospherejs.com/meteor/react-meteor-data) package into your app, you'll also need to [install](#installing-npm) the [`react`](https://www.npmjs.com/package/react) and the [`react-addons-pure-render-mixin`](https://www.npmjs.com/package/react-addons-pure-render-mixin) packages:

```bash
meteor npm install --save react react-addons-pure-render-mixin
meteor add react-meteor-data
```

<h2 id="async-callbacks">Asyncronous Callbacks</h2>

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

<h3 id="bind-environment">`Meteor.bindEnvironment`</h3>

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

<h3 id="wrap-async">`Meteor.wrapAsync`</h3>
 
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

<h3 id="promises">Promises</h3>

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

<h2 id="npm-shrinkpack">Using Shrinkpack</h2>

[Shrinkpack](https://github.com/JamieMason/shrinkpack) is a tool that is used for even more bulletproof and repeatable builds than you get by using [`npm shrinkwrap`](#npm-shrinkwrap) alone. 

Essentially it copies a tarball of the contents of each of your NPM dependencies into your application source repository. This is essentially a more robust version of the `npm-shrinkwrap.json` file that shrinkwrap creates, because it means your application's NPM dependencies can be assembled without the need or reliance on the NPM servers being available or reliable. This is good for repeatable builds especially when deploying.

To use shrinkpack, first globalling install it:

```bash
npm install -g shrinkpack
```

Then use it directly after you shrinkwrap

```bash
meteor npm install moment
meteor npm shrinkwrap
shrinkpack
```

You *should* then check the generated `node_shrinkwrap/` directory into source control, but ensure it is ignored by your text editor.

**NOTE**: Although this is a good idea for projects with a lot of NPM dependencies, it will not affect Atmosphere dependencies, even if they themselves have direct NPM dependencies.

