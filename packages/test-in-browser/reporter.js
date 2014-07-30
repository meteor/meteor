// provide some notification we're started. This is to allow use
// in automated scripts with `meteor run --once` which does not
// print when the proxy is listening.
Meteor.startup(function () {
  Meteor._debug("test-in-browser listening");
});
