
## vNEXT


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

