
## vNEXT


## v0.3.6

* Rewrite event handling. `this` in event handlers now refers to the data context of the element that generated the event, *not* the top-level data context of the template where the event is declared.

* Add /websocket endpoint for raw websockets. Pass websockets through development mode proxy.

* Simplified API for Meteor.connect, which now receives a URL to a Meteor app rather than to a sockjs endpoint.

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

* Add `bare` option to coffee-script compilation so variables can be shared between multiple coffee-script file. #85

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

* Workaround browser caching issues in development mode by using query parameters on all JavaScript and CSS requests.

* Many documentation and test fixups.


## v0.3.2

* Initial public launch

