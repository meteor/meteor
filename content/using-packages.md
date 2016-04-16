---
title: Using Packages
order: 30
discourseTopicId: 20192
---

After reading this article, you'll know:

1. About npm and Atmosphere, two JavaScript package systems you can use with Meteor
2. How to use npm packages and deal with callback-based APIs
3. How to use Atmosphere packages in your Meteor application

Building an application completely from scratch is a tall order. This is one of the main reasons you might consider using Meteor in the first place - you can focus on writing the code that is specific to your app, instead of reinventing wheels like user login and data synchronization. To streamline your workflow even further, it makes sense to use community packages from [npm](https://www.npmjs.com) and [Atmosphere](https://atmospherejs.com). Many of these packages are recommended in the guide, and you can find more in the online directories.

<h2 id="npm">npm</h2>

npm is a repository of general JavaScript packages. These packages were originally intended solely for the Node.js server-side environment, but as the JavaScript ecosystem matured, solutions arose to enable the use of npm packages in other environments such the browser. Today, npm is used for all types of JavaScript packages.

The best way to find npm packages is by searching on [npmjs.com](https://www.npmjs.com/). There are also some websites that have special search features specifically for certain kinds of packages, like the aptly named [react-components.com](http://react-components.com/).

<h3 id="client-npm">npm on the client</h3>

Tools like [browserify](http://browserify.org) and [webpack](https://webpack.github.io) are designed to provide a Node-like environment on the client so that many npm packages, even ones originally intended for the server, can run unmodified. Meteor's ES2015 module system does this for you out of the box with no additional configuration necessary. In most cases, you can simply import npm dependencies from a client file, just as you would on the server.

> When creating a new application Meteor installs the `meteor-node-stubs` npm package to help provide this client browser compatibility. If you are upgrading an application to Meteor 1.3 you may have to run `meteor npm install --save meteor-node-stubs` manually.

<h3 id="installing-npm">Installing npm Packages</h3>

npm packages are configured in a `package.json` file at the root of your project. If you create a new Meteor project, you will have such a file created for you; if not you can run `meteor npm init` to create one.

To install a package into your app, you can run the `npm install` command with the `--save` flag:

```bash
meteor npm install --save moment
```

This will both update your `package.json` with information about the dependency, and download the package into your app's local `node_modules/` directory. Typically, you don't check the `node_modules/` directory into source control, and your teammates run `meteor npm install` to get up to date when dependencies change:

```bash
meteor npm install
```

If the package is just a development dependency (i.e. it's used for testing, linting or the like), then you can use `--save-dev`. That way if you have some kind of build script, it can do `npm install --production` and avoid installing packages it doesn't need.

For more information about `npm install`, check out the [official documentation](https://docs.npmjs.com/getting-started/installing-npm-packages-locally).

> Meteor comes with npm bundled so that you can type `meteor npm` without worrying about installing it yourself. If you like, you can also use a globally installed npm to manage your packages.

<h3 id="using-npm">Using npm Packages</h3>

To use an npm package from a file in your application, you simply `import` the name of the package:

```js
import moment from 'moment';

// this is equivalent to the standard node require:
const moment = require('moment');
```

This imports the default export from the package into the symbol `moment`.

You can also import specific functions from a package using the destructuring syntax:

```js
import { isArray } from 'lodash';
```

You can also import other files or JS entry points from a package:

```js
import { parse } from 'graphql/language';
```

<h3 id="npm-shrinkwrap">npm Shrinkwrap</h3>

`package.json` typically encodes a version range, and so each `npm install` command can sometimes lead to a different result if new versions have been published in the meantime. In order to ensure that you and the rest of your team are using the same exact same version of each package, it's a good idea to use `npm shrinkwrap` after making any dependency changes to `package.json`:

```bash
# after installing
meteor npm install --save moment
meteor npm shrinkwrap
```

This will create an `npm-shrinkwrap.json` file containing the exact versions of each dependency, and you should check this file into source control. For even more precision (the contents of a given version of a package *can* change), and to avoid a reliance on the npm server during deployment, you can consider using [`npm shrinkpack`](#npm-shrinkpack) also. We'll cover that in the advanced section.

<h2 id="atmosphere">Atmosphere Packages</h2>

Atmosphere packages are packages written specifically for Meteor. Atmosphere packages have several advantages over npm when used with Meteor. In particular, Atmosphere packages can:

- Depend on core Meteor packages, such as `ddp` and `blaze`
- Include non-javascript files including CSS and static assets
- Take advantage of Meteor's [build system](build-tool.html) to be automatically transpiled from languages like CoffeeScript and SASS
- Have a well defined way to ship different code for client and server, enabling different behavior in each context
- Include build plugins for Meteor's build system
- Include pre-built binary code for different server architectures, such as Linux or Windows

<h4 id="atmosphere-searching">Searching for packages</h4>

There are a few ways to search for Meteor packages published to Atmosphere:

1. Search on the [Atmosphere website](https://atmospherejs.com/).
2. Use `meteor search` from the command line.
3. Use a community package search website like [Fastosphere](http://fastosphere.meteor.com/).

The main Atmosphere website provides additional curation features like trending packages, package stars, and flags, but some of the other options can be faster if you're trying to find a specific package. For example, you can use `meteor show kadira:flow-router` from the command line to see the description of that package and different available versions.

<h4 id="atmosphere-naming">Package naming</h4>

You may notice that, with the exception of Meteor platform packages, all packages on Atmosphere have a name of the form `prefix:name`. The prefix is the name of the organization or user that published the package. Meteor uses such a convention of package naming to make sure that it's clear who has published a certain package, and to avoid an ad-hoc namespacing convention. Meteor platform packages do not have any `prefix:`.

<h3 id="installing-atmosphere">Installing Atmosphere Packages</h3>

To install an Atmosphere package, you simply run `meteor add`:

```bash
meteor add kadira:flow-router
```

This will add the newest version of the desired package that is compatible with the other packages in your app. If you want to specify a particular version, you can specify it by adding a suffix to the package name, like so: `meteor add kadira:flow-router@2.10.0`.

Regardless of how you add the package to your app, its actual version will be tracked in the file at `.meteor/versions`. This means that anybody collaborating with you on the same app is guaranteed to have the same package versions as you. If you want to update to a newer version of a package after installing it, use `meteor update`. You can run `meteor update` without any arguments to update all packages and Meteor itself to their latest versions, or pass a specific package to update just that one, for example `meteor update kadira:flow-router`.

If your app is running when you add a new package, Meteor will automatically download it and restart your app for you.

> The actual files for a given version of an Atmosphere package are stored in your local `~/.meteor/packages` directory.

<h3 id="using-atmosphere">Using Atmosphere Packages</h3>

To use an Atmosphere Package, you can import it with the `meteor/` prefix:

```js
import { SimpleSchema } from 'meteor/aldeed:simple-schema';
```

Typically a package will export one or more symbols which you'll need to grab with the destructuring syntax. Sometimes a package will have no exports and simply have side effects when included in your app. In such cases you don't need to import the package at all.

<h3 id="peer-npm-dependencies">Peer npm Dependencies</h3>

Atmosphere packages can ship with contained [npm dependencies](writing-packages.html#npm-dependencies), in which case you don't need to do anything to make them work. However, some Atmosphere packages will expect that you have installed certain "peer" npm dependencies in your application.

Typically the package will warn you if you have not done so. For example, if you install the [`react-meteor-data`](https://atmospherejs.com/meteor/react-meteor-data) package into your app, you'll also need to [install](#installing-npm) the [`react`](https://www.npmjs.com/package/react) and the [`react-addons-pure-render-mixin`](https://www.npmjs.com/package/react-addons-pure-render-mixin) packages:

```bash
meteor npm install --save react react-addons-pure-render-mixin
meteor add react-meteor-data
```

<h2 id="async-callbacks">Asyncronous Callbacks</h2>

Many npm packages rely on an asynchronous, callback or promise-based coding style. For several reasons, Meteor is currently built around a synchronous-looking but still non-blocking style using [Fibers](https://github.com/laverdet/node-fibers).

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

Many npm packages adopt the convention of taking a callback that accepts `(err, res)` arguments. If your asynchronous function fits this description, like the one above, you can use `Meteor.wrapAsync` to convert to a fiberized API that uses return values and exceptions instead of callbacks, like so:

```js
// Setup sync API
const getFollowingFromUserFiber =
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

Recently, a lot of npm packages have been moving to Promises instead of callbacks for their API. This means you actually get a return value from the asynchronous function, but it's just an empty shell where the real value is filled in later. If you are using a package that has a promise-based API, you can convert it to synchronous-looking code very easily.

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

<h2 id="overriding-packages">Overriding packages with a local version</h2>

If you need to modify a package to do something that the published version doesn't do, you can edit a local version of the package on your computer.

<h3 id="npm-overriding">npm</h3>

Let's say you want to modify the `left-pad` npm package. If you haven't already, run inside your app directory:

```bash
meteor npm install --save left-pad
```

Now `left-pad` is included in your `package.json`, and the code has been downloaded to `node_modules/left_pad/`. Add the new directory to source control with:

```bash
git add -f node_modules/left_pad/
```

Now you can edit the package, commit, and push, and your teammates will get your version of the package. To ensure that your package doesn't get overwritten during an `npm update`, change the default [caret version range](https://docs.npmjs.com/misc/semver#caret-ranges-123-025-004) in your `package.json` to an exact version. Before:

```json
"left-pad": "^1.0.2",
```

After:

```json
"left-pad": "1.0.2",
```

An alternative method is maintaining a separate repository for the package and changing the `package.json` version number [to a git URL or tarball](http://debuggable.com/posts/how-to-fork-patch-npm-modules:4e2eb9f3-e584-44be-b1a9-3db7cbdd56cb), but every time you edit the separate repo, you'll need to commit, push, and `npm update left-pad`.

<h3 id="atmosphere-overriding">Atmosphere</h3>

A Meteor app can load Atmosphere packages in one of three ways, and it looks for a matching package name in the following order:

1. Package source code in the `packages/` directory inside your app.
2. Package source code in directories indicated by setting a `PACKAGE_DIRS` environment variable before running any `meteor` command. You can add multiple directories by separating the paths with a `:` on OSX or Linux, or a `;` on Windows. For example: `PACKAGE_DIRS=../first/directory:../second/directory`, or on Windows: `set PACKAGE_DIRS=..\first\directory;..\second\directory`.
3. Pre-built package from Atmosphere. The package is cached in `~/.meteor/packages` on Mac/Linux or `%LOCALAPPDATA%\.meteor\packages` on Windows, and only loaded into your app as it is built.

You can use (1) or (2) to override the version from Atmosphere. You can even do this to load patched versions of Meteor core packages - just copy the code of the package from [Meteor's GitHub repository](https://github.com/meteor/meteor/tree/devel/packages), and edit away.

One difference between pre-published packages and local app packages is that the published packages have any binary dependencies pre-built. This should only affect a small subset of packages. If you clone the source code into your app, you need to make sure you have any compilers required by that package.

<h2 id="npm-shrinkpack">Using Shrinkpack</h2>

[Shrinkpack](https://github.com/JamieMason/shrinkpack) is a tool that gives you more bulletproof and repeatable builds than you get by using [`npm shrinkwrap`](#npm-shrinkwrap) alone.

Essentially it copies a tarball of the contents of each of your npm dependencies into your application source repository. This is essentially a more robust version of the `npm-shrinkwrap.json` file that shrinkwrap creates, because it means your application's npm dependencies can be assembled without the need or reliance on the npm servers being available or reliable. This is good for repeatable builds especially when deploying.

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

You should then check the generated `node_shrinkwrap/` directory into source control, but ensure it is ignored by your text editor.

**NOTE**: Although this is a good idea for projects with a lot of npm dependencies, it will not affect Atmosphere dependencies, even if they themselves have direct npm dependencies.
