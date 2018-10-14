---
title: Build System
description: How to use Meteor's build system to compile your app.
discourseTopicId: 19669
---

The Meteor build system is the actual command line tool that you get when you install Meteor. You run it by typing the `meteor` command in your terminal, possibly followed by a set of arguments. Read the [docs about the command line tool](https://docs.meteor.com/commandline.html) or type `meteor help` in your terminal to learn about all of the commands.

<h2 id="what-it-does">What does it do?</h2>

The Meteor build tool is what compiles, runs, deploys, and publishes all of your Meteor apps and packages. It's Meteor's built-in solution to the problems also solved by tools like Grunt, Gulp, Webpack, Browserify, Nodemon, and many others, and uses many popular Node.js tools like Babel and UglifyJS internally to enable a seamless experience.

<h3 id="reload-on-file-change">Reloads app on file change</h3>

After executing the `meteor` command to start the build tool you should leave it running while further developing your app. The build tool automatically detects any relevant file changes using a file watching system and recompiles the necessary changes, restarting your client or server environment as needed.

<h3 id="compiles-with-build-plugins">Compiles files with build plugins</h3>

The main function of the Meteor build tool is to run "build plugins". These plugins define different parts of your app build process. Meteor puts heavy emphasis on reducing or removing build configuration files, so you won't see any large build process config files like you would in Gulp or Webpack. The Meteor build process is configured almost entirely through adding and removing packages to your app and putting files in specially named directories. For example, to get all of the newest stable ES2015 JavaScript features in your app, you add the [`ecmascript` package](http://docs.meteor.com/#/full/ecmascript). This package provides support for ES2015 modules, which gives you even more fine grained control over file load order using ES2015 `import` and `export`. As new Meteor releases add new features to this package you get them for free.

<h4 id="controlling-build-files">Controlling which files to build</h4>

By default Meteor will build certain files as controlled by your application [file structure](structure.html#javascript-structure) and Meteor's [default file load order](structure.html#load-order) rules. However, you may override the default behavior using `.meteorignore` files, which cause the build system to ignore certain files and directories using the same pattern syntax as `.gitignore` files. These files may appear in any directory of your app or package, specifying rules for the directory tree below them. These `.meteorignore` files are also fully integrated with Meteor's file watching system, so they can be added, removed, or modified during development.

<h3 id="concatenate-and-minify">Combines and minifies code</h3>

Another important feature of the Meteor build tool is that it automatically concatenates your application asset files, and in production minifies these bundles. This lets you add all of the comments and whitespace you want to your source code and split your code into as many files as necessary, all without worrying about app performance and load times. This is enabled by the [`standard-minifier-js`](https://atmospherejs.com/meteor/standard-minifiers-js) and [`standard-minifier-css`](https://atmospherejs.com/meteor/standard-minifiers-css) packages, which are included in all Meteor apps by default. If you need different minification behavior, you can replace these packages. See adding [PostCSS to your build process](#postcss) as an example.

<h3 id="dev-vs-prod">Development vs. production</h3>

Running an app in development is all about fast iteration time. All kinds of different parts of your app are handled differently and instrumented to enable better reloads and debugging. In production, the app is reduced to the necessary code and functions just like any standard Node.js app. Therefore, you shouldn't run your app in production by executing the `meteor run` command. Instead, follow the directions in [Deploying Meteor Applications](deployment.html#deploying). If you find an error in production that you suspect is related to minification, you can run the minified version of your app locally for testing with `meteor --production`.

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

<h3 id="typescript">TypeScript</h3>

[TypeScript](https://www.typescriptlang.org/) is modern JavaScript with optional types and more.

Adding types will make your code more readable and less prone to runtime errors.

TypeScript can be installed with:

```sh
meteor remove ecmascript
meteor add barbatus:typescript
```

It is necessary to configure the TypeScript compiler with a `tsconfig.json` file.

A complete guide on installation, configuration, and usage of TypeScript, and how type definitions for libraries are installed, can be found [here](https://medium.com/@birkskyum/modern-meteor-development-with-typescript-introduction-836f2a89f79).

The guide also includes sample applications created with Angular, React, Vue, and Blaze—all written in TypeScript. See the code [here](https://github.com/birkskyum/meteor-typescript-samples).

<h4 id="typescript-conditional-imports">Conditional imports</h4>

TypeScript does not support nested `import` statements, therefore conditionally importing modules requires you to use the `require` statement (see [Using `require`](https://guide.meteor.com/structure.html#using-require)).

To maintain type safety, you can take advantage of TypeScript's import elision and reference the types using the `typeof` keyword. See the [TypeScript handbook article](https://www.typescriptlang.org/docs/handbook/modules.html#optional-module-loading-and-other-advanced-loading-scenarios) for details or [this blog post](http://ideasintosoftware.com/typescript-conditional-imports/) for a concrete Meteor example.

<h2 id="blaze-templates">Templates and HTML</h2>

Since Meteor uses client-side rendering for your app's UI, all of your HTML code, UI components, and templates need to be compiled to JavaScript. There are a few options at your disposal to write your UI code.

<h3 id="blaze-spacebars">Blaze HTML templates</h3>

The aptly named `blaze-html-templates` package that comes with every new Meteor app by default compiles your `.html` files written using [Spacebars](http://blazejs.org/api/spacebars.html) into Blaze-compatible JavaScript code. You can also add `blaze-html-templates` to any of your packages to compile template files located in the package.

[Read about how to use Blaze and Spacebars in the Blaze article.](http://blazejs.org/guide/spacebars.html)

<h3 id="blaze-jade">Blaze Jade templates</h3>

If you don't like the Spacebars syntax Meteor uses by default and want something more concise, you can give Jade a try by using [`pacreach:jade`](https://atmospherejs.com/pacreach/jade). This package will compile all files in your app with the `.jade` extension into Blaze-compatible code, and can be used side-by-side with `blaze-html-templates` if you want to have some of your code in Spacebars and some in Jade.

<h3 id="react-jsx">JSX for React</h3>

If you're building your app's UI with React, currently the most popular way to write your UI components involves JSX, an extension to JavaScript that allows you to type HTML tags that are converted to React DOM elements. JSX code is handled automatically by the `ecmascript` package.

<h4 id="react-other">Other options for React</h4>

If you want to use React but don't want to deal with JSX and prefer a more HTML-like syntax, there are a few community options available. One that stands out in particular is [Blaze-React](https://github.com/timbrandin/blaze-react), which simulates the entire Blaze API using React as a rendering engine.

<h3 id="angular-templates">Angular templates</h3>

If you would like to write your UI in Angular, you will need to switch out Meteor's Blaze template compiler which comes by default with the Angular one. Read about how to do this in the [Angular-Meteor tutorial](https://www.meteor.com/tutorials/angular/templates).

<h2 id="css">CSS processing</h2>

All your CSS style files will processed using Meteor's default file load order rules along with any import statements and concatenated into a single stylesheet, `merged-stylesheets.css`. In a production build this file is also minified. By default this single stylesheet is injected at the beginning of the HTML `<head />` section of your application.

However, this can potentially be an issue for some applications that use a third party UI framework, such as Bootstrap, which is loaded from a CDN. This could cause Bootstrap's CSS to come after your CSS and override your user-defined styles.

To get around this problem Meteor supports the use of a pseudo tag `<meteor-bundled-css />` that if placed anywhere in the `<head />` section your app will be replaced by a link to this concatenated CSS file. If this pseudo tag isn't used, the CSS file will be placed at the beginning of the <head /> section as before.

<h3 id="css-which-preprocessor">CSS pre-processors</h3>

It's no secret that writing plain CSS can often be a hassle as there's no way to share common CSS code between different selectors or have a consistent color scheme between different elements. CSS compilers, or pre-processors, solve these issues by adding extra features on top of the CSS language like variables, mixins, math, and more, and in some cases also significantly change the syntax of CSS to be easier to read and write.

Here are three example CSS pre-processors supported by Meteor:

1. [Sass](http://sass-lang.com/)
2. [Less.js](http://lesscss.org/)
3. [Stylus](https://learnboost.github.io/stylus/)

They all have their pros and cons, and different people have different preferences, just like with JavaScript transpiled languages. Sass with the SCSS syntax is quite popular as CSS frameworks like Bootstrap 4 have switched to Sass, and the C++ LibSass implementation appears to be faster than some of the other compilers available.

CSS framework compatibility should be a primary concern when picking a pre-processor, because a framework written with Less won't be compatible with one written in Sass.

<h3 id="css-source-vs-import">Source vs. import files</h3>

An important feature shared by all of the available CSS pre-processors is the ability to import files. This lets you split your CSS into smaller pieces, and provides a lot of the same benefits that you get from JavaScript modules:

1. You can control the load order of files by encoding dependencies through imports, since the load order of CSS matters.
2. You can create reusable CSS "modules" that only have variables and mixins and don't actually generate any CSS.

In Meteor, each of your `.scss`, `.less`, or `.styl` source files will be one of two types: "source" or "import".

A "source" file is evaluated eagerly and adds its compiled form to the CSS of the app immediately.

An "import" file is evaluated only if imported from some other file and can be used to share common mixins and variables between different CSS files in your app.

Read the documentation for each package listed below to see how to indicate which files are source files vs. imports.

<h3 id="css-importing">Importing styles</h3>

In all three Meteor supported CSS pre-processors you can import other style files from both relative and absolute paths in your app and from both npm and Meteor Atmosphere packages.

```less
@import '../stylesheets/colors.less';   // a relative path
@import '{}/imports/ui/stylesheets/button.less';   // absolute path with `{}` syntax
```

You can also import CSS from a JavaScript file if you have the `ecmascript` package installed:

```js
import '../stylesheets/styles.css';
```

> When importing CSS from a JavaScript file, that CSS is not bundled with the rest of the CSS processed with the Meteor build tool, but instead is put in your app's `<head>` tag inside `<style>...</style>` after the main concatenated CSS file.

Importing styles from an Atmosphere package using the `{}` package name syntax:

```less
@import '{my-package:pretty-buttons}/buttons/styles.import.less';
```

> CSS files in an Atmosphere package are declared with [`api.addFiles`](http://docs.meteor.com/#/full/pack_addFiles), and therefore will be eagerly evaluated, and automatically bundled with all the other CSS in your app.

Importing styles from an npm package using the `{}` syntax:

```less
@import '{}/node_modules/npm-package-name/button.less';
```
```js
import 'npm-package-name/stylesheets/styles.css';
```

For more examples and details on importing styles and using `@imports` with packages see the [Using Packages](using-packages.html#npm-styles) article.

<h3 id="sass">Sass</h3>

The best Sass build plugin for Meteor is [`fourseven:scss`](https://atmospherejs.com/fourseven/scss).

<h3 id="less">Less</h3>

Less is maintained as a [Meteor core package called `less`](https://atmospherejs.com/meteor/less).

<h3 id="stylus">Stylus</h3>

The best Stylus build plugin for Meteor is [coagmano:stylus](https://atmospherejs.com/coagmano/stylus)

<h2 id="postcss">PostCSS and Autoprefixer</h2>

In addition to CSS pre-processors like Sass, Less, and Stylus, there is now an ecosystem of CSS post-processors. Regardless of which CSS pre-processor you use, a post-processor can give you additional benefits like cross-browser compatibility.

The most popular CSS post-processor right now is [PostCSS](https://github.com/postcss/postcss), which supports a variety of plugins. [Autoprefixer](https://github.com/postcss/autoprefixer) is perhaps the most useful plugin, since it enables you to stop worrying about browser prefixes and compatibility and write standards-compliant CSS. No more copying 5 different statements every time you want a CSS gradient - you can write a standard gradient without any prefixes and Autoprefixer handles it for you.

Currently, Meteor doesn't have a separate build step for post-processing CSS, so the only way to integrate it is to build it into the minifier. Thankfully, there is a community package that has integrated PostCSS with plugin support into a replacement for Meteor's standard minification package.

<h3 id="juliancwirko-postcss">juliancwirko:postcss</h3>

>Note: This package is no longer actively maintained, therefore compatibility with newer versions of Meteor is not guaranteed. If you encouter problems with this, please let us know by [opening an issue on the Guide](https://github.com/meteor/guide/issues).

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

<h2 id="build-plugins">Build plugins</h2>

The most powerful feature of Meteor's build system is the ability to define custom build plugins. If you find yourself writing scripts that mangle one type of file into another, merge multiple files, or something else, it's likely that these scripts would be better implemented as a build plugin. The `ecmascript`, `templating`, and `coffeescript` packages are all implemented as build plugins, so you can replace them with your own versions if you want to!

[Read the documentation about build plugins.](https://docs.meteor.com/api/packagejs.html#build-plugin-api)

<h3 id="types-of-build-plugins">Types of build plugins</h3>

There are three types of build plugins supported by Meteor today:

1. Compiler plugin - compiles source files (LESS, CoffeeScript) into built output (JS, CSS, asset files, and HTML). Only one compiler plugin can handle a single file extension.
2. Minifier plugin - compiles lots of built CSS or JS files into one or more minified files, for example `standard-minifiers`. Only one minifier can handle each of `js` and `css`.
3. Linter plugin - processes any number of files, and can print lint errors. Multiple linters can process the same files.

<h3 id="writing-build-plugins">Writing your own build plugin</h3>

Writing a build plugin is a very advanced task that only the most advanced Meteor users should get into. The best place to start is to copy a different plugin that is the most similar to what you are trying to do. For example, if you wanted to make a new CSS compiler plugin, you could fork the `less` package; if you wanted to make your own JS transpiler, you could fork `ecmascript`. A good example of a linter is the `jshint` package, and for a minifier you can look at `standard-minifiers-js` and `standard-minifiers-css`.

<h3 id="caching-build-plugins">Caching</h3>

The best way to make your build plugin fast is to use caching anywhere you can - the best way to save time is to do less work! Check out the [documentation about CachingCompiler](https://docs.meteor.com/api/packagejs.html#build-plugin-caching) to learn more. It's used in all of the above examples, so you can see how to use it by looking at them.
