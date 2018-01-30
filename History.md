## v.NEXT

* Individual Meteor `self-test`'s can now be skipped by adjusting their
  `define` call to be prefixed by `skip`. For example,
  `selftest.skip.define('some test', ...` will skip running "some test".
  [PR #9579](https://github.com/meteor/meteor/pull/9579)

## v1.6.1, 2018-01-19

* Node has been updated to version
  [8.9.4](https://nodejs.org/en/blog/release/v8.9.4/).

* The `meteor-babel` npm package (along with its Babel-related
  dependencies) has been updated to version 7.0.0-beta.38, a major
  update from Babel 6. Thanks to the strong abstraction of the
  `meteor-babel` package, the most noticeable consequence of the Babel 7
  upgrade is that the `babel-runtime` npm package has been replaced by
  `@babel/runtime`, which can be installed by running
  ```js
  meteor npm install @babel/runtime
  ```
  in your application directory. There's a good chance that the old
  `babel-runtime` package can be removed from your `package.json`
  dependencies, though there's no harm in leaving it there. Please see
  [this blog post](https://babeljs.io/blog/2017/09/12/planning-for-7.0)
  for general information about updating to Babel 7 (note especially any
  changes to plugins you've been using in any `.babelrc` files).
  [PR #9440](https://github.com/meteor/meteor/pull/9440)

* Because `babel-compiler@7.0.0` is a major version bump for a core
  package, any package that explicitly depends on `babel-compiler` with
  `api.use` or `api.imply` will need to be updated and republished in
  order to remain compatible with Meteor 1.6.1. One notable example is the
  `practicalmeteor:mocha` package. If you have been using this test-driver
  package, we strongly recommend switching to `meteortesting:mocha`
  instead. If you are the author of a package that depends on
  `babel-compiler`, we recommend publishing your updated version using a
  new major or minor version, so that you can continue releasing patch
  updates compatible with older versions of Meteor, if necessary.

* The `server-render` package now supports passing a `Stream` object to
  `ServerSink` methods that previously expected a string, which enables
  [streaming server-side rendering with React
  16](https://hackernoon.com/whats-new-with-server-side-rendering-in-react-16-9b0d78585d67):
  ```js
  import React from "react";
  import { renderToNodeStream } from "react-dom/server";
  import { onPageLoad } from "meteor/server-render";
  import App from "/imports/Server.js";

  onPageLoad(sink => {
    sink.renderIntoElementById("app", renderToNodeStream(
      <App location={sink.request.url} />
    ));
  });
  ```
  [PR #9343](https://github.com/meteor/meteor/pull/9343)

* The [`cordova-lib`](https://github.com/apache/cordova-cli) package has
  been updated to version 7.1.0,
  [`cordova-android`](https://github.com/apache/cordova-android/) has been
  updated to version 6.4.0 (plus one additional
  [commit](https://github.com/meteor/cordova-android/commit/317db7df0f7a054444197bc6d28453cf4ab23280)),
  and [`cordova-ios`](https://github.com/apache/cordova-ios/) has been
  updated to version 4.5.4. The cordova plugins `cordova-plugin-console`,
  `cordova-plugin-device-motion`, and `cordova-plugin-device-orientation`
  have been [deprecated](https://cordova.apache.org/news/2017/09/22/plugins-release.html)
  and will likely be removed in a future Meteor release.
  [Feature Request #196](https://github.com/meteor/meteor-feature-requests/issues/196)
  [PR #9213](https://github.com/meteor/meteor/pull/9213)
  [Issue #9447](https://github.com/meteor/meteor/issues/9447)
  [PR #9448](https://github.com/meteor/meteor/pull/9448)

* The previously-served `/manifest.json` application metadata file is now
  served from `/__browser/manifest.json` for web browsers, to avoid
  confusion with other kinds of `manifest.json` files. Cordova clients
  will continue to load the manifest file from `/__cordova/manifest.json`,
  as before. [Issue #6674](https://github.com/meteor/meteor/issues/6674)
  [PR #9424](https://github.com/meteor/meteor/pull/9424)

* The bundled version of MongoDB used by `meteor run` in development
  on 64-bit architectures has been updated to 3.4.10. 32-bit architectures
  will continue to use MongoDB 3.2.x versions since MongoDB is no longer
  producing 32-bit versions of MongoDB for newer release tracks.
  [PR #9396](https://github.com/meteor/meteor/pull/9396)

* Meteor's internal `minifier-css` package has been updated to use `postcss`
  for CSS parsing and minifying, instead of the abandoned `css-parse` and
  `css-stringify` packages. Changes made to the `CssTools` API exposed by the
  `minifier-css` package are mostly backwards compatible (the
  `standard-minifier-css` package that uses it didn't have to change for
  example), but now that we're using `postcss` the AST accepted and returned
  from certain functions is different. This could impact developers who are
  tying into Meteor's internal `minifier-css` package directly. The AST based
  function changes are:

  * `CssTools.parseCss` now returns a PostCSS
    [`Root`](http://api.postcss.org/Root.html) object.    
  * `CssTools.stringifyCss` expects a PostCSS `Root` object as its first
    parameter.    
  * `CssTools.mergeCssAsts` expects an array of PostCSS `Root` objects as its
    first parameter.    
  * `CssTools.rewriteCssUrls` expects a PostCSS `Root` object as its first
    parameter.

  [PR #9263](https://github.com/meteor/meteor/pull/9263)

* The `_` variable will once again remain bound to `underscore` (if
  installed) in `meteor shell`, fixing a regression introduced by Node 8.
  [PR #9406](https://github.com/meteor/meteor/pull/9406)

* Dynamically `import()`ed modules will now be fetched from the
  application server using an HTTP POST request, rather than a WebSocket
  message. This strategy has all the benefits of the previous strategy,
  except that it does not require establishing a WebSocket connection
  before fetching dynamic modules, in exchange for slightly higher latency
  per request. [PR #9384](https://github.com/meteor/meteor/pull/9384)

* To reduce the total number of HTTP requests for dynamic modules, rapid
  sequences of `import()` calls within the same tick of the event loop
  will now be automatically batched into a single HTTP request. In other
  words, the following code will result in only one HTTP request:
  ```js
  const [
    React,
    ReactDOM
  ] = await Promise.all([
    import("react"),
    import("react-dom")
  ]);
  ```

* Thanks to a feature request and pull request from
  [@CaptainN](https://github.com/CaptainN), all available dynamic modules
  will be automatically prefetched after page load and permanently cached
  in IndexedDB when the `appcache` package is in use, ensuring that
  dynamic `import()` will work for offline apps. Although the HTML5
  Application Cache was deliberately *not* used for this prefetching, the
  new behavior matches the spirit/intention of the `appcache` package.
  [Feature Request #236](https://github.com/meteor/meteor-feature-requests/issues/236)
  [PR #9482](https://github.com/meteor/meteor/pull/9482)
  [PR #9434](https://github.com/meteor/meteor/pull/9434)

* The `es5-shim` library is no longer included in the initial JavaScript
  bundle, but is instead injected using a `<script>` tag in older browsers
  that may be missing full support for ECMAScript 5. For the vast majority
  of modern browsers that do not need `es5-shim`, this change will reduce
  the bundle size by about 10KB (minified, pre-gzip). For testing
  purposes, the `<script>` tag injection can be triggered in any browser
  by appending `?force_es5_shim=1` to the application URL.
  [PR #9360](https://github.com/meteor/meteor/pull/9360)

* The `Tinytest.addAsync` API now accepts test functions that return
  `Promise` objects, making the `onComplete` callback unnecessary:
  ```js
  Tinytest.addAsync("some async stuff", async function (test) {
    test.equal(shouldReturnFoo(), "foo");
    const bar = await shouldReturnBarAsync();
    test.equal(bar, "bar");
  });
  ```
  [PR #9409](https://github.com/meteor/meteor/pull/9409)

* Line number comments are no longer added to bundled JavaScript files on
  the client or the server. Several years ago, before all major browsers
  supported source maps, we felt it was important to provide line number
  information in generated files using end-of-line comments like
  ```js
  some.code(1234); // 123
  more.code(5, 6); // 124
  ```
  Adding all these comments was always slower than leaving the code
  unmodified, but recently the comments have begun interacting badly with
  certain newer ECMAScript syntax, such as multi-line template strings.
  Since source maps are well supported in most browsers that developers
  are likely to be using for development, and the line number comments are
  now causing substantive problems beyond the performance cost, we
  concluded it was time to stop using them.
  [PR #9323](https://github.com/meteor/meteor/pull/9323)
  [Issue #9160](https://github.com/meteor/meteor/issues/9160)

* Since Meteor 1.3, Meteor has supported string-valued `"browser"` fields
  in `package.json` files, to enable alternate entry points for packages
  in client JavaScript bundles. In Meteor 1.6.1, we are expanding support
  to include object-valued `"browser"` fields, according to this
  unofficial and woefully incomplete (but widely-implemented) "[spec
  document](https://github.com/defunctzombie/package-browser-field-spec)."
  We are only supporting the "relative style" of browser replacements,
  however, and not the "package style" (as detailed in this
  [comment](https://github.com/meteor/meteor/issues/6890#issuecomment-339817703)),
  because supporting the package style would have imposed an unacceptable
  runtime cost on all imports (not just those overridden by a `"browser"`
  field). [PR #9311](https://github.com/meteor/meteor/pull/9311) [Issue
  #6890](https://github.com/meteor/meteor/issues/6890)

* The `Boilerplate#toHTML` method from the `boilerplate-generator` package
  has been deprecated in favor of `toHTMLAsync` (which returns a `Promise`
  that resolves to a string of HTML) or `toHTMLStream` (which returns a
  `Stream` of HTML). Although direct usage of `toHTML` is unlikely, please
  update any code that calls this method if you see deprecation warnings
  in development. [Issue #9521](https://github.com/meteor/meteor/issues/9521).

* The `npm` package has been upgraded to version 5.6.0, and our fork of
  its `pacote` dependency has been rebased against version 7.0.2.

* The `reify` npm package has been updated to version 0.13.7.

* The `minifier-js` package has been updated to use `uglify-es` 3.2.2.

* The `request` npm package used by both the `http` package and the
  `meteor` command-line tool has been upgraded to version 2.83.0.

* The `kexec` npm package has been updated to version 3.0.0.

* The `moment` npm package has been updated to version 2.20.1.

* The `rimraf` npm package has been updated to version 2.6.2.

* The `glob` npm package has been updated to version 7.1.2.

* The `ignore` npm package has been updated to version 3.3.7.

* The `escope` npm package has been updated to version 3.6.0.

* The `split2` npm package has been updated to version 2.2.0.

* The `multipipe` npm package has been updated to version 2.0.1.

* The `pathwatcher` npm package has been updated to version 7.1.1.

* The `lru-cache` npm package has been updated to version 4.1.1.

* The deprecated `Meteor.http` object has been removed. If your
  application is still using `Meteor.http`, you should now use `HTTP`
  instead:
  ```js
  import { HTTP } from "meteor/http";
  HTTP.call("GET", url, ...);
  ```

* The deprecated `Meteor.uuid` function has been removed. If your
  application is still using `Meteor.uuid`, you should run
  ```sh
  meteor npm install uuid
  ```
  to install the widely used [`uuid`](https://www.npmjs.com/package/uuid)
  package from npm. Example usage:
  ```js
  import uuid from "uuid";
  console.log(uuid());
  ```

* The log-suppressing flags on errors in `ddp-client` and `ddp-server` have been
  changed from `expected` to `_expectedByTest` in order to avoid inadvertently
  silencing errors in production.
  [Issue #6912](https://github.com/meteor/meteor/issues/6912)
  [PR #9515](https://github.com/meteor/meteor/pull/9515)

* Provide basic support for [iPhone X](https://developer.apple.com/ios/update-apps-for-iphone-x/)
  status bar and launch screens, which includes updates to
  [`cordova-plugin-statusbar@2.3.0`](https://github.com/apache/cordova-plugin-statusbar/blob/master/RELEASENOTES.md#230-nov-06-2017)
  and [`cordova-plugin-splashscreen@4.1.0`](https://github.com/apache/cordova-plugin-splashscreen/blob/master/RELEASENOTES.md#410-nov-06-2017).
  [Issue #9041](https://github.com/meteor/meteor/issues/9041)
  [PR #9375](https://github.com/meteor/meteor/pull/9375)

* Fixed an issue preventing the installation of scoped Cordova packages.
  For example,
  ```sh
  meteor add cordova:@somescope/some-cordova-plugin@1.0.0
  ```
  will now work properly.
  [Issue #7336](https://github.com/meteor/meteor/issues/7336)
  [PR #9334](https://github.com/meteor/meteor/pull/9334)

* iOS icons and launch screens have been updated to support iOS 11
  [Issue #9196](https://github.com/meteor/meteor/issues/9196)
  [PR #9198](https://github.com/meteor/meteor/pull/9198)

* Enables passing `false` to `cursor.count()` on the client to prevent skip
  and limit from having an effect on the result.
  [Issue #1201](https://github.com/meteor/meteor/issues/1201)
  [PR #9205](https://github.com/meteor/meteor/pull/9205)

* An `onExternalLogin` hook has been added to the accounts system, to allow
  the customization of OAuth user profile updates.
  [PR #9042](https://github.com/meteor/meteor/pull/9042)

* `Accounts.config` now supports a `bcryptRounds` option that
  overrides the default 10 rounds currently used to secure passwords.
  [PR #9044](https://github.com/meteor/meteor/pull/9044)

* Developers running Meteor from an interactive shell within Emacs should
  notice a substantial performance improvement thanks to automatic
  disabling of the progress spinner, which otherwise reacts slowly.
  [PR #9341](https://github.com/meteor/meteor/pull/9341)

* `Npm.depends` can now specify any `http` or `https` URL.
  [Issue #9236](https://github.com/meteor/meteor/issues/9236)
  [PR #9237](https://github.com/meteor/meteor/pull/9237)

* Byte order marks included in `--settings` files will no longer crash the
  Meteor Tool.
  [Issue #5180](https://github.com/meteor/meteor/issues/5180)
  [PR #9459](https://github.com/meteor/meteor/pull/9459)

* Meteor's Node Mongo driver is now configured with the
  [`ignoreUndefined`](http://mongodb.github.io/node-mongodb-native/2.2/api/MongoClient.html#connect)
  connection option set to `true`, to make sure fields with `undefined`
  values are not first converted to `null`, when inserted/updated. Fields
  with `undefined` values are now ignored when inserting/updating.
  [Issue #6051](https://github.com/meteor/meteor/issues/6051)
  [PR #9444](https://github.com/meteor/meteor/pull/9444)

* The `accounts-ui-unstyled` package has been updated to use `<form />` and
  `<button />` tags with its login/signup form, instead of `<div />`'s. This
  change helps browser's notice login/signup requests, allowing them to
  trigger their "remember your login/password" functionality.

  > **Note:** If your application is styling the login/signup form using a CSS
    path that includes the replaced `div` elements (e.g.
    `div.login-form { ...` or `div.login-button { ...`), your styles will
    break. You can either update your CSS to use `form.` / `button.` or
    adjust your CSS specificity by styling on `class` / `id` attributes
    only.

  [Issue #1746](https://github.com/meteor/meteor/issues/1746)
  [PR #9442](https://github.com/meteor/meteor/pull/9442)

* The `stylus` package has been deprecated and will no longer be
  supported/maintained.
  [PR #9445](https://github.com/meteor/meteor/pull/9445)

* Support for the `meteor admin get-machine` command has been removed, and
  the build farm has been discontinued. Ever since Meteor 1.4, packages
  with binary dependencies have been automatically (re)compiled when they
  are installed in an application, assuming the target machine has a basic
  compiler toolchain. To see the requirements for this compilation step,
  consult the [platform requirements for
  `node-gyp`](https://github.com/nodejs/node-gyp#installation).

* Client side `Accounts.onLogin` callbacks now receive a login details
  object, with the attempted login type (e.g. `{ type: password }` after a
  successful password based login, `{ type: resume }` after a DDP reconnect,
  etc.).
  [Issue #5127](https://github.com/meteor/meteor/issues/5127)
  [PR #9512](https://github.com/meteor/meteor/pull/9512)

## v1.6.0.1, 2017-12-08

* Node has been upgraded to version
  [8.9.3](https://nodejs.org/en/blog/release/v8.9.3/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/december-2017-security-releases/).

* The `npm` package has been upgraded to version 5.5.1, which supports
  several new features, including two-factor authentication, as described
  in the [release notes](https://github.com/npm/npm/blob/latest/CHANGELOG.md#v551-2017-10-04).

## v1.6, 2017-10-30

* **Important note for package maintainers:**

  With the jump to Node 8, some packages published using Meteor 1.6 may no
  longer be compatible with older Meteor versions. In order to maintain
  compatibility with Meteor 1.5 apps when publishing your package, you can
  specify a release version with the meteor publish command:

  ```
  meteor --release 1.5.3 publish
  ```

  If you're interested in taking advantage of Meteor 1.6 while still
  supporting older Meteor versions, you can consider publishing for Meteor
  1.6 from a new branch, with your package's minor or major version bumped.
  You can then continue to publish for Meteor 1.5 from the original branch.
  Note that the 1.6 branch version bump is important so that you can continue
  publishing patch updates for Meteor 1.5 from the original branch.

  [Issue #9308](https://github.com/meteor/meteor/issues/9308)

* Node.js has been upgraded to version 8.8.1, which will be entering
  long-term support (LTS) coverage on 31 October 2017, lasting through
  December 2019 ([full schedule](https://github.com/nodejs/Release#nodejs-release-working-group)).
  This is a *major* upgrade from the previous version of Node.js used by
  Meteor, 4.8.4.

* The `npm` npm package has been upgraded to version 5.4.2, a major
  upgrade from 4.6.1. While this update should be backwards-compatible for
  existing Meteor apps and packages, if you are the maintainer of any
  Meteor packages, pay close attention to your `npm-shrinkwrap.json` files
  when first using this version of `npm`. For normal Meteor application
  development, this upgrade primarily affects the version of `npm` used by
  `meteor npm ...` commands. A functional installation of `git` may be
  required to support GitHub repository and/or tarball URLs.
  [Troubleshooting](https://docs.npmjs.com/troubleshooting/common-errors).
  [PR #8835](https://github.com/meteor/meteor/pull/8835)

* In addition to `meteor node` and `meteor npm`, which are convenient
  shorthands for `node` and `npm`, `meteor npx <command>` can be used to
  execute commands from a local `node_modules/.bin` directory or from the
  `npm` cache. Any packages necessary to run the command will be
  automatically downloaded. [Read](https://www.npmjs.com/package/npx)
  about it, or just try some commands:
  ```sh
  meteor npx cowsay mooooo
  meteor npx uuid
  meteor npx nyancat
  meteor npx yarn
  ```

* The `meteor debug` command has been superseded by the more flexible
  `--inspect` and `--inspect-brk` command-line flags, which work for any
  `run`, `test`, or `test-packages` command.

  The syntax of these flags is the same as the equivalent Node.js
  [flags](https://nodejs.org/en/docs/inspector/#command-line-options),
  with two notable differences:

  * The flags affect the server process spawned by the build process,
    rather than affecting the build process itself.

  * The `--inspect-brk` flag causes the server process to pause just after
    server code has loaded but before it begins to execute, giving the
    developer a chance to set breakpoints in server code.

  [Feature Request #194](https://github.com/meteor/meteor-feature-requests/issues/194)

* On Windows, Meteor can now be installed or reinstalled from scratch
  using the command `choco install meteor`, using the
  [Chocolatey](https://chocolatey.org/) package manager. This method of
  installation replaces the old `InstallMeteor.exe` installer, which had a
  number of shortcomings, and will no longer be supported.

* Fresh installs of Meteor 1.6 on 64-bit Windows machines will now use
  native 64-bit Node.js binaries, rather than a 32-bit version of Node.js.
  In addition to being faster, native 64-bit support will enable Windows
  developers to debug asynchronous stack traces more easily in the new
  Node.js inspector, which is only fully supported by native 64-bit
  architectures. Note that merely running `meteor update` from a 32-bit
  version of Meteor will still install a 32-bit version of Meteor 1.6, so
  you should use `choco install meteor` to get a fresh 64-bit version.
  [PR #9218](https://github.com/meteor/meteor/pull/9218)

* To support developers running on a 32-bit OS, Meteor now supports both 32-
  and 64-bit versions of Mongo. Mongo 3.2 is the last 32-bit version available
  from Mongo. Meteor running on a 32-bit OS will use a 32-bit version of Mongo
  3.2 and 64-bit platforms will receive newer Mongo versions in future releases.
  [PR #9173](https://github.com/meteor/meteor/pull/9173)

* After several reliability improvements, native file watching has been
  un-disabled on Windows. Though native file change notifications will
  probably never work with network or shared virtual file systems (e.g.,
  NTFS or Vagrant-mounted disks), Meteor uses an efficient prioritized
  polling system as a fallback for those file systems.

* Various optimizations have reduced the on-disk size of the `meteor-tool`
  package from 545MB (1.5.2.2) to 219MB.

* The `meteor-babel` package has been upgraded to version 0.24.6, to take
  better advantage of native language features in Node 8.

* The `reify` npm package has been upgraded to version 0.12.3.

* The `meteor-promise` package has been upgraded to version 0.8.6, to
  enable better handling of `UnhandledPromiseRejectionWarning`s.

* The `node-gyp` npm package has been upgraded to version 3.6.2.

* The `node-pre-gyp` npm package has been updated to version 0.6.36.

* The `fibers` npm package has been upgraded to version 2.0.0.

* The `pathwatcher` npm package has been upgraded to version 7.1.0.

* The `http-proxy` npm package has been upgraded to version 1.16.2.

* The `semver` npm package has been upgraded to version 5.4.1.

* When running Meteor tool tests (i.e. `./meteor self-test`) during the
  course of developing Meteor itself, it is no longer necessary to
  `./meteor npm install -g phantomjs-prebuilt browserstack-webdriver`.
  These will now be installed automatically upon their use.

* You can now run `meteor test --driver-package user:package` without
  first running `meteor add user:package`.

* iOS icons and launch screens have been updated to support iOS 11
  [Issue #9196](https://github.com/meteor/meteor/issues/9196)
  [PR #9198](https://github.com/meteor/meteor/pull/9198)

## v1.5.4.1, 2017-12-08

* Node has been upgraded to version
  [4.8.7](https://nodejs.org/en/blog/release/v4.8.7/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/december-2017-security-releases/).

## v1.5.4, 2017-11-08

* Node has been updated to version 4.8.6. This release officially
  includes our fix of a faulty backport of garbage collection-related
  logic in V8 and ends Meteor's use of a custom Node with that patch.
  In addition, it includes small OpenSSL updates as announced on the
  Node blog: https://nodejs.org/en/blog/release/v4.8.6/.
  [Issue #8648](https://github.com/meteor/meteor/issues/8648)

## v1.5.3, 2017-11-04

* Node has been upgraded to version 4.8.5, a recommended security
  release: https://nodejs.org/en/blog/release/v4.8.5/. While it was
  expected that Node 4.8.5 would also include our fix of a faulty
  backport of garbage collection-related logic in V8, the timing
  of this security release has caused that to be delayed until 4.8.6.
  Therefore, this Node still includes our patch for this issue.
  [Issue #8648](https://github.com/meteor/meteor/issues/8648)

* Various backports from Meteor 1.6, as detailed in the
  [PR for Meteor 1.5.3](https://github.com/meteor/meteor/pull/9266).
  Briefly, these involve fixes for:
  * Child imports of dynamically imported modules within packages.
    [#9182](https://github.com/meteor/meteor/issues/9182)
  * Unresolved circular dependencies.
    [#9176](https://github.com/meteor/meteor/issues/9176)
  * Windows temporary directory handling.

## v1.5.2.2, 2017-10-02

* Fixes a regression in 1.5.2.1 which resulted in the macOS firewall
  repeatedly asking to "accept incoming network connections". While the
  `node` binary in 1.5.2.1 was functionally the same as 1.5.2, it had
  been recompiled on our build farm (which re-compiles all architectures
  at the same time) to ensure compatibility with older (but still
  supported) Linux distributions. Unfortunately, macOS took issue with
  the binary having a different 'signature' (but same 'identifier') as
  one it had already seen, and refused to permanently "allow" it in the
  firewall. Our macOS `node` binaries are now signed with a certificate,
  hopefully preventing this from occurring again.
  [Issue #9139](https://github.com/meteor/meteor/issues/9139)

* Fixes a regression in `accounts-base` caused by changes to the (now
  deprecated) `connection.onReconnect` function which caused users to be
  logged out shortly after logging in.
  [Issue #9140](https://github.com/meteor/meteor/issues/9140)
  [PR #](https://github.com/meteor/meteor/pull/9148)

* [`cordova-ios`](https://github.com/apache/cordova-ios) has been updated to
  version 4.5.1, to add in iOS 11 / Xcode 9 compatibility.
  [Issue #9098](https://github.com/meteor/meteor/issues/9098)
  [Issue #9126](https://github.com/meteor/meteor/issues/9126)
  [PR #9137](https://github.com/meteor/meteor/pull/9137)

* Includes a follow-up change to the (not commonly necessary)
  `Npm.require` which ensures built-in modules are loaded first, which
  was necessary after a change in 1.5.2.1 which reduced its scope.
  This resolves "Cannot find module crypto" and similar errors.
  [Issue #9136](https://github.com/meteor/meteor/issues/9136)

* A bug that prevented building some binary npm packages on Windows has
  been fixed. [Issue #9153](https://github.com/meteor/meteor/issues/9153)

## v1.5.2.1, 2017-09-26

* Updating to Meteor 1.5.2.1 will automatically patch a security
  vulnerability in the `allow-deny` package, since `meteor-tool@1.5.2_1`
  requires `allow-deny@1.0.9` or later. If for any reason you are not
  ready or able to update to Meteor 1.5.2.1 by running `meteor update`,
  please at least run
  ```sh
  meteor update allow-deny
  ```
  instead. More details about the security vulnerability can be found on
  the Meteor forums.

* The command-line `meteor` tool no longer invokes `node` with the
  `--expose-gc` flag. Although this flag allowed the build process to be
  more aggressive about collecting garbage, it was also a source of
  problems in Meteor 1.5.2 and Node 4.8.4, from increased segmentation
  faults during (the more frequent) garbage collections to occasional
  slowness in rebuilding local packages. The flag is likely to return in
  Meteor 1.6, where it has not exhibited any of the same problems.

* Meteor now supports `.meteorignore` files, which cause the build system
  to ignore certain files and directories using the same pattern syntax as
  [`.gitignore` files](https://git-scm.com/docs/gitignore). These files
  may appear in any directory of your app or package, specifying rules for
  the directory tree below them. Of course, `.meteorignore` files are also
  fully integrated with Meteor's file watching system, so they can be
  added, removed, or modified during development.
  [Feature request #5](https://github.com/meteor/meteor-feature-requests/issues/5)

* DDP's `connection.onReconnect = func` feature has been deprecated. This
  functionality was previously supported as a way to set a function to be
  called as the first step of reconnecting. This approach has proven to be
  inflexible as only one function can be defined to be called when
  reconnecting. Meteor's accounts system was already setting an
  `onReconnect` callback to be used internally, which means anyone setting
  their own `onReconnect` callback was inadvertently overwriting code used
  internally. Moving forward the `DDP.onReconnect(callback)` method should be
  used to register callbacks to call when a connection reconnects. The
  connection that is reconnecting is passed as the only argument to
  `callback`. This is used by the accounts system to re-login on reconnects
  without interfering with other code that uses `connection.onReconnect`.
  [Issue #5665](https://github.com/meteor/meteor/issues/5665)
  [PR #9092](https://github.com/meteor/meteor/pull/9092)

* `reactive-dict` now supports `destroy`. `destroy` will clear the `ReactiveDict`s
  data and unregister the `ReactiveDict` from data migration.  
  i.e. When a `ReactiveDict` is instantiated with a name on the client and the
  `reload` package is present in the project.
  [Feature Request #76](https://github.com/meteor/meteor-feature-requests/issues/76)
  [PR #9063](https://github.com/meteor/meteor/pull/9063)

* The `webapp` package has been updated to support UNIX domain sockets. If a
  `UNIX_SOCKET_PATH` environment variable is set with a valid
  UNIX socket file path (e.g. `UNIX_SOCKET_PATH=/tmp/socktest.sock`), Meteor's
  HTTP server will use that socket file for inter-process communication,
  instead of TCP. This can be useful in cases like using Nginx to proxy
  requests back to an internal Meteor application. Leveraging UNIX domain
  sockets for inter-process communication reduces the sometimes unnecessary
  overhead required by TCP based communication.
  [Issue #7392](https://github.com/meteor/meteor/issues/7392)
  [PR #8702](https://github.com/meteor/meteor/pull/8702)

* The `fastclick` package (previously included by default in Cordova
  applications through the `mobile-experience` package) has been deprecated.
  This package is no longer maintained and has years of outstanding
  unresolved issues, some of which are impacting Meteor users. Most modern
  mobile web browsers have removed the 300ms tap delay that `fastclick` worked
  around, as long as the following `<head />` `meta` element is set (which
  is generally considered a mobile best practice regardless, and which the
  Meteor boilerplate generator already sets by default for Cordova apps):
  `<meta name="viewport" content="width=device-width">`
  If anyone is still interested in using `fastclick` with their application,
  it can be installed from npm directly (`meteor npm install --save fastclick`).
  Reference:
  [Mobile Chrome](https://developers.google.com/web/updates/2013/12/300ms-tap-delay-gone-away)
  [Mobile Safari](https://bugs.webkit.org/show_bug.cgi?id=150604)
  [PR #9039](https://github.com/meteor/meteor/pull/9039)

* Minimongo cursors are now JavaScript iterable objects and can now be iterated over
  using `for...of` loops, spread operator, `yield*`, and destructuring assignments.
  [PR #8888](https://github.com/meteor/meteor/pull/8888)

## v1.5.2, 2017-09-05

* Node 4.8.4 has been patched to include
  https://github.com/nodejs/node/pull/14829, an important PR implemented
  by our own @abernix (:tada:), which fixes a faulty backport of garbage
  collection-related logic in V8 that was causing occasional segmentation
  faults during Meteor development and testing, ever since Node 4.6.2
  (Meteor 1.4.2.3). When Node 4.8.5 is officially released with these
  changes, we will immediately publish a small follow-up release.
  [Issue #8648](https://github.com/meteor/meteor/issues/8648)

* When Meteor writes to watched files during the build process, it no
  longer relies on file watchers to detect the change and invalidate the
  optimistic file system cache, which should fix a number of problems
  related by the symptom of endless rebuilding.
  [Issue #8988](https://github.com/meteor/meteor/issues/8988)
  [Issue #8942](https://github.com/meteor/meteor/issues/8942)
  [PR #9007](https://github.com/meteor/meteor/pull/9007)

* The `cordova-lib` npm package has been updated to 7.0.1, along with
  cordova-android (6.2.3) and cordova-ios (4.4.0), and various plugins.
  [PR #8919](https://github.com/meteor/meteor/pull/8919) resolves the
  umbrella [issue #8686](https://github.com/meteor/meteor/issues/8686), as
  well as several Android build issues:
  [#8408](https://github.com/meteor/meteor/issues/8408),
  [#8424](https://github.com/meteor/meteor/issues/8424), and
  [#8464](https://github.com/meteor/meteor/issues/8464).

* The [`boilerplate-generator`](https://github.com/meteor/meteor/tree/release-1.5.2/packages/boilerplate-generator)
  package responsible for generating initial HTML documents for Meteor
  apps has been refactored by @stevenhao to avoid using the
  `spacebars`-related packages, which means it is now possible to remove
  Blaze as a dependency from the server as well as the client.
  [PR #8820](https://github.com/meteor/meteor/pull/8820)

* The `meteor-babel` package has been upgraded to version 0.23.1.

* The `reify` npm package has been upgraded to version 0.12.0, which
  includes a minor breaking
  [change](https://github.com/benjamn/reify/commit/8defc645e556429283e0b522fd3afababf6525ea)
  that correctly skips exports named `default` in `export * from "module"`
  declarations. If you have any wrapper modules that re-export another
  module's exports using `export * from "./wrapped/module"`, and the
  wrapped module has a `default` export that you want to be included, you
  should now explicitly re-export `default` using a second declaration:
  ```js
  export * from "./wrapped/module";
  export { default } "./wrapped/module";
  ```

* The `meteor-promise` package has been upgraded to version 0.8.5,
  and the `promise` polyfill package has been upgraded to 8.0.1.

* The `semver` npm package has been upgraded to version 5.3.0.
  [PR #8859](https://github.com/meteor/meteor/pull/8859)

* The `faye-websocket` npm package has been upgraded to version 0.11.1,
  and its dependency `websocket-driver` has been upgraded to a version
  containing [this fix](https://github.com/faye/websocket-driver-node/issues/21),
  thanks to [@sdarnell](https://github.com/sdarnell).
  [meteor-feature-requests#160](https://github.com/meteor/meteor-feature-requests/issues/160)

* The `uglify-js` npm package has been upgraded to version 3.0.28.

* Thanks to PRs [#8960](https://github.com/meteor/meteor/pull/8960) and
  [#9018](https://github.com/meteor/meteor/pull/9018) by @GeoffreyBooth, a
  [`coffeescript-compiler`](https://github.com/meteor/meteor/tree/release-1.5.2/packages/non-core/coffeescript-compiler)
  package has been extracted from the `coffeescript` package, similar to
  how the `babel-compiler` package is separate from the `ecmascript`
  package, so that other packages (such as
  [`vue-coffee`](https://github.com/meteor-vue/vue-meteor/tree/master/packages/vue-coffee))
  can make use of `coffeescript-compiler`. All `coffeescript`-related
  packages have been moved to
  [`packages/non-core`](https://github.com/meteor/meteor/tree/release-1.5.2/packages/non-core),
  so that they can be published independently from Meteor releases.

* `meteor list --tree` can now be used to list all transitive package
  dependencies (and versions) in an application. Weakly referenced dependencies
  can also be listed by using the `--weak` option. For more information, run
  `meteor help list`.
  [PR #8936](https://github.com/meteor/meteor/pull/8936)

* The `star.json` manifest created within the root of a `meteor build` bundle
  will now contain `nodeVersion` and `npmVersion` which will specify the exact
  versions of Node.js and npm (respectively) which the Meteor release was
  bundled with.  The `.node_version.txt` file will still be written into the
  root of the bundle, but it may be deprecated in a future version of Meteor.
  [PR #8956](https://github.com/meteor/meteor/pull/8956)

* A new package called `mongo-dev-server` has been created and wired into
  `mongo` as a dependency. As long as this package is included in a Meteor
  application (which it is by default since all new Meteor apps have `mongo`
  as a dependency), a local development MongoDB server is started alongside
  the application. This package was created to provide a way to disable the
  local development Mongo server, when `mongo` isn't needed (e.g. when using
  Meteor as a build system only). If an application has no dependency on
  `mongo`, the `mongo-dev-server` package is not added, which means no local
  development Mongo server is started.
  [Feature Request #31](https://github.com/meteor/meteor-feature-requests/issues/31)
  [PR #8853](https://github.com/meteor/meteor/pull/8853)

* `Accounts.config` no longer mistakenly allows tokens to expire when
  the `loginExpirationInDays` option is set to `null`.
  [Issue #5121](https://github.com/meteor/meteor/issues/5121)
  [PR #8917](https://github.com/meteor/meteor/pull/8917)

* The `"env"` field is now supported in `.babelrc` files.
  [PR #8963](https://github.com/meteor/meteor/pull/8963)

* Files contained by `client/compatibility/` directories or added with
  `api.addFiles(files, ..., { bare: true })` are now evaluated before
  importing modules with `require`, which may be a breaking change if you
  depend on the interleaving of `bare` files with eager module evaluation.
  [PR #8972](https://github.com/meteor/meteor/pull/8972)

* When `meteor test-packages` runs in a browser, uncaught exceptions will
  now be displayed above the test results, along with the usual summary of
  test failures, in case those uncaught errors have something to do with
  later test failures.
  [Issue #4979](https://github.com/meteor/meteor/issues/4979)
  [PR #9034](https://github.com/meteor/meteor/pull/9034)

## v1.5.1, 2017-07-12

* Node has been upgraded to version 4.8.4.

* A new core Meteor package called `server-render` provides generic
  support for server-side rendering of HTML, as described in the package's
  [`README.md`](https://github.com/meteor/meteor/blob/release-1.5.1/packages/server-render/README.md).
  [PR #8841](https://github.com/meteor/meteor/pull/8841)

* To reduce the total number of file descriptors held open by the Meteor
  build system, native file watchers will now be started only for files
  that have changed at least once. This new policy means you may have to
  [wait up to 5000ms](https://github.com/meteor/meteor/blob/6bde360b9c075f1c78c3850eadbdfa7fe271f396/tools/fs/safe-watcher.js#L20-L21)
  for changes to be detected when you first edit a file, but thereafter
  changes will be detected instantaneously. In return for that small
  initial waiting time, the number of open file descriptors will now be
  bounded roughly by the number of files you are actively editing, rather
  than the number of files involved in the build (often thousands), which
  should help with issues like
  [#8648](https://github.com/meteor/meteor/issues/8648). If you need to
  disable the new behavior for any reason, simply set the
  `METEOR_WATCH_PRIORITIZE_CHANGED` environment variable to `"false"`, as
  explained in [PR #8866](https://github.com/meteor/meteor/pull/8866).

* All `observe` and `observeChanges` callbacks are now bound using
  `Meteor.bindEnvironment`.  The same `EnvironmentVariable`s that were
  present when `observe` or `observeChanges` was called are now available
  inside the callbacks. [PR #8734](https://github.com/meteor/meteor/pull/8734)

* A subscription's `onReady` is now fired again during a re-subscription, even
  if the subscription has the same arguments.  Previously, when subscribing
  to a publication the `onReady` would have only been called if the arguments
  were different, creating a confusing difference in functionality.  This may be
  breaking behavior if an app uses the firing of `onReady` as an assumption
  that the data was just received from the server.  If such functionality is
  still necessary, consider using
  [`observe`](https://docs.meteor.com/api/collections.html#Mongo-Cursor-observe)
  or
  [`observeChanges`](https://docs.meteor.com/api/collections.html#Mongo-Cursor-observeChanges)
  [PR #8754](https://github.com/meteor/meteor/pull/8754)
  [Issue #1173](https://github.com/meteor/meteor/issues/1173)

* The `minimongo` and `mongo` packages are now compliant with the upsert behavior
  of MongoDB 2.6 and higher. **As a result support for MongoDB 2.4 has been dropped.**
  This mainly changes the effect of the selector on newly inserted documents.
  [PR #8815](https://github.com/meteor/meteor/pull/8815)

* `reactive-dict` now supports setting initial data when defining a named
  `ReactiveDict`. No longer run migration logic when used on the server,
  this is to prevent duplicate name error on reloads. Initial data is now
  properly serialized.

* `accounts-password` now uses `example.com` as a default "from" address instead
  of `meteor.com`. This change could break account-related e-mail notifications
  (forgot password, activation, etc.) for applications which do not properly
  configure a "from" domain since e-mail providers will often reject mail sent
  from `example.com`. Ensure that `Accounts.emailTemplates.from` is set to a
  proper domain in all applications.
  [PR #8760](https://github.com/meteor/meteor/issues/8760)

* The `accounts-facebook` and `facebook-oauth` packages have been updated to
  use the v2.9 of the Facebook Graph API for the Login Dialog since the v2.2
  version will be deprecated by Facebook in July.  There shouldn't be a problem
  regardless since Facebook simply rolls over to the next active version
  (v2.3, in this case) however this should assist in avoiding deprecation
  warnings and should enable any new functionality which has become available.
  [PR #8858](https://github.com/meteor/meteor/pull/8858)

* Add `DDP._CurrentPublicationInvocation` and `DDP._CurrentMethodInvocation`.
  `DDP._CurrentInvocation` remains for backwards-compatibility. This change
  allows method calls from publications to inherit the `connection` from the
  the publication which called the method.
  [PR #8629](https://github.com/meteor/meteor/pull/8629)

  > Note: If you're calling methods from publications that are using `this.connection`
  > to see if the method was called from server code or not. These checks will now
  > be more restrictive because `this.connection` will now be available when a
  > method is called from a publication.

* Fix issue with publications temporarily having `DDP._CurrentInvocation` set on
  re-run after a user logged in.  This is now provided through
  `DDP._CurrentPublicationInvocation` at all times inside a publication,
  as described above.
  [PR #8031](https://github.com/meteor/meteor/pull/8031)
  [PR #8629](https://github.com/meteor/meteor/pull/8629)

* `Meteor.userId()` and `Meteor.user()` can now be used in both method calls and
  publications.
  [PR #8629](https://github.com/meteor/meteor/pull/8629)

* `this.onStop` callbacks in publications are now run with the publication's
  context and with its `EnvironmentVariable`s bound.
  [PR #8629](https://github.com/meteor/meteor/pull/8629)

* The `minifier-js` package will now replace `process.env.NODE_ENV` with
  its string value (or `"development"` if unspecified).

* The `meteor-babel` npm package has been upgraded to version 0.22.0.

* The `reify` npm package has been upgraded to version 0.11.24.

* The `uglify-js` npm package has been upgraded to version 3.0.18.

* Illegal characters in paths written in build output directories will now
  be replaced with `_`s rather than removed, so that file and directory
  names consisting of only illegal characters do not become empty
  strings. [PR #8765](https://github.com/meteor/meteor/pull/8765).

* Additional "extra" packages (packages that aren't saved in `.meteor/packages`)
  can be included temporarily using the `--extra-packages`
  option.  For example: `meteor run --extra-packages bundle-visualizer`.
  Both `meteor test` and `meteor test-packages` also support the
  `--extra-packages` option and commas separate multiple package names.
  [PR #8769](https://github.com/meteor/meteor/pull/8769)

  > Note: Packages specified using the `--extra-packages` option override
  > version constraints from `.meteor/packages`.

* The `coffeescript` package has been updated to use CoffeeScript version
  1.12.6. [PR #8777](https://github.com/meteor/meteor/pull/8777)

* It's now possible to pipe a series of statements to `meteor shell`,
  whereas previously the input had to be an expression; for example:
  ```sh
  > echo 'import pkg from "babel-runtime/package.json";
  quote> pkg.version' |
  pipe> meteor shell
  "6.23.0"
  ```
  [Issue #8823](https://github.com/meteor/meteor/issues/8823)
  [PR #8833](https://github.com/meteor/meteor/pull/8833)

* Any `Error` thrown by a DDP method with the `error.isClientSafe`
  property set to `true` will now be serialized and displayed to the
  client, whereas previously only `Meteor.Error` objects were considered
  client-safe. [PR #8756](https://github.com/meteor/meteor/pull/8756)

## v1.5, 2017-05-30

* The `meteor-base` package implies a new `dynamic-import` package, which
  provides runtime support for [the proposed ECMAScript dynamic
  `import(...)` syntax](https://github.com/tc39/proposal-dynamic-import),
  enabling asynchronous module fetching or "code splitting." If your app
  does not use the `meteor-base` package, you can use the package by
  simply running `meteor add dynamic-import`. See this [blog
  post](https://blog.meteor.com/meteor-1-5-react-loadable-f029a320e59c)
  and [PR #8327](https://github.com/meteor/meteor/pull/8327) for more
  information about how dynamic `import(...)` works in Meteor, and how to
  use it in your applications.

* The `ecmascript-runtime` package, which provides polyfills for various
  new ECMAScript runtime APIs and language features, has been split into
  `ecmascript-runtime-client` and `ecmascript-runtime-server`, to reflect
  the different needs of browsers versus Node 4. The client runtime now
  relies on the `core-js` library found in the `node_modules` directory of
  the application, rather than a private duplicate installed via
  `Npm.depends`. This is unlikely to be a disruptive change for most
  developers, since the `babel-runtime` npm package is expected to be
  installed, and `core-js` is a dependency of `babel-runtime`, so
  `node_modules/core-js` should already be present. If that's not the
  case, just run `meteor npm install --save core-js` to install it.

* The `npm` npm package has been upgraded to version 4.6.1.

* The `meteor-babel` npm package has been upgraded to version 0.21.4,
  enabling the latest Reify compiler and the transform-class-properties
  plugin, among other improvements.

* The `reify` npm package has been upgraded to version 0.11.21, fixing
  [issue #8595](https://github.com/meteor/meteor/issues/8595) and
  improving compilation and runtime performance.

> Note: With this version of Reify, `import` declarations are compiled to
  `module.watch(require(id), ...)` instead of `module.importSync(id, ...)`
  or the older `module.import(id, ...)`. The behavior of the compiled code
  should be the same as before, but the details seemed different enough to
  warrant a note.

* The `install` npm package has been upgraded to version 0.10.1.

* The `meteor-promise` npm package has been upgraded to version 0.8.4.

* The `uglify-js` npm package has been upgraded to version 3.0.13, fixing
  [#8704](https://github.com/meteor/meteor/issues/8704).

* If you're using the `standard-minifier-js` Meteor package, as most
  Meteor developers do, it will now produce a detailed analysis of package
  and module sizes within your production `.js` bundle whenever you run
  `meteor build` or `meteor run --production`. These data are served by
  the application web server at the same URL as the minified `.js` bundle,
  except with a `.stats.json` file extension instead of `.js`. If you're
  using a different minifier plugin, and would like to support similar
  functionality, refer to
  [these](https://github.com/meteor/meteor/pull/8327/commits/084801237a8c288d99ec82b0fbc1c76bdf1aab16)
  [commits](https://github.com/meteor/meteor/pull/8327/commits/1c8bc7353e9a8d526880634a58c506b423c4a55e)
  for inspiration.

* To visualize the bundle size data produced by `standard-minifier-js`,
  run `meteor add bundle-visualizer` and then start your development
  server in production mode with `meteor run --production`. Be sure to
  remove the `bundle-visualizer` package before actually deploying your
  app, or the visualization will be displayed to your users.

* If you've been developing an app with multiple versions of Meteor, or
  testing with beta versions, and you haven't recently run `meteor reset`,
  your `.meteor/local/bundler-cache` directory may have become quite
  large. This is just a friendly reminder that this directory is perfectly
  safe to delete, and Meteor will repopulate it with only the most recent
  cached bundles.

* Apps created with `meteor create --bare` now use the `static-html`
  package for processing `.html` files instead of `blaze-html-templates`,
  to avoid large unnecessary dependencies like the `jquery` package.

* Babel plugins now receive file paths without leading `/` characters,
  which should prevent confusion about whether the path should be treated
  as absolute. [PR #8610](https://github.com/meteor/meteor/pull/8610)

* It is now possible to override the Cordova iOS and/or Android
  compatibility version by setting the `METEOR_CORDOVA_COMPAT_VERSION_IOS`
  and/or `METEOR_CORDOVA_COMPAT_VERSION_ANDROID` environment variables.
  [PR #8581](https://github.com/meteor/meteor/pull/8581)

* Modules in `node_modules` directories will no longer automatically have
  access to the `Buffer` polyfill on the client, since that polyfill
  contributed more than 22KB of minified JavaScript to the client bundle,
  and was rarely used. If you really need the Buffer API on the client,
  you should now obtain it explicitly with `require("buffer").Buffer`.
  [Issue #8645](https://github.com/meteor/meteor/issues/8645).

* Packages in `node_modules` directories are now considered non-portable
  (and thus may be automatically rebuilt for the current architecture), if
  their `package.json` files contain any of the following install hooks:
  `install`, `preinstall`, or `postinstall`. Previously, a package was
  considered non-portable only if it contained any `.node` binary modules.
  [Issue #8225](https://github.com/meteor/meteor/issues/8225)

## v1.4.4.5, 2017-12-08

* Node has been upgraded to version
  [4.8.7](https://nodejs.org/en/blog/release/v4.8.7/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/december-2017-security-releases/).

## v1.4.4.4, 2017-09-26

* Updating to Meteor 1.4.4.4 will automatically patch a security
  vulnerability in the `allow-deny` package, since `meteor-tool@1.4.4_4`
  requires `allow-deny@1.0.9` or later. If for any reason you are not
  ready or able to update to Meteor 1.4.4.4 by running `meteor update`,
  please at least run
  ```sh
  meteor update allow-deny
  ```
  instead. More details about the security vulnerability can be found on
  the Meteor forums.

## v1.4.4.3, 2017-05-22

* Node has been upgraded to version 4.8.3.

* A bug in checking body lengths of HTTP responses that was affecting
  Galaxy deploys has been fixed.
  [PR #8709](https://github.com/meteor/meteor/pull/8709).

## v1.4.4.2, 2017-05-02

* Node has been upgraded to version 4.8.2.

* The `npm` npm package has been upgraded to version 4.5.0.
  Note that when using npm `scripts` there has been a change regarding
  what happens when `SIGINT` (Ctrl-C) is received.  Read more
  [here](https://github.com/npm/npm/releases/tag/v4.5.0).

* Fix a regression which prevented us from displaying a helpful banner when
  running `meteor debug` because of a change in Node.js.

* Update `node-inspector` npm to 1.1.1, fixing a problem encountered when trying
  to press "Enter" in the inspector console.
  [Issue #8469](https://github.com/meteor/meteor/issues/8469)

* The `email` package has had its `mailcomposer` npm package swapped with
  a Node 4 fork of `nodemailer` due to its ability to support connection pooling
  in a similar fashion as the original `mailcomposer`.
  [Issue #8591](https://github.com/meteor/meteor/issues/8591)
  [PR #8605](https://github.com/meteor/meteor/pull/8605)

    > Note: The `MAIL_URL` should be configured with a scheme which matches the
    > protocol desired by your e-mail vendor/mail-transport agent.  For
    > encrypted connections (typically listening on port 465), this means
    > using `smtps://`.  Unencrypted connections or those secured through
    > a `STARTTLS` connection upgrade (typically using port 587 and sometimes
    > port 25) should continue to use `smtp://`.  TLS/SSL will be automatically
    > enabled if the mail provider supports it.

* A new `Tracker.inFlush()` has been added to provide a global Tracker
  "flushing" state.
  [PR #8565](https://github.com/meteor/meteor/pull/8565).

* The `meteor-babel` npm package has been upgraded to version 0.20.1, and
  the `reify` npm package has been upgraded to version 0.7.4, fixing
  [issue #8595](https://github.com/meteor/meteor/issues/8595).
  (This was fixed between full Meteor releases, but is being mentioned here.)

## v1.4.4.1, 2017-04-07

* A change in Meteor 1.4.4 to remove "garbage" directories asynchronously
  in `files.renameDirAlmostAtomically` had unintended consequences for
  rebuilding some npm packages, so that change was reverted, and those
  directories are now removed before `files.renameDirAlmostAtomically`
  returns. [PR #8574](https://github.com/meteor/meteor/pull/8574)

## v1.4.4, 2017-04-07

* Node has been upgraded to version 4.8.1.

* The `npm` npm package has been upgraded to version 4.4.4.
  It should be noted that this version reduces extra noise
  previously included in some npm errors.

* The `node-gyp` npm package has been upgraded to 3.6.0 which
  adds support for VS2017 on Windows.

* The `node-pre-gyp` npm package has been updated to 0.6.34.

* Thanks to the outstanding efforts of @sethmurphy18, the `minifier-js`
  package now uses [Babili](https://github.com/babel/babili) instead of
  [UglifyJS](https://github.com/mishoo/UglifyJS2), resolving numerous
  long-standing bugs due to UglifyJS's poor support for ES2015+ syntax.
  [Issue #8378](https://github.com/meteor/meteor/issues/8378)
  [PR #8397](https://github.com/meteor/meteor/pull/8397)

* The `meteor-babel` npm package has been upgraded to version 0.19.1, and
  `reify` has been upgraded to version 0.6.6, fixing several subtle bugs
  introduced by Meteor 1.4.3 (see below), including
  [issue #8461](https://github.com/meteor/meteor/issues/8461).

* The Reify module compiler is now a Babel plugin, making it possible for
  other custom Babel plugins configured in `.babelrc` or `package.json`
  files to run before Reify, fixing bugs that resulted from running Reify
  before other plugins in Meteor 1.4.3.
  [Issue #8399](https://github.com/meteor/meteor/issues/8399)
  [Issue #8422](https://github.com/meteor/meteor/issues/8422)
  [`meteor-babel` issue #13](https://github.com/meteor/babel/issues/13)

* Two new `export ... from ...` syntax extensions are now supported:
  ```js
  export * as namespace from "./module"
  export def from "./module"
  ```
  Read the ECMA262 proposals here:
  * https://github.com/leebyron/ecmascript-export-ns-from
  * https://github.com/leebyron/ecmascript-export-default-from

* When `Meteor.call` is used on the server to invoke a method that
  returns a `Promise` object, the result will no longer be the `Promise`
  object, but the resolved value of the `Promise`.
  [Issue #8367](https://github.com/meteor/meteor/issues/8367)

> Note: if you actually want a `Promise` when calling `Meteor.call` or
  `Meteor.apply` on the server, use `Meteor.callAsync` and/or
  `Meteor.applyAsync` instead.
  [Issue #8367](https://github.com/meteor/meteor/issues/8367),
  https://github.com/meteor/meteor/commit/0cbd25111d1249a61ca7adce23fad5215408c821

* The `mailcomposer` and `smtp-connection` npms have been updated to resolve an
  issue with the encoding of long header lines.
  [Issue #8425](https://github.com/meteor/meteor/issues/8425)
  [PR #8495](https://github.com/meteor/meteor/pull/8495)

* `Accounts.config` now supports an `ambiguousErrorMessages` option which
  enabled generalization of messages produced by the `accounts-*` packages.
  [PR #8520](https://github.com/meteor/meteor/pull/8520)

* A bug which caused account enrollment tokens to be deleted too soon was fixed.
  [Issue #8218](https://github.com/meteor/meteor/issues/8218)
  [PR #8474](https://github.com/meteor/meteor/pull/8474)

* On Windows, bundles built during `meteor build` or `meteor deploy` will
  maintain the executable bit for commands installed in the
  `node_modules\.bin` directory.
  [PR #8503](https://github.com/meteor/meteor/pull/8503)

* On Windows, the upgrades to Node.js, `npm` and `mongodb` are now in-sync with
  other archs again after being mistakenly overlooked in 1.4.3.2.  An admin
  script enhancement has been applied to prevent this from happening again.
  [PR #8505](https://github.com/meteor/meteor/pull/8505)

## v1.4.3.2, 2017-03-14

* Node has been upgraded to version 4.8.0.

* The `npm` npm package has been upgraded to version 4.3.0.

* The `node-gyp` npm package has been upgraded to 3.5.0.

* The `node-pre-gyp` npm package has been updated to 0.6.33.

* The bundled version of MongoDB used by `meteor run` in development
  has been upgraded to 3.2.12.

* The `mongodb` npm package used by the `npm-mongo` Meteor package has
  been updated to version 2.2.24.
  [PR #8453](https://github.com/meteor/meteor/pull/8453)
  [Issue #8449](https://github.com/meteor/meteor/issues/8449)

* The `check` package has had its copy of `jQuery.isPlainObject`
  updated to a newer implementation to resolve an issue where the
  `nodeType` property of an object couldn't be checked, fixing
  [#7354](https://github.com/meteor/meteor/issues/7354).

* The `standard-minifier-js` and `minifier-js` packages now have improved
  error capturing to provide more information on otherwise unhelpful errors
  thrown when UglifyJS encounters ECMAScript grammar it is not familiar with.
  [#8414](https://github.com/meteor/meteor/pull/8414)

* Similar in behavior to `Meteor.loggingIn()`, `accounts-base` now offers a
  reactive `Meteor.loggingOut()` method (and related Blaze helpers,
  `loggingOut` and `loggingInOrOut`).
  [PR #8271](https://github.com/meteor/meteor/pull/8271)
  [Issue #1331](https://github.com/meteor/meteor/issues/1331)
  [Issue #769](https://github.com/meteor/meteor/issues/769)

* Using `length` as a selector field name and with a `Number` as a value
  in a `Mongo.Collection` transformation will no longer cause odd results.
  [#8329](https://github.com/meteor/meteor/issues/8329).

* `observe-sequence` (and thus Blaze) now properly supports `Array`s which were
  created in a vm or across frame boundaries, even if they were sub-classed.
  [Issue #8160](https://github.com/meteor/meteor/issues/8160)
  [PR #8401](https://github.com/meteor/meteor/pull/8401)

* Minimongo now supports `$bitsAllClear`, `$bitsAllSet`, `$bitsAnySet` and
  `$bitsAnyClear`.
  [#8350](https://github.com/meteor/meteor/pull/8350)

* A new [Development.md](DEVELOPMENT.md) document has been created to provide
  an easier path for developers looking to make contributions to Meteor Core
  (that is, the `meteor` tool itself) along with plenty of helpful reminders
  for those that have already done so!
  [#8267](https://github.com/meteor/meteor/pull/8267)

* The suggestion to add a `{oauth-service}-config-ui` package will no longer be
  made on the console if `service-configuration` package is already installed.
  [Issue #8366](https://github.com/meteor/meteor/issues/8366)
  [PR #8429](https://github.com/meteor/meteor/pull/8429)

* `Meteor.apply`'s `throwStubExceptions` option is now properly documented in
  the documentation whereas it was previously only mentioned in the Guide.
  [Issue #8435](https://github.com/meteor/meteor/issues/8435)
  [PR #8443](https://github.com/meteor/meteor/pull/8443)

* `DDPRateLimiter.addRule` now accepts a callback which will be executed after
  a rule is executed, allowing additional actions to be taken if necessary.
  [Issue #5541](https://github.com/meteor/meteor/issues/5541)
  [PR #8237](https://github.com/meteor/meteor/pull/8237)

* `jquery` is no longer a dependency of the `http` package.
  [#8389](https://github.com/meteor/meteor/pull/8389)

* `jquery` is no longer in the default package list after running
  `meteor create`, however is still available thanks to `blaze-html-templates`.
  If you still require jQuery, the recommended approach is to install it from
  npm with `meteor npm install --save jquery` and then `import`-ing it into your
  application.
  [#8388](https://github.com/meteor/meteor/pull/8388)

* The `shell-server` package (i.e. `meteor shell`) has been updated to more
  gracefully handle recoverable errors (such as `SyntaxError`s) in the same
  fashion as the Node REPL.
  [Issue #8290](https://github.com/meteor/meteor/issues/8290)
  [PR #8446](https://github.com/meteor/meteor/pull/8446)

* The `webapp` package now reveals a `WebApp.connectApp` to make it easier to
  provide custom error middleware.
  [#8403](https://github.com/meteor/meteor/pull/8403)

* The `meteor update --all-packages` command has been properly documented in
  command-line help (i.e. `meteor update --help`).
  [PR #8431](https://github.com/meteor/meteor/pull/8431)
  [Issue #8154](https://github.com/meteor/meteor/issues/8154)

* Syntax errors encountered while scanning `package.json` files for binary
  dependencies are now safely and silently ignored.
  [Issue #8427](https://github.com/meteor/meteor/issues/8427)
  [PR #8468](https://github.com/meteor/meteor/pull/8468)

## v1.4.3.1, 2017-02-14

* The `meteor-babel` npm package has been upgraded to version 0.14.4,
  fixing [#8349](https://github.com/meteor/meteor/issues/8349).

* The `reify` npm package has been upgraded to version 0.4.9.

* Partial `npm-shrinkwrap.json` files are now disregarded when
  (re)installing npm dependencies of Meteor packages, fixing
  [#8349](https://github.com/meteor/meteor/issues/8349). Further
  discussion of the new `npm` behavior can be found
  [here](https://github.com/npm/npm/blob/latest/CHANGELOG.md#no-more-partial-shrinkwraps-breaking).

## v1.4.3, 2017-02-13

* Versions of Meteor [core
  packages](https://github.com/meteor/meteor/tree/release-1.4.3/packages)
  are once again constrained by the current Meteor release.

> Before Meteor 1.4, the current release dictated the exact version of
  every installed core package, which meant newer core packages could not
  be installed without publishing a new Meteor release. In order to
  support incremental development of core packages, Meteor 1.4 removed all
  release-based constraints on core package versions
  ([#7084](https://github.com/meteor/meteor/pull/7084)). Now, in Meteor
  1.4.3, core package versions must remain patch-compatible with the
  versions they had when the Meteor release was published. This middle
  ground restores meaning to Meteor releases, yet still permits patch
  updates to core packages.

* The `cordova-lib` npm package has been updated to 6.4.0, along with
  cordova-android (6.1.1) and cordova-ios (4.3.0), and various plugins.
  [#8239](https://github.com/meteor/meteor/pull/8239)

* The `coffeescript` Meteor package has been moved from
  `packages/coffeescript` to `packages/non-core/coffeescript`, so that it
  will not be subject to the constraints described above.

* CoffeeScript source maps should be now be working properly in development.
  [#8298](https://github.com/meteor/meteor/pull/8298)

* The individual account "service" packages (`facebook`, `google`, `twitter`,
  `github`, `meteor-developer`, `meetup` and `weibo`) have been split into:
  - `<service>-oauth` (which interfaces with the `<service>` directly) and
  - `<service>-config-ui` (the Blaze configuration templates for `accounts-ui`)

  This means you can now use `accounts-<service>` without needing Blaze.

  If you are using `accounts-ui` and `accounts-<service>`, you will probably
  need to install the `<service>-config-ui` package if you want to configure it
  using the Accounts UI.

  - [Issue #7715](https://github.com/meteor/meteor/issues/7715)
  - [PR(`facebook`) #7728](https://github.com/meteor/meteor/pull/7728)
  - [PR(`google`) #8275](https://github.com/meteor/meteor/pull/8275)
  - [PR(`twitter`) #8283](https://github.com/meteor/meteor/pull/8283)
  - [PR(`github`) #8303](https://github.com/meteor/meteor/pull/8303)
  - [PR(`meteor-developer`) #8305](https://github.com/meteor/meteor/pull/8305)
  - [PR(`meetup`) #8321](https://github.com/meteor/meteor/pull/8321)
  - [PR(`weibo`) #8302](https://github.com/meteor/meteor/pull/8302)

* The `url` and `http` packages now encode to a less error-prone
  format which more closely resembles that used by PHP, Ruby, `jQuery.param`
  and others. `Object`s and `Array`s can now be encoded, however, if you have
  previously relied on `Array`s passed as `params` being simply `join`-ed with
  commas, you may need to adjust your `HTTP.call` implementations.
  [#8261](https://github.com/meteor/meteor/pull/8261) and
  [#8342](https://github.com/meteor/meteor/pull/8342).

* The `npm` npm package is still at version 4.1.2 (as it was when Meteor
  1.4.3 was originally published), even though `npm` was downgraded to
  3.10.9 in Meteor 1.4.2.7.

* The `meteor-babel` npm package has been upgraded to version 0.14.3,
  fixing [#8021](https://github.com/meteor/meteor/issues/8021) and
  [#7662](https://github.com/meteor/meteor/issues/7662).

* The `reify` npm package has been upgraded to 0.4.7.

* Added support for frame-ancestors CSP option in browser-policy.
  [#7970](https://github.com/meteor/meteor/pull/7970)

* You can now use autoprefixer with stylus files added via packages.
  [#7727](https://github.com/meteor/meteor/pull/7727)

* Restored [#8213](https://github.com/meteor/meteor/pull/8213)
  after those changes were reverted in
  [v1.4.2.5](https://github.com/meteor/meteor/blob/devel/History.md#v1425).

* npm dependencies of Meteor packages will now be automatically rebuilt if
  the npm package's `package.json` file has "scripts" section containing a
  `preinstall`, `install`, or `postinstall` command, as well as when the
  npm package contains any `.node` files. Discussion
  [here](https://github.com/meteor/meteor/issues/8225#issuecomment-275044900).

* The `meteor create` command now runs `meteor npm install` automatically
  to install dependencies specified in the default `package.json` file.
  [#8108](https://github.com/meteor/meteor/pull/8108)

## v1.4.2.7, 2017-02-13

* The `npm` npm package has been *downgraded* from version 4.1.2 back to
  version 3.10.9, reverting the upgrade in Meteor 1.4.2.4.

## v1.4.2.6, 2017-02-08

* Fixed a critical [bug](https://github.com/meteor/meteor/issues/8325)
  that was introduced by the fix for
  [Issue #8136](https://github.com/meteor/meteor/issues/8136), which
  caused some npm packages in nested `node_modules` directories to be
  omitted from bundles produced by `meteor build` and `meteor deploy`.

## v1.4.2.5, 2017-02-03

* Reverted [#8213](https://github.com/meteor/meteor/pull/8213) as the
  change was deemed too significant for this release.

> Note: The decision to revert the above change was made late in the
  Meteor 1.4.2.4 release process, before it was ever recommended but too
  late in the process to avoid the additional increment of the version number.
  See [#8311](https://github.com/meteor/meteor/pull/8311) for additional
  information. This change will still be released in an upcoming version
  of Meteor with a more seamless upgrade.

## v1.4.2.4, 2017-02-02

* Node has been upgraded to version 4.7.3.

* The `npm` npm package has been upgraded from version 3.10.9 to 4.1.2.

> Note: This change was later deemed too substantial for a point release
  and was reverted in Meteor 1.4.2.7.

* Fix for [Issue #8136](https://github.com/meteor/meteor/issues/8136).

* Fix for [Issue #8222](https://github.com/meteor/meteor/issues/8222).

* Fix for [Issue #7849](https://github.com/meteor/meteor/issues/7849).

* The version of 7-zip included in the Windows dev bundle has been
  upgraded from 1602 to 1604 in an attempt to mitigate
  [Issue #7688](https://github.com/meteor/meteor/issues/7688).

* The `"main"` field of `package.json` modules will no longer be
  overwritten with the value of the optional `"browser"` field, now that
  the `install` npm package can make sense of the `"browser"` field at
  runtime. If you experience module resolution failures on the client
  after updating Meteor, make sure you've updated the `modules-runtime`
  Meteor package to at least version 0.7.8.
  [#8213](https://github.com/meteor/meteor/pull/8213)

## v1.4.2.3, 2016-11-17

* Style improvements for `meteor create --full`.
  [#8045](https://github.com/meteor/meteor/pull/8045)

> Note: Meteor 1.4.2.2 was finalized before
  [#8045](https://github.com/meteor/meteor/pull/8045) was merged, but
  those changes were [deemed important
  enough](https://github.com/meteor/meteor/pull/8044#issuecomment-260913739)
  to skip recommending 1.4.2.2 and instead immediately release 1.4.2.3.

## v1.4.2.2, 2016-11-15

* Node has been upgraded to version 4.6.2.

* `meteor create` now has a new `--full` option, which generates an larger app,
  demonstrating development techniques highlighted in the
  [Meteor Guide](http://guide.meteor.com)

  [Issue #6974](https://github.com/meteor/meteor/issues/6974)
  [PR #7807](https://github.com/meteor/meteor/pull/7807)

* Minimongo now supports `$min`, `$max` and partially supports `$currentDate`.

  [Issue #7857](https://github.com/meteor/meteor/issues/7857)
  [PR #7858](https://github.com/meteor/meteor/pull/7858)

* Fix for [Issue #5676](https://github.com/meteor/meteor/issues/5676)
  [PR #7968](https://github.com/meteor/meteor/pull/7968)

* It is now possible for packages to specify a *lazy* main module:
  ```js
  Package.onUse(function (api) {
    api.mainModule("client.js", "client", { lazy: true });
  });
  ```
  This means the `client.js` module will not be evaluated during app
  startup unless/until another module imports it, and will not even be
  included in the client bundle if no importing code is found. **Note 1:**
  packages with lazy main modules cannot use `api.export` to export global
  symbols to other packages/apps. **Note 2:** packages with lazy main
  modules should be restricted to Meteor 1.4.2.2 or later via
  `api.versionsFrom("1.4.2.2")`, since older versions of Meteor cannot
  import lazy main modules using `import "meteor/<package name>"` but must
  explicitly name the module: `import "meteor/<package name>/client.js"`.

## v1.4.2.1, 2016-11-08

* Installing the `babel-runtime` npm package in your application
  `node_modules` directory is now required for most Babel-transformed code
  to work, as the Meteor `babel-runtime` package no longer attempts to
  provide custom implementations of Babel helper functions. To install
  the `babel-runtime` package, simply run the command
  ```sh
  meteor npm install --save babel-runtime
  ```
  in any Meteor application directory. The Meteor `babel-runtime` package
  version has been bumped to 1.0.0 to reflect this major change.
  [#7995](https://github.com/meteor/meteor/pull/7995)

* File system operations performed by the command-line tool no longer use
  fibers unless the `METEOR_DISABLE_FS_FIBERS` environment variable is
  explicitly set to a falsy value. For larger apps, this change results in
  significant build performance improvements due to the creation of fewer
  fibers and the avoidance of unnecessary asyncronous delays.
  https://github.com/meteor/meteor/pull/7975/commits/ca4baed90ae0675e55c93976411d4ed91f12dd63

* Running Meteor as `root` is still discouraged, and results in a fatal
  error by default, but the `--allow-superuser` flag now works as claimed.
  [#7959](https://github.com/meteor/meteor/issues/7959)

* The `dev_bundle\python\python.exe` executable has been restored to the
  Windows dev bundle, which may help with `meteor npm rebuild` commands.
  [#7960](https://github.com/meteor/meteor/issues/7960)

* Changes within linked npm packages now trigger a partial rebuild,
  whereas previously (in 1.4.2) they were ignored.
  [#7978](https://github.com/meteor/meteor/issues/7978)

* Miscellaneous fixed bugs:
  [#2876](https://github.com/meteor/meteor/issues/2876)
  [#7154](https://github.com/meteor/meteor/issues/7154)
  [#7956](https://github.com/meteor/meteor/issues/7956)
  [#7974](https://github.com/meteor/meteor/issues/7974)
  [#7999](https://github.com/meteor/meteor/issues/7999)
  [#8005](https://github.com/meteor/meteor/issues/8005)
  [#8007](https://github.com/meteor/meteor/issues/8007)

## v1.4.2, 2016-10-25

* This release implements a number of rebuild performance optimizations.
  As you edit files in development, the server should restart and rebuild
  much more quickly, especially if you have many `node_modules` files.
  See https://github.com/meteor/meteor/pull/7668 for more details.

> Note: the `METEOR_PROFILE` environment variable now provides data for
  server startup time as well as build time, which should make it easier
  to tell which of your packages are responsible for slow startup times.
  Please include the output of `METEOR_PROFILE=10 meteor run` with any
  GitHub issue about rebuild performance.

* `npm` has been upgraded to version 3.10.9.

* The `cordova-lib` npm package has been updated to 6.3.1, along with
  cordova-android (5.2.2) and cordova-ios (4.2.1), and various plugins.

* The `node-pre-gyp` npm package has been updated to 0.6.30.

* The `lru-cache` npm package has been updated to 4.0.1.

* The `meteor-promise` npm package has been updated to 0.8.0 for better
  asynchronous stack traces.

* The `meteor` tool is now prevented from running as `root` as this is
  not recommended and can cause issues with permissions.  In some environments,
  (e.g. Docker), it may still be desired to run as `root` and this can be
  permitted by passing `--unsafe-perm` to the `meteor` command.
  [#7821](https://github.com/meteor/meteor/pull/7821)

* Blaze-related packages have been extracted to
  [`meteor/blaze`](https://github.com/meteor/blaze), and the main
  [`meteor/meteor`](https://github.com/meteor/meteor) repository now
  refers to them via git submodules (see
  [#7633](https://github.com/meteor/meteor/pull/7633)).
  When running `meteor` from a checkout, you must now update these
  submodules by running
  ```sh
  git submodule update --init --recursive
  ```
  in the root directory of your `meteor` checkout.

* Accounts.forgotPassword and .verifyEmail no longer throw errors if callback is provided. [Issue #5664](https://github.com/meteor/meteor/issues/5664) [Origin PR #5681](https://github.com/meteor/meteor/pull/5681) [Merged PR](https://github.com/meteor/meteor/pull/7117)

* The default content security policy (CSP) for Cordova now includes `ws:`
  and `wss:` WebSocket protocols.
  [#7774](https://github.com/meteor/meteor/pull/7774)

* `meteor npm` commands are now configured to use `dev_bundle/.npm` as the
  npm cache directory by default, which should make npm commands less
  sensitive to non-reproducible factors in the external environment.
  https://github.com/meteor/meteor/pull/7668/commits/3313180a6ff33ee63602f7592a9506012029e919

* The `meteor test` command now supports the `--no-release-check` flag.
  https://github.com/meteor/meteor/pull/7668/commits/7097f78926f331fb9e70a06300ce1711adae2850

* JavaScript module bundles on the server no longer include transitive
  `node_modules` dependencies, since those dependencies can be evaluated
  directly by Node. This optimization should improve server rebuild times
  for apps and packages with large `node_modules` directories.
  https://github.com/meteor/meteor/pull/7668/commits/03c5346873849151cecc3e00606c6e5aa13b3bbc

* The `standard-minifier-css` package now does basic caching for the
  expensive `mergeCss` function.
  https://github.com/meteor/meteor/pull/7668/commits/bfa67337dda1e90610830611fd99dcb1bd44846a

* The `coffeescript` package now natively supports `import` and `export`
  declarations. [#7818](https://github.com/meteor/meteor/pull/7818)

* Due to changes in how Cordova generates version numbers for iOS and Android
  apps, you may experience issues with apps updating on user devices.  To avoid
  this, consider managing the `buildNumber` manually using
  `App.info('buildNumber', 'XXX');` in `mobile-config.js`. There are additional
  considerations if you have been setting `android:versionCode` or
  `ios-CFBundleVersion`.  See
  [#7205](https://github.com/meteor/meteor/issues/7205) and
  [#6978](https://github.com/meteor/meteor/issues/6978) for more information.

## v1.4.1.3, 2016-10-21

* Node has been updated to version 4.6.1:
  https://nodejs.org/en/blog/release/v4.6.1/

* The `mongodb` npm package used by the `npm-mongo` Meteor package has
  been updated to version 2.2.11.
  [#7780](https://github.com/meteor/meteor/pull/7780)

* The `fibers` npm package has been upgraded to version 1.0.15.

* Running Meteor with a different `--port` will now automatically
  reconfigure the Mongo replica set when using the WiredTiger storage
  engine, instead of failing to start Mongo.
  [#7840](https://github.com/meteor/meteor/pull/7840).

* When the Meteor development server shuts down, it now attempts to kill
  the `mongod` process it spawned, in addition to killing any running
  `mongod` processes when the server first starts up.
  https://github.com/meteor/meteor/pull/7668/commits/295d3d5678228f06ee0ab6c0d60139849a0ea192

* The `meteor <command> ...` syntax will now work for any command
  installed in `dev_bundle/bin`, except for Meteor's own commands.

* Incomplete package downloads will now fail (and be retried several
  times) instead of silently succeeding, which was the cause of the
  dreaded `Error: ENOENT: no such file or directory, open... os.json`
  error. [#7806](https://github.com/meteor/meteor/issues/7806)

## v1.4.1.2, 2016-10-04

* Node has been upgraded to version 4.6.0, a recommended security release:
  https://nodejs.org/en/blog/release/v4.6.0/

* `npm` has been upgraded to version 3.10.8.

## v1.4.1.1, 2016-08-24

* Update the version of our Node MongoDB driver to 2.2.8 to fix a bug in
  reconnection logic, leading to some `update` and `remove` commands being
  treated as `insert`s. [#7594](https://github.com/meteor/meteor/issues/7594)

## v1.4.1, 2016-08-18

* Node has been upgraded to 4.5.0.

* `npm` has been upgraded to 3.10.6.

* The `meteor publish-for-arch` command is no longer necessary when
  publishing Meteor packages with binary npm dependencies. Instead, binary
  dependencies will be rebuilt automatically on the installation side.
  Meteor package authors are not responsible for failures due to compiler
  toolchain misconfiguration, and any compilation problems with the
  underlying npm packages should be taken up with the authors of those
  packages. That said, if a Meteor package author really needs or wants to
  continue using `meteor publish-for-arch`, she should publish her package
  using an older release: e.g. `meteor --release 1.4 publish`.
  [#7608](https://github.com/meteor/meteor/pull/7608)

* The `.meteor-last-rebuild-version.json` files that determine if a binary
  npm package needs to be rebuilt now include more information from the
  `process` object, namely `process.{platform,arch,versions}` instead of
  just `process.versions`. Note also that the comparison of versions now
  ignores differences in patch versions, to avoid needless rebuilds.

* The `npm-bcrypt` package now uses a pure-JavaScript implementation by
  default, but will prefer the native `bcrypt` implementation if it is
  installed in the application's `node_modules` directory. In other words,
  run `meteor install --save bcrypt` in your application if you need or
  want to use the native implementation of `bcrypt`.
  [#7595](https://github.com/meteor/meteor/pull/7595)

* After Meteor packages are downloaded from Atmosphere, they will now be
  extracted using native `tar` or `7z.exe` on Windows, instead of the
  https://www.npmjs.com/package/tar library, for a significant performance
  improvement. [#7457](https://github.com/meteor/meteor/pull/7457)

* The npm `tar` package has been upgraded to 2.2.1, though it is now only
  used as a fallback after native `tar` and/or `7z.exe`.

* The progress indicator now distinguishes between downloading,
  extracting, and loading newly-installed Meteor packages, instead of
  lumping all of that work into a "downloading" status message.

* Background Meteor updates will no longer modify the `~/.meteor/meteor`
  symbolic link (or `AppData\Local\.meteor\meteor.bat` on Windows).
  Instead, developers must explicitly type `meteor update` to begin using
  a new version of the `meteor` script.

* Password Reset tokens now expire (after 3 days by default -- can be modified via `Accounts.config({ passwordResetTokenExpirationInDays: ...}`). [PR #7534](https://github.com/meteor/meteor/pull/7534)

* The `google` package now uses the `email` scope as a mandatory field instead
  of the `profile` scope. The `profile` scope is still added by default if the
  `requestPermissions` option is not specified to maintain backward
  compatibility, but it is now possible to pass an empty array to
  `requestPermissions` in order to only request the `email` scope, which
  reduces the amount of permissions requested from the user in the Google
  popup. [PR #6975](https://github.com/meteor/meteor/pull/6975)

* Added `Facebook.handleAuthFromAccessToken` in the case where you get the FB
  accessToken in some out-of-band way. [PR #7550](https://github.com/meteor/meteor/pull/7550)

* `Accounts.onLogout` gets `{ user, connection }` context in a similar fashion
  to `Accounts.onLogin`. [Issue #7397](https://github.com/meteor/meteor/issues/7397) [PR #7433](https://github.com/meteor/meteor/pull/7433)

* The `node-gyp` and `node-pre-gyp` tools will now be installed in
  `bundle/programs/server/node_modules`, to assist with rebuilding binary
  npm packages when deploying an app to Galaxy or elsewhere.
  [#7571](https://github.com/meteor/meteor/pull/7571)

* The `standard-minifier-{js,css}` packages no longer minify .js or .css
  files on the server. [#7572](https://github.com/meteor/meteor/pull/7572)

* Multi-line input to `meteor shell`, which was broken by changes to the
  `repl` module in Node 4, works again.
  [#7562](https://github.com/meteor/meteor/pull/7562)

* The implementation of the command-line `meteor` tool now forbids
  misbehaving polyfill libraries from overwriting `global.Promise`.
  [#7569](https://github.com/meteor/meteor/pull/7569)

* The `oauth-encryption` package no longer depends on the
  `npm-node-aes-gcm` package (or any special npm packages), because the
  Node 4 `crypto` library natively supports the `aes-128-gcm` algorithm.
  [#7548](https://github.com/meteor/meteor/pull/7548)

* The server-side component of the `meteor shell` command has been moved
  into a Meteor package, so that it can be developed independently from
  the Meteor release process, thanks to version unpinning.
  [#7624](https://github.com/meteor/meteor/pull/7624)

* The `meteor shell` command now works when running `meteor test`.

* The `meteor debug` command no longer pauses at the first statement
  in the Node process, yet still reliably stops at custom breakpoints
  it encounters later.

* The `meteor-babel` package has been upgraded to 0.12.0.

* The `meteor-ecmascript-runtime` package has been upgraded to 0.2.9, to
  support several additional [stage 4
  proposals](https://github.com/meteor/ecmascript-runtime/pull/4).

* A bug that prevented @-scoped npm packages from getting bundled for
  deployed apps has been fixed.
  [#7609](https://github.com/meteor/meteor/pull/7609).

* The `meteor update` command now supports an `--all-packages` flag to
  update all packages (including indirect dependencies) to their latest
  compatible versions, similar to passing the names of all your packages
  to the `meteor update` command.
  [#7653](https://github.com/meteor/meteor/pull/7653)

* Background release updates can now be disabled by invoking either
  `meteor --no-release-check` or `METEOR_NO_RELEASE_CHECK=1 meteor`.
  [#7445](https://github.com/meteor/meteor/pull/7445)

## v1.4.0.1, 2016-07-29

* Fix issue with the 1.4 tool springboarding to older releases (see [Issue #7491](https://github.com/meteor/meteor/issues/7491))

* Fix issue with running in development on Linux 32bit [Issue #7511](https://github.com/meteor/meteor/issues/7511)

## v1.4, 2016-07-25

* Node has been upgraded to 4.4.7.

* The `meteor-babel` npm package has been upgraded to 0.11.7.

* The `reify` npm package has been upgraded to 0.3.6.

* The `bcrypt` npm package has been upgraded to 0.8.7.

* Nested `import` declarations are now enabled for package code as well as
  application code. 699cf1f38e9b2a074169515d23983f74148c7223

* Meteor has been upgraded to support Mongo 3.2 by default (the bundled version
  used by `meteor run` has been upgraded). Internally it now uses the 2.2.4
  version of the `mongodb` npm driver, and has been tested against at Mongo 3.2
  server. [Issue #6957](https://github.com/meteor/meteor/issues/6957)

  Mongo 3.2 defaults to the new WiredTiger storage engine. You can update your
  database following the instructions here:
  https://docs.mongodb.com/v3.0/release-notes/3.0-upgrade/.
  In development, you can also just use `meteor reset` to remove your old
  database, and Meteor will create a new WiredTiger database for you. The Mongo
  driver will continue to work with the old MMAPv1 storage engine however.

  The new version of the Mongo driver has been tested with MongoDB versions from
  2.6 up. Mongo 2.4 has now reached end-of-life
  (https://www.mongodb.com/support-policy), and is no longer supported.

  If you are setting `MONGO_OPLOG_URL`, especially in production, ensure you are
  passing in the `replicaSet` argument (see [#7450]
    (https://github.com/meteor/meteor/issues/7450))

* Custom Mongo options can now be specified using the
  `Mongo.setConnectionOptions(options)` API.
  [#7277](https://github.com/meteor/meteor/pull/7277)

* On the server, cursor.count() now takes a single argument `applySkipLimit`
  (see the corresponding [Mongo documentation]
    (http://mongodb.github.io/node-mongodb-native/2.1/api/Cursor.html#count))

* Fix for regression caused by #5837 which incorrectly rewrote
  network-path references (e.g. `//domain.com/image.gif`) in CSS URLs.
  [#7416](https://github.com/meteor/meteor/issues/7416)
* Added Angular2 boilerplate example [#7364](https://github.com/meteor/meteor/pull/7363)

## v1.3.5.1, 2016-07-18

* This release fixed a small bug in 1.3.5 that prevented updating apps
  whose `.meteor/release` files refer to releases no longer installed in
  `~/.meteor/packages/meteor-tool`. [576468eae8d8dd7c1fe2fa381ac51dee5cb792cd](https://github.com/meteor/meteor/commit/576468eae8d8dd7c1fe2fa381ac51dee5cb792cd)

## v1.3.5, 2016-07-16

* Failed Meteor package downloads are now automatically resumed from the
  point of failure, up to ten times, with a five-second delay between
  attempts. [#7399](https://github.com/meteor/meteor/pull/7399)

* If an app has no `package.json` file, all packages in `node_modules`
  will be built into the production bundle. In other words, make sure you
  have a `package.json` file if you want to benefit from `devDependencies`
  pruning. [7b2193188fc9e297eefc841ce6035825164f0684](https://github.com/meteor/meteor/commit/7b2193188fc9e297eefc841ce6035825164f0684)

* Binary npm dependencies of compiler plugins are now automatically
  rebuilt when Node/V8 versions change.
  [#7297](https://github.com/meteor/meteor/issues/7297)

* Because `.meteor/local` is where purely local information should be
  stored, the `.meteor/dev_bundle` link has been renamed to
  `.meteor/local/dev_bundle`.

* The `.meteor/local/dev_bundle` link now corresponds exactly to
  `.meteor/release` even when an app is using an older version of
  Meteor. d732c2e649794f350238d515153f7fb71969c526

* When recompiling binary npm packages, the `npm rebuild` command now
  receives the flags `--update-binary` and `--no-bin-links`, in addition
  to respecting the `$METEOR_NPM_REBUILD_FLAGS` environment variable.
  [#7401](https://github.com/meteor/meteor/issues/7401)

* The last solution found by the package version constraint solver is now
  stored in `.meteor/local/resolver-result-cache.json` so that it need not
  be recomputed every time Meteor starts up.

* If the `$GYP_MSVS_VERSION` environment variable is not explicitly
  provided to `meteor {node,npm}`, the `node-gyp` tool will infer the
  appropriate version (though it still defaults to "2015").

## v1.3.4.4, 2016-07-10

* Fixed [#7374](https://github.com/meteor/meteor/issues/7374).

* The default loglevel for internal `npm` commands (e.g., those related to
  `Npm.depends`) has been set to "error" instead of "warn". Note that this
  change does not affect `meteor npm ...` commands, which can be easily
  configured using `.npmrc` files or command-line flags.
  [0689cae25a3e0da3615a402cdd0bec94ce8455c8](https://github.com/meteor/meteor/commit/0689cae25a3e0da3615a402cdd0bec94ce8455c8)

## v1.3.4.3, 2016-07-08

* Node has been upgraded to 0.10.46.

* `npm` has been upgraded to 3.10.5.

* The `node-gyp` npm package has been upgraded to 3.4.0.

* The `node-pre-gyp` npm package has been upgraded to 0.6.29.

* The `~/.meteor/meteor` symlink (or `AppData\Local\.meteor\meteor.bat` on
  Windows) will now be updated properly after `meteor update` succeeds. This was
  promised in [v1.3.4.2](https://github.com/meteor/meteor/blob/devel/History.md#v1342)
  but [not fully delivered](https://github.com/meteor/meteor/pull/7369#issue-164569763).

* The `.meteor/dev_bundle` symbolic link introduced in
  [v1.3.4.2](https://github.com/meteor/meteor/blob/devel/History.md#v1342)
  is now updated whenever `.meteor/release` is read.

* The `.meteor/dev_bundle` symbolic link is now ignored by
  `.meteor/.gitignore`.

## v1.3.4.2, 2016-07-07

* The `meteor node` and `meteor npm` commands now respect
  `.meteor/release` when resolving which versions of `node` and `npm` to
  invoke. Note that you must `meteor update` to 1.3.4.2 before this logic
  will take effect, but it will work in all app directories after
  updating, even those pinned to older versions.
  [#7338](https://github.com/meteor/meteor/issues/7338)

* The Meteor installer now has the ability to resume downloads, so
  installing Meteor on a spotty internet connection should be more
  reliable. [#7348](https://github.com/meteor/meteor/pull/7348)

* When running `meteor test`, shared directories are symlinked (or
  junction-linked on Windows) into the temporary test directory, not
  copied, leading to much faster test start times after the initial build.
  The directories: `.meteor/local/{bundler-cache,isopacks,plugin-cache}`

* `App.appendToConfig` allows adding custom tags to config.xml.
  [#7307](https://github.com/meteor/meteor/pull/7307)

* When using `ROOT_URL` with a path, relative CSS URLs are rewriten
  accordingly. [#5837](https://github.com/meteor/meteor/issues/5837)

* Fixed bugs:
  [#7149](https://github.com/meteor/meteor/issues/7149)
  [#7296](https://github.com/meteor/meteor/issues/7296)
  [#7309](https://github.com/meteor/meteor/issues/7309)
  [#7312](https://github.com/meteor/meteor/issues/7312)

## v1.3.4.1, 2016-06-23

* Increased the default HTTP timeout for requests made by the `meteor`
  command-line tool to 60 seconds (previously 30), and [disabled the
  timeout completely for Galaxy
  deploys](https://forums.meteor.com/t/1-3-4-breaks-galaxy-deployment-etimedout/25383/).

* Minor bug fixes: [#7281](https://github.com/meteor/meteor/pull/7281)
  [#7276](https://github.com/meteor/meteor/pull/7276)

## v1.3.4, 2016-06-22

* The version of `npm` used by `meteor npm` and when installing
  `Npm.depends` dependencies of Meteor packages has been upgraded from
  2.15.1 to **3.9.6**, which should lead to much flatter node_modules
  dependency trees.

* The `meteor-babel` npm package has been upgraded to 0.11.6, and is now
  installed using `npm@3.9.6`, fixing bugs arising from Windows path
  limits, such as [#7247](https://github.com/meteor/meteor/issues/7247).

* The `reify` npm package has been upgraded to 0.3.4, fixing
  [#7250](https://github.com/meteor/meteor/issues/7250).

* Thanks to caching improvements for the
  `files.{stat,lstat,readdir,realpath}` methods and
  `PackageSource#_findSources`, development server restart times are no
  longer proportional to the number of files in `node_modules`
  directories. [#7253](https://github.com/meteor/meteor/issues/7253)
  [#7008](https://github.com/meteor/meteor/issues/7008)

* When installed via `InstallMeteor.exe` on Windows, Meteor can now be
  easily uninstalled through the "Programs and Features" control panel.

* HTTP requests made by the `meteor` command-line tool now have a timeout
  of 30 seconds, which can be adjusted by the `$TIMEOUT_SCALE_FACTOR`
  environment variable. [#7143](https://github.com/meteor/meteor/pull/7143)

* The `request` npm dependency of the `http` package has been upgraded
  from 2.53.0 to 2.72.0.

* The `--headless` option is now supported by `meteor test` and
  `meteor test-packages`, in addition to `meteor self-test`.
  [#7245](https://github.com/meteor/meteor/pull/7245)

* Miscellaneous fixed bugs:
  [#7255](https://github.com/meteor/meteor/pull/7255)
  [#7239](https://github.com/meteor/meteor/pull/7239)

## v1.3.3.1, 2016-06-17

* Fixed bugs:
  [#7226](https://github.com/meteor/meteor/pull/7226)
  [#7181](https://github.com/meteor/meteor/pull/7181)
  [#7221](https://github.com/meteor/meteor/pull/7221)
  [#7215](https://github.com/meteor/meteor/pull/7215)
  [#7217](https://github.com/meteor/meteor/pull/7217)

* The `node-aes-gcm` npm package used by `oauth-encryption` has been
  upgraded to 0.1.5. [#7217](https://github.com/meteor/meteor/issues/7217)

* The `reify` module compiler has been upgraded to 0.3.3.

* The `meteor-babel` package has been upgraded to 0.11.4.

* The `pathwatcher` npm package has been upgraded to 6.7.0.

* In CoffeeScript files with raw JavaScript enclosed by backticks, the
  compiled JS will no longer contain `require` calls inserted by Babel.
  [#7226](https://github.com/meteor/meteor/issues/7226)

* Code related to the Velocity testing system has been removed.
  [#7235](https://github.com/meteor/meteor/pull/7235)

* Allow smtps:// in MAIL_URL [#7043](https://github.com/meteor/meteor/pull/7043)

* Adds `Accounts.onLogout()` a hook directly analogous to `Accounts.onLogin()`. [PR #6889](https://github.com/meteor/meteor/pull/6889)

## v1.3.3, 2016-06-10

* Node has been upgraded from 0.10.43 to 0.10.45.

* `npm` has been upgraded from 2.14.22 to 2.15.1.

* The `fibers` package has been upgraded to 1.0.13.

* The `meteor-babel` package has been upgraded to 0.10.9.

* The `meteor-promise` package has been upgraded to 0.7.1, a breaking
  change for code that uses `Promise.denodeify`, `Promise.nodeify`,
  `Function.prototype.async`, or `Function.prototype.asyncApply`, since
  those APIs have been removed.

* Meteor packages with binary npm dependencies are now automatically
  rebuilt using `npm rebuild` whenever the version of Node or V8 changes,
  making it much simpler to use Meteor with different versions of Node.
  5dc51d39ecc9e8e342884f3b4f8a489f734b4352

* `*.min.js` files are no longer minified during the build process.
  [PR #6986](https://github.com/meteor/meteor/pull/6986) [Issue #5363](https://github.com/meteor/meteor/issues/5363)

* You can now pick where the `.meteor/local` directory is created by setting the `METEOR_LOCAL_DIR` environment variable. This lets you run multiple instances of the same Meteor app.
  [PR #6760](https://github.com/meteor/meteor/pull/6760) [Issue #6532](https://github.com/meteor/meteor/issues/6532)

* Allow using authType in Facebook login [PR #5694](https://github.com/meteor/meteor/pull/5694)

* Adds flush() method to Tracker to force recomputation [PR #4710](https://github.com/meteor/meteor/pull/4710)

* Adds `defineMutationMethods` option (default: true) to `new Mongo.Collection` to override default behavior that sets up mutation methods (/collection/[insert|update...]) [PR #5778](https://github.com/meteor/meteor/pull/5778)

* Allow overridding the default warehouse url by specifying `METEOR_WAREHOUSE_URLBASE` [PR #7054](https://github.com/meteor/meteor/pull/7054)

* Allow `_id` in `$setOnInsert` in Minimongo: https://github.com/meteor/meteor/pull/7066

* Added support for `$eq` to Minimongo: https://github.com/meteor/meteor/pull/4235

* Insert a `Date` header into emails by default: https://github.com/meteor/meteor/pull/6916/files

* `meteor test` now supports setting the bind address using `--port IP:PORT` the same as `meteor run` [PR #6964](https://github.com/meteor/meteor/pull/6964) [Issue #6961](https://github.com/meteor/meteor/issues/6961)

* `Meteor.apply` now takes a `noRetry` option to opt-out of automatically retrying non-idempotent methods on connection blips: [PR #6180](https://github.com/meteor/meteor/pull/6180)

* DDP callbacks are now batched on the client side. This means that after a DDP message arrives, the local DDP client will batch changes for a minimum of 5ms (configurable via `bufferedWritesInterval`) and a maximum of 500ms (configurable via `bufferedWritesMaxAge`) before calling any callbacks (such as cursor observe callbacks).

* PhantomJS is no longer included in the Meteor dev bundle (#6905). If you
  previously relied on PhantomJS for local testing, the `spiderable`
  package, Velocity tests, or testing Meteor from a checkout, you should
  now install PhantomJS yourself, by running the following commmand:
  `meteor npm install -g phantomjs-prebuilt`

* The `babel-compiler` package now looks for `.babelrc` files and
  `package.json` files with a "babel" section. If found, these files may
  contribute additional Babel transforms that run before the usual
  `babel-preset-meteor` set of transforms. In other words, if you don't
  like the way `babel-preset-meteor` handles a particular kind of syntax,
  you can add your preferred transform plugins to the "presets" or
  "plugins" section of your `.babelrc` or `package.json` file. #6351

* When `BabelCompiler` cannot resolve a Babel plugin or preset package in
  `.babelrc` or `package.json`, it now merely warns instead of
  crashing. #7179

* Compiler plugins can now import npm packages that are visible to their
  input files using `inputFile.require(id)`. b16e8d50194b37d3511889b316345f31d689b020

* `import` statements in application modules now declare normal variables
  for the symbols that are imported, making it significantly easier to
  inspect imported variables when debugging in the browser console or in
  `meteor shell`.

* `import` statements in application modules are no longer restricted to
  the top level, and may now appear inside conditional statements
  (e.g. `if (Meteor.isServer) { import ... }`) or in nested scopes.

* `import` statements now work as expected in `meteor shell`. #6271

* Commands installed in `dev_bundle/lib/node_modules/.bin` (such as
  `node-gyp` and `node-pre-gyp`) are now available to scripts run by
  `meteor npm`. e95dfe410e1b43e8131bc2df9d2c29decdd1eaf6

* When building an application using `meteor build`, "devDependencies"
  listed in `package.json` are no longer copied into the bundle. #6750

* Packages tested with `meteor test-packages` now have access to local
  `node_modules` directories installed in the parent application or in the
  package directory itself. #6827

* You no longer need to specify `DEPLOY_HOSTNAME=galaxy.meteor.com` to run
  `meteor deploy` (and similar commands) against Galaxy. The AWS us-east-1
  Galaxy is now the default for `DEPLOY_HOSTNAME`. If your app's DNS points to
  another Galaxy region, `meteor deploy` will detect that automatically as
  well. #7055

* The `coffeescript` plugin now passes raw JavaScript code enclosed by
  back-ticks to `BabelCompiler`, enabling all ECMAScript features
  (including `import` and `export`) within CoffeeScript. #6000 #6691

* The `coffeescript` package now implies the same runtime environment as
  `ecmascript` (`ecmascript-runtime`, `babel-runtime`, and `promise`, but
  not `modules`). #7184

* When Meteor packages install `npm` dependencies, the
  `process.env.NPM_CONFIG_REGISTRY` environment variable is now
  respected. #7162

* `files.rename` now always executes synchronously. 9856d1d418a4d19c0adf22ec9a92f7ce81a23b05

* "Bare" files contained by `client/compatibility/` directories or added
  with `api.addFiles(path, ..., { bare: true })` are no longer compiled by
  Babel. https://github.com/meteor/meteor/pull/7033#issuecomment-225126778

* Miscellaneous fixed bugs: #6877 #6843 #6881

## v1.3.2.4, 2016-04-20

> Meteor 1.3.2.4 was published because publishing 1.3.2.3 failed in an
unrecoverable way. Meteor 1.3.2.4 contains no additional changes beyond
the changes in 1.3.2.3.

## v1.3.2.3, 2016-04-20

* Reverted accidental changes included in 1.3.2.1 and 1.3.2.2 that
  improved DDP performance by batching updates, but broke some packages
  that relied on private methods of the DDP client Connection class. See
  https://github.com/meteor/meteor/pull/5680 for more details. These
  changes will be reinstated in 1.3.3.

## v1.3.2.2, 2016-04-18

* Fixed bugs #6819 and #6831.

## v1.3.2.1, 2016-04-15

* Fixed faulty comparison of `.sourcePath` and `.targetPath` properties of
  files scanned by the `ImportScanner`, which caused problems for apps
  using the `tap:i18n` package. 6e792a7cf25847b8cd5d5664a0ff45c9fffd9e57

## v1.3.2, 2016-04-15

* The `meteor/meteor` repository now includes a `Roadmap.md` file:
  https://github.com/meteor/meteor/blob/devel/Roadmap.md

* Running `npm install` in `bundle/programs/server` when deploying an app
  also rebuilds any binary npm dependencies, fixing #6537. Set
  METEOR_SKIP_NPM_REBUILD=1 to disable this behavior if necessary.

* Non-.js(on) files in `node_modules` (such as `.less` and `.scss`) are
  now processed by compiler plugins and may be imported by JS. #6037

* The `jquery` package can now be completely removed from any app (#6563),
  and uses `<app>/node_modules/jquery` if available (#6626).

* Source maps are once again generated for all bundled JS files, even if
  they are merely identity mappings, so that the files appear distinct in
  the browser, and stack traces make more sense. #6639

* All application files in `imports` directories are now considered lazy,
  regardless of whether the app is using the `modules` package. This could
  be a breaking change for 1.3.2 apps that do not use `modules` or
  `ecmascript` but contain `imports` directories. Workaround: move files
  out of `imports`, or rename `imports` to something else.

* The `npm-bcrypt` package has been upgraded to use the latest version
  (0.8.5) of the `bcrypt` npm package.

* Compiler plugins can call `addJavaScript({ path })` multiple times with
  different paths for the same source file, and `module.id` will reflect
  this `path` instead of the source path, if they are different. #6806

* Fixed bugs: https://github.com/meteor/meteor/milestones/Release%201.3.2

* Fixed unintended change to `Match.Optional` which caused it to behave the same as the new `Match.Maybe` and incorrectly matching `null` where it previously would not have allowed it. #6735

## v1.3.1, 2016-04-03

* Long isopacket node_modules paths have been shortened, fixing upgrade
  problems on Windows. #6609

* Version 1.3.1 of Meteor can now publish packages for earlier versions of
  Meteor, provided those packages do not rely on modules. #6484 #6618

* The meteor-babel npm package used by babel-compiler has been upgraded to
  version 0.8.4. c8d12aed4e725217efbe86fa35de5d5e56d73c83

* The `meteor node` and `meteor npm` commands now return the same exit
  codes as their child processes. #6673 #6675

* Missing module warnings are no longer printed for Meteor packages, or
  for `require` calls when `require` is not a free variable, fixing
  https://github.com/practicalmeteor/meteor-mocha/issues/19.

* Cordova iOS builds are no longer built by Meteor, but merely prepared
  for building. 88d43a0f16a484a5716050cb7de8066b126c7b28

* Compiler plugin errors were formerly silenced for files not explicitly
  added in package.js. Now those errors are reported when/if the files are
  imported by the ImportScanner. be986fd70926c9dd8eff6d8866205f236c8562c4

## v1.3, 2016-03-27

### ES2015/Modules

* Enable ES2015 and CommonJS modules in Meteor apps and packages, on
  both client and server. Also let you install modules in apps and
  package by running `npm install`. See: https://github.com/meteor/meteor/blob/master/packages/modules/README.md

* Enable ES2015 generators and ES2016 async/await in the `ecmascript`
  package.

* Inherit static getters and setters in subclasses, when using the
  `ecmascript` package. #5624

* Report full file paths on compiler errors when using the
  `ecmascript` package. #5551

* Now possible to `import` or `require` files with a `.json` file
  extension. #5810

* `process.env.NODE_ENV` is now defined on both client and server as
  either `development` or `production`, which also determines the boolean
  flags `Meteor.isDevelopment` and `Meteor.isProduction`.

* Absolute identifiers for app modules no longer have the `/app/` prefix,
  and absolute identifiers for Meteor packages now have the prefix
  `/node_modules/meteor/` instead of just `/node_modules/`, meaning you
  should `import {Blaze} from "meteor/blaze"` instead of `from "blaze"`.

* Package variables imported by application code are once again exposed
  globally, allowing them to be accessed from the browser console or from
  `meteor shell`. #5868

* Fixed global variable assignment analysis during linking. #5870 #5819

* Changes to files in node_modules will now trigger a restart of the
  development server, just like any other file changes. #5815

* The meteor package now exports a `global` variable (a la Node) that
  provides a reliable reference to the global object for all Meteor code.

* Packages in local node_modules directories now take precedence over
  Meteor packages of the same name. #5933

* Upgraded `babel-compiler` to Babel 6, with the following set of plugins:
  https://github.com/meteor/babel-preset-meteor/blob/master/index.js

* Lazy CSS modules may now be imported by JS: 12c946ee651a93725f243f790c7919de3d445a19

* Packages in the top-level node_modules directory of an app can now be
  imported by Meteor packages: c631d3ac35f5ca418b93c454f521989855b8ec72

* Added support for wildcard import and export statements. #5872 #5897

* Client-side stubs for built-in Node modules are now provided
  automatically if the `meteor-node-stubs` npm package is installed. #6056

* Imported file extensions are now optional for file types handled by
  compiler plugins. #6151

* Upgraded Babel packages to ~6.5.0: 292824da3f8449afd1cd39fcd71acd415c809c0f
  Note: .babelrc files are now ignored (#6016), but may be reenabled (#6351).

* Polyfills now provided for `process.nextTick` and `process.platform`. #6167 #6198 #6055 efe53de492da6df785f1cbef2799d1d2b492a939

* The `meteor test-app` command is now `meteor test [--full-app]`:
  ab5ab15768136d55c76d51072e746d80b45ec181

* New apps now include a `package.json` file.
  c51b8cf7ffd8e7c9ca93768a2df93e4b552c199c

* `require.resolve` is now supported.
  https://github.com/benjamn/install/commit/ff6b25d6b5511d8a92930da41db73b93eb1d6cf8

* JSX now enabled in `.js` files processed by the `ecmascript` compiler
  plugin. #6151

* On the server, modules contained within `node_modules` directories are
  now loaded using the native Node `require` function. #6398

* All `<script>` tag(s) for application and package code now appear at the
  end of the `<body>` rather than in the `<head>`. #6375

* The client-side version of `process.env.NODE_ENV` (and other environment
  variables) now matches the corresponding server-side values. #6399

### Performance

* Don't reload package catalog from disk on rebuilds unless package
  dependencies changed. #5747

* Improve minimongo performance on updating documents when there are
  many active observes. #5627

### Platform

* Upgrade to Node v0.10.41.

* Allow all types of URLs that npm supports in `Npm.depends`
  declarations.

* Split up `standard-minifiers` in separate CSS
  (`standard-minifiers-css`) and JS minifiers
  (`standard-minifiers-js`). `standard-minifiers` now acts as an
  umbrella package for these 2 minifiers.

* Allow piping commands to `meteor shell` via STDIN. #5575

* Let users set the CAFILE environment variable to override the SSL
  root certificate list. #4757 #5523

* `force-ssl` is now marked production only.

### Cordova

* Cordova dependencies have been upgraded to the latest versions
  (`cordova-lib` 6.0.0, `cordova-ios` 4.0.1, and `cordova-android` 5.1.0).

* iOS apps now require iOS 8 or higher, and building for iOS requires Xcode 7.2
  to be installed.

* Building for Android now requires Android SDK 23 to be installed. You may also
  need to create a new AVD for the emulator.

* Building Cordova Android apps on Windows is now supported. #4155

* The Crosswalk plugin has been updated to 1.4.0.

* Cordova core plugins are now pinned to minimal versions known to be compatible
  with the included platforms. A warning is printed asking people to upgrade
  their dependencies if they specify an older version, but we'll always use
  the pinned version regardless.

* The plugin used for file serving and hot code push has been completely
  rewritten. Among many other improvements, it downloads updates incrementally,
  can recover from downloading faulty JavaScript code, and is much more
  reliable and performant.
  See [`cordova-plugin-meteor-webapp`](https://github.com/meteor/cordova-plugin-meteor-webapp)
  for more a more detailed description of the new design.

* If the callbacks added with `Meteor.startup()` do not complete within a set
  time, we consider a downloaded version faulty and will fallback to the last
  known good version. The default timeout is 20 seconds, but this can be
  configured by setting `App.setPreference("WebAppStartupTimeout", "10000");`
  (in milliseconds) in `mobile-config.js`.

* We now use `WKWebView` on iOS by default, even on iOS 8 (which works because
  we do not use `file://` URLs).

* We now use `localhost` instead of `meteor.local` to serve files from. Since
  `localhost` is considered a secure origin, this means the web view won't
  disable web platform features that it otherwise would.

* The local server port now lies between 12000-13000 and is chosen based on
  the `appId`, to both be consistent and lessen the chance of collisions between
  multiple Meteor Cordova apps installed on the same device.

* The plugin now allows for local file access on both iOS and Android, using a
  special URL prefix (`http://localhost:<port>/local-filesystem/<path>`).

* App icon and launch image sizes have been updated. Low resolution sizes for
  now unsupported devices have been deprecated, and higher resolution versions
  have been added.

* We now support the modern Cordova whitelist mechanism. `App.accessRule` has
  been updated with new options.

* `meteor build` now supports a `--server-only` option to avoid building
  the mobile apps when `ios` or `android` platforms have been added. It still
  builds the `web.cordova` architecture in the server bundle however, so it can
  be served for hot code pushes.

* `meteor run` now always tries to use an autodetected IP address as the
  mobile `ROOT_URL`, even if we're not running on a device. This avoids a situation
  where an app already installed on a device connects to a restarted development
  server and receives a `localhost` `ROOT_URL`. #5973

* Fixed a discrepancy between the way we calculated client hashes during a mobile
  build and on the server, which meant a Cordova app would always download a
  new version the first time it started up.

* In Cordova apps, `Meteor.startup()` now correctly waits for the
  device to be ready before firing the callback.

### Accounts

* Make `Accounts.forgotPassword` treat emails as case insensitive, as
  the rest of the accounts system does.

### Blaze

* Don't throw in certain cases when calling a template helper with an
  empty data context. #5411 #5736

* Improve automatic blocking of URLs in attribute values to also
  include `vbscript:` URLs.

### Check

* Introduced new matcher `Match.Maybe(type)` which will also match (permit) `null` in addition to `undefined`.  This is a suggested replacement (where appropriate) for `Match.Optional` which did not permit `null`.  This prevents the need to use `Match.OneOf(null, undefined, type)`. #6220

### Testing

* Packages can now be marked as `testOnly` to only run as part of app
  testing with `meteor test`. This is achieved by setting
  `testOnly: true` to `Package.describe`.


### Uncategorized

* Remove warning in the `simple-todos-react` example app. #5716

* Fix interaction between `browser-policy` and `oauth` packages. #5628

* Add README.md to the `tinytest` package. #5750

* Don't crash when calling `ReactiveDict.prototype.clear` if a
  property with a value wasn't previously accessed. #5530 #5602

* Move `DDPRateLimiter` to the server only, since it won't work if it
  is called from the client. It will now error if referenced from the
  client at all.

* Don't call function more than once when passing a `Match.Where`
  argument to `check`. #5630 #5651

* Fix empty object argument check in `this.subscribe` in
  templates. #5620

* Make `HTTP.call` not crash on undefined content. #5565 #5601

* Return observe handle from
  `Mongo.Collection.prototype._publishCursor`. #4983 #5615

* Add 'Did you mean?' reminders for some CLI commands to help Rails
  developers. #5593

* Make internal shell scripts compatible with other Unix-like
  systems. #5585

* Add a `_pollingInterval` option to `coll.find()` that can be used in
  conjunction with `_disableOplog: true`. #5586

* Expose Tinytest internals which can be used to extend it. #3541

* Improve error message from `check` when passing in null. #5545

* Split up `standard-minifiers` in separate CSS (`standard-minifier-css`) and JS
  minifiers(`standard-minifier-js`). `standard-minifiers` now acts as an umbrella package for these
  2 minifiers.

* Detect new Facebook user-agent in the `spiderable` package. #5516

* `Match.ObjectIncluding` now really requires plain objects. #6140

* Allow `git+` URL schemes for npm dependencies. #844

* Expose options `disableOplog`, `pollingIntervalMs`, and
  `pollingThrottleMs` to `Cursor.find` for tuning observe parameters
  on the server.

* Expose `dynamicHead` and `dynamicBody` hooks in boilerplate generation allowing code to inject content into the body and head tags from the server. #3860

* Add methods of the form `BrowserPolicy.content.allow<ContentType>BlobUrl()` to BrowserPolicy #5141

* Move `<script>` tags to end of `<body>` to enable 'loading' UI to be inserted into the boilerplate #6375

* Adds WebAppInternals.setBundledJsCssUrlRewriteHook allowing apps to supply a hook function that can create a dynamic bundledJsCssPrefix at runtime. This is useful if you're using a CDN by giving you a way to ensure the CDN won't cache broken js/css resources during an app upgrade.

Patches contributed by GitHub users vereed, mitar, nathan-muir,
robfallows, skishore, okland, Primigenus, zimme, welelay, rgoomar,
bySabi, mbrookes, TomFreudenberg, TechPlexEngineer, zacharydenton,
AlexeyMK, gwendall, dandv, devgrok, brianlukoff.


## v.1.2.1, 2015-10-26

* `coll.insert()` now uses a faster (but cryptographically insecure)
  algorithm to generate document IDs when called outside of a method
  and an `_id` field is not explicitly passed. With this change, there
  are no longer two algorithms used to generate document
  IDs. `Random.id()` can still be used to generate cryptographically
  secure document IDs. [#5161](https://github.com/meteor/meteor/issues/5161)

* The `ecmascript-collections` package has been renamed to
  `ecmascript-runtime` and now includes a more complete selection of
  ES2015 polyfills and shims from [`core-js`](https://www.npmjs.com/package/core-js).
  The complete list can be found
  [here](https://github.com/meteor/ecmascript-runtime/blob/master/server.js).

* Check type of `onException` argument to `bindEnvironment`. [#5271](https://github.com/meteor/meteor/issues/5271)

* WebApp's `PORT` environment variable can now be a named pipe to better support
  deployment on IIS on Windows. [4413](https://github.com/meteor/meteor/issues/4413)

* `Template.dynamic` can be now used as a block helper:
  `{{#Template.dynamic}} ... {{/Template.dynamic}}` [#4756](https://github.com/meteor/meteor/issues/4756)

* `Collection#allow/deny` now throw errors when passed falsy values. [#5442](https://github.com/meteor/meteor/pull/5442)

* `source-map` has been updated to a newer patch version, which fixes major bugs
  in particular around loading bundles generated by Webpack. [#5411](https://github.com/meteor/meteor/pull/5411)

* `check` now returns instead of throwing errors internally, which should make
  it much faster. `check` is used in many core Meteor packages, so this should
  result in small performance improvements across the framework. [#4584](https://github.com/meteor/meteor/pull/4584)

* The `userEmail` option to `Meteor.loginWithMeteorDeveloperAccount` has been
  renamed to `loginHint`, and now supports Google accounts as well. The old
  option still works for backwards compatibility. [#2422](https://github.com/meteor/meteor/issues/2422) [#5313](https://github.com/meteor/meteor/pull/5313)

* The old `addFiles` API for adding package assets no longer throws an error,
  making it easier to share packages between pre- and post-1.2 versions of
  Meteor. [#5458](https://github.com/meteor/meteor/issues/5458)

* Normally, you can't deploy to free meteor.com hosting or Galaxy from a
  non-Linux machine if you have *local* non-published packages with binary
  dependencies, nor can you run `meteor build --architecture SomeOtherArch`. As
  a temporary workaround, if you set the `METEOR_BINARY_DEP_WORKAROUND`
  variable, you will be able to deploy to Galaxy (but not free meteor.com
  hosting), and tarballs built with `meteor build` will contain a
  `programs/server/setup.sh` shell script which should be run on the server to
  install those packages.

## v1.2.0.2, 2015-09-28

* Update Crosswalk plugin for Cordova to 1.3.1. [#5267](https://github.com/meteor/meteor/issues/5267)

* Fix `meteor add` for a Cordova plugin using a Git URL with SHA.

* Upgraded the `promise` package to use `meteor-promise@0.5.0`, which uses
  the global `Promise` constructor in browsers that define it natively.

* Fix error in assigning attributes to `<body>` tag when using Blaze templates
  or `static-html`. [#5232](https://github.com/meteor/meteor/issues/5232)

## v1.2.0.1, 2015-09-22

* Fix incorrect publishing of packages with exports but no source. [#5228](https://github.com/meteor/meteor/issues/5228)

## v1.2, 2015-09-21

There are quite a lot of changes in Meteor 1.2. See the
[Wiki](https://github.com/meteor/meteor/wiki/Breaking-changes-in-Meteor-1.2) for
a shorter list of breaking changes you should be aware of when upgrading.

### Core Packages

* `meteor-platform` has been deprecated in favor of the smaller `meteor-base`,
  with apps listing their other dependencies explicitly.  The v1.2 upgrader
  will rewrite `meteor-platform` in existing apps.  `meteor-base` puts fewer
  symbols in the global namepsace, so it's no longer true that all apps
  have symbols like `Random` and `EJSON` in the global namespace.

* New packages: `ecmascript`, `es5-shim`, `ecmascript-collections`, `promise`,
  `static-html`, `jshint`, `babel-compiler`

* No longer include the `json` package by default, which contains code for
  `JSON.parse` and `JSON.stringify`.  (The last browser to not support JSON
  natively was Internet Explorer 7.)

* `autoupdate` has been renamed `hot-code-push`

### Meteor Accounts

* Login attempts are now rate-limited by default.  This can be turned off
  using `Accounts.removeDefaultRateLimit()`.

* `loginWithPassword` now matches username or email in a case insensitive
  manner. If there are multiple users with a username or email only differing
  in case, a case sensitive match is required. [#550](https://github.com/meteor/meteor/issues/550)

* `loginWithGithub` now requests `user:email` scope by default, and attempts
  to fetch the user's emails. If no public email has been set, we use the
  primary email instead. We also store the complete list of emails. [#4545](https://github.com/meteor/meteor/issues/4545)

* When an account's email address is verified, deactivate other verification
  tokens.  [#4626](https://github.com/meteor/meteor/issues/4626)

* Fix bug where blank page is shown when an expired login token is
  present. [#4825](https://github.com/meteor/meteor/issues/4825)

* Fix `OAuth1Binding.prototype.call` when making requests to Twitter
  with a large parameter set.

* Directions for setting up Google OAuth in accounts-ui have been updated to
  match Google's new requirements.

* Add `Accounts.oauth.unregisterService` method, and ensure that users can only
  log in with currently registered services.  [#4014](https://github.com/meteor/meteor/issues/4014)

* The `accounts-base` now defines reusable `AccountsClient` and
  `AccountsServer` constructors, so that users can create multiple
  independent instances of the `Accounts` namespace.  [#4233](https://github.com/meteor/meteor/issues/4233)

* Create an index for `Meteor.users` on
  `services.email.verificationTokens.token` (instead of
  `emails.validationTokens.token`, which never was used for anything).  [#4482](https://github.com/meteor/meteor/issues/4482)

* Remove an IE7-specific workaround from accounts-ui.  [#4485](https://github.com/meteor/meteor/issues/4485)

### Livequery

* Improved server performance by reducing overhead of processing oplog after
  database writes. Improvements are most noticeable in case when a method is
  doing a lot of writes on collections with plenty of active observers.  [#4694](https://github.com/meteor/meteor/issues/4694)

### Mobile

* The included Cordova tools have been updated to the latest version 5.2.0.
  This includes Cordova Android 4.1 and Cordova iOS 3.9. These updates may
  require you to make changes to your app. For details, see the [Cordova release
  notes] (https://cordova.apache.org/#news) for for the different versions.

* Thanks to Cordova Android's support for pluggable web views, it is now
  possible to install the [Crosswalk plugin]
  (https://crosswalk-project.org/documentation/cordova/cordova_4.html), which
  offers a hugely improved web view on older Android versions.
  You can add the plugin to your app with `meteor add crosswalk`.

* The bundled Android tools have been removed and a system-wide install of the
  Android SDK is now required. This should make it easier to keep the
  development toolchain up to date and helps avoid some difficult to diagnose
  failures. If you don't have your own Android tools installed already, you can
  find more information about installing the Android SDK for [Mac] (https://github.com/meteor/meteor/wiki/Mobile-Dev-Install:-Android-on-Mac)
  or [Linux]
  (https://github.com/meteor/meteor/wiki/Mobile-Dev-Install:-Android-on-Linux).

* As part of moving to npm, many Cordova plugins have been renamed. Meteor
  should perform conversions automatically, but you may want to be aware of this
  to avoid surprises. See [here]
  (https://cordova.apache.org/announcements/2015/04/21/plugins-release-and-move-to-npm.html)
  for more information.

* Installing plugins from the local filesystem is now supported using `file://`
  URLs, which should make developing your own plugins more convenient. It is
  also needed as a temporary workaround for using the Facebook plugin.
  Relative references are interpreted relative to the Meteor project directory.
  (As an example,
  `meteor add cordova:phonegap-facebook-plugin@file://../phonegap-facebook-plugin`
  would attempt to install the plugin from the same directory you Meteor project
  directory is located in.)

* Meteor no longer supports installing Cordova plugins from tarball URLs, but
  does support Git URLs with a SHA reference (like
  `https://github.com/apache/cordova-plugin-file#c452f1a67f41cb1165c92555f0e721fbb07329cc`).
  Existing GitHub tarball URLs are converted automatically.

* Allow specifying a `buildNumber` in `App.info`, which is used to set the
  `android-versionCode` and `ios-CFBundleVersion` in the `config.xml` of the
  Cordova project. The build number is used to differentiate between
  different versions of the app, and should be incremented before distributing
  a built app to stores or testing services. [#4048](https://github.com/meteor/meteor/issues/4048)

* Other changes include performance enhancements when building and running,
  and improved requirements checking and error reporting.

* Known issue: we do not currently show logging output when running on the
  iOS Simulator. As a workaround, you can `meteor run ios-device` to open the
  project in Xcode and watch the output there.

### Templates/Blaze

* New syntax: Handlebars sub-expressions are now supported -- as in,
  `{{helper (anotherHelper arg1 arg2)}}` -- as well as new block helper forms
  `#each .. in ..` and `#let x=y`.  See
  https://github.com/meteor/meteor/tree/devel/packages/spacebars

* Add a special case for the new `react-template-helper` package -- don't let
  templates use {{> React}} with siblings since `React.render` assumes it's
  being rendered into an empty container element. (This lets us throw the error
  when compiling templates rather than when the app runs.)

* Improve parsing of `<script>` and `<style>` tags.  [#3797](https://github.com/meteor/meteor/issues/3797)

* Fix a bug in `observe-sequence`. The bug was causing unnecessary rerenderings
  in an instance of `#each` block helper followed by false "duplicate ids"
  warnings. [#4049](https://github.com/meteor/meteor/issues/4049)

* `TemplateInstance#subscribe` now has a new `connection` option, which
  specifies which connection should be used when making the subscription. The
  default is `Meteor.connection`, which is the connection used when calling
  `Meteor.subscribe`.

* Fix external `<script>` tags in body or templates.  [#4415](https://github.com/meteor/meteor/issues/4415)

* Fix memory leak.  [#4289](https://github.com/meteor/meteor/issues/4289)

* Avoid recursion when materializing DOM elements, to avoid stack overflow
  errors in certain browsers. [#3028](https://github.com/meteor/meteor/issues/3028)

* Blaze and Meteor's built-in templating are now removable using
  `meteor remove blaze-html-templates`. You can add back support for static
  `head` and `body` tags in `.html` files by using the `static-html` package.

### DDP

* Websockets now support the
  [`permessage-deflate`](https://tools.ietf.org/id/draft-ietf-hybi-permessage-compression-19.txt)
  extension, which compresses data on the wire. It is enabled by default on the
  server. To disable it, set `$SERVER_WEBSOCKET_COMPRESSION` to `0`. To configure
  compression options, set `$SERVER_WEBSOCKET_COMPRESSION` to a JSON object that
  will be used as an argument to
  [`deflate.configure`](https://github.com/faye/permessage-deflate-node/blob/master/README.md).
  Compression is supported on the client side by Meteor's Node DDP client and by
  browsers including Chrome, Safari, and Firefox 37.

* The `ddp` package has been split into `ddp-client` and `ddp-server` packages;
  using `ddp` is equivalent to using both. This allows you to use the Node DDP
  client without adding the DDP server to your app.  [#4191](https://github.com/meteor/meteor/issues/4191) [#3452](https://github.com/meteor/meteor/issues/3452)

* On the client, `Meteor.call` now takes a `throwStubExceptions` option; if set,
  exceptions thrown by method stubs will be thrown instead of logged, and the
  method will not be invoked on the server.  [#4202](https://github.com/meteor/meteor/issues/4202)

* `sub.ready()` should return true inside that subscription's `onReady`
  callback.  [#4614](https://github.com/meteor/meteor/issues/4614)

* Fix method calls causing broken state when socket is reconnecting.  [#5104](https://github.com/meteor/meteor/issues/5104)

### Isobuild

* Build plugins will no longer process files whose names match the extension
  exactly (with no extra dot). If your build plugin needs to match filenames
  exactly, you should use the new build plugin API in this release which
  supplies a special `filenames` option. [#3985](https://github.com/meteor/meteor/issues/3985)

* Adding the same file twice in the same package is now an error. Previously,
  this could either lead to the file being included multiple times, or to a
  build time crash.

* You may now specify the `bare` option for JavaScript files on the server.
  Previous versions only allowed this on the client. [#3681](https://github.com/meteor/meteor/issues/3681)

* Ignore `node_modules` directories in apps instead of processing them as Meteor
  source code.  [#4457](https://github.com/meteor/meteor/issues/4457) [#4452](https://github.com/meteor/meteor/issues/4452)

* Backwards-incompatible change for package authors: Static assets in package.js files must now be
  explicitly declared by using `addAssets` instead of `addFiles`. Previously,
  any file that didn't have a source handler was automatically registered as a
  server-side asset. The `isAsset` option to `addFiles` is also deprecated in
  favor of `addAssets`.

* Built files are now always annotated with line number comments, to improve the
  debugging experience in browsers that don't support source maps.

* There is a completely new API for defining build plugins that cache their
  output. There are now special APIs for defining linters and minifiers in
  addition to compilers. The core Meteor packages for `less`, `coffee`, `stylus`
  and `html` files have been updated to use this new API. Read more on the
  [Wiki page](https://github.com/meteor/meteor/wiki/Build-Plugins-API).

### CSS

* LESS and Stylus now support cross-package imports.

* CSS concatenation and minification is delegated to the `standard-minifiers`
  package, which is present by default (and added to existing apps by the v1.2
  upgrader).

* CSS output is now split into multiple stylesheets to avoid hitting limits on
  rules per stylesheet in certain versions of Internet Explorer. [#1876](https://github.com/meteor/meteor/issues/1876)

### Mongo

* The oplog observe driver now properly updates queries when you drop a
  database.  [#3847](https://github.com/meteor/meteor/issues/3847)

* MongoID logic has been moved out of `minimongo` into a new package called
  `mongo-id`.

* Fix Mongo upserts with dotted keys in selector.  [#4522](https://github.com/meteor/meteor/issues/4522)


### `meteor` command-line tool

* You can now create three new example apps with the command line tool. These
  are the apps from the official tutorials at http://meteor.com/tutorials, which
  demonstrate building the same app with Blaze, Angular, and React. Try these
  apps with:

  ```sh
  meteor create --example simple-todos
  meteor create --example simple-todos-react
  meteor create --example simple-todos-angular
  ```

* `meteor shell` no longer crashes when piped from another command.

* Avoid a race condition in `meteor --test` and work with newer versions of the
  Velocity package.  [#3957](https://github.com/meteor/meteor/issues/3957)

* Improve error handling when publishing packages.  [#3977](https://github.com/meteor/meteor/issues/3977)

* Improve messaging around publishing binary packages.  [#3961](https://github.com/meteor/meteor/issues/3961)

* Preserve the value of `_` in `meteor shell`.  [#4010](https://github.com/meteor/meteor/issues/4010)

* `meteor mongo` now works on OS X when certain non-ASCII characters are in the
  pathname, as long as the `pgrep` utility is installed (it ships standard with
  OS X 10.8 and newer).  [#3999](https://github.com/meteor/meteor/issues/3999)

* `meteor run` no longer ignores (and often reverts) external changes to
  `.meteor/versions` which occur while the process is running.  [#3582](https://github.com/meteor/meteor/issues/3582)

* Fix crash when downloading two builds of the same package version
  simultaneously.  [#4163](https://github.com/meteor/meteor/issues/4163)

* Improve messages printed by `meteor update`, displaying list of packages
  that are not at the latest version available.

* When determining file load order, split file paths on path separator
  before comparing path components alphabetically.  [#4300](https://github.com/meteor/meteor/issues/4300)

* Fix inability to run `mongod` due to lack of locale configuration on some
  platforms, and improve error message if the failure still occurs.  [#4019](https://github.com/meteor/meteor/issues/4019)

* New `meteor lint` command.

### Minimongo

* The `$push` query modifier now supports a `$position` argument.  [#4312](https://github.com/meteor/meteor/issues/4312)

* `c.update(selector, replacementDoc)` no longer shares mutable state between
  replacementDoc and Minimongo internals. [#4377](https://github.com/meteor/meteor/issues/4377)

### Email

* `Email.send` now has a new option, `attachments`, in the same style as
  `mailcomposer`.
  [Details here.](https://github.com/andris9/mailcomposer#add-attachments)

### Tracker

* New `Tracker.Computation#onStop` method.  [#3915](https://github.com/meteor/meteor/issues/3915)

* `ReactiveDict` has two new methods, `clear` and `all`. `clear` resets
  the dictionary as if no items had been added, meaning all calls to `get` will
  return `undefined`. `all` converts the dictionary into a regular JavaScript
  object with a snapshot of the keys and values. Inside an autorun, `all`
  registers a dependency on any changes to the dictionary. [#3135](https://github.com/meteor/meteor/issues/3135)

### Utilities

* New `beforeSend` option to `HTTP.call` on the client allows you to directly
  access the `XMLHttpRequest` object and abort the call.  [#4419](https://github.com/meteor/meteor/issues/4419) [#3243](https://github.com/meteor/meteor/issues/3243) [#3266](https://github.com/meteor/meteor/issues/3266)

* Parse `application/javascript` and `application/x-javascript` HTTP replies as
  JSON too.  [#4595](https://github.com/meteor/meteor/issues/4595)

* `Match.test` from the `check` package now properly compares boolean literals,
  just like it does with Numbers and Strings. This applies to the `check`
  function as well.

* Provide direct access to the `mailcomposer` npm module used by the `email`
  package on `EmailInternals.NpmModules`. Allow specifying a `MailComposer`
  object to `Email.send` instead of individual options.  [#4209](https://github.com/meteor/meteor/issues/4209)

* Expose `Spiderable.requestTimeoutMs` from `spiderable` package to
  allow apps to set the timeout for running phantomjs.

* The `spiderable` package now reports the URL it's trying to fetch on failure.


### Other bug fixes and improvements

* Upgraded dependencies:

  - Node: 0.10.40 (from 0.10.36)
  - uglify-js: 2.4.20 (from 2.4.17)
  - http-proxy: 1.11.1 (from 1.6.0)

* `Meteor.loginWithGoogle` now supports `prompt`. Choose a prompt to always be
  displayed on Google login.

* Upgraded `coffeescript` package to depend on NPM packages
  coffeescript@1.9.2 and source-map@0.4.2. [#4302](https://github.com/meteor/meteor/issues/4302)

* Upgraded `fastclick` to 1.0.6 to fix an issue in iOS Safari. [#4393](https://github.com/meteor/meteor/issues/4393)

* Fix `Error: Can't render headers after they are sent to the client`.  [#4253](https://github.com/meteor/meteor/issues/4253) [#4750](https://github.com/meteor/meteor/issues/4750)

* `Meteor.settings.public` is always available on client and server,
  and modifications made on the server (for example, during app initialization)
  affect the value seen by connecting clients. [#4704](https://github.com/meteor/meteor/issues/4704)

### Windows

* Increase the buffer size for `netstat` when looking for running Mongo servers. [#4125](https://github.com/meteor/meteor/issues/4125)

* The Windows installer now always fetches the latest available version of
  Meteor at runtime, so that it doesn't need to be recompiled for every release.

* Fix crash in `meteor mongo` on Windows.  [#4711](https://github.com/meteor/meteor/issues/4711)


## v1.1.0.3, 2015-08-03

### Accounts

* When using Facebook API version 2.4, properly fetch `email` and other fields.
  Facebook recently forced all new apps to use version 2.4 of their API.  [#4743](https://github.com/meteor/meteor/issues/4743)


## v1.1.0.2, 2015-04-06

### `meteor` command-line tool

* Revert a change in 1.1.0.1 that caused `meteor mongo` to fail on some Linux
  systems. [#4115](https://github.com/meteor/meteor/issues/4115), [#4124](https://github.com/meteor/meteor/issues/4124), [#4134](https://github.com/meteor/meteor/issues/4134)


## v1.1.0.1, 2015-04-02

### Blaze

* Fix a regression in 1.1 in Blaze Templates: an error happening when View is
  invalidated immediately, causing a client-side crash (accessing
  `destroyMembers` of `undefined`). [#4097](https://github.com/meteor/meteor/issues/4097)

## v1.1, 2015-03-31

### Windows Support

* The Meteor command line tool now officially supports Windows 7, Windows 8.1,
  Windows Server 2008, and Windows Server 2012. It can run from PowerShell or
  Command Prompt.

* There is a native Windows installer that will be available for download from
  <https://www.meteor.com/install> starting with this release.

* In this release, Meteor on Windows supports all features available on Linux
  and Mac except building mobile apps with PhoneGap/Cordova.

* The `meteor admin get-machine` command now supports an additional
  architecture, `os.windows.x86_32`, which can be used to build binary packages
  for Windows.

### Version Solver

* The code that selects compatible package versions for `meteor update`
  and resolves conflicts on `meteor add` has been rewritten from the ground up.
  The core solver algorithm is now based on MiniSat, an open-source SAT solver,
  improving performance and maintainability.

* Refresh the catalog instead of downgrading packages when the versions in
  `.meteor/versions` aren't in the cache.  [#3653](https://github.com/meteor/meteor/issues/3653)

* Don't downgrade packages listed in `.meteor/packages`, or upgrade to a new
  major version, unless the new flag `--allow-incompatible-update` is passed
  as an override.

* Error messages are more detailed when constraints are unsatisfiable.

* Prefer "patched" versions of new indirect dependencies, and take patches
  to them on `meteor update` (for example, `1.0.1` or `1.0.0_1` over `1.0.0`).

* Version Solver is instrumented for profiling (`METEOR_PROFILE=1` in the
  environment).

* Setting the `METEOR_PRINT_CONSTRAINT_SOLVER_INPUT` environment variable
  prints information useful for diagnosing constraint solver bugs.

### Tracker

* Schedule the flush cycle using a better technique than `setTimeout` when
  available.  [#3889](https://github.com/meteor/meteor/issues/3889)

* Yield to the event loop during the flush cycle, unless we're executing a
  synchronous `Tracker.flush()`.  [#3901](https://github.com/meteor/meteor/issues/3901)

* Fix error reporting not being source-mapped properly. [#3655](https://github.com/meteor/meteor/issues/3655)

* Introduce a new option for `Tracker.autorun` - `onError`. This callback can be
  used to handle errors caught in the reactive computations. [#3822](https://github.com/meteor/meteor/issues/3822)

### Blaze

* Fix stack overflow from nested templates and helpers by avoiding recursion
  during rendering.  [#3028](https://github.com/meteor/meteor/issues/3028)

### `meteor` command-line tool

* Don't fail if `npm` prints more than 200K.  [#3887](https://github.com/meteor/meteor/issues/3887)


### Other bug fixes and improvements

* Upgraded dependencies:

  - uglify-js: 2.4.17 (from 2.4.13)

Patches contributed by GitHub users hwillson, mitar, murillo128, Primigenus,
rjakobsson, and tmeasday.


## v1.0.5, 2015-03-25

* This version of Meteor now uses version 2.2 of the Facebook API for
  authentication, instead of 1.0. If you use additional Facebook API methods
  beyond login, you may need to request new permissions.

  Facebook will automatically switch all apps to API version 2.0 on April
  30th, 2015. Please make sure to update your application's permissions and API
  calls by that date.

  For more details, see
  https://github.com/meteor/meteor/wiki/Facebook-Graph-API-Upgrade


## v1.0.4.2, 2015-03-20

* Fix regression in 1.0.4 where using Cordova for the first time in a project
  with hyphens in its directory name would fail.  [#3950](https://github.com/meteor/meteor/issues/3950)


## v1.0.4.1, 2015-03-18

* Fix regression in 1.0.4 where `meteor publish-for-arch` only worked for
  packages without colons in their name.  [#3951](https://github.com/meteor/meteor/issues/3951)

## v1.0.4, 2015-03-17

### Mongo Driver

* Meteor is now tested against MongoDB 2.6 by default (and the bundled version
  used by `meteor run` has been upgraded). It should still work fine with
  MongoDB 2.4.  Previous versions of Meteor mostly worked with MongoDB 2.6, with
  a few caveats:

    - Some upsert invocations did not work with MongoDB in previous versions of
      Meteor.
    - Previous versions of Meteor required setting up a special "user-defined
      role" with access to the `system.replset` table to use the oplog observe
      driver with MongoDB 2.6.  These extra permissions are not required with
      this version of Meteor.

  The MongoDB command needed to set up user permissions for the oplog observe
  driver is slightly different in MongoDB 2.6; see
  https://github.com/meteor/meteor/wiki/Oplog-Observe-Driver for details.

  We have also tested Meteor against the recently-released MongoDB 3.0.0.
  While we are not shipping MongoDB 3.0 with Meteor in this release (preferring
  to wait until its deployment is more widespread), we believe that Meteor
  1.0.4 apps will work fine when used with MongoDB 3.0.0 servers.

* Fix 0.8.1 regression where failure to connect to Mongo at startup would log a
  message but otherwise be ignored. Now it crashes the process, as it did before
  0.8.1.  [#3038](https://github.com/meteor/meteor/issues/3038)

* Use correct transform for allow/deny rules in `update` when different rules
  have different transforms.  [#3108](https://github.com/meteor/meteor/issues/3108)

* Provide direct access to the collection and database objects from the npm
  Mongo driver via new `rawCollection` and `rawDatabase` methods on
  `Mongo.Collection`.  [#3640](https://github.com/meteor/meteor/issues/3640)

* Observing or publishing an invalid query now throws an error instead of
  effectively hanging the server.  [#2534](https://github.com/meteor/meteor/issues/2534)


### Livequery

* If the oplog observe driver gets too far behind in processing the oplog, skip
  entries and re-poll queries instead of trying to keep up.  [#2668](https://github.com/meteor/meteor/issues/2668)

* Optimize common cases faced by the "crossbar" data structure (used by oplog
  tailing and DDP method write tracking).  [#3697](https://github.com/meteor/meteor/issues/3697)

* The oplog observe driver recovers from failed attempts to apply the modifier
  from the oplog (eg, because of empty field names).


### Minimongo

* When acting as an insert, `c.upsert({_id: 'x'}, {foo: 1})` now uses the `_id`
  of `'x'` rather than a random `_id` in the Minimongo implementation of
  `upsert`, just like it does for `c.upsert({_id: 'x'}, {$set: {foo: 1}})`.
  (The previous behavior matched a bug in the MongoDB 2.4 implementation of
  upsert that is fixed in MongoDB 2.6.)  [#2278](https://github.com/meteor/meteor/issues/2278)

* Avoid unnecessary work while paused in minimongo.

* Fix bugs related to observing queries with field filters: `changed` callbacks
  should not trigger unless a field in the filter has changed, and `changed`
  callbacks need to trigger when a parent of an included field is
  unset.  [#2254](https://github.com/meteor/meteor/issues/2254) [#3571](https://github.com/meteor/meteor/issues/3571)

* Disallow setting fields with empty names in minimongo, to match MongoDB 2.6
  semantics.


### DDP

* Subscription handles returned from `Meteor.subscribe` and
  `TemplateInstance#subscribe` now have a `subscriptionId` property to identify
  which subscription the handle is for.

* The `onError` callback to `Meteor.subscribe` has been replaced with a more
  general `onStop` callback that has an error as an optional first argument.
  The `onStop` callback is called when the subscription is terminated for
  any reason.  `onError` is still supported for backwards compatibility. [#1461](https://github.com/meteor/meteor/issues/1461)

* The return value from a server-side `Meteor.call` or `Meteor.apply` is now a
  clone of what the function returned rather than sharing mutable state.  [#3201](https://github.com/meteor/meteor/issues/3201)

* Make it easier to use the Node DDP client implementation without running a web
  server too.  [#3452](https://github.com/meteor/meteor/issues/3452)


### Blaze

* Template instances now have a `subscribe` method that functions exactly like
  `Meteor.subscribe`, but stops the subscription when the template is destroyed.
  There is a new method on Template instances called `subscriptionsReady()`
  which is a reactive function that returns true when all of the subscriptions
  made with `TemplateInstance#subscribe` are ready. There is also a built-in
  helper that returns the same thing and can be accessed with
  `Template.subscriptionsReady` inside any template.

* Add `onRendered`, `onCreated`, and `onDestroyed` methods to
  `Template`. Assignments to `Template.foo.rendered` and so forth are deprecated
  but are still supported for backwards compatibility.

* Fix bug where, when a helper or event handler was called from inside a custom
  block helper,  `Template.instance()` returned the `Template.contentBlock`
  template instead of the actual user-defined template, making it difficult to
  use `Template.instance()` for local template state.

* `Template.instance()` now works inside `Template.body`.  [#3631](https://github.com/meteor/meteor/issues/3631)

* Allow specifying attributes on `<body>` tags in templates.

* Improve performance of rendering large arrays.  [#3596](https://github.com/meteor/meteor/issues/3596)


### Isobuild

* Support `Npm.require('foo/bar')`.  [#3505](https://github.com/meteor/meteor/issues/3505) [#3526](https://github.com/meteor/meteor/issues/3526)

* In `package.js` files, `Npm.require` can only require built-in Node modules
  (and dev bundle modules, though you shouldn't depend on that), not the modules
  from its own `Npm.depends`. Previously, such code would work but only on the
  second time a `package.js` was executed.

* Ignore vim swap files in the `public` and `private` directories.  [#3322](https://github.com/meteor/meteor/issues/3322)

* Fix regression in 1.0.2 where packages might not be rebuilt when the compiler
  version changes.


### Meteor Accounts

* The `accounts-password` `Accounts.emailTemplates` can now specify arbitrary
  email `headers`.  The `from` address can now be set separately on the
  individual templates, and is a function there rather than a static
  string. [#2858](https://github.com/meteor/meteor/issues/2858) [#2854](https://github.com/meteor/meteor/issues/2854)

* Add login hooks on the client: `Accounts.onLogin` and
  `Accounts.onLoginFailure`. [#3572](https://github.com/meteor/meteor/issues/3572)

* Add a unique index to the collection that stores OAuth login configuration to
  ensure that only one configuration exists per service.  [#3514](https://github.com/meteor/meteor/issues/3514)

* On the server, a new option
  `Accounts.setPassword(user, password, { logout: false })` overrides the
  default behavior of logging out all logged-in connections for the user.  [#3846](https://github.com/meteor/meteor/issues/3846)


### Webapp

* `spiderable` now supports escaped `#!` fragments.  [#2938](https://github.com/meteor/meteor/issues/2938)

* Disable `appcache` on Firefox by default.  [#3248](https://github.com/meteor/meteor/issues/3248)

* Don't overly escape `Meteor.settings.public` and other parts of
  `__meteor_runtime_config__`.  [#3730](https://github.com/meteor/meteor/issues/3730)

* Reload the client program on `SIGHUP` or Node-specific IPC messages, not
  `SIGUSR2`.


### `meteor` command-line tool

* Enable tab-completion of global variables in `meteor shell`.  [#3227](https://github.com/meteor/meteor/issues/3227)

* Improve the stability of `meteor shell`.  [#3437](https://github.com/meteor/meteor/issues/3437) [#3595](https://github.com/meteor/meteor/issues/3595) [#3591](https://github.com/meteor/meteor/issues/3591)

* `meteor login --email` no longer takes an ignored argument.  [#3532](https://github.com/meteor/meteor/issues/3532)

* Fix regression in 1.0.2 where `meteor run --settings s` would ignore errors
  reading or parsing the settings file.  [#3757](https://github.com/meteor/meteor/issues/3757)

* Fix crash in `meteor publish` in some cases when the package is inside an
  app. [#3676](https://github.com/meteor/meteor/issues/3676)

* Fix crashes in `meteor search --show-all` and `meteor search --maintainer`.
  \#3636

* Kill PhantomJS processes after `meteor --test`, and only run the app
  once. [#3205](https://github.com/meteor/meteor/issues/3205) [#3793](https://github.com/meteor/meteor/issues/3793)

* Give a better error when Mongo fails to start up due to a full disk.  [#2378](https://github.com/meteor/meteor/issues/2378)

* After killing existing `mongod` servers, also clear the `mongod.lock` file.

* Stricter validation for package names: they cannot begin with a hyphen, end
  with a dot, contain two consecutive dots, or start or end with a colon.  (No
  packages on Atmosphere fail this validation.)  Additionally, `meteor create
  --package` applies the same validation as `meteor publish` and disallows
  packages with multiple colons.  (Packages with multiple colons like
  `local-test:iron:router` are used internally by `meteor test-packages` so that
  is not a strict validation rule.)

* `meteor create --package` now no longer creates a directory with the full
  name of the package, since Windows file systems cannot have colon characters
  in file paths. Instead, the command now creates a directory named the same
  as the second part of the package name after the colon (without the username
  prefix).


### Meteor Mobile

* Upgrade the Cordova CLI dependency from 3.5.1 to 4.2.0. See the release notes
  for the 4.x series of the Cordova CLI [on Apache
  Cordova](http://cordova.apache.org/announcements/2014/10/16/cordova-4.html).

* Related to the recently discovered [attack
  vectors](http://cordova.apache.org/announcements/2014/08/04/android-351.html)
  in Android Cordova apps, Meteor Cordova apps no longer allow access to all
  domains by default. If your app access external resources over XHR, you need
  to add them to the whitelist of allowed domains with the newly added
  [`App.accessRule`
  method](https://docs.meteor.com/#/full/App-accessRule) in your
  `mobile-config.js` file.

* Upgrade Cordova Plugins dependencies in Meteor Core packages:
  - `org.apache.cordova.file`: from 1.3.0 to 1.3.3
  - `org.apache.cordova.file-transfer`: from 0.4.4 to 0.5.0
  - `org.apache.cordova.splashscreen`: from 0.3.3 to 1.0.0
  - `org.apache.cordova.console`: from 0.2.10 to 0.2.13
  - `org.apache.cordova.device`: from 0.2.11 to 0.3.0
  - `org.apache.cordova.statusbar`: from 0.1.7 to 0.1.10
  - `org.apache.cordova.inappbrowser`: from 0.5.1 to 0.6.0
  - `org.apache.cordova.inappbrowser`: from 0.5.1 to 0.6.0

* Use the newer `ios-sim` binary, compiled with Xcode 6 on OS X Mavericks.


### Tracker

* Use `Session.set({k1: v1, k2: v2})` to set multiple values at once.


### Utilities

* Provide direct access to all options supported by the `request` npm module via
  the new server-only `npmRequestOptions` option to `HTTP.call`.  [#1703](https://github.com/meteor/meteor/issues/1703)


### Other bug fixes and improvements

* Many internal refactorings towards supporting Meteor on Windows are in this
  release.

* Remove some packages used internally to support legacy MDG systems
  (`application-configuration`, `ctl`, `ctl-helper`, `follower-livedata`,
  `dev-bundle-fetcher`, and `star-translate`).

* Provide direct access to some npm modules used by core packages on the
  `NpmModules` field of `WebAppInternals`, `MongoInternals`, and
  `HTTPInternals`.

* Upgraded dependencies:

  - node: 0.10.36 (from 0.10.33)
  - Fibers: 1.0.5 (from 1.0.1)
  - MongoDB: 2.6.7 (from 2.4.12)
  - openssl in mongo: 1.0.2 (from 1.0.1j)
  - MongoDB driver: 1.4.32 (from 1.4.1)
  - bson: 0.2.18 (from 0.2.7)
  - request: 2.53.0 (from 2.47.0)


Patches contributed by GitHub users 0a-, awatson1978, awwx, bwhitty,
christianbundy, d4nyll, dandv, DanielDent, DenisGorbachev, fay-jai, gsuess,
hwillson, jakozaur, meonkeys, mitar, netanelgilad, queso, rbabayoff, RobertLowe,
romanzolotarev, Siilwyn, and tmeasday.


## v.1.0.3.2, 2015-02-25

* Fix regression in 1.0.3 where the `meteor` tool could crash when downloading
  the second build of a given package version; for example, when running `meteor
  deploy` on an OSX or 32-bit Linux system for an app containing a binary
  package.  [#3761](https://github.com/meteor/meteor/issues/3761)


## v.1.0.3.1, 2015-01-20

* Rewrite `meteor show` and `meteor search` to show package information for
  local packages and to show if the package is installed for non-local
  packages. Introduce the `--show-all` flag, and deprecate the
  `--show-unmigrated` and `--show-old flags`.  Introduce the `--ejson` flag to
  output an EJSON object.

* Support README.md files in`meteor publish`. Take in the documentation file in
  `package.js` (set to `README.md` by default) and upload it to the server at
  publication time. Excerpt the first non-header Markdown section for use in
  `meteor show`.

* Support updates of package version metadata after that version has been
  published by running `meteor publish --update` from the package directory.

* Add `meteor test-packages --velocity` (similar to `meteor run --test`).  [#3330](https://github.com/meteor/meteor/issues/3330)

* Fix `meteor update <packageName>` to update `<packageName>` even if it's an
  indirect dependency of your app.  [#3282](https://github.com/meteor/meteor/issues/3282)

* Fix stack trace when a browser tries to use the server like a proxy.  [#1212](https://github.com/meteor/meteor/issues/1212)

* Fix inaccurate session statistics and possible multiple invocation of
  Connection.onClose callbacks.

* Switch CLI tool filesystem calls from synchronous to yielding (pro: more
  concurrency, more responsive to signals; con: could introduce concurrency
  bugs)

* Don't apply CDN prefix on Cordova. [#3278](https://github.com/meteor/meteor/issues/3278) [#3311](https://github.com/meteor/meteor/issues/3311)

* Don't try to refresh client app in the runner unless the app actually has the
  autoupdate package. [#3365](https://github.com/meteor/meteor/issues/3365)

* Fix custom release banner logic. [#3353](https://github.com/meteor/meteor/issues/3353)

* Apply HTTP followRedirects option to non-GET requests.  [#2808](https://github.com/meteor/meteor/issues/2808)

* Clean up temporary directories used by package downloads sooner.  [#3324](https://github.com/meteor/meteor/issues/3324)

* If the tool knows about the requested release but doesn't know about the build
  of its tool for the platform, refresh the catalog rather than failing
  immediately.  [#3317](https://github.com/meteor/meteor/issues/3317)

* Fix `meteor --get-ready` to not add packages to your app.

* Fix some corner cases in cleaning up app processes in the runner. Drop
  undocumented `--keepalive` support. [#3315](https://github.com/meteor/meteor/issues/3315)

* Fix CSS autoupdate when `$ROOT_URL` has a non-trivial path.  [#3111](https://github.com/meteor/meteor/issues/3111)

* Save Google OAuth idToken to the User service info object.

* Add git info to `meteor --version`.

* Correctly catch a case of illegal `Tracker.flush` during `Tracker.autorun`.  [#3037](https://github.com/meteor/meteor/issues/3037)

* Upgraded dependencies:

  - jquery: 1.11.2 (from 1.11.0)

Patches by GitHub users DanielDent, DanielDornhardt, PooMaster, Primigenus,
Tarang, TomFreudenberg, adnissen, dandv, fay-jai, knownasilya, mquandalle,
ogourment, restebanez, rissem, smallhelm and tmeasday.

## v1.0.2.1, 2014-12-22

* Fix crash in file change watcher.  [#3336](https://github.com/meteor/meteor/issues/3336)

* Allow `meteor test-packages packages/*` even if not all package directories
  have tests.  [#3334](https://github.com/meteor/meteor/issues/3334)

* Fix typo in `meteor shell` output. [#3326](https://github.com/meteor/meteor/issues/3326)


## v1.0.2, 2014-12-19

### Improvements to the `meteor` command-line tool

* A new command called `meteor shell` attaches an interactive terminal to
  an already-running server process, enabling inspection and execution of
  server-side data and code, with dynamic tab completion of variable names
  and properties. To see `meteor shell` in action, type `meteor run` in an
  app directory, then (in another terminal) type `meteor shell` in the
  same app directory. You do not have to wait for the app to start before
  typing `meteor shell`, as it will automatically connect when the server
  is ready. Note that `meteor shell` currently works for local development
  only, and is not yet supported for apps running on remote hosts.

* We've done a major internal overhaul of the `meteor` command-line tool with an
  eye to correctness, maintainability, and performance.  Some details include:
  * Refresh the package catalog for build commands only when an error
    occurs that could be fixed by a refresh, not for every build command.
  * Never run the constraint solver to select package versions more than once
    per build.
  * Built packages ("isopacks") are now cached inside individual app directories
    instead of inside their source directories.
  * `meteor run` starts Mongo in parallel with building the application.
  * The constraint solver no longer leaves a `versions.json` file in your
    packages source directories; when publishing a package that is not inside an
    app, it will leave a `.versions` file (with the same format as
    `.meteor/versions`) which you should check into source control.
  * The constraint solver's model has been simplified so that plugins must use
    the same version of packages as their surrounding package when built from
    local source.

* Using `meteor debug` no longer requires manually continuing the debugger when
  your app restarts, and it no longer overwrites the symbol `_` inside your app.

* Output from the command-line tool is now word-wrapped to the width of your
  terminal.

* Remove support for the undocumented earliestCompatibleVersion feature of the
  package system.

* Reduce CPU usage and disk I/O bandwidth by using kernel file-system change
  notification events where possible. On file systems that do not support these
  events (NFS, Vagrant Virtualbox shared folders, etc), file changes will only
  be detected every 5 seconds; to detect changes more often in these cases (but
  use more CPU), set the `METEOR_WATCH_FORCE_POLLING` environment
  variable. [#2135](https://github.com/meteor/meteor/issues/2135)

* Reduce CPU usage by fixing a check for a parent process in `meteor
  run` that was happening constantly instead of every few seconds. [#3252](https://github.com/meteor/meteor/issues/3252)

* Fix crash when two plugins defined source handlers for the same
  extension. [#3015](https://github.com/meteor/meteor/issues/3015) [#3180](https://github.com/meteor/meteor/issues/3180)

* Fix bug (introduced in 0.9.3) where the warning about using experimental
  versions of packages was printed too often.

* Fix bug (introduced in 1.0) where `meteor update --patch` crashed.

* Fix bug (introduced in 0.9.4) where banners about new releases could be
  printed too many times.

* Fix crash when a package version contained a dot-separated pre-release part
  with both digits and non-digits. [#3147](https://github.com/meteor/meteor/issues/3147)

* Corporate HTTP proxy support is now implemented using our websocket library's
  new built-in implementation instead of a custom implementation. [#2515](https://github.com/meteor/meteor/issues/2515)

### Blaze

* Add default behavior for `Template.parentData` with no arguments. This
  selects the first parent. [#2861](https://github.com/meteor/meteor/issues/2861)

* Fix `Blaze.remove` on a template's view to correctly remove the DOM
  elements when the template was inserted using
  `Blaze.renderWithData`. [#3130](https://github.com/meteor/meteor/issues/3130)

* Allow curly braces to be escaped in Spacebars. Use the special
  sequences `{{|` and `{{{|` to insert a literal `{{` or `{{{`.

### Meteor Accounts

* Allow integration with OAuth1 servers that require additional query
  parameters to be passed with the access token. [#2894](https://github.com/meteor/meteor/issues/2894)

* Expire a user's password reset and login tokens in all circumstances when
  their password is changed.

### Other bug fixes and improvements

* Some packages are no longer released as part of the core release process:
  amplify, backbone, bootstrap, d3, jquery-history, and jquery-layout. This
  means that new versions of these packages can be published outside of the full
  Meteor release cycle.

* Require plain objects as the update parameter when doing replacements
  in server-side collections.

* Fix audit-argument-checks spurious failure when an argument is NaN. [#2914](https://github.com/meteor/meteor/issues/2914)

### Upgraded dependencies

  - node: 0.10.33 (from 0.10.29)
  - source-map-support: 0.2.8 (from 0.2.5)
  - semver: 4.1.0 (from 2.2.1)
  - request: 2.47.0 (from 2.33.0)
  - tar: 1.0.2 (from 1.0.1)
  - source-map: 0.1.40 (from 0.1.32)
  - sqlite3: 3.0.2 (from 3.0.0)
  - phantomjs npm module: 1.9.12 (from 1.8.1-1)
  - http-proxy: 1.6.0 (from a fork of 1.0.2)
  - esprima: 1.2.2 (from an unreleased 1.1-era commit)
  - escope: 1.0.1 (from 1.0.0)
  - openssl in mongo: 1.0.1j (from 1.0.1g)
  - faye-websocket: 0.8.1 (from using websocket-driver instead)
  - MongoDB: 2.4.12 (from 2.4.9)


Patches by GitHub users andylash, anstarovoyt, benweissmann, chrisbridgett,
colllin, dandv, ecwyne, graemian, JamesLefrere, kevinchiu, LyuGGang, matteodem,
mitar, mquandalle, musically-ut, ograycode, pcjpcj2, physiocoder, rgoomar,
timhaines, trusktr, Urigo, and zol.


## v1.0.1, 2014-12-09

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.


## v1.0, 2014-10-28

### New Features

* Add the `meteor admin get-machine` command to make it easier to
  publish packages with binary dependencies for all
  architectures. `meteor publish` no longer publishes builds
  automatically if your package has binary NPM dependencies.

* New `localmarket` example, highlighting Meteor's support for mobile
  app development.

* Restyle the `leaderboard` example, and optimize it for both desktop
  and mobile.

### Performance

* Reduce unnecessary syncs with the package server, which speeds up
  startup times for many commands.

* Speed up `meteor deploy` by not bundling unnecessary files and
  programs.

* To make Meteor easier to use on slow or unreliable network
  connections, increase timeouts for DDP connections that the Meteor
  tool uses to communicate with the package server. [#2777](https://github.com/meteor/meteor/issues/2777), [#2789](https://github.com/meteor/meteor/issues/2789).

### Mobile App Support

* Implemented reasonable default behavior for launch screens on mobile
  apps.

* Don't build for Android when only the iOS build is required, and
  vice versa.

* Fix bug that could cause mobile apps to stop being able to receive hot
  code push updates.

* Fix bug where Cordova clients connected to http://example.com instead
  of https://example.com when https:// was specified in the
  --mobile-server option. [#2880](https://github.com/meteor/meteor/issues/2880)

* Fix stack traces when attempting to build or run iOS apps on Linux.

* Print a warning when building an app with mobile platforms and
  outputting the build into the source tree. Outputting a build into the
  source tree can cause subsequent builds to fail because they will
  treat the build output as source files.

* Exit from `meteor run` when new Cordova plugins or platforms are
  added, since we don't support hot code push for new plugins or
  platforms.

* Fix quoting of arguments to Cordova plugins.

* The `accounts-twitter` package now works in Cordova apps in local
  development. For workarounds for other login providers in local
  development mode, see
  https://github.com/meteor/meteor/wiki/OAuth-for-mobile-Meteor-clients.

### Packaging

* `meteor publish-for-arch` can publish packages built with different Meteor
  releases.

* Fix default `api.versionsFrom` field in packages created with `meteor
  create --package`.

* Fix bug where changes in an app's .meteor/versions file would not
  cause the app to be rebuilt.

### Other bug fixes and improvements

* Use TLSv1 in the `spiderable` package, for compatibility with servers
  that have disabled SSLv3 in response to the POODLE bug.

* Work around the `meteor run` proxy occasionally running out of sockets.

* Fix bug with regular expressions in minimongo. [#2817](https://github.com/meteor/meteor/issues/2817)

* Add READMEs for several core packages.

* Include protocols in URLs printed by `meteor deploy`.

* Improve error message for limited ordered observe. [#1643](https://github.com/meteor/meteor/issues/1643)

* Fix missing dependency on `random` in the `autoupdate` package. [#2892](https://github.com/meteor/meteor/issues/2892)

* Fix bug where all CSS would be removed from connected clients if a
  CSS-only change is made between local development server restarts or
  when deploying with `meteor deploy`.

* Increase height of the Google OAuth popup to the Google-recommended
  value.

* Fix the layout of the OAuth configuration dialog when used with
  Bootstrap.

* Allow build plugins to override the 'bare' option on added source
  files. [#2834](https://github.com/meteor/meteor/issues/2834)

Patches by GitHub users DenisGorbachev, ecwyne, mitar, mquandalle,
Primigenus, svda, yauh, and zol.


## v0.9.4.1, 2014-12-09 (backport)

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.
  Backport from 1.0.1.


## v0.9.4, 2014-10-13

### New Features

* The new `meteor debug` command and `--debug-port` command line option
  to `meteor run` allow you to easily use node-inspector to debug your
  server-side code. Add a `debugger` statement to your code to create a
  breakpoint.

* Add new a `meteor run --test` command that runs
  [Velocity](https://github.com/meteor-velocity/velocity) tests in your
  app .

* Add new callbacks `Accounts.onResetPasswordLink`,
  `Accounts.onEnrollmentLink`, and `Accounts.onEmailVerificationLink`
  that make it easier to build custom user interfaces on top of the
  accounts system. These callbacks should be registered before
  `Meteor.startup` fires, and will be called if the URL matches a link
  in an email sent by `Accounts.resetPassword`, etc. See
  https://docs.meteor.com/#Accounts-onResetPasswordLink.

* A new configuration file for mobile apps,
  `<APP>/mobile-config.js`. This allows you to set app metadata, icons,
  splash screens, preferences, and PhoneGap/Cordova plugin settings
  without needing a `cordova_build_override` directory. See
  https://docs.meteor.com/#mobileconfigjs.


### API Changes

* Rename `{{> UI.dynamic}}` to `{{> Template.dynamic}}`, and likewise
  with `UI.contentBlock` and `UI.elseBlock`. The UI namespace is no
  longer used anywhere except for backwards compatibility.

* Deprecate the `Template.someTemplate.myHelper = ...` syntax in favor
  of `Template.someTemplate.helpers(...)`.  Using the older syntax still
  works, but prints a deprecation warning to the console.

* `Package.registerBuildPlugin` its associated functions have been added
  to the public API, cleaned up, and documented. The new function is
  identical to the earlier _transitional_registerBuildPlugin except for
  minor backwards-compatible API changes. See
  https://docs.meteor.com/#Package-registerBuildPlugin

* Rename the `showdown` package to `markdown`.

* Deprecate the `amplify`, `backbone`, `bootstrap`, and `d3` integration
  packages in favor of community alternatives.  These packages will no
  longer be maintained by MDG.


### Tool Changes

* Improved output from `meteor build` to make it easier to publish
  mobile apps to the App Store and Play Store. See the wiki pages for
  instructions on how to publish your
  [iOS](https://github.com/meteor/meteor/wiki/How-to-submit-your-iOS-app-to-App-Store)
  and
  [Android](https://github.com/meteor/meteor/wiki/How-to-submit-your-Android-app-to-Play-Store)
  apps.

* Packages can now be marked as debug-mode only by adding `debugOnly:
  true` to `Package.describe`. Debug-only packages are not included in
  the app when it is bundled for production (`meteor build` or `meteor
  run --production`). This allows package authors to build packages
  specifically for testing and debugging without increasing the size of
  the resulting app bundle or causing apps to ship with debug
  functionality built in.

* Rework the process for installing mobile development SDKs. There is
  now a `meteor install-sdk` command that automatically install what
  software it can and points to documentation for the parts that
  require manual installation.

* The `.meteor/cordova-platforms` file has been renamed to
  `.meteor/platforms` and now includes the default `server` and
  `browser` platforms. The default platforms can't currently be removed
  from a project, though this will be possible in the future. The old
  file will be automatically migrated to the new one when the app is run
  with Meteor 0.9.4 or above.

* The `unipackage.json` file inside downloaded packages has been renamed
  to `isopack.json` and has an improved forwards-compatible format. To
  maintain backwards compatibility with previous releases, packages will
  be built with both files.

* The local package metadata cache now uses SQLite, which is much faster
  than the previous implementation. This improves `meteor` command line
  tool startup time.

* The constraint solver used by the client to find compatible versions
  of packages is now much faster.

* The `--port` option to `meteor run` now requires a numeric port
  (e.g. `meteor run --port example.com` is no longer valid).

* The `--mobile-port` option `meteor run` has been reworked. The option
  is now `--mobile-server` in `meteor run` and `--server` in `meteor
  build`. `--server` is required for `meteor build` in apps with mobile
  platforms installed. `--mobile-server` defaults to an automatically
  detected IP address on port 3000, and `--server` requires a hostname
  but defaults to port 80 if a port is not specified.

* Operations that take longer than a few seconds (e.g. downloading
  packages, installing the Android SDK, etc) now show a progress bar.

* Complete support for using an HTTP proxy in the `meteor` command line
  tool. Now all DDP connections can work through a proxy.  Use the standard
  `http_proxy` environment variable to specify your proxy endpoint.  [#2515](https://github.com/meteor/meteor/issues/2515)


### Bug Fixes

* Fix behavior of ROOT_URL with path ending in `/`.

* Fix source maps when using a ROOT_URL with a path. [#2627](https://github.com/meteor/meteor/issues/2627)

* Change the mechanism that the Meteor tool uses to clean up app server
  processes. The new mechanism is more resilient to slow app bundles and
  other CPU-intensive tasks. [#2536](https://github.com/meteor/meteor/issues/2536), [#2588](https://github.com/meteor/meteor/issues/2588).


Patches by GitHub users cryptoquick, Gaelan, jperl, meonkeys, mitar,
mquandalle, prapicault, pscanf, richguan, rick-golden-healthagen,
rissem, rosh93, rzymek, and timoabend


## v0.9.3.1, 2014-09-30

* Don't crash when failing to contact the package server. [#2713](https://github.com/meteor/meteor/issues/2713)

* Allow more than one dash in package versions. [#2715](https://github.com/meteor/meteor/issues/2715)


## v0.9.3, 2014-09-25

### More Package Version Number Flexibility

* Packages now support relying on multiple major versions of their
  dependencies (eg `blaze@1.0.0 || 2.0.0`). Additionally, you can now
  call `api.versionsFrom(<release>)` multiple times, or with an array
  (eg `api.versionsFrom([<release1>, <release2>])`. Meteor will
  interpret this to mean that the package will work with packages from
  all the listed releases.

* Support for "wrapped package" version numbers. There is now a `_` field
  in version numbers. The `_` field must be an integer, and versions with
  the `_` are sorted after versions without. This allows using the
  upstream version number as the Meteor package version number and being
  able to publish multiple version of the Meteor package (e.g.
  `jquery@1.11.1_2`).

Note: packages using the `||` operator or the `_` symbol in their
versions or dependencies will be invisible to pre-0.9.3 users. Meteor
versions 0.9.2 and before do not understand the new version formats and
will not be able to use versions of packages that use the new features.


### Other Command-line Tool Improvements

* More detailed constraint solver output. Meteor now tells you which
  constraints prevent upgrading or adding new packages. This will make
  it much easier to update your app to new versions.

* Better handling of pre-release versions (e.g. versions with
  `-`). Pre-release packages will now be included in an app if and only
  if there is no way to meet the app's constraints without using a
  pre-release package.

* Add `meteor admin set-unmigrated` to allow maintainers to hide
  pre-0.9.0 packages in `meteor search` and `meteor show`. This will not
  stop users from continuing to use the package, but it helps prevent
  new users from finding old non-functional packages.

* Progress bars for time-intensive operations, like downloading large
  packages.


### Other Changes

* Offically support `Meteor.wrapAsync` (renamed from
  `Meteor._wrapAsync`). Additionally, `Meteor.wrapAsync` now lets you
  pass an object to bind as `this` in the wrapped call. See
  https://docs.meteor.com/#meteor_wrapasync.

* The `reactive-dict` package now allows an optional name argument to
  enable data persistence during hot code push.


Patches by GitHub users evliu, meonkeys, mitar, mizzao, mquandalle,
prapicault, waitingkuo, wulfmeister.



## v0.9.2.2, 2014-09-17

* Fix regression in 0.9.2 that prevented some users from accessing the
  Meteor development server in their browser. Specifically, 0.9.2
  unintentionally changed the development mode server's default bind
  host to localhost instead of 0.0.0.0. [#2596](https://github.com/meteor/meteor/issues/2596)


## v0.9.2.1, 2014-09-15

* Fix versions of packages that were published with `-cordova` versions
  in 0.9.2 (appcache, fastclick, htmljs, logging, mobile-status-bar,
  routepolicy, webapp-hashing).


## v0.9.2, 2014-09-15

This release contains our first support for building mobile apps in
Meteor, for both iOS and Android. This support comes via an
integration with Apache's Cordova/PhoneGap project.

  * You can use Cordova/PhoneGap packages in your application or inside
    a Meteor package to access a device's native functions directly from
    JavaScript code.
  * The `meteor add-platform` and `meteor run` commands now let you
    launch the app in the iOS or Android simulator or run it on an
    attached hardware device.
  * This release extends hot code push to support live updates into
    installed native apps.
  * The `meteor bundle` command has been renamed to `meteor build` and
    now outputs build projects for the mobile version of the targeted
    app.
  * See
    https://github.com/meteor/meteor/wiki/Meteor-Cordova-Phonegap-integration
    for more information about how to get started building mobile apps
    with Meteor.

* Better mobile support for OAuth login: you can now use a
  redirect-based flow inside UIWebViews, and the existing popup-based
  flow has been adapted to work in Cordova/PhoneGap apps.

#### Bug fixes and minor improvements

* Fix sorting on non-trivial keys in Minimongo. [#2439](https://github.com/meteor/meteor/issues/2439)

* Bug fixes and performance improvements for the package system's
  constraint solver.

* Improved error reporting for misbehaving oplog observe driver. [#2033](https://github.com/meteor/meteor/issues/2033) [#2244](https://github.com/meteor/meteor/issues/2244)

* Drop deprecated source map linking format used for older versions of
  Firefox.  [#2385](https://github.com/meteor/meteor/issues/2385)

* Allow Meteor tool to run from a symlink. [#2462](https://github.com/meteor/meteor/issues/2462)

* Assets added via a plugin are no longer considered source files. [#2488](https://github.com/meteor/meteor/issues/2488)

* Remove support for long deprecated `SERVER_ID` environment
  variable. Use `AUTOUPDATE_VERSION` instead.

* Fix bug in reload-safetybelt package that resulted in reload loops in
  Chrome with cookies disabled.

* Change the paths for static assets served from packages. The `:`
  character is replaced with the `_` character in package names so as to
  allow serving on mobile devices and ease operation on Windows. For
  example, assets from the `abc:bootstrap` package are now served at
  `/packages/abc_bootstrap` instead of `/packages/abc:bootstrap`.

* Also change the paths within a bundled Meteor app to allow for
  different client architectures (eg mobile). For example,
  `bundle/programs/client` is now `bundle/programs/web.browser`.


Patches by GitHub users awwx, mizzao, and mquandalle.



## v0.9.1.1, 2014-09-06

* Fix backwards compatibility for packages that had weak dependencies
  on packages renamed in 0.9.1 (`ui`, `deps`, `livedata`). [#2521](https://github.com/meteor/meteor/issues/2521)

* Fix error when using the `reactive-dict` package without the `mongo`
  package.


## v0.9.1, 2014-09-04

#### Organizations in Meteor developer accounts

Meteor 0.9.1 ships with organizations support in Meteor developer
accounts. Organizations are teams of users that make it easy to
collaborate on apps and packages.

Create an organization at
https://www.meteor.com/account-settings/organizations. Run the `meteor
authorized` command in your terminal to give an organization
permissions to your apps. To add an organization as a maintainer of
your packages, use the `meteor admin maintainers` command. You can
also publish packages with an organization's name in the package name
prefix instead of your own username.


#### One backwards incompatible change for templates

* Templates can no longer be named "body" or "instance".

#### Backwards compatible Blaze API changes

* New public and documented APIs:
  * `Blaze.toHTMLWithData()`
  * `Template.currentData()`
  * `Blaze.getView()`
  * `Template.parentData()` (previously `UI._parentData()`)
  * `Template.instance()` (previously `UI._templateInstance()`)
  * `Template.body` (previously `UI.body`)
  * `new Template` (previously `Template.__create__`)
  * `Blaze.getData()` (previously `UI.getElementData`, or `Blaze.getCurrentData` with no arguments)

* Deprecate the `ui` package. Instead, use the `blaze` package. The
  `UI` and `Blaze` symbols are now the same.

* Deprecate `UI.insert`. `UI.render` and `UI.renderWithData` now
  render a template and place it in the DOM.

* Add an underscore to some undocumented Blaze APIs to make them
  internal. Notably: `Blaze._materializeView`, `Blaze._createView`,
  `Blaze._toText`, `Blaze._destroyView`, `Blaze._destroyNode`,
  `Blaze._withCurrentView`, `Blaze._DOMBackend`,
  `Blaze._TemplateWith`

* Document Views. Views are the machinery powering DOM updates in
  Blaze.

* Expose `view` property on template instances.

#### Backwards compatible renames

* Package renames
  * `livedata` -> `ddp`
  * `mongo-livedata` -> `mongo`
  * `standard-app-packages` -> `meteor-platform`
* Symbol renames
  * `Meteor.Collection` -> `Mongo.Collection`
  * `Meteor.Collection.Cursor` -> `Mongo.Cursor`
  * `Meteor.Collection.ObjectID` -> `Mongo.ObjectID`
  * `Deps` -> `Tracker`

#### Other

* Add `reactive-var` package. Lets you define a single reactive
  variable, like a single key in `Session`.

* Don't throw an exception in Chrome when cookies and local storage
  are blocked.

* Bump DDP version to "1". Clients connecting with version "pre1" or
  "pre2" should still work.

* Allow query parameters in OAuth1 URLs. [#2404](https://github.com/meteor/meteor/issues/2404)

* Fix `meteor list` if not all packages on server. Fixes [#2468](https://github.com/meteor/meteor/issues/2468)

Patch by GitHub user mitar.


## v0.9.0.1, 2014-08-27

* Fix issues preventing hot code reload from automatically reloading webapps in
  two cases: when the old app was a pre-0.9.0 app, and when the app used
  appcache. (In both cases, an explicit reload still worked.)

* Fix publishing packages containing a plugin with platform-specific code but
  no platform-specific code in the main package.

* Fix `meteor add package@version` when the package was already added with a
  different version constraint.

* Improve treatment of pre-release packages (packages with a dash in their
  version). Guarantee that they will not be chosen by the constraint solver
  unless explicitly requested.  `meteor list` won't suggest that you update to
  them.

* Fix slow spiderable executions.

* Fix dev-mode client-only restart when client files changed very soon after
  server restart.

* Fix stack trace on `meteor add` constraint solver failure.

* Fix "access-denied" stack trace when publishing packages.


## v0.9.0, 2014-08-26

Meteor 0.9.0 introduces the Meteor Package Server. Incorporating lessons from
our community's Meteorite tool, Meteor 0.9.0 allows users to develop and publish
Meteor packages to a central repository. The `meteor publish` command is used to
publish packages. Non-core packages can now be added with `meteor add`, and you
can specify version constraints on the packages you use. Binary packages can be
published for additional architectures with `meteor publish-for-arch`, which
allows cross-platform deploys and bundling.  You can search for packages with
`meteor search` and display information on them with `meteor show`, or you can
use the Atmosphere web interface developed by Percolate Studio at
https://atmospherejs.com/

See https://docs.meteor.com/#writingpackages and
https://docs.meteor.com/#packagejs for more details.

Other packaging-related changes:

* `meteor list` now lists the packages your app is using, which was formerly the
  behavior of `meteor list --using`. To search for packages you are not
  currently using, use `meteor search`.  The concept of an "internal" package
  (which did not show up in `meteor list`) no longer exists.

* To prepare a bundle created with `meteor bundle` for execution on a
  server, you now run `npm install` with no arguments instead of having
  to specify a few specific npm modules and their versions
  explicitly. See the README in the generated bundle for more details.

* All `under_score`-style `package.js` APIs (`Package.on_use`, `api.add_files`,
  etc) have been replaced with `camelCase` names (`Package.onUse`,
  `api.addFiles`, etc).  The old names continue to work for now.

* There's a new `archMatching` option to `Plugin.registerSourceHandler`, which
  should be used by any plugin whose output is only for the client or only for
  the server (eg, CSS and HTML templating packages); this allows Meteor to avoid
  restarting the server when files processed by these plugins change.

Other changes:

* When running your app with the local development server, changes that only
  affect the client no longer require restarting the server.  Changes that only
  affect CSS no longer require the browser to refresh the page, both in local
  development and in some production environments.  [#490](https://github.com/meteor/meteor/issues/490)

* When a call to `match` fails in a method or subscription, log the
  failure on the server. (This matches the behavior described in our docs)

* The `appcache` package now defaults to functioning on all browsers
  that support the AppCache API, rather than a whitelist of browsers.
  The main effect of this change is that `appcache` is now enabled by
  default on Firefox, because Firefox no longer makes a confusing
  popup. You can still disable individual browsers with
  `AppCache.config`.  [#2241](https://github.com/meteor/meteor/issues/2241)

* The `forceApprovalPrompt` option can now be specified in `Accounts.ui.config`
  in addition to `Meteor.loginWithGoogle`.  [#2149](https://github.com/meteor/meteor/issues/2149)

* Don't leak websocket clients in server-to-server DDP in some cases (and fix
  "Got open from inactive client"
  error). https://github.com/faye/websocket-driver-node/pull/8

* Updated OAuth url for login with Meetup.

* Allow minimongo `changed` callbacks to mutate their `oldDocument`
  argument. [#2231](https://github.com/meteor/meteor/issues/2231)

* Fix upsert called from client with no callback.  [#2413](https://github.com/meteor/meteor/issues/2413)

* Avoid a few harmless exceptions in OplogObserveDriver.

* Refactor `observe-sequence` package.

* Fix `spiderable` race condition.

* Re-apply our fix of NPM bug https://github.com/npm/npm/issues/3265 which got
  accidentally reverted upstream.

* Workaround for a crash in recent Safari
  versions. https://github.com/meteor/meteor/commit/e897539adb

* Upgraded dependencies:
  - less: 1.7.4 (from 1.7.1)
  - tar: 1.0.1 (from 0.1.19)
  - fstream: 1.0.2 (from 0.1.25)

Patches by GitHub users Cangit, dandv, ImtiazMajeed, MaximDubrovin, mitar,
mquandalle, rcy, RichardLitt, thatneat, and twhy.


## v0.8.3.1, 2014-12-09 (backport)

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.
  Backport from 1.0.1.


## v0.8.3, 2014-07-29

#### Blaze

* Refactor Blaze to simplify internals while preserving the public
  API. `UI.Component` has been replaced with `Blaze.View.`

* Fix performance issues and memory leaks concerning event handlers.

* Add `UI.remove`, which removes a template after `UI.render`/`UI.insert`.

* Add `this.autorun` to the template instance, which is like `Deps.autorun`
  but is automatically stopped when the template is destroyed.

* Create `<a>` tags as SVG elements when they have `xlink:href`
  attributes. (Previously, `<a>` tags inside SVGs were never created as
  SVG elements.)  [#2178](https://github.com/meteor/meteor/issues/2178)

* Throw an error in `{{foo bar}}` if `foo` is missing or not a function.

* Cursors returned from template helpers for #each should implement
  the `observeChanges` method and don't have to be Minimongo cursors
  (allowing new custom data stores for Blaze like Miniredis).

* Remove warnings when {{#each}} iterates over a list of strings,
  numbers, or other items that contains duplicates.  [#1980](https://github.com/meteor/meteor/issues/1980)

#### Meteor Accounts

* Fix regression in 0.8.2 where an exception would be thrown if
  `Meteor.loginWithPassword` didn't have a callback. Callbacks to
  `Meteor.loginWithPassword` are now optional again.  [#2255](https://github.com/meteor/meteor/issues/2255)

* Fix OAuth popup flow in mobile apps that don't support
  `window.opener`.  [#2302](https://github.com/meteor/meteor/issues/2302)

* Fix "Email already exists" error with MongoDB 2.6.  [#2238](https://github.com/meteor/meteor/issues/2238)


#### mongo-livedata and minimongo

* Fix performance issue where a large batch of oplog updates could block
  the node event loop for long periods.  [#2299](https://github.com/meteor/meteor/issues/2299).

* Fix oplog bug resulting in error message "Buffer inexplicably empty".  [#2274](https://github.com/meteor/meteor/issues/2274)

* Fix regression from 0.8.2 that caused collections to appear empty in
  reactive `findOne()` or `fetch` queries that run before a mutator
  returns.  [#2275](https://github.com/meteor/meteor/issues/2275)


#### Miscellaneous

* Stop including code by default that automatically refreshes the page
  if JavaScript and CSS don't load correctly. While this code is useful
  in some multi-server deployments, it can cause infinite refresh loops
  if there are errors on the page. Add the `reload-safetybelt` package
  to your app if you want to include this code.

* On the server, `Meteor.startup(c)` now calls `c` immediately if the
  server has already started up, matching the client behavior.  [#2239](https://github.com/meteor/meteor/issues/2239)

* Add support for server-side source maps when debugging with
  `node-inspector`.

* Add `WebAppInternals.addStaticJs()` for adding static JavaScript code
  to be served in the app, inline if allowed by `browser-policy`.

* Make the `tinytest/run` method return immediately, so that `wait`
  method calls from client tests don't block on server tests completing.

* Log errors from method invocations on the client if there is no
  callback provided.

* Upgraded dependencies:
  - node: 0.10.29 (from 0.10.28)
  - less: 1.7.1 (from 1.6.1)

Patches contributed by GitHub users Cangit, cmather, duckspeaker, zol.


## v0.8.2, 2014-06-23

#### Meteor Accounts

* Switch `accounts-password` to use bcrypt to store passwords on the
  server. (Previous versions of Meteor used a protocol called SRP.)
  Users will be transparently transitioned when they log in. This
  transition is one-way, so you cannot downgrade a production app once
  you upgrade to 0.8.2. If you are maintaining an authenticating DDP
  client:
     - Clients that use the plaintext password login handler (i.e. call
       the `login` method with argument `{ password: <plaintext
       password> }`) will continue to work, but users will not be
       transitioned from SRP to bcrypt when logging in with this login
       handler.
     - Clients that use SRP will no longer work. These clients should
       instead directly call the `login` method, as in
       `Meteor.loginWithPassword`. The argument to the `login` method
       can be either:
         - `{ password: <plaintext password> }`, or
         - `{ password: { digest: <password hash>, algorithm: "sha-256" } }`,
           where the password hash is the hex-encoded SHA256 hash of the
           plaintext password.

* Show the display name of the currently logged-in user after following
  an email verification link or a password reset link in `accounts-ui`.

* Add a `userEmail` option to `Meteor.loginWithMeteorDeveloperAccount`
  to pre-fill the user's email address in the OAuth popup.

* Ensure that the user object has updated token information before
  it is passed to email template functions. [#2210](https://github.com/meteor/meteor/issues/2210)

* Export the function that serves the HTTP response at the end of an
  OAuth flow as `OAuth._endOfLoginResponse`. This function can be
  overridden to make the OAuth popup flow work in certain mobile
  environments where `window.opener` is not supported.

* Remove support for OAuth redirect URLs with a `redirect` query
  parameter. This OAuth flow was never documented and never fully
  worked.


#### Blaze

* Blaze now tracks individual CSS rules in `style` attributes and won't
  overwrite changes to them made by other JavaScript libraries.

* Add `{{> UI.dynamic}}` to make it easier to dynamically render a
  template with a data context.

* Add `UI._templateInstance()` for accessing the current template
  instance from within a block helper.

* Add `UI._parentData(n)` for accessing parent data contexts from
  within a block helper.

* Add preliminary API for registering hooks to run when Blaze intends to
  insert, move, or remove DOM elements. For example, you can use these
  hooks to animate nodes as they are inserted, moved, or removed. To use
  them, you can set the `_uihooks` property on a container DOM
  element. `_uihooks` is an object that can have any subset of the
  following three properties:

    - `insertElement: function (node, next)`: called when Blaze intends
      to insert the DOM element `node` before the element `next`
    - `moveElement: function (node, next)`: called when Blaze intends to
      move the DOM element `node` before the element `next`
    - `removeElement: function (node)`: called when Blaze intends to
      remove the DOM element `node`

    Note that when you set one of these functions on a container
    element, Blaze will not do the actual operation; it's your
    responsibility to actually insert, move, or remove the node (by
    calling `$(node).remove()`, for example).

* The `findAll` method on template instances now returns a vanilla
  array, not a jQuery object. The `$` method continues to
  return a jQuery object. [#2039](https://github.com/meteor/meteor/issues/2039)

* Fix a Blaze memory leak by cleaning up event handlers when a template
  instance is destroyed. [#1997](https://github.com/meteor/meteor/issues/1997)

* Fix a bug where helpers used by {{#with}} were still re-running when
  their reactive data sources changed after they had been removed from
  the DOM.

* Stop not updating form controls if they're focused. If a field is
  edited by one user while another user is focused on it, it will just
  lose its value but maintain its focus. [#1965](https://github.com/meteor/meteor/issues/1965)

* Add `_nestInCurrentComputation` option to `UI.render`, fixing a bug in
  {{#each}} when an item is added inside a computation that subsequently
  gets invalidated. [#2156](https://github.com/meteor/meteor/issues/2156)

* Fix bug where "=" was not allowed in helper arguments. [#2157](https://github.com/meteor/meteor/issues/2157)

* Fix bug when a template tag immediately follows a Spacebars block
  comment. [#2175](https://github.com/meteor/meteor/issues/2175)


#### Command-line tool

* Add --directory flag to `meteor bundle`. Setting this flag outputs a
  directory rather than a tarball.

* Speed up updates of NPM modules by upgrading Node to include our fix for
  https://github.com/npm/npm/issues/3265 instead of passing `--force` to
  `npm install`.

* Always rebuild on changes to npm-shrinkwrap.json files.  [#1648](https://github.com/meteor/meteor/issues/1648)

* Fix uninformative error message when deploying to long hostnames. [#1208](https://github.com/meteor/meteor/issues/1208)

* Increase a buffer size to avoid failing when running MongoDB due to a
  large number of processes running on the machine, and fix the error
  message when the failure does occur. [#2158](https://github.com/meteor/meteor/issues/2158)

* Clarify a `meteor mongo` error message when using the MONGO_URL
  environment variable. [#1256](https://github.com/meteor/meteor/issues/1256)


#### Testing

* Run server tests from multiple clients serially instead of in
  parallel. This allows testing features that modify global server
  state.  [#2088](https://github.com/meteor/meteor/issues/2088)


#### Security

* Add Content-Type headers on JavaScript and CSS resources.

* Add `X-Content-Type-Options: nosniff` header to
  `browser-policy-content`'s default policy. If you are using
  `browser-policy-content` and you don't want your app to send this
  header, then call `BrowserPolicy.content.allowContentTypeSniffing()`.

* Use `Meteor.absoluteUrl()` to compute the redirect URL in the `force-ssl`
  package (instead of the host header).


#### Miscellaneous

* Allow `check` to work on the server outside of a Fiber. [#2136](https://github.com/meteor/meteor/issues/2136)

* EJSON custom type conversion functions should not be permitted to yield. [#2136](https://github.com/meteor/meteor/issues/2136)

* The legacy polling observe driver handles errors communicating with MongoDB
  better and no longer gets "stuck" in some circumstances.

* Automatically rewind cursors before calls to `fetch`, `forEach`, or `map`. On
  the client, don't cache the return value of `cursor.count()` (consistently
  with the server behavior). `cursor.rewind()` is now a no-op. [#2114](https://github.com/meteor/meteor/issues/2114)

* Remove an obsolete hack in reporting line numbers for LESS errors. [#2216](https://github.com/meteor/meteor/issues/2216)

* Avoid exceptions when accessing localStorage in certain Internet
  Explorer configurations. [#1291](https://github.com/meteor/meteor/issues/1291), [#1688](https://github.com/meteor/meteor/issues/1688).

* Make `handle.ready()` reactively stop, where `handle` is a
  subscription handle.

* Fix an error message from `audit-argument-checks` after login.

* Make the DDP server send an error if the client sends a connect
  message with a missing or malformed `support` field. [#2125](https://github.com/meteor/meteor/issues/2125)

* Fix missing `jquery` dependency in the `amplify` package. [#2113](https://github.com/meteor/meteor/issues/2113)

* Ban inserting EJSON custom types as documents. [#2095](https://github.com/meteor/meteor/issues/2095)

* Fix incorrect URL rewrites in stylesheets. [#2106](https://github.com/meteor/meteor/issues/2106)

* Upgraded dependencies:
  - node: 0.10.28 (from 0.10.26)
  - uglify-js: 2.4.13 (from 2.4.7)
  - sockjs server: 0.3.9 (from 0.3.8)
  - websocket-driver: 0.3.4 (from 0.3.2)
  - stylus: 0.46.3 (from 0.42.3)

Patches contributed by GitHub users awwx, babenzele, Cangit, dandv,
ducdigital, emgee3, felixrabe, FredericoC, jbruni, kentonv, mizzao,
mquandalle, subhog, tbjers, tmeasday.


## v0.8.1.3, 2014-05-22

* Fix a security issue in the `spiderable` package. `spiderable` now
  uses the ROOT_URL environment variable instead of the Host header to
  determine which page to snapshot.

* Fix hardcoded Twitter URL in `oauth1` package. This fixes a regression
  in 0.8.0.1 that broke Atmosphere packages that do OAuth1
  logins. [#2154](https://github.com/meteor/meteor/issues/2154).

* Add `credentialSecret` argument to `Google.retrieveCredential`, which
  was forgotten in a previous release.

* Remove nonexistent `-a` and `-r` aliases for `--add` and `--remove` in
  `meteor help authorized`. [#2155](https://github.com/meteor/meteor/issues/2155)

* Add missing `underscore` dependency in the `oauth-encryption` package. [#2165](https://github.com/meteor/meteor/issues/2165)

* Work around IE8 bug that caused some apps to fail to render when
  minified. [#2037](https://github.com/meteor/meteor/issues/2037).


## v0.8.1.2, 2014-05-12

* Fix memory leak (introduced in 0.8.1) by making sure to unregister
  sessions at the server when they are closed due to heartbeat timeout.

* Add `credentialSecret` argument to `Google.retrieveCredential`,
  `Facebook.retrieveCredential`, etc., which is needed to use them as of
  0.8.1. [#2118](https://github.com/meteor/meteor/issues/2118)

* Fix 0.8.1 regression that broke apps using a `ROOT_URL` with a path
  prefix. [#2109](https://github.com/meteor/meteor/issues/2109)


## v0.8.1.1, 2014-05-01

* Fix 0.8.1 regression preventing clients from specifying `_id` on insert. [#2097](https://github.com/meteor/meteor/issues/2097)

* Fix handling of malformed URLs when merging CSS files. [#2103](https://github.com/meteor/meteor/issues/2103), [#2093](https://github.com/meteor/meteor/issues/2093)

* Loosen the checks on the `options` argument to `Collection.find` to
  allow undefined values.


## v0.8.1, 2014-04-30

#### Meteor Accounts

* Fix a security flaw in OAuth1 and OAuth2 implementations. If you are
  using any OAuth accounts packages (such as `accounts-google` or
  `accounts-twitter`), we recommend that you update immediately and log
  out your users' current sessions with the following MongoDB command:

    $ db.users.update({}, { $set: { 'services.resume.loginTokens': [] } }, { multi: true });

* OAuth redirect URLs are now required to be on the same origin as your app.

* Log out a user's other sessions when they change their password.

* Store pending OAuth login results in the database instead of
  in-memory, so that an OAuth flow succeeds even if different requests
  go to different server processes.

* When validateLoginAttempt callbacks return false, don't override a more
  specific error message.

* Add `Random.secret()` for generating security-critical secrets like
  login tokens.

* `Meteor.logoutOtherClients` now calls the user callback when other
  login tokens have actually been removed from the database, not when
  they have been marked for eventual removal.  [#1915](https://github.com/meteor/meteor/issues/1915)

* Rename `Oauth` to `OAuth`.  `Oauth` is now an alias for backwards
  compatibility.

* Add `oauth-encryption` package for encrypting sensitive account
  credentials in the database.

* A validate login hook can now override the exception thrown from
  `beginPasswordExchange` like it can for other login methods.

* Remove an expensive observe over all users in the `accounts-base`
  package.


#### Blaze

* Disallow `javascript:` URLs in URL attribute values by default, to
  help prevent cross-site scripting bugs. Call
  `UI._allowJavascriptUrls()` to allow them.

* Fix `UI.toHTML` on templates containing `{{#with}}`.

* Fix `{{#with}}` over a data context that is mutated.  [#2046](https://github.com/meteor/meteor/issues/2046)

* Clean up autoruns when calling `UI.toHTML`.

* Properly clean up event listeners when removing templates.

* Add support for `{{!-- block comments --}}` in Spacebars. Block comments may
  contain `}}`, so they are more useful than `{{! normal comments}}` for
  commenting out sections of Spacebars templates.

* Don't dynamically insert `<tbody>` tags in reactive tables

* When handling a custom jQuery event, additional arguments are
  no longer lost -- they now come after the template instance
  argument.  [#1988](https://github.com/meteor/meteor/issues/1988)


#### DDP and MongoDB

* Extend latency compensation to support an arbitrary sequence of
  inserts in methods.  Previously, documents created inside a method
  stub on the client would eventually be replaced by new documents
  from the server, causing the screen to flicker.  Calling `insert`
  inside a method body now generates the same ID on the client (inside
  the method stub) and on the server.  A sequence of inserts also
  generates the same sequence of IDs.  Code that wants a random stream
  that is consistent between method stub and real method execution can
  get one with `DDP.randomStream`.
  https://trello.com/c/moiiS2rP/57-pattern-for-creating-multiple-database-records-from-a-method

* The document passed to the `insert` callback of `allow` and `deny` now only
  has a `_id` field if the client explicitly specified one; this allows you to
  use `allow`/`deny` rules to prevent clients from specifying their own
  `_id`. As an exception, `allow`/`deny` rules with a `transform` always have an
  `_id`.

* DDP now has an implementation of bidirectional heartbeats which is consistent
  across SockJS and websocket transports. This enables connection keepalive and
  allows servers and clients to more consistently and efficiently detect
  disconnection.

* The DDP protocol version number has been incremented to "pre2" (adding
  randomSeed and heartbeats).

* The oplog observe driver handles errors communicating with MongoDB
  better and knows to re-poll all queries after a MongoDB failover.

* Fix bugs involving mutating DDP method arguments.


#### meteor command-line tool

* Move boilerplate HTML from tools to webapp.  Change internal
  `Webapp.addHtmlAttributeHook` API.

* Add `meteor list-sites` command for listing the sites that you have
  deployed to meteor.com with your Meteor developer account.

* Third-party template languages can request that their generated source loads
  before other JavaScript files, just like *.html files, by passing the
  isTemplate option to Plugin.registerSourceHandler.

* You can specify a particular interface for the dev mode runner to bind to with
  `meteor -p host:port`.

* Don't include proprietary tar tags in bundle tarballs.

* Convert relative URLs to absolute URLs when merging CSS files.


#### Upgraded dependencies

* Node.js from 0.10.25 to 0.10.26.
* MongoDB driver from 1.3.19 to 1.4.1
* stylus: 0.42.3 (from 0.42.2)
* showdown: 0.3.1
* css-parse: an unreleased version (from 1.7.0)
* css-stringify: an unreleased version (from 1.4.1)


Patches contributed by GitHub users aldeed, apendua, arbesfeld, awwx, dandv,
davegonzalez, emgee3, justinsb, mquandalle, Neftedollar, Pent, sdarnell,
and timhaines.


## v0.8.0.1, 2014-04-21

* Fix security flaw in OAuth1 implementation. Clients can no longer
  choose the callback_url for OAuth1 logins.


## v0.8.0, 2014-03-27

Meteor 0.8.0 introduces Blaze, a total rewrite of our live templating engine,
replacing Spark. Advantages of Blaze include:

  * Better interoperability with jQuery plugins and other techniques which
    directly manipulate the DOM
  * More fine-grained updates: only the specific elements or attributes that
    change are touched rather than the entire template
  * A fully documented templating language
  * No need for the confusing `{{#constant}}`, `{{#isolate}}`, and `preserve`
    directives
  * Uses standard jQuery delegation (`.on`) instead of our custom implementation
  * Blaze supports live SVG templates that work just like HTML templates

See
[the Using Blaze wiki page](https://github.com/meteor/meteor/wiki/Using-Blaze)
for full details on upgrading your app to 0.8.0.  This includes:

* The `Template.foo.rendered` callback is now only called once when the template
  is rendered, rather than repeatedly as it is "re-rendered", because templates
  now directly update changed data instead of fully re-rendering.

* The `accounts-ui` login buttons are now invoked as a `{{> loginButtons}}`
  rather than as `{{loginButtons}}`.

* Previous versions of Meteor used a heavily modified version of the Handlebars
  templating language. In 0.8.0, we've given it its own name: Spacebars!
  Spacebars has an
  [explicit specification](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md)
  instead of being defined as a series of changes to Handlebars. There are some
  incompatibilities with our previous Handlebars fork, such as a
  [different way of specifying dynamic element attributes](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md#in-attribute-values)
  and a
  [new way of defining custom block helpers](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md#custom-block-helpers).

* Your template files must consist of
  [well-formed HTML](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md#html-dialect). Invalid
  HTML is now a compilation failure.  (There is a current limitation in our HTML
  parser such that it does not support
  [omitting end tags](http://www.w3.org/TR/html5/syntax.html#syntax-tag-omission)
  on elements such as `<P>` and `<LI>`.)

* `Template.foo` is no longer a function. It is instead a
  "component". Components render to an intermediate representation of an HTML
  tree, not a string, so there is no longer an easy way to render a component to
  a static HTML string.

* `Meteor.render` and `Spark.render` have been removed. Use `UI.render` and
  `UI.insert` instead.

* The `<body>` tag now defines a template just like the `<template>` tag, which
  can have helpers and event handlers.  Define them directly on the object
  `UI.body`.

* Previous versions of Meteor shipped with a synthesized `tap` event,
  implementing a zero-delay click event on mobile browsers. Unfortunately, this
  event never worked very well. We're eliminating it. Instead, use one of the
  excellent third party solutions.

* The `madewith` package (which supported adding a badge to your website
  displaying its score from http://madewith.meteor.com/) has been removed, as it
  is not compatible with the new version of that site.

* The internal `spark`, `liverange`, `universal-events`, and `domutils` packages
  have been removed.

* The `Handlebars` namespace has been deprecated.  `Handlebars.SafeString` is
  now `Spacebars.SafeString`, and `Handlebars.registerHelper` is now
  `UI.registerHelper`.

Patches contributed by GitHub users cmather and mart-jansink.


## v0.7.2.3, 2014-12-09 (backport)

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.
  Backport from 1.0.1.

## v0.7.2.2, 2014-04-21 (backport)

* Fix a security flaw in OAuth1 and OAuth2 implementations.
  Backport from 0.8.1; see its entry for recommended actions to take.

## v0.7.2.1, 2014-04-30 (backport)

* Fix security flaw in OAuth1 implementation. Clients can no longer
  choose the callback_url for OAuth1 logins.
  Backport from 0.8.0.1.

## v0.7.2, 2014-03-18

* Support oplog tailing on queries with the `limit` option. All queries
  except those containing `$near` or `$where` selectors or the `skip`
  option can now be used with the oplog driver.

* Add hooks to login process: `Accounts.onLogin`,
  `Accounts.onLoginFailure`, and `Accounts.validateLoginAttempt`. These
  functions allow for rate limiting login attempts, logging an audit
  trail, account lockout flags, and more. See:
  http://docs.meteor.com/#accounts_validateloginattempt [#1815](https://github.com/meteor/meteor/issues/1815)

* Change the `Accounts.registerLoginHandler` API for custom login
  methods. Login handlers now require a name and no longer have to deal
  with generating resume tokens. See
  https://github.com/meteor/meteor/blob/devel/packages/accounts-base/accounts_server.js
  for details. OAuth based login handlers using the
  `Oauth.registerService` packages are not affected.

* Add support for HTML email in `Accounts.emailTemplates`.  [#1785](https://github.com/meteor/meteor/issues/1785)

* minimongo: Support `{a: {$elemMatch: {x: 1, $or: [{a: 1}, {b: 1}]}}}`  [#1875](https://github.com/meteor/meteor/issues/1875)

* minimongo: Support `{a: {$regex: '', $options: 'i'}}`  [#1874](https://github.com/meteor/meteor/issues/1874)

* minimongo: Fix sort implementation with multiple sort fields which each look
  inside an array. eg, ensure that with sort key `{'a.x': 1, 'a.y': 1}`, the
  document `{a: [{x: 0, y: 4}]}` sorts before
  `{a: [{x: 0, y: 5}, {x: 1, y: 3}]}`, because the 3 should not be used as a
  tie-breaker because it is not "next to" the tied 0s.

* minimongo: Fix sort implementation when selector and sort key share a field,
  that field matches an array in the document, and only some values of the array
  match the selector. eg, ensure that with sort key `{a: 1}` and selector
  `{a: {$gt: 3}}`, the document `{a: [4, 6]}` sorts before `{a: [1, 5]}`,
  because the 1 should not be used as a sort key because it does not match the
  selector. (We only approximate the MongoDB behavior here by only supporting
  relatively selectors.)

* Use `faye-websocket` (0.7.2) npm module instead of `websocket` (1.0.8) for
  server-to-server DDP.

* Update Google OAuth package to use new `profile` and `email` scopes
  instead of deprecated URL-based scopes.  [#1887](https://github.com/meteor/meteor/issues/1887)

* Add `_throwFirstError` option to `Deps.flush`.

* Make `facts` package data available on the server as
  `Facts._factsByPackage`.

* Fix issue where `LESS` compilation error could crash the `meteor run`
  process.  [#1877](https://github.com/meteor/meteor/issues/1877)

* Fix crash caused by empty HTTP host header in `meteor run` development
  server.  [#1871](https://github.com/meteor/meteor/issues/1871)

* Fix hot code reload in private browsing mode in Safari.

* Fix appcache size calculation to avoid erronious warnings. [#1847](https://github.com/meteor/meteor/issues/1847)

* Remove unused `Deps._makeNonReactive` wrapper function. Call
  `Deps.nonreactive` directly instead.

* Avoid setting the `oplogReplay` on non-oplog collections. Doing so
  caused mongod to crash.

* Add startup message to `test-in-console` to ease automation. [#1884](https://github.com/meteor/meteor/issues/1884)

* Upgraded dependencies
  - amplify: 1.1.2 (from 1.1.0)

Patches contributed by GitHub users awwx, dandv, queso, rgould, timhaines, zol


## v0.7.1.2, 2014-02-27

* Fix bug in tool error handling that caused `meteor` to crash on Mac
  OSX when no computer name is set.

* Work around a bug that caused MongoDB to fail an assertion when using
  tailable cursors on non-oplog collections.


## v0.7.1.1, 2014-02-24

* Integrate with Meteor developer accounts, a new way of managing your
  meteor.com deployed sites. When you use `meteor deploy`, you will be
  prompted to create a developer account.
    - Once you've created a developer account, you can log in and out
      from the command line with `meteor login` and `meteor logout`.
    - You can claim legacy sites with `meteor claim`. This command will
      prompt you for your site password if you are claiming a
      password-protected site; after claiming it, you will not need to
      enter the site password again.
    - You can add or remove authorized users, and view the list of
      authorized users, for a site with `meteor authorized`.
    - You can view your current username with `meteor whoami`.
    - This release also includes the `accounts-meteor-developer` package
      for building Meteor apps that allow users to log in with their own
      developer accounts.

* Improve the oplog tailing implementation for getting real-time database
  updates from MongoDB.
    - Add support for all operators except `$where` and `$near`. Limit and
      skip are not supported yet.
    - Add optimizations to avoid needless data fetches from MongoDB.
    - Fix an error ("Cannot call method 'has' of null") in an oplog
      callback. [#1767](https://github.com/meteor/meteor/issues/1767)

* Add and improve support for minimongo operators.
  - Support `$comment`.
  - Support `obj` name in `$where`.
  - `$regex` matches actual regexps properly.
  - Improve support for `$nin`, `$ne`, `$not`.
  - Support using `{ $in: [/foo/, /bar/] }`. [#1707](https://github.com/meteor/meteor/issues/1707)
  - Support `{$exists: false}`.
  - Improve type-checking for selectors.
  - Support `{x: {$elemMatch: {$gt: 5}}}`.
  - Match Mongo's behavior better when there are arrays in the document.
  - Support `$near` with sort.
  - Implement updates with `{ $set: { 'a.$.b': 5 } }`.
  - Support `{$type: 4}` queries.
  - Optimize `remove({})` when observers are paused.
  - Make update-by-id constant time.
  - Allow `{$set: {'x._id': 1}}`.  [#1794](https://github.com/meteor/meteor/issues/1794)

* Upgraded dependencies
  - node: 0.10.25 (from 0.10.22). The workaround for specific Node
    versions from 0.7.0 is now removed; 0.10.25+ is supported.
  - jquery: 1.11.0 (from 1.8.2). See
    http://jquery.com/upgrade-guide/1.9/ for upgrade instructions.
  - jquery-waypoints: 2.0.4 (from 1.1.7). Contains
    backwards-incompatible changes.
  - source-map: 0.3.2 (from 0.3.30) [#1782](https://github.com/meteor/meteor/issues/1782)
  - websocket-driver: 0.3.2 (from 0.3.1)
  - http-proxy: 1.0.2 (from a pre-release fork of 1.0)
  - semver: 2.2.1 (from 2.1.0)
  - request: 2.33.0 (from 2.27.0)
  - fstream: 0.1.25 (from 0.1.24)
  - tar: 0.1.19 (from 0.1.18)
  - eachline: a fork of 2.4.0 (from 2.3.3)
  - source-map: 0.1.31 (from 0.1.30)
  - source-map-support: 0.2.5 (from 0.2.3)
  - mongo: 2.4.9 (from 2.4.8)
  - openssl in mongo: 1.0.1f (from 1.0.1e)
  - kexec: 0.2.0 (from 0.1.1)
  - less: 1.6.1 (from 1.3.3)
  - stylus: 0.42.2 (from 0.37.0)
  - nib: 1.0.2 (from 1.0.0)
  - coffeescript: 1.7.1 (from 1.6.3)

* CSS preprocessing and sourcemaps:
  - Add sourcemap support for CSS stylesheet preprocessors. Use
    sourcemaps for stylesheets compiled with LESS.
  - Improve CSS minification to deal with `@import` statements correctly.
  - Lint CSS files for invalid `@` directives.
  - Change the recommended suffix for imported LESS files from
    `.lessimport` to `.import.less`. Add `.import.styl` to allow
    `stylus` imports. `.lessimport` continues to work but is deprecated.

* Add `clientAddress` and `httpHeaders` to `this.connection` in method
  calls and publish functions.

* Hash login tokens before storing them in the database. Legacy unhashed
  tokens are upgraded to hashed tokens in the database as they are used
  in login requests.

* Change default accounts-ui styling and add more CSS classes.

* Refactor command-line tool. Add test harness and better tests. Run
  `meteor self-test --help` for info on running the tools test suite.

* Speed up application re-build in development mode by re-using file
  hash computation between file change watching code and application
  build code..

* Fix issues with documents containing a key named `length` with a
  numeric value. Underscore treated these as arrays instead of objects,
  leading to exceptions when . Patch Underscore to not treat plain
  objects (`x.constructor === Object`) with numeric `length` fields as
  arrays. [#594](https://github.com/meteor/meteor/issues/594) [#1737](https://github.com/meteor/meteor/issues/1737)

* Deprecate `Accounts.loginServiceConfiguration` in favor of
  `ServiceConfiguration.configurations`, exported by the
  `service-configuration` package. `Accounts.loginServiceConfiguration`
  is maintained for backwards-compatibility, but it is defined in a
  `Meteor.startup` block and so cannot be used from top-level code.

* Cursors with a field specifier containing `{_id: 0}` can no longer be
  used with `observeChanges` or `observe`. This includes the implicit
  calls to these functions that are done when returning a cursor from a
  publish function or using `{{#each}}`.

* Transform functions must return objects and may not change the `_id`
  field, though they may leave it out.

* Remove broken IE7 support from the `localstorage` package. Meteor
  accounts logins no longer persist in IE7.

* Fix the `localstorage` package when used with Safari in private
  browsing mode. This fixes a problem with login token storage and
  account login. [#1291](https://github.com/meteor/meteor/issues/1291)

* Types added with `EJSON.addType` now have default `clone` and `equals`
  implementations. Users may still specify `clone` or `equals` functions
  to override the default behavior.  [#1745](https://github.com/meteor/meteor/issues/1745)

* Add `frame-src` to `browser-policy-content` and account for
  cross-browser CSP disparities.

* Deprecate `Oauth.initiateLogin` in favor of `Oauth.showPopup`.

* Add `WebApp.rawConnectHandlers` for adding connect handlers that run
  before any other Meteor handlers, except `connect.compress()`. Raw
  connect handlers see the URL's full path (even if ROOT_URL contains a
  non-empty path) and they run before static assets are served.

* Add `Accounts.connection` to allow using Meteor accounts packages with
  a non-default DDP connection.

* Detect and reload if minified CSS files fail to load at startup. This
  prevents the application from running unstyled if the page load occurs
  while the server is switching versions.

* Allow Npm.depends to specify any http or https URL containing a full
  40-hex-digit SHA.  [#1686](https://github.com/meteor/meteor/issues/1686)

* Add `retry` package for connection retry with exponential backoff.

* Pass `update` and `remove` return values correctly when using
  collections validated with `allow` and `deny` rules. [#1759](https://github.com/meteor/meteor/issues/1759)

* If you're using Deps on the server, computations and invalidation
  functions are not allowed to yield. Throw an error instead of behaving
  unpredictably.

* Fix namespacing in coffeescript files added to a package with the
  `bare: true` option. [#1668](https://github.com/meteor/meteor/issues/1668)

* Fix races when calling login and/or logoutOtherClients from multiple
  tabs. [#1616](https://github.com/meteor/meteor/issues/1616)

* Include oauth_verifier as a header rather than a parameter in
  the `oauth1` package. [#1825](https://github.com/meteor/meteor/issues/1825)

* Fix `force-ssl` to allow local development with `meteor run` in IPv6
  environments. [#1751](https://github.com/meteor/meteor/issues/1751)`

* Allow cursors on named local collections to be returned from a publish
  function in an array.  [#1820](https://github.com/meteor/meteor/issues/1820)

* Fix build failure caused by a directory in `programs/` without a
  package.js file.

* Do a better job of handling shrinkwrap files when an npm module
  depends on something that isn't a semver. [#1684](https://github.com/meteor/meteor/issues/1684)

* Fix failures updating npm dependencies when a node_modules directory
  exists above the project directory.  [#1761](https://github.com/meteor/meteor/issues/1761)

* Preserve permissions (eg, executable bit) on npm files.  [#1808](https://github.com/meteor/meteor/issues/1808)

* SockJS tweak to support relative base URLs.

* Don't leak sockets on error in dev-mode proxy.

* Clone arguments to `added` and `changed` methods in publish
  functions. This allows callers to reuse objects and prevents already
  published data from changing after the fact.  [#1750](https://github.com/meteor/meteor/issues/1750)

* Ensure springboarding to a different meteor tools version always uses
  `exec` to run the old version. This simplifies process management for
  wrapper scripts.

Patches contributed by GitHub users DenisGorbachev, EOT, OyoKooN, awwx,
dandv, icellan, jfhamlin, marcandre, michaelbishop, mitar, mizzao,
mquandalle, paulswartz, rdickert, rzymek, timhaines, and yeputons.


## v0.7.0.1, 2013-12-20

* Two fixes to `meteor run` Mongo startup bugs that could lead to hangs with the
  message "Initializing mongo database... this may take a moment.".  [#1696](https://github.com/meteor/meteor/issues/1696)

* Apply the Node patch to 0.10.24 as well (see the 0.7.0 section for details).

* Fix gratuitous IE7 incompatibility.  [#1690](https://github.com/meteor/meteor/issues/1690)


## v0.7.0, 2013-12-17

This version of Meteor contains a patch for a bug in Node 0.10 which
most commonly affects websockets. The patch is against Node version
0.10.22 and 0.10.23. We strongly recommend using one of these precise
versions of Node in production so that the patch will be applied. If you
use a newer version of Node with this version of Meteor, Meteor will not
apply the patch and will instead disable websockets.

* Rework how Meteor gets realtime database updates from MongoDB. Meteor
  now reads the MongoDB "oplog" -- a special collection that records all
  the write operations as they are applied to your database. This means
  changes to the database are instantly noticed and reflected in Meteor,
  whether they originated from Meteor or from an external database
  client. Oplog tailing is automatically enabled in development mode
  with `meteor run`, and can be enabled in production with the
  `MONGO_OPLOG_URL` environment variable. Currently the only supported
  selectors are equality checks; `$`-operators, `limit` and `skip`
  queries fall back to the original poll-and-diff algorithm. See
  https://github.com/meteor/meteor/wiki/Oplog-Observe-Driver
  for details.

* Add `Meteor.onConnection` and add `this.connection` to method
  invocations and publish functions. These can be used to store data
  associated with individual clients between subscriptions and method
  calls. See http://docs.meteor.com/#meteor_onconnection for details. [#1611](https://github.com/meteor/meteor/issues/1611)

* Bundler failures cause non-zero exit code in `meteor run`.  [#1515](https://github.com/meteor/meteor/issues/1515)

* Fix error when publish function callbacks are called during session shutdown.

* Rework hot code push. The new `autoupdate` package drives automatic
  reloads on update using standard DDP messages instead of a hardcoded
  message at DDP startup. Now the hot code push only triggers when
  client code changes; server-only code changes will not cause the page
  to reload.

* New `facts` package publishes internal statistics about Meteor.

* Add an explicit check that publish functions return a cursor, an array
  of cursors, or a falsey value. This is a safety check to to prevent
  users from accidentally returning Collection.findOne() or some other
  value and expecting it to be published.

* Implement `$each`, `$sort`, and `$slice` options for minimongo's `$push`
  modifier.  [#1492](https://github.com/meteor/meteor/issues/1492)

* Introduce `--raw-logs` option to `meteor run` to disable log
  coloring and timestamps.

* Add `WebAppInternals.setBundledJsCssPrefix()` to control where the
  client loads bundled JavaScript and CSS files. This allows serving
  files from a CDN to decrease page load times and reduce server load.

* Attempt to exit cleanly on `SIGHUP`. Stop accepting incoming
  connections, kill DDP connections, and finish all outstanding requests
  for static assets.

* In the HTTP server, only keep sockets with no active HTTP requests alive for 5
  seconds.

* Fix handling of `fields` option in minimongo when only `_id` is present. [#1651](https://github.com/meteor/meteor/issues/1651)

* Fix issue where setting `process.env.MAIL_URL` in app code would not
  alter where mail was sent. This was a regression in 0.6.6 from 0.6.5. [#1649](https://github.com/meteor/meteor/issues/1649)

* Use stderr instead of stdout (for easier automation in shell scripts) when
  prompting for passwords and when downloading the dev bundle. [#1600](https://github.com/meteor/meteor/issues/1600)

* Ensure more downtime during file watching.  [#1506](https://github.com/meteor/meteor/issues/1506)

* Fix `meteor run` with settings files containing non-ASCII characters.  [#1497](https://github.com/meteor/meteor/issues/1497)

* Support `EJSON.clone` for `Meteor.Error`. As a result, they are properly
  stringified in DDP even if thrown through a `Future`.  [#1482](https://github.com/meteor/meteor/issues/1482)

* Fix passing `transform: null` option to `collection.allow()` to disable
  transformation in validators.  [#1659](https://github.com/meteor/meteor/issues/1659)

* Fix livedata error on `this.removed` during session shutdown. [#1540](https://github.com/meteor/meteor/issues/1540) [#1553](https://github.com/meteor/meteor/issues/1553)

* Fix incompatibility with Phusion Passenger by removing an unused line. [#1613](https://github.com/meteor/meteor/issues/1613)

* Ensure install script creates /usr/local on machines where it does not
  exist (eg. fresh install of OSX Mavericks).

* Set x-forwarded-* headers in `meteor run`.

* Clean up package dirs containing only ".build".

* Check for matching hostname before doing end-of-oauth redirect.

* Only count files that actually go in the cache towards the `appcache`
  size check. [#1653](https://github.com/meteor/meteor/issues/1653).

* Increase the maximum size spiderable will return for a page from 200kB
  to 5MB.

* Upgraded dependencies:
  * SockJS server from 0.3.7 to 0.3.8, including new faye-websocket module.
  * Node from 0.10.21 to 0.10.22
  * MongoDB from 2.4.6 to 2.4.8
  * clean-css from 1.1.2 to 2.0.2
  * uglify-js from a fork of 2.4.0 to 2.4.7
  * handlebars npm module no longer available outside of handlebars package

Patches contributed by GitHub users AlexeyMK, awwx, dandv, DenisGorbachev,
emgee3, FooBarWidget, mitar, mcbain, rzymek, and sdarnell.


## v0.6.6.3, 2013-11-04

* Fix error when publish function callbacks are called during session
  shutdown.  [#1540](https://github.com/meteor/meteor/issues/1540) [#1553](https://github.com/meteor/meteor/issues/1553)

* Improve `meteor run` CPU usage in projects with many
  directories.  [#1506](https://github.com/meteor/meteor/issues/1506)


## v0.6.6.2, 2013-10-21

* Upgrade Node from 0.10.20 to 0.10.21 (security update).


## v0.6.6.1, 2013-10-12

* Fix file watching on OSX. Work around Node issue [#6251](https://github.com/meteor/meteor/issues/6251) by not using
  fs.watch. [#1483](https://github.com/meteor/meteor/issues/1483)


## v0.6.6, 2013-10-10


#### Security

* Add `browser-policy` package for configuring and sending
  Content-Security-Policy and X-Frame-Options HTTP headers.
  [See the docs](http://docs.meteor.com/#browserpolicy) for more.

* Use cryptographically strong pseudorandom number generators when available.

#### MongoDB

* Add upsert support. `Collection.update` now supports the `{upsert:
  true}` option. Additionally, add a `Collection.upsert` method which
  returns the newly inserted object id if applicable.

* `update` and `remove` now return the number of documents affected.  [#1046](https://github.com/meteor/meteor/issues/1046)

* `$near` operator for `2d` and `2dsphere` indices.

* The `fields` option to the collection methods `find` and `findOne` now works
  on the client as well.  (Operators such as `$elemMatch` and `$` are not yet
  supported in `fields` projections.) [#1287](https://github.com/meteor/meteor/issues/1287)

* Pass an index and the cursor itself to the callbacks in `cursor.forEach` and
  `cursor.map`, just like the corresponding `Array` methods.  [#63](https://github.com/meteor/meteor/issues/63)

* Support `c.find(query, {limit: N}).count()` on the client.  [#654](https://github.com/meteor/meteor/issues/654)

* Improve behavior of `$ne`, `$nin`, and `$not` selectors with objects containing
  arrays.  [#1451](https://github.com/meteor/meteor/issues/1451)

* Fix various bugs if you had two documents with the same _id field in
  String and ObjectID form.

#### Accounts

* [Behavior Change] Expire login tokens periodically. Defaults to 90
  days. Use `Accounts.config({loginExpirationInDays: null})` to disable
  token expiration.

* [Behavior Change] Write dates generated by Meteor Accounts to Mongo as
  Date instead of number; existing data can be converted by passing it
  through `new Date()`. [#1228](https://github.com/meteor/meteor/issues/1228)

* Log out and close connections for users if they are deleted from the
  database.

* Add Meteor.logoutOtherClients() for logging out other connections
  logged in as the current user.

* `restrictCreationByEmailDomain` option in `Accounts.config` to restrict new
  users to emails of specific domain (eg. only users with @meteor.com emails) or
  a custom validator. [#1332](https://github.com/meteor/meteor/issues/1332)

* Support OAuth1 services that require request token secrets as well as
  authentication token secrets.  [#1253](https://github.com/meteor/meteor/issues/1253)

* Warn if `Accounts.config` is only called on the client.  [#828](https://github.com/meteor/meteor/issues/828)

* Fix bug where callbacks to login functions could be called multiple
  times when the client reconnects.

#### DDP

* Fix infinite loop if a client disconnects while a long yielding method is
  running.

* Unfinished code to support DDP session resumption has been removed. Meteor
  servers now stop processing messages from clients and reclaim memory
  associated with them as soon as they are disconnected instead of a few minutes
  later.

#### Tools

* The pre-0.6.5 `Package.register_extension` API has been removed. Use
  `Package._transitional_registerBuildPlugin` instead, which was introduced in
  0.6.5. (A bug prevented the 0.6.5 reimplementation of `register_extension`
  from working properly anyway.)

* Support using an HTTP proxy in the `meteor` command line tool. This
  allows the `update`, `deploy`, `logs`, and `mongo` commands to work
  behind a proxy. Use the standard `http_proxy` environment variable to
  specify your proxy endpoint.  [#429](https://github.com/meteor/meteor/issues/429), [#689](https://github.com/meteor/meteor/issues/689), [#1338](https://github.com/meteor/meteor/issues/1338)

* Build Linux binaries on an older Linux machine. Meteor now supports
  running on Linux machines with glibc 2.9 or newer (Ubuntu 10.04+, RHEL
  and CentOS 6+, Fedora 10+, Debian 6+). Improve error message when running
  on Linux with unsupported glibc, and include Mongo stderr if it fails
  to start.

* Install NPM modules with `--force` to avoid corrupted local caches.

* Rebuild NPM modules in packages when upgrading to a version of Meteor that
  uses a different version of Node.

* Disable the Mongo http interface. This lets you run meteor on two ports
  differing by 1000 at the same time.

#### Misc

* [Known issue] Breaks support for pre-release OSX 10.9 'Mavericks'.
  Will be addressed shortly. See issues:
  https://github.com/joyent/node/issues/6251
  https://github.com/joyent/node/issues/6296

* `EJSON.stringify` now takes options:
  - `canonical` causes objects keys to be stringified in sorted order
  - `indent` allows formatting control over the EJSON stringification

* EJSON now supports `Infinity`, `-Infinity` and `NaN`.

* Check that the argument to `EJSON.parse` is a string.  [#1401](https://github.com/meteor/meteor/issues/1401)

* Better error from functions that use `Meteor._wrapAsync` (eg collection write
  methods and `HTTP` methods) and in DDP server message processing.  [#1387](https://github.com/meteor/meteor/issues/1387)

* Support `appcache` on Chrome for iOS.

* Support literate CoffeeScript files with the extension `.coffee.md` (in
  addition to the already-supported `.litcoffee` extension). [#1407](https://github.com/meteor/meteor/issues/1407)

* Make `madewith` package work again (broken in 0.6.5).  [#1448](https://github.com/meteor/meteor/issues/1448)

* Better error when passing a string to `{{#each}}`. [#722](https://github.com/meteor/meteor/issues/722)

* Add support for JSESSIONID cookies for sticky sessions. Set the
  `USE_JSESSIONID` environment variable to enable placing a JSESSIONID
  cookie on sockjs requests.

* Simplify the static analysis used to detect package-scope variables.

* Upgraded dependencies:
  * Node from 0.8.24 to 0.10.20
  * MongoDB from 2.4.4 to 2.4.6
  * MongoDB driver from 1.3.17 to 1.3.19
  * http-proxy from 0.10.1 to a pre-release of 1.0.0
  * stylus from 0.30.1 to 0.37.0
  * nib from 0.8.2 to 1.0.0
  * optimist from 0.3.5 to 0.6.0
  * semver from 1.1.0 to 2.1.0
  * request from 2.12.0 to 2.27.0
  * keypress from 0.1.0 to 0.2.1
  * underscore from 1.5.1 to 1.5.2
  * fstream from 0.1.21 to 0.1.24
  * tar from 0.1.14 to 0.1.18
  * source-map from 0.1.26 to 0.1.30
  * source-map-support from a fork of 0.1.8 to 0.2.3
  * escope from a fork of 0.0.15 to 1.0.0
  * estraverse from 1.1.2-1 to 1.3.1
  * simplesmtp from 0.1.25 to 0.3.10
  * stream-buffers from 0.2.3 to 0.2.5
  * websocket from 1.0.7 to 1.0.8
  * cli-color from 0.2.2 to 0.2.3
  * clean-css from 1.0.11 to 1.1.2
  * UglifyJS2 from a fork of 2.3.6 to a different fork of 2.4.0
  * connect from 2.7.10 to 2.9.0
  * send from 0.1.0 to 0.1.4
  * useragent from 2.0.1 to 2.0.7
  * replaced byline with eachline 2.3.3

Patches contributed by GitHub users ansman, awwx, codeinthehole, jacott,
Maxhodges, meawoppl, mitar, mizzao, mquandalle, nathan-muir, RobertLowe, ryw,
sdarnell, and timhaines.


## v0.6.5.3, 2014-12-09 (backport)

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.
  Backport from 1.0.1.


## v0.6.5.2, 2013-10-21

* Upgrade Node from 0.8.24 to 0.8.26 (security patch)


## v0.6.5.1, 2013-08-28

* Fix syntax errors on lines that end with a backslash. [#1326](https://github.com/meteor/meteor/issues/1326)

* Fix serving static files with special characters in their name. [#1339](https://github.com/meteor/meteor/issues/1339)

* Upgrade `esprima` JavaScript parser to fix bug parsing complex regexps.

* Export `Spiderable` from `spiderable` package to allow users to set
  `Spiderable.userAgentRegExps` to control what user agents are treated
  as spiders.

* Add EJSON to standard-app-packages. [#1343](https://github.com/meteor/meteor/issues/1343)

* Fix bug in d3 tab character parsing.

* Fix regression when using Mongo ObjectIDs in Spark templates.


## v0.6.5, 2013-08-14

* New package system with package compiler and linker:

  * Each package now has it own namespace for variable
    declarations. Global variables used in a package are limited to
    package scope.

  * Packages must explicitly declare which symbols they export with
    `api.export` in `package.js`.

  * Apps and packages only see the exported symbols from packages they
    explicitly use. For example, if your app uses package A which in
    turn depends on package B, only package A's symbols will be
    available in the app.

  * Package names can only contain alphanumeric characters, dashes, and
    dots. Packages with spaces and underscores must be renamed.

  * Remove hardcoded list of required packages. New default
    `standard-app-packages` package adds dependencies on the core Meteor
    stack. This package can be removed to make an app with only parts of
    the Meteor stack. `standard-app-packages` will be automatically
    added to a project when it is updated to Meteor 0.6.5.

  * Custom app packages in the `packages` directory are no longer
    automatically used. They must be explicitly added to the app with
    `meteor add <packagename>`. To help with the transition, all
    packages in the `packages` directory will be automatically added to
    the project when it is updated to Meteor 0.6.5.

  * New "unipackage" on-disk format for built packages. Compiled packages are
    cached and rebuilt only when their source or dependencies change.

  * Add "unordered" and "weak" package dependency modes to allow
    circular package dependencies and conditional code inclusion.

  * New API (`_transitional_registerBuildPlugin`) for declaring
    compilers, preprocessors, and file extension handlers. These new
    build plugins are full compilation targets in their own right, and
    have their own namespace, source files, NPM requirements, and package
    dependencies. The old `register_extension` API is deprecated. Please
    note that the `package.js` format and especially
    `_transitional_registerBuildPlugin` are not frozen interfaces and
    are subject to change in future releases.

  * Add `api.imply`, which allows one package to "imply" another. If
    package A implies package B, then anything that depends on package
    A automatically depends on package B as well (and receives package
    B's imports). This is useful for creating umbrella packages
    (`standard-app-packages`) or sometimes for factoring common code
    out of related packages (`accounts-base`).

* Move HTTP serving out of the server bootstrap and into the `webapp`
  package. This allows building Meteor apps that are not web servers
  (eg. command line tools, DDP clients, etc.). Connect middlewares can
  now be registered on the new `WebApp.connectHandlers` instead of the
  old `__meteor_bootstrap__.app`.

* The entire Meteor build process now has first-class source map
  support. A source map is maintained for every source file as it
  passes through the build pipeline. Currently, the source maps are
  only served in development mode. Not all web browsers support source
  maps yet and for those that do, you may have to turn on an option to
  enable them. Source maps will always be used when reporting
  exceptions on the server.

* Update the `coffeescript` package to generate source maps.

* Add new `Assets` API and `private` subdirectory for including and
  accessing static assets on the server. http://docs.meteor.com/#assets

* Add `Meteor.disconnect`. Call this to disconnect from the
  server and stop all live data updates. [#1151](https://github.com/meteor/meteor/issues/1151)

* Add `Match.Integer` to `check` for 32-bit signed integers.

* `Meteor.connect` has been renamed to `DDP.connect` and is now fully
  supported on the server. Server-to-server DDP connections use
  websockets, and can be used for both method calls and subscriptions.

* Rename `Meteor.default_connection` to `Meteor.connection` and
  `Meteor.default_server` to `Meteor.server`.

* Rename `Meteor.http` to `HTTP`.

* `ROOT_URL` may now have a path part. This allows serving multiple
  Meteor apps on the same domain.

* Support creating named unmanaged collections with
  `new Meteor.Collection("name", {connection: null})`.

* New `Log` function in the `logging` package which prints with
  timestamps, color, filenames and linenumbers.

* Include http response in errors from oauth providers. [#1246](https://github.com/meteor/meteor/issues/1246)

* The `observe` callback `movedTo` now has a fourth argument `before`.

* Move NPM control files for packages from `.npm` to
  `.npm/package`. This is to allow build plugins such as `coffeescript`
  to depend on NPM packages. Also, when removing the last NPM
  dependency, clean up the `.npm` dir.

* Remove deprecated `Meteor.is_client` and `Meteor.is_server` variables.

* Implement "meteor bundle --debug" [#748](https://github.com/meteor/meteor/issues/748)

* Add `forceApprovalPrompt` option to `Meteor.loginWithGoogle`. [#1226](https://github.com/meteor/meteor/issues/1226)

* Make server-side Mongo `insert`s, `update`s, and `remove`s run
  asynchronously when a callback is passed.

* Improve memory usage when calling `findOne()` on the server.

* Delete login tokens from server when user logs out.

* Rename package compatibility mode option to `add_files` from `raw` to
  `bare`.

* Fix Mongo selectors of the form: {$regex: /foo/}.

* Fix Spark memory leak.  [#1157](https://github.com/meteor/meteor/issues/1157)

* Fix EPIPEs during dev mode hot code reload.

* Fix bug where we would never quiesce if we tried to revive subs that errored
  out (5e7138d)

* Fix bug where `this.fieldname` in handlebars template might refer to a
  helper instead of a property of the current data context. [#1143](https://github.com/meteor/meteor/issues/1143)

* Fix submit events on IE8. [#1191](https://github.com/meteor/meteor/issues/1191)

* Handle `Meteor.loginWithX` being called with a callback but no options. [#1181](https://github.com/meteor/meteor/issues/1181)

* Work around a Chrome bug where hitting reload could cause a tab to
  lose the DDP connection and never recover. [#1244](https://github.com/meteor/meteor/issues/1244)

* Upgraded dependencies:
  * Node from 0.8.18 to 0.8.24
  * MongoDB from 2.4.3 to 2.4.4, now with SSL support
  * CleanCSS from 0.8.3 to 1.0.11
  * Underscore from 1.4.4 to 1.5.1
  * Fibers from 1.0.0 to 1.0.1
  * MongoDB Driver from 1.3.7 to 1.3.17

Patches contributed by GitHub users btipling, mizzao, timhaines and zol.


## v0.6.4.1, 2013-07-19

* Update mongodb driver to use version 0.2.1 of the bson module.


## v0.6.4, 2013-06-10

* Separate OAuth flow logic from Accounts into separate packages. The
  `facebook`, `github`, `google`, `meetup`, `twitter`, and `weibo`
  packages can be used to perform an OAuth exchange without creating an
  account and logging in.  [#1024](https://github.com/meteor/meteor/issues/1024)

* If you set the `DISABLE_WEBSOCKETS` environment variable, browsers will not
  attempt to connect to your app using Websockets. Use this if you know your
  server environment does not properly proxy Websockets to reduce connection
  startup time.

* Make `Meteor.defer` work in an inactive tab in iOS.  [#1023](https://github.com/meteor/meteor/issues/1023)

* Allow new `Random` instances to be constructed with specified seed. This
  can be used to create repeatable test cases for code that picks random
  values.  [#1033](https://github.com/meteor/meteor/issues/1033)

* Fix CoffeeScript error reporting to include source file and line
  number again.  [#1052](https://github.com/meteor/meteor/issues/1052)

* Fix Mongo queries which nested JavaScript RegExp objects inside `$or`.  [#1089](https://github.com/meteor/meteor/issues/1089)

* Upgraded dependencies:
  * Underscore from 1.4.2 to 1.4.4  [#776](https://github.com/meteor/meteor/issues/776)
  * http-proxy from 0.8.5 to 0.10.1  [#513](https://github.com/meteor/meteor/issues/513)
  * connect from 1.9.2 to 2.7.10
  * Node mongodb client from 1.2.13 to 1.3.7  [#1060](https://github.com/meteor/meteor/issues/1060)

Patches contributed by GitHub users awwx, johnston, and timhaines.


## v0.6.3, 2013-05-15

* Add new `check` package for ensuring that a value matches a required
  type and structure. This is used to validate untrusted input from the
  client. See http://docs.meteor.com/#match for details.

* Use Websockets by default on supported browsers. This reduces latency
  and eliminates the constant network spinner on iOS devices.

* With `autopublish` on, publish many useful fields on `Meteor.users`.

* Files in the `client/compatibility/` subdirectory of a Meteor app do
  not get wrapped in a new variable scope. This is useful for
  third-party libraries which expect `var` statements at the outermost
  level to be global.

* Add synthetic `tap` event for use on touch enabled devices. This is a
  replacement for `click` that fires immediately.

* When using the `http` package synchronously on the server, errors
  are thrown rather than passed in `result.error`

* The `manager` option to the `Meteor.Collection` constructor is now called
  `connection`. The old name still works for now.  [#987](https://github.com/meteor/meteor/issues/987)

* The `localstorage-polyfill` smart package has been replaced by a
  `localstorage` package, which defines a `Meteor._localStorage` API instead of
  trying to replace the DOM `window.localStorage` facility. (Now, apps can use
  the existence of `window.localStorage` to detect if the full localStorage API
  is supported.)  [#979](https://github.com/meteor/meteor/issues/979)

* Upgrade MongoDB from 2.2.1 to 2.4.3.

* Upgrade CoffeeScript from 1.5.0 to 1.6.2.  [#972](https://github.com/meteor/meteor/issues/972)

* Faster reconnects when regaining connectivity.  [#696](https://github.com/meteor/meteor/issues/696)

* `Email.send` has a new `headers` option to set arbitrary headers.  [#963](https://github.com/meteor/meteor/issues/963)

* Cursor transform functions on the server no longer are required to return
  objects with correct `_id` fields.  [#974](https://github.com/meteor/meteor/issues/974)

* Rework `observe()` callback ordering in minimongo to improve fiber
  safety on the server. This makes subscriptions on server to server DDP
  more usable.

* Use binary search in minimongo when updating ordered queries.  [#969](https://github.com/meteor/meteor/issues/969)

* Fix EJSON base64 decoding bug.  [#1001](https://github.com/meteor/meteor/issues/1001)

* Support `appcache` on Chromium.  [#958](https://github.com/meteor/meteor/issues/958)

Patches contributed by GitHub users awwx, jagill, spang, and timhaines.


## v0.6.2.1, 2013-04-24

* When authenticating with GitHub, include a user agent string. This
  unbreaks "Sign in with GitHub"

Patch contributed by GitHub user pmark.


## v0.6.2, 2013-04-16

* Better error reporting:
  * Capture real stack traces for `Meteor.Error`.
  * Report better errors with misconfigured OAuth services.

* Add per-package upgrade notices to `meteor update`.

* Experimental server-to-server DDP support: `Meteor.connect` on the
  server will connect to a remote DDP endpoint via WebSockets. Method
  calls should work fine, but subscriptions and minimongo on the server
  are still a work in progress.

* Upgrade d3 from 2.x to 3.1.4. See
  https://github.com/mbostock/d3/wiki/Upgrading-to-3.0 for compatibility notes.

* Allow CoffeeScript to set global variables when using `use strict`. [#933](https://github.com/meteor/meteor/issues/933)

* Return the inserted documented ID from `LocalCollection.insert`. [#908](https://github.com/meteor/meteor/issues/908)

* Add Weibo token expiration time to `services.weibo.expiresAt`.

* `Spiderable.userAgentRegExps` can now be modified to change what user agents
  are treated as spiders by the `spiderable` package.

* Prevent observe callbacks from affecting the arguments to identical
  observes. [#855](https://github.com/meteor/meteor/issues/855)

* Fix meteor command line tool when run from a home directory with
  spaces in its name. If you previously installed meteor release 0.6.0
  or 0.6.1 you'll need to uninstall and reinstall meteor to support
  users with spaces in their usernames (see
  https://github.com/meteor/meteor/blob/master/README.md#uninstalling-meteor)

Patches contributed by GitHub users andreas-karlsson, awwx, jacott,
joshuaconner, and timhaines.


## v0.6.1, 2013-04-08

* Correct NPM behavior in packages in case there is a `node_modules` directory
  somewhere above the app directory. [#927](https://github.com/meteor/meteor/issues/927)

* Small bug fix in the low-level `routepolicy` package.

Patches contributed by GitHub users andreas-karlsson and awwx.


## v0.6.0, 2013-04-04

* Meteor has a brand new distribution system! In this new system, code-named
  Engine, packages are downloaded individually and on demand. All of the
  packages in each official Meteor release are prefetched and cached so you can
  still use Meteor while offline. You can have multiple releases of Meteor
  installed simultaneously; apps are pinned to specific Meteor releases.
  All `meteor` commands accept a `--release` argument to specify which release
  to use; `meteor update` changes what release the app is pinned to.
  Inside an app, the name of the release is available at `Meteor.release`.
  When running Meteor directly from a git checkout, the release is ignored.

* Variables declared with `var` at the outermost level of a JavaScript
  source file are now private to that file. Remove the `var` to share
  a value between files.

* Meteor now supports any x86 (32- or 64-bit) Linux system, not just those which
  use Debian or RedHat package management.

* Apps may contain packages inside a top-level directory named `packages`.

* Packages may depend on [NPM modules](https://npmjs.org), using the new
  `Npm.depends` directive in their `package.js` file. (Note: if the NPM module
  has architecture-specific binary components, bundles built with `meteor
  bundle` or `meteor deploy` will contain the components as built for the
  developer's platform and may not run on other platforms.)

* Meteor's internal package tests (as well as tests you add to your app's
  packages with the unsupported `Tinytest` framework) are now run with the new
  command `meteor test-packages`.

* `{{#each}}` helper can now iterate over falsey values without throwing an
  exception. [#815](https://github.com/meteor/meteor/issues/815), [#801](https://github.com/meteor/meteor/issues/801)

* `{{#with}}` helper now only includes its block if its argument is not falsey,
  and runs an `{{else}}` block if provided if the argument is falsey. [#770](https://github.com/meteor/meteor/issues/770), [#866](https://github.com/meteor/meteor/issues/866)

* Twitter login now stores `profile_image_url` and `profile_image_url_https`
  attributes in the `user.services.twitter` namespace. [#788](https://github.com/meteor/meteor/issues/788)

* Allow packages to register file extensions with dots in the filename.

* When calling `this.changed` in a publish function, it is no longer an error to
  clear a field which was never set. [#850](https://github.com/meteor/meteor/issues/850)

* Deps API
  * Add `dep.depend()`, deprecate `Deps.depend(dep)` and
    `dep.addDependent()`.
  * If first run of `Deps.autorun` throws an exception, stop it and don't
    rerun.  This prevents a Spark exception when template rendering fails
    ("Can't call 'firstNode' of undefined").
  * If an exception is thrown during `Deps.flush` with no stack, the
    message is logged instead. [#822](https://github.com/meteor/meteor/issues/822)

* When connecting to MongoDB, use the JavaScript BSON parser unless specifically
  requested in `MONGO_URL`; the native BSON parser sometimes segfaults. (Meteor
  only started using the native parser in 0.5.8.)

* Calls to the `update` collection function in untrusted code may only use a
  whitelisted list of modifier operators.

Patches contributed by GitHub users awwx, blackcoat, cmather, estark37,
mquandalle, Primigenus, raix, reustle, and timhaines.


## v0.5.9, 2013-03-14

* Fix regression in 0.5.8 that prevented users from editing their own
  profile. [#809](https://github.com/meteor/meteor/issues/809)

* Fix regression in 0.5.8 where `Meteor.loggingIn()` would not update
  reactively. [#811](https://github.com/meteor/meteor/issues/811)


## v0.5.8, 2013-03-13

* Calls to the `update` and `remove` collection functions in untrusted code may
  no longer use arbitrary selectors. You must specify a single document ID when
  invoking these functions from the client (other than in a method stub).

  You may still use other selectors when calling `update` and `remove` on the
  server and from client method stubs, so you can replace calls that are no
  longer supported (eg, in event handlers) with custom method calls.

  The corresponding `update` and `remove` callbacks passed to `allow` and `deny`
  now take a single document instead of an array.

* Add new `appcache` package. Add this package to your project to speed
  up page load and make hot code reload smoother using the HTML5
  AppCache API. See http://docs.meteor.com/#appcache for details.

* Rewrite reactivity library. `Meteor.deps` is now `Deps` and has a new
  API. `Meteor.autorun` and `Meteor.flush` are now called `Deps.autorun` and
  `Deps.flush` (the old names still work for now). The other names under
  `Meteor.deps` such as `Context` no longer exist. The new API is documented at
  http://docs.meteor.com/#deps

* You can now provide a `transform` option to collections, which is a
  function that documents coming out of that collection are passed
  through. `find`, `findOne`, `allow`, and `deny` now take `transform` options,
  which may override the Collection's `transform`.  Specifying a `transform`
  of `null` causes you to receive the documents unmodified.

* Publish functions may now return an array of cursors to publish. Currently,
  the cursors must all be from different collections. [#716](https://github.com/meteor/meteor/issues/716)

* User documents have id's when `onCreateUser` and `validateNewUser` hooks run.

* Encode and store custom EJSON types in MongoDB.

* Support literate CoffeeScript files with the extension `.litcoffee`. [#766](https://github.com/meteor/meteor/issues/766)

* Add new login service provider for Meetup.com in `accounts-meetup` package.

* If you call `observe` or `observeChanges` on a cursor created with the
  `reactive: false` option, it now only calls initial add callbacks and
  does not continue watching the query. [#771](https://github.com/meteor/meteor/issues/771)

* In an event handler, if the data context is falsey, default it to `{}`
  rather than to the global object. [#777](https://github.com/meteor/meteor/issues/777)

* Allow specifying multiple event handlers for the same selector. [#753](https://github.com/meteor/meteor/issues/753)

* Revert caching header change from 0.5.5. This fixes image flicker on redraw.

* Stop making `Session` available on the server; it's not useful there. [#751](https://github.com/meteor/meteor/issues/751)

* Force URLs in stack traces in browser consoles to be hyperlinks. [#725](https://github.com/meteor/meteor/issues/725)

* Suppress spurious `changed` callbacks with empty `fields` from
  `Cursor.observeChanges`.

* Fix logic bug in template branch matching. [#724](https://github.com/meteor/meteor/issues/724)

* Make `spiderable` user-agent test case insensitive. [#721](https://github.com/meteor/meteor/issues/721)

* Fix several bugs in EJSON type support:
  * Fix `{$type: 5}` selectors for binary values on browsers that do
    not support `Uint8Array`.
  * Fix EJSON equality on falsey values.
  * Fix for returning a scalar EJSON type from a method. [#731](https://github.com/meteor/meteor/issues/731)

* Upgraded dependencies:
  * mongodb driver to version 1.2.13 (from 0.1.11)
  * mime module removed (it was unused)


Patches contributed by GitHub users awwx, cmather, graemian, jagill,
jmhredsox, kevinxucs, krizka, mitar, raix, and rasmuserik.


## v0.5.7, 2013-02-21

* The DDP wire protocol has been redesigned.

  * The handshake message is now versioned. This breaks backwards
    compatibility between sites with `Meteor.connect()`. Older meteor
    apps can not talk to new apps and vice versa. This includes the
    `madewith` package, apps using `madewith` must upgrade.

  * New [EJSON](http://docs.meteor.com/#ejson) package allows you to use
    Dates, Mongo ObjectIDs, and binary data in your collections and
    Session variables.  You can also add your own custom datatypes.

  * Meteor now correctly represents empty documents in Collections.

  * There is an informal specification in `packages/livedata/DDP.md`.


* Breaking API changes

  * Changed the API for `observe`.  Observing with `added`, `changed`
    and `removed` callbacks is now unordered; for ordering information
    use `addedAt`, `changedAt`, `removedAt`, and `movedTo`. Full
    documentation is in the [`observe` docs](http://docs.meteor.com/#observe).
    All callers of `observe` need to be updated.

  * Changed the API for publish functions that do not return a cursor
    (ie functions that call `this.set` and `this.unset`). See the
    [`publish` docs](http://docs.meteor.com/#meteor_publish) for the new
    API.


* New Features

  * Added new [`observeChanges`](http://docs.meteor.com/#observe_changes)
    API for keeping track of the contents of a cursor more efficiently.

  * There is a new reactive function on subscription handles: `ready()`
    returns true when the subscription has received all of its initial
    documents.

  * Added `Session.setDefault(key, value)` so you can easily provide
    initial values for session variables that will not be clobbered on
    hot code push.

  * You can specify that a collection should use MongoDB ObjectIDs as
    its `_id` fields for inserts instead of strings. This allows you to
    use Meteor with existing MongoDB databases that have ObjectID
    `_id`s. If you do this, you must use `EJSON.equals()` for comparing
    equality instead of `===`. See http://docs.meteor.com/#meteor_collection.

  * New [`random` package](http://docs.meteor.com/#random) provides
    several functions for generating random values. The new
    `Random.id()` function is used to provide shorter string IDs for
    MongoDB documents. `Meteor.uuid()` is deprecated.

  * `Meteor.status()` can return the status `failed` if DDP version
    negotiation fails.


* Major Performance Enhancements

  * Rewrote subscription duplication detection logic to use a more
    efficient algorithm. This significantly reduces CPU usage on the
    server during initial page load and when dealing with large amounts
    of data.

  * Reduced unnecessary MongoDB re-polling of live queries. Meteor no
    longer polls for changes on queries that specify `_id` when
    updates for a different specific `_id` are processed. This
    drastically improves performance when dealing with many
    subscriptions and updates to individual objects, such as those
    generated by the `accounts-base` package on the `Meteor.users`
    collection.


* Upgraded UglifyJS2 to version 2.2.5


Patches contributed by GitHub users awwx and michaelglenadams.


## v0.5.6, 2013-02-15

* Fix 0.5.5 regression: Minimongo selectors matching subdocuments under arrays
  did not work correctly.

* Some Bootstrap icons should have appeared white.

Patches contributed by GitHub user benjaminchelli.

## v0.5.5, 2013-02-13

* Deprecate `Meteor.autosubscribe`. `Meteor.subscribe` now works within
  `Meteor.autorun`.

* Allow access to `Meteor.settings.public` on the client. If the JSON
  file you gave to `meteor --settings` includes a field called `public`,
  that field will be available on the client as well as the server.

* `@import` works in `less`. Use the `.lessimport` file extension to
  make a less file that is ignored by preprocessor so as to avoid double
  processing. [#203](https://github.com/meteor/meteor/issues/203)

* Upgrade Fibers to version 1.0.0. The `Fiber` and `Future` symbols are
  no longer exposed globally. To use fibers directly you can use:
   `var Fiber = __meteor_bootstrap__.require('fibers');` and
   `var Future = __meteor_bootstrap__.require('fibers/future');`

* Call version 1.1 of the Twitter API when authenticating with
  OAuth. `accounts-twitter` users have until March 5th, 2013 to
  upgrade before Twitter disables the old API. [#527](https://github.com/meteor/meteor/issues/527)

* Treat Twitter ids as strings, not numbers, as recommended by
  Twitter. [#629](https://github.com/meteor/meteor/issues/629)

* You can now specify the `_id` field of a document passed to `insert`.
  Meteor still auto-generates `_id` if it is not present.

* Expose an `invalidated` flag on `Meteor.deps.Context`.

* Populate user record with additional data from Facebook and Google. [#664](https://github.com/meteor/meteor/issues/664)

* Add Facebook token expiration time to `services.facebook.expiresAt`. [#576](https://github.com/meteor/meteor/issues/576)

* Allow piping a password to `meteor deploy` on `stdin`. [#623](https://github.com/meteor/meteor/issues/623)

* Correctly type cast arguments to handlebars helper. [#617](https://github.com/meteor/meteor/issues/617)

* Fix leaked global `userId` symbol.

* Terminate `phantomjs` properly on error when using the `spiderable`
  package. [#571](https://github.com/meteor/meteor/issues/571)

* Stop serving non-cachable files with caching headers. [#631](https://github.com/meteor/meteor/issues/631)

* Fix race condition if server restarted between page load and initial
  DDP connection. [#653](https://github.com/meteor/meteor/issues/653)

* Resolve issue where login methods sometimes blocked future methods. [#555](https://github.com/meteor/meteor/issues/555)

* Fix `Meteor.http` parsing of JSON responses on Firefox. [#553](https://github.com/meteor/meteor/issues/553)

* Minimongo no longer uses `eval`. [#480](https://github.com/meteor/meteor/issues/480)

* Serve 404 for `/app.manifest`. This allows experimenting with the
  upcoming `appcache` smart package. [#628](https://github.com/meteor/meteor/issues/628)

* Upgraded many dependencies, including:
  * node.js to version 0.8.18
  * jquery-layout to version 1.3.0RC
  * Twitter Bootstrap to version 2.3.0
  * Less to version 1.3.3
  * Uglify to version 2.2.3
  * useragent to version 2.0.1

Patches contributed by GitHub users awwx, bminer, bramp, crunchie84,
danawoodman, dbimmler, Ed-von-Schleck, geoffd123, jperl, kevee,
milesmatthias, Primigenus, raix, timhaines, and xenolf.


## v0.5.4, 2013-01-08

* Fix 0.5.3 regression: `meteor run` could fail on OSX 10.8 if environment
  variables such as `DYLD_LIBRARY_PATH` are set.


## v0.5.3, 2013-01-07

* Add `--settings` argument to `meteor deploy` and `meteor run`. This
  allows you to specify deployment-specific information made available
  to server code in the variable `Meteor.settings`.

* Support unlimited open tabs in a single browser. Work around the
  browser per-hostname connection limit by using randomized hostnames
  for deployed apps. [#131](https://github.com/meteor/meteor/issues/131)

* minimongo improvements:
  * Allow observing cursors with `skip` or `limit`.  [#528](https://github.com/meteor/meteor/issues/528)
  * Allow sorting on `dotted.sub.keys`.  [#533](https://github.com/meteor/meteor/issues/533)
  * Allow querying specific array elements (`foo.1.bar`).
  * `$and`, `$or`, and `$nor` no longer accept empty arrays (for consistency
    with Mongo)

* Re-rendering a template with Spark no longer reverts changes made by
  users to a `preserve`d form element. Instead, the newly rendered value
  is only applied if it is different from the previously rendered value.
  Additionally, `<INPUT>` elements with type other than TEXT can now have
  reactive values (eg, the labels on submit buttons can now be
  reactive).  [#510](https://github.com/meteor/meteor/issues/510) [#514](https://github.com/meteor/meteor/issues/514) [#523](https://github.com/meteor/meteor/issues/523) [#537](https://github.com/meteor/meteor/issues/537) [#558](https://github.com/meteor/meteor/issues/558)

* Support JavaScript RegExp objects in selectors in Collection write
  methods on the client, eg `myCollection.remove({foo: /bar/})`.  [#346](https://github.com/meteor/meteor/issues/346)

* `meteor` command-line improvements:
  * Improve error message when mongod fails to start.
  * The `NODE_OPTIONS` environment variable can be used to pass command-line
    flags to node (eg, `--debug` or `--debug-brk` to enable the debugger).
  * Die with error if an app name is mistakenly passed to `meteor reset`.

* Add support for "offline" access tokens with Google login. [#464](https://github.com/meteor/meteor/issues/464) [#525](https://github.com/meteor/meteor/issues/525)

* Don't remove `serviceData` fields from previous logins when logging in
  with an external service.

* Improve `OAuth1Binding` to allow making authenticated API calls to
  OAuth1 providers (eg Twitter).  [#539](https://github.com/meteor/meteor/issues/539)

* New login providers automatically work with `{{loginButtons}}` without
  needing to edit the `accounts-ui-unstyled` package.  [#572](https://github.com/meteor/meteor/issues/572)

* Use `Content-Type: application/json` by default when sending JSON data
  with `Meteor.http`.

* Improvements to `jsparse`: hex literals, keywords as property names, ES5 line
  continuations, trailing commas in object literals, line numbers in error
  messages, decimal literals starting with `.`, regex character classes with
  slashes.

* Spark improvements:
  * Improve rendering of `<SELECT>` elements on IE.  [#496](https://github.com/meteor/meteor/issues/496)
  * Don't lose nested data contexts in IE9/10 after two seconds.  [#458](https://github.com/meteor/meteor/issues/458)
  * Don't print a stack trace if DOM nodes are manually removed
    from the document without calling `Spark.finalize`.  [#392](https://github.com/meteor/meteor/issues/392)

* Always use the `autoReconnect` flag when connecting to Mongo.  [#425](https://github.com/meteor/meteor/issues/425)

* Fix server-side `observe` with no `added` callback.  [#589](https://github.com/meteor/meteor/issues/589)

* Fix re-sending method calls on reconnect.  [#538](https://github.com/meteor/meteor/issues/538)

* Remove deprecated `/sockjs` URL support from `Meteor.connect`.

* Avoid losing a few bits of randomness in UUID v4 creation.  [#519](https://github.com/meteor/meteor/issues/519)

* Update clean-css package from 0.8.2 to 0.8.3, fixing minification of `0%`
  values in `hsl` colors.  [#515](https://github.com/meteor/meteor/issues/515)

Patches contributed by GitHub users Ed-von-Schleck, egtann, jwulf, lvbreda,
martin-naumann, meawoppl, nwmartin, timhaines, and zealoushacker.


## v0.5.2, 2012-11-27

* Fix 0.5.1 regression: Cursor `observe` works during server startup.  [#507](https://github.com/meteor/meteor/issues/507)

## v0.5.1, 2012-11-20

* Speed up server-side subscription handling by avoiding redundant work
  when the same Mongo query is observed multiple times concurrently (eg,
  by multiple users subscribing to the same subscription), and by using
  a simpler "unordered" algorithm.

* Meteor now waits to invoke method callbacks until all the data written by the
  method is available in the local cache. This way, method callbacks can see the
  full effects of their writes. This includes the callbacks passed to
  `Meteor.call` and `Meteor.apply`, as well as to the `Meteor.Collection`
  `insert`/`update`/`remove` methods.

  If you want to process the method's result as soon as it arrives from the
  server, even if the method's writes are not available yet, you can now specify
  an `onResultReceived` callback to `Meteor.apply`.

* Rework latency compensation to show server data changes sooner. Previously, as
  long as any method calls were in progress, Meteor would buffer all data
  changes sent from the server until all methods finished. Meteor now only
  buffers writes to documents written by client stubs, and applies the writes as
  soon as all methods that wrote that document have finished.

* `Meteor.userLoaded()` and `{{currentUserLoaded}}` have been removed.
  Previously, during the login process on the client, `Meteor.userId()` could be
  set but the document at `Meteor.user()` could be incomplete. Meteor provided
  the function `Meteor.userLoaded()` to differentiate between these states. Now,
  this in-between state does not occur: when a user logs in, `Meteor.userId()`
  only is set once `Meteor.user()` is fully loaded.

* New reactive function `Meteor.loggingIn()` and template helper
  `{{loggingIn}}`; they are true whenever some login method is in progress.
  `accounts-ui` now uses this to show an animation during login.

* The `sass` CSS preprocessor package has been removed. It was based on an
  unmaintained NPM module which did not implement recent versions of the Sass
  language and had no error handling.  Consider using the `less` or `stylus`
  packages instead.  [#143](https://github.com/meteor/meteor/issues/143)

* `Meteor.setPassword` is now called `Accounts.setPassword`, matching the
  documentation and original intention.  [#454](https://github.com/meteor/meteor/issues/454)

* Passing the `wait` option to `Meteor.apply` now waits for all in-progress
  method calls to finish before sending the method, instead of only guaranteeing
  that its callback occurs after the callbacks of in-progress methods.

* New function `Accounts.callLoginMethod` which should be used to call custom
  login handlers (such as those registered with
  `Accounts.registerLoginHandler`).

* The callbacks for `Meteor.loginWithToken` and `Accounts.createUser` now match
  the other login callbacks: they are called with error on error or with no
  arguments on success.

* Fix bug where method calls could be dropped during a brief disconnection. [#339](https://github.com/meteor/meteor/issues/339)

* Prevent running the `meteor` command-line tool and server on unsupported Node
  versions.

* Fix Minimongo query bug with nested objects.  [#455](https://github.com/meteor/meteor/issues/455)

* In `accounts-ui`, stop page layout from changing during login.

* Use `path.join` instead of `/` in paths (helpful for the unofficial Windows
  port) [#303](https://github.com/meteor/meteor/issues/303)

* The `spiderable` package serves pages to
  [`facebookexternalhit`](https://www.facebook.com/externalhit_uatext.php) [#411](https://github.com/meteor/meteor/issues/411)

* Fix error on Firefox with DOM Storage disabled.

* Avoid invalidating listeners if setUserId is called with current value.

* Upgrade many dependencies, including:
  * MongoDB 2.2.1 (from 2.2.0)
  * underscore 1.4.2 (from 1.3.3)
  * bootstrap 2.2.1 (from 2.1.1)
  * jQuery 1.8.2 (from 1.7.2)
  * less 1.3.1 (from 1.3.0)
  * stylus 0.30.1 (from 0.29.0)
  * coffee-script 1.4.0 (from 1.3.3)

Patches contributed by GitHub users ayal, dandv, possibilities, TomWij,
tmeasday, and workmad3.

## v0.5.0, 2012-10-17

* This release introduces Meteor Accounts, a full-featured auth system that supports
  - fine-grained user-based control over database reads and writes
  - federated login with any OAuth provider (with built-in support for
    Facebook, GitHub, Google, Twitter, and Weibo)
  - secure password login
  - email validation and password recovery
  - an optional set of UI widgets implementing standard login/signup/password
    change/logout flows

  When you upgrade to Meteor 0.5.0, existing apps will lose the ability to write
  to the database from the client. To restore this, either:
  - configure each of your collections with
    [`collection.allow`](http://docs.meteor.com/#allow) and
    [`collection.deny`](http://docs.meteor.com/#deny) calls to specify which
    users can perform which write operations, or
  - add the `insecure` smart package (which is included in new apps by default)
    to restore the old behavior where anyone can write to any collection which
    has not been configured with `allow` or `deny`

  For more information on Meteor Accounts, see
  http://docs.meteor.com/#dataandsecurity and
  http://docs.meteor.com/#accounts_api

* The new function `Meteor.autorun` allows you run any code in a reactive
  context. See http://docs.meteor.com/#meteor_autorun

* Arrays and objects can now be stored in the `Session`; mutating the value you
  retrieve with `Session.get` does not affect the value in the session.

* On the client, `Meteor.apply` takes a new `wait` option, which ensures that no
  further method calls are sent to the server until this method is finished; it
  is used for login and logout methods in order to keep the user ID
  well-defined. You can also specifiy an `onReconnect` handler which is run when
  re-establishing a connection; Meteor Accounts uses this to log back in on
  reconnect.

* Meteor now provides a compatible replacement for the DOM `localStorage`
  facility that works in IE7, in the `localstorage-polyfill` smart package.

* Meteor now packages the D3 library for manipulating documents based on data in
  a smart package called `d3`.

* `Meteor.Collection` now takes its optional `manager` argument (used to
  associate a collection with a server you've connected to with
  `Meteor.connect`) as a named option. (The old call syntax continues to work
  for now.)

* Fix a bug where trying to immediately resubscribe to a record set after
  unsubscribing could fail silently.

* Better error handling for failed Mongo writes from inside methods; previously,
  errors here could cause clients to stop processing data from the server.


Patches contributed by GitHub users bradens, dandv, dybskiy, possibilities,
zhangcheng, and 75lb.


## v0.4.2, 2012-10-02

* Fix connection failure on iOS6. SockJS 0.3.3 includes this fix.

* The new `preserve-inputs` package, included by default in new Meteor apps,
  restores the pre-v0.4.0 behavior of "preserving" all form input elements by ID
  and name during re-rendering; users who want more precise control over
  preservation can still use the APIs added in v0.4.0.

* A few changes to the `Meteor.absoluteUrl` function:
  - Added a `replaceLocalhost` option.
  - The `ROOT_URL` environment variable is respected by `meteor run`.
  - It is now included in all apps via the `meteor` package. Apps that
    explicitly added the now-deprecated `absolute-url` smart package will log a
    deprecation warning.

* Upgrade Node from 0.8.8 to 0.8.11.

* If a Handlebars helper function `foo` returns null, you can now run do
  `{{foo.bar}}` without error, just like when `foo` is a non-existent property.

* If you pass a non-scalar object to `Session.set`, an error will now be thrown
  (matching the behavior of `Session.equals`). [#215](https://github.com/meteor/meteor/issues/215)

* HTML pages are now served with a `charset=utf-8` Content-Type header. [#264](https://github.com/meteor/meteor/issues/264)

* The contents of `<select>` tags can now be reactive even in IE 7 and 8.

* The `meteor` tool no longer gets confused if a parent directory of your
  project is named `public`. [#352](https://github.com/meteor/meteor/issues/352)

* Fix a race condition in the `spiderable` package which could include garbage
  in the spidered page.

* The REPL run by `admin/node.sh` no longer crashes Emacs M-x shell on exit.

* Refactor internal `reload` API.

* New internal `jsparse` smart package. Not yet exposed publicly.


Patch contributed by GitHub user yanivoliver.


## v0.4.1, 2012-09-24

* New `email` smart package, with [`Email.send`](http://docs.meteor.com/#email)
  API.

* Upgrade Node from 0.6.17 to 0.8.8, as well as many Node modules in the dev
  bundle; those that are user-exposed are:
  * coffee-script: 1.3.3 (from 1.3.1)
  * stylus: 0.29.0 (from 0.28.1)
  * nib: 0.8.2 (from 0.7.0)

* All publicly documented APIs now use `camelCase` rather than
  `under_scores`. The old spellings continue to work for now. New names are:
  - `Meteor.isClient`/`isServer`
  - `this.isSimulation` inside a method invocation
  - `Meteor.deps.Context.onInvalidate`
  - `Meteor.status().retryCount`/`retryTime`

* Spark improvements
  * Optimize selector matching for event maps.
  * Fix `Spark._currentRenderer` behavior in timer callbacks.
  * Fix bug caused by interaction between `Template.foo.preserve` and
    `{{#constant}}`. [#323](https://github.com/meteor/meteor/issues/323)
  * Allow `{{#each}}` over a collection of objects without `_id`. [#281](https://github.com/meteor/meteor/issues/281)
  * Spark now supports Firefox 3.6.
  * Added a script to build a standalone spark.js that does not depend on
    Meteor (it depends on jQuery or Sizzle if you need IE7 support,
    and otherwise is fully standalone).

* Database writes from within `Meteor.setTimeout`/`setInterval`/`defer` will be
  batched with other writes from the current method invocation if they start
  before the method completes.

* Make `Meteor.Cursor.forEach` fully synchronous even if the user's callback
  yields. [#321](https://github.com/meteor/meteor/issues/321).

* Recover from exceptions thrown in `Meteor.publish` handlers.

* Upgrade bootstrap to version 2.1.1. [#336](https://github.com/meteor/meteor/issues/336), [#337](https://github.com/meteor/meteor/issues/337), [#288](https://github.com/meteor/meteor/issues/288), [#293](https://github.com/meteor/meteor/issues/293)

* Change the implementation of the `meteor deploy` password prompt to not crash
  Emacs M-x shell.

* Optimize `LocalCollection.remove(id)` to be O(1) rather than O(n).

* Optimize client-side database performance when receiving updated data from the
  server outside of method calls.

* Better error reporting when a package in `.meteor/packages` does not exist.

* Better error reporting for coffeescript. [#331](https://github.com/meteor/meteor/issues/331)

* Better error handling in `Handlebars.Exception`.


Patches contributed by GitHub users fivethirty, tmeasday, and xenolf.


## v0.4.0, 2012-08-30

* Merge Spark, a new live page update engine
  * Breaking API changes
     * Input elements no longer preserved based on `id` and `name`
       attributes. Use [`preserve`](http://docs.meteor.com/#template_preserve)
       instead.
     * All `Meteor.ui` functions removed. Use `Meteor.render`,
       `Meteor.renderList`, and
       [Spark](https://github.com/meteor/meteor/wiki/Spark) functions instead.
     * New template functions (eg. `created`, `rendered`, etc) may collide with
       existing helpers. Use `Template.foo.helpers()` to avoid conflicts.
     * New syntax for declaring event maps. Use
       `Template.foo.events({...})`. For backwards compatibility, both syntaxes
       are allowed for now.
  * New Template features
     * Allow embedding non-Meteor widgets (eg. Google Maps) using
       [`{{#constant}}`](http://docs.meteor.com/#constant)
     * Callbacks when templates are rendered. See
       http://docs.meteor.com/#template_rendered
     * Explicit control of which nodes are preserved during re-rendering. See
       http://docs.meteor.com/#template_preserve
     * Easily find nodes within a template in event handlers and callbacks. See
       http://docs.meteor.com/#template_find
     * Allow parts of a template to be independently reactive with the
       [`{{#isolate}}`](http://docs.meteor.com/#isolate) block helper.

* Use PACKAGE_DIRS environment variable to override package location. [#227](https://github.com/meteor/meteor/issues/227)

* Add `absolute-url` package to construct URLs pointing to the application.

* Allow modifying documents returned by `observe` callbacks. [#209](https://github.com/meteor/meteor/issues/209)

* Fix periodic crash after client disconnect. [#212](https://github.com/meteor/meteor/issues/212)

* Fix minimingo crash on dotted queries with undefined keys. [#126](https://github.com/meteor/meteor/issues/126)


## v0.3.9, 2012-08-07

* Add `spiderable` package to allow web crawlers to index Meteor apps.

* `meteor deploy` uses SSL to protect application deployment.

* Fix `stopImmediatePropagation()`. [#205](https://github.com/meteor/meteor/issues/205)


## v0.3.8, 2012-07-12

* HTTPS support
  * Add `force-ssl` package to require site to load over HTTPS.
  * Use HTTPS for install script and `meteor update`.
  * Allow runtime configuration of default DDP endpoint.

* Handlebars improvements
  * Implement dotted path traversal for helpers and methods.
  * Allow functions in helper arguments.
  * Change helper nesting rules to allow functions as arguments.
  * Fix `{{this.foo}}` to never invoke helper `foo`.
  * Make event handler `this` reflect the node that matched the selector instead
    of the event target node.
  * Fix keyword arguments to helpers.

* Add `nib` support to stylus package. [#175](https://github.com/meteor/meteor/issues/175)

* Upgrade bootstrap to version 2.0.4. [#173](https://github.com/meteor/meteor/issues/173)

* Print changelog after `meteor update`.

* Fix mouseenter and mouseleave events. [#224](https://github.com/meteor/meteor/issues/224)

* Fix issue with spurious heartbeat failures on busy connections.

* Fix exception in minimongo when matching non-arrays using `$all`. [#183](https://github.com/meteor/meteor/issues/183)

* Fix serving an empty file when no cacheable assets exist. [#179](https://github.com/meteor/meteor/issues/179)


## v0.3.7, 2012-06-06

* Better parsing of `.html` template files
  * Allow HTML comments (`<!-- -->`) at top level
  * Allow whitespace anywhere in open/close tag
  * Provide names and line numbers on error
  * More helpful error messages

* Form control improvements
  * Fix reactive radio buttons in Internet Explorer.
  * Fix reactive textareas to update consistently across browsers, matching text
    field behavior.

* `http` package bug fixes:
  * Send correct Content-Type when POSTing `params` from the server. [#172](https://github.com/meteor/meteor/issues/172)
  * Correctly detect JSON response Content-Type when a charset is present.

* Support `Handlebars.SafeString`. [#160](https://github.com/meteor/meteor/issues/160)

* Fix intermittent "Cursor is closed" mongo error.

* Fix "Cannot read property 'nextSibling' of null" error in certain nested
  templates. [#142](https://github.com/meteor/meteor/issues/142)

* Add heartbeat timer on the client to notice when the server silently goes
  away.


## v0.3.6, 2012-05-16

* Rewrite event handling. `this` in event handlers now refers to the data
  context of the element that generated the event, *not* the top-level data
  context of the template where the event is declared.

* Add /websocket endpoint for raw websockets. Pass websockets through
  development mode proxy.

* Simplified API for Meteor.connect, which now receives a URL to a Meteor app
  rather than to a sockjs endpoint.

* Fix livedata to support subscriptions with overlapping documents.

* Update node.js to 0.6.17 to fix potential security issue.


## v0.3.5, 2012-04-28

* Fix 0.3.4 regression: Call event map handlers on bubbled events. [#107](https://github.com/meteor/meteor/issues/107)


## v0.3.4, 2012-04-27

* Add Twitter `bootstrap` package. [#84](https://github.com/meteor/meteor/issues/84)

* Add packages for `sass` and `stylus` CSS pre-processors. [#40](https://github.com/meteor/meteor/issues/40), [#50](https://github.com/meteor/meteor/issues/50)

* Bind events correctly on top level elements in a template.

* Fix dotted path selectors in minimongo. [#88](https://github.com/meteor/meteor/issues/88)

* Make `backbone` package also run on the server.

* Add `bare` option to coffee-script compilation so variables can be shared
  between multiple coffee-script file. [#85](https://github.com/meteor/meteor/issues/85)

* Upgrade many dependency versions. User visible highlights:
 * node.js 0.6.15
 * coffee-script 1.3.1
 * less 1.3.0
 * sockjs 0.3.1
 * underscore 1.3.3
 * backbone 0.9.2

* Several documentation fixes and test coverage improvements.


## v0.3.3, 2012-04-20

* Add `http` package for making HTTP requests to remote servers.

* Add `madewith` package to put a live-updating Made with Meteor badge on apps.

* Reduce size of mongo database on disk (--smallfiles).

* Prevent unnecessary hot-code pushes on deployed apps during server migration.

* Fix issue with spaces in directory names. [#39](https://github.com/meteor/meteor/issues/39)

* Workaround browser caching issues in development mode by using query
  parameters on all JavaScript and CSS requests.

* Many documentation and test fixups.


## v0.3.2, 2012-04-10

* Initial public launch
