{{#template name="pkg_modules"}}
## `modules`

Though Meteor 1.2 introduced support for [many new ECMAScript 2015 features](https://github.com/meteor/meteor/blob/devel/packages/ecmascript/README.md#supported-es2015-features), one of the most notable omissions was [ES2015 `import` and `export` syntax](http://exploringjs.com/es6/ch_modules.html). Meteor 1.3 fills that gap with a fully standards-compliant module system that works on both the client and the server, solves multiple long-standing problems for Meteor applications (such as controlling file load order), and yet maintains full backwards compatibility with existing Meteor code. This document explains the usage and key features of the new module system.

### Enabling modules

We think you’re going to love the new module system, and that's why it will be installed by default for all new apps and packages. Nevertheless, the `modules` package is totally optional, and it will be up to you to add it to existing apps and/or packages.

For apps, this is as easy as `meteor add modules`, or (even better) `meteor add ecmascript`, since the `ecmascript` package *implies* the `modules` package.

For packages, you can enable `modules` by adding `api.use("modules")` to the `Package.onUse` or `Package.onTest` sections of your `package.js` file.

Now, you might be wondering what good the `modules` package is without the `ecmascript` package, since `ecmascript` enables `import` and `export` syntax. By itself, the `modules` package provides the CommonJS `require` and `exports` primitives that may be familiar if you’ve ever written Node code, and the `ecmascript` package simply compiles `import` and `export` statements to CommonJS. The `require` and `export` primitives also allow Node modules to run within Meteor application code without modification. Furthermore, keeping `modules` separate allows us to use `require` and `exports` in places where using `ecmascript` is tricky, such as the implementation of the `ecmascript` package itself.

While the `modules` package is useful by itself, we very much encourage using the `ecmascript` package (and thus `import` and `export`) instead of using `require` and `exports` directly. If you need convincing, here’s a presentation that explains the differences: http://benjamn.github.io/empirenode-2015

### Basic syntax

Although there are a number of different variations of `import` and `export` syntax, this section describes the essential forms that everyone should know.

First, you can `export` any named declaration on the same line where it was declared:

```js
// exporter.js
export var a = ...;
export let b = ...;
export const c = ...;
export function d() {...}
export function* e() {...}
export class F {...}
```

These declarations make the variables `a`, `b`, `c` (and so on) available not only within the scope of the `exporter.js` module, but also to other modules that `import` from `exporter.js`.

If you prefer, you can `export` variables by name, rather than prefixing their declarations with the `export` keyword:

```js
// exporter.js
function g() {...}
let h = g();

// at the end of the file
export {g, h};
```

All of these exports are *named*, which means other modules can import them using those names:

```js
// importer.js
import {a, c, F, h} from "./exporter";
new F(a, c).method(h);
```

If you’d rather use different names, you’ll be glad to know `export` and `import` statements can rename their arguments:

```js
// exporter.js
export {g as x};
g(); // same as calling y() in importer.js
```

```js
// importer.js
import {x as y} from "./exporter";
y(); // same as calling g() in exporter.js
```

As with CommonJS `module.exports`, it is possible to define a single *default* export:

```js
// exporter.js
export default any.arbitrary(expression);
```

This default export may then be imported without curly braces, using any name the importing module chooses:

```js
// importer.js
import Value from "./exporter";
// Value is identical to the exported expression
```

Unlike CommonJS `module.exports`, the use of default exports does not prevent the simultaneous use of named exports. Here is how you can combine them:

```js
// importer.js
import Value, {a, F} from "./exporter";
```

In fact, the default export is conceptually just another named export whose name happens to be "default":

```js
// importer.js
import {default as Value, a, F} from "./exporter";
```

These examples should get you started with `import` and `export` syntax. For further reading, here is a very detailed [explanation](http://www.2ality.com/2014/09/es6-modules-final.html) by [Axel Rauschmayer](https://twitter.com/rauschma) of every variation of `import` and `export` syntax.

### Modular application structure

Before the release of Meteor 1.3, the only way to share values between files in an application was to assign them to global variables or communicate through shared variables like `Session` (variables which, while not technically global, sure do feel syntactically identical to global variables). With the introduction of modules, one module can refer precisely to the exports of any other specific module, so global variables are no longer necessary.

If you are familiar with modules in Node, you might expect modules not to be evaluated until the first time you import them. However, because earlier versions of Meteor evaluated all of your code when the application started, and we care about backwards compatibility, eager evaluation is still the default behavior.

If you would like a module to be evaluated *lazily* (in other words: on demand, the first time you import it, just like Node does it), then you should put that module in an `imports/` directory (anywhere in your app, not just the root directory), and include that directory when you import the module: `import {stuff} from "./imports/lazy"`. Note: files contained by `node_modules/` directories will also be evaluated lazily (more on that below).

Lazy evaluation will very likely become the default behavior in a future version of Meteor, but if you want to embrace it as fully as possible in the meantime, we recommend putting all your modules inside either `client/imports/` or `server/imports/` directories, with just a single entry point for each architecture: `client/main.js` and `server/main.js`. The `main.js` files will be evaluated eagerly, giving your application a chance to import modules from the `imports/` directories.

### Modular package structure

If you are a package author, in addition to putting `api.use("modules")` or `api.use("ecmascript")` in the `Package.onUse` section of your `package.js` file, you can also use a new API called `api.mainModule` to specify the main entry point for your package:

```js
Package.describe({
  name: "my-modular-package"
});

Npm.depends({
  moment: "2.10.6"
});

Package.onUse(function (api) {
  api.use("modules");
  api.mainModule("server.js", "server");
  api.mainModule("client.js", "client");
  api.export("Foo");
});
```

Now `server.js` and `client.js` can import other files from the package source directory, even if those files have not been added using the `api.addFiles` function.

When you use `api.mainModule`, the exports of the main module are exposed globally as `Package["my-modular-package"]`, along with any symbols exported by `api.export`, and thus become available to any code that imports the package. In other words, the main module gets to decide what value of `Foo` will be exported by `api.export`, as well as providing other properties that can be explicitly imported from the package:

```js
// In an application that uses my-modular-package:
import {Foo as ExplicitFoo, bar} from "meteor/my-modular-package";
console.log(Foo); // Auto-imported because of api.export.
console.log(ExplicitFoo); // Explicitly imported, but identical to Foo.
console.log(bar); // Exported by server.js or client.js, but not auto-imported.
```

Note that the `import` is `from "meteor/my-modular-package"`, not `from "my-modular-package"`. Meteor package identifier strings must include the prefix `meteor/...` to disambiguate them from npm packages.

Finally, since this package is using the new `modules` package, and the package `Npm.depends` on the "moment" npm package, modules within the package can `import moment from "moment"` on both the client and the server. This is great news, because previous versions of Meteor allowed npm imports only on the server, via `Npm.require`.

### Local `node_modules`

Before Meteor 1.3, the contents of `node_modules` directories in Meteor application code were completely ignored. When you enable `modules`, those useless `node_modules` directories suddenly become infinitely more useful:

```sh
meteor create modular-app
cd modular-app
mkdir node_modules
npm install moment
echo 'import moment from "moment";' >> modular-app.js
echo 'console.log(moment().calendar());' >> modular-app.js
meteor
```

When you run this app, the `moment` library will be imported on both the client and the server, and both consoles will log output similar to: `Today at 7:51 PM`. Our hope is that the possibility of installing Node modules directly within an app will reduce the need for npm wrapper packages such as https://atmospherejs.com/momentjs/moment.

A version of the `npm` command comes bundled with every Meteor installation, and (as of Meteor 1.3) it's quite easy to use: `meteor npm ...` is synonymous with `npm ...`, so `meteor npm install moment` will work in the example above. (Likewise, if you don't have a version of `node` installed, or you want to be sure you're using the exact same version of `node` that Meteor uses, `meteor node ...` is a convenient shortcut.) That said, you can use any version of `npm` that you happen to have available. Meteor's module system only cares about the files installed by `npm`, not the details of how `npm` installs those files.

### File load order

Before Meteor 1.3, the order in which application files were evaluated was dictated by a set of rules described in the [Application Structure - Default file load order](http://guide.meteor.com/structure.html#load-order) section of the Meteor Guide. These rules could become frustrating when one file depended on a variable defined by another file, particularly when the first file was evaluated after the second file.

Thanks to modules, any load-order dependency you might imagine can be resolved by adding an `import` statement. So if `a.js` loads before `b.js` because of their file names, but `a.js` needs something defined by `b.js`, then `a.js` can simply `import` that value from `b.js`:

```js
// a.js
import {bThing} from "./b";
console.log(bThing, "in a.js");
```

```js
// b.js
export var bThing = "a thing defined in b.js";
console.log(bThing, "in b.js");
```

Sometimes a module doesn’t actually need to import anything from another module, but you still want to be sure the other module gets evaluated first. In such situations, you can use an even simpler `import` syntax:

```js
// c.js
import "./a";
console.log("in c.js");
```

No matter which of these modules is imported first, the order of the `console.log` calls will always be:

```js
console.log(bThing, "in b.js");
console.log(bThing, "in a.js");
console.log("in c.js");
```

{{/template}}
