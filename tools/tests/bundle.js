var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

import * as files from "../fs/files";
import { execSync } from 'child_process';
// Default maxBuffer for execSync is 1024 * 1024 bytes, so this is 10x that.
const maxBuffer = 10 * 1024 * 1024;

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
    execSync(`tar -tf ${tarball}`, {
      maxBuffer,
    }).toString().indexOf(sanitizedFilename) > -1
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
    "tar -tf " + files.pathJoin(s.home, "build", "app.tar.gz"),
    { maxBuffer },
  ).toString("utf8").split("\n").includes(
    "bundle/programs/server/npm/node_modules/external-package/package.json"
  ));
});

selftest.define("build - link npm package named 'config' (#10892)", function () {
  const s = new Sandbox();

  s.mkdir("config-package");
  s.cd("config-package");

  s.write(
      "package.json",
      JSON.stringify({
        name: "config",
        version: "1.0.0",
        private: true,
        main: "index.js"
      }, null, 2) + "\n"
  );

  s.write(
      "index.js",
      "exports.id = module.id;\n"
  );

  s.cd(s.home);

  s.createApp("app", "link-config-npm-package");
  s.cd("app");

  const run = s.run();
  run.waitSecs(30);
  run.match("config-package/index.js");
  run.stop();

  const build = s.run("build", "../build");
  build.waitSecs(60);
  build.expectExit(0);

  const command = "cd " + files.pathJoin(s.home, "build") + " && tar -xzf app.tar.gz bundle/programs/server/packages/modules.js && grep -c \"meteorInstall({\\\"node_modules\\\":{\\\"config\\\":\" bundle/programs/server/packages/modules.js";
  const commandResult = execSync(command,{ maxBuffer }).toString("utf8");

  selftest.expectTrue(commandResult === "1\n");
});

selftest.define("bundle - isobuild crashes with ERR_INVALID_ARG_TYPE when encountering broken symlinks (#11241)", function () {
  const s = new Sandbox({ fakeMongo: true });

  s.createApp("myapp", "standard-app");
  s.cd("myapp");

  //Add bad symlink
  s.mkdir("node_modules/.bin");
  const symlink = files.pathJoin(s.cwd, "node_modules/.bin/bad");
  try {
    files.unlink(symlink);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  files.symlink("nonexistent", symlink);

  const run = s.run();
  run.match("myapp");
  run.match("proxy");

  //make sure we get the useful error, not the cryptic one
  run.matchErr("Broken symbolic link encountered at");
});
