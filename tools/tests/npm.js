import selftest from '../tool-testing/selftest.js';
import files from '../fs/files';
import { installNpmModule } from '../isobuild/meteor-npm.js';

const Sandbox = selftest.Sandbox;

const MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

selftest.define("npm", ["net"], async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  let run;

  await s.createApp("npmtestapp", "npmtest", { dontPrepareApp: true });
  s.cd("npmtestapp");

  // Ensure that we don't lose the executable bits of npm modules.
  // Regression test for https://github.com/meteor/meteor/pull/1808
  // Before this fix, the module would work on the first execution but not on a
  // subsequent one.
  for (const i of [1,2]) {
    run = s.run("--once", "--raw-logs");
    await run.tellMongo(MONGO_LISTENING);
    if (i === 1) {
      run.waitSecs(30);
      // use match instead of read because on a built release we can
      // also get an update message here.
      await run.match(
          "npm-test: updating npm dependencies -- meteor-test-executable...\n");
    }
    run.waitSecs(15);
    await run.match("null; From shell script\n");
    await run.expectExit(0);
  }
});

async function testThatNpmInstallThrows(name, version, regexMatcher) {
  const tmpDir = files.convertToOSPath(files.mkdtemp());
  let didThrow = false;
  try {
    await installNpmModule(name, version, tmpDir);
  } catch (err) {
    didThrow = true;
    selftest.expectTrue(regexMatcher.test(err.message));
  }
  selftest.expectTrue(didThrow);
}

selftest.define("npm - install - messages - error installing package", ["net"], () => {
  // the 'error-prone' npm intentionally errors in the preinstall script.
  return testThatNpmInstallThrows("error-prone", "1.0.0",
    /couldn't install npm package error-prone@1.0.0/);
});

selftest.define("npm - install - messages - npm doesn't exist", ["net"], () => {
  // this test is obviously prone to sabotage.
  return testThatNpmInstallThrows("non-existant-package-gggg", "100.0.0",
    /no npm package named 'non-existant-package-gggg' in the npm registry/);
});

selftest.define("npm - install - messages - npm version doesn't exist", ["net"], () => {
  // the 'cost-of-modules' npm really exists but hopefully never this minor ver.
  return testThatNpmInstallThrows("cost-of-modules", "0.999.2",
    /cost-of-modules version 0.999.2 is not available in the npm registry/);
});
