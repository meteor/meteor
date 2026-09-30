# Build System

This guide covers how Meteor's build system compiles your app.

After reading this guide, you'll know:

1. What the Meteor build tool does
2. How to choose between Meteor Bundler and Rspack integration
3. How JavaScript transpilation works
4. How to configure CSS processing
5. How to use Hot Module Replacement
6. How to write custom build plugins

## What does it do?

The Meteor build system is the actual command line tool that you get when you install Meteor. You run it by typing the `meteor` command in your terminal, possibly followed by a set of arguments. Read the [CLI documentation](/cli/) or type `meteor help` in your terminal to learn about all of the commands.

The Meteor build tool is what compiles, runs, deploys, and publishes all of your Meteor apps and packages. It's Meteor's built-in solution to the problems also solved by tools like Grunt, Gulp, Webpack, Browserify, Nodemon, and many others.

Starting with Meteor 3.3, you can use the **Modern Build Stack** which includes optimizations with SWC transpilation. With Meteor 3.4, you can integrate **Rspack** as your application bundler for even faster builds, smaller bundle sizes, and modern bundling features. See the [Modern Build Stack overview](/about/modern-build-stack) for details.

### Reloads app on file change

After executing the `meteor` command to start the build tool you should leave it running while further developing your app. The build tool automatically detects any relevant file changes using a file watching system and recompiles the necessary changes, restarting your client or server environment as needed. [Hot module replacement](#hot-module-replacement) can optionally be used so you can view and test your changes even quicker.

### Compiles files with build plugins

The main function of the Meteor build tool is to run "build plugins". These plugins define different parts of your app build process. Meteor puts heavy emphasis on reducing or removing build configuration files, so you won't see any large build process config files like you would in Gulp or Webpack. The Meteor build process is configured almost entirely through adding and removing packages to your app and putting files in specially named directories.

For example, to get all of the newest stable ES2015 JavaScript features in your app, you add the [`ecmascript` package](/packages/ecmascript). This package provides support for ES2015 modules, which gives you even more fine-grained control over file load order using ES2015 `import` and `export`. As new Meteor releases add new features to this package you get them for free.

### Controlling which files to build

By default Meteor will build certain files as controlled by your application [file structure](/tutorials/application-structure/) and Meteor's default file load order rules. However, you may override the default behavior using `.meteorignore` files, which cause the build system to ignore certain files and directories using the same pattern syntax as `.gitignore` files. These files may appear in any directory of your app or package, specifying rules for the directory tree below them. These `.meteorignore` files are also fully integrated with Meteor's file watching system, so they can be added, removed, or modified during development.

### Combines and minifies code

Another important feature of the Meteor build tool is that it automatically concatenates your application asset files, and in production minifies these bundles. This lets you add all of the comments and whitespace you want to your source code and split your code into as many files as necessary, all without worrying about app performance and load times.

By default, this is enabled by the [`standard-minifier-js`](https://atmospherejs.com/meteor/standard-minifiers-js) and [`standard-minifier-css`](/packages/standard-minifier-css) packages, which use Terser for JavaScript minification.

**Using SWC Minifier (Meteor 3.3+)**: When you enable the Modern Build Stack with `"modern": true`, Meteor automatically uses the SWC minifier, which is significantly faster than Terser while producing similar or smaller bundle sizes.

**Using Rspack (Meteor 3.4+)**: When using the Rspack integration, minification is handled by Rspack's built-in SWC minifier, offering the fastest minification with advanced optimizations.

If you need different minification behavior, you can replace these packages (see [zodern:standard-minifier-js](https://atmospherejs.com/zodern/standard-minifier-js) as an example).

### Development vs. production

Running an app in development is all about fast iteration time. All kinds of different parts of your app are handled differently and instrumented to enable better reloads and debugging. In production, the app is reduced to the necessary code and functions just like any standard Node.js app.

Therefore, you shouldn't run your app in production by executing the `meteor run` command. Instead, follow the directions in [Deploying Meteor Applications](/tutorials/deployment/deployment). If you find an error in production that you suspect is related to minification, you can run the minified version of your app locally for testing with `meteor --production`.

## Modern Build Stack (Meteor 3.3+)

Meteor 3.3 introduced the Modern Build Stack, a series of optimizations to make your builds faster and more efficient. Meteor 3.4 expanded this with Rspack integration for even greater performance.

### Meteor Bundler Optimizations (3.3+)

The optimized Meteor bundler includes:

- **SWC Transpilation**: Replace Babel with the faster SWC transpiler for JavaScript/TypeScript compilation
- **SWC Minification**: Use SWC minifier instead of Terser for faster production builds
- **Modern-only Development**: Skip legacy browser builds during development
- **Fast File Watching**: Uses @parcel/watcher for native recursive file watching
- **Enhanced .meteorignore**: Better control over which files are built

To enable these optimizations, add to your `package.json`:

```json
{
  "meteor": {
    "modern": true
  }
}
```

Learn more in the [Meteor Bundler Optimizations guide](/about/modern-build-stack/meteor-bundler-optimizations).

### Rspack Bundler Integration (3.4+)

Meteor 3.4 introduces optional Rspack integration as a modern, high-performance alternative to the traditional Meteor bundler. Rspack offers significantly faster builds (~5-10x), smaller bundle sizes (20-40% reduction), and access to the modern bundler ecosystem.

**Quick Start:**

```bash
# Add the rspack package (included by default in new apps)
meteor add rspack
```

**For complete details on Rspack features, configuration, migration guides, and framework integrations, see the [Rspack Bundler Integration guide](/about/modern-build-stack/rspack-bundler-integration).**

### Comparing Build Options

| Feature | Meteor Bundler | Meteor + Optimizations | Meteor + Rspack |
|---------|---------------|----------------------|-----------------|
| **Setup** | Default | Add `"modern": true` | Add `rspack` package |
| **Transpiler** | Babel | SWC (with Babel fallback) | SWC via Rspack |
| **Minifier** | Terser | SWC | SWC via Rspack |
| **Build Speed** | Baseline | ~2-3x faster | ~5-10x faster |
| **Bundle Size** | Baseline | Similar | 20-40% smaller |
| **HMR Speed** | Standard | Faster | Fastest |
| **Code Splitting** | Limited | Limited | Full HTTP/2 support |
| **Tree Shaking** | Basic | Basic | Advanced |
| **Ecosystem** | Atmosphere | Atmosphere | Rspack + Atmosphere |
| **Entry Points** | Optional | Optional | Required |
| **Migration** | N/A | Minimal | Moderate |

## JavaScript transpilation

These days, the landscape of JavaScript tools and frameworks is constantly shifting, and the language itself is evolving just as rapidly. It's no longer reasonable to wait for web browsers to implement the language features you want to use. Most JavaScript development workflows rely on compiling code to work on the lowest common denominator of environments, while letting you use the newest features in development. Meteor has support for some of the most popular tools out of the box.

### ES2015+ (recommended)

The `ecmascript` package (which is installed into all new apps and packages by default, but can be removed), allows support for many ES2015+ features. We recommend using it. You can read more about it in the [Code Style](/tutorials/code-style/code-style) article.

### SWC (Meteor 3.3+, recommended for performance)

Starting with Meteor 3.3, you can use SWC as your transpiler for significantly faster builds. SWC is a Rust-based JavaScript/TypeScript compiler that's 20-70x faster than Babel while supporting the same features.

To enable SWC, add to your `package.json`:

```json
{
  "meteor": {
    "modern": true
  }
}
```

SWC will handle all transpilation with automatic fallback to Babel for any incompatible code. Learn more in the [Meteor Bundler Optimizations guide](/about/modern-build-stack/meteor-bundler-optimizations).

### Babel

Babel is a mature, configurable transpiler which allows you to write code in the latest version of JavaScript even when your supported environments don't support certain features natively. Babel will compile those features down to a supported version.

Meteor provides a set of appropriate core plugins for each environment (Node.js, modern browsers, and legacy browsers) and React to support most modern JavaScript code practices. In addition, Meteor supports custom `.babelrc` files which allows developers to further customize their Babel configuration to suit their needs (e.g., Stage 0 proposals).

Developers are encouraged to avoid adding large presets (such as babel-preset-env and babel-preset-react) and instead add specific plugins as needed. You will avoid unnecessary Babel compilation and you'll be less likely to experience plugin ordering issues.

> **Note**: When using the Modern Build Stack with `"modern": true`, Babel is used as a fallback for any code that SWC cannot handle, ensuring compatibility with all existing Meteor code.

### CoffeeScript

While we recommend using ES2015 with the `ecmascript` package as the best development experience for Meteor, everything in the platform is 100% compatible with [CoffeeScript](http://coffeescript.org/) and many people in the Meteor community prefer it.

All you need to do to use CoffeeScript is add the right Meteor package:

```bash
meteor add coffeescript
```

All code written in CoffeeScript compiles to JavaScript under the hood, and is completely compatible with any code in other packages that is written in JS or ES2015.

> **Recommended (3.4+)**: If you're using CoffeeScript, consider using it with the [Rspack bundler](/about/modern-build-stack/rspack-bundler-integration#coffeescript) instead of the Atmosphere build plugin. Rspack handles CoffeeScript via `coffee-loader` and `swc-loader`, providing faster builds and better integration with the modern build stack. You can quickly scaffold a new project with `meteor create --coffeescript`.

### TypeScript

[TypeScript](https://www.typescriptlang.org/) is modern JavaScript with optional types and more. Adding types will make your code more readable and less prone to runtime errors.

TypeScript can be installed with:

```bash
meteor add typescript
```

It is necessary to configure the TypeScript compiler with a `tsconfig.json` file. Here's the one generated by `meteor create --typescript`:

```json
{
  "compilerOptions": {
    "target": "es2018",
    "module": "esNext",
    "lib": ["esnext", "dom"],
    "allowJs": true,
    "checkJs": false,
    "jsx": "preserve",
    "incremental": true,
    "noEmit": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": false,
    "noFallthroughCasesInSwitch": false,
    "baseUrl": ".",
    "paths": {
      "/*": ["*"]
    },
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "types": ["node", "mocha"],
    "esModuleInterop": true,
    "preserveSymlinks": true
  },
  "exclude": [
    "./.meteor/**",
    "./packages/**"
  ]
}
```

If you want to add TypeScript from the point of project creation, you can run the create command with the --typescript flag:

```bash
meteor create --typescript name-of-my-new-typescript-app
```

#### Conditional imports

TypeScript does not support nested `import` statements, therefore conditionally importing modules requires you to use the `require` statement.

To maintain type safety, you can take advantage of TypeScript's import elision and reference the types using the `typeof` keyword. See the [TypeScript handbook article](https://www.typescriptlang.org/docs/handbook/modules.html#optional-module-loading-and-other-advanced-loading-scenarios) for details.

## Templates and HTML

Since Meteor uses client-side rendering for your app's UI, all of your HTML code, UI components, and templates need to be compiled to JavaScript. There are a few options at your disposal to write your UI code.

### Blaze HTML templates

The aptly named `blaze-html-templates` package that comes with every new Meteor app by default compiles your `.html` files written using [Spacebars](http://blazejs.org/api/spacebars.html) into Blaze-compatible JavaScript code. You can also add `blaze-html-templates` to any of your packages to compile template files located in the package.

[Read about how to use Blaze and Spacebars in the Blaze documentation.](http://blazejs.org/guide/spacebars.html)

### Blaze Jade templates

If you don't like the Spacebars syntax Meteor uses by default and want something more concise, you can give Jade a try by using [`pacreach:jade`](https://atmospherejs.com/pacreach/jade). This package will compile all files in your app with the `.jade` extension into Blaze-compatible code, and can be used side-by-side with `blaze-html-templates` if you want to have some of your code in Spacebars and some in Jade.

### JSX for React

If you're building your app's UI with React, currently the most popular way to write your UI components involves JSX, an extension to JavaScript that allows you to type HTML tags that are converted to React DOM elements. JSX code is handled automatically by the `ecmascript` package.

## CSS processing

> **Using Rspack (3.4+)?** When using the Rspack bundler, CSS is handled by Rspack's built-in loaders instead of Meteor's Atmosphere build plugins. This gives you standard bundler conventions, proper CSS HMR, and access to tools like Tailwind and PostCSS without extra Meteor packages. See the [Rspack CSS guide](/about/modern-build-stack/rspack-bundler-integration#css) for details.

All your CSS style files will be processed using Meteor's default file load order rules along with any import statements and concatenated into a single stylesheet, `merged-stylesheets.css`. In a production build this file is also minified. By default this single stylesheet is injected at the beginning of the HTML `<head />` section of your application.

However, this can potentially be an issue for some applications that use a third party UI framework, such as Bootstrap, which is loaded from a CDN. This could cause Bootstrap's CSS to come after your CSS and override your user-defined styles.

To get around this problem Meteor supports the use of a pseudo tag `<meteor-bundled-css />` that if placed anywhere in the `<head />` section your app will be replaced by a link to this concatenated CSS file. If this pseudo tag isn't used, the CSS file will be placed at the beginning of the `<head />` section as before.

### CSS pre-processors

It's no secret that writing plain CSS can often be a hassle as there's no way to share common CSS code between different selectors or have a consistent color scheme between different elements. CSS compilers, or pre-processors, solve these issues by adding extra features on top of the CSS language like variables, mixins, math, and more, and in some cases also significantly change the syntax of CSS to be easier to read and write.

Here are three example CSS pre-processors supported by Meteor:

1. [Sass](http://sass-lang.com/)
2. [Less.js](http://lesscss.org/)
3. [Stylus](https://learnboost.github.io/stylus/)

They all have their pros and cons, and different people have different preferences. Sass with the SCSS syntax is quite popular as CSS frameworks like Bootstrap have switched to Sass, and the C++ LibSass implementation appears to be faster than some of the other compilers available.

CSS framework compatibility should be a primary concern when picking a pre-processor, because a framework written with Less won't be compatible with one written in Sass.

### Source vs. import files

An important feature shared by all of the available CSS pre-processors is the ability to import files. This lets you split your CSS into smaller pieces, and provides a lot of the same benefits that you get from JavaScript modules:

1. You can control the load order of files by encoding dependencies through imports, since the load order of CSS matters.
2. You can create reusable CSS "modules" that only have variables and mixins and don't actually generate any CSS.

In Meteor, each of your `.scss`, `.less`, or `.styl` source files will be one of two types: "source" or "import".

A "source" file is evaluated eagerly and adds its compiled form to the CSS of the app immediately.

An "import" file is evaluated only if imported from some other file and can be used to share common mixins and variables between different CSS files in your app.

Read the documentation for each package listed below to see how to indicate which files are source files vs. imports.

### Importing styles

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

> CSS files in an Atmosphere package are declared with `api.addFiles`, and therefore will be eagerly evaluated, and automatically bundled with all the other CSS in your app.

Importing styles from an npm package using the `{}` syntax:

```less
@import '{}/node_modules/npm-package-name/button.less';
```

```js
import 'npm-package-name/stylesheets/styles.css';
```

### Sass

The best Sass build plugin for Meteor is [`leonardoventurini:scss`](https://atmospherejs.com/leonardoventurini/scss). An alternative to the previous recommended [`fourseven:scss`](https://atmospherejs.com/fourseven/scss) package.

With Rspack (3.4+), you can replace the Atmosphere package with `sass-embedded` and `sass-loader` configured in your `rspack.config.js`. See the [Rspack CSS guide](/about/modern-build-stack/rspack-bundler-integration#css) for setup instructions.

### Less

Less is maintained as a [Meteor core package called `less`](/packages/less).

With Rspack (3.4+), you can replace the Atmosphere package with `less` and `less-loader` configured in your `rspack.config.js`. See the [Rspack CSS guide](/about/modern-build-stack/rspack-bundler-integration#css) for setup instructions.

### Stylus

The best Stylus build plugin for Meteor is [coagmano:stylus](https://atmospherejs.com/coagmano/stylus).

## PostCSS and Autoprefixer

In addition to CSS pre-processors like Sass, Less, and Stylus, there is now an ecosystem of CSS post-processors. Regardless of which CSS pre-processor you use, a post-processor can give you additional benefits like cross-browser compatibility.

The most popular CSS post-processor right now is [PostCSS](https://github.com/postcss/postcss), which supports a variety of plugins. [Autoprefixer](https://github.com/postcss/autoprefixer) is perhaps the most useful plugin, since it enables you to stop worrying about browser prefixes and compatibility and write standards-compliant CSS. No more copying 5 different statements every time you want a CSS gradient - you can write a standard gradient without any prefixes and Autoprefixer handles it for you.

Meteor automatically runs PostCSS for you once you've configured it. Learn more about enabling it in the docs for [standard-minifier-css](/packages/standard-minifier-css).

## Hot Module Replacement

In Meteor apps, JavaScript, TypeScript, CSS files that are dynamically imported, and many other types of files are converted into JavaScript modules during the build process. Instead of reloading the client after a rebuild, Meteor is able to update the JavaScript modules within the running application that were modified. This reduces the feedback cycle while developing by allowing you to view and test your changes quicker.

### Meteor HMR

Hot module replacement (HMR) can be enabled by adding the [hot-module-replacement](/packages/hot-module-replacement) package to your app:

```bash
meteor add hot-module-replacement
```

Many types of JavaScript modules cannot be updated with HMR, so HMR has to be configured to know which modules can be replaced and how to replace them. Most apps never need to do this manually. Instead, you can use integrations that configure HMR for you:

- React components are automatically updated using [React Fast Refresh](https://atmospherejs.com/meteor/react-fast-refresh). This integration is enabled for all Meteor apps that use HMR and a supported React version.
- Svelte files can be automatically updated with HMR by using the [zodern:melte](https://atmospherejs.com/zodern/melte) compiler package.
- Vue components can be updated with HMR using [akryum:vue-component](https://atmospherejs.com/akryum/vue-component).
- Some packages are able to help automatically dispose old versions of modules. For example, [zodern:pure-admin](https://atmospherejs.com/zodern/pure-admin) removes menu items and pages added in the old version of the module.

To further control how HMR applies updates in your app, you can use the [hot API](/packages/hot-module-replacement). This can be used to accept updates for additional types of files, help dispose a module so the old version no longer affects the app (such as stopping Tracker.autorun computations), or creating your own integrations with other view layers or libraries.

If a change was made to the app that cannot be applied with HMR, it reloads the page with hot code push, as is done when HMR is not enabled. It currently only supports app code in the modern client architecture.

### Rspack HMR (3.4+)

When using the [Rspack integration](/about/modern-build-stack/rspack-bundler-integration), you get Rspack's native HMR, which is significantly faster than Meteor's traditional HMR:

- **Faster Updates**: Changes are reflected almost instantly
- **Persistent State**: Better preservation of application state during updates
- **Framework Integration**: Automatic support for React Fast Refresh, Vue HMR, Svelte HMR, and more
- **CSS HMR**: Style changes apply without full page reload (unlike traditional Cordova apps)

**Note**: Blaze HMR is not currently supported with Rspack. Blaze apps will still reload quickly due to Rspack's fast rebuild times (97% reduction), but will perform a full page reload instead of hot module replacement.

To use Rspack HMR, simply add the `rspack` package - HMR is enabled automatically for supported frameworks.

## Build plugins

The most powerful feature of Meteor's build system is the ability to define custom build plugins. If you find yourself writing scripts that mangle one type of file into another, merge multiple files, or something else, it's likely that these scripts would be better implemented as a build plugin. The `ecmascript`, `templating`, and `coffeescript` packages are all implemented as build plugins, so you can replace them with your own versions if you want to!

[Read the documentation about build plugins.](/api/package#build-plugin-api)

### Types of build plugins

There are three types of build plugins supported by Meteor today:

1. **Compiler plugin** - compiles source files (LESS, CoffeeScript) into built output (JS, CSS, asset files, and HTML). Only one compiler plugin can handle a single file extension.
2. **Minifier plugin** - compiles lots of built CSS or JS files into one or more minified files, for example `standard-minifiers`. Only one minifier can handle each of `js` and `css`.
3. **Linter plugin** - processes any number of files, and can print lint errors. Multiple linters can process the same files.

### Writing your own build plugin

Writing a build plugin is a very advanced task that only the most advanced Meteor users should get into. The best place to start is to copy a different plugin that is the most similar to what you are trying to do. For example, if you wanted to make a new CSS compiler plugin, you could fork the `less` package; if you wanted to make your own JS transpiler, you could fork `ecmascript`. A good example of a linter is the `jshint` package, and for a minifier you can look at `standard-minifiers-js` and `standard-minifiers-css`.

### Caching

The best way to make your build plugin fast is to use caching anywhere you can - the best way to save time is to do less work! Check out the [documentation about CachingCompiler](/api/package#caching-compiler) to learn more. It's used in all of the above examples, so you can see how to use it by looking at them.
