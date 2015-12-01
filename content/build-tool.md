# The Meteor build system

## What does it do?

The Meteor build tool is what compiles, runs, deploys, and publishes all of your Meteor apps and packages. It's Meteor's built-in solution to the problems also solved by tools like Grunt, Gulp, Webpack, Browserify, Nodemon, and many others, and uses a lot of these tools, like Babel, internally to enable a seamless experience.

### Runs constantly in development

When you run `meteor`, the tool starts up, and you should leave it running continuously while developing your app. The tool automatically detects any relevant file changes and recompiles the necessary changes, restarting your client or server environment if needed.

### Compiles files with build plugins

The main function of the Meteor build tool is to run "build plugins" - these plugins define different parts of your app build process. Meteor puts heavy emphasis on reducing or removing build configuration files, so you won't see any large build process config files like you would in Gulp or Webpack. The Meteor build process is configured almost entirely through adding and removing packages to your app, and putting files in specially named directories. For example, to get all of the newest stable ES2015 JavaScript features in your app, you just add the `ecmascript` package. As new Meteor releases add new features to this package, you'll get them for free.

### Combines and minifies code

Another important feature of the Meteor build tool is that it automatically concatenates and minifies all of your files in production mode. This is enabled by the `standard-minifiers` pacakge, which is in all Meteor apps by default. If you need different minification behavior, you can replace this package. Below, we'll talk about how to switch out your minifier to add PostCSS to your build process.

### Development vs. production

Running an app in development is all about fast iteration time. All kinds of different parts of your app are handled differently and instrumented to enable better reloads and debugging. In production, the app is reduced to just the necessary code, and functions like a regular Node.js app. Therefore, you shouldn't run your app in production by running the `meteor` command. Instead, run `meteor build` and then deploy the resulting app bundle. Read more in the [production deployment article](XXX).

## JavaScript transpilation

These days, the landscape of JavaScript tools and frameworks is constantly shifting, and the language itself is evolving just as rapidly. It's no longer reasonable to wait web browsers implementing the language features you want to use. Most JavaScript development workflows rely on compiling code to work on the lowest common denominator of environments, while letting you use the newest features in development. Meteor has support for some of the most popular tools our of the box.

### ES2015+

ECMAScript, the language standard on which every browser's JavaScript implementation is based, has moved to yearly standards releases. The newest complete standard is ES2015, which includes some long-awaited and very significant improvements to the JavaScript language. Meteor's `ecmascript` package compiles this standard down to regular JavaScript that all browsers can understand using the [popular Babel compiler](https://babeljs.io/). It's fully backwards compatible to "regular" JavaScript, so you don't have to use any new features if you don't want to. Additionally, as browser support for these features improves, we'll be able to scale back the amount of compilation necessary.

The `ecmascript` package is included in all new apps and packages by default, and compiles all files with the `.js` file extension automatically. See the [list of all ES2015 features supported by the ecmascript package](https://github.com/meteor/meteor/tree/master/packages/ecmascript#supported-es2015-features).

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

Meteor does not currently work well with TypeScript. There are some community solutions on Atmosphere and in various materials around the internet, but until Meteor 1.3 introduces a standard JavaScript module system TypeScript is not a great path for Meteor development. XXX this might change shortly after Meteor 1.3? also, talk to Uri

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

## CSS compilers

XXX

## PostCSS

XXX

## Minification

XXX

## Using NPM in your app

XXX
