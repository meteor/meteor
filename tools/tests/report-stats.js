var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("report-stats", function () {
  var s = new Sandbox;

  var run = s.run("create", "foo");
  run.expectExit(0);
  s.cd("foo");

  // verify that identifier file exists for new apps
  var identifier = s.read(".meteor/identifier");
  selftest.expectEqual(!! identifier, true);
  selftest.expectEqual(identifier.length > 0, true);

  // verify that identifier file when running 'meteor bundle' on old
  // apps
  s.unlink(".meteor/identifier");
  run = s.run("bundle", "foo.tar.gz");
  run.waitSecs(30);
  run.expectExit(0);
  identifier = s.read(".meteor/identifier");
  selftest.expectEqual(!! identifier, true);
  selftest.expectEqual(identifier.length > 0, true);

  // TODO:
  // - test that we actually send stats
  // - opt out
  // - test both the logged in state and the logged out state
});
