var files = require('../fs/files');
var selftest = require('../tool-testing/selftest.js');
var testUtils = require('../tool-testing/test-utils.js');
var Sandbox = selftest.Sandbox;
import { host } from "../utils/archinfo";
const relBuildDir = "../build";
const isOSX = async () => (await host()).split(".", 2).join(".") === "os.osx";

var checkMobileServer = selftest.markStack(async function (s, expected) {
  function checkIndexHtml(path) {
    const output = s.read(path);
    const mrc = testUtils.getMeteorRuntimeConfigFromHTML(output);
    selftest.expectEqual(mrc.DDP_DEFAULT_CONNECTION_URL, expected);
  }

  checkIndexHtml(files.pathJoin(
    relBuildDir,
    "android/project/app/src/main/assets/www/application/index.html"
  ));

  if (await isOSX()) {
    checkIndexHtml(files.pathJoin(
      relBuildDir,
      "ios/project/www/application/index.html"
    ));
  }
});

function cleanUpBuild(s) {
  return files.rm_recursive(files.pathJoin(s.cwd, relBuildDir));
}

selftest.define("cordova builds with server options", ["cordova"], async function () {
  const s = new Sandbox();
  await s.init();
  let run;

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");

  run = s.run("add-platform", "android");
  run.waitSecs(90);
  await run.match("added");
  await run.expectExit(0);

  if (await isOSX()) {
    run = s.run("add-platform", "ios");
    await run.match("added");
    await run.expectExit(0);
  }

  run = s.run("build", relBuildDir);
  run.waitSecs(90);
  await run.matchErr(
    "Supply the server hostname and port in the --server option");
  await run.expectExit(1);

  run = s.run("build", relBuildDir, "--server", "5000");
  run.waitSecs(90);
  await run.matchErr("--server must include a hostname");
  await run.expectExit(1);

  run = s.run("build", relBuildDir, "--server", "https://example.com:5000");
  run.waitSecs(90);
  await run.expectExit(0);
  await checkMobileServer(s, "https://example.com:5000/");
  await cleanUpBuild(s);

  run = s.run("build", relBuildDir, "--server", "example.com:5000");
  run.waitSecs(90);
  await run.expectExit(0);
  await checkMobileServer(s, "http://example.com:5000/");
  await cleanUpBuild(s);

  run = s.run("build", relBuildDir, "--server", "example.com");
  run.waitSecs(90);
  await run.expectExit(0);
  await checkMobileServer(s, "http://example.com/");
  await cleanUpBuild(s);

  run = s.run("build", relBuildDir, "--server", "https://example.com");
  run.waitSecs(90);
  await run.expectExit(0);
  await checkMobileServer(s, "https://example.com/");
  await cleanUpBuild(s);
});
