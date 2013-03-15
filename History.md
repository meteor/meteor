
## vNEXT

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

* User documents have id's when onCreateUser and validateNewUser hooks run.

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
