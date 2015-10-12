# Building packages

In Meteor, there are two environments for writing code: apps and packages. The app environment is designed for rapid iteration and does a lot for you automatically. The package environment gives you much more control and enables you to ship more easily reusable and testable code.

You might want to build a package for two reasons:

1. You're building a medium or large-sized app following the [app structure guide](structure.md), and you want to put your app code in packages to enable better modularity and control.
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

[Read about the `package.js` API in the Meteor docs.](http://docs.meteor.com/#/full/packagejs)

## Architectures

Meteor packages are built around the idea of multiple architectures where the code might run. Here are all possible architectures for a Meteor package:


- `web` or `client` - code that runs in a web browser; can be split between Cordova and browser.
    - `web.browser`
    - `web.cordova`

Keep in mind that when your app is loaded in a mobile web browser, the `web.browser` version of the code runs; the `web.cordova` architecture is only for code that uses native Cordova plugins - more on that below.

- `os` or `server` - code that runs in a Node.js server program.
    - `os.osx.x86_64`
    - `os.linux.x86_64`
    - `os.linux.x86_32`
    - `os.windows.x86_32`


As you can see, the architecture can be specified based on operating system, but in practice this is only necessary for packages with binary NPM dependencies - more on that below.

## Semantic versioning and version constraints

Meteor's package system depends heavily on [Semantic Versioning](http://semver.org/), or SemVer. When one package declares a dependency on another, it always comes with a version constraint. These version constraints are then solved by Meteor's industrial-grade Version Solver to arrive at a set of package versions that meet all of the requirements.

The mental model here is:

1. **The major version must always match exactly.** If package `a` depends on `b@2.0.0`, the constraint will only be satisfied if the version of package `b` starts with a `2`. This means that you can never have two different major versions of a package in the same app.
2. **The minor and patch version numbers must be greater or equal to the requested version.** If the dependency requests version `2.1.3`, then `2.1.4` and `2.2.0` will work, but `2.0.4` and `2.1.2` will not.

The constraint solver is necessary because Meteor's package system is **single-loading** - that is, you can never have two different versions of the same package loaded side-by-side in the same app. This is particularly useful for packages that include a lot of client-side code, or packages that expect to be singletons.

## Cordova plugins

Meteor packages can include [Cordova plugins](http://cordova.apache.org/plugins/) to ship native code for the Meteor mobile app container. This way, you can interact with the native camera interface, use the gyroscope, save files locally, and more.

Include Cordova plugins in your Meteor package by using [Cordova.depends](http://docs.meteor.com/#/full/Cordova-depends).

Read more about using Cordova in the [mobile guide](#XXX).

## NPM packages

Meteor packages can include [NPM packages](https://www.npmjs.com/) to use JavaScript code from outside the Meteor package ecosystem, or to include JavaScript code with native dependencies.

Include NPM packages in your Meteor package by using [Npm.depends](http://docs.meteor.com/#/full/Npm-depends).

## Pre-compile native server dependencies
