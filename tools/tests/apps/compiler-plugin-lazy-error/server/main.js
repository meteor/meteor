// When the build succeeds, exit cleanly so `meteor run --once` terminates and
// the self-test can assert a zero exit code. Meteor is a global provided by
// the `meteor` package (no ecmascript/babel needed in this app).
Meteor.startup(function () {
  console.log('BORK_APP_STARTED');
  process.exit(0);
});
