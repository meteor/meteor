---
title: Build system
order: 12
description: How to use Meteor's build system to compile your app, and use packages from Atmosphere and NPM.
---

The Meteor build system is the actual command line tool that you get when you install Meteor. You run it by typing the `meteor` command in your terminal, possibly followed by a set of arguments. Read the [docs about the command line tool](http://docs.meteor.com/#/full/commandline) or type `meteor help` in your terminal to learn about all of the commands.

<h2 id="what-it-does">What does it do?</h2>

The Meteor build tool is what compiles, runs, deploys, and publishes all of your Meteor apps and packages. It's Meteor's built-in solution to the problems also solved by tools like Grunt, Gulp, Webpack, Browserify, Nodemon, and many others, and uses many popular Node.js tools like Babel and UglifyJS internally to enable a seamless experience.

<h3 id="reload-on-file-change">Reloads app on file change</h3>

When you run `meteor`, the tool starts up, and you should leave it running continuously while developing your app. The tool automatically detects any relevant file changes and recompiles the necessary changes, restarting your client or server environment if needed.

<h3 id="compiles-with-build-plugins">Compiles files with build plugins</h3>

The main function of the Meteor build tool is to run "build plugins" - these plugins define different parts of your app build process. Meteor puts heavy emphasis on reducing or removing build configuration files, so you won't see any large build process config files like you would in Gulp or Webpack. The Meteor build process is configured almost entirely through adding and removing packages to your app, and putting files in specially named directories. For example, to get all of the newest stable ES2015 JavaScript features in your app, you just add the `ecmascript` package. As new Meteor releases add new features to this package, you'll get them for free.

<h3 id="concatenate-and-minify">Combines and minifies code</h3>

Another important feature of the Meteor build tool is that it automatically concatenates and minifies all of your files in production mode. This is enabled by the `standard-minifiers` package, which is in all Meteor apps by default. If you need different minification behavior, you can replace this package. Below, we'll talk about how to [switch out your minifier to add PostCSS to your build process](#postcss).

<h3 id="dev-vs-prod">Development vs. production</h3>

Running an app in development is all about fast iteration time. All kinds of different parts of your app are handled differently and instrumented to enable better reloads and debugging. In production, the app is reduced to just the necessary code, and functions like a regular Node.js app. Therefore, you shouldn't run your app in production by running the `meteor` command. Instead, follow the directions in the [production deployment article](deployment.html#custom-deployment).

<h2 id="using-packages">Using community packages</h2>

Building an application completely from scratch is a tall order. This is one of the main reasons you might consider using Meteor in the first place - you can focus on writing the code that is specific to your app, instead of reinventing wheels like user login and data synchronization. To streamline your workflow even further, it makes sense to use community packages from Atmosphere and NPM. Many of these packages are recommended in the guide, and you can find more in the online directories.

<h3 id="atmosphere">Atmosphere</h3>

[Atmosphere](https://atmospherejs.com/) is a repository and discovery website for Meteor-specific packages. Packages are published on Atmosphere when they need to take advantage of features specific to Meteor, like the cross-platform build system, isomorphic client/server code, or data system.

<h4 id="atmosphere-adding">Adding packages to your app</h4>

You have two options for adding packages from Atmosphere to your app:

1. Use the command line: `meteor add kadira:flow-router`.
2. Edit the file in your app under `.meteor/packages`, and add the package name anywhere in the file.

These options will add the newest version of the desired package that is compatible with the other packages in your app. If you want to specify a particular version, you can specify it by adding a suffix to the package name, like so: `meteor add kadira:flow-router@2.10.0`.

Regardless of how you add the package to your app, its actual version will be tracked in the file at `.meteor/versions`. This means that anybody collaborating with you on the same app is guaranteed to have the same package versions as you. If you want to update to a newer version of a package after installing it, use `meteor update`. You can run `meteor update` without any arguments to update all packages and Meteor itself to their latest versions, or pass a specific package to update just that one, for example `meteor update kadira:flow-router`.

If your app is running when you add a new package, Meteor will automatically download it and restart your app for you.

<h4 id="atmosphere-searching">Searching for packages</h4>

There are a few ways to search for Meteor packages published to Atmosphere:

1. Search on the [Atmosphere website](https://atmospherejs.com/).
2. Use `meteor search` from the command line.
3. Use a community package search website like [Fastosphere](http://fastosphere.meteor.com/).

The main Atmosphere website provides additional curation features like trending packages, package stars, and flags, but some of the other options can be faster if you're trying to find a specific package. For example, you can use `meteor show kadira:flow-router` from the command line to see the description of that package and different available versions.

<h4 id="atmosphere-naming">Package naming</h4>

You may notice that, with the exception of Meteor platform packages, all packages on Atmosphere have a name of the form `prefix:name`. The prefix is the name of the organization or user that published the package. Meteor uses such a convention of package naming to make sure that it's clear who has published a certain package, and to avoid an ad-hoc namespacing convention. Meteor platform packages do not have any `prefix:`.

<h4 id="atmosphere-overriding">Overriding packages from Atmosphere with a local version</h4>

A Meteor app can load packages in one of three ways, and it looks for a matching package name in the following order:

1. Package source code in the `packages/` directory inside your app.
2. Package source code in directories indicated by setting a `PACKAGE_DIRS` environment variable before running any `meteor` command. You can add multiple directories by separating the paths with a `:` on OSX or Linux, or a `;` on Windows. For example: `PACKAGE_DIRS=../first/directory:../second/directory`, or on Windows: `set PACKAGE_DIRS=..\first\directory;..\second\directory`.
3. Pre-built package from Atmosphere. The package is cached in `~/.meteor/packages` on Mac/Linux or `%LOCALAPPDATA%\.meteor\packages` on Windows, and only loaded into your app as it is built.

If you need to patch a package to do something that the published version doesn't do, then you can use (1) or (2) to override the version from Atmosphere. You can even do this to load patched versions of Meteor core packages - just copy the code of the package from [Meteor's GitHub repository](https://github.com/meteor/meteor/tree/devel/packages), and edit away.

One difference between pre-published packages and local app packages is that the published packages have any binary dependencies pre-built. This should only affect a small subset of packages. If you clone the source code into your app, you need to make sure you have any compilers required by that package.

<h3 id="npm">NPM</h3>

[NPM](http://npmjs.com/) is the most popular package repository for JavaScript packages. Historically, NPM was only used for publishing server-side Node.js packages, but is now used for a much wider variety of packages, including client/server JavaScript utilities, React components, Angular directives, and more.

<h4 id="npm-adding">Adding packages to your app</h4>

Meteor 1.3 will have seamless integration with NPM, and you will be able to simply `npm install` these packages into your app directory. Until then, the easiest way to use NPM packages in your app is [`meteorhacks:npm`](https://atmospherejs.com/meteorhacks/npm).

<h4 id="npm-searching">Searching for packages</h4>

The best way to find NPM packages is by searching on [npmjs.com](https://www.npmjs.com/). There are also some websites that have special search features specifically for certain kinds of packages, like the aptly named [react-components.com](http://react-components.com/).

<h3 id="npm-callbacks">Handling NPM callbacks</h3>

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

<h4 id="meteor-bindenvironment">Option 1: Meteor.bindEnvironment</h4>

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

<h4 id="meteor-wrapasync">Option 2: Meteor.wrapAsync</h4>

Many NPM packages adopt the convention of taking a callback that accepts `(err, res)` arguments. If your asynchronous function fits this description, like the one above, you can use `Meteor.wrapAsync` to convert to a fiberized API that uses return values and exceptions instead of callbacks, like so:

```js
// Setup sync API
const getFollowingFromUser =
  Meteor.wrapAsync(github.user.getFollowingFromUser, github.user);

// Inside a Meteor method definition
updateGitHubFollowers() {
  const result = getFollowingFromUser({
    user: 'stubailo'
  });

  Followers.insert(result);

  // Return how many followers we have
  return result.length;
}
```

If you wanted to refactor this and create a completely fiber-wrapper GitHub client, you could write some logic to loop over all of the methods available and call `Meteor.wrapAsync` on them, creating a new object with the same shape but with a more Meteor-compatible API.

<h4 id="async-promises">Option 3: Promises</h4>

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

<h3 id="client-npm">NPM on the client</h3>

NPM started as a package manager for Node.js, but is quickly becoming one of the most popular places to publish client-side modules as well. Meteor 1.3 will include built-in support for bundling NPM modules on the client, but in the meantime the best option is to use the [`cosmos:browserify`](https://atmospherejs.com/cosmos/browserify) package to bundle these modules. Since one of the most common scenarios is using React components from NPM, read about how to do this in the [React in Meteor guide](http://react-in-meteor.readthedocs.org/en/latest/client-npm/).

<h2 id="javascript-transpilation">JavaScript transpilation</h2>

These days, the landscape of JavaScript tools and frameworks is constantly shifting, and the language itself is evolving just as rapidly. It's no longer reasonable to wait for web browsers to implement the language features you want to use. Most JavaScript development workflows rely on compiling code to work on the lowest common denominator of environments, while letting you use the newest features in development. Meteor has support for some of the most popular tools out of the box.

<h3 id="es2015">ES2015+ (recommended)</h3>

ECMAScript, the language standard on which every browser's JavaScript implementation is based, has moved to yearly standards releases. The newest complete standard is ES2015, which includes some long-awaited and very significant improvements to the JavaScript language. Meteor's `ecmascript` package compiles this standard down to regular JavaScript that all browsers can understand using the [popular Babel compiler](https://babeljs.io/). It's fully backwards compatible to "regular" JavaScript, so you don't have to use any new features if you don't want to. Additionally, as browser support for these features improves, we'll be able to scale back the amount of compilation necessary.

The `ecmascript` package is included in all new apps and packages by default, and compiles all files with the `.js` file extension automatically. See the [list of all ES2015 features supported by the ecmascript package](https://github.com/meteor/meteor/tree/master/packages/ecmascript#supported-es2015-features).

To get the full experience, you should also use the `es5-shim` package which is included in all new apps by default. This means you can rely on runtime features like `Array#forEach` without worrying about which browsers support them.

All of the code samples in this guide and future Meteor tutorials will use all of the new ES2015 features, so we won't add any new code samples here. You can also read more about ES2015 and how to get started with it on the Meteor Blog:

- [Getting started with ES2015 and Meteor](http://info.meteor.com/blog/es2015-get-started)
- [Set up Sublime Text for ES2015](http://info.meteor.com/blog/set-up-sublime-text-for-meteor-es6-es2015-and-jsx-syntax-and-linting)
- [How much does ES2015 cost?](http://info.meteor.com/blog/how-much-does-es2015-cost)

<h3 id="coffeescript">CoffeeScript</h3>

While we recommend using ES2015 with the `ecmascript` package as the best development experience for Meteor, everything in the platform is 100% compatible with [CoffeeScript](http://coffeescript.org/) and many people in the Meteor community prefer it.

All you need to do to use CoffeeScript is add the right package:

```sh
meteor add coffeescript
```

All code written in CoffeeScript compiles to JavaScript under the hood, and is completely compatible with any code in other packages that is written in JS or ES2015.

<h2 id="blaze-templates">Templates and HTML</h2>

Since Meteor uses client-side rendering for your app's UI, all of your HTML code, UI components, and templates need to be compiled to JavaScript. There are a few options at your disposal to write your UI code.

<h3 id="blaze-spacebars">Blaze HTML templates</h3>

The aptly named `blaze-html-templates` package that comes with every new Meteor app by default compiles your `.html` files written using [Spacebars](blaze.html#spacebars) into Blaze-compatible JavaScript code. You can also add `blaze-html-templates` to any of your packages to compile template files located in the package.

[Read about how to use Blaze and Spacebars in the Blaze article.](blaze.html)

<h3 id="blaze-jade">Blaze Jade templates</h3>

If you don't like the Spacebars syntax Meteor uses by default and want something more concise, you can give Jade a try by using [`dalgard:jade`](https://atmospherejs.com/dalgard/jade). This package will compile all files in your app with the `.jade` extension into Blaze-compatible code, and can be used side-by-side with `blaze-html-templates` if you want to have some of your code in Spacebars and some in Jade.

<h3 id="react-jsx">JSX for React</h3>

If you're building your app's UI with React, currently the most popular way to write your UI components involves JSX, an extension to JavaScript that allows you to type HTML tags that are converted to React DOM elements. To enable JSX compilation, simply add the `jsx` package to your app; you can also use the `react` meta-package which will include `jsx` for you.

<h4 id="react-other">Other options for React</h4>

If you want to use React but don't want to deal with JSX and prefer a more HTML-like syntax, there are a few community options available. One that stands out in particular is [Blaze-React](https://github.com/timbrandin/blaze-react), which simulates the entire Blaze API using React as a rendering engine.

<h3 id="angular-templates">Angular templates</h3>

If you would like to write your UI in Angular, you will need to switch out Meteor's Blaze template compiler which comes by default with the Angular one. Read about how to do this in the [Angular-Meteor tutorial](https://www.meteor.com/tutorials/angular/templates).

<h2 id="css">CSS pre-processors</h2>

It's no secret that writing raw CSS can often be a hassle - there's no way to share common CSS code between different selectors or have a consistent color scheme between different elements. CSS compilers or pre-processors solve these issues by adding extra features on top of the CSS language like variables, mixins, math, and more, and in some cases also significantly change the syntax of CSS to be easier to read and write.

<h3 id="css-which-preprocessor">Sass, Less, or Stylus?</h3>

There are three CSS pre-processors that are particularly popular right now:

1. [Sass](http://sass-lang.com/)
2. [Less.js](http://lesscss.org/)
3. [Stylus](https://learnboost.github.io/stylus/)

They all have their pros and cons, and different people have different preferences, just like with JavaScript transpiled languages. The most popular one at the time of writing seems to be Sass with the SCSS syntax. Popular CSS frameworks like Bootstrap 4 and more are switching to Sass, and the C++ LibSass implementation appears to be faster than some of the other compilers available.

CSS framework compatibility should be a primary concern when picking a pre-processor, because a framework written with Less won't be compatible with one written in Sass.

<h3 id="css-source-vs-import">Source vs. import files</h3>

An important feature shared by all of the available CSS pre-processors is the ability to import files. This lets you split your CSS into smaller pieces, and provides a lot of the same benefits that you get from JavaScript modules:

1. You can control the load order of files by encoding dependencies through imports, since the load order of CSS matters.
2. You can create reusable CSS "modules" that just have variables and mixins, and don't actually generate any CSS.

In Meteor, each of your `.scss`, `.less`, or `.styl` source files will be one of two types: "source", or "import".

A "source" file is evaluated eagerly, and adds its compiled form to the CSS of the app immediately.

An "import" file is evaluated only if imported from some other file, and can be used to share common mixins and variables between different CSS files in your app.

Read the documentation for each package listed below to see how to indicate which files are source files vs. imports.

<h3 id="css-importing-from-package">Importing from a package</h3>

In all three Meteor-supported CSS pre-processors, you can import files from packages using a special syntax:

```less
@import "{my-package:pretty-buttons}/buttons/styles.import.less"
```

You can also import files with an absolute path in the app by using `{}` instead of a package name:

```less
@import "{}/client/styles/imports/colors.less"
```

Read the documentation for your favorite CSS pre-processor package to learn more about the details.

<h3 id="sass">Sass</h3>

The best Sass build plugin for Meteor is [`fourseven:scss`](https://atmospherejs.com/fourseven/scss).

<h3 id="less">Less</h3>

Less is maintained as a [Meteor core package called `less`](https://atmospherejs.com/meteor/less).

<h3 id="stylus">Stylus</h3>

Stylus is maintained as a [Meteor core package called `stylus`](https://atmospherejs.com/meteor/stylus).

<h2 id="postcss">PostCSS and Autoprefixer</h2>

In addition to CSS pre-processors like Sass, Less, and Stylus, there is now an ecosystem of CSS post-processors. Regardless of which CSS pre-processor you use, a post-processor can give you additional benefits like cross-browser compatibility.

The most popular CSS post-processor right now is [PostCSS](https://github.com/postcss/postcss), which supports a variety of plugins. [Autoprefixer](https://github.com/postcss/autoprefixer) is perhaps the most useful plugin, since it enables you to stop worrying about browser prefixes and compatibility and write standards-compliant CSS. No more copying 5 different statements every time you want a CSS gradient - you can just write a standard gradient without any prefixes and Autoprefixer handles it for you.

Currently, Meteor doesn't have a separate build step for post-processing CSS, so the only way to integrate it is to build it into the minifier. Thankfully, there is a community package that has integrated PostCSS with plugin support into a replacement for Meteor's standard minification package.

<h3 id="juliancwirko-postcss">juliancwirko:postcss</h3>

Use the package [juliancwirko:postcss](https://atmospherejs.com/juliancwirko/postcss) to your app to enable PostCSS for your Meteor app. It's not completely trivial to set it up, and we hope to make support for PostCSS a more core part of Meteor in the future. Read the documentation for the package to get the steps to add it to your app; we won't reproduce the instructions here since they might change in future versions.

<h2 id="minification">Minification</h2>

The current best practice for deploying web production applications is to concatenate and minify all of your app assets. This lets you add all of the comments and whitespace you want to your source code, and split it into as many files as is necessary without worrying about app performance.

Every Meteor app comes with production minification by default with the `standard-minifiers` package. This minifier goes to some extra effort to do a good job - for example, Meteor automatically splits up your files if they get too big to maintain support for older versions of Internet Explorer which had a limit on the number of CSS rules per file.

Minification usually happens when you `meteor deploy` or `meteor build` your app. If you have an error in production that you suspect is related to minification, you can run the minified version of your app locally with `meteor --production`.
