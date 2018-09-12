var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files.js');
import { execSync } from 'child_process';

selftest.define("bundle", function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  run = s.run("bundle", "../myapp.tgz");
  run.waitSecs(60);
  run.expectExit(0);

  var tarball = files.pathJoin(s.cwd, "../myapp.tgz");
  selftest.expectEqual(files.exists(tarball), true);
});

selftest.define("bundle - verify sanitized asset names", function () {
  const s = new Sandbox();
  let run;

  s.createApp("sanitized-app", "sanitized-app");
  s.cd("sanitized-app");
  run = s.run("bundle", "../sanitized-app.tgz");
  run.waitSecs(60);
  run.expectExit(0);

  const tarball = files.pathJoin(s.cwd, "../sanitized-app.tgz");
  const sanitizedFilename = 'Meteor_-@2x.png';
  selftest.expectTrue(
    execSync(`tar -tf ${tarball}`).toString().indexOf(sanitizedFilename) > -1
  );
});

selftest.define("build - linked external npm package (#10177)", function () {
  const s = new Sandbox();

  s.mkdir("external-package");
  s.cd("external-package");

  s.write(
    "package.json",
    JSON.stringify({
      name: "external-package",
      version: "1.2.3",
      "private": true,
      main: "index.js"
    }, null, 2) + "\n"
  );

  s.write(
    "index.js",
    "exports.id = module.id;\n"
  );

  s.cd(s.home);

  s.createApp("app", "linked-external-npm-package");
  s.cd("app");

  const run = s.run();
  run.waitSecs(30);
  run.match("external-package/index.js");
  run.stop();

  const build = s.run("build", "../build");
  build.waitSecs(60);
  build.expectExit(0);

  selftest.expectTrue(execSync(
    "tar -tf " + files.pathJoin(s.home, "build", "app.tar.gz")
  ).toString("utf8").split("\n").includes(
    "bundle/programs/server/npm/node_modules/external-package/package.json"
  ));
});
