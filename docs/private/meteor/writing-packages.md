  <h2 id="writingpackages">Writing packages</h2>

The Meteor package format isn't officially documented and will change
before Meteor 1.0. But that hasn't stopped people like you from
creating hundreds of packages by reading the source code of existing
packages and following the model. If you do decide to create your own
packages, you will have to do some detective work, but here are some
quick tips:

* A package is simply a directory with a `package.js` file in it. Look in the
  [`packages` directory of the Meteor source
  tree](https://github.com/meteor/meteor/tree/master/packages/) for example
  `package.js` files. The format and name of the `package.js` file will change
  significantly before Meteor 1.0, but the functionality will be basically the
  same even though the syntax is different, so it will be easy to port your
  code.

* Packages explicitly list all of their source files using `api.add_files`, and
  the files are loaded exactly in the order specified. (This is different from
  apps, where Meteor scans a directory tree to find the source files.)  Don't
  forget to include any build plugin packages (such as `coffeescript` or, if
  using HTML templates, `templating`) that you require.

* Exporting a symbol from your package (see
  [Namespacing](#namespacing)) is accomplished with an `api.export` call
  from inside your `on_use` handler.

* An esoteric point about exports: they are not lvalues. You can't set
  an exported variable to a new value after exporting it. If you
  export `a = {name: 'alice'}` then you can change `a.name` anytime
  you want, but if after startup you set `a` to a whole new object
  then the packages that import `a` won't see the change. Since your
  exports are most always objects or functions, this is hardly ever an
  issue.

* Packages can use [npm modules](https://npmjs.org/). Use `Npm.depends` in your
  `package.js` to list the npm modules that you need and the specific
  versions that you want to use. Then use `Npm.require` inside your
  package to pull in the modules when you need them. Meteor strives to
  have 100% repeatable builds so that everyone on your team is always
  running the same code, and that's why you must explicitly lock your
  npm dependencies to specific versions. Behind the scenes, Meteor
  will use `npm shrinkwrap` to also lock down the versions of the
  transitive dependencies of all of the npm modules that you use.

* Whenever your package changes, Meteor will rebuild it (compiling
  non-JavaScript source files, fetching npm dependencies, constructing
  namespace wrappers, and so on). The built package will be cached and
  rebuilt only when a source file changes (tracked by SHA1) or when
  other dependencies such as build plugins change. To force a rebuild
  you can use the undocumented command `meteor rebuild-all`, but this
  should never be necessary (if it is, please send a
  [bug report](https://github.com/meteor/meteor/blob/devel/Contributing.md#filing-bug-reports)!).

* Build plugins are created with `_transitional_registerBuildPlugin`,
  an API that is very much in flux. See the `coffeescript` package for
  an example. Build plugins are fully-fledged Meteor programs in their
  own right and have their own namespace, package dependencies, source
  files and npm requirements. The old `register_extension` API is
  deprecated and should not be used as it will prevent your package
  from being cached, slowing down builds.

* It is possible to create weak dependencies between packages. If
  package A has a weak dependency on package B, it means that
  including A in an app does not force B to be included too &mdash;
  but, if B _is_ included, say by the app developer or by another
  package, then B will load before A. You can use this to make
  packages that optionally integrate with or enhance other packages if
  those packages are present. To create a weak dependency, pass
  `{weak: true}` as the third argument to `api.use`. When you weakly
  depend on a package you don't see its exports. You can detect if
  the possibly-present weakly-depended-on package is there by seeing
  if `Package.foo` exists, and get its exports from the same place.

* It is also possible to create unordered dependencies by passing
  `{unordered: true}`. An unordered dependency is the exact opposite
  of a weak dependency. If A has an unordered dependency on B, then
  including A forces B to be included as well, but doesn't require B
  to load before A. This is occasionally useful for resolving circular
  dependencies.

* The build system also supports package implication. If package A
  implies package B, then it means that when someone depends on
  package A, it's as if they also depended on package B as well. In
  particular, they get B's exports. This is done with `api.imply` and
  can be used to create umbrella packages such as
  `standard-app-packages` that are a shortcut for pulling in a set of
  packages, or it can be helpful in factoring common code out of a set
  of packages as with `accounts-base`.

* The build system understands the idea of native code and has a
  system of architecture names to ensure that packages that are
  specific to one architecture aren't run on the wrong
  architecture. For example, if you include an npm module that has a
  native extension, your built Meteor package will be specific to your
  machine architecture, but if not your built Meteor package will be
  portable.
