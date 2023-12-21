
## v1.12.2, 2021-10-12

#### Meteor Version Release

* `meteor-tool@1.12.2`
    - Patch to make 1.12.2 compatible with Push to Deploy feature in Galaxy (Meteor Cloud)

## v1.12.1, 2021-01-06

### Breaking changes

N/A

### Migration steps

N/A

### Changes

#### Highlights

- Node.js 12.20.1 [release notes](https://nodejs.org/en/blog/vulnerability/january-2021-security-releases/)
- Fixes problem on IE because of modern syntax on `dynamic-import` package.

#### Meteor Version Release

* `dynamic-import@0.5.5`
    - Fixes problem on IE because of modern syntax (arrow function).

* `meteor-babel@7.10.6`
    - Allows to disable sourceMap generation [#36](https://github.com/meteor/babel/pull/36)

* `babel-compiler@7.5.5`
    - Allows to disable sourceMap generation [#36](https://github.com/meteor/babel/pull/36)

## v1.12, 2020-12-04

### Breaking changes

- When importing types, you might need to use the "type" qualifier, like so:
```js
import { Point } from 'react-easy-crop/types';
```
to
```ts
import type { Point } from 'react-easy-crop/types';
```
Because now emitDecoratorsMetadata is enabled.

- Refer to typescript breaking changes before migrating your existing project, from 3.7.6 to 4.1.2: https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes

### Migration steps

N/A

### Changes

#### Highlights
- TypeScript update from 3.7.6 to 4.1.2.
    - enables decorators and metadata reflection. Important: these are stage 2 features so be aware that breaking changes could be introduced before they reach stage 3.

#### Meteor Version Release
* `meteor-tool@1.12`
    - updates TypeScript to 4.1.2. [#11225](https://github.com/meteor/meteor/pull/11225) and [#11255](https://github.com/meteor/meteor/pull/11255)
    - adds new options for `meteor list` command (TODO pending link to updated doc). [#11165](https://github.com/meteor/meteor/pull/11165)
    - supports Cordova add plugin command working again with plugin id or plugin name in the git URL as it was before Meteor 1.11. [#11202](https://github.com/meteor/meteor/pull/11202)
    - avoids MiTM by downloading through https. [#11188](https://github.com/meteor/meteor/pull/11188)

* `meteor-babel@7.10.5`
    - updates TypeScript to 4.1.2 and enables decorators and metadata reflection. [#11225](https://github.com/meteor/meteor/pull/11225) and [#11255](https://github.com/meteor/meteor/pull/11255)

* `minimongo@1.6.1`
    - fixes a null reference exception, if an array contains null values while compiling a fields projection. [#10499](https://github.com/meteor/meteor/pull/10499).

* `accounts-password@1.6.3`
    - adds a new function `createUserVerifyingEmail` (TODO pending link to updated doc). [#11080](https://github.com/meteor/meteor/pull/11080)
    - fixes a typo. [#11182](https://github.com/meteor/meteor/pull/11182)

* `browser-content-policy@1.1.1`
    - adds support to nonce
  ```js
    BrowserPolicy.content.allowScriptOrigin(`nonce-${nonce}`);
  ```

* `accounts-ui@1.3.2`
    - follow accounts-ui-unstyled release

* `accounts-ui-unstyled@1.4.3`
    - fixes the login form would send the server two login requests
    - fixes the "forgot password" form would not only send the email but also refresh the page

* `dynamic-import@0.5.4`
    - fixes prefetching errors. [#11209](https://github.com/meteor/meteor/pull/11209)
    - adds the option for dynamic-imports to fetch from the current origin instead of the absolute URL. [#11105](https://github.com/meteor/meteor/pull/11105)

* `mongo-decimal@0.1.2`
    - updates npm dependency `decimal.js` to v10.2.1

* `accounts-base@1.7.1`
    - adds the ability to define default user fields published on login. [#11118](https://github.com/meteor/meteor/pull/11118)

* `standard-minifier-css@1.7.0`
    - modernize and update dependencies. [#11196](https://github.com/meteor/meteor/pull/11196)


#### Independent Releases
* `facebook-oauth@1.7.3`
    - is now using Facebook GraphAPI v8. [#11160](https://github.com/meteor/meteor/pull/11160)

## v1.11.1, 2020-09-16

### Breaking changes

N/A

### Migration steps

N/A

### Changes

* `--apollo` skeleton was missing client cache setup [more](https://github.com/meteor/meteor/pull/11146)

* `--vue` skeleton was updated to use proper folder structure [more](https://github.com/meteor/meteor/pull/11174)

* All skeletons got their `npm` dependencies updated. [more](https://github.com/meteor/meteor/pull/11172)

* Node.js has been updated to version [12.18.4](https://nodejs.org/en/blog/release/v12.18.4/), this is a [security release](https://nodejs.org/en/blog/vulnerability/september-2020-security-releases/)

* Updated npm to version 6.14.8 [more](https://blog.npmjs.org/post/626732790304686080/release-6148)

* `npm-mongo` version 3.8.1 was published, updating `mongodb` to [3.6.2](https://github.com/mongodb/node-mongodb-native/releases/tag/v3.6.2) [more](https://github.com/advisories/GHSA-pp7h-53gx-mx7r)

* Updated PostCSS from 7.0.31 to 7.0.32 [more](https://github.com/meteor/meteor/issues/10682)

* Allow android-webview-video-poster [more](https://github.com/meteor/meteor/pull/11159)

## v1.11, 2020-08-18

### Breaking changes

* `email` package dependencies have been update and package version has been bumped to 2.0.0
  There is a potential breaking change as the underlying package started to use `dns.resolve()`
  instead of `dns.lookup()` which might be breaking on some environments.
  See [nodemailer changelog](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md) for more information.

* (Added later) Cordova add plugin is not working with plugin name in the git URL when the plugin id was different than the name in the config.xml. Fixed on [#11202](https://github.com/meteor/meteor/pull/11202)

### Migration steps

N/A

### Changes

* `meteor create --apollo` is now available thanks to [@StorytellerCZ](https://github.com/StorytellerCZ). PR [#11119](https://github.com/meteor/meteor/pull/11119)

* `meteor create --vue` is now available thanks to [@chris-visser](https://github.com/chris-visser). PR [#11086](https://github.com/meteor/meteor/pull/11086)

* `--cache-build` option is now available on `meteor deploy` command and you can use it safely all the time if you are using a Git repository to run your deploy. This is helpful if your upload is failing then you can retry just the upload and also if you deploy the same bundle to multiple environments. [Read more](https://galaxy-guide.meteor.com/deploy-command-line.html#cache-build)

* Multiple optimizations in build performance, many of them for Windows thanks to [@zodern](https://github.com/zodern). PRs [#10838](https://github.com/meteor/meteor/pull/10838), [#11114](https://github.com/meteor/meteor/pull/11114), [#11115](https://github.com/meteor/meteor/pull/11115), [#11102](https://github.com/meteor/meteor/pull/11102), [#10839](https://github.com/meteor/meteor/pull/10839)

* Fixes error when removing cordova plugin that depends on cli variables. PR [#10976](https://github.com/meteor/meteor/pull/11052)

* `email` package now exposes `hookSend` that runs before emails are send.

* Node.js has been updated to version
  [12.18.3](https://nodejs.org/en/blog/release/v12.18.3/)

* Updated npm to version 6.14.5

* `mongodb` driver npm dependency has been updated to 3.6.0

* The version of MongoDB used by Meteor in development has been updated
  from 4.2.5 to 4.2.8

## v1.10.2, 2020-04-21

### Breaking changes

* The `babel-compiler` package, used by both `ecmascript` and
  `typescript`, no longer supports stripping [Flow](https://flow.org/)
  type annotations by default, which may be a breaking change if your
  application (or Meteor package) relied on Flow syntax.

### Migration steps

* If you still need Babel's Flow plugins, you can install them with npm
  and then enable them with a custom `.babelrc` file in your application's
  (or package's) root directory:
  ```json
  {
    "plugins": [
      "@babel/plugin-syntax-flow",
      "@babel/plugin-transform-flow-strip-types"
    ]
  }
  ```

### Changes

* Adds support to override MongoDB options via Meteor settings. Code PR
  [#10976](https://github.com/meteor/meteor/pull/10976), Docs PR
  [#662](https://github.com/meteor/docs/pull/662)

* The `meteor-babel` npm package has been updated to version 7.9.0.

* The `typescript` npm package has been updated to version 3.8.3.

* To pass Node command line flags to the server node instance,
  now it is recommended to use `SERVER_NODE_OPTIONS` instead of `NODE_OPTIONS`.
  Since Meteor 0.5.3, Meteor allowed to pass node command line flags via the  `NODE_OPTIONS`
  environment variable.
  However, since Node version 8 / Meteor 1.6 this has become a default node
  envar with the same behavior. The side effect is that this now also affects
  Meteor tool. The command line parameters could already be set separately
  via the `TOOL_NODE_FLAGS` envar. This is now also possible (again) for the server.

* The version of MongoDB used by Meteor in development has been updated from
  4.2.1 to 4.2.5.
  [PR #11020](https://github.com/meteor/meteor/pull/11020)

* The `url` package now provides an isomorphic implementation of the [WHATWG `url()`
  API](https://url.spec.whatwg.org/).
  While remaining backwards compatible, you can now also import `URL` and `URLSearchParams` from `meteor/url`.
  These will work for both modern and legacy browsers as well as node.


## v1.10.1, 2020-03-12

### Breaking changes

* Cordova has been updated from version 7 to 9. We recommend that you test
  your features that are taking advantage of Cordova plugins to be sure
  they are still working as expected.

    * WKWebViewOnly is set by default now as true so if you are relying on
      UIWebView or plugins that are using UIWebView APIs you probably want to
      set it as false, you can do this by calling
      `App.setPreference('WKWebViewOnly', false);` in your mobile-config.js. But we
      don't recommend turning this into false because
      [Apple have said](https://developer.apple.com/news/?id=12232019b) they are
      going to reject apps using UIWebView.

* Because MongoDB since 3.4 no longer supports 32-bit Windows, Meteor 1.10 has
  also dropped support for 32-bit Windows. In other words, Meteor 1.10 supports
  64-bit Mac, Windows 64-bit, and Linux 64-bit.

### Migration Steps
* If you get `Unexpected mongo exit code 62. Restarting.` when starting your local
  MongoDB, you can either reset your project (`meteor reset`)
  (if you don't care about your local data)
  or you will need to update the feature compatibility version of your local MongoDB:

    1. Downgrade your app to earlier version of Meteor `meteor update --release 1.9.2`
    2. Start your application
    3. While your application is running open a new terminal window, navigate to the
       app directory and open `mongo` shell: `meteor mongo`
    4. Use: `db.adminCommand({ getParameter: 1, featureCompatibilityVersion: 1 })` to
       check the current feature compatibility.
    5. If the returned version is less than 4.0 update like this:
       `db.adminCommand({ setFeatureCompatibilityVersion: "4.2" })`
    6. You can now stop your app and update to Meteor 1.10.

  For more information about this, check out [MongoDB documentation](https://docs.mongodb.com/manual/release-notes/4.2-upgrade-standalone/).

### Changes

* The version of MongoDB used by Meteor in development has been updated
  from 4.0.6 to 4.2.1, and the `mongodb` driver package has been updated
  from 3.2.7 to 3.5.4, thanks to [@klaussner](https://github.com/klaussner).
  [Feature #361](https://github.com/meteor/meteor-feature-requests/issues/361)
  [PR #10723](https://github.com/meteor/meteor/pull/10723)

* The `npm` command-line tool used by the `meteor npm` command (and by
  Meteor internally) has been updated to version 6.14.0, and our
  [fork](https://github.com/meteor/pacote/tree/v9.5.12-meteor) of its
  `pacote` dependency has been updated to version 9.5.12.

* Cordova was updated from version 7 to 9
    * cordova-lib from 7.1.0 to 9.0.1 [release notes](https://github.com/apache/cordova-lib/blob/master/RELEASENOTES.md)
    * cordova-common from 2.1.1 to 3.2.1 [release notes](https://github.com/apache/cordova-common/blob/master/RELEASENOTES.md)
    * cordova-android from 7.1.4 to 8.1.0 [release notes](https://github.com/apache/cordova-android/blob/master/RELEASENOTES.md)
    * cordova-ios from 4.5.5 to 5.1.1 [release notes](https://github.com/apache/cordova-ios/blob/master/RELEASENOTES.md)
    * cordova-plugin-wkwebview-engine from 1.1.4 to 1.2.1 [release notes](https://github.com/apache/cordova-plugin-wkwebview-engine/blob/master/RELEASENOTES.md#121-jul-20-2019)
    * cordova-plugin-whitelist from 1.3.3 to 1.3.4 [release notes](https://github.com/apache/cordova-plugin-whitelist/blob/master/RELEASENOTES.md#134-jun-19-2019)
    * cordova-plugin-splashscreen (included by mobile-experience > launch-screen)
      from 4.1.0 to 5.0.3 [release notes](https://github.com/apache/cordova-plugin-splashscreen/blob/master/RELEASENOTES.md#503-may-09-2019)
    * cordova-plugin-statusbar (included by mobile-experience > mobile-status-bar)
      from 2.3.0 to 2.4.3 [release notes](https://github.com/apache/cordova-plugin-statusbar/blob/master/RELEASENOTES.md#243-jun-19-2019)
    * On iOS WKWebViewOnly is set by default now as true.
    * On iOS the Swift version is now set by default to `5` this change can make
      your app to produce some warnings if your plugins are using old Swift code.
      You can override the Swift version using
      `App.setPreference('SwiftVersion', 4.2);` but we don't recommend that.

* New command to ensure that Cordova dependencies are installed. Usage:
  `meteor ensure-cordova-dependencies`. Meteor handles this automatically but in
  some cases, like running in a CI, is useful to install them in advance.

* You can now pass an `--exclude-archs` option to the `meteor run` and
  `meteor test` commands to temporarily disable building certain web
  architectures. For example, `meteor run --exclude-archs web.browser.legacy`.
  Multiple architectures should be separated by commas. This option can be
  used to improve (re)build times if you're not actively testing the
  excluded architectures during development.
  [Feature #333](https://github.com/meteor/meteor-feature-requests/issues/333),
  [PR #10824](https://github.com/meteor/meteor/pull/10824)

* `meteor create --react app` and `--typescript` now use `useTracker` hook instead of
  `withTracker` HOC, it also uses `function` components instead of `classes`.

## v1.9.3, 2020-03-09

### Breaking changes
* The MongoDB `retryWrites` option now defaults to `true` (it previously defaulted to false). Users of database services that don't support retryWrites will experience a fatal error due to this.

### Migration Steps
* If you get the error `MongoError: This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.`, append `retryWrites=false` to your MongoDB connection string.

### Changes
* `mongodb` driver package has been updated
  from 3.2.7 to 3.5.4 [#10961](https://github.com/meteor/meteor/pull/10961)

## v1.9.2, 2020-02-20

### Breaking changes
N/A

### Migration Steps
N/A

### Changes

* Node.js has been updated to version
  [12.16.1](https://nodejs.org/en/blog/release/v12.16.1/), fixing several unintended
  [regressions](https://github.com/nodejs/node/blob/master/doc/changelogs/CHANGELOG_V12.md#12.16.1)
  introduced in 12.16.0.

* The `meteor-babel` npm package has been updated to version 7.8.2.

* The `typescript` npm package has been updated to version 3.7.5.

## v1.9.1, 2020-02-18

### Breaking changes

N/A

### Migration Steps
N/A

### Changes

* Node.js has been updated to version
  12.16.0 from 12.14.0, which includes
  security updates and small changes:
    * [12.16.0](https://nodejs.org/en/blog/release/v12.16.0/)
        * Updated V8 to [release v7.8](https://v8.dev/blog/v8-release-78) which includes improvements in performance, for example, object destructuring now is as fast as the equivalent variable assignment.
    * [12.15.0](https://nodejs.org/en/blog/release/v12.15.0/)

* `cursor.observeChanges` now accepts a second options argument.
  If your observer functions do not mutate the passed arguments, you can specify
  `{ nonMutatingCallbacks: true }`, which improves performance by reducing
  the amount of data copies.

## v1.9, 2020-01-09

### Breaking changes

* Because Node.js 12 no longer supports 32-bit Linux, Meteor 1.9 has also
  dropped support for 32-bit Linux. In other words, Meteor 1.9 supports
  64-bit Mac, Windows, and Linux, as well as 32-bit Windows.

### Migration Steps
N/A

### Changes

* Node.js has been updated to version
  [12.14.0](https://nodejs.org/en/blog/release/v12.14.0/), which includes
  several major Node.js versions since 8.17.0 (used by Meteor 1.8.3):
    * [12.0.0](https://nodejs.org/en/blog/release/v12.0.0/)
    * [11.0.0](https://nodejs.org/en/blog/release/v10.0.0/)
    * [10.0.0](https://nodejs.org/en/blog/release/v10.0.0/)
    * [9.0.0](https://nodejs.org/en/blog/release/v9.0.0/)

* The `fibers` npm package has been updated to version 4.0.3, which
  includes [changes](https://github.com/laverdet/node-fibers/pull/429)
  that may drastically reduce garbage collection pressure resulting from
  heavy `Fiber` usage.

* The `pathwatcher` npm package has been updated to use a fork of version
  8.0.2, with [PR #128](https://github.com/atom/node-pathwatcher/pull/128)
  applied.

* The `sqlite3` npm package has been updated to version 4.1.0.

* The `node-gyp` npm package has been updated to version 6.0.1, and
  `node-pre-gyp` has been updated to version 0.14.0.

* The feature that restarts the application up to two times if it crashes
  on startup has been removed.
  [Feature #335](https://github.com/meteor/meteor-feature-requests/issues/335)
  [PR #10345](https://github.com/meteor/meteor/pull/10345)

* Facebook OAuth has been updated to call v5 API endpoints. [PR #10738](https://github.com/meteor/meteor/pull/10738)

* `Meteor.user()`, `Meteor.findUserByEmail()` and `Meteor.findUserByUserName()` can take a new
  `options` parameter which can be used to limit the returned fields. Useful for minimizing
  DB bandwidth on the server and avoiding unnecessary reactive UI updates on the client.
  [Issue #10469](https://github.com/meteor/meteor/issues/10469)

* `Accounts.config()` has a new option `defaultFieldSelector` which will apply to all
  `Meteor.user()` and `Meteor.findUserBy...()` functions without explicit field selectors, and
  also to all `onLogin`, `onLogout` and `onLoginFailure` callbacks.  This is useful if you store
  large data on the user document (e.g. a growing list of transactions) which do no need to be
  retrieved from the DB whenever you or a package author call `Meteor.user()` without limiting the
  fields. [Issue #10469](https://github.com/meteor/meteor/issues/10469)

* Lots of internal calls to `Meteor.user()` without field specifiers in `accounts-base` and
  `accounts-password` packages have been optimized with explicit field selectors to only
  the fields needed by the functions they are in.
  [Issue #10469](https://github.com/meteor/meteor/issues/10469)

## v1.8.3, 2019-12-19

### Migration Steps

* If your application uses `blaze-html-templates`, the Meteor `jquery`
  package will be automatically installed in your `.meteor/packages` file
  when you update to Meteor 1.8.3. However, this new version of the Meteor
  `jquery` package no longer bundles its own copy of the `jquery` npm
  implementation, so you may need to install `jquery` from npm by running
  ```sh
  meteor npm i jquery
  ```
  in your application directory. Symptoms of not installing jquery include
  a blank browser window, with helpful error messages in the console.

### Changes

* Node has been updated to version
  [8.17.0](https://nodejs.org/en/blog/release/v8.17.0/).

* The `npm` npm package has been updated to version 6.13.4, and our
  [fork](https://github.com/meteor/pacote/tree/v9.5.11-meteor) of its
  `pacote` dependency has been updated to version 9.5.11, an important
  [security release](https://nodejs.org/en/blog/vulnerability/december-2019-security-releases/).

* Prior to Meteor 1.8.3, installing the `jquery` package from npm along
  with the Meteor `jquery` package could result in bundling jQuery twice.
  Thanks to [PR #10498](https://github.com/meteor/meteor/pull/10498), the
  Meteor `jquery` package will no longer provide its own copy of jQuery,
  but will simply display a warning in the console if the `jquery` npm
  package cannot be found in your `node_modules` directory. If you are
  using `blaze` in your application, updating to Meteor 1.8.3 will
  automatically add this new version of the Meteor `jquery` package to
  your application if you were not already using it (thanks to
  [PR #10801](https://github.com/meteor/meteor/pull/10801)), but you might
  need to run `meteor npm i jquery` manually, so that `blaze` can import
  `jquery` from your `node_modules` directory.

* The `meteor-babel` npm package has been updated to version 7.7.5.

* The `typescript` npm package has been updated to version 3.7.3.

## v1.8.2, 2019-11-14

### Breaking changes

* Module-level variable declarations named `require` or `exports` are no
  longer automatically renamed, so they may collide with module function
  parameters of the same name, leading to errors like
  `Uncaught SyntaxError: Identifier 'exports' has already been declared`.
  See [this comment](https://github.com/meteor/meteor/pull/10522#issuecomment-535535056)
  by [@SimonSimCity](https://github.com/SimonSimCity).

* `Plugin.fs` methods are now always sync and no longer accept a callback.

### Migration Steps

* Be sure to update the `@babel/runtime` npm package to its latest version
  (currently 7.7.2):
  ```sh
  meteor npm install @babel/runtime@latest
  ```

* New Meteor applications now depend on `meteor-node-stubs@1.0.0`, so it
  may be a good idea to update to the same major version:
  ```sh
  meteor npm install meteor-node-stubs@next
  ```

* If you are the author of any Meteor packages, and you encounter errors
  when using those packages in a Meteor 1.8.2 application (for example,
  `module.watch` being undefined), we recommend that you bump the minor
  version of your package and republish it using Meteor 1.8.2, so
  Meteor 1.8.2 applications will automatically use the new version of the
  package, as compiled by Meteor 1.8.2:
  ```sh
  cd path/to/your/package
  # Add api.versionsFrom("1.8.2") to Package.onUse in package.js...
  meteor --release 1.8.2 publish
  ```
  This may not be necessary for all packages, especially those that have
  been recently republished using Meteor 1.8.1, or local packages in the
  `packages/` directory (which are always recompiled from source).
  However, republishing packages is a general solution to a wide variety
  of package versioning and compilation problems, and package authors can
  make their users' lives easier by handling these issues proactively.

### Changes

* Node has been updated to version
  [8.16.2](https://nodejs.org/en/blog/release/v8.16.2/).

* The `npm` npm package has been updated to version 6.13.0, and our
  [fork](https://github.com/meteor/pacote/tree/v9.5.9-meteor) of its
  `pacote` dependency has been updated to version 9.5.9.

* New Meteor applications now include an official `typescript` package,
  supporting TypeScript compilation of `.ts` and `.tsx` modules, which can
  be added to existing apps by running `meteor add typescript`.

* New TypeScript-based Meteor applications can be created by running
  ```sh
  meteor create --typescript new-typescript-app
  ```
  This app skeleton contains a recommended tsconfig.json file, and should
  serve as a reference for how to make TypeScript and Meteor work together
  (to the best of our current knowledge).
  [PR #10695](https://github.com/meteor/meteor/pull/10695)

* When bundling modern client code, the Meteor module system now prefers
  the `"module"` field in `package.json` (if defined) over the `"main"`
  field, which should unlock various `import`/`export`-based optimizations
  such as tree shaking in future versions of Meteor. As before, server
  code uses only the `"main"` field, like Node.js, and legacy client code
  prefers `"browser"`, `"main"`, and then `"module"`.
  [PR #10541](https://github.com/meteor/meteor/pull/10541),
  [PR #10765](https://github.com/meteor/meteor/pull/10765).

* ECMAScript module syntax (`import`, `export`, and dynamic `import()`) is
  now supported by default everywhere, including in modules imported from
  `node_modules`, thanks to the [Reify](https://github.com/benjamn/reify)
  compiler.

* If you need to import code from `node_modules` that uses modern syntax
  beyond module syntax, it is now possible to enable recompilation for
  specific npm packages using the `meteor.nodeModules.recompile` option in
  your application's `package.json` file.
  See [PR #10603](https://github.com/meteor/meteor/pull/10603) for further
  explanation.

* The Meteor build process is now able to detect whether files changed in
  development were actually used by the server bundle, so that a full
  server restart can be avoided when no files used by the server bundle
  have changed. Client-only refreshes are typically much faster than
  server restarts. Run `meteor add autoupdate` to enable client refreshes,
  if you are not already using the `autoupdate` package.
  [Issue #10449](https://github.com/meteor/meteor/issues/10449)
  [PR #10686](https://github.com/meteor/meteor/pull/10686)

* The `mongodb` npm package used by the `npm-mongo` Meteor package has
  been updated to version 3.2.7.

* The `meteor-babel` npm package has been updated to version 7.7.0,
  enabling compilation of the `meteor/tools` codebase with TypeScript
  (specifically, version 3.7.2 of the `typescript` npm package).

* The `reify` npm package has been updated to version 0.20.12.

* The `core-js` npm package used by `ecmascript-runtime-client` and
  `ecmascript-runtime-server` has been updated to version 3.2.1.

* The `terser` npm package used by `minifier-js` (and indirectly by
  `standard-minifier-js`) has been updated to version 4.3.1.

* The `node-gyp` npm package has been updated to version 5.0.1, and
  `node-pre-gyp` has been updated to 0.13.0.

* The `optimism` npm package has been updated to version 0.11.3, which
  enables caching of thrown exceptions as well as ordinary results, in
  addition to performance improvements.

* The `pathwatcher` npm package has been updated to version 8.1.0.

* The `underscore` npm package installed in the Meteor dev bundle (for use
  by the `meteor/tools` codebase) has been updated from version 1.5.2 to
  version 1.9.1, and `@types/underscore` has been installed for better
  TypeScript support.

* In addition to the `.js` and `.jsx` file extensions, the `ecmascript`
  compiler plugin now automatically handles JavaScript modules with the
  `.mjs` file extension.

* Add `--cordova-server-port` option to override local port where Cordova will
  serve static resources, which is useful when multiple Cordova apps are built
  from the same application source code, since by default the port is generated
  using the ID from the application's `.meteor/.id` file.

* The `--test-app-path <directory>` option for `meteor test-packages` and
  `meteor test` now accepts relative paths as well as absolute paths.

## v1.8.1, 2019-04-03

### Breaking changes

* Although we are not aware of any specific backwards incompatibilities,
  the major upgrade of `cordova-android` from 6.4.0 to 7.1.4 likely
  deserves extra attention, if you use Cordova to build Android apps.

### Migration Steps
N/A

### Changes

* Node has been updated from version 8.11.4 to version
  [8.15.1](https://nodejs.org/en/blog/release/v8.15.1/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/february-2019-security-releases/),
  which includes the changes from four other minor releases:
    * [8.15.0](https://nodejs.org/en/blog/release/v8.15.0/)
    * [8.14.0](https://nodejs.org/en/blog/release/v8.14.0/), an important
      [security release](https://nodejs.org/en/blog/vulnerability/november-2018-security-releases/)
    * [8.12.0](https://nodejs.org/en/blog/release/v8.12.0/)
    * [8.13.0](https://nodejs.org/en/blog/release/v8.13.0/)

  > Note: While Node 8.12.0 included changes that may improve the
  performance of Meteor apps, there have been reports of CPU usage spikes
  in production due to excessive garbage collection, so this version of
  Meteor should be considered experimental until those problems have been
  fixed. [Issue #10216](https://github.com/meteor/meteor/issues/10216)

* The `npm` tool has been upgraded to version
  [6.9.0](https://github.com/npm/cli/releases/tag/v6.9.0), and our
  [fork](https://github.com/meteor/pacote/tree/v9.5.0-meteor) of its
  `pacote` dependency has been updated to version 9.5.0.

* Mongo has been upgraded to version 4.0.6 for 64-bit systems (was 4.0.2),
  and 3.2.22 for 32-bit systems (was 3.2.19). The `mongodb` npm package
  used by `npm-mongo` has been updated to version 3.1.13 (was 3.1.6).

* The `fibers` npm package has been updated to version 3.1.1, a major
  update from version 2.0.0. Building this version of `fibers` requires a
  C++11 compiler, unlike previous versions. If you deploy your Meteor app
  manually (without using Galaxy), you may need to update the version of
  `g++` used when running `npm install` in the `bundle/programs/server`
  directory.

* The `meteor-babel` npm package has been updated to version 7.3.4.

* Cordova Hot Code Push mechanism is now switching versions explicitly with
  call to `WebAppLocalServer.switchToPendingVersion` instead of trying to
  switch every time a browser reload is detected. If you use any third
  party package or have your own HCP routines implemented be sure to call
  it before forcing a browser reload. If you use the automatic reload from
  the `Reload` meteor package you do not need to do anything.
  [cordova-plugin-meteor-webapp PR #62](https://github.com/meteor/cordova-plugin-meteor-webapp/pull/62)

* Multiple Cordova-related bugs have been fixed, including Xcode 10 build
  incompatibilities and hot code push errors due to duplicated
  images/assets. [PR #10339](https://github.com/meteor/meteor/pull/10339)

* The `cordova-android` and `cordova-ios` npm dependencies have been
  updated to 7.1.4 (from 6.4.0) and 4.5.5 (from 4.5.4), respectively.

* Build performance has improved (especially on Windows) thanks to
  additional caching implemented by [@zodern](https://github.com/zodern)
  in PRs [#10399](https://github.com/meteor/meteor/pull/10399),
  [#10452](https://github.com/meteor/meteor/pull/10452),
  [#10453](https://github.com/meteor/meteor/pull/10453), and
  [#10454](https://github.com/meteor/meteor/pull/10454).

* The `meteor mongo` command no longer uses the `--quiet` option, so the
  normal startup text will be displayed, albeit without the banner about
  Mongo's free monitoring service. See this
  [MongoDB Jira issue](https://jira.mongodb.org/browse/SERVER-38862)
  for more details.

* In Meteor packages, `client/` and `server/` directories no longer have
  any special meaning. In application code, `client/` directories are
  ignored during the server build, and `server/` directories are ignored
  during the client build, as before. This special behavior previously
  applied to packages as well, but has now been removed.
  [Issue #10393](https://github.com/meteor/meteor/issues/10393)
  [PR #10414](https://github.com/meteor/meteor/pull/10414)

* If your application is using Git for version control, the current Git
  commit hash will now be exposed via the `Meteor.gitCommitHash` property
  while the app is running (in both server and client code), and also via
  the `"gitCommitHash"` property in the `star.json` file located in the
  root directory of builds produced by `meteor build`, for consumption by
  deployment tools. If you are not using Git, neither property will be
  defined. [PR #10442](https://github.com/meteor/meteor/pull/10442)

* The Meteor Tool now uses a more reliable method (the MongoDB
  [`isMaster` command](https://docs.mongodb.com/manual/reference/command/isMaster/))
  to detect when the local development database has started and is ready to
  accept read and write operations.
  [PR #10500](https://github.com/meteor/meteor/pull/10500)

* Setting the `x-no-compression` request header will prevent the `webapp`
  package from compressing responses with `gzip`, which may be useful if
  your Meteor app is behind a proxy that compresses resources with another
  compression algorithm, such as [brotli](https://github.com/google/brotli).
  [PR #10378](https://github.com/meteor/meteor/pull/10378)

## v1.8.0.2, 2019-01-07

### Breaking changes
N/A

### Migration steps
N/A

### Changes

* The [React tutorial](https://www.meteor.com/tutorials/react/creating-an-app)
  has been updated to address a number of inaccuracies due to changes in
  recent Meteor releases that were not fully incorporated back into the
  tutorial. As a reminder, Meteor now supports a `meteor create --react`
  command that can be used to create a new React-based app quickly.

* Fixed a bug where modules named with `*.app-tests.js` (or `*.tests.js`)
  file extensions sometimes could not be imported by the
  `meteor.testModule` entry point when running the `meteor test` command
  (or `meteor test --full-app`).
  [PR #10402](https://github.com/meteor/meteor/pull/10402)

* The `meteor-promise` package has been updated to version 0.8.7, which
  includes a [commit](https://github.com/meteor/promise/commit/bbe4f0d20b70417950381aea112993c4cc8c1168)
  that should prevent memory leaks when excess fibers are discarded from
  the `Fiber` pool.

* The `meteor-babel` npm package has been updated to version 7.2.0,
  improving source maps for applications with custom `.babelrc` files.

## v1.8.0.1, 2018-11-23

### Breaking changes
N/A

### Migration steps
N/A

### Changes

* The `useragent` npm package used by `webapp` and (indirectly) by the
  `modern-browsers` package has been updated from 2.2.1 to 2.3.0. The
  `chromium` browser name has been aliased to use the same minimum modern
  version as `chrome`, and browser names are now processed
  case-insensitively by the `modern-browsers` package.
  [PR #10334](https://github.com/meteor/meteor/pull/10334)

* Fixed a module caching bug that allowed `findImportedModuleIdentifiers`
  to return the same identifiers for the modern and legacy versions of a
  given module, even if the set of imported modules is different (for
  example, because Babel injects fewer `@babel/runtime/...` imports into
  modern code). Now the caching is always based on the SHA-1 hash of the
  _generated_ code, rather than trusting the hash provided by compiler
  plugins. [PR #10330](https://github.com/meteor/meteor/pull/10330)

## v1.8, 2018-10-08

### Breaking changes
N/A

### Migration Steps

* Update the `@babel/runtime` npm package to version 7.0.0 or later:
  ```sh
  meteor npm install @babel/runtime@latest
  ```

### Changes

* Although Node 8.12.0 has been released, Meteor 1.8 still uses Node
  8.11.4, due to concerns about excessive garbage collection and CPU usage
  in production. To enable Galaxy customers to use Node 8.12.0, we are
  planning a quick follow-up Meteor 1.8.1 release, which can be obtained
  by running the command
  ```bash
  meteor update --release 1.8.1-beta.n
  ```
  where `-beta.n` is the latest beta release according to the
  [releases](https://github.com/meteor/meteor/releases) page (currently
  `-beta.6`).
  [Issue #10216](https://github.com/meteor/meteor/issues/10216)
  [PR #10248](https://github.com/meteor/meteor/pull/10248)

* Meteor 1.7 introduced a new client bundle called `web.browser.legacy` in
  addition to the `web.browser` (modern) and `web.cordova` bundles.
  Naturally, this extra bundle increased client (re)build times. Since
  developers spend most of their time testing the modern bundle in
  development, and the legacy bundle mostly provides a safe fallback in
  production, Meteor 1.8 cleverly postpones building the legacy bundle
  until just after the development server restarts, so that development
  can continue as soon as the modern bundle has finished building. Since
  the legacy build happens during a time when the build process would
  otherwise be completely idle, the impact of the legacy build on server
  performance is minimal. Nevertheless, the legacy bundle still gets
  rebuilt regularly, so any legacy build errors will be surfaced in a
  timely fashion, and legacy clients can test the new legacy bundle by
  waiting a bit longer than modern clients. Applications using the
  `autoupdate` or `hot-code-push` packages will reload modern and legacy
  clients independently, once each new bundle becomes available.
  [Issue #9948](https://github.com/meteor/meteor/issues/9948)
  [PR #10055](https://github.com/meteor/meteor/pull/10055)

* Compiler plugins that call `inputFile.addJavaScript` or
  `inputFile.addStylesheet` may now delay expensive compilation work by
  passing partial options (`{ path, hash }`) as the first argument,
  followed by a callback function as the second argument, which will be
  called by the build system once it knows the module will actually be
  included in the bundle. For example, here's the old implementation of
  `BabelCompiler#processFilesForTarget`:
  ```js
  processFilesForTarget(inputFiles) {
    inputFiles.forEach(inputFile => {
      var toBeAdded = this.processOneFileForTarget(inputFile);
      if (toBeAdded) {
        inputFile.addJavaScript(toBeAdded);
      }
    });
  }
  ```
  and here's the new version:
  ```js
  processFilesForTarget(inputFiles) {
    inputFiles.forEach(inputFile => {
      if (inputFile.supportsLazyCompilation) {
        inputFile.addJavaScript({
          path: inputFile.getPathInPackage(),
          hash: inputFile.getSourceHash(),
        }, function () {
          return this.processOneFileForTarget(inputFile);
        });
      } else {
        var toBeAdded = this.processOneFileForTarget(inputFile);
        if (toBeAdded) {
          inputFile.addJavaScript(toBeAdded);
        }
      }
    });
  }
  ```
  If you are an author of a compiler plugin, we strongly recommend using
  this new API, since unnecessary compilation of files that are not
  included in the bundle can be a major source of performance problems for
  compiler plugins. Although this new API is only available in Meteor 1.8,
  you can use `inputFile.supportsLazyCompilation` to determine dynamically
  whether the new API is available, so you can support older versions of
  Meteor without having to publish multiple versions of your package. [PR
  #9983](https://github.com/meteor/meteor/pull/9983)

* New [React](https://reactjs.org/)-based Meteor applications can now be
  created using the command
  ```bash
  meteor create --react new-react-app
  ```
  Though relatively simple, this application template reflects the ideas
  of many contributors, especially [@dmihal](https://github.com/dmihal)
  and [@alexsicart](https://github.com/alexsicart), and it will no doubt
  continue to evolve in future Meteor releases.
  [Feature #182](https://github.com/meteor/meteor-feature-requests/issues/182)
  [PR #10149](https://github.com/meteor/meteor/pull/10149)

* The `.meteor/packages` file supports a new syntax for overriding
  problematic version constraints from packages you do not control.

  If a package version constraint in `.meteor/packages` ends with a `!`
  character, any other (non-`!`) constraints on that package elsewhere in
  the application will be _weakened_ to allow any version greater than or
  equal to the constraint, even if the major/minor versions do not match.

  For example, using both CoffeeScript 2 and `practicalmeteor:mocha` used
  to be impossible (or at least very difficult) because of this
  [`api.versionsFrom("1.3")`](https://github.com/practicalmeteor/meteor-mocha/blob/3a2658070a920f8846df48bb8d8c7b678b8c6870/package.js#L28)
  statement, which unfortunately constrained the `coffeescript` package to
  version 1.x. In Meteor 1.8, if you want to update `coffeescript` to
  2.x, you can relax the `practicalmeteor:mocha` constraint by putting
  ```
  coffeescript@2.2.1_1! # note the !
  ```
  in your `.meteor/packages` file. The `coffeescript` version still needs
  to be at least 1.x, so that `practicalmeteor:mocha` can count on that
  minimum. However, `practicalmeteor:mocha` will no longer constrain the
  major version of `coffeescript`, so `coffeescript@2.2.1_1` will work.

  [Feature #208](https://github.com/meteor/meteor-feature-requests/issues/208)
  [Commit 4a70b12e](https://github.com/meteor/meteor/commit/4a70b12eddef00b6700f129e90018a6076cb1681)
  [Commit 9872a3a7](https://github.com/meteor/meteor/commit/9872a3a71df033e4cf6290b75fea28f44427c0c2)

* The `npm` package has been upgraded to version 6.4.1, and our
  [fork](https://github.com/meteor/pacote/tree/v8.1.6-meteor) of its
  `pacote` dependency has been rebased against version 8.1.6.

* The `node-gyp` npm package has been updated to version 3.7.0, and the
  `node-pre-gyp` npm package has been updated to version 0.10.3.

* Scripts run via `meteor npm ...` can now use the `meteor` command more
  safely, since the `PATH` environment variable will now be set so that
  `meteor` always refers to the same `meteor` used to run `meteor npm`.
  [PR #9941](https://github.com/meteor/meteor/pull/9941)

* Minimongo's behavior for sorting fields containing an array
  is now compatible with the behavior of [Mongo 3.6+](https://docs.mongodb.com/manual/release-notes/3.6-compatibility/#array-sort-behavior).
  Note that this means it is now incompatible with the behavior of earlier MongoDB versions.
  [PR #10214](https://github.com/meteor/meteor/pull/10214)

* Meteor's `self-test` has been updated to use "headless" Chrome rather
  than PhantomJS for browser tests. PhantomJS can still be forced by
  passing the `--phantom` flag to the `meteor self-test` command.
  [PR #9814](https://github.com/meteor/meteor/pull/9814)

* Importing a directory containing an `index.*` file now works for
  non-`.js` file extensions. As before, the list of possible extensions is
  defined by which compiler plugins you have enabled.
  [PR #10027](https://github.com/meteor/meteor/pull/10027)

* Any client (modern or legacy) may now request any static JS or CSS
  `web.browser` or `web.browser.legacy` resource, even if it was built for
  a different architecture, which greatly simplifies CDN setup if your CDN
  does not forward the `User-Agent` header to the origin.
  [Issue #9953](https://github.com/meteor/meteor/issues/9953)
  [PR #9965](https://github.com/meteor/meteor/pull/9965)

* Cross-origin dynamic `import()` requests will now succeed in more cases.
  [PR #9954](https://github.com/meteor/meteor/pull/9954)

* Dynamic CSS modules (which are compiled to JS and handled like any other
  JS module) will now be properly minified in production and source mapped
  in development. [PR #9998](https://github.com/meteor/meteor/pull/9998)

* While CSS is only minified in production, CSS files must be merged
  together into a single stylesheet in both development and production.
  This merging is [cached by `standard-minifier-css`](https://github.com/meteor/meteor/blob/183d5ff9500d908d537f58d35ce6cd6d780ab270/packages/standard-minifier-css/plugin/minify-css.js#L58-L62)
  so that it does not happen on every rebuild in development, but not all
  CSS minifier packages use the same caching techniques. Thanks to
  [1ed095c36d](https://github.com/meteor/meteor/pull/9942/commits/1ed095c36d7b2915872eb0c943dae0c4f870d7e4),
  this caching is now performed within the Meteor build tool, so it works
  the same way for all CSS minifier packages, which may eliminate a few
  seconds of rebuild time for projects with lots of CSS.

* The `meteor-babel` npm package used by `babel-compiler` has been updated
  to version 7.1.0. **Note:** This change _requires_ also updating the
  `@babel/runtime` npm package to version 7.0.0-beta.56 or later:
  ```sh
  meteor npm install @babel/runtime@latest
  ```
  [`meteor-babel` issue #22](https://github.com/meteor/babel/issues/22)

* The `@babel/preset-env` and `@babel/preset-react` presets will be
  ignored by Meteor if included in a `.babelrc` file, since Meteor already
  provides equivalent/superior functionality without them. However, you
  should feel free to leave these plugins in your `.babelrc` file if they
  are needed by external tools.

* The `install` npm package used by `modules-runtime` has been updated to
  version 0.12.0.

* The `reify` npm package has been updated to version 0.17.3, which
  introduces the `module.link(id, {...})` runtime method as a replacement
  for `module.watch(require(id), {...})`. Note: in future versions of
  `reify` and Meteor, the `module.watch` runtime API will be removed, but
  for now it still exists (and is used to implement `module.link`), so
  that existing code will continue to work without recompilation.

* The `uglify-es` npm package used by `minifier-js` has been replaced with
  [`terser@3.9.2`](https://www.npmjs.com/package/terser), a fork of
  `uglify-es` that appears to be (more actively) maintained.
  [Issue #10042](https://github.com/meteor/meteor/issues/10042)

* Mongo has been updated to version 4.0.2 and the `mongodb` npm package
  used by `npm-mongo` has been updated to version 3.1.6.
  [PR #10058](https://github.com/meteor/meteor/pull/10058)
  [Feature Request #269](https://github.com/meteor/meteor-feature-requests/issues/269)

* When a Meteor application uses a compiler plugin to process files with a
  particular file extension (other than `.js` or `.json`), those file
  extensions should be automatically appended to imports that do not
  resolve as written. However, this behavior was not previously enabled
  for modules inside `node_modules`. Thanks to
  [8b04c25390](https://github.com/meteor/meteor/pull/9942/commits/8b04c253900e4ca2a194d2fcaf6fc2ce9a9085e7),
  the same file extensions that are applied to modules outside the
  `node_modules` directory will now be applied to those within it, though
  `.js` and `.json` will always be tried first.

* As foreshadowed in this [talk](https://youtu.be/vpCotlPieIY?t=29m18s)
  about Meteor 1.7's modern/legacy bundling system
  ([slides](https://slides.com/benjamn/meteor-night-may-2018#/46)), Meteor
  now provides an isomorphic implementation of the [WHATWG `fetch()`
  API](https://fetch.spec.whatwg.org/), which can be installed by running
  ```sh
  meteor add fetch
  ```
  This package is a great demonstration of the modern/legacy bundling
  system, since it has very different implementations in modern
  browsers, legacy browsers, and Node.
  [PR #10029](https://github.com/meteor/meteor/pull/10029)

* The [`bundle-visualizer`
  package](https://github.com/meteor/meteor/tree/release-1.7.1/packages/non-core/bundle-visualizer)
  has received a number of UI improvements thanks to work by
  [@jamesmillerburgess](https://github.com/jamesmillerburgess) in
  [PR #10025](https://github.com/meteor/meteor/pull/10025).
  [Feature #310](https://github.com/meteor/meteor-feature-requests/issues/310)

* Sub-resource integrity hashes (sha512) can now be enabled for static CSS
  and JS assets by calling `WebAppInternals.enableSubresourceIntegrity()`.
  [PR #9933](https://github.com/meteor/meteor/pull/9933)
  [PR #10050](https://github.com/meteor/meteor/pull/10050)

* The environment variable `METEOR_PROFILE=milliseconds` now works for the
  build portion of the `meteor build` and `meteor deploy` commands.
  [Feature #239](https://github.com/meteor/meteor-feature-requests/issues/239)

* Babel compiler plugins will now receive a `caller` option of the
  following form:
  ```js
  { name: "meteor", arch }
  ```
  where `arch` is the target architecture, e.g. `os.*`, `web.browser`,
  `web.cordova`, or `web.browser.legacy`.
  [PR #10211](https://github.com/meteor/meteor/pull/10211)

## v1.7.0.5, 2018-08-16

### Breaking changes
N/A

### Migration Steps
N/A

### Changes

* Node has been updated to version
  [8.11.4](https://nodejs.org/en/blog/release/v8.11.4/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/august-2018-security-releases/).

## v1.7.0.4, 2018-08-07

### Breaking changes
N/A

### Migration Steps
N/A

### Changes

* The npm package `@babel/runtime`, which is depended on by most Meteor
  apps, introduced a breaking change in version `7.0.0-beta.56` with the
  removal of the `@babel/runtime/helpers/builtin` directory. While this
  change has clear benefits in the long term, in the short term it has
  been disruptive for Meteor 1.7.0.x applications that accidentally
  updated to the latest version of `@babel/runtime`. Meteor 1.7.0.4 is a
  patch release that provides better warnings about this problem, and
  ensures newly created Meteor applications do not use `7.0.0-beta.56`.
  [PR #10134](https://github.com/meteor/meteor/pull/10134)

* The `npm` package has been upgraded to version 6.3.0, and our
  [fork](https://github.com/meteor/pacote/tree/v8.1.6-meteor) of its
  `pacote` dependency has been rebased against version 8.1.6.
  [Issue #9940](https://github.com/meteor/meteor/issues/9940)

* The `reify` npm package has been updated to version 0.16.4.

## v1.7.0.3, 2018-06-13

### Breaking changes
N/A

### Migration Steps
N/A

### Changes

* Fixed [Issue #9991](https://github.com/meteor/meteor/issues/9991),
  introduced in
  [Meteor 1.7.0.2](https://github.com/meteor/meteor/pull/9990)
  by [PR #9977](https://github.com/meteor/meteor/pull/9977).

## v1.7.0.2, 2018-06-13

### Breaking changes
N/A

### Migration Steps
N/A

### Changes

* Node has been updated to version
  [8.11.3](https://nodejs.org/en/blog/release/v8.11.3/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/june-2018-security-releases/).

* The `meteor-babel` npm package has been updated to version
  [7.0.0-beta.51](https://github.com/babel/babel/releases/tag/v7.0.0-beta.51).

* Meteor apps created with `meteor create` or `meteor create --minimal`
  will now have a directory called `tests/` rather than `test/`, so that
  test code will not be eagerly loaded if you decide to remove the
  `meteor.mainModule` configuration from `package.json`, thanks to
  [PR #9977](https://github.com/meteor/meteor/pull/9977) by
  [@robfallows](https://github.com/robfallows).
  [Issue #9961](https://github.com/meteor/meteor/issues/9961)

## v1.7.0.1, 2018-05-29

### Breaking changes

* The `aggregate` method of raw Mongo collections now returns an
  `AggregationCursor` rather than returning the aggregation result
  directly. To obtain an array of aggregation results, you will need to
  call the `.toArray()` method of the cursor:
  ```js
  // With MongoDB 2.x, callback style:
  rawCollection.aggregate(
    pipeline,
    (error, results) => {...}
  );

  // With MongoDB 2.x, wrapAsync style:
  const results = Meteor.wrapAsync(
    rawCollection.aggregate,
    rawCollection
  )(pipeline);

  // With MongoDB 3.x, callback style:
  rawCollection.aggregate(
    pipeline,
    (error, aggregationCursor) => {
      ...
      const results = aggregationCursor.toArray();
      ...
    }
  );

  // With MongoDB 3.x, wrapAsync style:
  const results = Meteor.wrapAsync(
    rawCollection.aggregate,
    rawCollection
  )(pipeline).toArray();
  ```
  [Issue #9936](https://github.com/meteor/meteor/issues/9936)

### Migration Steps

* Update `@babel/runtime` (as well as other Babel-related packages) and
  `meteor-node-stubs` to their latest versions:
  ```sh
  meteor npm install @babel/runtime@latest meteor-node-stubs@latest
  ```

### Changes

* Reverted an [optimization](https://github.com/meteor/meteor/pull/9825)
  introduced in Meteor 1.7 to stop scanning `node_modules` for files that
  might be of interest to compiler plugins, since the intended workarounds
  (creating symlinks) did not satisfy all existing use cases. We will
  revisit this optimization in Meteor 1.8.
  [mozfet/meteor-autoform-materialize#43](https://github.com/mozfet/meteor-autoform-materialize/issues/43)

* After updating to Meteor 1.7 or 1.7.0.1, you should update the
  `@babel/runtime` npm package (as well as other Babel-related packages)
  to their latest versions, along with the `meteor-node-stubs` package,
  by running the following command:
  ```sh
  meteor npm install @babel/runtime@latest meteor-node-stubs@latest
  ```

## v1.7, 2018-05-28

### Breaking changes
N/A

### Migration Steps
N/A

### Changes

* More than 80% of internet users worldwide have access to a web browser
  that natively supports the latest ECMAScript features and keeps itself
  updated automatically, which means new features become available almost
  as soon as they ship. In other words, the future we envisioned when we
  first began [compiling code with
  Babel](https://blog.meteor.com/how-much-does-ecmascript-2015-cost-2ded41d70914)
  is finally here, yet most web frameworks and applications still compile
  a single client-side JavaScript bundle that must function simultaneously
  in the oldest and the newest browsers the application developer wishes
  to support.

  That choice is understandable, because the alternative is daunting: not
  only must you build multiple JavaScript and CSS bundles for different
  browsers, with different dependency graphs and compilation rules and
  webpack configurations, but your server must also be able to detect the
  capabilities of each visiting client, so that it can deliver the
  appropriate assets at runtime. Testing a matrix of different browsers
  and application versions gets cumbersome quickly, so it's no surprise
  that responsible web developers would rather ship a single, well-tested
  bundle, and forget about taking advantage of modern features until
  legacy browsers have disappeared completely.

  With Meteor 1.7, this awkward balancing act is no longer necessary,
  because Meteor now automatically builds two sets of client-side assets,
  one tailored to the capabilities of modern browsers, and the other
  designed to work in all supported browsers, thus keeping legacy browsers
  working exactly as they did before. Best of all, the entire Meteor
  community relies on the same system, so any bugs or differences in
  behavior can be identified and fixed quickly.

  In this system, a "modern" browser can be loosely defined as one with
  full native support for `async` functions and `await` expressions, which
  includes more than 80% of the world market, and 85% of the US market
  ([source](https://caniuse.com/#feat=async-functions)). This standard may
  seem extremely strict, since `async`/`await` was [just finalized in
  ECMAScript 2017](http://2ality.com/2016/10/async-function-tips.html),
  but the statistics clearly justify it. As another example, any modern
  browser can handle native `class` syntax, though newer syntax like class
  fields may still need to be compiled for now, whereas a legacy browser
  will need compilation for both advanced and basic `class` syntax. And of
  course you can safely assume that any modern browser has a native
  `Promise` implementation, because `async` functions must return
  `Promise`s. The list goes on and on.

  This boundary between modern and legacy browsers is designed to be tuned
  over time, not only by the Meteor framework itself but also by each
  individual Meteor application. For example, here's how the minimum
  versions for native ECMAScript `class` support might be expressed:

  ```js
  import { setMinimumBrowserVersions } from "meteor/modern-browsers";

  setMinimumBrowserVersions({
    chrome: 49,
    firefox: 45,
    edge: 12,
    ie: Infinity, // Sorry, IE11.
    mobile_safari: [9, 2], // 9.2.0+
    opera: 36,
    safari: 9,
    electron: 1,
  }, "classes");
  ```

  The minimum modern version for each browser is simply the maximum of all
  versions passed to `setMinimumBrowserVersions` for that browser. The
  Meteor development server decides which assets to deliver to each client
  based on the `User-Agent` string of the HTTP request. In production,
  different bundles are named with unique hashes, which prevents cache
  collisions, though Meteor also sets the `Vary: User-Agent` HTTP response
  header to let well-behaved clients know they should cache modern and
  legacy resources separately.

  For the most part, the modern/legacy system will transparently determine
  how your code is compiled, bundled, and delivered&mdash;and yes, it
  works with every existing part of Meteor, including dynamic `import()`
  and even [the old `appcache`
  package](https://github.com/meteor/meteor/pull/9776). However, if you're
  writing dynamic code that depends on modern features, you can use the
  boolean `Meteor.isModern` flag to detect the status of the current
  environment (Node 8 is modern, too, of course). If you're writing a
  Meteor package, you can call `api.addFiles(files, "legacy")` in your
  `package.js` configuration file to add extra files to the legacy bundle,
  or `api.addFiles(files, "client")` to add files to all client bundles,
  or `api.addFiles(files, "web.browser")` to add files only to the modern
  bundle, and the same rules apply to `api.mainModule`. Just be sure to
  call `setMinimumBrowserVersions` (in server startup code) to enforce
  your assumptions about ECMAScript feature support.

  We think this modern/legacy system is one of the most powerful features
  we've added since we first introduced the `ecmascript` package in Meteor
  1.2, and we look forward to other frameworks attempting to catch up.

  [PR #9439](https://github.com/meteor/meteor/pull/9439)

* Although Meteor does not recompile packages installed in `node_modules`
  by default, compilation of specific npm packages (for example, to
  support older browsers that the package author neglected) can now be
  enabled in one of two ways:

    * Clone the package repository into your application's `imports`
      directory, make any modifications necessary, then use `npm install` to
      link `the-package` into `node_modules`:
      ```sh
      meteor npm install imports/the-package
      ```
      Meteor will compile the contents of the package exposed via
      `imports/the-package`, and this compiled code will be used when you
      import `the-package` in any of the usual ways:
      ```js
      import stuff from "the-package"
      require("the-package") === require("/imports/the-package")
      import("the-package").then(...)
      ```
      This reuse of compiled code is the critical new feature that was added
      in Meteor 1.7.

    * Install the package normally with `meteor npm install the-package`,
      then create a symbolic link *to* the installed package elsewhere in
      your application, outside of `node_modules`:
      ```sh
      meteor npm install the-package
      cd imports
      ln -s ../node_modules/the-package .
      ```
      Again, Meteor will compile the contents of the package because they
      are exposed outside of `node_modules`, and the compiled code will be
      used whenever `the-package` is imported from `node_modules`.

      > Note: this technique also works if you create symbolic links to
      individual files, rather than linking the entire package directory.

  In both cases, Meteor will compile the exposed code as if it was part of
  your application, using whatever compiler plugins you have installed.
  You can influence this compilation using `.babelrc` files or any other
  techniques you would normally use to configure compilation of
  application code. [PR #9771](https://github.com/meteor/meteor/pull/9771)
  [Feature #6](https://github.com/meteor/meteor-feature-requests/issues/6)

  > ~Note: since compilation of npm packages can now be enabled using the
  techniques described above, Meteor will no longer automatically scan
  `node_modules` directories for modules that can be compiled by
  compiler plugins. If you have been using that functionality to import
  compiled-to-JS modules from `node_modules`, you should start using the
  symlinking strategy instead.~ **Follow-up note: this optimization was
  reverted in Meteor 1.7.0.1 (see [above](#v1701-2018-05-29)).**

* Node has been updated to version
  [8.11.2](https://nodejs.org/en/blog/release/v8.11.2/), officially fixing
  a [cause](https://github.com/nodejs/node/issues/19274) of frequent
  segmentation faults in Meteor applications that was introduced in Node
  8.10.0. Meteor 1.6.1.1 shipped with a custom build of Node that patched
  this problem, but that approach was never intended to be permanent.

* The `npm` package has been upgraded to version 5.10.0, and our
  [fork](https://github.com/meteor/pacote/tree/v7.6.1-meteor) of its
  `pacote` dependency has been rebased against version 7.6.1.

* Applications may now specify client and server entry point modules in a
  newly-supported `"meteor"` section of `package.json`:
  ```js
  "meteor": {
    "mainModule": {
      "client": "client/main.js",
      "server": "server/main.js"
    }
  }
  ```
  When specified, these entry points override Meteor's default module
  loading semantics, rendering `imports` directories unnecessary. If
  `mainModule` is left unspecified for either client or server, the
  default rules will apply for that architecture, as before. To disable
  eager loading of modules on a given architecture, simply provide a
  `mainModule` value of `false`:
  ```js
  "meteor": {
    "mainModule": {
      "client": false,
      "server": "server/main.js"
    }
  }
  ```
  [Feature #135](https://github.com/meteor/meteor-feature-requests/issues/135)
  [PR #9690](https://github.com/meteor/meteor/pull/9690)

* In addition to `meteor.mainModule`, the `"meteor"` section of
  `package.json` may also specify `meteor.testModule` to control which
  test modules are loaded by `meteor test` or `meteor test --full-app`:
  ```js
  "meteor": {
    "mainModule": {...},
    "testModule": "tests.js"
  }
  ```
  If your client and server test files are different, you can expand the
  `testModule` configuration using the same syntax as `mainModule`:
  ```js
  "meteor": {
    "testModule": {
      "client": "client/tests.js",
      "server": "server/tests.js"
    }
  }
  ```
  The same test module will be loaded whether or not you use the
  `--full-app` option. Any tests that need to detect `--full-app` should
  check `Meteor.isAppTest`. The module(s) specified by `meteor.testModule`
  can import other test modules at runtime, so you can still distribute
  test files across your codebase; just make sure you import the ones you
  want to run. [PR #9714](https://github.com/meteor/meteor/pull/9714)

* The `meteor create` command now supports a `--minimal` option, which
  creates an app with as few Meteor packages as possible, in order to
  minimize client bundle size while still demonstrating advanced features
  such as server-side rendering. This starter application is a solid
  foundation for any application that doesn't need Mongo or DDP.

* The `meteor-babel` npm package has been updated to version
  7.0.0-beta.49-1. Note: while Babel has recently implemented support for
  a new kind of `babel.config.js` configuration file (see [this
  PR](https://github.com/babel/babel/pull/7358)), and future versions of
  Meteor will no doubt embrace this functionality, Meteor 1.7 supports
  only `.babelrc` files as a means of customizing the default Babel
  configuration provided by Meteor. In other words, if your project
  contains a `babel.config.js` file, it will be ignored by Meteor 1.7.

* The `reify` npm package has been updated to version 0.16.2.

* The `meteor-node-stubs` package, which provides stub implementations for
  any Node built-in modules used by the client (such as `path` and
  `http`), has a new minor version (0.4.1) that may help with Windows
  installation problems. To install the new version, run
  ```sh
  meteor npm install meteor-node-stubs@latest
  ```

* The `optimism` npm package has been updated to version 0.6.3.

* The `minifier-js` package has been updated to use `uglify-es` 3.3.9.

* Individual Meteor `self-test`'s can now be skipped by adjusting their
  `define` call to be prefixed by `skip`. For example,
  `selftest.skip.define('some test', ...` will skip running "some test".
  [PR #9579](https://github.com/meteor/meteor/pull/9579)

* Mongo has been upgraded to version 3.6.4 for 64-bit systems, and 3.2.19
  for 32-bit systems. [PR #9632](https://github.com/meteor/meteor/pull/9632)

  **NOTE:** After upgrading an application to use Mongo 3.6.4, it has been
  observed ([#9591](https://github.com/meteor/meteor/issues/9591))
  that attempting to run that application with an older version of
  Meteor (via `meteor --release X`), that uses an older version of Mongo, can
  prevent the application from starting. This can be fixed by either
  running `meteor reset`, or by repairing the Mongo database. To repair the
  database, find the `mongod` binary on your system that lines up with the
  Meteor release you're jumping back to, and run
  `mongodb --dbpath your-apps-db --repair`. For example:
  ```sh
  ~/.meteor/packages/meteor-tool/1.6.0_1/mt-os.osx.x86_64/dev_bundle/mongodb/bin/mongod --dbpath /my-app/.meteor/local/db --repair
  ```
  [PR #9632](https://github.com/meteor/meteor/pull/9632)

* The `mongodb` driver package has been updated from version 2.2.34 to
  version 3.0.7. [PR #9790](https://github.com/meteor/meteor/pull/9790)
  [PR #9831](https://github.com/meteor/meteor/pull/9831)
  [Feature #268](https://github.com/meteor/meteor-feature-requests/issues/268)

* The `cordova-plugin-meteor-webapp` package depended on by the Meteor
  `webapp` package has been updated to version 1.6.0.
  [PR #9761](https://github.com/meteor/meteor/pull/9761)

* Any settings read from a JSON file passed with the `--settings` option
  during Cordova run/build/deploy will be exposed in `mobile-config.js`
  via the `App.settings` property, similar to `Meteor.settings`.
  [PR #9873](https://github.com/meteor/meteor/pull/9873)

* The `@babel/plugin-proposal-class-properties` plugin provided by
  `meteor-babel` now runs with the `loose:true` option, as required by
  other (optional) plugins like `@babel/plugin-proposal-decorators`.
  [Issue #9628](https://github.com/meteor/meteor/issues/9628)

* The `underscore` package has been removed as a dependency from `meteor-base`.
  This opens up the possibility of removing 14.4 kb from production bundles.
  Since this would be a breaking change for any apps that may have been
  using `_` without having any packages that depend on `underscore`
  besides `meteor-base`, we have added an upgrader that will automatically
  add `underscore` to the `.meteor/packages` file of any project which
  lists `meteor-base`, but not `underscore`. Apps which do not require this
  package can safely remove it using `meteor remove underscore`.
  [PR #9596](https://github.com/meteor/meteor/pull/9596)

* Meteor's `promise` package has been updated to support
  [`Promise.prototype.finally`](https://github.com/tc39/proposal-promise-finally).
  [Issue 9639](https://github.com/meteor/meteor/issues/9639)
  [PR #9663](https://github.com/meteor/meteor/pull/9663)

* Assets made available via symlinks in the `public` and `private` directories
  of an application are now copied into Meteor application bundles when
  using `meteor build`. This means npm package assets that need to be made
  available publicly can now be symlinked from their `node_modules` location,
  in the `public` directory, and remain available in production bundles.
  [Issue #7013](https://github.com/meteor/meteor/issues/7013)
  [PR #9666](https://github.com/meteor/meteor/pull/9666)

* The `facts` package has been split into `facts-base` and `facts-ui`. The
  original `facts` package has been deprecated.
  [PR #9629](https://github.com/meteor/meteor/pull/9629)

* If the new pseudo tag `<meteor-bundled-css />` is used anywhere in the
  `<head />` of an app, it will be replaced by the `link` to Meteor's bundled
  CSS. If the new tag isn't used, the bundle will be placed at the top of
  the `<head />` section as before (for backwards compatibility).
  [Feature #24](https://github.com/meteor/meteor-feature-requests/issues/24)
  [PR #9657](https://github.com/meteor/meteor/pull/9657)

## v1.6.1.4, 2018-08-16

### Breaking changes
N/A

### Migration Steps
N/A

### Changes

* Node has been updated to version
  [8.11.4](https://nodejs.org/en/blog/release/v8.11.4/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/august-2018-security-releases/).

## v1.6.1.3, 2018-06-16

### Breaking changes
N/A

### Migration Steps
N/A

### Changes

* Node has been updated to version
  [8.11.3](https://nodejs.org/en/blog/release/v8.11.3/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/june-2018-security-releases/).

## v1.6.1.2, 2018-05-28

### Breaking changes
N/A

### Migration Steps
N/A

### Changes

* Meteor 1.6.1.2 is a very small release intended to fix
  [#9863](https://github.com/meteor/meteor/issues/9863) by making
  [#9887](https://github.com/meteor/meteor/pull/9887) available to Windows
  users without forcing them to update to Meteor 1.7 (yet). Thanks very
  much to [@zodern](https://github.com/zodern) for identifying a solution
  to this problem. [PR #9910](https://github.com/meteor/meteor/pull/9910)

## v1.6.1.1, 2018-04-02

### Breaking changes
N/A

### Migration Steps
* Update `@babel/runtime` npm package and any custom Babel plugin enabled in
  `.babelrc`
  ```sh
  meteor npm install @babel/runtime@latest
  ```

### Changes

* Node has been updated to version
  [8.11.1](https://nodejs.org/en/blog/release/v8.11.1/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/march-2018-security-releases/),
  with a critical [patch](https://github.com/nodejs/node/pull/19477)
  [applied](https://github.com/meteor/node/commits/v8.11.1-meteor) to
  solve a segmentation fault
  [problem](https://github.com/nodejs/node/issues/19274) that was
  introduced in Node 8.10.0.

* The `meteor-babel` npm package has been updated to version
  7.0.0-beta.42, which may require updating any custom Babel plugins
  you've enabled in a `.babelrc` file, and/or running the following
  command to update `@babel/runtime`:
  ```sh
  meteor npm install @babel/runtime@latest
  ```

## v1.6.1, 2018-01-19

### Breaking changes

* Meteor's Node Mongo driver is now configured with the
  [`ignoreUndefined`](http://mongodb.github.io/node-mongodb-native/2.2/api/MongoClient.html#connect)
  connection option set to `true`, to make sure fields with `undefined`
  values are not first converted to `null`, when inserted/updated. `undefined`
  values are now removed from all Mongo queries and insert/update documents.

  This is a potentially breaking change if you are upgrading an existing app
  from an earlier version of Meteor.

  For example:
  ```js
  // return data pertaining to the current user
  db.privateUserData.find({
      userId: currentUser._id // undefined
  });
  ```
  Assuming there are no documents in the `privateUserData` collection with
  `userId: null`, in Meteor versions prior to 1.6.1 this query will return
  zero documents. From Meteor 1.6.1 onwards, this query will now return
  _every_ document in the collection. It is highly recommend you review all
  your existing queries to ensure that any potential usage of `undefined` in
  query objects won't lead to problems.

### Migration Steps
N/A

### Changes

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

* Meteor's Node Mongo driver is now configured with the
  [`ignoreUndefined`](http://mongodb.github.io/node-mongodb-native/2.2/api/MongoClient.html#connect)
  connection option set to `true`, to make sure fields with `undefined`
  values are not first converted to `null`, when inserted/updated. `undefined`
  values are now removed from all Mongo queries and insert/update documents.
  [Issue #6051](https://github.com/meteor/meteor/issues/6051)
  [PR #9444](https://github.com/meteor/meteor/pull/9444)

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
  field).
  [PR #9311](https://github.com/meteor/meteor/pull/9311)
  [Issue #6890](https://github.com/meteor/meteor/issues/6890)

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

## v1.5.4.2, 2018-04-02

* Node has been upgraded to version
  [4.9.0](https://nodejs.org/en/blog/release/v4.9.0/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/march-2018-security-releases/).

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
> or the older `module.import(id, ...)`. The behavior of the compiled code
> should be the same as before, but the details seemed different enough to
> warrant a note.

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

## v1.4.4.6, 2018-04-02

* Node has been upgraded to version
  [4.9.0](https://nodejs.org/en/blog/release/v4.9.0/), an important
  [security release](https://nodejs.org/en/blog/vulnerability/march-2018-security-releases/).
  The Node v4.x release line will exit the Node.js Foundation's
  [long-term support (LTS) status](https://github.com/nodejs/LTS) on April 30,
    2018. We strongly advise updating to a version of Meteor using a newer
          version of Node which is still under LTS status, such as Meteor 1.6.x
          which uses Node 8.x.

* The `npm` package has been upgraded to version
  [4.6.1](https://github.com/npm/npm/releases/tag/v4.6.1).

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
> every installed core package, which meant newer core packages could not
> be installed without publishing a new Meteor release. In order to
> support incremental development of core packages, Meteor 1.4 removed all
> release-based constraints on core package versions
([#7084](https://github.com/meteor/meteor/pull/7084)). Now, in Meteor
> 1.4.3, core package versions must remain patch-compatible with the
> versions they had when the Meteor release was published. This middle
> ground restores meaning to Meteor releases, yet still permits patch
> updates to core packages.

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
> Meteor 1.4.2.4 release process, before it was ever recommended but too
> late in the process to avoid the additional increment of the version number.
> See [#8311](https://github.com/meteor/meteor/pull/8311) for additional
> information. This change will still be released in an upcoming version
> of Meteor with a more seamless upgrade.

## v1.4.2.4, 2017-02-02

* Node has been upgraded to version 4.7.3.

* The `npm` npm package has been upgraded from version 3.10.9 to 4.1.2.

> Note: This change was later deemed too substantial for a point release
> and was reverted in Meteor 1.4.2.7.

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
> those changes were [deemed important
enough](https://github.com/meteor/meteor/pull/8044#issuecomment-260913739)
> to skip recommending 1.4.2.2 and instead immediately release 1.4.2.3.

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
  fibers and the avoidance of unnecessary asynchronous delays.
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
> server startup time as well as build time, which should make it easier
> to tell which of your packages are responsible for slow startup times.
> Please include the output of `METEOR_PROFILE=10 meteor run` with any
> GitHub issue about rebuild performance.

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

* When using `ROOT_URL` with a path, relative CSS URLs are rewritten
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

* Allow overriding the default warehouse url by specifying `METEOR_WAREHOUSE_URLBASE` [PR #7054](https://github.com/meteor/meteor/pull/7054)

* Allow `_id` in `$setOnInsert` in Minimongo: https://github.com/meteor/meteor/pull/7066

* Added support for `$eq` to Minimongo: https://github.com/meteor/meteor/pull/4235

* Insert a `Date` header into emails by default: https://github.com/meteor/meteor/pull/6916/files

* `meteor test` now supports setting the bind address using `--port IP:PORT` the same as `meteor run` [PR #6964](https://github.com/meteor/meteor/pull/6964) [Issue #6961](https://github.com/meteor/meteor/issues/6961)

* `Meteor.apply` now takes a `noRetry` option to opt-out of automatically retrying non-idempotent methods on connection blips: [PR #6180](https://github.com/meteor/meteor/pull/6180)

* DDP callbacks are now batched on the client side. This means that after a DDP message arrives, the local DDP client will batch changes for a minimum of 5ms (configurable via `bufferedWritesInterval`) and a maximum of 500ms (configurable via `bufferedWritesMaxAge`) before calling any callbacks (such as cursor observe callbacks).

* PhantomJS is no longer included in the Meteor dev bundle (#6905). If you
  previously relied on PhantomJS for local testing, the `spiderable`
  package, Velocity tests, or testing Meteor from a checkout, you should
  now install PhantomJS yourself, by running the following command:
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
> unrecoverable way. Meteor 1.3.2.4 contains no additional changes beyond
> the changes in 1.3.2.3.

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
  symbols in the global namespace, so it's no longer true that all apps
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
