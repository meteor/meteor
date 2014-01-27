var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("springboard", function () {
  var s = new Sandbox({
    warehouse: {
      v1: { tools: 'tools1', notices: ["kitten"] },
      v2: { tools: 'tools2', notices: ["puppies"], upgraders: ["cats"],
            latest: true }}
  });

  // If run not in an app dir, runs the latest version ...
  run = s.run("--version");
  run.read('Release v2\n');
  run.expectEnd();
  run.expectExit(0);

  // ... unless you asked for a different one.
  run = s.run("--version", "--release", "v1");
  run.read('Release v1\n');
  run.expectEnd();
  run.expectExit(0);
});
