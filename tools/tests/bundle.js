var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files.js');
import { execSync } from 'child_process';

selftest.define("bundle", ["slow"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  run = s.run("bundle", "myapp.tgz");
  run.waitSecs(60);
  run.expectExit(0);

  var tarball = files.pathJoin(s.cwd, "myapp.tgz");
  selftest.expectEqual(files.exists(tarball), true);
});

selftest.define("bundle - verify sanitized asset names", ["slow"], function () {
  const s = new Sandbox();
  let run;

  s.createApp("sanitized-app", "sanitized-app");
  s.cd("sanitized-app");
  run = s.run("bundle", "sanitized-app.tgz");
  run.waitSecs(60);
  run.expectExit(0);

  const tarball = files.pathJoin(s.cwd, "sanitized-app.tgz");
  const sanitizedFilename = 'Meteor_:-@2x.png';
  selftest.expectTrue(
    execSync(`tar -tf ${tarball}`).toString().indexOf(sanitizedFilename) > -1
  );
});
