import selftest from '../tool-testing/selftest.js';
import files from '../fs/files';
import {
  canReuseNpmShrinkwrap,
  declaredSpecMatchesInstalledVersion,
  installNpmModule,
  npmDependencyCacheIsCurrent,
} from '../isobuild/meteor-npm.js';
import * as meteorNpm from '../isobuild/meteor-npm.js';

const Sandbox = selftest.Sandbox;

const MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

selftest.define("npm - git dependency cache decisions", () => {
  const declaredTree = {
    dependencies: {
      "uWebSockets.js": {
        version: "git+https://github.com/uNetworking/uWebSockets.js.git#v20.66.0",
      },
    },
  };
  const resolvedTree = {
    dependencies: {
      "uWebSockets.js": { version: "20.66.0" },
    },
  };

  selftest.expectTrue(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#v20.66.0",
    "20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#v20.66.0",
    "20.66.1",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#main",
    "20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "https://github.com/uNetworking/uWebSockets.js/archive/v20.66.0.tar.gz",
    "20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#main#v20.66.0",
    "20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://github.com/uNetworking/uWebSockets.js.git#vv20.66.0",
    "v20.66.0",
  ));
  selftest.expectFalse(declaredSpecMatchesInstalledVersion(
    "git+https://#v20.66.0",
    "20.66.0",
  ));

  selftest.expectTrue(npmDependencyCacheIsCurrent(
    declaredTree,
    resolvedTree,
    resolvedTree,
  ));
  selftest.expectTrue(canReuseNpmShrinkwrap(
    declaredTree,
    resolvedTree,
  ));
  const malformedDeclaredTree = {
    dependencies: {
      "uWebSockets.js": {
        version: "git+https://github.com/uNetworking/uWebSockets.js.git#main#v20.66.0",
      },
    },
  };
  selftest.expectFalse(npmDependencyCacheIsCurrent(
    malformedDeclaredTree,
    resolvedTree,
    resolvedTree,
  ));
  selftest.expectFalse(canReuseNpmShrinkwrap(
    malformedDeclaredTree,
    resolvedTree,
  ));
});

selftest.define("npm - git dependency cache uses installed version", async () => {
  const packageNpmDir = files.mkdtemp();
  const nodeModulesDir = files.pathJoin(packageNpmDir, "node_modules");
  const declaredVersion =
    "git+https://github.com/uNetworking/uWebSockets.js.git#v20.66.0";

  files.mkdir(nodeModulesDir);
  files.writeFile(
    files.pathJoin(nodeModulesDir, ".node_version"),
    `${process.version.replace(/\.(\d+)$/, ".*")}\n`,
  );
  files.writeFile(
    files.pathJoin(nodeModulesDir, ".package-lock.json"),
    JSON.stringify({
      packages: {
        "node_modules/uWebSockets.js": {
          version: "20.66.0",
          resolved:
            "git+ssh://git@github.com/uNetworking/uWebSockets.js.git#0123456789abcdef",
        },
      },
    }),
  );
  files.writeFile(
    files.pathJoin(packageNpmDir, "npm-shrinkwrap.json"),
    JSON.stringify({
      lockfileVersion: 4,
      dependencies: {
        "uWebSockets.js": { version: "20.66.0" },
      },
    }),
  );

  const childProcess = require("child_process");
  const originalExecFile = childProcess.execFile;
  childProcess.execFile = (...args) => {
    args[args.length - 1](new Error("npm install should not run"), "", "");
  };

  try {
    selftest.expectTrue(await meteorNpm.updateDependencies(
      "test-package",
      packageNpmDir,
      { "uWebSockets.js": declaredVersion },
      true,
    ));
  } finally {
    childProcess.execFile = originalExecFile;
    files.rm_recursive(packageNpmDir);
  }
});

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
