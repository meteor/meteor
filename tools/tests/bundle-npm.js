var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

import * as files from "../fs/files";
import { execSync } from 'child_process';
// Default maxBuffer for execSync is 1024 * 1024 bytes, so this is 10x that.
const maxBuffer = 10 * 1024 * 1024;

selftest.define("build - linked external npm package (#10177)", async function () {
  const s = new Sandbox();
  await s.init();

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

  await s.createApp("app", "linked-external-npm-package");
  s.cd("app");

  const run = s.run();
  run.waitSecs(30);
  await run.match("external-package/index.js");
  await run.stop();

  const build = s.run("build", "../build");
  build.waitSecs(60);
  await build.expectExit(0);

  selftest.expectTrue(execSync(
    "tar -tf " + files.pathJoin(s.home, "build", "app.tar.gz"),
    { maxBuffer },
  ).toString("utf8").split("\n").includes(
    "bundle/programs/server/npm/node_modules/external-package/package.json"
  ));
});

selftest.define("build - link npm package named 'config' (#10892)", async function () {
  const s = new Sandbox();
  await s.init();

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

  await s.createApp("app", "link-config-npm-package");
  s.cd("app");

  const run = s.run();
  run.waitSecs(30);
  await run.match("config-package/index.js");
  await run.stop();

  const build = s.run("build", "../build");
  build.waitSecs(60);
  await build.expectExit(0);

  const command = "cd " + files.pathJoin(s.home, "build") + " && tar -xzf app.tar.gz bundle/programs/server/packages/modules.js && grep -c \"meteorInstall({\\\"node_modules\\\":{\\\"config\\\":\" bundle/programs/server/packages/modules.js";
  const commandResult = execSync(command,{ maxBuffer }).toString("utf8");

  selftest.expectTrue(commandResult === "1\n");
});
