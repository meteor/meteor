---
title: Building Packages
---

In Meteor, there are two environments for writing code: apps and packages. The app environment is designed for rapid iteration and does a lot for you automatically. The package environment gives you much more control and enables you to ship more easily reusable and testable code.

You might want to build a package for two reasons:

1. You're building a medium or large-sized app following the [app structure guide](structure.md), and you want to put your app code in packages to enable better modularity and control.
2. You want to share some code between different apps in your organization - for example, you have several microservices that need to share utilities, or an admin UI for your site that connects to the same database.
2. You have some code you want to share with the community on [Atmosphere](https://atmospherejs.com/), Meteor's package repository.

This guide will cover the basics of building a Meteor package, which will apply to both use cases above. There are some additional guidelines to follow when building a package to publish to atmosphere, and that's covered in the guide about [building a great Atmosphere package](#XXX). Either way, you should read this first.

## Creating a package

To get started writing a package, use the Meteor command line tool:

```
meteor create --package my-package
```

If you run this inside an app, it will place the newly generated package in that app's `packages/` directory. Outside an app, it will just create a standalone package directory. The command also generates some boilerplate files for you:

```
my-package
├── README.md
├── package.js
├── my-package-tests.js
└── my-package.js
```

The `package.js` file is the main file in every Meteor package. This is a JavaScript file that defines the metadata, files loaded, architectures, NPM packages, and Cordova packages for your Meteor package.

In this guide article, we will go over some important points for building packages, but we won't explain every part of the `package.js` API. To learn about all of the options, [read about the `package.js` API in the Meteor docs.](http://docs.meteor.com/#/full/packagejs)

## onUse vs. onTest

XXX

## Adding files and assets

The main function of a Meteor package is to contain source code (JS, CSS, and any transpiled languages) and assets (images, fonts, and more). They act as a unit of code organization, give the developer complete control over which files are loaded where, and can be shared between different applications. Here's how you add files to a package:

```js
// Example for adding files to a package
// Pulled from the lists-show package in the Todos example app
Package.onUse(function(api) {
  // ...

  api.addFiles([
    'todos-item.html',
    'todos-item.js',
    'lists-show.html',
    'lists-show.js',
    'lists-show-page.html',
    'lists-show-page.js',
    'lists-show.less'
  ], 'client');

  // ...
});
```

And the same for assets:

```js
// Example for adding assets to a package
// Pulled from the less-imports package in the Todos example app
Package.onUse(function(api) {
  // ...

  api.addAssets([
    'font/OpenSans-Light-webfont.eot',
    'font/OpenSans-Light-webfont.svg',
    'font/OpenSans-Light-webfont.ttf',
    'font/OpenSans-Light-webfont.woff',
    'font/OpenSans-Regular-webfont.eot',
    'font/OpenSans-Regular-webfont.svg',
    'font/OpenSans-Regular-webfont.ttf',
    'font/OpenSans-Regular-webfont.woff',
  ], 'client');

  // ...
});
```

As you can see, the `addFiles` and `addAssets` functions allow you to pass a list of files as the first argument, and an architecture (or array of architectures) as the second argument. For more information about this, see the section about architectures below.

## Exporting JavaScript objects

While some packages exist just to provide side effects to the app, most packages provide a reusable bit of code that can be used in your app. A Meteor package specifies symbols that should be accessible from outside of the package with `api.export`. For example, if you were writing a factory package to generate fake data for your app, you might want to export a symbol for people to use it:

```js
Package.onUse(function(api) {
  // ...
  api.export('Factory');
});
```

Now, if an app depends on this package, the JavaScript symbol `Factory` will be "exported" from the package, and available in the app's JavaScript scope.

## Package dependencies

Another very important feature of Meteor packages is the ability to register dependencies on other packages. This is done via `api.use` and `api.imply`.

`api.use` is for recording the dependencies of your package. These dependencies are only available inside the package. However, Meteor's package system is single-loading so no two packages in the same app can have dependencies on conflicting versions of a single package. Read more about that in the section about version constraints below.

```js
// Example of using api.use to register dependencies internal to the package
api.use([
  'ecmascript',
  'check',
  'ddp',
  'underscore',
  'aldeed:simple-schema@1.3.3',
  'mdg:validation-error@0.1.0'
]);
```

`api.imply`, on the other hand, does not include the package as an internal dependency; instead, it makes these packages available to the user of the package, as if they were exported from this one. In the example below, we use `api.imply` to include Flow Router in the `todos-lib` package, so that any user of `todos-lib` also gets to use the symbol `FlowRouter`. This can be helpful to avoid keeping long lists of dependencies up to date by creating meta-packages that encapsulate many dependencies of your app at once.

```js
// Example of using api.imply to make a meta-package
// Taken from the todos-lib package in the Todos example app
api.imply([
  'kadira:flow-router@2.7.0',
  'kadira:blaze-layout@2.2.0',
  'arillo:flow-router-helpers@0.4.5',
  'zimme:active-route@2.3.0',
]);
```

`api.use` and `api.imply` can also take an extra argument to specify the architecture on which these dependencies should be used - this way, you can register a dependency on only the server version of HTTP, for example. This can be helpful when you are trying to reduce the side of your client-side app bundle.

### You can't depend on a specific Meteor version

Note that the Meteor release version number is mostly a marketing artifact, so it doesn't follow SemVer. This means packages can only depend on specific versions of the packages inside a Meteor release, but can't depend on a specific release itself. We have a helpful shorthand api called `versionsFrom` that handles this for you by automatically filling in package version numbers from a particular release:

```js
// Use versions of core packages from Meteor 1.2.1
api.versionsFrom('1.2.1');

api.use([
  'ecmascript', // Don't need to specify version because of versionsFrom above
  'check',
  'aldeed:simple-schema@1.3.3',
  'mdg:validation-error@0.1.0'
]);
```

The above code snippet is equivalent to the code below, which specifies all of the version numbers individually:

```js
api.use([
  'ecmascript@0.1.6',
  'check@1.1.0',
  'aldeed:simple-schema@1.3.3',
  'mdg:validation-error@0.1.0'
]);
```

## Architectures

Meteor packages are built around the idea of multiple architectures where code might run. Here are all currently possible architectures:


- `web` or `client` - code that runs in a web browser; can be split between Cordova and browser.
    - `web.browser`
    - `web.cordova`

Keep in mind that when your app is loaded in a mobile web browser, the `web.browser` version of the code runs; the `web.cordova` architecture is only for code that uses native Cordova plugins - more on that below.

- `os` or `server` - code that runs in a Node.js server program.
    - `os.osx.x86_64`
    - `os.linux.x86_64`
    - `os.linux.x86_32`
    - `os.windows.x86_32`

As you can see, the architecture can be specified based on operating system, but in practice this is only necessary for packages with binary NPM dependencies, and in the overwhelming majority of cases can be done for you automatically - see the section on NPM below.

Note that Meteor always runs in 32 bit mode on Windows, due to some issues with 64 bit Node and Windows.

## Semantic versioning and version constraints

Meteor's package system relies heavily on [Semantic Versioning](http://semver.org/), or SemVer. When one package declares a dependency on another, it always comes with a version constraint. These version constraints are then solved by Meteor's industrial-grade Version Solver to arrive at a set of package versions that meet all of the requirements, or display a helpful error if there is no solution.

The mental model here is:

1. **The major version must always match exactly.** If package `a` depends on `b@2.0.0`, the constraint will only be satisfied if the version of package `b` starts with a `2`. This means that you can never have two different major versions of a package in the same app.
2. **The minor and patch version numbers must be greater or equal to the requested version.** If the dependency requests version `2.1.3`, then `2.1.4` and `2.2.0` will work, but `2.0.4` and `2.1.2` will not.

The constraint solver is necessary because Meteor's package system is **single-loading** - that is, you can never have two different versions of the same package loaded side-by-side in the same app. This is particularly useful for packages that include a lot of client-side code, or packages that expect to be singletons.

Note that the version solver also has a concept of "gravity" - when many solutions are possible for a certain set of dependencies, it always selects the oldest possible version. This is helpful if you are trying to develop a package to ship to lots of users, since it ensures your package will be compatible with the lowest common denominator of a dependency. If your package needs a newer version than is currently being selected for a certain dependency, you need to update your `package.js` to have a newer version constraint.

## LESS, SCSS, or Stylus mixins/variables

Just like packages can export JavaScript code, they can export reusable bits of CSS pre-processor code. You can have a package that doesn't actually include any CSS, but just exports different bits of reusable mixins and variables. Learn more about this in the [article about the Meteor build system](XXX), which includes a section about CSS compilers.

## Cordova plugins

Meteor packages can include [Cordova plugins](http://cordova.apache.org/plugins/) to ship native code for the Meteor mobile app container. This way, you can interact with the native camera interface, use the gyroscope, save files locally, and more.

Include Cordova plugins in your Meteor package by using [Cordova.depends](http://docs.meteor.com/#/full/Cordova-depends).

Read more about using Cordova in the [mobile guide](#XXX).

## NPM packages in a Meteor package

Meteor packages can include [NPM packages](https://www.npmjs.com/) to use JavaScript code from outside the Meteor package ecosystem, or to include JavaScript code with native dependencies.

Include NPM packages in your Meteor package by using [Npm.depends](http://docs.meteor.com/#/full/Npm-depends). For example, here's how you could include the `github` package from NPM:

```js
Npm.depends({
  github: '0.2.4'
});
```

You can compile client-side NPM packages into your package by using the [`cosmos:browserify`](https://github.com/elidoran/cosmos-browserify) package.

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
  const result = getFollowingFromUserFiber({
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

## Local packages vs. published packages

If you've ever looked inside Meteor's package cache at `~/.meteor/packages`, you know that the on-disk format of a built Meteor package is completely different from the way the source code looks when you're developing the package. The idea is that the target format of a package can remain consistent even if the API for development changes. Read more about published packages in the [article about publishing packages](XXX).

## Package testing

Meteor packages are a great unit for code testing - you can test your packages individually or together with others. Read more in the [testing article](XXX).

## Tips for package structure

Let's go over some tips for structuring your packages nicely. Also, Meteor has a few changes coming on the horizon to align with ES2015 modules, the new standard for importing/exporting JavaScript code. With a bit of up-front structure, you can set yourself up for success to easily transition to the new format.

### One export per file

In Meteor's current system, it's not always clear where symbols in your app are coming from. In ES2015 modules, it will become clear since you import symbols from a particular, file, but in the meantime you can simulate a similar effect by exporting only one symbol from each file, and naming it the same as the file:

```js
// In `Widget.js`
Widget = class Widget { ... }

// In a different file
const w = new Widget();
```

In the future, this code will simply start looking like this:

```js
// ES2015 module version, file still called Widget.js
export class Widget { ... }

// In a different file:
import Widget from './Widget.js';
const w = new Widget();
```

If you need to export multiple symbols from one file, create a container object and add those symbols onto the object. This way, the container object can be named the same as the file to follow the above convention, and it can have as many properties as you want.

### One export per package

For the same reasons as above, it is advantageous to export exactly one symbol from every package, named the same as the package. For example, the `kadira:flow-router` package exports `FlowRouter`.

## Build plugins

The most powerful feature of Meteor's build system is the ability to define custom plugins. If you find yourself writing scripts that mangle one type of file into another, merge multiple files, or something else, it's likely that these scripts would be better implemented as a build plugin. The `ecmascript`, `templating`, and `coffeescript` packages are all implemented as build plugins, so you can replace them with your own versions if you want to!

[Read the documentation about build plugins.](https://github.com/meteor/meteor/wiki/Build-Plugins-API)

### Types of build plugins

There are three types of build plugins supported by Meteor today:

1. Compiler plugin - compiles source files (LESS, CoffeeScript) into built output (JS, CSS, asset files, and HTML). Only one compiler plugin can handle a single file extension.
2. Minifier plugin - compiles lots of built CSS or JS files into one or more minified files, for example `standard-minifiers`. Only one minifier can handle each of `js` and `css`.
3. Linter plugin - processes any number of files, and can print lint errors. Multiple linters can process the same files.

### Writing your own build plugin

Writing a build plugin is a very advanced task that only the most advanced Meteor users should get into. The best place to start is to copy a different plugin that is the most similar to what you are trying to do. For example, if you wanted to make a new CSS compiler plugin, you could fork the `less` package; if you wanted to make your own JS transpiler, you could fork `ecmascript`. A good example of a linter is the `jshint` package, and for a minifier you can look at `standard-minifiers-js` and `standard-minifiers-css`.

### Caching

The best way to make your build plugin fast is to use caching anywhere you can - the best way to save time is to do less work! Check out the [documentation about CachingCompiler](https://github.com/meteor/meteor/wiki/Build-Plugins-API#caching) to learn more. It's used in all of the above examples, so you can see how to use it by looking at them.
