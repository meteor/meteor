## v.NEXT

* Support oplog tailing on queries with the `limit` option. All queries
  except those containing `$near` or `$where` selectors or the `skip`
  option can now be used with the oplog driver.

* Add hooks to login process. This allows for rate limiting login
  attempts, logging an audit trail, account lockout flags, etc. See:
  http://docs.meteor.com/#accounts_validLoginAttempt  #1815

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


## v0.7.1.2

* Fix bug in tool error handling that caused `meteor` to crash on Mac
  OSX when no computer name is set.

* Work around a bug that caused MongoDB to fail an assertion when using
  tailable cursors on non-oplog collections.


## v0.7.1.1

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


## v0.7.0.1

* Two fixes to `meteor run` Mongo startup bugs that could lead to hangs with the
  message "Initializing mongo database... this may take a moment.".  #1696

* Apply the Node patch to 0.10.24 as well (see the 0.7.0 section for details).

* Fix gratuitous IE7 incompatibility.  #1690


## v0.7.0

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


## v0.6.6.3

* Fix error when publish function callbacks are called during session
  shutdown.  #1540 #1553

* Improve `meteor run` CPU usage in projects with many
  directories.  #1506


## v0.6.6.2

* Upgrade Node from 0.10.20 to 0.10.21 (security update).


## v0.6.6.1

* Fix file watching on OSX. Work around Node issue #6251 by not using
  fs.watch. #1483


## v0.6.6


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


## v0.6.5.2

* Upgrade Node from 0.8.24 to 0.8.26 (security patch)


## v0.6.5.1

* Fix syntax errors on lines that end with a backslash. #1326

* Fix serving static files with special characters in their name. #1339

* Upgrade `esprima` JavaScript parser to fix bug parsing complex regexps.

* Export `Spiderable` from `spiderable` package to allow users to set
  `Spiderable.userAgentRegExps` to control what user agents are treated
  as spiders.

* Add EJSON to standard-app-packages. #1343

* Fix bug in d3 tab character parsing.

* Fix regression when using Mongo ObjectIDs in Spark templates.


## v0.6.5

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


## v0.6.4.1

* Update mongodb driver to use version 0.2.1 of the bson module.


## v0.6.4

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


## v0.6.3

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


## v0.6.2.1

* When authenticating with GitHub, include a user agent string. This
  unbreaks "Sign in with GitHub"

Patch contributed by GitHub user pmark.


## v0.6.2

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


## v0.6.1

* Correct NPM behavior in packages in case there is a `node_modules` directory
  somewhere above the app directory. #927

* Small bug fix in the low-level `routepolicy` package.

Patches contributed by GitHub users andreas-karlsson and awwx.


## v0.6.0

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


## v0.5.9

* Fix regression in 0.5.8 that prevented users from editing their own
  profile. #809

* Fix regression in 0.5.8 where `Meteor.loggingIn()` would not update
  reactively. #811


## v0.5.8

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


## v0.5.7

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


## v0.5.6

* Fix 0.5.5 regression: Minimongo selectors matching subdocuments under arrays
  did not work correctly.

* Some Bootstrap icons should have appeared white.

Patches contributed by GitHub user benjaminchelli.

## v0.5.5

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


## v0.5.4

* Fix 0.5.3 regression: `meteor run` could fail on OSX 10.8 if environment
  variables such as `DYLD_LIBRARY_PATH` are set.


## v0.5.3

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


## v0.5.2

* Fix 0.5.1 regression: Cursor `observe` works during server startup.  #507

## v0.5.1

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

## v0.5.0

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


## v0.4.2

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


## v0.4.1

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


## v0.4.0

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


## v0.3.9

* Add `spiderable` package to allow web crawlers to index Meteor apps.

* `meteor deploy` uses SSL to protect application deployment.

* Fix `stopImmediatePropagation()`. #205


## v0.3.8

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


## v0.3.7

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


## v0.3.6

* Rewrite event handling. `this` in event handlers now refers to the data
  context of the element that generated the event, *not* the top-level data
  context of the template where the event is declared.

* Add /websocket endpoint for raw websockets. Pass websockets through
  development mode proxy.

* Simplified API for Meteor.connect, which now receives a URL to a Meteor app
  rather than to a sockjs endpoint.

* Fix livedata to support subscriptions with overlapping documents.

* Update node.js to 0.6.17 to fix potential security issue.


## v0.3.5

* Fix 0.3.4 regression: Call event map handlers on bubbled events. #107


## v0.3.4

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


## v0.3.3

* Add `http` package for making HTTP requests to remote servers.

* Add `madewith` package to put a live-updating Made with Meteor badge on apps.

* Reduce size of mongo database on disk (--smallfiles).

* Prevent unnecessary hot-code pushes on deployed apps during server migration.

* Fix issue with spaces in directory names. #39

* Workaround browser caching issues in development mode by using query
  parameters on all JavaScript and CSS requests.

* Many documentation and test fixups.


## v0.3.2

* Initial public launch
