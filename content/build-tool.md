---
title: Build system
order: 33
description: How to use Meteor's build system to compile your app.
discourseTopicId: 19669
---

The Meteor build system is the actual command line tool that you get when you install Meteor. You run it by typing the `meteor` command in your terminal, possibly followed by a set of arguments. Read the [docs about the command line tool](http://docs.meteor.com/#/full/commandline) or type `meteor help` in your terminal to learn about all of the commands.

<h2 id="what-it-does">What does it do?</h2>

The Meteor build tool is what compiles, runs, deploys, and publishes all of your Meteor apps and packages. It's Meteor's built-in solution to the problems also solved by tools like Grunt, Gulp, Webpack, Browserify, Nodemon, and many others, and uses many popular Node.js tools like Babel and UglifyJS internally to enable a seamless experience.

<h3 id="reload-on-file-change">Reloads app on file change</h3>

When you run `meteor`, the tool starts up, and you should leave it running continuously while developing your app. The tool automatically detects any relevant file changes and recompiles the necessary changes, restarting your client or server environment if needed.

<h3 id="compiles-with-build-plugins">Compiles files with build plugins</h3>

The main function of the Meteor build tool is to run "build plugins" - these plugins define different parts of your app build process. Meteor puts heavy emphasis on reducing or removing build configuration files, so you won't see any large build process config files like you would in Gulp or Webpack. The Meteor build process is configured almost entirely through adding and removing packages to your app, and putting files in specially named directories. For example, to get all of the newest stable ES2015 JavaScript features in your app, you just add the `ecmascript` package. As new Meteor releases add new features to this package, you'll get them for free.

<h3 id="concatenate-and-minify">Combines and minifies code</h3>

Another important feature of the Meteor build tool is that it automatically concatenates and minifies all of your files in production mode. This is enabled by the [`standard-minifier-js`](https://atmospherejs.com/meteor/standard-minifiers-js) and [`standard-minifier-css`](https://atmospherejs.com/meteor/standard-minifiers-css) packages, which are in all Meteor apps by default. If you need different minification behavior, you can replace these packages. Below, we'll talk about how to [switch out a minifier to add PostCSS to your build process](#postcss).

<h3 id="dev-vs-prod">Development vs. production</h3>

Running an app in development is all about fast iteration time. All kinds of different parts of your app are handled differently and instrumented to enable better reloads and debugging. In production, the app is reduced to just the necessary code, and functions like a regular Node.js app. Therefore, you shouldn't run your app in production by running the `meteor` command. Instead, follow the directions in the [production deployment article](deployment.html#custom-deployment).

<h2 id="javascript-transpilation">JavaScript transpilation</h2>

These days, the landscape of JavaScript tools and frameworks is constantly shifting, and the language itself is evolving just as rapidly. It's no longer reasonable to wait for web browsers to implement the language features you want to use. Most JavaScript development workflows rely on compiling code to work on the lowest common denominator of environments, while letting you use the newest features in development. Meteor has support for some of the most popular tools out of the box.

<h3 id="es2015">ES2015+ (recommended)</h3>

The `ecmascript` package (which is installed into all new apps and packages by default, but can be removed), allows support for many ES2015 features. We recommend using it. You can read more about it in the [Code Style](code-style.html#ecmascript) article.

<h3 id="coffeescript">CoffeeScript</h3>

While we recommend using ES2015 with the `ecmascript` package as the best development experience for Meteor, everything in the platform is 100% compatible with [CoffeeScript](http://coffeescript.org/) and many people in the Meteor community prefer it.

All you need to do to use CoffeeScript is add the right Meteor package:

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

If you're building your app's UI with React, currently the most popular way to write your UI components involves JSX, an extension to JavaScript that allows you to type HTML tags that are converted to React DOM elements. JSX code is handled automatically by the `ecmascript` package.

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

In Meteor, each of your `.scss`, `.less`, or `.styl` source files will be one of two types: "source" or "import".

A "source" file is evaluated eagerly and adds its compiled form to the CSS of the app immediately.

An "import" file is evaluated only if imported from some other file and can be used to share common mixins and variables between different CSS files in your app.

Read the documentation for each package listed below to see how to indicate which files are source files vs. imports.

<h3 id="css-importing">Importing styles</h3>

In all three Meteor-supported CSS pre-processors you can import files from an absolute path in your app by using the special `{}` syntax:

```less
@import '{}/imports/ui/stylesheets/button.less';
```

To import files from a Meteor Atmosphere packages using this special package name syntax:

```less
@import "{my-package:pretty-buttons}/buttons/styles.import.less";
```

> It is currently not possible to import non-CSS assets from npm packages in `node_modules` using the Meteor build tool. There are various potential workarounds such as creating a symbolic link to the asset file in node_modules from somewhere else in your app `ln -s /path/to/node_modules/package-name/style.scss /path/to/app/imports/ui/style.scss` and importing it from there `@import '{}/imports/ui/style.scss';` or try using an alternative pre-processor tool with [npm scripts](https://github.com/tableflip/meteor-sass-bootstrap4) or try using this configuration of [PostCSS](https://github.com/juliancwirko/meteor-bootstrap-postcss-test).

For more details using `@imports` with packages see [Using Packages](using-packages.html) in the Meteor Guide.

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

Use the package [juliancwirko:postcss](https://atmospherejs.com/juliancwirko/postcss) to your app to enable PostCSS for your Meteor app. To do so, we remove the standard CSS minifier and replace it with the postcss package:

```
meteor remove standard-minifier-css
meteor add juliancwirko:postcss
```

Then we can install any npm CSS processing packages that we'd like to use and reference them from a `postcss` section of our `package.json`. In the Todos example app, we use `autoprefixer` package to increase browser support:

```
{
  "devDependencies": {
    "autoprefixer": "^6.3.1"
  },
  "postcss": {
    "plugins": {
      "autoprefixer": {"browsers": ["last 2 versions"]}
    }
  }
}
```

After doing the above, you'll need to ensure you `npm install` and restart the `meteor` process running your app to make sure the PostCSS system has had a chance to set itself up.

<h2 id="minification">Minification</h2>

The current best practice for deploying web production applications is to concatenate and minify all of your app assets. This lets you add all of the comments and whitespace you want to your source code, and split it into as many files as is necessary without worrying about app performance.

Every Meteor app comes with production minification by default with the `standard-minifier-js` and `standard-minifier-css` packages. These minifiers go to some extra effort to do a good job - for example, Meteor automatically splits up your files if they get too big to maintain support for older versions of Internet Explorer which had a limit on the number of CSS rules per file.

Minification usually happens when you `meteor deploy` or `meteor build` your app. If you have an error in production that you suspect is related to minification, you can run the minified version of your app locally with `meteor --production`.
