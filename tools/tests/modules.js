var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');
import { getUrl } from '../utils/http-helpers.js';

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

function startRun(sandbox) {
  var run = sandbox.run();
  run.match("myapp");
  run.match("proxy");
  run.tellMongo(MONGO_LISTENING);
  run.match("MongoDB");
  return run;
};

selftest.define("modules - unimported lazy files", function() {
  const s = new Sandbox();
  s.createApp("myapp", "app-with-unimported-lazy-file");
  s.cd("myapp", function() {
    const run = s.run("--once");
    run.waitSecs(30);
    run.expectExit(1);
    run.forbid("This file shouldn't be loaded");
  });
});

// Checks that `import X from 'meteor/package'` will import (and re-export) the
// mainModule if one exists, otherwise will simply export Package['package'].
// Overlaps with compiler-plugin.js's "install-packages.js" code.
selftest.define("modules - import chain for packages", () => {
  const s = new Sandbox({ fakeMongo: true });

  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.write(".meteor/packages",
    "meteor-base \n modules \n with-add-files \n with-main-module");
  s.write("main.js", `
    var packageNameA = require('meteor/with-add-files').name;
    var packageNameB = require('meteor/with-main-module').name;

    console.log('with-add-files: ' + packageNameA);
    console.log('with-main-module: ' + packageNameB);
  `);

  const run = startRun(s);

  // On the server, we just check that importing *works*, not *how* it works
  run.match("with-add-files: with-add-files");
  run.match("with-main-module: with-main-module");

  // On the client, we just check that install() is called correctly
  const modules = getUrl("http://localhost:3000/packages/modules.js");
  selftest.expectTrue(modules.includes('\ninstall("with-add-files");'));
  selftest.expectTrue(modules.includes('\n' +
    'install("with-main-module", "meteor/with-main-module/with-main-module.js");'
  ));

  run.stop();
});
