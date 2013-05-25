# Defer in Inactive Tab

Tests that `Meteor.defer` works in an inactive tab in iOS Safari.

(`setTimeout` and `setInterval` events aren't delivered to inactive
tabs in iOS Safari until they become active again).

Sadly we have to run the test manually because scripts aren't allowed
to open windows themselves except in response to user events.

This test will not run on Chrome for iOS because the storage event is
not implemented in that browser.  Also doesn't attempt to run on
versions of IE that don't support `window.addEventListener`.
