---
title: Build system
---

The Meteor build system is the actual command line tool that you get when you install Meteor. You run it by typing the `meteor` command in your terminal, possibly followed by a set of arguments. Read the [docs about the command line tool](http://docs.meteor.com/#/full/commandline) or type `meteor help` in your terminal to learn about all of the commands.

## What does it do?

The Meteor build tool is what compiles, runs, deploys, and publishes all of your Meteor apps and packages. It's Meteor's built-in solution to the problems also solved by tools like Grunt, Gulp, Webpack, Browserify, Nodemon, and many others, and uses many popular Node.js tools like Babel and UglifyJS internally to enable a seamless experience.

### Reloads app on file change

When you run `meteor`, the tool starts up, and you should leave it running continuously while developing your app. The tool automatically detects any relevant file changes and recompiles the necessary changes, restarting your client or server environment if needed.

### Compiles files with build plugins

The main function of the Meteor build tool is to run "build plugins" - these plugins define different parts of your app build process. Meteor puts heavy emphasis on reducing or removing build configuration files, so you won't see any large build process config files like you would in Gulp or Webpack. The Meteor build process is configured almost entirely through adding and removing packages to your app, and putting files in specially named directories. For example, to get all of the newest stable ES2015 JavaScript features in your app, you just add the `ecmascript` package. As new Meteor releases add new features to this package, you'll get them for free.

### Combines and minifies code

Another important feature of the Meteor build tool is that it automatically concatenates and minifies all of your files in production mode. This is enabled by the `standard-minifiers` pacakge, which is in all Meteor apps by default. If you need different minification behavior, you can replace this package. Below, we'll talk about how to switch out your minifier to add PostCSS to your build process.

### Development vs. production

Running an app in development is all about fast iteration time. All kinds of different parts of your app are handled differently and instrumented to enable better reloads and debugging. In production, the app is reduced to just the necessary code, and functions like a regular Node.js app. Therefore, you shouldn't run your app in production by running the `meteor` command. Instead, run `meteor build` and then deploy the resulting app bundle. Read more in the [production deployment article](XXX).

## Using community packages

Building an application completely from scratch is a tall order. This is one of the main reasons you might consider using Meteor in the first place - you can focus on writing the code that is specific to your app, instead of reinventing wheels like user login and data synchronization. To streamline your workflow even further, it makes sense to use community packages from Atmosphere and NPM. Many of these packages are recommended in the guide, and you can find more in the online directories.

#### A note about Bower

Don't use Bower XXX link to some article explaining that people are moving to NPM for client-side JS and original maintainer left?

### Atmosphere

[Atmosphere](https://atmospherejs.com/) is a repository and discovery website for Meteor-specific packages. Packages are published on Atmosphere when they need to take advantage of features specific to Meteor, like the cross-platform build system, isomorphic client/server code, or data system.

#### Adding packages to your app

You have two options for adding packages from Atmosphere to your app:

1. Use the command line: `meteor add kadira:flow-router`
2. Edit the file in your app under `.meteor/packages`, and add the package name anywhere in the file

These options will add the newest version of the desired package that is compatible with the other packages in your app. If you want to specify a particular version, you can specify it by adding a suffix to the package name, like so: `meteor add kadira:flow-router@2.10.0`.

Regardless of how you add the package to your app, its actual version will be tracked in the file at `.meteor/versions`. This means that anybody collaborating with you on the same app is guaranteed to have the same package versions as you. If you want to update to a newer version of a package after installing it, use `meteor update kadira:flow-router`. Alternatively, you can run `meteor update` without any arguments to update all packages and the version of Meteor to their latest versions.

If your app is running when you add a new package, Meteor will automatically download it and restart your app for you.

#### Searching for packages

There are a few ways to search for Meteor packages published to Atmosphere:

1. Search on the [Atmosphere website](https://atmospherejs.com/)
2. Use `meteor search` from the command line
3. Use a community package search website like [Fastosphere](http://fastosphere.meteor.com/)

The main Atmosphere website provides additional curation features like trending packages, package stars, and flags, but some of the other options can be faster if you're trying to find a specific package. You can also use `meteor show kadira:flow-router` from the command line to see the description of a package and different available versions.

#### Package naming

You may notice that all packages on Atmosphere have a name of the form `prefix:name`. The prefix is the name of the organization or user that published the package. Meteor uses such a convention of package naming to make sure that it's clear who has published a certain package, and to avoid an ad-hoc namespacing convention.

#### Overriding packages from Atmosphere with a local version

A Meteor app can load packages in one of two ways:

1. Downloading a pre-built package from Atmosphere. The package is cached in `~/.meteor/packages` on Mac/Linux or `%LOCALAPPDATA%/.meteor/packages`, and only loaded into your app as it is built.
2. Loading the package's source code into a `packages/` directory inside your app. This lets you modify the source code of the package for your particular needs.

If you need to patch a package to do something that the published version doesn't do, then (2) is the option for you. You can even do this to load patched versions of Meteor core packages - just copy the code of the package from [Meteor's GitHub repository](https://github.com/meteor/meteor/tree/devel/packages), and edit away.

One difference between pre-published packages and local app packages is that the published packages have any binary dependencies pre-built. This should only affect a small subset of packages. If you clone the source code into your app, you need to make sure you have any compilers required by that package pre-installed.

### NPM

[NPM](http://npmjs.com/) is the most popular package repository for JavaScript packages. Historically, NPM was only used for publishing server-side Node.js packages, but is now used for a much wider variety of packages, including client/server JavaScript utilities, React components, Angular directives, and more.

#### Adding packages to your app

As of Meteor 1.3, NPM packages work seamlessly with Meteor.

XXX to be filled in by talking with Ben

#### Searching for packages

The best way to find NPM packages is by searching on [npmjs.com](https://www.npmjs.com/). There are also some websites that have special search features specifically for certain kinds of packages, like the aptly named [react-components.com](http://react-components.com/).

#### Handling callbacks in Meteor

XXX link to package building article? Or move that content here. Perhaps it should be here since building packages will be a power user only thing in 1.3?

## JavaScript transpilation

These days, the landscape of JavaScript tools and frameworks is constantly shifting, and the language itself is evolving just as rapidly. It's no longer reasonable to wait for web browsers to implement the language features you want to use. Most JavaScript development workflows rely on compiling code to work on the lowest common denominator of environments, while letting you use the newest features in development. Meteor has support for some of the most popular tools out of the box.

### ES2015+

ECMAScript, the language standard on which every browser's JavaScript implementation is based, has moved to yearly standards releases. The newest complete standard is ES2015, which includes some long-awaited and very significant improvements to the JavaScript language. Meteor's `ecmascript` package compiles this standard down to regular JavaScript that all browsers can understand using the [popular Babel compiler](https://babeljs.io/). It's fully backwards compatible to "regular" JavaScript, so you don't have to use any new features if you don't want to. Additionally, as browser support for these features improves, we'll be able to scale back the amount of compilation necessary.

The `ecmascript` package is included in all new apps and packages by default, and compiles all files with the `.js` file extension automatically. See the [list of all ES2015 features supported by the ecmascript package](https://github.com/meteor/meteor/tree/master/packages/ecmascript#supported-es2015-features).

To get the full experience, you should also use the `es5-shim` package which is included in all new apps by default. This means you can rely on runtime features like `Array#forEach` without worrying about which browsers support them.

All of the code samples in this guide and future Meteor tutorials will use all of the new ES2015 features, so we won't add any new code samples here. You can also read more about ES2015 and how to get started with it on the Meteor Blog:

- [Getting started with ES2015 and Meteor](http://info.meteor.com/blog/es2015-get-started)
- [Set up Sublime Text for ES2015](http://info.meteor.com/blog/set-up-sublime-text-for-meteor-es6-es2015-and-jsx-syntax-and-linting)
- [How much does ES2015 cost?](http://info.meteor.com/blog/how-much-does-es2015-cost)

### CoffeeScript

While we recommend using ES2015 with the `ecmascript` package as the best development experience for Meteor, everything in the platform is 100% compatible with [CoffeeScript](http://coffeescript.org/) and many people in the Meteor community prefer it.

All you need to do to use CoffeeScript is add the right package:

```sh
meteor add coffeescript
```

All code written in CoffeeScript compiles to JavaScript under the hood, and is completely compatible with any code in other packages that is written in JS or ES2015.

### TypeScript

XXX get Uri to write this section

## Templates and HTML

Since Meteor uses client-side rendering for your app's UI, all of your HTML code, UI components, and templates need to be compiled to JavaScript. There are a few options at your disposal to write your UI code.

### Blaze HTML templates

The aptly named `blaze-html-templates` package that comes with every new Meteor app by default compiles your `.html` files written using [Spacebars](XXX blaze article) into Blaze-compatible JavaScript code. You can also add `blaze-html-templates` to any of your packages to compile template files located in the package.

### Blaze Jade templates

If you don't like the Spacebars syntax Meteor uses by default and want something more concise, you can give Jade a try by using [`mquandalle:jade`](https://atmospherejs.com/mquandalle/jade). This package will compile all files in your app with the `.jade` extension into Blaze-compatible code, and can be used side-by-side with `blaze-html-templates` if you want to have some of your code in Spacebars and some in Jade.

### JSX for React

If you're building your app's UI with React, currently the most popular way to write your UI components involves JSX, an extension to JavaScript that allows you to type HTML tags that are converted to React DOM elements. To enable JSX compilation, simply add the `jsx` package to your app; you can also use the `react` meta-package which will include `jsx` for you.

#### Other options for React

If you want to use React but don't want to deal with JSX and prefer a more HTML-like syntax, there are a few community options available. One that stands out in particular is [Blaze-React](https://github.com/timbrandin/blaze-react), which simulates the entire Blaze API using React as a rendering engine.

### Angular templates

XXX ask Uri

## CSS pre-processors

It's no secret that writing raw CSS can often be a hassle - there's no way to share common CSS code between different selectors or have a consistent color scheme between different elements. CSS compilers or pre-processors solve these issues by adding extra features on top of the CSS language like variables, mixins, math, and more, and in some cases also significantly change the syntax of CSS to be easier to read and write.

### Sass, Less, or Stylus?

There are three CSS pre-processors that are particularly popular right now:

1. [Sass](http://sass-lang.com/)
2. [Less.js](http://lesscss.org/)
3. [Stylus](https://learnboost.github.io/stylus/)

They all have their pros and cons, and different people have different preferences, just like with JavaScript transpiled languages. The most popular one at the time of writing seems to be Sass with the SCSS syntax. Popular CSS frameworks like Bootstrap 4 and more are switching to Sass, and the C++ LibSass implementation appears to be faster than some of the other compilers available.

CSS framework compatibility should be a primary concern when picking a pre-processor, because a framework written with Less won't be compatible with one written in Sass.

### Source vs. import files

An important feature shared by all of the available CSS pre-processors is the ability to import files. This lets you split your CSS into smaller pieces, and provides a lot of the same benefits that you get from JavaScript modules:

1. You can control the load order of files by encoding dependencies through imports, since the load order of CSS matters
2. You can create reusable CSS "modules" that just have variables and mixins, and don't actually generate any CSS

In Meteor, each of your `.scss`, `.less`, or `.styl` source files will be one of two types: "main", or "import".

A "source" file is evaluated eagerly, and adds its compiled form to the CSS of the app immediately.

An "import" file is evaluated only if imported from some other file, and can be used to share common mixins and variables between different CSS files in your app.

Read the documentation for each package listed below to see how to indicate which files are source files vs. imports.

### Importing from a package

In all three Meteor-supported CSS pre-processors, you can import files from packages using a special syntax:

```less
@import "{my-package:pretty-buttons}/buttons/styles.import.less"
```

You can also import files with an absolute path in the app by using `{}` instead of a package name:

```less
@import "{}/client/styles/imports/colors.less"
```

Read the documentation for your favorite CSS pre-processor package to learn more about the details.

### Sass

The best Sass build plugin for Meteor is [`fourseven:scss`](https://atmospherejs.com/fourseven/scss).

### Less

Less is maintained as a [Meteor core package called `less`](https://atmospherejs.com/meteor/less).

### Stylus

Stylus is maintained as a [Meteor core package called `stylus`](https://atmospherejs.com/meteor/stylus).

## PostCSS and Autoprefixer

In addition to CSS pre-processors like Sass, Less, and Stylus, there is now an ecosystem of CSS post-processors. Regardless of which CSS pre-processor you use, a post-processor can give you additional benefits like cross-browser compatibility.

The most popular CSS post-processor right now is [PostCSS](https://github.com/postcss/postcss), which supports a variety of plugins. [Autoprefixer](https://github.com/postcss/autoprefixer) is perhaps the most useful plugin, since it enables you to stop worrying about browser prefixes and compatibility and write standards-compliant CSS. No more copying 5 different statements every time you want a CSS gradient - you can just write a standard gradient without any prefixes and Autoprefixer handles it for you.

Currently, Meteor doesn't have a separate build step for post-processing CSS, so the only way to integrate it is to build it into the minifier. Thankfully, there is a community package that has integrated PostCSS with plugin support into a replacement for Meteor's standard minification package.

### juliancwirko:postcss

Use the package [juliancwirko:postcss](https://atmospherejs.com/juliancwirko/postcss) to your app to enable PostCSS for your Meteor app. It's not completely trivial to set it up, and we hope to make support for PostCSS a more core part of Meteor in the future. Read the documentation for the package to get the steps to add it to your app; we won't reproduce them here since they might change in future versions.

// XXX do we want to do the above? Or should we reproduce the directions?

## Minification

The current best practice for deploying web production applications is to concatenate and minify all of your app assets. This lets you add all of the comments and whitespace you want to your source code, and split it into as many files as is necessary without worrying about app performance.

Every Meteor app comes with production minification by default with the `standard-minifiers` package. This minifier goes to some extra effort to do a good job - for example, Meteor automatically splits up your files if they get too big to maintain support for older versions of Internet Explorer which had a limit on the number of CSS rules per file.

Minification usually happens when you `meteor deploy` or `meteor build` your app. If you have an error in production that you suspect is related to minification, you can run the minified version of your app locally with `meteor --production`.
