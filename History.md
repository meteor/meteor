## v.NEXT

## v1.1.0.1, 2015-Apr-02

### Blaze

* Fix a regression in 1.1 in Blaze Templates: an error happening when View is
  invalidated immediately, causing a client-side crash (accessing
  `destroyMembers` of `undefined`). #4097

## v1.1, 2015-Mar-31

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
  `.meteor/versions` aren't in the cache.  #3653

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
  available.  #3889

* Yield to the event loop during the flush cycle, unless we're executing a
  synchronous `Tracker.flush()`.  #3901

* Fix error reporting not being source-mapped properly. #3655

* Introduce a new option for `Tracker.autorun` - `onError`. This callback can be
  used to handle errors caught in the reactive computations. #3822

### Blaze

* Fix stack overflow from nested templates and helpers by avoiding recursion
  during rendering.  #3028

### `meteor` command-line tool

* Don't fail if `npm` prints more than 200K.  #3887


### Other bug fixes and improvements

* Upgraded dependencies:

  - uglify-js: 2.4.17 (from 2.4.13)

Patches contributed by GitHub users hwillson, mitar, murillo128, Primigenus,
rjakobsson, and tmeasday.


## v1.0.5, 2015-Mar-25

* This version of Meteor now uses version 2.2 of the Facebook API for
  authentication, instead of 1.0. If you use additional Facebook API methods
  beyond login, you may need to request new permissions.

  Facebook will automatically switch all apps to API version 2.0 on April
  30th, 2015. Please make sure to update your application's permissions and API
  calls by that date.

  For more details, see
  https://github.com/meteor/meteor/wiki/Facebook-Graph-API-Upgrade


## v1.0.4.2, 2015-Mar-20

* Fix regression in 1.0.4 where using Cordova for the first time in a project
  with hyphens in its directory name would fail.  #3950


## v1.0.4.1, 2015-Mar-18

* Fix regression in 1.0.4 where `meteor publish-for-arch` only worked for
  packages without colons in their name.  #3951

## v1.0.4, 2015-Mar-17

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
  0.8.1.  #3038

* Use correct transform for allow/deny rules in `update` when different rules
  have different transforms.  #3108

* Provide direct access to the collection and database objects from the npm
  Mongo driver via new `rawCollection` and `rawDatabase` methods on
  `Mongo.Collection`.  #3640

* Observing or publishing an invalid query now throws an error instead of
  effectively hanging the server.  #2534


### Livequery

* If the oplog observe driver gets too far behind in processing the oplog, skip
  entries and re-poll queries instead of trying to keep up.  #2668

* Optimize common cases faced by the "crossbar" data structure (used by oplog
  tailing and DDP method write tracking).  #3697

* The oplog observe driver recovers from failed attempts to apply the modifier
  from the oplog (eg, because of empty field names).


### Minimongo

* When acting as an insert, `c.upsert({_id: 'x'}, {foo: 1})` now uses the `_id`
  of `'x'` rather than a random `_id` in the Minimongo implementation of
  `upsert`, just like it does for `c.upsert({_id: 'x'}, {$set: {foo: 1}})`.
  (The previous behavior matched a bug in the MongoDB 2.4 implementation of
  upsert that is fixed in MongoDB 2.6.)  #2278

* Avoid unnecessary work while paused in minimongo.

* Fix bugs related to observing queries with field filters: `changed` callbacks
  should not trigger unless a field in the filter has changed, and `changed`
  callbacks need to trigger when a parent of an included field is
  unset.  #2254 #3571

* Disallow setting fields with empty names in minimongo, to match MongoDB 2.6
  semantics.


### DDP

* Subscription handles returned from `Meteor.subscribe` and
  `TemplateInstance#subscribe` now have a `subscriptionId` property to identify
  which subscription the handle is for.

* The `onError` callback to `Meteor.subscribe` has been replaced with a more
  general `onStop` callback that has an error as an optional first argument.
  The `onStop` callback is called when the subscription is terminated for
  any reason.  `onError` is still supported for backwards compatibility. #1461

* The return value from a server-side `Meteor.call` or `Meteor.apply` is now a
  clone of what the function returned rather than sharing mutable state.  #3201

* Make it easier to use the Node DDP client implementation without running a web
  server too.  #3452


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

* `Template.instance()` now works inside `Template.body`.  #3631

* Allow specifying attributes on `<body>` tags in templates.

* Improve performance of rendering large arrays.  #3596


### Isobuild

* Support `Npm.require('foo/bar')`.  #3505 #3526

* In `package.js` files, `Npm.require` can only require built-in Node modules
  (and dev bundle modules, though you shouldn't depend on that), not the modules
  from its own `Npm.depends`. Previously, such code would work but only on the
  second time a `package.js` was executed.

* Ignore vim swap files in the `public` and `private` directories.  #3322

* Fix regression in 1.0.2 where packages might not be rebuilt when the compiler
  version changes.


### Meteor Accounts

* The `accounts-password` `Accounts.emailTemplates` can now specify arbitrary
  email `headers`.  The `from` address can now be set separately on the
  individual templates, and is a function there rather than a static
  string. #2858 #2854

* Add login hooks on the client: `Accounts.onLogin` and
  `Accounts.onLoginFailure`. #3572

* Add a unique index to the collection that stores OAuth login configuration to
  ensure that only one configuration exists per service.  #3514

* On the server, a new option
  `Accounts.setPassword(user, password, { logout: false })` overrides the
  default behavior of logging out all logged-in connections for the user.  #3846


### Webapp

* `spiderable` now supports escaped `#!` fragments.  #2938

* Disable `appcache` on Firefox by default.  #3248

* Don't overly escape `Meteor.settings.public` and other parts of
  `__meteor_runtime_config__`.  #3730

* Reload the client program on `SIGHUP` or Node-specific IPC messages, not
  `SIGUSR2`.


### `meteor` command-line tool

* Enable tab-completion of global variables in `meteor shell`.  #3227

* Improve the stability of `meteor shell`.  #3437 #3595 #3591

* `meteor login --email` no longer takes an ignored argument.  #3532

* Fix regression in 1.0.2 where `meteor run --settings s` would ignore errors
  reading or parsing the settings file.  #3757

* Fix crash in `meteor publish` in some cases when the package is inside an
  app. #3676

* Fix crashes in `meteor search --show-all` and `meteor search --maintainer`.
  \#3636

* Kill PhantomJS processes after `meteor --test`, and only run the app
  once. #3205 #3793

* Give a better error when Mongo fails to start up due to a full disk.  #2378

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
  the new server-only `npmRequestOptions` option to `HTTP.call`.  #1703


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


## v.1.0.3.2, 2015-Feb-25

* Fix regression in 1.0.3 where the `meteor` tool could crash when downloading
  the second build of a given package version; for example, when running `meteor
  deploy` on an OSX or 32-bit Linux system for an app containing a binary
  package.  #3761


## v.1.0.3.1, 2015-Jan-20

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

* Add `meteor test-packages --velocity` (similar to `meteor run --test`).  #3330

* Fix `meteor update <packageName>` to update <packageName> even if it's an
  indirect dependency of your app.  #3282

* Fix stack trace when a browser tries to use the server like a proxy.  #1212

* Fix inaccurate session statistics and possible multiple invocation of
  Connection.onClose callbacks.

* Switch CLI tool filesystem calls from synchronous to yielding (pro: more
  concurrency, more responsive to signals; con: could introduce concurrency
  bugs)

* Don't apply CDN prefix on Cordova. #3278 #3311

* Don't try to refresh client app in the runner unless the app actually has the
  autoupdate package. #3365

* Fix custom release banner logic. #3353

* Apply HTTP followRedirects option to non-GET requests.  #2808

* Clean up temporary directories used by package downloads sooner.  #3324

* If the tool knows about the requested release but doesn't know about the build
  of its tool for the platform, refresh the catalog rather than failing
  immediately.  #3317

* Fix `meteor --get-ready` to not add packages to your app.

* Fix some corner cases in cleaning up app processes in the runner. Drop
  undocumented `--keepalive` support. #3315

* Fix CSS autoupdate when `$ROOT_URL` has a non-trivial path.  #3111

* Save Google OAuth idToken to the User service info object.

* Add git info to `meteor --version`.

* Correctly catch a case of illegal `Tracker.flush` during `Tracker.autorun`.  #3037

* Upgraded dependencies:

  - jquery: 1.11.2 (from 1.11.0)

Patches by GitHub users DanielDent, DanielDornhardt, PooMaster, Primigenus,
Tarang, TomFreudenberg, adnissen, dandv, fay-jai, knownasilya, mquandalle,
ogourment, restebanez, rissem, smallhelm and tmeasday.

## v1.0.2.1, 2014-Dec-22

* Fix crash in file change watcher.  #3336

* Allow `meteor test-packages packages/*` even if not all package directories
  have tests.  #3334

* Fix typo in `meteor shell` output. #3326


## v1.0.2, 2014-Dec-19

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
  variable. #2135

* Reduce CPU usage by fixing a check for a parent process in `meteor
  run` that was happening constantly instead of every few seconds. #3252

* Fix crash when two plugins defined source handlers for the same
  extension. #3015 #3180

* Fix bug (introduced in 0.9.3) where the warning about using experimental
  versions of packages was printed too often.

* Fix bug (introduced in 1.0) where `meteor update --patch` crashed.

* Fix bug (introduced in 0.9.4) where banners about new releases could be
  printed too many times.

* Fix crash when a package version contained a dot-separated pre-release part
  with both digits and non-digits. #3147

* Corporate HTTP proxy support is now implemented using our websocket library's
  new built-in implementation instead of a custom implementation. #2515

### Blaze

* Add default behavior for `Template.parentData` with no arguments. This
  selects the first parent. #2861

* Fix `Blaze.remove` on a template's view to correctly remove the DOM
  elements when the template was inserted using
  `Blaze.renderWithData`. #3130

* Allow curly braces to be escaped in Spacebars. Use the special
  sequences `{{|` and `{{{|` to insert a literal `{{` or `{{{`.

### Meteor Accounts

* Allow integration with OAuth1 servers that require additional query
  parameters to be passed with the access token. #2894

* Expire a user's password reset and login tokens in all circumstances when
  their password is changed.

### Other bug fixes and improvements

* Some packages are no longer released as part of the core release process:
  amplify, backbone, bootstrap, d3, jquery-history, and jquery-layout. This
  means that new versions of these packages can be published outside of the full
  Meteor release cycle.

* Require plain objects as the update parameter when doing replacements
  in server-side collections.

* Fix audit-argument-checks spurious failure when an argument is NaN. #2914

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


## v1.0.1, 2014-Dec-09

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.


## v1.0, 2014-Oct-28

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
  tool uses to communicate with the package server. #2777, #2789.

### Mobile App Support

* Implemented reasonable default behavior for launch screens on mobile
  apps.

* Don't build for Android when only the iOS build is required, and
  vice versa.

* Fix bug that could cause mobile apps to stop being able to receive hot
  code push updates.

* Fix bug where Cordova clients connected to http://example.com instead
  of https://example.com when https:// was specified in the
  --mobile-server option. #2880

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

* Fix bug with regular expressions in minimongo. #2817

* Add READMEs for several core packages.

* Include protocols in URLs printed by `meteor deploy`.

* Improve error message for limited ordered observe. #1643

* Fix missing dependency on `random` in the `autoupdate` package. #2892

* Fix bug where all CSS would be removed from connected clients if a
  CSS-only change is made between local development server restarts or
  when deploying with `meteor deploy`.

* Increase height of the Google OAuth popup to the Google-recommended
  value.

* Fix the layout of the OAuth configuration dialog when used with
  Bootstrap.

* Allow build plugins to override the 'bare' option on added source
  files. #2834

Patches by GitHub users DenisGorbachev, ecwyne, mitar, mquandalle,
Primigenus, svda, yauh, and zol.


## v0.9.4.1, 2014-Dec-09 (backport)

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.
  Backport from 1.0.1.


## v0.9.4, 2014-Oct-13

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
  `http_proxy` environment variable to specify your proxy endpoint.  #2515


### Bug Fixes

* Fix behavior of ROOT_URL with path ending in `/`.

* Fix source maps when using a ROOT_URL with a path. #2627

* Change the mechanism that the Meteor tool uses to clean up app server
  processes. The new mechanism is more resilient to slow app bundles and
  other CPU-intensive tasks. #2536, #2588.


Patches by GitHub users cryptoquick, Gaelan, jperl, meonkeys, mitar,
mquandalle, prapicault, pscanf, richguan, rick-golden-healthagen,
rissem, rosh93, rzymek, and timoabend


## v0.9.3.1, 2014-Sep-30

* Don't crash when failing to contact the package server. #2713

* Allow more than one dash in package versions. #2715


## v0.9.3, 2014-Sep-25

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



## v0.9.2.2, 2014-Sep-17

* Fix regression in 0.9.2 that prevented some users from accessing the
  Meteor development server in their browser. Specifically, 0.9.2
  unintentionally changed the development mode server's default bind
  host to localhost instead of 0.0.0.0. #2596


## v0.9.2.1, 2014-Sep-15

* Fix versions of packages that were published with `-cordova` versions
  in 0.9.2 (appcache, fastclick, htmljs, logging, mobile-status-bar,
  routepolicy, webapp-hashing).


## v0.9.2, 2014-Sep-15

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

* Fix sorting on non-trivial keys in Minimongo. #2439

* Bug fixes and performance improvements for the package system's
  constraint solver.

* Improved error reporting for misbehaving oplog observe driver. #2033 #2244

* Drop deprecated source map linking format used for older versions of
  Firefox.  #2385

* Allow Meteor tool to run from a symlink. #2462

* Assets added via a plugin are no longer considered source files. #2488

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



## v0.9.1.1, 2014-Sep-06

* Fix backwards compatibility for packages that had weak dependencies
  on packages renamed in 0.9.1 (`ui`, `deps`, `livedata`). #2521

* Fix error when using the `reactive-dict` package without the `mongo`
  package.


## v0.9.1, 2014-Sep-04

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

* Allow query parameters in OAuth1 URLs. #2404

* Fix `meteor list` if not all packages on server. Fixes #2468

Patch by GitHub user mitar.


## v0.9.0.1, 2014-Aug-27

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


## v0.9.0, 2014-Aug-26

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
  development and in some production environments.  #490

* When a call to `match` fails in a method or subscription, log the
  failure on the server. (This matches the behavior described in our docs)

* The `appcache` package now defaults to functioning on all browsers
  that support the AppCache API, rather than a whitelist of browsers.
  The main effect of this change is that `appcache` is now enabled by
  default on Firefox, because Firefox no longer makes a confusing
  popup. You can still disable individual browsers with
  `AppCache.config`.  #2241

* The `forceApprovalPrompt` option can now be specified in `Accounts.ui.config`
  in addition to `Meteor.loginWithGoogle`.  #2149

* Don't leak websocket clients in server-to-server DDP in some cases (and fix
  "Got open from inactive client"
  error). https://github.com/faye/websocket-driver-node/pull/8

* Updated OAuth url for login with Meetup.

* Allow minimongo `changed` callbacks to mutate their `oldDocument`
  argument. #2231

* Fix upsert called from client with no callback.  #2413

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


## v0.8.3.1, 2014-Dec-09 (backport)

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.
  Backport from 1.0.1.


## v0.8.3, 2014-Jul-29

#### Blaze

* Refactor Blaze to simplify internals while preserving the public
  API. `UI.Component` has been replaced with `Blaze.View.`

* Fix performance issues and memory leaks concerning event handlers.

* Add `UI.remove`, which removes a template after `UI.render`/`UI.insert`.

* Add `this.autorun` to the template instance, which is like `Deps.autorun`
  but is automatically stopped when the template is destroyed.

* Create `<a>` tags as SVG elements when they have `xlink:href`
  attributes. (Previously, `<a>` tags inside SVGs were never created as
  SVG elements.)  #2178

* Throw an error in `{{foo bar}}` if `foo` is missing or not a function.

* Cursors returned from template helpers for #each should implement
  the `observeChanges` method and don't have to be Minimongo cursors
  (allowing new custom data stores for Blaze like Miniredis).

* Remove warnings when {{#each}} iterates over a list of strings,
  numbers, or other items that contains duplicates.  #1980

#### Meteor Accounts

* Fix regression in 0.8.2 where an exception would be thrown if
  `Meteor.loginWithPassword` didn't have a callback. Callbacks to
  `Meteor.loginWithPassword` are now optional again.  #2255

* Fix OAuth popup flow in mobile apps that don't support
  `window.opener`.  #2302

* Fix "Email already exists" error with MongoDB 2.6.  #2238


#### mongo-livedata and minimongo

* Fix performance issue where a large batch of oplog updates could block
  the node event loop for long periods.  #2299.

* Fix oplog bug resulting in error message "Buffer inexplicably empty".  #2274

* Fix regression from 0.8.2 that caused collections to appear empty in
  reactive `findOne()` or `fetch` queries that run before a mutator
  returns.  #2275


#### Miscellaneous

* Stop including code by default that automatically refreshes the page
  if JavaScript and CSS don't load correctly. While this code is useful
  in some multi-server deployments, it can cause infinite refresh loops
  if there are errors on the page. Add the `reload-safetybelt` package
  to your app if you want to include this code.

* On the server, `Meteor.startup(c)` now calls `c` immediately if the
  server has already started up, matching the client behavior.  #2239

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


## v0.8.2, 2014-Jun-23

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
  it is passed to email template functions. #2210

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
  return a jQuery object. #2039

* Fix a Blaze memory leak by cleaning up event handlers when a template
  instance is destroyed. #1997

* Fix a bug where helpers used by {{#with}} were still re-running when
  their reactive data sources changed after they had been removed from
  the DOM.

* Stop not updating form controls if they're focused. If a field is
  edited by one user while another user is focused on it, it will just
  lose its value but maintain its focus. #1965

* Add `_nestInCurrentComputation` option to `UI.render`, fixing a bug in
  {{#each}} when an item is added inside a computation that subsequently
  gets invalidated. #2156

* Fix bug where "=" was not allowed in helper arguments. #2157

* Fix bug when a template tag immediately follows a Spacebars block
  comment. #2175


#### Command-line tool

* Add --directory flag to `meteor bundle`. Setting this flag outputs a
  directory rather than a tarball.

* Speed up updates of NPM modules by upgrading Node to include our fix for
  https://github.com/npm/npm/issues/3265 instead of passing `--force` to
  `npm install`.

* Always rebuild on changes to npm-shrinkwrap.json files.  #1648

* Fix uninformative error message when deploying to long hostnames. #1208

* Increase a buffer size to avoid failing when running MongoDB due to a
  large number of processes running on the machine, and fix the error
  message when the failure does occur. #2158

* Clarify a `meteor mongo` error message when using the MONGO_URL
  environment variable. #1256


#### Testing

* Run server tests from multiple clients serially instead of in
  parallel. This allows testing features that modify global server
  state.  #2088


#### Security

* Add Content-Type headers on JavaScript and CSS resources.

* Add `X-Content-Type-Options: nosniff` header to
  `browser-policy-content`'s default policy. If you are using
  `browser-policy-content` and you don't want your app to send this
  header, then call `BrowserPolicy.content.allowContentTypeSniffing()`.

* Use `Meteor.absoluteUrl()` to compute the redirect URL in the `force-ssl`
  package (instead of the host header).


#### Miscellaneous

* Allow `check` to work on the server outside of a Fiber. #2136

* EJSON custom type conversion functions should not be permitted to yield. #2136

* The legacy polling observe driver handles errors communicating with MongoDB
  better and no longer gets "stuck" in some circumstances.

* Automatically rewind cursors before calls to `fetch`, `forEach`, or `map`. On
  the client, don't cache the return value of `cursor.count()` (consistently
  with the server behavior). `cursor.rewind()` is now a no-op. #2114

* Remove an obsolete hack in reporting line numbers for LESS errors. #2216

* Avoid exceptions when accessing localStorage in certain Internet
  Explorer configurations. #1291, #1688.

* Make `handle.ready()` reactively stop, where `handle` is a
  subscription handle.

* Fix an error message from `audit-argument-checks` after login.

* Make the DDP server send an error if the client sends a connect
  message with a missing or malformed `support` field. #2125

* Fix missing `jquery` dependency in the `amplify` package. #2113

* Ban inserting EJSON custom types as documents. #2095

* Fix incorrect URL rewrites in stylesheets. #2106

* Upgraded dependencies:
  - node: 0.10.28 (from 0.10.26)
  - uglify-js: 2.4.13 (from 2.4.7)
  - sockjs server: 0.3.9 (from 0.3.8)
  - websocket-driver: 0.3.4 (from 0.3.2)
  - stylus: 0.46.3 (from 0.42.3)

Patches contributed by GitHub users awwx, babenzele, Cangit, dandv,
ducdigital, emgee3, felixrabe, FredericoC, jbruni, kentonv, mizzao,
mquandalle, subhog, tbjers, tmeasday.


## v0.8.1.3, 2014-May-22

* Fix a security issue in the `spiderable` package. `spiderable` now
  uses the ROOT_URL environment variable instead of the Host header to
  determine which page to snapshot.

* Fix hardcoded Twitter URL in `oauth1` package. This fixes a regression
  in 0.8.0.1 that broke Atmosphere packages that do OAuth1
  logins. #2154.

* Add `credentialSecret` argument to `Google.retrieveCredential`, which
  was forgotten in a previous release.

* Remove nonexistent `-a` and `-r` aliases for `--add` and `--remove` in
  `meteor help authorized`. #2155

* Add missing `underscore` dependency in the `oauth-encryption` package. #2165

* Work around IE8 bug that caused some apps to fail to render when
  minified. #2037.


## v0.8.1.2, 2014-May-12

* Fix memory leak (introduced in 0.8.1) by making sure to unregister
  sessions at the server when they are closed due to heartbeat timeout.

* Add `credentialSecret` argument to `Google.retrieveCredential`,
  `Facebook.retrieveCredential`, etc., which is needed to use them as of
  0.8.1. #2118

* Fix 0.8.1 regression that broke apps using a `ROOT_URL` with a path
  prefix. #2109


## v0.8.1.1, 2014-May-01

* Fix 0.8.1 regression preventing clients from specifying `_id` on insert. #2097

* Fix handling of malformed URLs when merging CSS files. #2103, #2093

* Loosen the checks on the `options` argument to `Collection.find` to
  allow undefined values.


## v0.8.1, 2014-Apr-30

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
  they have been marked for eventual removal.  #1915

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

* Fix `{{#with}}` over a data context that is mutated.  #2046

* Clean up autoruns when calling `UI.toHTML`.

* Properly clean up event listeners when removing templates.

* Add support for `{{!-- block comments --}}` in Spacebars. Block comments may
  contain `}}`, so they are more useful than `{{! normal comments}}` for
  commenting out sections of Spacebars templates.

* Don't dynamically insert `<tbody>` tags in reactive tables

* When handling a custom jQuery event, additional arguments are
  no longer lost -- they now come after the template instance
  argument.  #1988


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


## v0.8.0.1, 2014-Apr-21

* Fix security flaw in OAuth1 implementation. Clients can no longer
  choose the callback_url for OAuth1 logins.


## v0.8.0, 2014-Mar-27

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


## v0.7.2.3, 2014-Dec-09 (backport)

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.
  Backport from 1.0.1.

## v0.7.2.2, 2014-Apr-21 (backport)

* Fix a security flaw in OAuth1 and OAuth2 implementations.
  Backport from 0.8.1; see its entry for recommended actions to take.

## v0.7.2.1, 2014-Apr-30 (backport)

* Fix security flaw in OAuth1 implementation. Clients can no longer
  choose the callback_url for OAuth1 logins.
  Backport from 0.8.0.1.

## v0.7.2, 2014-Mar-18

* Support oplog tailing on queries with the `limit` option. All queries
  except those containing `$near` or `$where` selectors or the `skip`
  option can now be used with the oplog driver.

* Add hooks to login process: `Accounts.onLogin`,
  `Accounts.onLoginFailure`, and `Accounts.validateLoginAttempt`. These
  functions allow for rate limiting login attempts, logging an audit
  trail, account lockout flags, and more. See:
  http://docs.meteor.com/#accounts_validateloginattempt #1815

* Change the `Accounts.registerLoginHandler` API for custom login
  methods. Login handlers now require a name and no longer have to deal
  with generating resume tokens. See
  https://github.com/meteor/meteor/blob/devel/packages/accounts-base/accounts_server.js
  for details. OAuth based login handlers using the
  `Oauth.registerService` packages are not affected.

* Add support for HTML email in `Accounts.emailTemplates`.  #1785

* minimongo: Support `{a: {$elemMatch: {x: 1, $or: [{a: 1}, {b: 1}]}}}`  #1875

* minimongo: Support `{a: {$regex: '', $options: 'i'}}`  #1874

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
  instead of deprecated URL-based scopes.  #1887

* Add `_throwFirstError` option to `Deps.flush`.

* Make `facts` package data available on the server as
  `Facts._factsByPackage`.

* Fix issue where `LESS` compilation error could crash the `meteor run`
  process.  #1877

* Fix crash caused by empty HTTP host header in `meteor run` development
  server.  #1871

* Fix hot code reload in private browsing mode in Safari.

* Fix appcache size calculation to avoid erronious warnings. #1847

* Remove unused `Deps._makeNonReactive` wrapper function. Call
  `Deps.nonreactive` directly instead.

* Avoid setting the `oplogReplay` on non-oplog collections. Doing so
  caused mongod to crash.

* Add startup message to `test-in-console` to ease automation. #1884

* Upgraded dependencies
  - amplify: 1.1.2 (from 1.1.0)

Patches contributed by GitHub users awwx, dandv, queso, rgould, timhaines, zol


## v0.7.1.2, 2014-Feb-27

* Fix bug in tool error handling that caused `meteor` to crash on Mac
  OSX when no computer name is set.

* Work around a bug that caused MongoDB to fail an assertion when using
  tailable cursors on non-oplog collections.


## v0.7.1.1, 2014-Feb-24

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
      callback. #1767

* Add and improve support for minimongo operators.
  - Support `$comment`.
  - Support `obj` name in `$where`.
  - `$regex` matches actual regexps properly.
  - Improve support for `$nin`, `$ne`, `$not`.
  - Support using `{ $in: [/foo/, /bar/] }`. #1707
  - Support `{$exists: false}`.
  - Improve type-checking for selectors.
  - Support `{x: {$elemMatch: {$gt: 5}}}`.
  - Match Mongo's behavior better when there are arrays in the document.
  - Support `$near` with sort.
  - Implement updates with `{ $set: { 'a.$.b': 5 } }`.
  - Support `{$type: 4}` queries.
  - Optimize `remove({})` when observers are paused.
  - Make update-by-id constant time.
  - Allow `{$set: {'x._id': 1}}`.  #1794

* Upgraded dependencies
  - node: 0.10.25 (from 0.10.22). The workaround for specific Node
    versions from 0.7.0 is now removed; 0.10.25+ is supported.
  - jquery: 1.11.0 (from 1.8.2). See
    http://jquery.com/upgrade-guide/1.9/ for upgrade instructions.
  - jquery-waypoints: 2.0.4 (from 1.1.7). Contains
    backwards-incompatible changes.
  - source-map: 0.3.2 (from 0.3.30) #1782
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
  arrays. #594 #1737

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
  account login. #1291

* Types added with `EJSON.addType` now have default `clone` and `equals`
  implementations. Users may still specify `clone` or `equals` functions
  to override the default behavior.  #1745

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
  40-hex-digit SHA.  #1686

* Add `retry` package for connection retry with exponential backoff.

* Pass `update` and `remove` return values correctly when using
  collections validated with `allow` and `deny` rules. #1759

* If you're using Deps on the server, computations and invalidation
  functions are not allowed to yield. Throw an error instead of behaving
  unpredictably.

* Fix namespacing in coffeescript files added to a package with the
  `bare: true` option. #1668

* Fix races when calling login and/or logoutOtherClients from multiple
  tabs. #1616

* Include oauth_verifier as a header rather than a parameter in
  the `oauth1` package. #1825

* Fix `force-ssl` to allow local development with `meteor run` in IPv6
  environments. #1751`

* Allow cursors on named local collections to be returned from a publish
  function in an array.  #1820

* Fix build failure caused by a directory in `programs/` without a
  package.js file.

* Do a better job of handling shrinkwrap files when an npm module
  depends on something that isn't a semver. #1684

* Fix failures updating npm dependencies when a node_modules directory
  exists above the project directory.  #1761

* Preserve permissions (eg, executable bit) on npm files.  #1808

* SockJS tweak to support relative base URLs.

* Don't leak sockets on error in dev-mode proxy.

* Clone arguments to `added` and `changed` methods in publish
  functions. This allows callers to reuse objects and prevents already
  published data from changing after the fact.  #1750

* Ensure springboarding to a different meteor tools version always uses
  `exec` to run the old version. This simplifies process management for
  wrapper scripts.

Patches contributed by GitHub users DenisGorbachev, EOT, OyoKooN, awwx,
dandv, icellan, jfhamlin, marcandre, michaelbishop, mitar, mizzao,
mquandalle, paulswartz, rdickert, rzymek, timhaines, and yeputons.


## v0.7.0.1, 2013-Dec-20

* Two fixes to `meteor run` Mongo startup bugs that could lead to hangs with the
  message "Initializing mongo database... this may take a moment.".  #1696

* Apply the Node patch to 0.10.24 as well (see the 0.7.0 section for details).

* Fix gratuitous IE7 incompatibility.  #1690


## v0.7.0, 2013-Dec-17

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
  calls. See http://docs.meteor.com/#meteor_onconnection for details. #1611

* Bundler failures cause non-zero exit code in `meteor run`.  #1515

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
  modifier.  #1492

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

* Fix handling of `fields` option in minimongo when only `_id` is present. #1651

* Fix issue where setting `process.env.MAIL_URL` in app code would not
  alter where mail was sent. This was a regression in 0.6.6 from 0.6.5. #1649

* Use stderr instead of stdout (for easier automation in shell scripts) when
  prompting for passwords and when downloading the dev bundle. #1600

* Ensure more downtime during file watching.  #1506

* Fix `meteor run` with settings files containing non-ASCII characters.  #1497

* Support `EJSON.clone` for `Meteor.Error`. As a result, they are properly
  stringified in DDP even if thrown through a `Future`.  #1482

* Fix passing `transform: null` option to `collection.allow()` to disable
  transformation in validators.  #1659

* Fix livedata error on `this.removed` during session shutdown. #1540 #1553

* Fix incompatibility with Phusion Passenger by removing an unused line. #1613

* Ensure install script creates /usr/local on machines where it does not
  exist (eg. fresh install of OSX Mavericks).

* Set x-forwarded-* headers in `meteor run`.

* Clean up package dirs containing only ".build".

* Check for matching hostname before doing end-of-oauth redirect.

* Only count files that actually go in the cache towards the `appcache`
  size check. #1653.

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


## v0.6.6.3, 2013-Nov-04

* Fix error when publish function callbacks are called during session
  shutdown.  #1540 #1553

* Improve `meteor run` CPU usage in projects with many
  directories.  #1506


## v0.6.6.2, 2013-Oct-21

* Upgrade Node from 0.10.20 to 0.10.21 (security update).


## v0.6.6.1, 2013-Oct-12

* Fix file watching on OSX. Work around Node issue #6251 by not using
  fs.watch. #1483


## v0.6.6, 2013-Oct-10


#### Security

* Add `browser-policy` package for configuring and sending
  Content-Security-Policy and X-Frame-Options HTTP headers.
  [See the docs](http://docs.meteor.com/#browserpolicy) for more.

* Use cryptographically strong pseudorandom number generators when available.

#### MongoDB

* Add upsert support. `Collection.update` now supports the `{upsert:
  true}` option. Additionally, add a `Collection.upsert` method which
  returns the newly inserted object id if applicable.

* `update` and `remove` now return the number of documents affected.  #1046

* `$near` operator for `2d` and `2dsphere` indices.

* The `fields` option to the collection methods `find` and `findOne` now works
  on the client as well.  (Operators such as `$elemMatch` and `$` are not yet
  supported in `fields` projections.) #1287

* Pass an index and the cursor itself to the callbacks in `cursor.forEach` and
  `cursor.map`, just like the corresponding `Array` methods.  #63

* Support `c.find(query, {limit: N}).count()` on the client.  #654

* Improve behavior of `$ne`, `$nin`, and `$not` selectors with objects containing
  arrays.  #1451

* Fix various bugs if you had two documents with the same _id field in
  String and ObjectID form.

#### Accounts

* [Behavior Change] Expire login tokens periodically. Defaults to 90
  days. Use `Accounts.config({loginExpirationInDays: null})` to disable
  token expiration.

* [Behavior Change] Write dates generated by Meteor Accounts to Mongo as
  Date instead of number; existing data can be converted by passing it
  through `new Date()`. #1228

* Log out and close connections for users if they are deleted from the
  database.

* Add Meteor.logoutOtherClients() for logging out other connections
  logged in as the current user.

* `restrictCreationByEmailDomain` option in `Accounts.config` to restrict new
  users to emails of specific domain (eg. only users with @meteor.com emails) or
  a custom validator. #1332

* Support OAuth1 services that require request token secrets as well as
  authentication token secrets.  #1253

* Warn if `Accounts.config` is only called on the client.  #828

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
  specify your proxy endpoint.  #429, #689, #1338

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

* Check that the argument to `EJSON.parse` is a string.  #1401

* Better error from functions that use `Meteor._wrapAsync` (eg collection write
  methods and `HTTP` methods) and in DDP server message processing.  #1387

* Support `appcache` on Chrome for iOS.

* Support literate CoffeeScript files with the extension `.coffee.md` (in
  addition to the already-supported `.litcoffee` extension). #1407

* Make `madewith` package work again (broken in 0.6.5).  #1448

* Better error when passing a string to `{{#each}}`. #722

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


## v0.6.5.3, 2014-Dec-09 (backport)

* Fix a security issue in allow/deny rules that could result in data
  loss. If your app uses allow/deny rules, or uses packages that use
  allow/deny rules, we recommend that you update immediately.
  Backport from 1.0.1.


## v0.6.5.2, 2013-Oct-21

* Upgrade Node from 0.8.24 to 0.8.26 (security patch)


## v0.6.5.1, 2013-Aug-28

* Fix syntax errors on lines that end with a backslash. #1326

* Fix serving static files with special characters in their name. #1339

* Upgrade `esprima` JavaScript parser to fix bug parsing complex regexps.

* Export `Spiderable` from `spiderable` package to allow users to set
  `Spiderable.userAgentRegExps` to control what user agents are treated
  as spiders.

* Add EJSON to standard-app-packages. #1343

* Fix bug in d3 tab character parsing.

* Fix regression when using Mongo ObjectIDs in Spark templates.


## v0.6.5, 2013-Aug-14

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
  server and stop all live data updates. #1151

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

* Include http response in errors from oauth providers. #1246

* The `observe` callback `movedTo` now has a fourth argument `before`.

* Move NPM control files for packages from `.npm` to
  `.npm/package`. This is to allow build plugins such as `coffeescript`
  to depend on NPM packages. Also, when removing the last NPM
  dependency, clean up the `.npm` dir.

* Remove deprecated `Meteor.is_client` and `Meteor.is_server` variables.

* Implement "meteor bundle --debug" #748

* Add `forceApprovalPrompt` option to `Meteor.loginWithGoogle`. #1226

* Make server-side Mongo `insert`s, `update`s, and `remove`s run
  asynchronously when a callback is passed.

* Improve memory usage when calling `findOne()` on the server.

* Delete login tokens from server when user logs out.

* Rename package compatibility mode option to `add_files` from `raw` to
  `bare`.

* Fix Mongo selectors of the form: {$regex: /foo/}.

* Fix Spark memory leak.  #1157

* Fix EPIPEs during dev mode hot code reload.

* Fix bug where we would never quiesce if we tried to revive subs that errored
  out (5e7138d)

* Fix bug where `this.fieldname` in handlebars template might refer to a
  helper instead of a property of the current data context. #1143

* Fix submit events on IE8. #1191

* Handle `Meteor.loginWithX` being called with a callback but no options. #1181

* Work around a Chrome bug where hitting reload could cause a tab to
  lose the DDP connection and never recover. #1244

* Upgraded dependencies:
  * Node from 0.8.18 to 0.8.24
  * MongoDB from 2.4.3 to 2.4.4, now with SSL support
  * CleanCSS from 0.8.3 to 1.0.11
  * Underscore from 1.4.4 to 1.5.1
  * Fibers from 1.0.0 to 1.0.1
  * MongoDB Driver from 1.3.7 to 1.3.17

Patches contributed by GitHub users btipling, mizzao, timhaines and zol.


## v0.6.4.1, 2013-Jul-19

* Update mongodb driver to use version 0.2.1 of the bson module.


## v0.6.4, 2013-Jun-10

* Separate OAuth flow logic from Accounts into separate packages. The
  `facebook`, `github`, `google`, `meetup`, `twitter`, and `weibo`
  packages can be used to perform an OAuth exchange without creating an
  account and logging in.  #1024

* If you set the `DISABLE_WEBSOCKETS` environment variable, browsers will not
  attempt to connect to your app using Websockets. Use this if you know your
  server environment does not properly proxy Websockets to reduce connection
  startup time.

* Make `Meteor.defer` work in an inactive tab in iOS.  #1023

* Allow new `Random` instances to be constructed with specified seed. This
  can be used to create repeatable test cases for code that picks random
  values.  #1033

* Fix CoffeeScript error reporting to include source file and line
  number again.  #1052

* Fix Mongo queries which nested JavaScript RegExp objects inside `$or`.  #1089

* Upgraded dependencies:
  * Underscore from 1.4.2 to 1.4.4  #776
  * http-proxy from 0.8.5 to 0.10.1  #513
  * connect from 1.9.2 to 2.7.10
  * Node mongodb client from 1.2.13 to 1.3.7  #1060

Patches contributed by GitHub users awwx, johnston, and timhaines.


## v0.6.3, 2013-May-15

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
  `connection`. The old name still works for now.  #987

* The `localstorage-polyfill` smart package has been replaced by a
  `localstorage` package, which defines a `Meteor._localStorage` API instead of
  trying to replace the DOM `window.localStorage` facility. (Now, apps can use
  the existence of `window.localStorage` to detect if the full localStorage API
  is supported.)  #979

* Upgrade MongoDB from 2.2.1 to 2.4.3.

* Upgrade CoffeeScript from 1.5.0 to 1.6.2.  #972

* Faster reconnects when regaining connectivity.  #696

* `Email.send` has a new `headers` option to set arbitrary headers.  #963

* Cursor transform functions on the server no longer are required to return
  objects with correct `_id` fields.  #974

* Rework `observe()` callback ordering in minimongo to improve fiber
  safety on the server. This makes subscriptions on server to server DDP
  more usable.

* Use binary search in minimongo when updating ordered queries.  #969

* Fix EJSON base64 decoding bug.  #1001

* Support `appcache` on Chromium.  #958

Patches contributed by GitHub users awwx, jagill, spang, and timhaines.


## v0.6.2.1, 2013-Apr-24

* When authenticating with GitHub, include a user agent string. This
  unbreaks "Sign in with GitHub"

Patch contributed by GitHub user pmark.


## v0.6.2, 2013-Apr-16

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

* Allow CoffeeScript to set global variables when using `use strict`. #933

* Return the inserted documented ID from `LocalCollection.insert`. #908

* Add Weibo token expiration time to `services.weibo.expiresAt`.

* `Spiderable.userAgentRegExps` can now be modified to change what user agents
  are treated as spiders by the `spiderable` package.

* Prevent observe callbacks from affecting the arguments to identical
  observes. #855

* Fix meteor command line tool when run from a home directory with
  spaces in its name. If you previously installed meteor release 0.6.0
  or 0.6.1 you'll need to uninstall and reinstall meteor to support
  users with spaces in their usernames (see
  https://github.com/meteor/meteor/blob/master/README.md#uninstalling-meteor)

Patches contributed by GitHub users andreas-karlsson, awwx, jacott,
joshuaconner, and timhaines.


## v0.6.1, 2013-Apr-08

* Correct NPM behavior in packages in case there is a `node_modules` directory
  somewhere above the app directory. #927

* Small bug fix in the low-level `routepolicy` package.

Patches contributed by GitHub users andreas-karlsson and awwx.


## v0.6.0, 2013-Apr-04

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
  exception. #815, #801

* `{{#with}}` helper now only includes its block if its argument is not falsey,
  and runs an `{{else}}` block if provided if the argument is falsey. #770, #866

* Twitter login now stores `profile_image_url` and `profile_image_url_https`
  attributes in the `user.services.twitter` namespace. #788

* Allow packages to register file extensions with dots in the filename.

* When calling `this.changed` in a publish function, it is no longer an error to
  clear a field which was never set. #850

* Deps API
  * Add `dep.depend()`, deprecate `Deps.depend(dep)` and
    `dep.addDependent()`.
  * If first run of `Deps.autorun` throws an exception, stop it and don't
    rerun.  This prevents a Spark exception when template rendering fails
    ("Can't call 'firstNode' of undefined").
  * If an exception is thrown during `Deps.flush` with no stack, the
    message is logged instead. #822

* When connecting to MongoDB, use the JavaScript BSON parser unless specifically
  requested in `MONGO_URL`; the native BSON parser sometimes segfaults. (Meteor
  only started using the native parser in 0.5.8.)

* Calls to the `update` collection function in untrusted code may only use a
  whitelisted list of modifier operators.

Patches contributed by GitHub users awwx, blackcoat, cmather, estark37,
mquandalle, Primigenus, raix, reustle, and timhaines.


## v0.5.9, 2013-Mar-14

* Fix regression in 0.5.8 that prevented users from editing their own
  profile. #809

* Fix regression in 0.5.8 where `Meteor.loggingIn()` would not update
  reactively. #811


## v0.5.8, 2013-Mar-13

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
  the cursors must all be from different collections. #716

* User documents have id's when `onCreateUser` and `validateNewUser` hooks run.

* Encode and store custom EJSON types in MongoDB.

* Support literate CoffeeScript files with the extension `.litcoffee`. #766

* Add new login service provider for Meetup.com in `accounts-meetup` package.

* If you call `observe` or `observeChanges` on a cursor created with the
  `reactive: false` option, it now only calls initial add callbacks and
  does not continue watching the query. #771

* In an event handler, if the data context is falsey, default it to `{}`
  rather than to the global object. #777

* Allow specifying multiple event handlers for the same selector. #753

* Revert caching header change from 0.5.5. This fixes image flicker on redraw.

* Stop making `Session` available on the server; it's not useful there. #751

* Force URLs in stack traces in browser consoles to be hyperlinks. #725

* Suppress spurious `changed` callbacks with empty `fields` from
  `Cursor.observeChanges`.

* Fix logic bug in template branch matching. #724

* Make `spiderable` user-agent test case insensitive. #721

* Fix several bugs in EJSON type support:
  * Fix `{$type: 5}` selectors for binary values on browsers that do
    not support `Uint8Array`.
  * Fix EJSON equality on falsey values.
  * Fix for returning a scalar EJSON type from a method. #731

* Upgraded dependencies:
  * mongodb driver to version 1.2.13 (from 0.1.11)
  * mime module removed (it was unused)


Patches contributed by GitHub users awwx, cmather, graemian, jagill,
jmhredsox, kevinxucs, krizka, mitar, raix, and rasmuserik.


## v0.5.7, 2013-Feb-21

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


## v0.5.6, 2013-Feb-15

* Fix 0.5.5 regression: Minimongo selectors matching subdocuments under arrays
  did not work correctly.

* Some Bootstrap icons should have appeared white.

Patches contributed by GitHub user benjaminchelli.

## v0.5.5, 2013-Feb-13

* Deprecate `Meteor.autosubscribe`. `Meteor.subscribe` now works within
  `Meteor.autorun`.

* Allow access to `Meteor.settings.public` on the client. If the JSON
  file you gave to `meteor --settings` includes a field called `public`,
  that field will be available on the client as well as the server.

* `@import` works in `less`. Use the `.lessimport` file extension to
  make a less file that is ignored by preprocessor so as to avoid double
  processing. #203

* Upgrade Fibers to version 1.0.0. The `Fiber` and `Future` symbols are
  no longer exposed globally. To use fibers directly you can use:
   `var Fiber = __meteor_bootstrap__.require('fibers');` and
   `var Future = __meteor_bootstrap__.require('fibers/future');`

* Call version 1.1 of the Twitter API when authenticating with
  OAuth. `accounts-twitter` users have until March 5th, 2013 to
  upgrade before Twitter disables the old API. #527

* Treat Twitter ids as strings, not numbers, as recommended by
  Twitter. #629

* You can now specify the `_id` field of a document passed to `insert`.
  Meteor still auto-generates `_id` if it is not present.

* Expose an `invalidated` flag on `Meteor.deps.Context`.

* Populate user record with additional data from Facebook and Google. #664

* Add Facebook token expiration time to `services.facebook.expiresAt`. #576

* Allow piping a password to `meteor deploy` on `stdin`. #623

* Correctly type cast arguments to handlebars helper. #617

* Fix leaked global `userId` symbol.

* Terminate `phantomjs` properly on error when using the `spiderable`
  package. #571

* Stop serving non-cachable files with caching headers. #631

* Fix race condition if server restarted between page load and initial
  DDP connection. #653

* Resolve issue where login methods sometimes blocked future methods. #555

* Fix `Meteor.http` parsing of JSON responses on Firefox. #553

* Minimongo no longer uses `eval`. #480

* Serve 404 for `/app.manifest`. This allows experimenting with the
  upcoming `appcache` smart package. #628

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


## v0.5.4, 2013-Jan-08

* Fix 0.5.3 regression: `meteor run` could fail on OSX 10.8 if environment
  variables such as `DYLD_LIBRARY_PATH` are set.


## v0.5.3, 2013-Jan-07

* Add `--settings` argument to `meteor deploy` and `meteor run`. This
  allows you to specify deployment-specific information made available
  to server code in the variable `Meteor.settings`.

* Support unlimited open tabs in a single browser. Work around the
  browser per-hostname connection limit by using randomized hostnames
  for deployed apps. #131

* minimongo improvements:
  * Allow observing cursors with `skip` or `limit`.  #528
  * Allow sorting on `dotted.sub.keys`.  #533
  * Allow querying specific array elements (`foo.1.bar`).
  * `$and`, `$or`, and `$nor` no longer accept empty arrays (for consistency
    with Mongo)

* Re-rendering a template with Spark no longer reverts changes made by
  users to a `preserve`d form element. Instead, the newly rendered value
  is only applied if it is different from the previously rendered value.
  Additionally, <INPUT> elements with type other than TEXT can now have
  reactive values (eg, the labels on submit buttons can now be
  reactive).  #510 #514 #523 #537 #558

* Support JavaScript RegExp objects in selectors in Collection write
  methods on the client, eg `myCollection.remove({foo: /bar/})`.  #346

* `meteor` command-line improvements:
  * Improve error message when mongod fails to start.
  * The `NODE_OPTIONS` environment variable can be used to pass command-line
    flags to node (eg, `--debug` or `--debug-brk` to enable the debugger).
  * Die with error if an app name is mistakenly passed to `meteor reset`.

* Add support for "offline" access tokens with Google login. #464 #525

* Don't remove `serviceData` fields from previous logins when logging in
  with an external service.

* Improve `OAuth1Binding` to allow making authenticated API calls to
  OAuth1 providers (eg Twitter).  #539

* New login providers automatically work with `{{loginButtons}}` without
  needing to edit the `accounts-ui-unstyled` package.  #572

* Use `Content-Type: application/json` by default when sending JSON data
  with `Meteor.http`.

* Improvements to `jsparse`: hex literals, keywords as property names, ES5 line
  continuations, trailing commas in object literals, line numbers in error
  messages, decimal literals starting with `.`, regex character classes with
  slashes.

* Spark improvements:
  * Improve rendering of <SELECT> elements on IE.  #496
  * Don't lose nested data contexts in IE9/10 after two seconds.  #458
  * Don't print a stack trace if DOM nodes are manually removed
    from the document without calling `Spark.finalize`.  #392

* Always use the `autoReconnect` flag when connecting to Mongo.  #425

* Fix server-side `observe` with no `added` callback.  #589

* Fix re-sending method calls on reconnect.  #538

* Remove deprecated `/sockjs` URL support from `Meteor.connect`.

* Avoid losing a few bits of randomness in UUID v4 creation.  #519

* Update clean-css package from 0.8.2 to 0.8.3, fixing minification of `0%`
  values in `hsl` colors.  #515

Patches contributed by GitHub users Ed-von-Schleck, egtann, jwulf, lvbreda,
martin-naumann, meawoppl, nwmartin, timhaines, and zealoushacker.


## v0.5.2, 2012-Nov-27

* Fix 0.5.1 regression: Cursor `observe` works during server startup.  #507

## v0.5.1, 2012-Nov-20

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
  packages instead.  #143

* `Meteor.setPassword` is now called `Accounts.setPassword`, matching the
  documentation and original intention.  #454

* Passing the `wait` option to `Meteor.apply` now waits for all in-progress
  method calls to finish before sending the method, instead of only guaranteeing
  that its callback occurs after the callbacks of in-progress methods.

* New function `Accounts.callLoginMethod` which should be used to call custom
  login handlers (such as those registered with
  `Accounts.registerLoginHandler`).

* The callbacks for `Meteor.loginWithToken` and `Accounts.createUser` now match
  the other login callbacks: they are called with error on error or with no
  arguments on success.

* Fix bug where method calls could be dropped during a brief disconnection. #339

* Prevent running the `meteor` command-line tool and server on unsupported Node
  versions.

* Fix Minimongo query bug with nested objects.  #455

* In `accounts-ui`, stop page layout from changing during login.

* Use `path.join` instead of `/` in paths (helpful for the unofficial Windows
  port) #303

* The `spiderable` package serves pages to
  [`facebookexternalhit`](https://www.facebook.com/externalhit_uatext.php) #411

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

## v0.5.0, 2012-Oct-17

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


## v0.4.2, 2012-Oct-02

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
  (matching the behavior of `Session.equals`). #215

* HTML pages are now served with a `charset=utf-8` Content-Type header. #264

* The contents of `<select>` tags can now be reactive even in IE 7 and 8.

* The `meteor` tool no longer gets confused if a parent directory of your
  project is named `public`. #352

* Fix a race condition in the `spiderable` package which could include garbage
  in the spidered page.

* The REPL run by `admin/node.sh` no longer crashes Emacs M-x shell on exit.

* Refactor internal `reload` API.

* New internal `jsparse` smart package. Not yet exposed publicly.


Patch contributed by GitHub user yanivoliver.


## v0.4.1, 2012-Sep-24

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
    `{{#constant}}`. #323
  * Allow `{{#each}}` over a collection of objects without `_id`. #281
  * Spark now supports Firefox 3.6.
  * Added a script to build a standalone spark.js that does not depend on
    Meteor (it depends on jQuery or Sizzle if you need IE7 support,
    and otherwise is fully standalone).

* Database writes from within `Meteor.setTimeout`/`setInterval`/`defer` will be
  batched with other writes from the current method invocation if they start
  before the method completes.

* Make `Meteor.Cursor.forEach` fully synchronous even if the user's callback
  yields. #321.

* Recover from exceptions thrown in `Meteor.publish` handlers.

* Upgrade bootstrap to version 2.1.1. #336, #337, #288, #293

* Change the implementation of the `meteor deploy` password prompt to not crash
  Emacs M-x shell.

* Optimize `LocalCollection.remove(id)` to be O(1) rather than O(n).

* Optimize client-side database performance when receiving updated data from the
  server outside of method calls.

* Better error reporting when a package in `.meteor/packages` does not exist.

* Better error reporting for coffeescript. #331

* Better error handling in `Handlebars.Exception`.


Patches contributed by GitHub users fivethirty, tmeasday, and xenolf.


## v0.4.0, 2012-Aug-30

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

* Use PACKAGE_DIRS environment variable to override package location. #227

* Add `absolute-url` package to construct URLs pointing to the application.

* Allow modifying documents returned by `observe` callbacks. #209

* Fix periodic crash after client disconnect. #212

* Fix minimingo crash on dotted queries with undefined keys. #126


## v0.3.9, 2012-Aug-07

* Add `spiderable` package to allow web crawlers to index Meteor apps.

* `meteor deploy` uses SSL to protect application deployment.

* Fix `stopImmediatePropagation()`. #205


## v0.3.8, 2012-Jul-12

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

* Add `nib` support to stylus package. #175

* Upgrade bootstrap to version 2.0.4. #173

* Print changelog after `meteor update`.

* Fix mouseenter and mouseleave events. #224

* Fix issue with spurious heartbeat failures on busy connections.

* Fix exception in minimongo when matching non-arrays using `$all`. #183

* Fix serving an empty file when no cacheable assets exist. #179


## v0.3.7, 2012-Jun-06

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
  * Send correct Content-Type when POSTing `params` from the server. #172
  * Correctly detect JSON response Content-Type when a charset is present.

* Support `Handlebars.SafeString`. #160

* Fix intermittent "Cursor is closed" mongo error.

* Fix "Cannot read property 'nextSibling' of null" error in certain nested
  templates. #142

* Add heartbeat timer on the client to notice when the server silently goes
  away.


## v0.3.6, 2012-May-16

* Rewrite event handling. `this` in event handlers now refers to the data
  context of the element that generated the event, *not* the top-level data
  context of the template where the event is declared.

* Add /websocket endpoint for raw websockets. Pass websockets through
  development mode proxy.

* Simplified API for Meteor.connect, which now receives a URL to a Meteor app
  rather than to a sockjs endpoint.

* Fix livedata to support subscriptions with overlapping documents.

* Update node.js to 0.6.17 to fix potential security issue.


## v0.3.5, 2012-Apr-28

* Fix 0.3.4 regression: Call event map handlers on bubbled events. #107


## v0.3.4, 2012-Apr-27

* Add Twitter `bootstrap` package. #84

* Add packages for `sass` and `stylus` CSS pre-processors. #40, #50

* Bind events correctly on top level elements in a template.

* Fix dotted path selectors in minimongo. #88

* Make `backbone` package also run on the server.

* Add `bare` option to coffee-script compilation so variables can be shared
  between multiple coffee-script file. #85

* Upgrade many dependency versions. User visible highlights:
 * node.js 0.6.15
 * coffee-script 1.3.1
 * less 1.3.0
 * sockjs 0.3.1
 * underscore 1.3.3
 * backbone 0.9.2

* Several documentation fixes and test coverage improvements.


## v0.3.3, 2012-Apr-20

* Add `http` package for making HTTP requests to remote servers.

* Add `madewith` package to put a live-updating Made with Meteor badge on apps.

* Reduce size of mongo database on disk (--smallfiles).

* Prevent unnecessary hot-code pushes on deployed apps during server migration.

* Fix issue with spaces in directory names. #39

* Workaround browser caching issues in development mode by using query
  parameters on all JavaScript and CSS requests.

* Many documentation and test fixups.


## v0.3.2, 2012-Apr-10

* Initial public launch
