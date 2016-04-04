---
title: Writing Packages
order: 31
discourseTopicId: 20194
---

After reading this article, you'll know:

1. When to create an npm package and when to create an Atmosphere package
2. The basics of writing an Atmosphere package
3. How to depend on other packages, both from Atmosphere and npm
4. How an Atmosphere package can integrate with Meteor's build system

The Meteor platform supports two package systems: [npm](https://www.npmjs.com), a repository of JavaScript modules for Node.js and the browser, and [Atmosphere](https://atmospherejs.com), a repository of packages written specifically for Meteor.

<h2 id="npm-vs-atmosphere">npm vs. Atmosphere</h2>

With the release of version 1.3, Meteor has full support for npm. In the future, there will be a time when all packages will be migrated to npm, but currently there are benefits to both systems. You can read more about the tradeoffs between Atmosphere and npm in the [Using Packages article](using-packages.html).

If you want to distribute and reuse code that you've written for a Meteor application, then you should consider publishing that code on npm if it's general enough to be consumed by a wider JavaScript audience. It's simple to [use npm packages from Meteor applications](using-packages.html#npm), and possible to [use npm packages from Atmosphere packages](#npm-dependencies), so even if your main audience is Meteor developers, npm might be the best choice.

The practice of writing npm packages is [well documented](https://docs.npmjs.com/getting-started/creating-node-modules) and we won't cover it here.

However, if your package depends on an Atmosphere package (which, in Meteor 1.3, includes the Meteor core packages), or needs to take advantage of Meteor's [build system](#build-packages), then writing an Atmosphere package might be the best option.

This article will cover some tips on how to do that.

<h2 id="creating">Creating an Atmosphere Package</h2>

To get started writing a package, use the Meteor command line tool:

```bash
meteor create --package my-package
```
> It is required that your `my-package` name take the form of `username:my-package`, where `username` is your Meteor Developer username, if you plan to publish your package to Atmosphere.

If you run this inside an app, it will place the newly generated package in that app's `packages/` directory. Outside an app, it will just create a standalone package directory. The command also generates some boilerplate files for you:

```txt
my-package
├── README.md
├── package.js
├── my-package-tests.js
└── my-package.js
```

The `package.js` file is the main file in every Meteor package. This is a JavaScript file that defines the metadata, files loaded, architectures, npm packages, and Cordova packages for your Meteor package.

In this guide article, we will go over some important points for building packages, but we won't explain every part of the `package.js` API. To learn about all of the options, [read about the `package.js` API in the Meteor docs.](http://docs.meteor.com/#/full/packagejs)

> Don't forget to run [`meteor add [my-package]`](http://docs.meteor.com/#/full/meteoradd) once you have finished developing your package in order to use it; this applies if the package is a local package for internal use only or if you have published the package to Atmosphere.

<h2 id="adding-files">Adding files and assets</h2>

The main function of an Atmosphere package is to contain source code (JS, CSS, and any transpiled languages) and assets (images, fonts, and more) that will be shared across different applications.

<h3 id="adding-javascript">Adding JavaScript</h3>

To add JavaScript files to a package, specify an entrypoint with [`api.mainModule()`](http://docs.meteor.com/#/full/pack_mainModule) in the package's `onUse` block (this will already have been done by `meteor create --package` above):

```js
Package.onUse(function(api) {
  api.mainModule('my-package.js');
});
```

From that entrypoint, you can `import` other files within your package, [just as you would in an application](structure.html).

If you want to include different files on the client and server, you can specify multiple entry points using the second argument to the function:

```js
Package.onUse(function(api) {
  api.mainModule('my-package-client.js', 'client');
  api.mainModule('my-package-server.js', 'server');
});
```

You can also add any source file that would be compiled to a JS file (such as a CoffeeScript file) in a similar way, assuming you [depend](#dependencies) on an appropriate build plugin.

<h3 id="adding-css">Adding CSS</h3>

To include CSS files with yor package, you can use [`api.addFiles()`](http://docs.meteor.com/#/full/pack_addFiles):

```js
Package.onUse(function(api) {
  api.addFiles('my-package.css');
});
```

The CSS file will be automatically loaded into any app that uses your package.

<h3 id="adding-assets">Adding other Assets</h3>

You can include other assets in your package, which you can later access with the [Assets API](http://docs.meteor.com/#/full/assets_getText) on the server, or via URL on the client, using [`api.addAssets`](http://docs.meteor.com/#/full/PackageAPI-addAssets):

```js
Package.onUse(function(api) {
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
});
```

<h2 id="exporting">Exporting</h2>

While some packages exist just to provide side effects to the app, most packages provide a reusable bit of code that can be used by the consumer with `import`. To export a symbol from your package, simply use the ES2015 `export` syntax in your `mainModule`:

```js
// in my-package.js:
export const name = 'my-package';
```

Now users of your package can import the symbol with:

```js
import { name } from 'meteor/username:my-package';
```

<h2 id="dependencies">Dependencies</h2>

Chances are your package will want to make use of other packages---to ensure they are available, you can declare dependencies. Atmosphere packages can depend both on other Atmosphere packages, as well as packages from npm.

<h3 id="atmosphere-dependencies">Atmosphere dependencies</h3>

To depend on another Atmosphere package, use [`api.use`](http://docs.meteor.com/#/full/pack_use):

```js
Package.onUse(function(api) {
  // This package depends on 1.3.3 or above of simple-schema
  api.use('aldeed:simple-schema@1.3.3');
});
```

One important feature of the Atmosphere package system is that it is single-loading: no two packages in the same app can have dependencies on conflicting versions of a single package. Read more about that in the section about version constraints below.

<h4 id="meteor-version-dependencies">Depending on Meteor Version</h4>

Note that the Meteor release version number is mostly a marketing artifact---the core Meteor packages themselves typically don't share this version number. This means packages can only depend on specific versions of the packages inside a Meteor release, but can't depend on a specific release itself. We have a helpful shorthand api called [`api.versionsFrom`](http://docs.meteor.com/#/full/pack_versions) that handles this for you by automatically filling in package version numbers from a particular release:

```js
// Use versions of core packages from Meteor 1.2.1
api.versionsFrom('1.2.1');

api.use([
  // Don't need to specify version because of versionsFrom above
  'ecmascript',
  'check',

  // Still need to specify versions of non-core packages
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

<h4 id="version-constraints">Semantic versioning and version constraints</h4>

Meteor's package system relies heavily on [Semantic Versioning](http://semver.org/), or SemVer. When one package declares a dependency on another, it always comes with a version constraint. These version constraints are then solved by Meteor's industrial-grade Version Solver to arrive at a set of package versions that meet all of the requirements, or display a helpful error if there is no solution.

The mental model here is:

1. **The major version must always match exactly.** If package `a` depends on `b@2.0.0`, the constraint will only be satisfied if the version of package `b` starts with a `2`. This means that you can never have two different major versions of a package in the same app.
2. **The minor and patch version numbers must be greater or equal to the requested version.** If the dependency requests version `2.1.3`, then `2.1.4` and `2.2.0` will work, but `2.0.4` and `2.1.2` will not.

The constraint solver is necessary because Meteor's package system is **single-loading** - that is, you can never have two different versions of the same package loaded side-by-side in the same app. This is particularly useful for packages that include a lot of client-side code, or packages that expect to be singletons.

Note that the version solver also has a concept of "gravity" - when many solutions are possible for a certain set of dependencies, it always selects the oldest possible version. This is helpful if you are trying to develop a package to ship to lots of users, since it ensures your package will be compatible with the lowest common denominator of a dependency. If your package needs a newer version than is currently being selected for a certain dependency, you need to update your `package.js` to have a newer version constraint.

<h3 id="npm-dependencies">npm dependencies</h3>

Meteor packages can include [npm packages](https://www.npmjs.com/) to use JavaScript code from outside the Meteor package ecosystem, or to include JavaScript code with native dependencies.

If your package is using a dependency on the server then you can include npm packages in your Meteor package by using [Npm.depends](http://docs.meteor.com/#/full/Npm-depends). For example, here's how you could include the `github` package from npm in your `package.js`:

```js
Npm.depends({
  github: '0.2.4'
});
```

You can import the dependency from within you package code in the same way that you would inside an [application](using-packages.html#using-npm):

```js
import github from 'github';
```

<h3 id="npm-peer-dependencies">Peer npm dependencies</h3>

`Npm.depends()` is fairly rigid (you can only depend on an exact version), and will typically result in multiple versions of a package being installed if many different Atmosphere packages depend on the same npm package. This makes it less than ideal to use on the client, where it's impractical to ship multiple copies of the same package code to the browser. Client-side packages are also often written with the assumption that only a single copy will be loaded. For example, React will complain if it is included more than once in an application bundle.

To avoid this problem as a package author, you can request that users of your package have installed the npm package you want to use at the application level. This is similar to a [peer dependency](https://nodejs.org/en/blog/npm/peer-dependencies/) of an npm package (although with less support in the tool). You can use the [`tmeasday:check-npm-versions`](https://atmospherejs.com/tmeasday/check-npm-versions) package to ensure that they've done this, and to warn them if not.

For instance, if you are writing a React package, you should not directly depend on [`react`](https://www.npmjs.com/package/react), but instead use `check-npm-versions` to check the user has installed it:

```js
import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions({
  'react': '0.14.x'
}, 'my:awesome-package');

// If you are using the dependency in the same file, you'll need to use require, otherwise
// you can continue to `import` in another file.
const React = require('react');
```

> Note that `checkNpmVersions` will only output a warning if the user has installed a incompatible version of the npm package. So your `require` call may not give you what you expect. This is consistent with npm's handling of [peer dependencies](http://blog.npmjs.org/post/110924823920/npm-weekly-5).

<h2 id="exporting-css-preprocessor-code">LESS, SCSS, or Stylus mixins/variables</h2>

Just like packages can export JavaScript code, they can export reusable bits of CSS pre-processor code. You can have a package that doesn't actually include any CSS, but just exports different bits of reusable mixins and variables. Learn more about this in the [article about the Meteor build system](build-tool.html), which includes a section about CSS compilers.

<h2 id="cordova-plugins">Cordova plugins</h2>

Meteor packages can include [Cordova plugins](http://cordova.apache.org/plugins/) to ship native code for the Meteor mobile app container. This way, you can interact with the native camera interface, use the gyroscope, save files locally, and more.

Include Cordova plugins in your Meteor package by using [Cordova.depends](http://docs.meteor.com/#/full/Cordova-depends).

Read more about using Cordova in the [mobile guide](mobile.html).

<h2 id="testing">Testing packages</h2>

Meteor has a test mode for packages called `meteor test-packages`. If you are in a package's directory, you can run

```bash
meteor test-packages ./ --driver-package practicalmeteor:mocha
```

This will run a special app containing only a "test" version of your package and start a Mocha [test driver package](testing.html#driver-packages).

When your package starts in test mode, rather than loading the `onUse` block, Meteor loads the `onTest` block:

```js
Package.onTest(function(api) {
  // You almost definitely want to depend on the package itself,
  // this is what you are testing!
  api.use('my-package');

  // You should also include any packages you need to use in the test code
  api.use(['ecmascript', 'random', 'practicalmeteor:mocha@2.1.1']);

  // Finally add an entry point for tests
  api.mainModule('my-package-tests.js');
});
```

From within your test entry point, you can import other files as you would in the package proper.

You can read more about testing in Meteor in the [Testing article](testing.html).

<h3 id="testing-with-peer-dependencies">Peer npm dependencies</h3>

If your package makes use of [peer npm dependencies](#peer-npm-dependencies), you cannot currently use `test-packages` to write package tests (as the dependencies will not be included in the special test app).

To work around this, you can create a "scaffolding" test application, which is a simple app which simply includes the package and uses standard [tests](testing.html) to run tests against the package. You can see examples of these kind of scaffold test apps in the [React packages repository](https://github.com/meteor/react-packages/tree/devel/tests).

<h2 id="local-vs-published">Local packages vs. published packages</h2>

If you've ever looked inside Meteor's package cache at `~/.meteor/packages`, you know that the on-disk format of a built Meteor package is completely different from the way the source code looks when you're developing the package. The idea is that the target format of a package can remain consistent even if the API for development changes.

To publish your package to Atmosphere, run [`meteor publish`](http://docs.meteor.com/#/full/meteorpublish) from the package directory. To publish a package the package name must follow the format of `username:my-package` and the package must contain a [SemVer version number](#version-constraints).

<h2 id="build-plugins">Build plugins</h2>

The most powerful feature of Meteor's build system is the ability to define custom build plugins. If you find yourself writing scripts that mangle one type of file into another, merge multiple files, or something else, it's likely that these scripts would be better implemented as a build plugin. The `ecmascript`, `templating`, and `coffeescript` packages are all implemented as build plugins, so you can replace them with your own versions if you want to!

[Read the documentation about build plugins.](https://github.com/meteor/meteor/wiki/Build-Plugins-API)

<h3 id="types-of-build-plugins">Types of build plugins</h3>

There are three types of build plugins supported by Meteor today:

1. Compiler plugin - compiles source files (LESS, CoffeeScript) into built output (JS, CSS, asset files, and HTML). Only one compiler plugin can handle a single file extension.
2. Minifier plugin - compiles lots of built CSS or JS files into one or more minified files, for example `standard-minifiers`. Only one minifier can handle each of `js` and `css`.
3. Linter plugin - processes any number of files, and can print lint errors. Multiple linters can process the same files.

<h3 id="writing-build-plugins">Writing your own build plugin</h3>

Writing a build plugin is a very advanced task that only the most advanced Meteor users should get into. The best place to start is to copy a different plugin that is the most similar to what you are trying to do. For example, if you wanted to make a new CSS compiler plugin, you could fork the `less` package; if you wanted to make your own JS transpiler, you could fork `ecmascript`. A good example of a linter is the `jshint` package, and for a minifier you can look at `standard-minifiers-js` and `standard-minifiers-css`.

<h3 id="caching-build-plugins">Caching</h3>

The best way to make your build plugin fast is to use caching anywhere you can - the best way to save time is to do less work! Check out the [documentation about CachingCompiler](https://github.com/meteor/meteor/wiki/Build-Plugins-API#caching) to learn more. It's used in all of the above examples, so you can see how to use it by looking at them.
